/**
 * P0 基础设施测试：限流、请求大小与格式、缓存、演示快照、SSE 客户端。
 * 全部在演示模式下跑（不调用模型、不花钱），结果确定。
 */
process.env.LLM_PROVIDER = "mock";
process.env.SHIELD_NO_BEAT = "1";

let fail = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (!cond) fail += 1;
  console.log(`  ${cond ? "✅" : "❌"} ${name}${cond ? "" : `  ${detail}`}`);
};

async function main() {
  const { checkRate, LIMITS, __resetLimits } = await import("@/lib/server/limits");
  const { LRU } = await import("@/lib/server/cache");
  const { POST } = await import("@/app/api/shield/route");
  const { streamSSE, HttpError, isAbort } = await import("@/lib/sse");
  const samples = (await import("@/data/samples.json")).default.samples as Array<{ id: string; image?: string; text: string }>;

  const req = (body: unknown, ip = "1.1.1.1", raw?: string) =>
    new Request("http://local/api/shield", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: raw ?? JSON.stringify(body),
    });

  console.log("\n=== 限流 ===");
  __resetLimits();
  const r = new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9" } });
  let blockedAt = -1;
  for (let i = 1; i <= LIMITS.perMinute + 1; i += 1) if (!checkRate(r, "t").ok && blockedAt < 0) blockedAt = i;
  ok(`同一 IP 第 ${LIMITS.perMinute + 1} 次被拦`, blockedAt === LIMITS.perMinute + 1, `实际第 ${blockedAt} 次`);
  ok("不同接口各自计数", checkRate(r, "other").ok);
  ok("不同 IP 互不影响", checkRate(new Request("http://x", { headers: { "x-forwarded-for": "8.8.8.8" } }), "t").ok);
  const rl = checkRate(r, "t");
  ok("被拦时给出中文说明和重试时间", !rl.ok && rl.message.includes("秒后再试") && (rl.retryAfter ?? 0) > 0);

  console.log("\n=== 请求大小与格式 ===");
  __resetLimits();
  const big = await POST(req(null, "2.2.2.2", JSON.stringify({ kind: "text", text: "x".repeat(LIMITS.bodyBytes + 10) })));
  ok("超大请求体 → 413", big.status === 413, String(big.status));
  const longText = await POST(req({ kind: "text", text: "保本".repeat(LIMITS.textChars) }, "2.2.2.3"));
  ok("超长文字 → 413 且说明字数上限", longText.status === 413 && (await longText.json()).error.includes(String(LIMITS.textChars)));
  const badImg = await POST(req({ kind: "image", imageDataUrl: "data:text/html;base64,PGh0bWw+" }, "2.2.2.4"));
  ok("非图片格式 → 400", badImg.status === 400, String(badImg.status));
  const badJson = await POST(req(null, "2.2.2.5", "{not json"));
  ok("坏 JSON → 400", badJson.status === 400);

  console.log("\n=== 缓存 ===");
  const lru = new LRU<number>(2);
  lru.set("a", 1);
  lru.set("b", 2);
  lru.get("a");
  lru.set("c", 3);
  ok("LRU 满了淘汰最久没用的", lru.get("b") === undefined && lru.get("a") === 1 && lru.get("c") === 3);

  console.log("\n=== 演示快照 ===");
  const snap = (await import("@/data/demo-snapshots.json")).default as { generatedAt: string | null; entries: Record<string, unknown> };
  if (snap.generatedAt && Object.keys(snap.entries).length) {
    const green = samples.find((s) => s.id === "sample-green-legit")!;
    const res = await POST(req({ kind: "image", imageDataUrl: "data:image/png;base64,AAAA", sampleId: green.image, mode: "risk" }, "3.3.3.3"));
    const report = (await res.text())
      .split("\n\n")
      .map((c) => c.trim())
      .filter((c) => c.startsWith("data:"))
      .map((c) => JSON.parse(c.slice(5).trim()))
      .find((e) => e.stage === "report")?.report;
    ok("演示图片按 sampleId 命中快照", report?.cache?.source === "snapshot");
    ok("正规产品页快照为 green", report?.verdict?.level === "green", report?.verdict?.level);
    const bogus = await POST(req({ kind: "image", imageDataUrl: "data:image/png;base64,AAAA", sampleId: "/../../etc/passwd", mode: "risk" }, "3.3.3.4"));
    const bogusReport = (await bogus.text()).includes('"source":"snapshot"');
    ok("非法 sampleId 被忽略，不命中快照", !bogusReport);
  } else {
    console.log("  ⚠️ 尚未生成快照，跳过");
  }

  console.log("\n=== SSE 客户端 ===");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(new TextEncoder().encode('data: {"a":1}\n\n: 心跳\n\ndata: {"a":\ndata: 2}\n\ndata: {"a":3}\n\n'), {
      headers: { "Content-Type": "text/event-stream" },
    })) as typeof fetch;
  const got: number[] = [];
  await streamSSE<{ a: number }>("/x", {}, { onEvent: (e) => got.push(e.a) });
  ok("按规范解析：多行 data 合并、跳过心跳", got.join(",") === "1,2,3", got.join(","));

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "操作太快了，请 30 秒后再试。", code: "RATE_LIMITED" }), { status: 429 })) as typeof fetch;
  try {
    await streamSSE("/x", {}, { onEvent: () => {} });
    ok("429 抛出带中文说明的错误", false, "没有抛错");
  } catch (e) {
    ok("429 抛出带中文说明的错误", e instanceof HttpError && e.status === 429 && e.message.includes("秒后再试"));
  }

  globalThis.fetch = ((_: unknown, init?: RequestInit) =>
    new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))) as typeof fetch;
  const ctrl = new AbortController();
  const p = streamSSE("/x", {}, { onEvent: () => {}, signal: ctrl.signal });
  ctrl.abort();
  try {
    await p;
    ok("取消后以 AbortError 结束", false);
  } catch (e) {
    ok("取消后以 AbortError 结束", isAbort(e));
  }

  const p2 = streamSSE("/x", {}, { onEvent: () => {}, idleMs: 50 });
  try {
    await p2;
    ok("卡住超时给出可读的说明", false);
  } catch (e) {
    ok("卡住超时给出可读的说明", e instanceof Error && e.message.includes("网络不太顺"));
  }
  globalThis.fetch = realFetch;

  console.log(fail ? `\n=== ${fail} 项失败 ===` : "\n=== 全部通过 ===");
  process.exit(fail ? 1 : 0);
}
main();
