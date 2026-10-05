/**
 * 健康检查：评审前打开看一眼，就知道线上是真实模式还是演示模式、用的哪个模型、规则库是哪一版。
 * 不返回任何密钥或用户数据。
 */
import patternsData from "@/data/violation-patterns.json";
import regulationsData from "@/data/regulations.json";
import snapshotData from "@/data/demo-snapshots.json";
import { getProvider } from "@/lib/llm";
import { LIMITS } from "@/lib/server/limits";
import { RULES_TAG } from "@/lib/server/shield-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const provider = getProvider();
  const snap = snapshotData as { generatedAt: string | null; rulesTag: string | null; entries: Record<string, unknown> };
  return Response.json(
    {
      ok: true,
      mode: provider.isMock ? "demo" : "live",
      provider: provider.name,
      rules: {
        tag: RULES_TAG,
        version: (patternsData as { version?: string }).version,
        patterns: (patternsData as { patterns: unknown[] }).patterns.length,
        regulations: (regulationsData as { items: unknown[] }).items.length,
      },
      snapshots: {
        count: Object.keys(snap.entries).length,
        generatedAt: snap.generatedAt,
        matchesRules: snap.rulesTag === RULES_TAG,
      },
      limits: { perMinute: LIMITS.perMinute, perDay: LIMITS.perDay, modelPerDay: LIMITS.modelPerDay },
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
