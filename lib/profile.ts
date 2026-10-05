/**
 * 共享用户档案。三个 Tab 共读共写，是「智能体协作」的载体。
 * 存于 localStorage，不建集中式用户库——金融场景下这也是隐私上的选择。
 */

export type RiskType = "conservative" | "steady" | "balanced" | "growth" | "aggressive";
export type AgeBand = "18-25" | "26-35" | "36-50" | "51-60" | "60+";
export type KnowledgeLevel = "none" | "basic" | "intermediate";

export const RISK_META: Record<RiskType, { label: string; short: string; desc: string; equityCap: number }> = {
  conservative: {
    label: "保守型",
    short: "C1",
    desc: "最看重本金安全，无法承受账面亏损。适合把绝大部分资金放在存款与货币类工具上。",
    equityCap: 0.05,
  },
  steady: {
    label: "稳健型",
    short: "C2",
    desc: "希望比存款多一点收益，但看到本金亏损会睡不着觉。以固收类为主，少量权益类。",
    equityCap: 0.15,
  },
  balanced: {
    label: "平衡型",
    short: "C3",
    desc: "能接受一定波动换取长期收益，理解「短期浮亏不等于亏损」。固收与权益兼配。",
    equityCap: 0.35,
  },
  growth: {
    label: "成长型",
    short: "C4",
    desc: "以长期增值为目标，能承受较大波动，且这笔钱三五年内不会动用。",
    equityCap: 0.55,
  },
  aggressive: {
    label: "进取型",
    short: "C5",
    desc: "追求高收益并清楚可能出现大幅回撤，有承受能力也有心理准备。",
    equityCap: 0.75,
  },
};

export interface Goal {
  id: string;
  name: string;
  years: number;
  targetAmount: number;
  current: number;
  monthly: number;
}

export interface Profile {
  version: 1;
  ageBand?: AgeBand;
  /**
   * 人生阶段（lib/stage）。由用户自己选，不从年龄自动推断——
   * 同样 30 岁，单身、刚有孩子、背着房贷，要防的和该先做的完全不同。
   */
  lifeStage?: import("@/lib/stage").LifeStageId;
  riskType?: RiskType;
  /** 测评原始分 0-100 */
  riskScore?: number;
  /**
   * 四维得分。由规划师写入，供 /profile 画雷达图。
   * 有了它，档案页不必再去读另一个 Tab 的 localStorage key 反算——
   * 跨 Tab 猜 key 是脆弱的，而且「载入示例档案」时雷达出不来。
   */
  riskDims?: { capacity: number; willingness: number; horizon: number; knowledge: number };
  /** 测评中暴露的矛盾（如：进取型但资金 3 个月内要用） */
  conflicts: string[];
  knowledge: {
    level: KnowledgeLevel;
    points: number;
    /** 已通关的关卡 id */
    cleared: string[];
    /** 答错过的术语，用于个性化讲解 */
    weakTerms: string[];
  };
  /** 在安全盾里遇到过的骗局类型 patternId */
  encountered: string[];
  /** 已识别的高息负债年化 */
  debtApr?: number;
  emergencyMonths?: number;
  goals: Goal[];
  updatedAt: string;
}

export const EMPTY_PROFILE: Profile = {
  version: 1,
  conflicts: [],
  knowledge: { level: "none", points: 0, cleared: [], weakTerms: [] },
  encountered: [],
  goals: [],
  updatedAt: "",
};

const KEY = "caidun.profile.v1";

export function loadProfile(): Profile {
  if (typeof window === "undefined") return EMPTY_PROFILE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_PROFILE;
    const parsed = JSON.parse(raw) as Profile;
    if (parsed?.version !== 1) return EMPTY_PROFILE;
    return { ...EMPTY_PROFILE, ...parsed, knowledge: { ...EMPTY_PROFILE.knowledge, ...parsed.knowledge } };
  } catch {
    return EMPTY_PROFILE;
  }
}

export function saveProfile(patch: Partial<Profile>): Profile {
  const next: Profile = {
    ...loadProfile(),
    ...patch,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 隐私模式下写入会失败，静默降级为「本次会话内有效」
  }
  return next;
}

export function clearProfile() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

/** 体验模式：一键载入示例档案，让智能体联动效果立刻可见（答辩演示用） */
export const DEMO_PROFILE: Profile = {
  version: 1,
  ageBand: "26-35",
  riskType: "aggressive",
  riskScore: 82,
  riskDims: { capacity: 62, willingness: 88, horizon: 25, knowledge: 35 },
  conflicts: ["风险测评为进取型，但填写的资金可投期限不足 1 年——这两个条件互斥"],
  // 关卡 id 必须与 data/quiz.json 对得上（term-1/term-2/scam-1/scam-2/sense-1），
  // 否则演示时积分显示 120 但「已通关 0/5」，看着像坏了。
  // term-1(50) + scam-1(70) = 120 分，与 points 自洽。
  knowledge: { level: "basic", points: 120, cleared: ["term-1", "scam-1"], weakTerms: ["年化收益率", "业绩比较基准"] },
  encountered: ["vp-stock-recommendation", "vp-private-traffic"],
  debtApr: 0.1303,
  emergencyMonths: 6,
  goals: [{ id: "g1", name: "5 年后凑首付", years: 5, targetAmount: 800000, current: 200000, monthly: 5000 }],
  updatedAt: new Date(0).toISOString(),
};

// ── 显示偏好 ────────────────────────────────────────────
const LARGE_KEY = "caidun.largeText";

/** 字号偏好独立于档案存储：它是显示设置，不是用户画像 */
export function loadLargeText(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LARGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveLargeText(on: boolean) {
  try {
    window.localStorage.setItem(LARGE_KEY, on ? "1" : "0");
  } catch {
    /* noop */
  }
  if (typeof document !== "undefined") document.body.dataset.large = on ? "1" : "0";
}
