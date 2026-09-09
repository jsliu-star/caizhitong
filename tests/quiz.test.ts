/**
 * 题库与骗局识别测试的回归测试。
 * 改动 data/quiz.json 或 data/glossary.json 后必须跑。
 *
 * 三件事：
 * 1. 题目结构完整（每题唯一正确项、必有 explain、linkTerm 在词典里存在）
 * 2. 词典分类字段合法（词典筛选依赖它）
 * 3. 骗局识别测试的五段文案，用规则引擎实跑一遍，判定必须与设计一致——
 *    尤其是两段「正规材料」必须判 green。若这里失败，说明规则库出现误判，
 *    应记录到 docs/tasks/B-translate-game.md 的协调请求，不要自行修改规则库。
 */
import quizData from "@/data/quiz.json";
import glossaryData from "@/data/glossary.json";
import patternsData from "@/data/violation-patterns.json";
import { analyzeText } from "@/lib/rules/match";
import type { RiskLevel } from "@/lib/types";

interface Option { id: string; text: string; correct: boolean }
interface Question { id: string; stem: string; options: Option[]; explain: string; linkTerm?: string; points: number }
interface Level { id: string; category: string; name: string; passScore: number; questions: Question[] }

const LEVELS = (quizData as { levels: Level[] }).levels;
const JUDGE = (quizData as { judgeSet: { items: Array<{ id: string; label: string; text: string }> } }).judgeSet.items;
const TERMS = (glossaryData as { terms: Array<{ term: string; group?: string }> }).terms;

const GROUPS = ["活钱", "固收", "权益", "费用", "风险", "工具"];
const CATEGORIES = ["term", "scam", "sense"];

/** 骗局识别测试的期望判定。green 的两段是「正规材料对照样本」，是防误判的哨兵。 */
const JUDGE_EXPECT: Record<string, RiskLevel> = {
  j1: "red",
  j2: "green",
  j3: "red",
  j4: "green",
  j5: "yellow",
};

const failures: string[] = [];
let checks = 0;

function check(ok: boolean, msg: string) {
  checks += 1;
  if (!ok) failures.push(msg);
}

// ── 1. 题库结构 ────────────────────────────────────────
const allQuestions = LEVELS.flatMap((l) => l.questions);
const termSet = new Set(TERMS.map((t) => t.term));
const ids = new Set<string>();

check(LEVELS.length >= 8 && LEVELS.length <= 12, `关卡数应为 8–12，实际 ${LEVELS.length}`);
check(
  allQuestions.length >= 48 && allQuestions.length <= 80,
  `题目总数应为 48–80，实际 ${allQuestions.length}`,
);
// 三个类别都要有足够的量，否则「换一关再来」会很快撞回同一批题
for (const cat of CATEGORIES) {
  const n = LEVELS.filter((l) => l.category === cat).length;
  check(n >= 2, `类别 ${cat} 只有 ${n} 关，至少要 2 关`);
}

for (const lv of LEVELS) {
  check(CATEGORIES.includes(lv.category), `关卡 ${lv.id} 的 category 非法：${lv.category}`);
  check(lv.questions.length >= 5, `关卡 ${lv.id} 至少 5 题，实际 ${lv.questions.length}`);
  check(
    lv.passScore >= 1 && lv.passScore <= lv.questions.length,
    `关卡 ${lv.id} 的 passScore 越界：${lv.passScore}`,
  );
  for (const q of lv.questions) {
    check(!ids.has(q.id), `题目 id 重复：${q.id}`);
    ids.add(q.id);
    check(q.options.length >= 3, `题目 ${q.id} 选项少于 3 个`);
    check(
      q.options.filter((o) => o.correct).length === 1,
      `题目 ${q.id} 的正确选项数量不等于 1`,
    );
    check(q.options.every((o) => o.text.trim().length > 0), `题目 ${q.id} 存在空选项`);
    check(new Set(q.options.map((o) => o.id)).size === q.options.length, `题目 ${q.id} 选项 id 重复`);
    check(q.stem.trim().length > 0, `题目 ${q.id} 缺题干`);
    check(q.explain.trim().length >= 20, `题目 ${q.id} 的 explain 太短或缺失`);
    check(q.points > 0, `题目 ${q.id} 的 points 非法`);
    if (q.linkTerm) {
      check(termSet.has(q.linkTerm), `题目 ${q.id} 的 linkTerm「${q.linkTerm}」不在术语词典里`);
    }
  }
}

// 术语关必须覆盖到词典里最关键的几个概念
for (const must of ["业绩比较基准", "IRR", "封闭期", "存款保险"]) {
  check(
    allQuestions.some((q) => q.linkTerm === must),
    `缺少关联术语「${must}」的题目`,
  );
}

// ── 2. 词典分类 ────────────────────────────────────────
for (const t of TERMS) {
  check(Boolean(t.group) && GROUPS.includes(t.group as string), `术语「${t.term}」的 group 非法：${t.group}`);
}

// ── 3. 骗局识别测试的真实判定 ──────────────────────────
check(JUDGE.length === 5, `骗局识别测试应有 5 段，实际 ${JUDGE.length}`);
const levels: RiskLevel[] = [];
for (const item of JUDGE) {
  const want = JUDGE_EXPECT[item.id];
  const got = analyzeText(item.text).level;
  levels.push(got);
  check(
    got === want,
    `${item.id}（${item.label}）期望 ${want}，规则引擎实际判 ${got}` +
      (want === "green" ? " —— 正规样本被误判，请写协调请求给任务 A，不要自行修改规则库" : ""),
  );
}
check(levels.filter((l) => l !== "green").length === 3, "应有 3 段被标记为有问题");
check(levels.filter((l) => l === "green").length === 2, "应有 2 段正规样本判为 green");

// ── 3.5 定向微课：patternId 与 linkQuestion 必须真实存在 ─
interface Lesson { patternId: string; title: string; body: string; linkQuestion?: string }
const LESSONS = (quizData as { microLessons: { items: Lesson[] } }).microLessons.items;
const PATTERN_IDS = new Set(
  (patternsData as { patterns: Array<{ id: string }> }).patterns.map((p) => p.id),
);
// 规则引擎会额外产出这个合成特征（收益率异常检测），它不在 violation-patterns.json 里
PATTERN_IDS.add("vp-yield-outlier");

const seenPattern = new Set<string>();
for (const l of LESSONS) {
  check(PATTERN_IDS.has(l.patternId), `微课引用了不存在的 patternId：${l.patternId}`);
  check(!seenPattern.has(l.patternId), `微课 patternId 重复：${l.patternId}`);
  seenPattern.add(l.patternId);
  check(l.title.trim().length > 0, `微课 ${l.patternId} 缺标题`);
  check(l.body.trim().length >= 40, `微课 ${l.patternId} 正文太短`);
  if (l.linkQuestion) {
    check(ids.has(l.linkQuestion), `微课 ${l.patternId} 的 linkQuestion「${l.linkQuestion}」不存在`);
  }
}
// 每个规则特征都要有对应微课——否则用户在安全盾遇到了却没东西可推
for (const id of PATTERN_IDS) {
  check(seenPattern.has(id), `规则特征 ${id} 没有对应的微课，encountered 命中它时推不出内容`);
}

// ── 4. 措辞红线（题干与解释里不得出现越界表述）──────────
const FORBIDDEN = ["建议买入", "可以放心买", "稳赚", "保证收益", "一定会涨", "这个产品安全"];
for (const l of LESSONS) {
  for (const w of FORBIDDEN) {
    check(!(l.title + l.body).includes(w), `微课 ${l.patternId} 出现越界表述「${w}」`);
  }
}
for (const q of allQuestions) {
  const body = q.explain + q.stem;
  for (const w of FORBIDDEN) {
    // 选项里可以出现（那是错误选项，供用户识别），但题干与解释里不行
    check(!body.includes(w), `题目 ${q.id} 的题干或解释出现越界表述「${w}」`);
  }
}

console.log(`=== 题库测试: ${checks - failures.length}/${checks} 通过 ===`);
console.log(
  `题库：${LEVELS.length} 关 / ${allQuestions.length} 题 / 满分 ${allQuestions.reduce((s, q) => s + q.points, 0)} 分`,
);
console.log(`识别测试判定：${JUDGE.map((j, i) => `${j.id}=${levels[i]}`).join(", ")}`);
console.log(`定向微课：${LESSONS.length} 条，覆盖 ${seenPattern.size}/${PATTERN_IDS.size} 个规则特征`);
if (failures.length) {
  console.log(`\n${failures.length} 个失败:\n`);
  failures.forEach((f) => console.log(`  • ${f}`));
  process.exit(1);
}
