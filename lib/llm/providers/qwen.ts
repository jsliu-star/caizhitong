import type { LLMProvider, VisionResult } from "@/lib/llm/types";

/**
 * 阿里云百炼（DashScope）OpenAI 兼容端点。
 *
 * ⚠️ 待验证：endpoint、模型名与多模态入参格式以官方文档为准。
 * 全部通过环境变量可覆盖，拿到 key 后无需改代码即可校准：
 *   DASHSCOPE_API_KEY      必填
 *   DASHSCOPE_BASE_URL     默认 https://dashscope.aliyuncs.com/compatible-mode/v1
 *   QWEN_VISION_MODEL      默认 qwen-vl-max
 *   QWEN_TEXT_MODEL        默认 qwen-plus
 */
const BASE_URL = process.env.DASHSCOPE_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
/**
 * 默认选型经实测（同一张演示图）：
 *   qwen-vl-plus  1.7s / 关键信息零缺失   ← 采用
 *   qwen-vl-max   3.7s / 同等质量
 *   qwen-flash    1.9s / 转述质量足够     ← 采用
 *   qwen-plus     4.4s / 更佳文采，但更易自行补充未经核实的数字
 * 现场演示的响应速度比文采更重要；质量由规则层保证，不依赖模型能力。
 */
const VISION_MODEL = process.env.QWEN_VISION_MODEL ?? "qwen-vl-plus";
const TEXT_MODEL = process.env.QWEN_TEXT_MODEL ?? "qwen-flash";
/** 语音识别：qwen3-asr-flash，实测 5 秒中文语音约 1.1 秒返回，数字自动转成阿拉伯数字（10/17） */
const ASR_MODEL = process.env.QWEN_ASR_MODEL ?? "qwen3-asr-flash";
const ASR_TIMEOUT_MS = Number(process.env.ASR_TIMEOUT_MS ?? 8000);
/** 小通的声音。音色是产品形象的一部分，可用环境变量换 */
const TTS_MODEL = process.env.QWEN_TTS_MODEL ?? "qwen3-tts-flash";
const TTS_VOICE = process.env.QWEN_TTS_VOICE ?? "Cherry";
const TTS_TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS ?? 6000);
/** 语音合成走 DashScope 原生接口（兼容模式没有它） */
const NATIVE_BASE = BASE_URL.replace(/\/compatible-mode\/v1\/?$/, "/api/v1");
/** 单次模型请求的硬超时（毫秒） */
const REQUEST_TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS ?? 20000);

const OCR_PROMPT = `请把这张图片里的所有文字**原样**提取出来，包括标题、正文、角标、小字、水印、二维码旁边的说明文字。
要求：
1. 严格照抄，不要改写、不要总结、不要翻译、不要补充任何解释
2. 保留原有的换行和分段
3. 如果有联系方式、公司名称、编号，务必完整保留
4. 除了图片里的文字，不要输出任何其他内容`;

/**
 * 调用记录：每次模型调用的模型名、token 用量与耗时。
 * 只追加、不影响返回值；供复赛评测脚本统计实际费用与延迟（复赛工作区/评测/）。
 * 线上进程里它会一直增长，所以设了上限，超出后丢弃最旧的记录。
 */
export interface UsageRecord {
  model: string;
  promptTokens: number;
  completionTokens: number;
  ms: number;
  stream: boolean;
}
const USAGE: UsageRecord[] = [];
const USAGE_CAP = 2000;
function record(r: UsageRecord) {
  USAGE.push(r);
  if (USAGE.length > USAGE_CAP) USAGE.splice(0, USAGE.length - USAGE_CAP);
}
/** 取走并清空当前累计的调用记录 */
export function drainUsage(): UsageRecord[] {
  return USAGE.splice(0, USAGE.length);
}

type Usage = { prompt_tokens?: number; completion_tokens?: number };

async function chat(
  model: string,
  messages: unknown[],
  onDelta?: (d: string) => void,
  temperature: number | undefined = 0.3,
  /** 附加到请求体的模型专属参数（如语音识别的 asr_options） */
  extra?: Record<string, unknown>,
): Promise<string> {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error("DASHSCOPE_API_KEY 未配置");

  const stream = Boolean(onDelta);
  const t0 = Date.now();
  // 请求级硬超时 + 一次重试。
  // 为什么：复赛评测中网络卡住时，没有超时的截图识别一次等了 242 秒；也遇到过 TLS 握手中途被重置。
  // 只重试网络错误与 5xx / 429；key 无效等 4xx 不重试（重试也没用）。
  let res: Response | undefined;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2 && !res; attempt += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const r = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        // 流式时要求末尾附带 usage，否则拿不到 token 数
        body: JSON.stringify({
          model,
          messages,
          stream,
          temperature,
          ...(stream ? { stream_options: { include_usage: true } } : {}),
          ...extra,
        }),
        signal: ctrl.signal,
      });
      if (r.ok) {
        res = r;
      } else if ((r.status >= 500 || r.status === 429) && attempt === 0) {
        lastErr = new Error(`模型调用失败 ${r.status}`);
        await new Promise((ok) => setTimeout(ok, 400));
      } else {
        throw new Error(`模型调用失败 ${r.status}: ${(await r.text()).slice(0, 300)}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("模型调用失败")) throw e;
      lastErr = ctrl.signal.aborted ? new Error(`模型调用超时（${REQUEST_TIMEOUT_MS / 1000} 秒）`) : e;
      if (attempt === 0) await new Promise((ok) => setTimeout(ok, 400));
    } finally {
      clearTimeout(timer);
    }
  }
  if (!res) throw lastErr instanceof Error ? lastErr : new Error("模型调用失败");

  if (!stream) {
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: Usage };
    record({
      model,
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      ms: Date.now() - t0,
      stream: false,
    });
    return json.choices?.[0]?.message?.content ?? "";
  }

  // SSE 流式解析
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let usage: Usage | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }>; usage?: Usage };
        if (chunk.usage) usage = chunk.usage;
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onDelta?.(delta);
        }
      } catch {
        // 忽略非 JSON 心跳行
      }
    }
  }
  record({
    model,
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    ms: Date.now() - t0,
    stream: true,
  });
  return full;
}

export const qwenProvider: LLMProvider = {
  name: `通义千问（${VISION_MODEL} / ${TEXT_MODEL}）`,
  isMock: false,

  async extractFromImage(imageDataUrl: string): Promise<VisionResult> {
    const text = await chat(VISION_MODEL, [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageDataUrl } },
          { type: "text", text: OCR_PROMPT },
        ],
      },
    ]);
    return { text: text.trim() };
  },

  async summarize(prompt: string, onDelta?: (d: string) => void, temperature?: number): Promise<string> {
    return chat(TEXT_MODEL, [{ role: "user", content: prompt }], onDelta, temperature);
  },

  async transcribe(audioDataUrl: string): Promise<string> {
    // 语音是对话，等不起：8 秒没回来就让用户改打字，不走 20 秒 × 2 次的通用超时
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, no) => {
      timer = setTimeout(() => no(new Error("语音识别超时")), ASR_TIMEOUT_MS);
    });
    try {
      const text = await Promise.race([
        chat(
          ASR_MODEL,
          [{ role: "user", content: [{ type: "input_audio", input_audio: { data: audioDataUrl } }] }],
          undefined,
          undefined,
          { asr_options: { language: "zh", enable_itn: true } },
        ),
        timeout,
      ]);
      return text.trim();
    } finally {
      clearTimeout(timer);
    }
  },

  async synthesize(text: string): Promise<Uint8Array> {
    const key = process.env.DASHSCOPE_API_KEY;
    if (!key) throw new Error("未配置 DASHSCOPE_API_KEY");
    // 朗读也等不起：超时就让前端改用浏览器自带语音
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TTS_TIMEOUT_MS);
    try {
      const r = await fetch(`${NATIVE_BASE}/services/aigc/multimodal-generation/generation`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: TTS_MODEL, input: { text, voice: TTS_VOICE } }),
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error(`语音合成 ${r.status}`);
      const json = (await r.json()) as { output?: { audio?: { url?: string } } };
      const url = json.output?.audio?.url;
      if (!url) throw new Error("语音合成没有返回音频");
      const a = await fetch(url, { signal: ctrl.signal });
      if (!a.ok) throw new Error(`音频下载 ${a.status}`);
      return new Uint8Array(await a.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  },
};
