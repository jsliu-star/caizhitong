/**
 * 投资方向与近期走势。
 *
 * 为什么不是「输股票代码」：小白不知道代码，也不该从个股开始。
 * 先看清有哪些方向、各自最近怎么走、波动多大，才是第一步。
 *
 * 合规边界：
 *   ✅ 客观展示公开指数的点位、区间涨跌与波动幅度，标注数据来源与时间
 *   ❌ 不按涨幅排序（排序本身就是暗示推荐），固定顺序展示
 *   ❌ 不预测走向、不推荐方向、不出现「值得配置」「看好」
 *   同时展示「涨跌」与「波动」，让用户看到收益与风险是一起来的。
 */

export interface Direction {
  id: string;
  /** 新浪快照代码 */
  snap: string;
  /** 新浪 K 线代码 */
  kline: string;
  name: string;
  group: "宽基" | "风格" | "行业" | "固收";
  /** 这是什么方向，一句话 */
  what: string;
  /** 风险主要来自哪里 */
  risk: string;
}

/** 固定顺序，不按表现排序 */
export const DIRECTIONS: Direction[] = [
  { id: "hs300", snap: "s_sh000300", kline: "sh000300", name: "沪深300", group: "宽基",
    what: "沪深两市规模最大的 300 家公司", risk: "整个市场的涨跌，分散不了大盘风险" },
  { id: "zz500", snap: "s_sz399905", kline: "sz399905", name: "中证500", group: "宽基",
    what: "中盘公司的代表", risk: "波动大于大盘，回撤更深" },
  { id: "cyb", snap: "s_sz399006", kline: "sz399006", name: "创业板指", group: "宽基",
    what: "成长型公司集中的板块", risk: "估值高、波动大，情绪影响明显" },
  { id: "kc50", snap: "s_sh000688", kline: "sh000688", name: "科创50", group: "风格",
    what: "硬科技方向的代表", risk: "行业集中，业绩不确定性高" },
  { id: "hongli", snap: "s_sh000015", kline: "sh000015", name: "红利指数", group: "风格",
    what: "高股息、低波动的公司", risk: "涨得慢，牛市里容易跑不动" },
  { id: "baijiu", snap: "s_sz399997", kline: "sz399997", name: "中证白酒", group: "行业",
    what: "消费方向里最集中的一类", risk: "单一行业，政策与需求变化影响大" },
  { id: "yiliao", snap: "s_sz399989", kline: "sz399989", name: "中证医疗", group: "行业",
    what: "医疗与医药方向", risk: "受集采与政策影响大" },
  { id: "xinnengche", snap: "s_sz399976", kline: "sz399976", name: "新能源车", group: "行业",
    what: "新能源汽车产业链", risk: "产能与价格竞争剧烈" },
  { id: "zhengquan", snap: "s_sz399975", kline: "sz399975", name: "证券公司", group: "行业",
    what: "券商，随市场成交量涨跌", risk: "波动极大，牛短熊长" },
  { id: "youse", snap: "s_sh000819", kline: "sh000819", name: "有色金属", group: "行业",
    what: "铜、铝等金属相关公司", risk: "跟大宗商品价格周期走" },
  { id: "junghong", snap: "s_sz399967", kline: "sz399967", name: "中证军工", group: "行业",
    what: "国防军工产业链", risk: "订单节奏与政策影响大，波动剧烈" },
  { id: "guozhai", snap: "s_sh000012", kline: "sh000012", name: "国债指数", group: "固收",
    what: "国债价格的整体走势", risk: "波动小，但受利率变动影响" },
];

export interface DirectionData extends Direction {
  point: number | null;
  todayPct: number | null;
  /** 收盘价序列（近 N 个交易日） */
  series: number[];
  /** 区间涨跌幅 */
  rangePct: number | null;
  /** 区间振幅：(最高-最低)/最低 */
  amplitudePct: number | null;
}

export interface MarketData {
  days: number;
  items: DirectionData[];
  source: string;
  fetchedAt: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** 主路径 fetch，失败回退 curl（本机代理 TUN 会重置 Node 连接） */
async function getRaw(url: string, gbk = false): Promise<string> {
  const referer = "https://finance.sina.com.cn/";
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Referer: referer }, cache: "no-store" });
    if (r.ok) {
      const buf = await r.arrayBuffer();
      return new TextDecoder(gbk ? "gbk" : "utf-8").decode(buf);
    }
  } catch {
    /* 回退 */
  }
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const { stdout } = await run("curl", ["-s", "-m", "20", "-H", `User-Agent: ${UA}`, "-H", `Referer: ${referer}`, url], {
    maxBuffer: 8 * 1024 * 1024,
    encoding: gbk ? "buffer" : "utf8",
  });
  return gbk ? new TextDecoder("gbk").decode(stdout as unknown as Uint8Array) : String(stdout);
}

const numOr = (v: string | undefined): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/** 60 秒内存缓存，避免每次进页面都打接口 */
let cache: { at: number; data: MarketData } | null = null;
const TTL = 60_000;

export async function fetchMarket(days = 60): Promise<MarketData> {
  if (cache && Date.now() - cache.at < TTL) return cache.data;

  const snapRaw = await getRaw(`https://hq.sinajs.cn/list=${DIRECTIONS.map((d) => d.snap).join(",")}`, true);
  const snapMap = new Map<string, string[]>();
  for (const line of snapRaw.split("\n")) {
    const m = line.match(/var hq_str_(\S+)="(.*)";/);
    if (m) snapMap.set(m[1], m[2].split(","));
  }

  const items = await Promise.all(
    DIRECTIONS.map(async (d): Promise<DirectionData> => {
      const f = snapMap.get(d.snap) ?? [];
      // s_ 前缀字段：名称, 点位, 涨跌额, 涨跌幅
      const point = numOr(f[1]);
      const todayPct = numOr(f[3]);

      let series: number[] = [];
      try {
        const txt = await getRaw(
          `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${d.kline}&scale=240&ma=no&datalen=${days}`,
        );
        const rows = JSON.parse(txt) as Array<{ close: string }>;
        series = rows.map((r) => Number(r.close)).filter((n) => Number.isFinite(n));
      } catch {
        /* 走势拿不到就只显示点位 */
      }

      const first = series[0];
      const last = series[series.length - 1];
      const hi = series.length ? Math.max(...series) : null;
      const lo = series.length ? Math.min(...series) : null;

      return {
        ...d,
        point,
        todayPct,
        series,
        rangePct: first && last ? ((last - first) / first) * 100 : null,
        amplitudePct: hi !== null && lo !== null && lo > 0 ? ((hi - lo) / lo) * 100 : null,
      };
    }),
  );

  const data: MarketData = {
    days,
    items,
    source: "新浪财经公开指数数据",
    fetchedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), data };
  return data;
}
