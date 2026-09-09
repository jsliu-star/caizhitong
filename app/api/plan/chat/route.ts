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
import { guardOutput } from "@/lib/rules/guard";
import { redact } from "@/lib/rules/redact";
import { EMPTY_PROFILE, type Profile } from "@/lib/profile";
import {
  buildPrompt,
  gateQuestion,
  matchTopics,
  profileFacts,
  templateAnswer,
  type Fact,
} from "@/lib/plan/advisor";

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

export async function POST(req: Request) {
  let question = "";
  let profile: Profile = EMPTY_PROFILE;
  try {
    const body = (await req.json()) as { question?: string; profile?: Profile };
    question = String(body.question ?? "").trim();
    if (body.profile && typeof body.profile === "object") {
      profile = { ...EMPTY_PROFILE, ...body.profile, knowledge: { ...EMPTY_PROFILE.knowledge, ...body.profile.knowledge } };
    }
  } catch {
    return Response.json({ error: "请求体解析失败" }, { status: 400 });
  }
  if (question.length < 2) return Response.json({ error: "问题太短" }, { status: 400 });
  if (question.length > 500) question = question.slice(0, 500);

  const encoder = new TextEncoder();
  const provider = getProvider();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));

      try {
        // ── ① 意图闸门 ─────────────────────────────────
        const gate = gateQuestion(question);
        if (gate.blocked && gate.reply) {
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
        const topics = matchTopics(question);
        send({ stage: "facts", status: "done", facts, topics: topics.map((t) => t.title) });

        // ── ③ 模型讲解 ─────────────────────────────────
        send({ stage: "compose", status: "start" });
        const fallback = templateAnswer(facts, topics);
        let answer = fallback;
        let demoMode = provider.isMock;

        // 审查层的「原文」= 我们给模型的全部素材。
        // 这样模型引用档案里的数字（如真实年化 13.03%）能通过，凭空编的数字会被抓住。
        const sourceText = [
          question,
          ...facts.map((f) => `${f.label}${f.value}${f.basis}`),
          ...topics.flatMap((t) => t.points),
        ].join("\n");

        if (!provider.isMock) {
          try {
            const { text: safeQuestion } = redact(question);
            const raw = await provider.summarize(buildPrompt(safeQuestion, facts, topics));
            const g = guardOutput(raw.trim(), { sourceText });
            send({
              stage: "guard",
              status: "done",
              violations: g.violations,
              inventedNumbers: g.inventedNumbers,
              fellBack: g.shouldFallback || g.text.length < 20,
            });
            if (!g.shouldFallback && g.text.length >= 20) answer = g.text;
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
      } catch (e) {
        send({ stage: "error", status: "done", message: e instanceof Error ? e.message : "回答失败" });
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
