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
  temperature = 0.3,
): Promise<string> {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error("DASHSCOPE_API_KEY 未配置");

  const stream = Boolean(onDelta);
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    // 流式时要求末尾附带 usage，否则拿不到 token 数
    body: JSON.stringify({
      model,
      messages,
      stream,
      temperature,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`模型调用失败 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

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
};
