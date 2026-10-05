/**
 * 体检结果的缓存 key。路由与快照生成脚本共用，保证两边算出来的 key 一致。
 */
import patternsData from "@/data/violation-patterns.json";
import regulationsData from "@/data/regulations.json";
import { cacheKey } from "@/lib/server/cache";
import type { CheckMode } from "@/lib/types";

/** 规则库内容指纹：规则或法规库一改，缓存与快照的 key 全部变化，旧结果自动失效 */
export const RULES_TAG = cacheKey(patternsData, regulationsData).slice(0, 12);

/** 演示图片按样本 id（同一张图在不同浏览器压缩出的数据不同），其余按内容 */
export function shieldKey(
  body: { kind?: string; text?: string; imageDataUrl?: string; sampleId?: string },
  mode: CheckMode,
): string {
  if (body.sampleId) return `sample:${RULES_TAG}:${body.sampleId}:${mode}`;
  return cacheKey("shield", RULES_TAG, mode, body.kind === "image" ? body.imageDataUrl : (body.text ?? "").trim());
}
