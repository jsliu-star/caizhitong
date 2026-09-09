import type { LLMProvider } from "@/lib/llm/types";
import { mockProvider } from "@/lib/llm/providers/mock";
import { qwenProvider } from "@/lib/llm/providers/qwen";

/**
 * 模型适配层。业务代码只依赖 LLMProvider 接口，不感知具体模型。
 * 切换模型只需改环境变量，产品可按机构合规要求私有化部署。
 */
export function getProvider(): LLMProvider {
  const forced = process.env.LLM_PROVIDER;
  if (forced === "mock") return mockProvider;
  if (forced === "qwen" || process.env.DASHSCOPE_API_KEY) return qwenProvider;
  return mockProvider;
}

export type { LLMProvider };
