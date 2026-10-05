/**
 * 规划师问答接口。
 *
 * 流程与安全盾同构，四步，每步都在界面上看得见：
 *   ① 意图闸门（规则）  越界问题直接模板拒答，**不调用模型**
 *   ② 档案事实（规则）  数字全部算出来，每条带依据
 *   ③ 模型讲解          素材只有上一步给的事实与要点
 *   ④ 输出审查（规则）  guardOutput 拦越界表述与编造数字，命中即整段丢弃、回退模板
 *
 * 刻意**不做逐字流式输出**：模型原文必须先过审查层才能见用户，
 * 逐字流会让越界内容先显示出来再被撤回，那等于没有审查层。
 * 所以这里流的是「阶段进度」，最终答案一次性给出。
 */
import { getProvider } from "@/lib/llm";
import { mockProvider } from "@/lib/llm/providers/mock";
import { checkRate, jsonError, readJsonBody, takeModelQuota } from "@/lib/server/limits";
import { LRU, cacheKey } from "@/lib/server/cache";
import { dropRedacted, guardOutput } from "@/lib/rules/guard";
import { redact } from "@/lib/rules/redact";
import { EMPTY_PROFILE, type Profile } from "@/lib/profile";
import {
  buildPrompt,
  gateQuestion,
  matchTopics,
  profileFacts,
  stagePoints,
  templateAnswer,
  type Fact,
} from "@/lib/plan/advisor";
import { stageOf, stageGuardMatches } from "@/lib/stage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ChatEvent =
  | { stage: "gate"; status: "done"; blocked: false }
  | {
      stage: "gate";
      status: "done";
      blocked: true;
      category: string;
      matched?: string;
      reply: { title: string; body: string; instead: string };
    }
  | { stage: "facts"; status: "done"; facts: Fact[]; topics: string[] }
  | { stage: "compose"; status: "start" | "done" }
  | { stage: "guard"; status: "done"; violations: string[]; inventedNumbers: string[]; fellBack: boolean }
  | { stage: "answer"; status: "done"; text: string; demoMode: boolean }
  | { stage: "error"; status: "done"; message: string };

/** 客户端传来的档案不可信：类型不对的字段一律丢掉，不让一份坏档案把接口打挂 */
function sanitizeProfile(raw: unknown): Profile {
  if (!raw || typeof raw !== "object") return EMPTY_PROFILE;
  const p = raw as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const s = (v: unknown) => (typeof v === "string" ? v : undefined);
  const k = (p.knowledge ?? {}) as Record<string, unknown>;
  return {
    ...EMPTY_PROFILE,
    ageBand: s(p.ageBand) as Profile["ageBand"],
    lifeStage: s(p.lifeStage) as Profile["lifeStage"],
    riskType: s(p.riskType) as Profile["riskType"],
    riskScore: n(p.riskScore),
    conflicts: arr(p.conflicts).filter((x): x is string => typeof x === "string").slice(0, 5),
    knowledge: {
      level: (s(k.level) as Profile["knowledge"]["level"]) ?? "none",
      points: n(k.points) ?? 0,
      cleared: arr(k.cleared).filter((x): x is string => typeof x === "string"),
      weakTerms: arr(k.weakTerms).filter((x): x is string => typeof x === "string").slice(0, 10),
    },
    encountered: arr(p.encountered).filter((x): x is string => typeof x === "string"),
    debtApr: n(p.debtApr),
    emergencyMonths: n(p.emergencyMonths),
    goals: arr(p.goals)
      .filter((g): g is Profile["goals"][number] => Boolean(g) && typeof g === "object" && typeof (g as { name?: unknown }).name === "string")
      .slice(0, 5),
  };
}

const MEM = new LRU<ChatEvent[]>(500);

export async function POST(req: Request) {
  const rate = checkRate(req, "chat");
  if (!rate.ok) return jsonError(rate.status, rate.message, { code: rate.code, retryAfter: rate.retryAfter });
  const parsed = await readJsonBody<{ question?: unknown; profile?: unknown }>(req);
  if (!parsed.ok) return jsonError(parsed.status, parsed.message);
  let question = String(parsed.body.question ?? "").trim();
  const profile = sanitizeProfile(parsed.body.profile);
  if (question.length < 2) return jsonError(400, "问题太短");
  if (question.length > 500) question = question.slice(0, 500);

  // 同一个人问同一个问题，给同一个回答（updatedAt 不参与）
  const key = cacheKey("chat", question, { ...profile, updatedAt: "" });
  const hit = MEM.get(key);
  if (hit) {
    const enc = new TextEncoder();
    const body = hit.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
    return new Response(enc.encode(body), { headers: SSE_HEADERS });
  }

  const encoder = new TextEncoder();
  const realProvider = getProvider();
  // 今日模型额度用完：只用规则模板回答（越界拦截照常），不静默
  const provider = realProvider.isMock || takeModelQuota() ? realProvider : mockProvider;
  const events: ChatEvent[] = [];
  let cacheable = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatEvent) => {
        events.push(e);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      };

      try {
        // ── ① 意图闸门 ─────────────────────────────────
        const gate = gateQuestion(question);
        if (gate.blocked && gate.reply) {
          // 拒答也按人生阶段补一句：问的东西恰好是这个阶段要特别防的，就点出来（规则拼接，不调模型）
          const st = stageOf(profile);
          const guardHit = st?.guard.find((g) => stageGuardMatches(g.caseId, question));
          if (st && guardHit) {
            gate.reply = {
              ...gate.reply,
              instead: `${gate.reply.instead}\n\n另外提醒一句：你现在处在「${st.label}」阶段，${guardHit.why}`,
            };
          }
          send({
            stage: "gate",
            status: "done",
            blocked: true,
            category: gate.category ?? "pick",
            matched: gate.matched,
            reply: gate.reply,
          });
          return; // 关键：不往下走，不调用模型
        }
        send({ stage: "gate", status: "done", blocked: false });

        // ── ② 档案事实 ─────────────────────────────────
        const facts = profileFacts(profile);
        const stage = stageOf(profile);
        const topics = matchTopics(question, stage);
        send({ stage: "facts", status: "done", facts, topics: topics.map((t) => t.title) });

        // ── ③ 模型讲解 ─────────────────────────────────
        send({ stage: "compose", status: "start" });
        const fallback = templateAnswer(facts, topics, stage);
        let answer = fallback;
        let demoMode = provider.isMock;

        // 审查层的「原文」= 我们给模型的全部素材。
        // 这样模型引用档案里的数字（如真实年化 13.03%）能通过，凭空编的数字会被抓住。
        const sourceText = [
          question,
          ...facts.map((f) => `${f.label}${f.value}${f.basis}`),
          ...topics.flatMap((t) => t.points),
          ...(stage ? stagePoints(stage) : []),
        ].join("\n");

        if (!provider.isMock) {
          try {
            const { text: safeQuestion } = redact(question);
            const raw = await provider.summarize(buildPrompt(safeQuestion, facts, topics, stage));
            const g = guardOutput(raw.trim(), { sourceText });
            send({
              stage: "guard",
              status: "done",
              violations: g.violations,
              inventedNumbers: g.inventedNumbers,
              fellBack: g.shouldFallback || dropRedacted(g.text).text.length < 30,
            });
            const shown = dropRedacted(g.text).text;
            if (!g.shouldFallback && shown.length >= 30) answer = shown;
            else demoMode = true;
          } catch {
            demoMode = true;
            send({ stage: "guard", status: "done", violations: [], inventedNumbers: [], fellBack: true });
          }
        } else {
          // 演示模式：模板答案本身就是规则拼的，仍然过一遍审查层自证
          const g = guardOutput(answer, { sourceText });
          send({
            stage: "guard",
            status: "done",
            violations: g.violations,
            inventedNumbers: g.inventedNumbers,
            fellBack: false,
          });
        }

        send({ stage: "compose", status: "done" });
        send({ stage: "answer", status: "done", text: answer, demoMode });
        cacheable = !provider.isMock && !demoMode;
      } catch (e) {
        send({ stage: "error", status: "done", message: e instanceof Error ? e.message : "回答失败" });
      } finally {
        if (cacheable) MEM.set(key, [...events]);
        controller.close();
      }
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
