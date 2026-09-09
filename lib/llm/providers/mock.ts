import samplesData from "@/data/samples.json";
import type { LLMProvider, VisionResult } from "@/lib/llm/types";

const SAMPLES = samplesData.samples as Array<{ id: string; label: string; text: string }>;

/**
 * 演示模式 provider。
 * 未配置任何模型 API Key 时使用，保证产品在任何环境下都能完整演示一遍。
 * 关键设计：summarize 返回空串，由上层退回到 buildVerdict 的模板总结——
 * 也就是说演示模式下的报告内容仍然由真实的规则分析驱动，不是写死的假文案。
 */
export const mockProvider: LLMProvider = {
  name: "演示模式（未配置模型）",
  isMock: true,

  async extractFromImage(): Promise<VisionResult> {
    await new Promise((r) => setTimeout(r, 600));
    return {
      text: SAMPLES[0].text,
      note: "当前为演示模式：未配置模型 API Key，无法真实识别图片内容，此处使用内置仿真样本文本进行演示。配置 DASHSCOPE_API_KEY 后即可识别任意上传图片。",
    };
  },

  async summarize(_prompt: string, _onDelta?: (d: string) => void, _temperature?: number): Promise<string> {
    // 交由模板总结兜底
    return "";
  },
};

export const DEMO_SAMPLES = SAMPLES;
