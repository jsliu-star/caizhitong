import scamData from "@/data/scam-cases.json";
import type { Hit } from "@/lib/types";

/**
 * 骗局剧本匹配。
 *
 * 这是产品里最有实际价值的一块：不只告诉用户「这有问题」，
 * 而是告诉他「按这个套路，接下来对方会怎么做」。
 * 提前把剧本摊开，比任何警告都有效——因为用户可以自己验证我们说的对不对。
 *
 * 匹配是确定性的：按命中特征与图鉴卡片的特征交集打分，不经过模型。
 */

export interface ScamCase {
  id: string;
  name: string;
  icon: string;
  oneLine: string;
  hook: string;
  patternIds: string[];
  mechanism: string;
  playbook: string[];
  targets: string[];
  cases: Array<{ summary: string; source: string; url: string }>;
}

export const SCAM_CASES = scamData.cases as ScamCase[];

export interface PlaybookMatch {
  case: ScamCase;
  /** 0–1 吻合度 */
  score: number;
  /** 命中的共同特征类型名 */
  shared: string[];
}

export function matchPlaybook(hits: Hit[], limit = 2): PlaybookMatch[] {
  if (hits.length === 0) return [];
  const hitIds = new Set(hits.map((h) => h.patternId));
  const typeOf = new Map(hits.map((h) => [h.patternId, h.type]));

  const scored = SCAM_CASES.map((c) => {
    const shared = c.patternIds.filter((p) => hitIds.has(p));
    if (shared.length === 0) return null;
    // 吻合度 = 共同特征占该骗局特征的比例（主要）+ 共同特征数的绝对量（次要）
    const coverage = shared.length / c.patternIds.length;
    const volume = Math.min(1, shared.length / 3);
    return {
      case: c,
      score: coverage * 0.65 + volume * 0.35,
      shared: shared.map((p) => typeOf.get(p) ?? p),
    } satisfies PlaybookMatch;
  }).filter((x): x is PlaybookMatch => x !== null);

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
