import type { RiskType } from "@/lib/profile";
import type { Answers } from "@/lib/plan/questions";

/**
 * 大类资产配置框架 + 目标可行性推演。
 *
 * 合规边界（全文贯彻）：
 *   ✅ 只给「大类比例参考」与判断原则
 *   ✅ 只做数学推演，用户自己给收益率假设
 *   ❌ 不出现任何具体产品、代码、管理人
 *   ❌ 不预测收益、不承诺收益、不给「预期收益率」
 */

export interface AllocationSlice {
  key: string;
  label: string;
  pct: number;
  why: string;
}

const BASE: Record<RiskType, number[]> = {
  // [活期货币, 存款定期, 债券类, 权益类, 保障与其他]
  conservative: [30, 55, 12, 0, 3],
  steady: [20, 45, 25, 5, 5],
  balanced: [15, 30, 30, 20, 5],
  growth: [10, 20, 25, 40, 5],
  aggressive: [8, 12, 20, 55, 5],
};

const LABELS = [
  { key: "cash", label: "活期与货币类", why: "随时可取，用来应急和等待机会，不追求收益" },
  { key: "deposit", label: "存款与定期", why: "本金确定，受存款保险保障（限额内），是安全垫" },
  { key: "bond", label: "债券类", why: "波动小于权益类，但同样不保本，会受利率和信用风险影响" },
  { key: "equity", label: "权益类", why: "长期回报的主要来源，也是波动的主要来源，必须用长钱配" },
  { key: "other", label: "保障与其他", why: "保险解决的是风险转移，不是收益；黄金等用于分散" },
];

const HORIZON_EQUITY_CAP: Record<string, number> = {
  lt6m: 0,
  "6-12m": 5,
  "1-3y": 20,
  "3-5y": 45,
  gt5y: 100,
};

export interface AllocationResult {
  slices: AllocationSlice[];
  /** 因期限或应急金被下调的说明 */
  adjustments: string[];
}

export function buildAllocation(riskType: RiskType, answers: Answers): AllocationResult {
  let pcts = [...BASE[riskType]];
  const adjustments: string[] = [];

  const baseEquity = pcts[3];

  // 期限对权益类的硬约束——短钱不长投
  const horizon = String(answers.horizon ?? "gt5y");
  const cap = HORIZON_EQUITY_CAP[horizon] ?? 100;
  const horizonCapped = pcts[3] > cap;
  if (horizonCapped) {
    const cut = pcts[3] - cap;
    pcts[3] = cap;
    pcts[1] += Math.round(cut * 0.6);
    pcts[0] += cut - Math.round(cut * 0.6);
  }

  // 没有应急金时，先把活钱补足
  const noEmergency = ["none", "lt3"].includes(String(answers.emergency));
  if (noEmergency) {
    const move = Math.min(15, pcts[3] + pcts[2]);
    const fromEquity = Math.min(pcts[3], Math.round(move * 0.6));
    const fromBond = move - fromEquity;
    pcts[3] -= fromEquity;
    pcts[2] -= fromBond;
    pcts[0] += move;
  }

  // 高息负债：直接提示优先还债
  if (["high", "unknown"].includes(String(answers.debt))) {
    adjustments.push(
      "你有分期或消费贷。在还清之前，「还债」本身就是收益率最确定的一项配置——它的回报等于你的借款利率，且百分之百确定。",
    );
  }

  // 归一化到 100
  const sum = pcts.reduce((s, x) => s + x, 0);
  pcts = pcts.map((p) => Math.max(0, Math.round((p / sum) * 100)));
  const drift = 100 - pcts.reduce((s, x) => s + x, 0);
  pcts[1] += drift;

  // 说明文案在此处生成，引用的是归一化之后的**最终**比例
  const finalEquity = pcts[3];
  const HORIZON_LABEL: Record<string, string> = {
    lt6m: "半年内",
    "6-12m": "一年内",
    "1-3y": "三年内",
    "3-5y": "五年内",
  };
  if (horizonCapped) {
    adjustments.push(
      finalEquity === 0
        ? `因为这笔钱${HORIZON_LABEL[horizon] ?? ""}可能要用，权益类已归零——期限比风险偏好更硬：短期要用的钱，不该承担需要时间来消化的波动。`
        : `因为这笔钱${HORIZON_LABEL[horizon] ?? ""}可能要用，权益类从 ${baseEquity}% 下调到 ${finalEquity}%——期限比风险偏好更硬。`,
    );
  }
  if (noEmergency) {
    adjustments.push(
      `你还没有留足应急备用金，所以活期与货币类被提高到 ${pcts[0]}%${
        horizonCapped && finalEquity === 0 ? "（权益类的那部分也一并挪到了这里）" : ""
      }——这部分不是为了赚钱，是为了让你不必在急用钱时被迫卖出。`,
    );
  }

  return {
    slices: LABELS.map((l, i) => ({ ...l, pct: pcts[i] })).filter((s) => s.pct > 0),
    adjustments,
  };
}

// ────────────────────────────────────────────────────────────
// 目标可行性推演
// ────────────────────────────────────────────────────────────

export interface GoalInput {
  targetAmount: number;
  years: number;
  current: number;
  /** 每月新增投入 */
  monthly: number;
}

/** 年金终值：现有资金复利增长 + 每月投入按年计息 */
export function futureValue(g: GoalInput, annualRate: number): number {
  const n = g.years;
  const r = annualRate;
  const fvCurrent = g.current * (1 + r) ** n;
  const yearly = g.monthly * 12;
  const fvFlow = r === 0 ? yearly * n : yearly * (((1 + r) ** n - 1) / r);
  return fvCurrent + fvFlow;
}

/** 反解达成目标所需的年化——这是「目标可行性」的核心数学 */
export function requiredRate(g: GoalInput): number | null {
  if (g.years <= 0) return null;
  if (futureValue(g, 0) >= g.targetAmount) return 0;
  let lo = 0;
  let hi = 1.5; // 年化 150% 上界
  if (futureValue(g, hi) < g.targetAmount) return null; // 即便极端收益也达不到
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (futureValue(g, mid) < g.targetAmount) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 在给定假设收益率下，达成目标需要的年限 */
export function requiredYears(g: GoalInput, rate: number): number | null {
  for (let y = 1; y <= 60; y += 1) {
    if (futureValue({ ...g, years: y }, rate) >= g.targetAmount) return y;
  }
  return null;
}

/** 在给定假设收益率与年限下，需要的月投入 */
export function requiredMonthly(g: GoalInput, rate: number): number {
  const n = g.years;
  const fvCurrent = g.current * (1 + rate) ** n;
  const gap = Math.max(0, g.targetAmount - fvCurrent);
  const factor = rate === 0 ? 12 * n : 12 * (((1 + rate) ** n - 1) / rate);
  return factor > 0 ? gap / factor : Infinity;
}

/** 在给定假设收益率下能达成的金额 */
export function reachableAmount(g: GoalInput, rate: number): number {
  return futureValue(g, rate);
}

export interface FeasibilityLever {
  kind: "years" | "target" | "monthly";
  label: string;
  detail: string;
}

export interface Feasibility {
  required: number | null;
  /** 用户给出的假设年化 */
  assumed: number;
  reachable: number;
  gap: number;
  /** 在假设收益率下是否达成 */
  feasible: boolean;
  levers: FeasibilityLever[];
  /** 逐年路径，用于画图 */
  path: { years: string[]; assumed: number[]; target: number[] };
}

const money = (n: number) =>
  n >= 10000 ? `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)} 万元` : `${Math.round(n).toLocaleString("zh-CN")} 元`;

export function assessGoal(g: GoalInput, assumedRate: number): Feasibility {
  const required = requiredRate(g);
  const reachable = reachableAmount(g, assumedRate);
  const gap = g.targetAmount - reachable;
  const feasible = gap <= 0;

  const levers: FeasibilityLever[] = [];
  if (!feasible) {
    const yrs = requiredYears(g, assumedRate);
    if (yrs) {
      levers.push({
        kind: "years",
        label: "延长期限",
        detail: `把期限从 ${g.years} 年延长到 ${yrs} 年，在同样的假设下就能达成。`,
      });
    }
    levers.push({
      kind: "target",
      label: "调低目标",
      detail: `维持 ${g.years} 年和现在的投入，可以攒到约 ${money(reachable)}——把目标定在这个数附近是现实的。`,
    });
    const m = requiredMonthly(g, assumedRate);
    if (Number.isFinite(m)) {
      levers.push({
        kind: "monthly",
        label: "提高月投入",
        detail: `每月投入从 ${money(g.monthly)} 提高到约 ${money(m)}，可以在 ${g.years} 年内达成。`,
      });
    }
  }

  const years: string[] = [];
  const assumedPath: number[] = [];
  const targetPath: number[] = [];
  for (let y = 0; y <= g.years; y += 1) {
    years.push(y === 0 ? "现在" : `${y}年`);
    assumedPath.push(Math.round(futureValue({ ...g, years: y }, assumedRate)));
    targetPath.push(Math.round((g.targetAmount * y) / g.years || g.current));
  }

  return {
    required,
    assumed: assumedRate,
    reachable,
    gap,
    feasible,
    levers,
    path: { years, assumed: assumedPath, target: targetPath },
  };
}

export const fmtMoneyCN = money;
