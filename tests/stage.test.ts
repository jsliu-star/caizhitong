/**
 * 人生阶段测试：知识库完整性 + 合规 + 规划师确实用上了它。
 */
import patterns from "@/data/violation-patterns.json";
import cases from "@/data/scam-cases.json";
import quiz from "@/data/quiz.json";
import { STAGES } from "@/lib/stage";
import { guardOutput } from "@/lib/rules/guard";
import { EMPTY_PROFILE, type Profile } from "@/lib/profile";
import { TOPICS, matchTopics, profileFacts, stagePoints, suggestedQuestions, templateAnswer } from "@/lib/plan/advisor";

let fail = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (!cond) fail += 1;
  console.log(`  ${cond ? "✅" : "❌"} ${name}${cond ? "" : `  ${detail}`}`);
};

const PAT = new Set((patterns as { patterns: Array<{ id: string }> }).patterns.map((p) => p.id));
const CASE = new Set((cases as { cases: Array<{ id: string }> }).cases.map((c) => c.id));
const LEVEL = new Set((quiz as { levels: Array<{ id: string }> }).levels.map((l) => l.id));
const TOPIC = new Set(TOPICS.map((t) => t.id));

console.log("\n=== 知识库完整性 ===");
ok("共 7 个阶段", STAGES.length === 7, String(STAGES.length));
for (const s of STAGES) {
  const bad = [
    ...s.patternIds.filter((x) => !PAT.has(x)).map((x) => `pattern:${x}`),
    ...s.guard.filter((g) => !CASE.has(g.caseId)).map((g) => `case:${g.caseId}`),
    ...s.learn.filter((x) => !LEVEL.has(x)).map((x) => `level:${x}`),
    ...s.planTopics.filter((x) => !TOPIC.has(x)).map((x) => `topic:${x}`),
  ];
  ok(`「${s.label}」引用的 id 全部存在`, bad.length === 0, bad.join(", "));
  const officialNoSource = s.guard.filter((g) => g.basis.type === "official" && !(g.basis.url && g.basis.source));
  ok(`「${s.label}」标为官方材料的都有来源与链接`, officialNoSource.length === 0);
  // 不许编造数字：除年龄提示外，阶段文案里不应出现任何数字
  const texts = [s.situation, s.talk, s.next, ...s.focus.flatMap((f) => [f.title, f.why]), ...s.guard.map((g) => g.why)];
  const withDigits = texts.filter((t) => /\d/.test(t));
  ok(`「${s.label}」文案不含数字`, withDigits.length === 0, withDigits.join(" / "));
  // 合规：阶段文案本身过一遍输出审查层
  const g = guardOutput(texts.join("\n"));
  ok(`「${s.label}」文案过审查层零越界`, g.violations.length === 0, g.violations.join(", "));
}

console.log("\n=== 规划师用上了人生阶段 ===");
const P: Profile = { ...EMPTY_PROFILE, lifeStage: "pre-retire" };
const facts = profileFacts(P);
ok("档案事实里有人生阶段", facts.some((f) => f.key === "stage" && f.value === "临近退休"));
const stage = STAGES.find((s) => s.id === "pre-retire")!;
const fallbackTopics = matchTopics("我该怎么办", stage);
ok("问题没匹配到主题时，用该阶段的主题兜底", fallbackTopics.length > 0 && fallbackTopics.every((t) => stage.planTopics.includes(t.id)));
ok("无阶段时不兜底（保持原行为）", matchTopics("我该怎么办").length === 0);
const ans = templateAnswer(facts, fallbackTopics, stage);
ok("兜底回答先说阶段与该阶段最该先做的事", ans.startsWith("你现在处在「临近退休」阶段") && ans.includes(stage.focus[0].title));
ok("兜底回答过审查层零越界", guardOutput(ans, { sourceText: [ans, ...stagePoints(stage)].join("\n") }).violations.length === 0);
const sq = suggestedQuestions(P);
ok("推荐问题优先给该阶段的问题", sq[0] === stage.questions[0], sq.join(" | "));

console.log(fail ? `\n=== ${fail} 项失败 ===` : "\n=== 全部通过 ===");
process.exit(fail ? 1 : 0);
