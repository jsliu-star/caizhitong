/**
 * 浏览器端的 SSE 客户端。首页体检、规划师问答、小通共用。
 *
 * 为什么要有它：原来三处各自复制了一份「fetch → reader → 按空行切 → JSON.parse」，
 * 而且都不能取消——关掉小通、切换页面、连点两个案例时，前一个请求还在跑，
 * 后到的旧结果可能盖掉新结果。
 *
 * 它做四件事：
 *   1. 可取消：传入 AbortSignal，调用方 abort 后静默结束（不当作错误）
 *   2. 卡住超时：连续 idleMs 没收到任何数据就断开，并报「网络不太顺」
 *   3. 读服务端的错误说明：429 / 413 等返回的是 JSON { error }，原样给用户看，而不是「请求失败（429）」
 *   4. 按 SSE 规范解析：一条事件可以有多行 data:
 *
 * 不用 AbortSignal.any：老一些的手机浏览器不支持，而目标用户里有不少长辈。
 */

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException ? e.name === "AbortError" : (e as { name?: string })?.name === "AbortError";
}

export async function streamSSE<E>(
  url: string,
  body: unknown,
  opts: { onEvent: (e: E) => void; signal?: AbortSignal; idleMs?: number },
): Promise<void> {
  const ctrl = new AbortController();
  const outer = opts.signal;
  const onOuterAbort = () => ctrl.abort();
  if (outer) {
    if (outer.aborted) throw new DOMException("Aborted", "AbortError");
    outer.addEventListener("abort", onOuterAbort, { once: true });
  }

  const idleMs = opts.idleMs ?? 30_000;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, idleMs);
  };

  try {
    arm();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!res.ok || !res.body) {
      let message = `请求失败（${res.status}）`;
      let code: string | undefined;
      try {
        const j = (await res.json()) as { error?: string; code?: string };
        if (j.error) message = j.error;
        code = j.code;
      } catch {
        /* 不是 JSON，用默认说明 */
      }
      throw new HttpError(message, res.status, code);
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      arm();
      buf += dec.decode(value, { stream: true });
      const chunks = buf.split("\n\n");
      buf = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const data = chunk
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        let ev: E;
        try {
          ev = JSON.parse(data) as E;
        } catch {
          continue; // 心跳或残片
        }
        opts.onEvent(ev);
      }
    }
  } catch (e) {
    if (timedOut) throw new Error("网络不太顺，等了很久没有回应。稍后再试一次。");
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
    outer?.removeEventListener("abort", onOuterAbort);
  }
}
