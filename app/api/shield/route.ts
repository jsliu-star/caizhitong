import regulationsData from "@/data/regulations.json";
import { getProvider } from "@/lib/llm";
import { mockProvider } from "@/lib/llm/providers/mock";
import snapshotData from "@/data/demo-snapshots.json";
import { LIMITS, checkRate, jsonError, readJsonBody, takeModelQuota } from "@/lib/server/limits";
import { LRU } from "@/lib/server/cache";
import { shieldKey } from "@/lib/server/shield-key";
import { detectSemantic } from "@/lib/llm/semantic";
import { checkElements, matchPatterns, riskLevel } from "@/lib/rules/match";
import { checkEntity } from "@/lib/rules/entity";
import { detectGenre } from "@/lib/rules/genre";
import { buildRiskRadar } from "@/lib/rules/radar";
import { matchPlaybook } from "@/lib/rules/playbook";
import { buildFollowups } from "@/lib/rules/followup";
import { dropRedacted, guardOutput } from "@/lib/rules/guard";
import { redact } from "@/lib/rules/redact";
import { buildReportVerdict, buildSummaryPrompt, buildVerdict } from "@/lib/report/summary-template";
import { findKeyPoints, findTerms } from "@/lib/rules/glossary";
import { DISCLAIMER, type CheckMode, type Regulation, type ShieldEvent, type ShieldReport } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REGULATIONS = regulationsData.items as Regulation[];
const REG_MAP = new Map(REGULATIONS.map((r) => [r.id, r]));


interface CachedRun {
  events: ShieldEvent[];
  generatedAt: string;
}
const MEM = new LRU<CachedRun>(300);
const SNAP = snapshotData as { generatedAt: string | null; rulesTag: string | null; entries: Record<string, ShieldEvent[]> };


/** 重放缓存的事件序列：保留逐步出现的观感，但不重新调用模型 */
function replay(run: CachedRun, cache: NonNullable<ShieldReport["cache"]>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const e of run.events) {
        const out = e.stage === "report" ? { ...e, report: { ...e.report, cache } } : e;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(out)}\n\n`));
        if (process.env.SHIELD_NO_BEAT !== "1") await sleep(e.stage === "verdict" && e.status === "delta" ? 6 : 45);
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/** 阶段间的节奏停顿：让用户看清每一步在做什么，而不是一瞬间全部刷出 */
const BEAT = { stage: 90, item: 70, maxItems: 10 };

/** 语义通道超时。超时即降级为仅规则通道，不影响出结论 */
const SEMANTIC_TIMEOUT_MS = 7000;

/**
 * 模型转述的硬超时。超过即放弃模型输出、改用模板总结。
 * 现场演示不能因为一次 API 抖动就卡住——实测同一请求延迟在 2s 到 13s 之间波动。
 */
const SUMMARY_TIMEOUT_MS = 8000;

/** 评测时设 SHIELD_NO_BEAT=1 跳过节奏停顿，测的是真实计算耗时（停顿时长另行统计） */
const sleep = (ms: number) =>
  process.env.SHIELD_NO_BEAT === "1" ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

interface Body {
  kind?: "image" | "text";
  text?: string;
  imageDataUrl?: string;
  /** translate=只翻译；risk=翻译 + 风险体检（默认） */
  mode?: CheckMode;
  /** 首页演示案例的图片路径，用于命中预生成快照 */
  sampleId?: string;
}

/** 只翻译模式的提示词：说清这段话在讲什么，不做任何评价 */
const TRANSLATE_PROMPT = (text: string, terms: string[]) => `你在帮一位完全没有金融知识的普通人读懂一段金融文字。

【原文】
${text.slice(0, 1800)}
${terms.length ? `\n【原文里出现的术语，词典已另行解释，你不必重复】\n${terms.join("、")}\n` : ""}
【要求】
用 3 到 4 句大白话说清「这段话到底在讲什么」。
1. 只转述原文，不评价这个产品好不好、值不值得买
2. 不推荐或暗示购买，不预测涨跌，不说任何东西"安全""可靠"
3. 不要引入原文之外的数字、利率、统计或机构名
4. 直接输出正文，不要标题、不要列表、不要 markdown`;

export async function POST(req: Request) {
  // ── 入口检查：限流 → 大小 → 格式 ─────────────────────
  const rate = checkRate(req, "shield");
  if (!rate.ok) return jsonError(rate.status, rate.message, { code: rate.code, retryAfter: rate.retryAfter });
  const parsed = await readJsonBody<Body>(req);
  if (!parsed.ok) return jsonError(parsed.status, parsed.message);
  const body = parsed.body;
  if ((body.text ?? "").length > LIMITS.textChars) {
    return jsonError(413, `文字太长了，请控制在 ${LIMITS.textChars} 字以内，或分几段查。`);
  }
  if (body.kind === "image" && !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(body.imageDataUrl ?? "")) {
    return jsonError(400, "只支持 PNG、JPG、WebP 格式的图片。");
  }
  if (body.sampleId && !/^\/demo\/[\w-]+\.(png|jpe?g)$/.test(body.sampleId)) delete body.sampleId;

  const mode: CheckMode = body.mode === "translate" ? "translate" : "risk";

  // ── 缓存：同一段内容给出同一结论 ─────────────────────
  // sampleId 只用来查仓库里的快照（我们自己生成并提交的，外部无法改写）；
  // 内存缓存一律按内容存取——否则有人带上「正规样本」的 id 传一张诈骗图，就能污染之后所有人看到的结果
  const snapKey = body.sampleId ? shieldKey(body, mode) : null;
  const key = shieldKey({ ...body, sampleId: undefined }, mode);
  for (const k of [snapKey, key]) {
    if (k && SNAP.entries[k] && SNAP.generatedAt) {
      return replay({ events: SNAP.entries[k], generatedAt: SNAP.generatedAt }, { source: "snapshot", generatedAt: SNAP.generatedAt });
    }
  }
  const hit = MEM.get(key);
  if (hit) return replay(hit, { source: "memory", generatedAt: hit.generatedAt });

  // ── 模型额度：用完则只用规则（判定不受影响），并明说 ─────
  const realProvider = getProvider();
  const quotaOk = realProvider.isMock ? true : takeModelQuota();
  const provider = quotaOk ? realProvider : mockProvider;
  const notice = quotaOk ? undefined : "今天的模型额度已用完，本次只用规则判定。风险等级与命中项不受影响，大白话总结改用模板。";

  const encoder = new TextEncoder();
  const events: ShieldEvent[] = [];
  let cacheable = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ShieldEvent) => {
        events.push(e);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      };

      try {
        // ── ① 视觉识别 Agent ───────────────────────────────
        send({ stage: "vision", status: "start" });
        let rawText = "";
        let visionNote: string | undefined;

        if (body.kind === "image") {
          if (!body.imageDataUrl) throw new Error("未收到图片数据");
          const r = await provider.extractFromImage(body.imageDataUrl);
          rawText = r.text;
          visionNote = r.note;
        } else {
          rawText = (body.text ?? "").trim();
        }
        if (!rawText) throw new Error("未能获得可分析的文本内容");

        const { text, count: redactedCount } = redact(rawText);
        send({
          stage: "vision",
          status: "done",
          text,
          redactedCount,
          demoMode: provider.isMock,
          ...(visionNote ? { note: visionNote } : {}),
        } as ShieldEvent);

        // 术语与关键点：确定性，两种模式都产出
        const terms = findTerms(text);
        const keyPoints = findKeyPoints(text);

        // ── 只翻译模式：跳过风险链路，直接出人话版 ──────────
        if (mode === "translate") {
          send({ stage: "verdict", status: "start" });
          let plainText = "";
          if (!provider.isMock) {
            try {
              const raw = await Promise.race([
                provider.summarize(TRANSLATE_PROMPT(text, terms.map((t) => t.term)), (d) =>
                  send({ stage: "verdict", status: "delta", delta: d }),
                ),
                new Promise<string>((r) => setTimeout(() => r(""), SUMMARY_TIMEOUT_MS)),
              ]);
              const g = guardOutput(raw.trim(), { sourceText: text });
              const shown = dropRedacted(g.text).text;
              if (!g.shouldFallback && shown.length >= 20) plainText = shown;
            } catch {
              /* 降级为空，前端展示术语与关键点 */
            }
          }
          const report: ShieldReport = {
            mode,
            plainText,
            terms,
            keyPoints,
            inputKind: body.kind === "image" ? "image" : "text",
            text,
            redactedCount,
            hits: [],
            excludedHits: [],
            radar: [],
            playbook: [],
            followups: [],
            semanticDropped: [],
            elements: [],
            entity: { names: [], licenseNumbers: [], contacts: [], clues: [], links: [] },
            regulations: [],
            verdict: { level: "green", headline: "", summary: "", actions: [] },
            disclaimer: DISCLAIMER,
            demoMode: provider.isMock || !plainText,
            ...(notice ? { notice } : {}),
            generatedAt: new Date().toISOString(),
          };
          cacheable = !provider.isMock && Boolean(plainText);
          send({ stage: "verdict", status: "done", verdict: report.verdict });
          send({ stage: "report", status: "done", report });
          return;
        }

        // ── ② 规则比对（瞬时）+ ③ 语义通道（并行起跑）──────
        const { hits: ruleHits, excludedHits } = matchPatterns(text);
        const semanticPromise = detectSemantic(text, provider, {
          timeoutMs: SEMANTIC_TIMEOUT_MS,
          ruleHits,
        });

        await sleep(BEAT.stage);
        send({ stage: "match", status: "start" });
        for (const [i, hit] of ruleHits.entries()) {
          send({ stage: "match", status: "progress", hit });
          if (i < BEAT.maxItems) await sleep(BEAT.item);
        }
        for (const ex of excludedHits) send({ stage: "match", status: "progress", excluded: ex });
        send({ stage: "match", status: "done", total: ruleHits.length });
        await sleep(BEAT.stage);

        // ── ③ 语义识别 Agent ──────────────────────────────
        send({ stage: "semantic", status: "start" });
        const semantic = await semanticPromise;
        for (const [i, hit] of semantic.hits.entries()) {
          send({ stage: "semantic", status: "progress", hit });
          if (i < BEAT.maxItems) await sleep(BEAT.item);
        }
        for (const d of semantic.dropped) send({ stage: "semantic", status: "progress", dropped: d });
        send({
          stage: "semantic",
          status: semantic.note ? "skipped" : "done",
          total: semantic.hits.length,
          ...(semantic.note ? { note: semantic.note } : {}),
        } as ShieldEvent);
        await sleep(BEAT.stage);

        const hits = [...ruleHits, ...semantic.hits].sort((a, b) =>
          a.severity === b.severity ? a.index - b.index : a.severity === "hard" ? -1 : 1,
        );

        // ── ④/⑤ 的判定均为本地确定性计算，瞬时完成 ──────────
        const elements = checkElements(text);
        const entity = checkEntity(text);
        const regIds = [...new Set(hits.flatMap((h) => h.regulationIds))];
        const regulations = regIds.map((id) => REG_MAP.get(id)).filter((r): r is Regulation => Boolean(r));
        const ruleLevel = riskLevel(hits, elements, text);
        const { hardTypes, highTypes, escalated } = ruleLevel;

        // 文体：讲骗局（报道 / 警示 / 科普）时命中项照常列出，但结论不给「高风险」，也不让模型开口
        const genre = detectGenre(text, hits);
        const isReport = genre.kind === "report" && ruleLevel.level !== "green";
        const level = isReport ? "yellow" : ruleLevel.level;
        const templateVerdict = isReport
          ? buildReportVerdict(hits, [...genre.cues.narrative, ...genre.cues.tactic, ...genre.cues.warning])
          : buildVerdict({ level, hits, elements, entity, hardTypes, highTypes, escalated, text });
        const radar = buildRiskRadar(hits, elements, entity);
        const playbook = matchPlaybook(hits).map((m) => ({
          caseId: m.case.id,
          name: m.case.name,
          hook: m.case.hook,
          oneLine: m.case.oneLine,
          mechanism: m.case.mechanism,
          playbook: m.case.playbook,
          targets: m.case.targets,
          score: m.score,
          shared: m.shared,
        }));
        const followups = buildFollowups(text, hits, elements, entity);

        /**
         * ⑥ 的模型调用在这里提前起跑，与 ④ ⑤ 的事件推送真正并行。
         * 输出先缓冲，等推进到阶段 ⑥ 再放出——省掉约 1 秒等待，
         * 同时保持界面上的阶段顺序不变。
         */
        let buffered: string[] = [];
        let flushing = false;
        let abandoned = false;
        const pushDelta = (delta: string) => {
          if (abandoned) return;
          if (flushing) send({ stage: "verdict", status: "delta", delta });
          else buffered.push(delta);
        };

        /**
         * 「暂未发现明显问题」这一档一律使用模板措辞，不启用模型转述。
         * 理由：green 恰恰是最容易被用户误读为「这个产品是安全的」的情形，
         * 措辞必须逐字可控。实测模型在这一档会自行写出
         * 「没有违反监管规定」「符合正规理财产品的基本要求」这类我们无权做的合规定性。
         */
        const useModel = !provider.isMock && level !== "green" && !isReport;

        let summaryPromise: Promise<string> | null = null;
        const kickedOffAt = Date.now();
        if (useModel) {
          summaryPromise = provider
            .summarize(buildSummaryPrompt({ text, level, hits, elements, entity }), pushDelta)
            .catch(() => "");
        }

        send({ stage: "elements", status: "done", elements });
        await sleep(BEAT.stage);

        // ── ④ 主体核查 Agent ──────────────────────────────
        send({ stage: "entity", status: "start" });
        await sleep(BEAT.stage);
        send({ stage: "entity", status: "done", entity });
        await sleep(BEAT.stage);

        // ── ⑤ 法规引证 Agent ──────────────────────────────
        send({ stage: "citation", status: "start" });
        for (const [i, reg] of regulations.entries()) {
          send({ stage: "citation", status: "progress", regulation: reg });
          if (i < BEAT.maxItems) await sleep(BEAT.item);
        }
        send({ stage: "citation", status: "done" });
        await sleep(BEAT.stage);

        // ── ⑥ 汇总裁决 Agent ──────────────────────────────
        send({ stage: "verdict", status: "start" });
        let summary = templateVerdict.summary;
        let usedModel = false;

        if (summaryPromise) {
          flushing = true;
          for (const d of buffered) send({ stage: "verdict", status: "delta", delta: d });
          buffered = [];

          const budget = Math.max(1500, SUMMARY_TIMEOUT_MS - (Date.now() - kickedOffAt));
          const raw = (
            await Promise.race([
              summaryPromise,
              new Promise<string>((r) => setTimeout(() => r(""), budget)),
            ])
          ).trim();

          if (!raw) {
            abandoned = true; // 超时：丢弃迟到的片段，用模板收尾
          } else if (raw.length >= 30) {
            const guarded = guardOutput(raw, { sourceText: `${text}\n${templateVerdict.summary}` });
            // 改写过的整句去掉，而不是给用户看「（此处原有…已移除）」；剩得太少就回退模板
            const shown = dropRedacted(guarded.text).text;
            if (!guarded.shouldFallback && shown.length >= 30) {
              summary = shown;
              usedModel = true;
            }
          }
        }

        const verdict = { ...templateVerdict, summary };
        send({ stage: "verdict", status: "done", verdict });

        const report: ShieldReport = {
          mode,
          terms,
          keyPoints,
          inputKind: body.kind === "image" ? "image" : "text",
          text,
          redactedCount,
          hits,
          excludedHits,
          radar,
          playbook,
          followups,
          semanticDropped: semantic.dropped,
          ...(semantic.note ? { semanticNote: semantic.note } : {}),
          elements,
          entity,
          regulations,
          verdict,
          genre,
          disclaimer: DISCLAIMER,
          demoMode: provider.isMock || !usedModel,
          ...(notice ? { notice } : {}),
          generatedAt: new Date().toISOString(),
        };
        send({ stage: "report", status: "done", report });
        // 只缓存完整、未降级的结果：语义通道超时或模型转述没被采纳的，不固定下来
        cacheable = !provider.isMock && !semantic.note && (!useModel || usedModel);
      } catch (err) {
        cacheable = false;
        send({ stage: "error", message: err instanceof Error ? err.message : "分析过程出错" });
      } finally {
        if (cacheable) MEM.set(key, { events: [...events], generatedAt: new Date().toISOString() });
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
