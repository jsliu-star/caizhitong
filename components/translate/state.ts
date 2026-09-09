/**
 * 翻译官 · 闯关状态。
 *
 * 两处存储，分工明确：
 * - 共享档案 `lib/profile`（points / cleared / weakTerms）——给另外两个 Tab 读，是智能体协作的接口
 * - 本地私有键 `caidun.quiz.v1`（earned / judgeBest）——只有本页需要的明细，用来防止重复计分
 *
 * 写档案时**必须先 loadProfile 再合并 knowledge**：`level` 字段归规划师所有，不能被抹掉。
 */
import { loadProfile, saveProfile, type Profile } from "@/lib/profile";

export interface QuizLocal {
  /** 已经拿过分的题目 id——同一题重做不再加分 */
  earned: string[];
  /** 骗局识别测试的最好成绩（与财智通一致的段落数，0–5） */
  judgeBest: number;
  /** 骗局识别测试是否做过（用于文案，不用于计分）*/
  judgeScored: boolean;
}

const LOCAL_KEY = "caidun.quiz.v1";
const EMPTY_LOCAL: QuizLocal = { earned: [], judgeBest: 0, judgeScored: false };

export function loadLocal(): QuizLocal {
  if (typeof window === "undefined") return EMPTY_LOCAL;
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return EMPTY_LOCAL;
    const parsed = JSON.parse(raw) as Partial<QuizLocal>;
    return {
      earned: Array.isArray(parsed.earned) ? parsed.earned.filter((x) => typeof x === "string") : [],
      judgeBest: typeof parsed.judgeBest === "number" ? parsed.judgeBest : 0,
      judgeScored: parsed.judgeScored === true,
    };
  } catch {
    return EMPTY_LOCAL;
  }
}

export function saveLocal(patch: Partial<QuizLocal>): QuizLocal {
  const next = { ...loadLocal(), ...patch };
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
  } catch {
    /* 隐私模式下写入失败——降级为「本次会话内有效」 */
  }
  return next;
}

// ────────────────────────────────────────────────────────────
// 等级
// ────────────────────────────────────────────────────────────

export interface Tier {
  min: number;
  name: string;
  /** 这一级意味着你已经会做什么——比空洞的头衔有用 */
  meaning: string;
}

/**
 * 门槛按满分 640（题库 590 + 识别测试 50）标定。
 * 题库扩到 9 关 54 题时同步上调过一次——加题不该让等级变得更容易拿。
 */
export const TIERS: Tier[] = [
  { min: 0, name: "刚上路", meaning: "先从看懂产品页上的字开始。" },
  { min: 100, name: "看得懂", meaning: "业绩比较基准、封闭期、非保本，这些词不会再糊弄你。" },
  { min: 220, name: "不好骗", meaning: "常见的保本承诺、紧迫感、私域导流，你一眼能认出来。" },
  { min: 400, name: "会算账", meaning: "费用、真实年化、日返折算，你会自己动手算一遍。" },
  { min: 640, name: "能护家人", meaning: "你不仅自己不上钩，还能把话讲清楚给爸妈听。" },
];

export function tierOf(points: number): { tier: Tier; index: number; next?: Tier; toNext: number } {
  let index = 0;
  for (let i = 0; i < TIERS.length; i += 1) if (points >= TIERS[i].min) index = i;
  const next = TIERS[index + 1];
  return { tier: TIERS[index], index, next, toNext: next ? next.min - points : 0 };
}

/** 满分（题库 + 骗局识别测试），用于进度环 */
export function maxPoints(quizTotal: number, judgeTotal: number) {
  return quizTotal + judgeTotal;
}

// ────────────────────────────────────────────────────────────
// 写入共享档案
// ────────────────────────────────────────────────────────────

export interface AwardInput {
  /** 本次新答对、且此前没拿过分的题目 */
  newlyEarned: Array<{ id: string; points: number }>;
  /** 本次通关的关卡 id */
  clearedLevelId?: string;
  /** 本次答错的题目所关联的术语 */
  weakTerms?: string[];
  /** 本次答对的题目所关联的术语——答对了就从薄弱清单里移出 */
  masteredTerms?: string[];
}

/**
 * 合并写入共享档案，返回新档案。
 * 注意只动 knowledge 里的 points / cleared / weakTerms 三项，level 保持原样。
 */
export function award(input: AwardInput): Profile {
  const prev = loadProfile();
  const local = loadLocal();

  const fresh = input.newlyEarned.filter((q) => !local.earned.includes(q.id));
  const gained = fresh.reduce((s, q) => s + q.points, 0);

  const weak = new Set(prev.knowledge.weakTerms);
  (input.weakTerms ?? []).forEach((t) => weak.add(t));
  (input.masteredTerms ?? []).forEach((t) => weak.delete(t));

  const cleared = new Set(prev.knowledge.cleared);
  if (input.clearedLevelId) cleared.add(input.clearedLevelId);

  saveLocal({ earned: [...local.earned, ...fresh.map((q) => q.id)] });

  return saveProfile({
    knowledge: {
      ...prev.knowledge,
      points: prev.knowledge.points + gained,
      cleared: [...cleared],
      weakTerms: [...weak],
    },
  });
}

/**
 * 骗局识别测试的计分：只为「进步」计分。
 * 第一次 2/5 得 20 分，重测到 5/5 再补 30 分；重复刷同一个成绩不再加分。
 * 这样既不能刷分，也不会因为第一次手气差就永远拿不到满分。
 */
export function awardJudge(agreeCount: number, perSegment: number): Profile {
  const prev = loadProfile();
  const local = loadLocal();
  const best = Math.max(local.judgeBest, agreeCount);
  const gained = (best - local.judgeBest) * perSegment;
  saveLocal({ judgeBest: best, judgeScored: true });
  return saveProfile({
    knowledge: { ...prev.knowledge, points: prev.knowledge.points + gained },
  });
}

// ────────────────────────────────────────────────────────────
// 题库类型（对应 data/quiz.json）
// ────────────────────────────────────────────────────────────

export type QuizCategory = "term" | "scam" | "sense";

export interface QuizOption {
  id: string;
  text: string;
  correct: boolean;
}

export interface QuizQuestion {
  id: string;
  stem: string;
  options: QuizOption[];
  explain: string;
  linkTerm?: string;
  points: number;
}

export interface QuizLevel {
  id: string;
  category: QuizCategory;
  name: string;
  intro?: string;
  passScore: number;
  questions: QuizQuestion[];
}

export const CATEGORY_META: Record<QuizCategory, { label: string; hint: string }> = {
  term: { label: "术语", hint: "看懂产品页上的字" },
  scam: { label: "反诈", hint: "认出监管禁止的表述" },
  sense: { label: "常识", hint: "先做对顺序" },
};
