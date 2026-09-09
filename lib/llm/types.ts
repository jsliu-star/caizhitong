export interface VisionResult {
  text: string;
  /** 演示模式等需要向用户明示的说明 */
  note?: string;
}

export interface LLMProvider {
  /** 展示名 */
  name: string;
  /** 是否为演示模式（未配置真实模型） */
  isMock: boolean;
  /** 从图片中提取文案 */
  extractFromImage(imageDataUrl: string): Promise<VisionResult>;
  /**
   * 生成文本。onDelta 用于流式输出。
   * temperature 默认 0.3（叙述类）；分类与判定类任务应显式传 0 以保证可复现。
   */
  summarize(prompt: string, onDelta?: (delta: string) => void, temperature?: number): Promise<string>;
}
