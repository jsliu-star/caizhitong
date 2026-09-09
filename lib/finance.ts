/** 理财计算器。纯计算，零合规风险，但对小白痛感最强。 */

// ── 应急备用金 ─────────────────────────────────────────
export type JobStability = "stable" | "normal" | "unstable";

export interface EmergencyInput {
  monthlyExpense: number;
  /** 是否有需要供养的家人 */
  hasDependents: boolean;
  jobStability: JobStability;
  /** 是否有商业医疗/重疾保险 */
  hasInsurance: boolean;
}

export interface EmergencyResult {
  months: number;
  amount: number;
  /** 影响月数的因素说明 */
  reasons: string[];
}

export function emergencyFund(input: EmergencyInput): EmergencyResult {
  const reasons: string[] = [];
  let months = 3;
  reasons.push("基准：3 个月的生活开支");

  if (input.jobStability === "normal") {
    months += 1;
    reasons.push("收入稳定性一般：+1 个月");
  } else if (input.jobStability === "unstable") {
    months += 3;
    reasons.push("收入不稳定（自由职业 / 收入波动大）：+3 个月");
  }
  if (input.hasDependents) {
    months += 2;
    reasons.push("有需要供养的家人：+2 个月");
  }
  if (!input.hasInsurance) {
    months += 2;
    reasons.push("没有商业医疗或重疾保险：+2 个月（一场大病的自付部分要自己扛）");
  } else {
    reasons.push("已有商业医疗保险：不额外增加");
  }

  return { months, amount: Math.round(input.monthlyExpense * months), reasons };
}

// ── 分期负债真实年化（IRR）────────────────────────────
export interface InstallmentInput {
  /** 借款本金 / 分期金额 */
  principal: number;
  /** 期数（月） */
  periods: number;
  /** 每期费率，百分数，如 0.6 表示 0.6% */
  feeRatePerPeriod: number;
}

export interface InstallmentResult {
  /** 每期还款额 */
  payment: number;
  /** 手续费总额 */
  totalFee: number;
  /** 名义费率（宣传口径）：每期费率 × 期数 */
  nominalTotalRate: number;
  /** 月化 IRR */
  monthlyIrr: number;
  /** 年化（APR，月 IRR × 12，与银行披露口径一致） */
  apr: number;
  /** 年化（复利折算，实际资金成本） */
  effectiveAnnual: number;
  /** 名义与真实的倍数 */
  multiple: number;
}

/**
 * 等额本金 + 每期固定手续费（花呗/信用卡分期的通行算法）。
 * 每期还款 = 本金/期数 + 本金×每期费率。
 * 关键在于：本金是逐月递减的，但手续费一直按最初的全额收 ——
 * 这就是「月费率 0.6% 听起来很低，真实年化却有 13%+」的原因。
 */
export function installmentIrr(input: InstallmentInput): InstallmentResult {
  const { principal: p, periods: n } = input;
  const f = input.feeRatePerPeriod / 100;
  const payment = p / n + p * f;
  const totalFee = p * f * n;

  // 二分求解 NPV = 0
  const npv = (r: number) => {
    let sum = -p;
    for (let t = 1; t <= n; t += 1) sum += payment / (1 + r) ** t;
    return sum;
  };

  let lo = 0;
  let hi = 1; // 月利率上界 100%
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid;
    else hi = mid;
  }
  const monthlyIrr = (lo + hi) / 2;
  const apr = monthlyIrr * 12;
  const effectiveAnnual = (1 + monthlyIrr) ** 12 - 1;
  const nominalTotalRate = f * n;

  return {
    payment,
    totalFee,
    nominalTotalRate,
    monthlyIrr,
    apr,
    effectiveAnnual,
    multiple: nominalTotalRate > 0 ? apr / (nominalTotalRate * (12 / n)) : 0,
  };
}

export const fmtMoney = (n: number) =>
  n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
export const fmtPct = (n: number, digits = 2) => `${(n * 100).toFixed(digits)}%`;
