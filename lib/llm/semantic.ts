import type { LLMProvider } from "@/lib/llm/types";
import { compliantTermIn, contextAt, normalize, patternTaxonomy } from "@/lib/rules/match";
import type { Hit } from "@/lib/types";

/**
 * 语义识别通道（第二通道）。
 *
 * 为什么需要它：规则库是照着「正规广告文案」和已知话术建的，但真实骗局大量使用
 * 口语、变体、谐音和拐弯说法——「把钱给我，我帮你炒」和「代客理财」是同一件事，
 * 关键词库永远穷举不完。
 *
 * 但语义通道不等于「让模型自由裁量」。三条硬约束：
 *   1. 只能从既有特征分类表里选，不能自创类别（因此法规引证依然成立）
 *   2. 必须给出原文中**真实存在**的引文，引文对不上直接丢弃（可验证性）
 *   3. 引文要过与规则通道**完全相同**的否定/科普语境检查
 * 模型在这里承担的是「召回」，判定标准仍然由我们定义。
 */

export interface SemanticOutcome {
  hits: Hit[];
  /** 被判定为不可采信而丢弃的项，用于向用户和评委展示我们的校验过程 */
  dropped: Array<{ patternId: string; quote: string; reason: string }>;
  note?: string;
}

interface RawItem {
  patternId?: unknown;
  quote?: unknown;
  why?: unknown;
  confidence?: unknown;
}

const CONFIDENCE_OK = new Set(["high", "medium"]);

function buildPrompt(text: string): string {
  const taxonomy = patternTaxonomy()
    .map((p) => `- ${p.id}｜${p.type}｜${p.severity === "hard" ? "监管明令禁止" : "高风险诱导"}｜${p.gist.slice(0, 70)}`)
    .join("\n");

  return `你是金融合规审查助手。下面是一段可能涉及不当金融营销的内容，请判断它命中了哪些**违规表述特征**。

【特征分类表——只能从中选择，不得自创类别】
${taxonomy}

【待审查内容】
${text.slice(0, 1800)}

【输出要求】
输出一个 JSON 数组，不要输出任何其他文字、不要用 markdown 代码块。每个元素：
{"patternId":"分类表中的id","quote":"原文中的原话片段","why":"一句话说明为什么算这一类","confidence":"high|medium|low"}

【硬性规则】
1. quote 必须是**从上面待审查内容里一字不改抄下来的片段**，长度 4–30 字。不得改写、不得拼接、不得自己造句。抄错就是无效结论。
2. 重点关注**口语化和拐弯的说法**，例如「把钱给我我帮你炒」等同于代客理财；「一定赚」「包你赚」等同于收益承诺；「亏了我赔」等同于保本承诺。
3. 如果内容是在做反诈科普、或明确使用否定表述（如"本产品不保本"），不要算作命中。
4. 没有任何命中就输出 []。
5. 不确定就用 confidence:"low"，宁可标低也不要编。`;
}

/** 从模型输出里稳健地取出 JSON 数组 */
function extractArray(raw: string): RawItem[] {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? (parsed as RawItem[]) : [];
  } catch {
    return [];
  }
}

export async function detectSemantic(
  rawText: string,
  provider: LLMProvider,
  opts?: { timeoutMs?: number; ruleHits?: Hit[] },
): Promise<SemanticOutcome> {
  if (provider.isMock) return { hits: [], dropped: [], note: "演示模式：未配置模型，语义通道跳过" };

  const text = normalize(rawText);
  const taxonomy = new Map(patternTaxonomy().map((p) => [p.id, p]));
  const timeoutMs = opts?.timeoutMs ?? 7000;

  let raw = "";
  try {
    raw = await Promise.race([
      // temperature 0：这是分类任务，必须可复现。
      // 实测 0.3 时同一输入两次会给出不同结论，现场演示不能接受。
      provider.summarize(buildPrompt(text), undefined, 0),
      new Promise<string>((r) => setTimeout(() => r(""), timeoutMs)),
    ]);
  } catch {
    return { hits: [], dropped: [], note: "语义通道调用失败，已降级为仅规则通道" };
  }
  if (!raw.trim()) return { hits: [], dropped: [], note: "语义通道超时，已降级为仅规则通道" };

  const hits: Hit[] = [];
  const dropped: SemanticOutcome["dropped"] = [];
  const ruleSpans = (opts?.ruleHits ?? []).map((h) => [h.patternId, h.index, h.index + h.matched.length] as const);

  for (const item of extractArray(raw)) {
    const patternId = typeof item.patternId === "string" ? item.patternId : "";
    const quote = typeof item.quote === "string" ? item.quote.trim() : "";
    const why = typeof item.why === "string" ? item.why.trim() : "";
    const confidence = typeof item.confidence === "string" ? item.confidence.toLowerCase() : "";
    const label = quote || "(空)";

    const pattern = taxonomy.get(patternId);
    if (!pattern) {
      dropped.push({ patternId: patternId || "(未知)", quote: label, reason: "不在特征分类表中" });
      continue;
    }
    if (!CONFIDENCE_OK.has(confidence)) {
      dropped.push({ patternId, quote: label, reason: "模型自评置信度不足" });
      continue;
    }
    // 硬性违规（会直接把结论推到「高风险」）只接受高置信度。
    // 语义通道的价值是召回，但不该让一次低置信度猜测决定最终等级。
    if (pattern.severity === "hard" && confidence !== "high") {
      dropped.push({ patternId, quote: label, reason: "硬性违规需高置信度，本条为 medium" });
      continue;
    }
    if (quote.length < 2) {
      dropped.push({ patternId, quote: label, reason: "引文过短，无法核对" });
      continue;
    }

    // 核心校验：引文必须真实存在于原文
    const index = text.indexOf(quote);
    if (index === -1) {
      dropped.push({ patternId, quote: label, reason: "引文在原文中不存在（疑似模型改写或臆造）" });
      continue;
    }

    // 与规则通道完全一致的语境检查
    const ctx = contextAt(text, index, quote.length);
    if (ctx.negated) {
      dropped.push({ patternId, quote: label, reason: `处于否定语境「${ctx.negated}」` });
      continue;
    }
    if (ctx.educational) {
      dropped.push({ patternId, quote: label, reason: `处于科普语境「${ctx.educational}」` });
      continue;
    }
    /**
     * 合规术语：与规则通道同一份白名单（violation-patterns.json → termWhitelist）。
     * 实测模型会把正规产品页的「业绩比较基准：年化2.80%—3.20%」标成「收益承诺」——
     * 而业绩比较基准恰恰是监管要求的合规写法，正规产品页因此被误判为高风险。
     */
    const term = compliantTermIn(quote);
    if (term) {
      dropped.push({ patternId, quote: label, reason: `引文包含合规术语「${term}」` });
      continue;
    }

    /**
     * 与规则通道的分工：规则是高精度通道，它已经解释过的文本片段，语义通道不再插话。
     * 语义通道的职责是覆盖规则**没碰到**的地方。
     *
     * 这条规则同时消除了一类不稳定：实测模型偶发会把「保本保息」标成「混淆存款与理财」——
     * 而该片段规则通道已以「保本承诺」正确解释过。只比对同一 patternId 会漏掉这种错标。
     */
    const overlap = ruleSpans.find(([, s, e]) => index < e && index + quote.length > s);
    if (overlap) {
      dropped.push({
        patternId,
        quote: label,
        reason: overlap[0] === patternId ? "规则通道已覆盖，不重复计入" : "该片段已由规则通道以其他特征解释",
      });
      continue;
    }
    if (hits.some((h) => h.patternId === patternId && h.matched === quote)) continue;

    hits.push({
      source: "semantic",
      patternId,
      type: pattern.type,
      severity: pattern.severity,
      matched: quote,
      index,
      clause: ctx.clause,
      why,
      regulationIds: pattern.regulationIds,
      plain: pattern.gist,
      advice: pattern.advice,
    });
  }

  return { hits, dropped };
}
