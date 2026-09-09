/**
 * 规划师问答的合规闸门回归测试。
 *
 * 这组断言守的是**合规红线**，比功能更重要：
 * 推荐具体标的、预测涨跌、承诺收益、代客操作属于持牌业务，我们没有牌照，
 * 所以这类问题必须由规则层拦下、**不进模型**。
 *
 * 反例同样重要：投教类问题不能被误拦，否则产品就没用了（误拦比漏拦更影响可用性，
 * 但漏拦影响合规——两头都要测）。
 */
import { gateQuestion, matchTopics, profileFacts, suggestedQuestions, templateAnswer, TOPICS } from "@/lib/plan/advisor";
import { guardOutput } from "@/lib/rules/guard";
import { DEMO_PROFILE, EMPTY_PROFILE } from "@/lib/profile";

const failures: string[] = [];
let checks = 0;
function check(ok: boolean, msg: string) {
  checks += 1;
  if (!ok) failures.push(msg);
}

// ── 必须拦下的（越界）────────────────────────────────
const MUST_BLOCK: Array<{ q: string; category: string }> = [
  { q: "我该买哪个基金？", category: "pick" },
  { q: "现在买什么好", category: "pick" },
  { q: "推荐几只稳一点的", category: "pick" },
  { q: "帮我选一个适合我的产品", category: "pick" },
  { q: "这个值得买吗", category: "pick" },
  { q: "600519 怎么样", category: "specific" },
  { q: "这只基金好不好", category: "specific" },
  { q: "现在能买吗？", category: "pick" },
  { q: "什么时候买最合适", category: "timing" },
  { q: "明年会涨吗", category: "timing" },
  { q: "现在是不是该抄底", category: "timing" },
  { q: "要不要加仓", category: "timing" },
  { q: "我投十万能赚多少", category: "promise" },
  { q: "这个能有多少收益", category: "promise" },
  { q: "保本吗", category: "promise" },
  { q: "多久翻倍", category: "promise" },
  { q: "你能帮我操作账户吗", category: "delegate" },
  { q: "帮我买入吧", category: "delegate" },
];

for (const c of MUST_BLOCK) {
  const g = gateQuestion(c.q);
  check(g.blocked, `【漏拦·合规风险】「${c.q}」应被拦下，实际放行`);
  if (g.blocked) {
    check(
      g.category === c.category,
      `「${c.q}」应归类为 ${c.category}，实际 ${g.category}`,
    );
    check(Boolean(g.reply?.title && g.reply?.body && g.reply?.instead), `「${c.q}」的拒答模板不完整`);
  }
}

// ── 必须放行的（投教）────────────────────────────────
const MUST_PASS = [
  "我该先还债还是先理财",
  "应急金要留多少才够",
  "业绩比较基准是什么意思",
  "封闭期是什么",
  "理财和存款到底差在哪",
  "什么才算真的分散",
  "杠杆为什么危险",
  "我的钱该怎么分成几份",
  "费用会吃掉多少收益",
  "风险测评为什么重要",
  "群里有人推荐产品，我该怎么判断",
  "我的目标现在这个进度够吗",
  "非保本产品会亏本金吗",
  "明天要用的钱该放哪",
];

for (const q of MUST_PASS) {
  const g = gateQuestion(q);
  check(!g.blocked, `【误拦·影响可用性】「${q}」是投教问题，不该被拦（判为 ${g.category}）`);
}

// ── 拒答模板本身必须合规 ─────────────────────────────
const CATS = ["specific", "pick", "timing", "promise", "delegate"] as const;
for (const cat of CATS) {
  const q = { specific: "600519 怎么样", pick: "买哪个", timing: "会涨吗", promise: "能赚多少", delegate: "帮我操作" }[cat];
  const g = gateQuestion(q);
  const text = `${g.reply?.title}${g.reply?.body}${g.reply?.instead}`;
  const gr = guardOutput(text);
  check(!gr.shouldFallback, `${cat} 的拒答模板自身被审查层判为需回退：${gr.violations.join("、")}`);
}

// ── 主题库 ───────────────────────────────────────────
const ids = new Set<string>();
for (const t of TOPICS) {
  check(!ids.has(t.id), `主题 id 重复：${t.id}`);
  ids.add(t.id);
  check(t.keywords.length > 0, `主题 ${t.id} 没有关键词，永远匹配不到`);
  check(t.points.length >= 2, `主题 ${t.id} 的要点少于 2 条`);
  // 要点本身不得越界
  const gr = guardOutput(t.points.join(""));
  check(!gr.shouldFallback, `主题 ${t.id} 的要点被审查层判为需回退：${gr.violations.join("、")}`);
}
check(matchTopics("我该先还债还是先理财").some((t) => t.id === "debt-first"), "还债问题应匹配到 debt-first 主题");
check(matchTopics("应急金留多少").some((t) => t.id === "emergency"), "应急金问题应匹配到 emergency 主题");

// ── 档案事实：数字必须来自档案，不能凭空出现 ──────────
const facts = profileFacts(DEMO_PROFILE);
check(facts.length > 0, "示例档案应能产出事实");
check(facts.every((f) => f.basis.trim().length > 0), "每条事实都必须带依据");
check(facts.some((f) => f.key === "debt" && f.value.includes("13.03")), "应从档案算出负债真实年化 13.03%");
check(facts.some((f) => f.key === "equity-cap"), "应给出权益类参考比例上限");
check(profileFacts(EMPTY_PROFILE).length === 0, "空档案不应编造事实");

// ── 模板回答（演示模式的兜底）必须合规、且提到更该先做的事 ──
const tpl = templateAnswer(facts, matchTopics("我该先还债还是先理财"));
check(tpl.length > 40, "模板回答太短");
check(tpl.includes("13.03"), "有高息负债时，模板回答应先说这件事");
const tg = guardOutput(tpl, { sourceText: facts.map((f) => f.label + f.value + f.basis).join("\n") + TOPICS.flatMap((t) => t.points).join("\n") });
check(!tg.shouldFallback, `模板回答被审查层判为需回退：${tg.violations.join("、")}｜编造数字：${tg.inventedNumbers.join("、")}`);

// ── 推荐问法本身不能是越界问题 ───────────────────────
for (const s of suggestedQuestions(DEMO_PROFILE)) {
  check(!gateQuestion(s).blocked, `推荐问法「${s}」自己会被闸门拦下，等于给用户挖坑`);
}

console.log(`=== 规划师问答测试: ${checks - failures.length}/${checks} 通过 ===`);
console.log(`闸门：必拦 ${MUST_BLOCK.length} 例 / 必放行 ${MUST_PASS.length} 例｜主题库 ${TOPICS.length} 个`);
if (failures.length) {
  console.log(`\n${failures.length} 个失败:\n`);
  failures.forEach((f) => console.log(`  • ${f}`));
  process.exit(1);
}
