import patternsData from "@/data/violation-patterns.json";
import marketData from "@/data/market-snapshot.json";
import type { ElementCheck, Hit, RiskLevel, Severity } from "@/lib/types";

/** 风险等级阈值（可调，集中在此处便于回归测试） */
export const THRESHOLDS = {
  /** 命中多少条硬性违规 → 高风险 */
  hardForRed: 1,
  /** 命中多少条高风险诱导 → 需警惕 */
  highForYellow: 2,
} as const;

/** 分句边界：用于否定语境（局部）和上下文展示 */
const PUNCT = "。！？；，、\n\r,.;!?";
/** 整句边界：用于教育语境（篇章级） */
const SENTENCE_PUNCT = "。！？\n\r.!?";

interface RawPattern {
  id: string;
  type: string;
  severity: Severity;
  keywords: string[];
  regex?: string[];
  regulationIds: string[];
  plain: string;
  advice: string;
}

const PATTERNS = patternsData.patterns as RawPattern[];
const NEGATION = patternsData.negation as { windowChars: number; words: string[] };
const EDU_CUES = patternsData.educationalCues as { strong: string[]; weak: string[] };
const WHITELIST = (patternsData as { termWhitelist?: { terms: string[] } }).termWhitelist?.terms ?? [];
const ELEMENTS = patternsData.missingElements as Array<{
  id: string;
  label: string;
  keywords: string[];
  why: string;
  regulationIds: string[];
}>;

/**
 * 归一化：只把全角**数字、字母和百分号**转半角，并归一空白。
 * 刻意不动中文标点（，（）：！？）——它们既是分句依据，也要原样呈现给用户；
 * 早期版本一并转成了半角，导致报告里的引文标点和原文不一致。
 */
export function normalize(input: string): string {
  return input
    .replace(/[０-９Ａ-Ｚａ-ｚ％]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .replace(/[ \t]+/g, " ");
}

/**
 * 术语白名单检测：命中片段若落在某个合法金融术语内部，则不计为违规。
 * 例：「无风险利率」中的「无风险」、「固定收益类产品」中的「固定收益」。
 */
function inWhitelistedTerm(text: string, start: number, end: number): string | undefined {
  for (const term of WHITELIST) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(term, from);
      if (i === -1) break;
      if (i <= start && end <= i + term.length) return term;
      from = i + 1;
    }
  }
  return undefined;
}

/** 取命中位置所在的分句（用于展示上下文和判断教育语境） */
function clauseAt(text: string, index: number, matchLen: number): string {
  let start = index;
  while (start > 0 && !PUNCT.includes(text[start - 1])) start -= 1;
  let end = index + matchLen;
  while (end < text.length && !PUNCT.includes(text[end])) end += 1;
  return text.slice(start, end).trim();
}

/**
 * 否定语境检测：只在「同一分句内、命中词之前的 windowChars 个字符」中找否定词。
 * 限制在分句内是关键——否则「本产品不是存款，保本保息」会被误判为否定。
 */
function negatedBy(text: string, index: number): string | undefined {
  let start = index;
  while (start > 0 && !PUNCT.includes(text[start - 1])) start -= 1;
  const from = Math.max(start, index - NEGATION.windowChars);
  const window = text.slice(from, index);
  // 长词优先，避免「不」抢先命中「不保证」
  const words = [...NEGATION.words].sort((a, b) => b.length - a.length);
  return words.find((w) => window.includes(w));
}

/** 取命中位置所在的整句（教育语境需要篇章级视野） */
function sentenceAt(text: string, index: number, matchLen: number): string {
  let start = index;
  while (start > 0 && !SENTENCE_PUNCT.includes(text[start - 1])) start -= 1;
  let end = index + matchLen;
  while (end < text.length && !SENTENCE_PUNCT.includes(text[end])) end += 1;
  return text.slice(start, end).trim();
}

/**
 * 教育/引用语境检测。
 * strong 线索在「整句」范围内生效——「凡是承诺保本保息的都是骗局」中，
 * 违规词与线索分处不同分句，只看分句必然误判。
 * weak 线索只在「分句」范围内生效——否则真实广告里一句「警惕错过」
 * 就能让整段违规话术蒙混过关。
 */
function educationalBy(clause: string, sentence: string): string | undefined {
  return EDU_CUES.strong.find((c) => sentence.includes(c)) ?? EDU_CUES.weak.find((c) => clause.includes(c));
}

/** 金融语境词——用于避免把无关文本（如「电量 80%」「加个微信」）纳入风险判定 */
const FINANCIAL_CONTEXT = [
  "理财", "投资", "收益", "回报", "年化", "基金", "股票", "炒股", "债券", "私募", "资管",
  "入股", "股权", "存款", "利息", "分红", "本金", "资金", "出金", "入金", "项目",
  "币", "期货", "外汇", "杠杆", "开户", "账户", "赚", "盈利", "亏损", "打款", "转账",
  "钱", "额度", "返利", "提现", "充值", "下单", "仓位", "行情", "涨", "跌",
];

export function hasFinancialContext(rawText: string): boolean {
  const text = normalize(rawText);
  return FINANCIAL_CONTEXT.some((w) => text.includes(w));
}

const YIELD = marketData.yieldOutlier as { suspiciousAnnualPct: number; severeAnnualPct: number };
const RISK_FREE = (marketData.items as Record<string, { value: number | null; date: string | null }>).riskFreeRate;
/** 只有同时具备数值与数据日期才展示具体数字，否则退回定性表述 */
const RISK_FREE_SHOWABLE = RISK_FREE.value !== null && Boolean(RISK_FREE.date);

/** 百分比前缀 → 年化折算倍数 */
const PERIOD_MULTIPLIER: Array<{ cues: string[]; mult: number; label: string }> = [
  { cues: ["日化", "日息", "日返", "日结", "每日"], mult: 365, label: "按日折算年化" },
  { cues: ["周化", "周息", "每周"], mult: 52, label: "按周折算年化" },
  { cues: ["月化", "月息", "月利", "月返", "月收益", "每月"], mult: 12, label: "按月折算年化" },
  { cues: ["年化", "年息", "年收益", "年回报"], mult: 1, label: "年化" },
];

const PCT_RE = /(\d+(?:\.\d+)?)\s*[%％]/g;

/**
 * 收益率异常检测：把宣传中的收益率折算成年化，与市场常见水平比较。
 * 这是「用真实市场基准当标尺」的落地——不判定违法，只指出数值反常。
 */
export function detectYieldOutliers(rawText: string): Hit[] {
  const text = normalize(rawText);
  if (!hasFinancialContext(text)) return [];

  const out: Hit[] = [];
  const seen = new Set<string>();

  for (const m of text.matchAll(PCT_RE)) {
    const idx = m.index ?? 0;
    const raw = Number(m[1]);
    if (!Number.isFinite(raw)) continue;

    const lookBehind = text.slice(Math.max(0, idx - 12), idx);
    const period = PERIOD_MULTIPLIER.find((p) => p.cues.some((c) => lookBehind.includes(c)));
    // 没有周期前缀时，只在明确谈收益的语境下按年化理解
    const yieldish = /(收益|回报|利息|分红|赚)/.test(lookBehind);
    if (!period && !yieldish) continue;

    const mult = period?.mult ?? 1;
    const annual = raw * mult;
    if (annual < YIELD.suspiciousAnnualPct) continue;

    const key = `${raw}-${mult}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const severe = annual >= YIELD.severeAnnualPct;
    const shown = mult === 1 ? `${raw}%` : `${raw}% × ${mult} ≈ 年化 ${Math.round(annual)}%`;
    const anchor = RISK_FREE_SHOWABLE
      ? `当前 10 年期国债收益率约 ${RISK_FREE.value}%（数据日期 ${RISK_FREE.date}）`
      : "当前银行存款与货币基金的常见收益水平";

    out.push({
      source: "rule",
      patternId: "vp-yield-outlier",
      type: severe ? "收益率远高于市场常见水平" : "收益率明显高于市场常见水平",
      severity: "high",
      matched: m[0],
      index: idx,
      clause: clauseAt(text, idx, m[0].length),
      regulationIds: ["reg-ad-25"],
      plain: `折算后为 ${shown}。作为对比，${anchor}。收益高出多少，通常就意味着你多承担了多少风险——问题不在数字本身，而在于宣传方是否把这部分风险如实告诉了你。`,
      advice: "把宣传的收益率折算成年化，再和无风险利率对比。差额越大，越要追问『多出来的收益从哪来』。",
    });
  }
  return out;
}

interface MatchResult {
  hits: Hit[];
  excludedHits: Hit[];
}

export function matchPatterns(rawText: string): MatchResult {
  const text = normalize(rawText);
  const hits: Hit[] = [];
  const excludedHits: Hit[] = [];

  for (const p of PATTERNS) {
    // 同一 pattern 内已覆盖的区间，避免「保本保息」与「保本」重复计数
    const covered: Array<[number, number]> = [];
    const overlaps = (s: number, e: number) => covered.some(([cs, ce]) => s < ce && e > cs);

    const candidates: Array<{ matched: string; index: number }> = [];

    // 关键词：长词优先
    for (const kw of [...p.keywords].sort((a, b) => b.length - a.length)) {
      let from = 0;
      for (;;) {
        const i = text.indexOf(kw, from);
        if (i === -1) break;
        if (!overlaps(i, i + kw.length) && !inWhitelistedTerm(text, i, i + kw.length)) {
          covered.push([i, i + kw.length]);
          candidates.push({ matched: kw, index: i });
        }
        from = i + 1;
      }
    }

    // 正则
    for (const src of p.regex ?? []) {
      const re = new RegExp(src, "g");
      for (const m of text.matchAll(re)) {
        const i = m.index ?? -1;
        if (i < 0) continue;
        if (!overlaps(i, i + m[0].length) && !inWhitelistedTerm(text, i, i + m[0].length)) {
          covered.push([i, i + m[0].length]);
          candidates.push({ matched: m[0], index: i });
        }
      }
    }

    for (const c of candidates.sort((a, b) => a.index - b.index)) {
      const clause = clauseAt(text, c.index, c.matched.length);
      const base: Hit = {
        source: "rule",
        patternId: p.id,
        type: p.type,
        severity: p.severity,
        matched: c.matched,
        index: c.index,
        clause,
        regulationIds: p.regulationIds,
        plain: p.plain,
        advice: p.advice,
      };

      const neg = negatedBy(text, c.index);
      if (neg) {
        excludedHits.push({ ...base, excluded: "negated", excludedBy: neg });
        continue;
      }
      const edu = educationalBy(clause, sentenceAt(text, c.index, c.matched.length));
      if (edu) {
        excludedHits.push({ ...base, excluded: "educational", excludedBy: edu });
        continue;
      }
      hits.push(base);
    }
  }

  // 收益率异常同样要过否定/教育语境
  for (const y of detectYieldOutliers(text)) {
    const neg = negatedBy(text, y.index);
    const edu = educationalBy(y.clause, sentenceAt(text, y.index, y.matched.length));
    if (neg) excludedHits.push({ ...y, excluded: "negated", excludedBy: neg });
    else if (edu) excludedHits.push({ ...y, excluded: "educational", excludedBy: edu });
    else hits.push(y);
  }

  hits.sort((a, b) => (a.severity === b.severity ? a.index - b.index : a.severity === "hard" ? -1 : 1));
  return { hits, excludedHits };
}

/** 检查「正规产品应有的要素」是否齐备 */
export function checkElements(rawText: string): ElementCheck[] {
  const text = normalize(rawText);
  return ELEMENTS.map((e) => {
    const evidence = e.keywords.find((k) => text.includes(k));
    return {
      id: e.id,
      label: e.label,
      present: Boolean(evidence),
      evidence,
      why: e.why,
      regulationIds: e.regulationIds,
    };
  });
}

/**
 * 按去重后的「特征类型」数量评级——同一句话说三遍不该更严重。
 * 升级点：只命中 1 类高风险特征时，若处于金融语境且完全没有风险提示语，
 * 也判为「需警惕」——正规金融宣传不可能没有风险提示。
 */
export function riskLevel(
  hits: Hit[],
  elements: ElementCheck[],
  rawText: string,
): { level: RiskLevel; hardTypes: number; highTypes: number; escalated: boolean } {
  const hardTypes = new Set(hits.filter((h) => h.severity === "hard").map((h) => h.patternId)).size;
  const highTypes = new Set(hits.filter((h) => h.severity === "high").map((h) => h.patternId)).size;

  const riskWarningMissing = elements.some((e) => e.id === "me-risk-warning" && !e.present);
  const escalated =
    hardTypes === 0 &&
    highTypes >= 1 &&
    highTypes < THRESHOLDS.highForYellow &&
    riskWarningMissing &&
    hasFinancialContext(rawText);

  const level: RiskLevel =
    hardTypes >= THRESHOLDS.hardForRed
      ? "red"
      : highTypes >= THRESHOLDS.highForYellow || escalated
        ? "yellow"
        : "green";

  return { level, hardTypes, highTypes, escalated };
}

/**
 * 语境检查的对外接口。语义识别通道复用同一套否定/科普语境判断，
 * 保证两条通道的排除标准完全一致。
 */
export function contextAt(text: string, index: number, len: number) {
  const clause = clauseAt(text, index, len);
  const sentence = sentenceAt(text, index, len);
  return {
    clause,
    negated: negatedBy(text, index),
    educational: educationalBy(clause, sentence),
    whitelisted: inWhitelistedTerm(text, index, index + len),
  };
}

/** 语义通道需要的特征分类表 */
export function patternTaxonomy() {
  return PATTERNS.map((p) => ({
    id: p.id,
    type: p.type,
    severity: p.severity,
    gist: p.plain,
    regulationIds: p.regulationIds,
    advice: p.advice,
  }));
}

/** 单元/回归测试可直接引用 */
export function analyzeText(rawText: string) {
  const { hits, excludedHits } = matchPatterns(rawText);
  const elements = checkElements(rawText);
  const { level, hardTypes, highTypes, escalated } = riskLevel(hits, elements, rawText);
  return { hits, excludedHits, elements, level, hardTypes, highTypes, escalated };
}
