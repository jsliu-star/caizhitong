import { getProvider } from "@/lib/llm";
import { checkRate, jsonError, readJsonBody, takeModelQuota } from "@/lib/server/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 小通语音提问：一段 WAV → 文字。
 *
 * 只做转写，不做任何判断：转出来的文字回到前端，和打字提问走完全相同的路径
 * （本地规则 → 规划师接口 → 输出审查层）。所以加语音不会绕开任何一道防线。
 * 音频不落盘、不留存。
 */

/** 30 秒 16kHz 单声道 16bit 约 0.96MB，base64 后约 1.3MB；留余量 */
const MAX_AUDIO_CHARS = 2_000_000;
const PREFIX = "data:audio/wav;base64,";

export async function POST(req: Request) {
  const rate = checkRate(req, "asr");
  if (!rate.ok) return jsonError(rate.status, rate.message, { code: rate.code, retryAfter: rate.retryAfter });
  const parsed = await readJsonBody<{ audio?: unknown }>(req);
  if (!parsed.ok) return jsonError(parsed.status, parsed.message);
  const audio = String(parsed.body.audio ?? "");
  if (!audio.startsWith(PREFIX) || audio.length < PREFIX.length + 1000) return jsonError(400, "没收到有效的录音，再试一次？");
  if (audio.length > MAX_AUDIO_CHARS) return jsonError(413, "说得太长了，一次说一个问题就好（30 秒以内）。");

  const provider = getProvider();
  if (!provider.transcribe) {
    return jsonError(503, "现在是演示模式，没有接语音识别。可以直接打字问我。", { code: "NO_ASR" });
  }
  if (!takeModelQuota()) {
    return jsonError(503, "今天的语音识别额度用完了。可以直接打字问我。", { code: "MODEL_QUOTA" });
  }
  try {
    const text = (await provider.transcribe(audio)).slice(0, 500);
    if (!text) return jsonError(422, "没听清，再说一遍？也可以直接打字。", { code: "EMPTY" });
    return Response.json({ text });
  } catch {
    return jsonError(502, "语音识别暂时连不上。可以直接打字问我。", { code: "ASR_FAILED" });
  }
}
