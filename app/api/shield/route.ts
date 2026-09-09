import regulationsData from "@/data/regulations.json";
import { getProvider } from "@/lib/llm";
import { detectSemantic } from "@/lib/llm/semantic";
import { checkElements, matchPatterns, riskLevel } from "@/lib/rules/match";
import { checkEntity } from "@/lib/rules/entity";
import { buildRiskRadar } from "@/lib/rules/radar";
import { matchPlaybook } from "@/lib/rules/playbook";
import { buildFollowups } from "@/lib/rules/followup";
import { guardOutput } from "@/lib/rules/guard";
import { redact } from "@/lib/rules/redact";
import { buildSummaryPrompt, buildVerdict } from "@/lib/report/summary-template";
import { findKeyPoints, findTerms } from "@/lib/rules/glossary";
import { DISCLAIMER, type CheckMode, type Regulation, type ShieldEvent, type ShieldReport } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REGULATIONS = regulationsData.items as Regulation[];
const REG_MAP = new Map(REGULATIONS.map((r) => [r.id, r]));

/** 阶段间的节奏停顿：让用户看清每一步在做什么，而不是一瞬间全部刷出 */
const BEAT = { stage: 90, item: 70, maxItems: 10 };

/** 语义通道超时。超时即降级为仅规则通道，不影响出结论 */
const SEMANTIC_TIMEOUT_MS = 7000;

/**
 * 模型转述的硬超时。超过即放弃模型输出、改用模板总结。
 * 现场演示不能因为一次 API 抖动就卡住——实测同一请求延迟在 2s 到 13s 之间波动。
 */
const SUMMARY_TIMEOUT_MS = 8000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Body {
  kind?: "image" | "text";
  text?: string;
  imageDataUrl?: string;
  /** translate=只翻译；risk=翻译 + 风险体检（默认） */
  mode?: CheckMode;
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
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: "请求体解析失败" }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const provider = getProvider();
  const mode: CheckMode = body.mode === "translate" ? "translate" : "risk";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ShieldEvent) => {
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
              if (!g.shouldFallback && g.text.length >= 20) plainText = g.text;
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
            generatedAt: new Date().toISOString(),
          };
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
        const { level, hardTypes, highTypes, escalated } = riskLevel(hits, elements, text);
        const templateVerdict = buildVerdict({ level, hits, elements, entity, hardTypes, highTypes, escalated, text });
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
        const useModel = !provider.isMock && level !== "green";

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
            if (!guarded.shouldFallback) {
              summary = guarded.text;
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
          disclaimer: DISCLAIMER,
          demoMode: provider.isMock || !usedModel,
          generatedAt: new Date().toISOString(),
        };
        send({ stage: "report", status: "done", report });
      } catch (err) {
        send({ stage: "error", message: err instanceof Error ? err.message : "分析过程出错" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
