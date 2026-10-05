"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkline } from "@/components/viz";
import type { DirectionData, MarketData } from "@/lib/market";

/**
 * 投资方向与近期走势。
 * 固定顺序展示，不按涨幅排序——排序本身就是暗示推荐。
 * 同时给出「区间涨跌」与「振幅」，让收益与风险一起被看到。
 */

const GROUPS = ["宽基", "风格", "行业", "固收"] as const;

const GROUP_HINT: Record<string, string> = {
  宽基: "买下一整片市场",
  风格: "同一片市场里的不同侧重",
  行业: "集中在单一行业，波动更大",
  固收: "波动小，收益也小",
};

function pct(n: number | null, d = 1) {
  if (n === null) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(d)}%`;
}

function Row({ it, days }: { it: DirectionData; days: number }) {
  const [open, setOpen] = useState(false);
  const up = (it.rangePct ?? 0) >= 0;
  return (
    <li className="rounded-xl border border-line bg-paper shadow-card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-[length:calc(15px*var(--fs))] font-semibold text-brand-900">{it.name}</p>
          <p className="mt-0.5 truncate text-[length:calc(13px*var(--fs))] text-ink-mute">{it.what}</p>
        </div>
        <Sparkline points={it.series} />
        <div className="w-[92px] shrink-0 text-right">
          <p className={`text-[length:calc(15px*var(--fs))] font-bold tabular-nums ${up ? "text-risk-red" : "text-brand-700"}`}>
            {pct(it.rangePct)}
          </p>
          <p className="text-[length:calc(12px*var(--fs))] tabular-nums text-ink-mute">振幅 {pct(it.amplitudePct, 0)}</p>
        </div>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3">
          <p className="text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
            <b className="text-ink">风险来自</b>：{it.risk}
          </p>
          <p className="mt-1.5 text-[length:calc(12px*var(--fs))] tabular-nums text-ink-mute">
            当前 {it.point?.toFixed(1) ?? "—"} · 今日 {pct(it.todayPct, 2)} · 近 {days} 交易日
          </p>
        </div>
      )}
    </li>
  );
}

export function Directions() {
  const [data, setData] = useState<MarketData | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/market")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j) => alive && setData(j as MarketData))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, []);

  const byGroup = useMemo(() => {
    const m = new Map<string, DirectionData[]>();
    for (const it of data?.items ?? []) {
      const arr = m.get(it.group);
      if (arr) arr.push(it);
      else m.set(it.group, [it]);
    }
    return m;
  }, [data]);

  const widest = useMemo(() => {
    const xs = (data?.items ?? []).filter((i) => i.amplitudePct !== null);
    if (!xs.length) return null;
    return xs.reduce((a, b) => ((a.amplitudePct ?? 0) > (b.amplitudePct ?? 0) ? a : b));
  }, [data]);
  const calmest = useMemo(() => {
    const xs = (data?.items ?? []).filter((i) => i.amplitudePct !== null);
    if (!xs.length) return null;
    return xs.reduce((a, b) => ((a.amplitudePct ?? 0) < (b.amplitudePct ?? 0) ? a : b));
  }, [data]);

  return (
    <section className="rounded-2xl border border-line bg-paper shadow-card p-5">
      <h3 className="text-[length:calc(16px*var(--fs))] font-semibold text-brand-900">有哪些方向，最近怎么走</h3>
      <p className="mt-1.5 text-[length:calc(14px*var(--fs))] text-ink-soft">点开看风险来自哪里。</p>

      {err && <p className="mt-3 text-[length:calc(13px*var(--fs))] text-ink-mute">行情数据暂时不可用。</p>}
      {!data && !err && <p className="mt-3 text-[length:calc(13px*var(--fs))] text-ink-mute">加载中…</p>}

      {data && (
        <>
          {widest && calmest && (
            <p className="mt-3 rounded-xl bg-brand-50 p-3 text-[length:calc(13px*var(--fs))] leading-relaxed text-brand-800">
              近 {data.days} 个交易日里，{widest.name}的振幅是 {pct(widest.amplitudePct, 0)}，
              {calmest.name}是 {pct(calmest.amplitudePct, 0)}。收益和波动是一起来的。
            </p>
          )}

          <div className="mt-4 space-y-5">
            {GROUPS.map((g) => {
              const items = byGroup.get(g) ?? [];
              if (!items.length) return null;
              return (
                <div key={g}>
                  <p className="text-[length:calc(13px*var(--fs))] font-semibold text-brand-700">
                    {g}
                    <span className="ml-2 font-normal text-ink-mute">{GROUP_HINT[g]}</span>
                  </p>
                  <ul className="mt-2 space-y-2">
                    {items.map((it) => (
                      <Row key={it.id} it={it} days={data.days} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-[length:calc(12px*var(--fs))] text-ink-mute">
            {data.source} · 区间与振幅按近 {data.days} 交易日收盘价计算 · 过去走势不代表未来
          </p>
        </>
      )}
    </section>
  );
}
