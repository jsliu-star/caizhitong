/**
 * 个股公开信息整理。
 *
 * 合规边界（务必保持）：
 *   ✅ 只客观陈列交易所与公司公开披露的事实，标注数据来源与时间
 *   ❌ 不输出「低估 / 高估 / 值得买 / 看好」等任何主观判断
 *   ❌ 不做涨跌预测、不给买卖点、不做同业排名或推荐
 * 陈列公开数据不构成证券投资咨询；一旦加上评价就越界了。
 *
 * 数据源：行情用新浪（hq.sinajs.cn，GBK），财务用东方财富数据中心。
 * 东方财富的行情接口（push2）在本机网络下不稳定，故行情改用新浪。
 */

export type StockQuote = {
  code: string;
  name: string;
  open: number | null;
  prevClose: number | null;
  price: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  amount: number | null;
  date: string;
  time: string;
};

export type FinanceRow = {
  period: string;
  revenue: number | null;
  revenueYoY: number | null;
  netProfit: number | null;
  netProfitYoY: number | null;
  roe: number | null;
  grossMargin: number | null;
  debtRatio: number | null;
  eps: number | null;
};

export type StockData = {
  quote: StockQuote;
  finance: FinanceRow[];
  /** 现价 ÷ 最新报告期每股收益。纯算术，不含判断 */
  staticPE: number | null;
  sources: string[];
  fetchedAt: string;
};

export type StockResult = StockData | { error: string };

const SH_PREFIX = ["60", "68", "90"];
const isSH = (code: string) => SH_PREFIX.some((p) => code.startsWith(p));

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/**
 * 取远端内容。主路径 fetch，失败回退 curl。
 * 本机开着代理 TUN 时 Node 的连接会被重置（undici UND_ERR_SOCKET / 原生 https ECONNRESET），
 * 而 curl 不受影响；部署到服务器上走主路径即可。
 */
async function getRaw(url: string, referer: string, gbk = false): Promise<string> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Referer: referer },
      cache: "no-store",
    });
    if (r.ok) {
      const buf = await r.arrayBuffer();
      return new TextDecoder(gbk ? "gbk" : "utf-8").decode(buf);
    }
  } catch {
    /* 落到 curl */
  }
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const args = ["-s", "-m", "20", "-H", `User-Agent: ${UA}`, "-H", `Referer: ${referer}`, url];
  if (gbk) {
    const { stdout } = await run("curl", args, { maxBuffer: 8 * 1024 * 1024, encoding: "buffer" });
    return new TextDecoder("gbk").decode(stdout);
  }
  const { stdout } = await run("curl", args, { maxBuffer: 8 * 1024 * 1024, encoding: "utf8" });
  return String(stdout);
}

/** 新浪行情字段顺序：名称,今开,昨收,现价,最高,最低,买一,卖一,成交量,成交额,...,日期,时间 */
function parseSina(raw: string, code: string): StockQuote | null {
  const m = raw.match(/"([^"]*)"/);
  if (!m || !m[1]) return null;
  const f = m[1].split(",");
  if (f.length < 32 || !f[0]) return null;
  return {
    code,
    name: f[0],
    open: num(f[1]),
    prevClose: num(f[2]),
    price: num(f[3]),
    high: num(f[4]),
    low: num(f[5]),
    volume: num(f[8]),
    amount: num(f[9]),
    date: f[30] ?? "",
    time: f[31] ?? "",
  };
}

export async function fetchStock(code: string): Promise<StockResult> {
  const c = code.trim();
  if (!/^\d{6}$/.test(c)) return { error: "请输入 6 位 A 股代码，例如 600519" };

  let quote: StockQuote | null = null;
  try {
    const raw = await getRaw(
      `https://hq.sinajs.cn/list=${isSH(c) ? "sh" : "sz"}${c}`,
      "https://finance.sina.com.cn/",
      true,
    );
    quote = parseSina(raw, c);
  } catch {
    /* 行情失败下面统一处理 */
  }
  if (!quote) return { error: `没有查到代码 ${c}，请确认是 A 股上市公司代码` };

  let finance: FinanceRow[] = [];
  try {
    const txt = await getRaw(
      `https://datacenter.eastmoney.com/securities/api/data/get?type=RPT_F10_FINANCE_MAINFINADATA&sty=ALL&filter=(SECUCODE%3D%22${c}.${isSH(c) ? "SH" : "SZ"}%22)&p=1&ps=3&sr=-1&st=REPORT_DATE`,
      "https://emweb.securities.eastmoney.com/",
    );
    const j = JSON.parse(txt) as { result?: { data?: Record<string, unknown>[] } };
    finance = (j.result?.data ?? []).map((r) => ({
      period: String(r.REPORT_DATE_NAME ?? ""),
      revenue: num(r.OPERATE_INCOME_PK),
      revenueYoY: num(r.OI_YOYRATIO_PK),
      netProfit: num(r.PARENTNETPROFIT),
      netProfitYoY: num(r.PARENTNETPROFITTZ),
      roe: num(r.ROEJQ),
      grossMargin: num(r.XSMLL),
      debtRatio: num(r.ZCFZL),
      eps: num(r.EPSJB),
    }));
  } catch {
    /* 财务拿不到不影响行情展示 */
  }

  const eps = finance[0]?.eps ?? null;
  const staticPE = quote.price !== null && eps !== null && eps > 0 ? quote.price / eps : null;

  return {
    quote,
    finance,
    staticPE,
    sources: ["行情：新浪财经", "财务：东方财富数据中心"],
    fetchedAt: new Date().toISOString(),
  };
}

export const fmtBig = (n: number | null): string => {
  if (n === null) return "—";
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)} 万亿`;
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(1)} 亿`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(1)} 万`;
  return n.toFixed(0);
};

export const fmtPct = (n: number | null, d = 2): string => (n === null ? "—" : `${n.toFixed(d)}%`);
export const fmtNum = (n: number | null, d = 2): string => (n === null ? "—" : n.toFixed(d));
