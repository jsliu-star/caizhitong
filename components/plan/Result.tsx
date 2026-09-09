"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import directionsData from "@/data/directions.json";
import trapsData from "@/data/traps.json";
import { buildAllocation } from "@/lib/plan/allocation";
import { findConflicts, scoreAnswers, type Answers } from "@/lib/plan/questions";
import { RISK_META, type RiskType } from "@/lib/profile";
import { CAT, Donut, Gauge, Radar } from "@/components/viz";
import { Priority } from "@/components/plan/Priority";
import { Directions } from "@/components/plan/Directions";
import { StockLookup } from "@/components/plan/StockLookup";

interface Direction {
  id: string;
  group: string;
  name: string;
  oneLine: string;
  risk: string;
  suitFor: string[];
  mistake: string;
  ask: string;
}
interface Trap {
  id: string;
  when: { riskTypes?: string[]; ageBands?: string[]; experience?: string[]; emergency?: string[]; debt?: string[] };
  title: string;
  detail: string;
  patternIds: string[];
}

const DIRECTIONS = directionsData.directions as Direction[];
const TRAPS = trapsData.traps as Trap[];

const DIM_LABEL = {
  capacity: "承受能力",
  willingness: "风险意愿",
  horizon: "投资期限",
  knowledge: "金融知识",
} as const;

const DIM_HINT = {
  capacity: "亏得起多少",
  willingness: "敢亏多少",
  horizon: "这笔钱多久内要用",
  knowledge: "情景题测出，不影响等级",
} as const;

export function Result({ answers, onRedo }: { answers: Answers; onRedo: () => void }) {
  const score = useMemo(() => scoreAnswers(answers), [answers]);
  const conflicts = useMemo(() => findConflicts(answers, score), [answers, score]);
  const alloc = useMemo(() => buildAllocation(score.riskType, answers), [score.riskType, answers]);
  // 权益类为 0 时改显示非权益类占比：一个孤零零的「0%」看着像没加载出来。
  // 用「非权益类」而不是「低风险资产」——债券不保本、黄金有波动，后者是夸大。
  const equityPct = alloc.slices.find((x) => x.key === "equity")?.pct ?? 0;
  const meta = RISK_META[score.riskType];

  const traps = TRAPS.filter((t) => {
    const w = t.when;
    if (w.riskTypes && !w.riskTypes.includes(score.riskType)) return false;
    if (w.ageBands && !w.ageBands.includes(String(answers.age))) return false;
    if (w.experience && !w.experience.includes(String(answers.experience))) return false;
    if (w.emergency && !w.emergency.includes(String(answers.emergency))) return false;
    if (w.debt && !w.debt.includes(String(answers.debt))) return false;
    return true;
  });

  const suited = DIRECTIONS.filter((d) => d.suitFor.includes(score.riskType));
  const notSuited = DIRECTIONS.filter((d) => !d.suitFor.includes(score.riskType));

  return (
    <div className="space-y-6">
      {/* ── 画像 ───────────────────────────────── */}
      <section data-outline="风险测评与画像" className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[length:calc(13px*var(--fs))] font-semibold uppercase tracking-widest text-brand-600">你的风险画像</p>
            <h2 className="mt-2 flex items-baseline gap-3 text-[length:calc(30px*var(--fs))] font-bold text-brand-950">
              {meta.label}
              <span className="rounded-md bg-brand-800 px-2 py-0.5 text-[length:calc(14px*var(--fs))] font-bold text-brand-50">
                {meta.short}
              </span>
            </h2>
            <p className="mt-3 max-w-md text-[length:calc(15px*var(--fs))] leading-relaxed text-ink-soft">{meta.desc}</p>
          </div>
          <Gauge value={score.score / 100} display={String(score.score)} label="风险承受综合得分" size={160} />
        </div>

        <div className="mt-6 flex flex-col items-center gap-6 border-t border-brand-200 pt-6 sm:flex-row sm:items-start">
          <Radar
            color="var(--brand-600)"
            axes={(["capacity", "willingness", "horizon", "knowledge"] as const).map((k) => ({
              label: DIM_LABEL[k],
              value: score.dims[k] / 100,
              hint: DIM_HINT[k],
            }))}
          />
          <div className="flex-1 space-y-2">
            {(["capacity", "willingness", "horizon", "knowledge"] as const).map((k) => (
              <div key={k} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-[length:calc(14px*var(--fs))] text-ink-soft">{DIM_LABEL[k]}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${score.dims[k]}%` }} />
                </div>
                <span className="w-9 shrink-0 text-right text-[length:calc(14px*var(--fs))] font-semibold tabular-nums text-brand-900">
                  {score.dims[k]}
                </span>
              </div>
            ))}
            <p className="pt-2 text-[length:calc(13px*var(--fs))] text-ink-mute">
定级取两者中更低的一侧。
            </p>
          </div>
        </div>
      </section>

      {/* ── 矛盾发现 ───────────────────────────── */}
      {conflicts.length > 0 && (
        <section data-outline="打架的地方">
          <h3 className="text-[length:calc(17px*var(--fs))] font-bold text-brand-900">
            我们在你的回答里发现 {conflicts.length} 处互相打架的地方
          </h3>

          <ul className="mt-4 space-y-3">
            {conflicts.map((c) => (
              <li
                key={c.id}
                className={`rounded-2xl border p-5 ${
                  c.severity === "hard"
                    ? "border-risk-red-line bg-risk-red-bg"
                    : "border-risk-amber-line bg-risk-amber-bg"
                }`}
              >
                <p className="flex items-center gap-2 text-[length:calc(16px*var(--fs))] font-bold text-ink">
                  <span aria-hidden className={c.severity === "hard" ? "text-risk-red" : "text-risk-amber"}>
                    {c.severity === "hard" ? "▲" : "△"}
                  </span>
                  {c.title}
                </p>
                <p className="mt-2 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink-soft">{c.detail}</p>
                <p className="mt-3 rounded-lg bg-paper/70 p-3 text-[length:calc(14px*var(--fs))] font-medium leading-relaxed text-brand-900">
                  → {c.action}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 方向与走势 ─────────────────────────── */}
      <div data-outline="方向与走势">
        <Directions />
      </div>

      {/* ── 投资方向科普 ───────────────────────── */}
      <section data-outline="品类科普">
        <h3 className="text-[length:calc(17px*var(--fs))] font-bold text-brand-900">投资方向：先分清品类，再谈选择</h3>
        

        <p className="mt-5 text-[length:calc(13px*var(--fs))] font-semibold uppercase tracking-widest text-brand-600">
          与你的画像相符的品类
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {suited.map((d) => (
            <DirectionCard key={d.id} d={d} />
          ))}
        </div>

        <p className="mt-6 text-[length:calc(13px*var(--fs))] font-semibold uppercase tracking-widest text-ink-mute">
          与你的画像不符 / 不该碰的品类
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {notSuited.map((d) => (
            <DirectionCard key={d.id} d={d} muted />
          ))}
        </div>
      </section>

      {/* ── 大类配置框架 ───────────────────────── */}
      <section data-outline="配置思路" className="rounded-2xl border border-line bg-paper p-6">
        <h3 className="text-[length:calc(17px*var(--fs))] font-bold text-brand-900">大类资产配置思路参考</h3>
        
        <div className="mt-5">
          <Donut
            slices={alloc.slices.map((s) => ({ label: s.label, value: s.pct }))}
            centerValue={`${equityPct > 0 ? equityPct : 100 - equityPct}%`}
            centerLabel={equityPct > 0 ? "权益类占比" : "非权益类"}
          />
        </div>
        <ul className="mt-5 space-y-2 border-t border-line pt-4">
          {alloc.slices.map((s, i) => (
            <li key={s.key} className="flex gap-3 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
              <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CAT[i % CAT.length] }} />
              <span>
                <b className="text-ink">{s.label}</b>：{s.why}
              </span>
            </li>
          ))}
        </ul>
        {alloc.adjustments.length > 0 && (
          <div className="mt-4 space-y-2 rounded-xl bg-brand-50 p-4">
            <p className="text-[length:calc(14px*var(--fs))] font-semibold text-brand-800">我们对基准比例做了这些调整</p>
            {alloc.adjustments.map((a) => (
              <p key={a} className="text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
                · {a}
              </p>
            ))}
          </div>
        )}

      </section>

      {/* ── 品类优先级 ─────────────────────────── */}
      <div data-outline="先做什么后做什么">
        <Priority answers={answers} riskType={score.riskType} />
      </div>

      {/* ── 个股公开数据：只陈列，不评价 ─────────── */}
      <div data-outline="个股公开数据">
        <StockLookup />
      </div>

      {/* ── 定向陷阱提醒（三 Tab 联动）───────────── */}
      {traps.length > 0 && (
        <section data-outline="冲你来的骗局" className="rounded-2xl bg-brand-900 p-6 text-brand-50">
          <h3 className="text-[length:calc(17px*var(--fs))] font-bold text-white">冲你来的 {traps.length} 类骗局</h3>
          <ul className="mt-4 space-y-4">
            {traps.map((t) => (
              <li key={t.id} className="border-t border-brand-700 pt-4">
                <p className="text-[length:calc(15px*var(--fs))] font-bold text-white">{t.title}</p>
                <p className="mt-1.5 text-[length:calc(14px*var(--fs))] leading-relaxed text-brand-100">{t.detail}</p>
              </li>
            ))}
          </ul>
          <Link
            href="/shield"
            className="mt-5 inline-block rounded-xl bg-brand-50 px-5 py-2.5 text-[length:calc(15px*var(--fs))] font-semibold text-brand-900 transition hover:bg-white"
          >
            去安全盾体检一张广告 →
          </Link>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onRedo}
          className="rounded-xl border border-brand-200 bg-paper px-5 py-2.5 text-[length:calc(15px*var(--fs))] font-semibold text-brand-800 transition hover:bg-brand-50"
        >
          重新测评
        </button>
      </div>
    </div>
  );
}

function DirectionCard({ d, muted }: { d: Direction; muted?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`rounded-2xl border p-5 ${
        muted ? "border-line bg-paper-soft" : "border-brand-200 bg-paper"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[length:calc(12px*var(--fs))] font-semibold uppercase tracking-wider text-brand-600">{d.group}</p>
          <p className={`mt-1 text-[length:calc(16px*var(--fs))] font-bold ${muted ? "text-ink-soft" : "text-brand-900"}`}>{d.name}</p>
        </div>
      </div>
      <p className="mt-2 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink">{d.oneLine}</p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 text-[length:calc(13px*var(--fs))] font-semibold text-brand-700 hover:text-brand-900"
      >
        {open ? "收起" : "风险在哪 / 常犯的错 →"}
      </button>
      {open && (
        <div className="mt-3 space-y-2.5 border-t border-line pt-3">
          <p className="text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
            <b className="text-ink">风险来源</b>：{d.risk}
          </p>
          <p className="text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
            <b className="text-ink">小白最常犯的错</b>：{d.mistake}
          </p>
          <p className="rounded-lg bg-brand-50 p-3 text-[length:calc(13px*var(--fs))] leading-relaxed text-brand-800">
            该问自己：{d.ask}
          </p>
        </div>
      )}
    </div>
  );
}
