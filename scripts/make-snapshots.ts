/**
 * 生成演示案例的固定结果（data/demo-snapshots.json）。
 *
 * 为什么：同一个演示案例，评委多点几次必须看到同一个结论。这里用**真实流水线**（与线上同一份路由代码）
 * 把首页的每个案例跑一遍，把事件序列原样存下来；线上命中后按原节奏重放，并在报告里注明生成时间。
 *
 * 规则：
 *   - 只收「完整、未降级」的结果：语义通道或模型转述超时的，重试，最多 3 次
 *   - 规则库或法规库一改，RULES_TAG 变化，旧快照自动失效；npm test 会提醒重新生成
 *
 * 用法：npm run snapshots（需要 .env.local 里的 DASHSCOPE_API_KEY）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAP_FILE = path.join(ROOT, "data/demo-snapshots.json");

for (const line of fs.existsSync(path.join(ROOT, ".env.local")) ? fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n") : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
process.env.SHIELD_NO_BEAT = "1";

// 先清空，免得路由读到旧快照直接重放
const prev = JSON.parse(fs.readFileSync(SNAP_FILE, "utf8"));
fs.writeFileSync(SNAP_FILE, JSON.stringify({ ...prev, generatedAt: null, rulesTag: null, entries: {} }, null, 1));

/** 与 app/page.tsx 的 CLAUSE_SAMPLE 保持一致 */
const CLAUSE_SAMPLE =
  "本产品为非保本浮动收益型理财产品，风险等级R3（中风险），业绩比较基准为年化2.90%—3.50%，投资周期为封闭期540天，封闭期内不可提前赎回。管理费0.60%/年，托管费0.05%/年，销售服务费0.20%/年。起购金额10000元。本产品不保证本金安全，可能因市场波动产生本金损失。过往业绩不代表未来表现。";

async function main() {
  const { POST } = await import("@/app/api/shield/route");
  const { shieldKey, RULES_TAG } = await import("@/lib/server/shield-key");
  const { getProvider } = await import("@/lib/llm");
  if (getProvider().isMock) throw new Error("需要 DASHSCOPE_API_KEY：快照必须来自真实模型");
  const samples = JSON.parse(fs.readFileSync(path.join(ROOT, "data/samples.json"), "utf8")).samples as Array<{
    id: string;
    text: string;
    image?: string;
  }>;

  type Job = { name: string; body: Record<string, unknown>; mode: "risk" | "translate" };
  const jobs: Job[] = [];
  for (const s of samples) {
    if (s.image) {
      const buf = fs.readFileSync(path.join(ROOT, "public", s.image));
      jobs.push({ name: `${s.id}·图片`, mode: "risk", body: { kind: "image", imageDataUrl: `data:image/png;base64,${buf.toString("base64")}`, sampleId: s.image } });
    }
    jobs.push({ name: `${s.id}·文字`, mode: "risk", body: { kind: "text", text: s.text } });
  }
  jobs.push({ name: "clause·只翻译", mode: "translate", body: { kind: "text", text: CLAUSE_SAMPLE } });

  const entries: Record<string, unknown[]> = {};
  for (const j of jobs) {
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt += 1) {
      const res = await POST(
        new Request("http://local/api/shield", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": `snapshot-${attempt}` },
          body: JSON.stringify({ ...j.body, mode: j.mode }),
        }),
      );
      const events = (await res.text())
        .split("\n\n")
        .map((c) => c.trim())
        .filter((c) => c.startsWith("data:"))
        .map((c) => JSON.parse(c.slice(5).trim()));
      const report = events.find((e) => e.stage === "report")?.report;
      const degraded = !report || report.semanticNote || (j.mode === "risk" && report.verdict.level !== "green" && report.demoMode) || (j.mode === "translate" && !report.plainText);
      if (degraded) {
        console.log(`  ↻ ${j.name} 第 ${attempt} 次结果不完整，重试`);
        continue;
      }
      // 图片样本按 sampleId 存；文字样本按内容存（用户手动粘贴同一段文字也能命中）
      const key = shieldKey(j.body as never, j.mode);
      entries[key] = events;
      ok = true;
      console.log(`  ✓ ${j.name}  →  ${j.mode === "risk" ? report.verdict.level : "人话版"}${report.genre?.kind === "report" ? "（讲骗局）" : ""}`);
    }
    if (!ok) console.log(`  ✗ ${j.name} 3 次都不完整，未写入快照（线上会实时计算）`);
  }

  fs.writeFileSync(
    SNAP_FILE,
    JSON.stringify({ _note: prev._note, generatedAt: new Date().toISOString(), rulesTag: RULES_TAG, entries }, null, 1),
  );
  console.log(`\n✓ ${Object.keys(entries).length}/${jobs.length} 个案例写入 data/demo-snapshots.json（rulesTag ${RULES_TAG}）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
