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
  /**
   * 语音转文字（小通语音提问）。入参为 data:audio/wav;base64,...
   * 可选：演示模式没有语音识别，调用方应提示用户改为打字。
   */
  transcribe?(audioDataUrl: string): Promise<string>;
  /**
   * 文字转语音（小通朗读）。返回 WAV 字节。
   * 可选：没有时前端退回浏览器自带语音。朗读的只会是页面上已显示、已过审查层的文字。
   */
  synthesize?(text: string): Promise<Uint8Array>;
}
