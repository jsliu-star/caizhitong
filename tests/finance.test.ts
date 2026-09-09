import { emergencyFund, installmentIrr } from "@/lib/finance";

let fail = 0;
function eq(name: string, actual: number, expected: number, tol: number) {
  const ok = Math.abs(actual - expected) <= tol;
  console.log(`  ${ok ? "✅" : "❌"} ${name}: ${actual.toFixed(4)}（期望 ≈ ${expected}）`);
  if (!ok) fail += 1;
}

console.log("\n=== 分期真实年化（IRR）===");
// 12 期、月费率 0.6%：业界公认真实年化约 13.0%–13.1%（APR 口径）
const a = installmentIrr({ principal: 12000, periods: 12, feeRatePerPeriod: 0.6 });
eq("12期/月费率0.6% 的 APR", a.apr, 0.1309, 0.004);
eq("12期/月费率0.6% 的月IRR", a.monthlyIrr, 0.01091, 0.0005);
eq("手续费总额", a.totalFee, 864, 1);
eq("每期还款", a.payment, 1072, 1);
console.log(`  ℹ️ 宣传口径「总费率 ${(a.nominalTotalRate * 100).toFixed(1)}%」，真实 APR ${(a.apr * 100).toFixed(2)}%`);

// 6 期、月费率 0.45%
const b = installmentIrr({ principal: 6000, periods: 6, feeRatePerPeriod: 0.45 });
eq("6期/月费率0.45% 的 APR", b.apr, 0.0925, 0.006);

// 零费率 → IRR 应为 0
const c = installmentIrr({ principal: 10000, periods: 12, feeRatePerPeriod: 0 });
eq("零费率 APR", c.apr, 0, 1e-6);

console.log("\n=== 应急备用金 ===");
const e1 = emergencyFund({ monthlyExpense: 6000, hasDependents: false, jobStability: "stable", hasInsurance: true });
eq("最优情况月数", e1.months, 3, 0);
eq("最优情况金额", e1.amount, 18000, 0);

const e2 = emergencyFund({ monthlyExpense: 6000, hasDependents: true, jobStability: "unstable", hasInsurance: false });
eq("最差情况月数", e2.months, 10, 0);
eq("最差情况金额", e2.amount, 60000, 0);

console.log(fail === 0 ? "\n=== 全部通过 ===" : `\n=== ${fail} 项失败 ===`);
if (fail) process.exit(1);
