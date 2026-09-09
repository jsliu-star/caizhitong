import { assessGoal, buildAllocation, futureValue, requiredRate } from "@/lib/plan/allocation";
import { findConflicts, nextQuestion, scoreAnswers, type Answers } from "@/lib/plan/questions";

let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? ` ${extra}` : ""}`);
  if (!cond) fail += 1;
};
const near = (name: string, a: number, b: number, tol: number) =>
  ok(name, Math.abs(a - b) <= tol, `→ ${a.toFixed(4)}（期望 ≈ ${b}）`);

console.log("\n=== 自适应分支 ===");
{
  // 退休金路径：应出现 pensionShare，不应出现 studentDebt
  const a: Answers = { age: "60+", source: "pension" };
  const ids: string[] = [];
  let cur: Answers = { ...a };
  for (let i = 0; i < 20; i += 1) {
    const q = nextQuestion(cur);
    if (!q) break;
    ids.push(q.id);
    cur = { ...cur, [q.id]: q.kind === "number" ? 100000 : (q.options?.[0].value ?? "x") };
  }
  ok("退休金路径包含 pensionShare", ids.includes("pensionShare"));
  ok("退休金路径不含 studentDebt", !ids.includes("studentDebt"));
  ok("退休金路径不含 stability（非工薪）", !ids.includes("stability"));
}
{
  // 学生路径：应出现 studentDebt
  const ids: string[] = [];
  let cur: Answers = { age: "18-25", source: "allowance" };
  for (let i = 0; i < 20; i += 1) {
    const q = nextQuestion(cur);
    if (!q) break;
    ids.push(q.id);
    cur = { ...cur, [q.id]: q.kind === "number" ? 10000 : (q.options?.[0].value ?? "x") };
  }
  ok("学生路径包含 studentDebt", ids.includes("studentDebt"));
  ok("学生路径不含 pensionShare", !ids.includes("pensionShare"));
}

console.log("\n=== 定级与矛盾发现 ===");
{
  const a: Answers = {
    age: "26-35", source: "salary", stability: "stable", horizon: "gt5y", amount: 200000,
    emergency: "gt6", loss: "add", drawdown: "30", experience: "stock", debt: "none",
    kBenchmark: "right",
  };
  const s = scoreAnswers(a);
  ok("年轻高承受 → growth/aggressive", ["growth", "aggressive"].includes(s.riskType), `实际 ${s.riskType}(${s.score})`);
  ok("无矛盾", findConflicts(a, s).length === 0);
}
{
  const a: Answers = {
    age: "60+", source: "pension", pensionShare: "gt50", horizon: "lt6m", amount: 300000,
    emergency: "none", loss: "add", drawdown: "30", experience: "leverage", debt: "none",
    kBenchmark: "wrong-promise", kDeposit: "wrong-same",
  };
  const s = scoreAnswers(a);
  const c = findConflicts(a, s);
  ok("养老钱高意愿 → 被能力压低定级", ["conservative", "steady"].includes(s.riskType), `实际 ${s.riskType}(${s.score})`);
  ok("识别出养老钱风险矛盾", c.some((x) => x.id === "c-pension-risk"));
  ok("识别出短钱长投矛盾或集中度矛盾", c.some((x) => ["c-horizon-risk", "c-concentration"].includes(x.id)));
  ok("识别出无应急金", c.some((x) => x.id === "c-emergency"));
  ok("知识薄弱项已记录", s.weakTerms.length === 2, `→ ${s.weakTerms.join("/")}`);
}
{
  const a: Answers = { age: "18-25", source: "borrowed", studentDebt: "loan", horizon: "1-3y", amount: 20000,
    emergency: "none", loss: "hold", drawdown: "10", experience: "money", debt: "high" };
  const s = scoreAnswers(a);
  const c = findConflicts(a, s);
  ok("借钱投资被识别", c.some((x) => x.id === "c-borrowed"));
  ok("高息负债被识别", c.some((x) => x.id === "c-debt"));
  ok("借钱投资 → 最保守档", s.riskType === "conservative", `实际 ${s.riskType}(${s.score})`);
}

console.log("\n=== 配置框架 ===");
{
  const r = buildAllocation("aggressive", { horizon: "lt6m", emergency: "gt6" });
  const eq = r.slices.find((s) => s.key === "equity")?.pct ?? 0;
  ok("半年内要用的钱 → 权益类归零", eq === 0, `→ ${eq}%`);
  ok("给出了调整说明", r.adjustments.length > 0);
  const sum = r.slices.reduce((s, x) => s + x.pct, 0);
  ok("比例合计 100%", sum === 100, `→ ${sum}%`);
}
{
  const r = buildAllocation("balanced", { horizon: "gt5y", emergency: "none" });
  ok("无应急金 → 提高活钱并说明", r.adjustments.some((x) => x.includes("应急")));
  ok("比例合计 100%", r.slices.reduce((s, x) => s + x.pct, 0) === 100);
}

console.log("\n=== 目标可行性推演 ===");
{
  // 20 万起，每月 5000，5 年后要 80 万
  const g = { targetAmount: 800000, years: 5, current: 200000, monthly: 5000 };
  const req = requiredRate(g);
  ok("能反解出所需年化", req !== null);
  near("零收益下的终值", futureValue(g, 0), 200000 + 5000 * 60, 1);
  const f = assessGoal(g, 0.03);
  ok("3% 假设下不可行", !f.feasible);
  ok("给出三个可调杠杆", f.levers.length === 3, `→ ${f.levers.map((l) => l.kind).join(",")}`);
  ok("路径点数 = 年数+1", f.path.assumed.length === 6);
  console.log(`     所需年化 ≈ ${(req! * 100).toFixed(1)}%，3% 下可达 ${Math.round(f.reachable / 10000)} 万，缺口 ${Math.round(f.gap / 10000)} 万`);
}
{
  const g = { targetAmount: 300000, years: 5, current: 200000, monthly: 2000 };
  const f = assessGoal(g, 0.03);
  ok("宽松目标在 3% 下可行", f.feasible);
  ok("可行时不给杠杆", f.levers.length === 0);
}

console.log(fail === 0 ? "\n=== 全部通过 ===" : `\n=== ${fail} 项失败 ===`);
if (fail) process.exit(1);
