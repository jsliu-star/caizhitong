import { getProvider } from "@/lib/llm";
import { LIMITS, checkRate, jsonError, readJsonBody, takeModelQuota } from "@/lib/server/limits";
import { findKeyPoints, findTerms } from "@/lib/rules/glossary";
import { dropRedacted, guardOutput } from "@/lib/rules/guard";
import { redact } from "@/lib/rules/redact";
import { DISCLAIMER } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROMPT = (text: string, terms: string[]) => `你是一个金融科普助手，正在帮一位完全没有金融知识的普通人读懂一段金融文字（可能是基金合同条款、理财产品说明书或财经新闻）。

【原文】
${text.slice(0, 2000)}

${terms.length ? `【原文中出现的术语，已由词典给出解释，你不必重复解释】\n${terms.join("、")}\n` : ""}
【你的任务】
用 3 到 5 句大白话，说清「这段话到底在讲什么」。要求：
1. 只转述和解释原文内容，不要评价这个产品好不好、值不值得买
2. 不要推荐或暗示购买任何产品，不要预测涨跌，不要说任何东西"安全""可靠"
3. 不要用专业术语，把长句拆短
4. 直接输出正文，不要标题、不要列表、不要 markdown 符号`;

export async function POST(req: Request) {
  const rate = checkRate(req, "translate");
  if (!rate.ok) return jsonError(rate.status, rate.message, { code: rate.code, retryAfter: rate.retryAfter });
  const parsed = await readJsonBody<{ text?: unknown }>(req);
  if (!parsed.ok) return jsonError(parsed.status, parsed.message);
  const text = String(parsed.body.text ?? "").trim();
  if (text.length < 4) return jsonError(400, "内容太短");
  if (text.length > LIMITS.textChars) return jsonError(413, `文字太长了，请控制在 ${LIMITS.textChars} 字以内。`);

  const { text: safe, count: redactedCount } = redact(text);
  const terms = findTerms(safe);
  const keyPoints = findKeyPoints(safe);

  const provider = getProvider();
  let plain = "";
  let demoMode = provider.isMock;

  if (!provider.isMock && takeModelQuota()) {
    try {
      const raw = await provider.summarize(PROMPT(safe, terms.map((t) => t.term)));
      const g = guardOutput(raw.trim(), { sourceText: safe });
      const shown = dropRedacted(g.text).text;
      if (!g.shouldFallback && shown.length >= 20) plain = shown;
      else demoMode = true;
    } catch {
      demoMode = true;
    }
  }

  return Response.json({
    text: safe,
    redactedCount,
    plain,
    terms,
    keyPoints,
    demoMode,
    disclaimer: DISCLAIMER,
  });
}
