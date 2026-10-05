/**
 * 演示快照是否与当前规则库匹配。
 * 规则库或法规库一改，快照的 key 就对不上，线上会退回实时计算——演示结论不再固定。
 * 这里提前拦下来，提醒重新生成：npm run snapshots
 */
import snap from "@/data/demo-snapshots.json";
import { RULES_TAG } from "@/lib/server/shield-key";

const s = snap as { generatedAt: string | null; rulesTag: string | null; entries: Record<string, unknown[]> };
const n = Object.keys(s.entries).length;
if (!s.generatedAt || n === 0) {
  console.log("\n=== 演示快照 ===\n  ⚠️ 还没有生成快照（npm run snapshots）。线上演示案例会实时计算。");
  process.exit(0);
}
if (s.rulesTag !== RULES_TAG) {
  console.log(`\n=== 演示快照 ===\n  ❌ 快照基于旧规则库（${s.rulesTag}），当前是 ${RULES_TAG}。请运行 npm run snapshots 重新生成。`);
  process.exit(1);
}
console.log(`\n=== 演示快照 ===\n  ✅ ${n} 个案例，生成于 ${s.generatedAt}，与当前规则库一致`);
