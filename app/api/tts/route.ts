import { getProvider } from "@/lib/llm";
import { checkRate, jsonError, readJsonBody, takeModelQuota } from "@/lib/server/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 小通朗读：一段文字 → WAV。
 *
 * 只把页面上已经显示、已经过审查层的文字换成声音，不生成任何新内容。
 * 失败时前端退回浏览器自带语音，所以这里挂了也不影响朗读。
 */

/** 前端按句切好再送来；单段上限防滥用 */
const MAX_CHARS = 300;

/** 同一句话（演示案例、固定话术）反复读，不重复花钱 */
const CACHE = new Map<string, Uint8Array>();
const CACHE_CAP = 300;

function audio(bytes: Uint8Array) {
  return new Response(bytes as unknown as BodyInit, {
    headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=86400" },
  });
}

export async function POST(req: Request) {
  const parsed = await readJsonBody<{ text?: unknown }>(req);
  if (!parsed.ok) return jsonError(parsed.status, parsed.message);
  const text = String(parsed.body.text ?? "").trim();
  if (!text) return jsonError(400, "没有要读的文字。");
  if (text.length > MAX_CHARS) return jsonError(413, "一次读的文字太长了。");

  const hit = CACHE.get(text);
  if (hit) return audio(hit);

  const rate = checkRate(req, "tts");
  if (!rate.ok) return jsonError(rate.status, rate.message, { code: rate.code, retryAfter: rate.retryAfter });
  const provider = getProvider();
  if (!provider.synthesize) return jsonError(503, "演示模式没有接语音合成。", { code: "NO_TTS" });
  if (!takeModelQuota()) return jsonError(503, "今天的语音额度用完了。", { code: "MODEL_QUOTA" });
  try {
    const bytes = await provider.synthesize(text);
    if (CACHE.size >= CACHE_CAP) CACHE.delete(CACHE.keys().next().value!);
    CACHE.set(text, bytes);
    return audio(bytes);
  } catch {
    return jsonError(502, "语音合成暂时连不上。", { code: "TTS_FAILED" });
  }
}
