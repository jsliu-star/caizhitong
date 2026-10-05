/**
 * 人生阶段。三个智能体和小通都从这里读「这个人现在处在什么阶段、该防什么、该先做什么」。
 *
 * 数据在 data/life-stages.json：focus 只讲原则与顺序，不指向产品；
 * guard 的依据分 official（有官方公开材料，附链接）与 reasoning（基于处境的推理）两类，界面上如实标注。
 */
import data from "@/data/life-stages.json";
import type { AgeBand, Profile } from "@/lib/profile";
import type { IconName } from "@/components/ui/Icon";

export type LifeStageId = "student" | "early-career" | "couple" | "parenting" | "midlife" | "pre-retire" | "retired";

export interface StageGuard {
  caseId: string;
  why: string;
  basis: { type: "official" | "reasoning"; source?: string; url?: string };
}

export interface LifeStage {
  id: LifeStageId;
  label: string;
  ageHint: string;
  ageBands: AgeBand[];
  icon: IconName;
  situation: string;
  focus: Array<{ title: string; why: string }>;
  guard: StageGuard[];
  patternIds: string[];
  learn: string[];
  planTopics: string[];
  questions: string[];
  talk: string;
  next: string;
}

export const STAGES = data.stages as LifeStage[];
const BY_ID = new Map(STAGES.map((s) => [s.id, s]));

export function getStage(id?: string | null): LifeStage | undefined {
  return id ? BY_ID.get(id as LifeStageId) : undefined;
}

/** 档案里的人生阶段 */
export function stageOf(p: Profile): LifeStage | undefined {
  return getStage(p.lifeStage);
}

/** 只知道年龄段时，给出可能的阶段（供用户确认，不自动写入档案） */
export function stagesForAge(age?: AgeBand): LifeStage[] {
  return age ? STAGES.filter((s) => s.ageBands.includes(age)) : [];
}

/** 时间线上的下一阶段 */
export function nextStage(id: LifeStageId): LifeStage | undefined {
  const i = STAGES.findIndex((s) => s.id === id);
  return i >= 0 ? STAGES[i + 1] : undefined;
}

/**
 * 一句话是否在问「这个阶段要特别防的那类骗局」。确定性关键词，宁缺毋滥。
 * 用于规划师拒答时补一句阶段提醒。
 */
const GUARD_CUES: Record<string, RegExp> = {
  "sc-guaranteed": /(保本|高息|稳赚|养老(公寓|理财|项目|床位)|固定收益|月息|返息)/,
  "sc-stock-group": /(荐股|老师|带单|股票群|牛股|涨停)/,
  "sc-crypto": /(虚拟币|币圈|挖矿|矿机|区块链|代币|USDT)/,
  "sc-managed": /(帮我(操作|打理|炒)|代(客|操作)|账户(交|给)|亏了.{0,2}赔)/,
  "sc-preipo": /(原始股|上市前|股权|内部认购)/,
  "sc-rebate": /(返利|返佣|拉人|推荐奖|下线|会员等级)/,
  "sc-romance": /(网上认识|网恋|交友|对象带我|男朋友|女朋友)/,
  "sc-impersonate": /(医保|公检法|警察|客服|安全账户|冻结)/,
  "sc-account": /(借.{0,2}卡|出借|租.{0,2}卡|收卡|跑分|手续费.{0,4}流水)/,
};
export function stageGuardMatches(caseId: string, text: string): boolean {
  return GUARD_CUES[caseId]?.test(text) ?? false;
}
