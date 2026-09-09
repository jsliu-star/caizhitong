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

async function chat(
  model: string,
  messages: unknown[],
  onDelta?: (d: string) => void,
  temperature = 0.3,
): Promise<string> {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error("DASHSCOPE_API_KEY 未配置");

  const stream = Boolean(onDelta);
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, stream, temperature }),
  });

  if (!res.ok) {
    throw new Error(`模型调用失败 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  if (!stream) {
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content ?? "";
  }

  // SSE 流式解析
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
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
        const chunk = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
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
