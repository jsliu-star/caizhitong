/**
 * 接口防刷：按 IP 限流 + 全局每日模型调用上限 + 请求体大小限制。
 *
 * 为什么需要：/api/shield 与 /api/plan/chat 是公开接口，每次调用都花真钱。
 * 评审期间页面公开，有人连点或脚本刷几下，key 的额度就可能被打光，
 * 之后所有人看到的都是演示模式。
 *
 * 局限（如实说明）：计数存在进程内存里。Vercel 等无服务器平台会同时起多个实例，
 * 计数只在单个实例内有效，不是全局的；单机部署（本地部署包 / 云服务器）是全局的。
 * 对评审场景（几十人同时用）已经够用；真上线应换 Redis 一类的共享存储。
 *
 * 所有阈值都可以用环境变量覆盖。
 */

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const LIMITS = {
  /** 单个 IP 每分钟请求数。评审现场多人常共用一个出口 IP（校园网），所以不能太紧 */
  perMinute: num(process.env.RATE_PER_MINUTE, 30),
  /** 单个 IP 每天请求数 */
  perDay: num(process.env.RATE_PER_DAY, 600),
  /** 本实例每天最多发起的「用到模型」的请求数，保护 key 额度 */
  modelPerDay: num(process.env.MODEL_CALLS_PER_DAY, 5000),
  /** 请求体上限（字节）。图片在前端已压到 1600px JPEG，正常远小于这个值 */
  bodyBytes: num(process.env.MAX_BODY_BYTES, 6 * 1024 * 1024),
  /** 文本输入上限（字符） */
  textChars: num(process.env.MAX_TEXT_CHARS, 5000),
};

interface Bucket {
  minute: number;
  minuteCount: number;
  day: string;
  dayCount: number;
}
const BUCKETS = new Map<string, Bucket>();
let modelDay = "";
let modelCount = 0;

const today = () => new Date().toISOString().slice(0, 10);

export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "local"
  );
}

export type LimitResult = { ok: true } | { ok: false; status: number; code: string; message: string; retryAfter?: number };

/** 按 IP 限流。scope 区分不同接口，互不占用额度 */
export function checkRate(req: Request, scope: string): LimitResult {
  const key = `${scope}:${clientIp(req)}`;
  const now = Date.now();
  const minute = Math.floor(now / 60_000);
  const day = today();
  const b = BUCKETS.get(key) ?? { minute, minuteCount: 0, day, dayCount: 0 };
  if (b.minute !== minute) {
    b.minute = minute;
    b.minuteCount = 0;
  }
  if (b.day !== day) {
    b.day = day;
    b.dayCount = 0;
  }
  if (b.minuteCount >= LIMITS.perMinute) {
    const retryAfter = 60 - Math.floor((now % 60_000) / 1000);
    return { ok: false, status: 429, code: "RATE_LIMITED", message: `操作太快了，请 ${retryAfter} 秒后再试。`, retryAfter };
  }
  if (b.dayCount >= LIMITS.perDay) {
    return { ok: false, status: 429, code: "DAILY_LIMIT", message: "今天的使用次数已到上限，明天再来。" };
  }
  b.minuteCount += 1;
  b.dayCount += 1;
  BUCKETS.set(key, b);
  // 防止 Map 无限增长：超过 5000 个 key 时清掉不是今天的
  if (BUCKETS.size > 5000) for (const [k, v] of BUCKETS) if (v.day !== day) BUCKETS.delete(k);
  return { ok: true };
}

/**
 * 全局模型额度。返回 false 表示今天本实例的模型额度已用完——
 * 调用方应降级为仅规则（判定不受影响），并在结果里明说，而不是静默。
 */
export function takeModelQuota(): boolean {
  const day = today();
  if (modelDay !== day) {
    modelDay = day;
    modelCount = 0;
  }
  if (modelCount >= LIMITS.modelPerDay) return false;
  modelCount += 1;
  return true;
}

/** 读取并解析 JSON 请求体，超过上限直接拒绝（不把大包读进内存再判断） */
export async function readJsonBody<T>(req: Request): Promise<{ ok: true; body: T } | { ok: false; status: number; message: string }> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > LIMITS.bodyBytes) return { ok: false, status: 413, message: "内容太大了。截图请控制在 5MB 以内。" };
  const raw = await req.text();
  if (raw.length > LIMITS.bodyBytes) return { ok: false, status: 413, message: "内容太大了。截图请控制在 5MB 以内。" };
  try {
    return { ok: true, body: JSON.parse(raw) as T };
  } catch {
    return { ok: false, status: 400, message: "请求格式不对。" };
  }
}

export function jsonError(status: number, message: string, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...(extra?.retryAfter ? { "Retry-After": String(extra.retryAfter) } : {}) },
  });
}

/** 测试用：清空计数 */
export function __resetLimits() {
  BUCKETS.clear();
  modelCount = 0;
}
