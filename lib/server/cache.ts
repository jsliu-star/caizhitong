/**
 * 结果缓存：同一段输入，给出同一个结论。
 *
 * 为什么需要：语义通道已经用 temperature 0，但模型输出仍会偶发波动——
 * 复赛评测里，同一份正规产品页曾一次判 red、一次判 green。
 * 评委反复点同一个案例看到两个结论，比没有 demo 更伤信任。
 *
 * 两层：
 *   1. 快照：仓库里的 data/demo-snapshots.json，演示样本的结果预先用真实流水线生成并固定，
 *      所有实例一致。报告上会注明生成时间。
 *   2. 内存 LRU：其余输入，第二次起直接返回第一次的结果。只在单个实例内有效（局限同 limits.ts）。
 *
 * 只缓存「完整、未降级」的结果：语义通道超时、模型转述超时的不缓存，免得把一次网络抖动固定下来。
 */
import { createHash } from "node:crypto";

export function cacheKey(...parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

export class LRU<V> {
  private map = new Map<string, { v: V; at: number }>();
  constructor(
    private max = 300,
    private ttlMs = 24 * 3600_000,
  ) {}
  get(k: string): V | undefined {
    const e = this.map.get(k);
    if (!e) return undefined;
    if (Date.now() - e.at > this.ttlMs) {
      this.map.delete(k);
      return undefined;
    }
    this.map.delete(k);
    this.map.set(k, e); // 刷新为最近使用
    return e.v;
  }
  set(k: string, v: V) {
    this.map.delete(k);
    this.map.set(k, { v, at: Date.now() });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string);
  }
  clear() {
    this.map.clear();
  }
  get size() {
    return this.map.size;
  }
}
