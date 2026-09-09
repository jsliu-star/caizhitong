"use client";

import { useEffect, useMemo, useState } from "react";
import { emergencyFund, fmtMoney, fmtPct, installmentIrr, type JobStability } from "@/lib/finance";
import { StatTile } from "@/components/viz";
import { saveProfile } from "@/lib/profile";

const inputCls =
  "w-full rounded-lg border border-line bg-paper-soft px-3 py-2.5 text-[length:calc(15px*var(--fs))] tabular-nums text-ink outline-none transition focus:border-brand-400";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[length:calc(14px*var(--fs))] font-medium text-ink">{label}</span>
      {hint && <span className="ml-2 text-[length:calc(13px*var(--fs))] text-ink-mute">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export function DebtCalculator() {
  const [principal, setPrincipal] = useState(12000);
  const [periods, setPeriods] = useState(12);
  const [rate, setRate] = useState(0.6);

  const r = useMemo(() => installmentIrr({ principal, periods, feeRatePerPeriod: rate }), [principal, periods, rate]);
  const heavy = r.apr >= 0.1;

  // 写入共享档案：另两个 Tab 会据此调整提示
  useEffect(() => {
    if (r.apr > 0) saveProfile({ debtApr: r.apr });
  }, [r.apr]);

  return (
    <section className="rounded-2xl border border-line bg-paper p-6">
      <h2 className="text-[length:calc(19px*var(--fs))] font-bold text-brand-950">分期真实年化计算器</h2>
      <p className="mt-2 text-[length:calc(14px*var(--fs))] text-ink-soft">本金逐月递减，手续费按全额收。真实成本比宣传数字高一倍以上。</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Field label="分期金额" hint="元">
          <input type="number" min={100} step={100} value={principal}
            onChange={(e) => setPrincipal(Math.max(0, Number(e.target.value)))} className={inputCls} />
        </Field>
        <Field label="期数" hint="月">
          <select value={periods} onChange={(e) => setPeriods(Number(e.target.value))} className={inputCls}>
            {[3, 6, 9, 12, 18, 24, 36].map((n) => (
              <option key={n} value={n}>{n} 期</option>
            ))}
          </select>
        </Field>
        <Field label="每期费率" hint="%，账单上的「月费率」">
          <input type="number" min={0} step={0.05} value={rate}
            onChange={(e) => setRate(Math.max(0, Number(e.target.value)))} className={inputCls} />
        </Field>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <StatTile
          label="平台的说法（名义总费率）"
          value={fmtPct(r.nominalTotalRate, 1)}
          note={`${rate}% × ${periods} 期 = 手续费 ${fmtMoney(r.totalFee)} 元`}
        />
        <StatTile
          label="真实年化利率（APR）"
          value={fmtPct(r.apr)}
          note={`按复利折算 ${fmtPct(r.effectiveAnnual)}；每期还 ${fmtMoney(r.payment)} 元`}
          tone={heavy ? "danger" : "brand"}
        />
      </div>

      {r.apr > 0 && (
        <p className="mt-4 rounded-xl bg-brand-900 p-4 text-[length:calc(14px*var(--fs))] leading-relaxed text-brand-50">
          真实成本是宣传数字的
          <span className="mx-1 text-[length:calc(18px*var(--fs))] font-bold text-white">{(r.apr / r.nominalTotalRate).toFixed(1)} 倍</span>。
          {heavy && <span className="font-semibold text-white">已超过 10%，先还债。</span>}
        </p>
      )}

      <p className="mt-3 text-[length:calc(12px*var(--fs))] text-ink-mute">等额本金 + 每期固定手续费，按 IRR 求解。实际以账单为准。</p>
    </section>
  );
}

const STABILITY: Array<{ v: JobStability; label: string; desc: string }> = [
  { v: "stable", label: "稳定", desc: "体制内、大企业长期合同" },
  { v: "normal", label: "一般", desc: "普通企业、收入基本固定" },
  { v: "unstable", label: "不稳定", desc: "自由职业、提成为主" },
];

export function EmergencyCalculator() {
  const [expense, setExpense] = useState(6000);
  const [dependents, setDependents] = useState(false);
  const [stability, setStability] = useState<JobStability>("normal");
  const [insurance, setInsurance] = useState(false);

  const r = useMemo(
    () => emergencyFund({ monthlyExpense: expense, hasDependents: dependents, jobStability: stability, hasInsurance: insurance }),
    [expense, dependents, stability, insurance],
  );

  useEffect(() => {
    saveProfile({ emergencyMonths: r.months });
  }, [r.months]);

  return (
    <section className="rounded-2xl border border-line bg-paper p-6">
      <h2 className="text-[length:calc(19px*var(--fs))] font-bold text-brand-950">应急备用金计算器</h2>
      <p className="mt-2 text-[length:calc(14px*var(--fs))] text-ink-soft">没有应急金，遇到急事只能在最坏的时点卖出。</p>

      <div className="mt-5 space-y-4">
        <Field label="每月生活开支" hint="元，含房租房贷、吃饭、交通、还款">
          <input type="number" min={0} step={500} value={expense}
            onChange={(e) => setExpense(Math.max(0, Number(e.target.value)))} className={inputCls} />
        </Field>

        <Field label="收入稳定性">
          <div className="grid gap-2 sm:grid-cols-3">
            {STABILITY.map((s) => (
              <button key={s.v} type="button" onClick={() => setStability(s.v)}
                className={`rounded-lg border p-3 text-left transition ${
                  stability === s.v ? "border-brand-600 bg-brand-50" : "border-line bg-paper hover:border-brand-300"
                }`}>
                <span className={`block text-[length:calc(14px*var(--fs))] font-semibold ${stability === s.v ? "text-brand-800" : "text-ink"}`}>
                  {s.label}
                </span>
                <span className="mt-0.5 block text-[length:calc(12px*var(--fs))] leading-snug text-ink-mute">{s.desc}</span>
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { on: dependents, set: setDependents, label: "有需要供养的家人" },
            { on: insurance, set: setInsurance, label: "已有商业医疗 / 重疾保险" },
          ].map((x) => (
            <button key={x.label} type="button" onClick={() => x.set(!x.on)}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${
                x.on ? "border-brand-600 bg-brand-50" : "border-line bg-paper hover:border-brand-300"
              }`}>
              <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded border text-[length:calc(12px*var(--fs))] font-bold ${
                  x.on ? "border-brand-600 bg-brand-600 text-white" : "border-line text-transparent"
                }`}>✓</span>
              <span className="text-[length:calc(14px*var(--fs))] font-medium text-ink">{x.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-xl border-2 border-brand-200 bg-brand-50 p-5">
        <p className="text-[length:calc(13px*var(--fs))] font-medium text-brand-700">建议预留的应急备用金</p>
        <p className="mt-1 text-[length:calc(30px*var(--fs))] font-bold tabular-nums text-brand-900">
          {fmtMoney(r.amount)} <span className="text-[length:calc(17px*var(--fs))] font-semibold">元</span>
        </p>
        <p className="mt-1 text-[length:calc(14px*var(--fs))] text-brand-700">相当于 {r.months} 个月的生活开支</p>
        <ul className="mt-4 space-y-1.5">
          {r.reasons.map((x) => (
            <li key={x} className="flex gap-2 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
              <span aria-hidden className="text-brand-400">·</span>
              <span>{x}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-brand-200 pt-3 text-[length:calc(13px*var(--fs))] text-ink-soft">
          放在随时能取的地方：活期、货币基金、银行 T+0。不追求收益。
        </p>
      </div>
    </section>
  );
}
