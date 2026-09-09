/** 财智通核心类型定义 */

export type Severity = "hard" | "high";
export type RiskLevel = "red" | "yellow" | "green";
export type ExclusionReason = "negated" | "educational";
/** 命中来源：rule=规则库精确比对；semantic=语义识别通道 */
export type HitSource = "rule" | "semantic";

/** 一条命中（或被语境排除的疑似命中） */
export interface Hit {
  /** 来源通道。语义通道用于覆盖规则库穷举不到的口语与变体表达 */
  source: HitSource;
  /** 语义通道给出的判断理由（规则通道无此字段） */
  why?: string;
  patternId: string;
  type: string;
  severity: Severity;
  /** 实际命中的文本片段 */
  matched: string;
  /** 在原文中的位置 */
  index: number;
  /** 命中所在的完整分句，供用户自行判断 */
  clause: string;
  /** 被语境排除时的原因；有值即表示不计入风险 */
  excluded?: ExclusionReason;
  /** 排除依据（命中的否定词或教育语境线索） */
  excludedBy?: string;
  regulationIds: string[];
  plain: string;
  advice: string;
}

/** 正规产品应有的要素 */
export interface ElementCheck {
  id: string;
  label: string;
  present: boolean;
  /** present 时命中的表述 */
  evidence?: string;
  why: string;
  regulationIds: string[];
}

/** 主体核查线索 */
export interface EntityClue {
  id: string;
  label: string;
  detail: string;
  severity: Severity;
}

/** 一键核查入口 */
export interface LookupLink {
  label: string;
  url: string;
  note: string;
}

export interface EntityCheck {
  /** 从内容中提取到的主体名称候选 */
  names: string[];
  /** 宣称的资质编号（若有） */
  licenseNumbers: string[];
  /** 联系方式类型 */
  contacts: string[];
  clues: EntityClue[];
  links: LookupLink[];
}

export interface Regulation {
  id: string;
  law: string;
  article: string;
  gist: string;
  officialText: string | null;
  verified: boolean;
}

export interface Verdict {
  level: RiskLevel;
  headline: string;
  /** 大白话总结，由模型生成；模型不可用时使用模板 */
  summary: string;
  actions: string[];
}

/** 识别模式：translate=只翻译人话；risk=翻译 + 风险体检 */
export type CheckMode = "translate" | "risk";

export interface ShieldReport {
  mode: CheckMode;
  /** 人话版（模型转述原文在讲什么） */
  plainText?: string;
  /** 原文中出现的术语（确定性，不依赖模型） */
  terms: Array<{ term: string; aliases: string[]; plain: string; watch: string; group: string; hitBy: string }>;
  /** 这段话里最该注意的点（确定性） */
  keyPoints: Array<{ id: string; text: string; evidence: string }>;
  /** 五维风险画像 */
  radar: import("@/lib/rules/radar").RiskDimension[];
  /** 匹配到的骗局剧本 */
  playbook: Array<{
    caseId: string;
    name: string;
    hook: string;
    oneLine: string;
    mechanism: string;
    playbook: string[];
    targets: string[];
    score: number;
    shared: string[];
  }>;
  /** 智能体认为还需要补充的信息 */
  followups: import("@/lib/rules/followup").Followup[];
  inputKind: "image" | "text";
  /** 已脱敏的原文 */
  text: string;
  redactedCount: number;
  hits: Hit[];
  excludedHits: Hit[];
  /** 语义通道被校验丢弃的项，用于展示校验过程 */
  semanticDropped: Array<{ patternId: string; quote: string; reason: string }>;
  /** 语义通道的状态说明（跳过 / 超时 / 降级） */
  semanticNote?: string;
  elements: ElementCheck[];
  entity: EntityCheck;
  regulations: Regulation[];
  verdict: Verdict;
  disclaimer: string;
  demoMode: boolean;
  generatedAt: string;
}

/** SSE 事件 */
export type ShieldEvent =
  | { stage: "vision"; status: "start" | "done"; text?: string; redactedCount?: number; demoMode?: boolean; note?: string }
  | { stage: "match"; status: "start" | "progress" | "done"; hit?: Hit; excluded?: Hit; total?: number }
  | {
      stage: "semantic";
      status: "start" | "progress" | "done" | "skipped";
      hit?: Hit;
      dropped?: { patternId: string; quote: string; reason: string };
      total?: number;
      note?: string;
    }
  | { stage: "elements"; status: "done"; elements: ElementCheck[] }
  | { stage: "entity"; status: "start" | "done"; entity?: EntityCheck }
  | { stage: "citation"; status: "start" | "progress" | "done"; regulation?: Regulation }
  | { stage: "verdict"; status: "start" | "delta" | "done"; delta?: string; verdict?: Verdict }
  | { stage: "report"; status: "done"; report: ShieldReport }
  | { stage: "error"; message: string };

export const DISCLAIMER =
  "本报告基于公开监管规则对文本表述特征进行比对，仅供投资者教育参考，不构成对任何机构或产品的法律定性、投资建议或安全性保证。投资有风险，入市需谨慎。";
