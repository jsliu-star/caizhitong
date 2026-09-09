"use client";

import { useState } from "react";
import { fmtBig, fmtNum, fmtPct, type StockData } from "@/lib/stock";

/**
 * 个股公开信息整理。
 *
 * 合规红线（本组件绝不越界）：
 *   只陈列交易所与公司公开披露的客观数据，并标注来源与时间。
 *   不出现「低估/高估/值得买/看好」，不预测涨跌，不给买卖点，不做推荐。
 *   下方「该问自己什么」教的是判断方法，不是判断结论。
 */

const PRESET = [
  { code: "600519", label: "贵州茅台" },
  { code: "000858", label: "五粮液" },
  { code: "300750", label: "宁德时代" },
];

const ASK = [
  "这家公司靠什么赚钱？我能用一句话说清它的生意吗？",
  "近三期营收和净利是同向变化，还是一个涨一个跌？",
  "毛利率和 ROE 是稳定的，还是在持续下滑？",
  "资产负债率是否在我能接受的范围内？",
  "我是因为理解它才想买，还是因为它最近涨得好？",
];

export function StockLookup() {
  const [code, setCode] = useState("");
  const [data, setData] = useState<StockData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (c: string) => {
    setLoading(true);
    setErr(null);
    setData(null);
    try {
      const r = await fetch(`/api/stock?code=${encodeURIComponent(c)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "查询失败");
      setData(j as StockData);
      setCode(c);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "查询失败");
    } finally {
      setLoading(false);
    }
  };

  const q = data?.quote;
  const chg = q && q.price !== null && q.prevClose ? ((q.price - q.prevClose) / q.prevClose) * 100 : null;

  return (
    <section className="rounded-2xl border border-line bg-paper p-5">
      <h3 className="text-[length:calc(16px*var(--fs))] font-semibold text-brand-900">个股公开数据</h3>
      <p className="mt-1.5 text-[length:calc(14px*var(--fs))] text-ink-soft">公开披露的数据，不含评价。</p>

      <form
        className="mt-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (/^\d{6}$/.test(code.trim())) void load(code.trim());
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="6 位代码"
          inputMode="numeric"
          className="w-32 rounded-lg border border-line bg-paper-soft px-3 py-2.5 text-[length:calc(15px*var(--fs))] tabular-nums outline-none focus-visible:border-brand-600 focus-visible:ring-2 focus-visible:ring-brand-300"
        />
        <button
          type="submit"
          disabled={loading || !/^\d{6}$/.test(code.trim())}
          className="min-h-10 rounded-lg bg-brand-800 px-4 py-2.5 text-[length:calc(15px*var(--fs))] font-semibold text-white transition hover:bg-brand-900 disabled:bg-brand-200"
        >
          {loading ? "查询中" : "查询"}
        </button>
        {PRESET.map((p) => (
          <button
            key={p.code}
            type="button"
            disabled={loading}
            onClick={() => void load(p.code)}
            className="min-h-9 rounded-full border border-brand-200 bg-paper px-3 py-2 text-[length:calc(13px*var(--fs))] font-medium text-brand-700 transition hover:bg-brand-50 disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
      </form>

      {err && (
        <p className="mt-3 rounded-lg border border-risk-amber-line bg-risk-amber-bg p-3 text-[length:calc(13px*var(--fs))] text-risk-amber">
          {err}
        </p>
      )}

      {data && q && (
        <div className="mt-4 space-y-4">
          {/* ── 行情 ─────────────────────────────── */}
          <div className="rounded-xl bg-paper-soft p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[length:calc(18px*var(--fs))] font-bold text-brand-900">{q.name}</span>
              <span className="text-[length:calc(13px*var(--fs))] text-ink-mute">{q.code}</span>
              <span className="text-[length:calc(22px*var(--fs))] font-bold tabular-nums text-ink">{fmtNum(q.price)}</span>
              {chg !== null && (
                <span
                  className={`text-[length:calc(15px*var(--fs))] font-semibold tabular-nums ${chg >= 0 ? "text-risk-red" : "text-brand-700"}`}
                >
                  {chg >= 0 ? "+" : ""}
                  {chg.toFixed(2)}%
                </span>
              )}
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[length:calc(13px*var(--fs))] sm:grid-cols-4">
              {(
                [
                  ["昨收", fmtNum(q.prevClose)],
                  ["今开", fmtNum(q.open)],
                  ["最高", fmtNum(q.high)],
                  ["最低", fmtNum(q.low)],
                  ["成交额", fmtBig(q.amount)],
                  ["静态市盈率", data.staticPE === null ? "—" : fmtNum(data.staticPE, 1)],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-ink-mute">{k}</dt>
                  <dd className="font-semibold tabular-nums text-ink">{v}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-2 text-[length:calc(12px*var(--fs))] text-ink-mute">
              行情时间 {q.date} {q.time}
              {data.staticPE !== null && " · 静态市盈率＝现价 ÷ 最新报告期每股收益，纯算术，不含判断"}
            </p>
          </div>

          {/* ── 近三期财务（公司披露原样陈列，不排名不评价）── */}
          {data.finance.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[length:calc(13px*var(--fs))]">
                <thead>
                  <tr className="border-b border-line text-left text-ink-mute">
                    <th className="py-2 pr-3 font-medium">报告期</th>
                    <th className="py-2 pr-3 font-medium">营业收入</th>
                    <th className="py-2 pr-3 font-medium">同比</th>
                    <th className="py-2 pr-3 font-medium">归母净利</th>
                    <th className="py-2 pr-3 font-medium">同比</th>
                    <th className="py-2 pr-3 font-medium">ROE</th>
                    <th className="py-2 pr-3 font-medium">毛利率</th>
                    <th className="py-2 font-medium">资产负债率</th>
                  </tr>
                </thead>
                <tbody>
                  {data.finance.map((f) => (
                    <tr key={f.period} className="border-b border-line/60">
                      <td className="py-2 pr-3 font-medium text-ink">{f.period}</td>
                      <td className="py-2 pr-3 tabular-nums text-ink">{fmtBig(f.revenue)}</td>
                      <td className={`py-2 pr-3 tabular-nums ${(f.revenueYoY ?? 0) < 0 ? "text-risk-red" : "text-ink-soft"}`}>
                        {fmtPct(f.revenueYoY, 1)}
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-ink">{fmtBig(f.netProfit)}</td>
                      <td className={`py-2 pr-3 tabular-nums ${(f.netProfitYoY ?? 0) < 0 ? "text-risk-red" : "text-ink-soft"}`}>
                        {fmtPct(f.netProfitYoY, 1)}
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-ink-soft">{fmtPct(f.roe, 2)}</td>
                      <td className="py-2 pr-3 tabular-nums text-ink-soft">{fmtPct(f.grossMargin, 1)}</td>
                      <td className="py-2 tabular-nums text-ink-soft">{fmtPct(f.debtRatio, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── 教方法，不给结论 ─────────────────── */}
          <div className="rounded-xl bg-brand-50 p-4">
            <p className="text-[length:calc(14px*var(--fs))] font-semibold text-brand-900">拿到这些数据，该问自己什么</p>
            <ul className="mt-2 space-y-1.5">
              {ASK.map((a, i) => (
                <li key={i} className="flex gap-2 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
                  <span aria-hidden className="text-brand-400">
                    {i + 1}.
                  </span>
                  {a}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[length:calc(12px*var(--fs))] text-ink-mute">
            {data.sources.join("；")}。公开数据整理，不含评价与推荐。
          </p>
        </div>
      )}
    </section>
  );
}
