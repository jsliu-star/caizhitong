"use client";

/**
 * 术语词典。分类筛选 + 搜索 + 薄弱术语置顶。
 * 「考我一下」直接跳到题库里对应的那一题——查完就练，比只读解释记得住。
 */
import { useMemo, useState } from "react";
import glossaryData from "@/data/glossary.json";
import type { Term } from "@/lib/rules/glossary";
import { TERM_TO_QUESTION } from "./quiz";
import { Icon } from "@/components/ui/Icon";

const ALL_TERMS = glossaryData.terms as Term[];

const GROUPS = ["活钱", "固收", "权益", "费用", "风险", "工具"] as const;
const GROUP_HINT: Record<string, string> = {
  活钱: "随时要能取出来的钱",
  固收: "拿固定回报的那一类",
  权益: "跟着股市涨跌的那一类",
  费用: "无论盈亏都要付的钱",
  风险: "决定你会不会睡不着觉",
  工具: "看懂和算清的方法",
};

export function Dict({
  weakTerms,
  onQuizJump,
}: {
  weakTerms: string[];
  onQuizJump: (questionId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string | null>(null);

  const list = useMemo(() => {
    const k = q.trim();
    let out = ALL_TERMS;
    if (group) out = out.filter((t) => t.group === group);
    if (k) {
      out = out.filter(
        (t) => t.term.includes(k) || t.aliases.some((a) => a.includes(k)) || t.plain.includes(k),
      );
    }
    // 薄弱术语置顶——档案里记着你答错过它
    return [...out].sort((a, b) => {
      const wa = weakTerms.includes(a.term) ? 0 : 1;
      const wb = weakTerms.includes(b.term) ? 0 : 1;
      return wa - wb;
    });
  }, [q, group, weakTerms]);

  const weakInView = list.filter((t) => weakTerms.includes(t.term));

  return (
    <div>
      <section className="rounded-2xl border border-line bg-paper shadow-card p-5 sm:p-6">
        <h2 className="text-[length:calc(18px*var(--fs))] font-bold text-brand-950">术语词典</h2>
        <p className="mt-2 text-[length:calc(14px*var(--fs))] text-ink-soft">
          {ALL_TERMS.length} 个概念，按用途分六类。
        </p>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索术语，例如「年化」「封闭期」「IRR」"
          className="mt-4 w-full rounded-xl border border-line bg-paper-soft px-4 py-3 text-[length:calc(15px*var(--fs))] outline-none transition focus:border-brand-400 focus-visible:border-brand-600 focus-visible:ring-2 focus-visible:ring-brand-300"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setGroup(null)}
            className={`min-h-9 rounded-full border px-3.5 py-2 text-[length:calc(13px*var(--fs))] font-semibold transition ${
              group === null
                ? "border-brand-800 bg-brand-800 text-on-brand"
                : "border-line bg-paper text-ink-soft hover:bg-brand-50"
            }`}
          >
            全部 {ALL_TERMS.length}
          </button>
          {GROUPS.map((g) => {
            const n = ALL_TERMS.filter((t) => t.group === g).length;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setGroup(group === g ? null : g)}
                title={GROUP_HINT[g]}
                className={`min-h-9 rounded-full border px-3.5 py-2 text-[length:calc(13px*var(--fs))] font-semibold transition ${
                  group === g
                    ? "border-brand-800 bg-brand-800 text-on-brand"
                    : "border-line bg-paper text-ink-soft hover:bg-brand-50"
                }`}
              >
                {g} {n}
              </button>
            );
          })}
        </div>
        {group && <p className="mt-2.5 text-[length:calc(13px*var(--fs))] text-ink-mute">{group}：{GROUP_HINT[group]}</p>}
      </section>

      {weakTerms.length > 0 && (
        <section className="mt-5 rounded-2xl border-2 border-brand-200 bg-brand-50 p-5">
          <h3 className="text-[length:calc(15px*var(--fs))] font-bold text-brand-900">我的薄弱术语 · {weakTerms.length} 个</h3>
          <p className="mt-1.5 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
            闯关答错过的，已置顶。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {weakTerms.map((t) => (
              <span
                key={t}
                className="rounded-full border border-brand-300 bg-paper px-3 py-1 text-[length:calc(13px*var(--fs))] font-semibold text-brand-800"
              >
                {t}
              </span>
            ))}
          </div>
          {weakInView.length === 0 && (
            <p className="mt-3 text-[length:calc(13px*var(--fs))] text-ink-mute">当前筛选条件下没有薄弱术语，去掉筛选就能看到。</p>
          )}
        </section>
      )}

      <ul className="mt-5 space-y-2.5">
        {list.map((t) => {
          const weak = weakTerms.includes(t.term);
          const qid = TERM_TO_QUESTION[t.term];
          return (
            <li
              key={t.term}
              className={`rounded-2xl border p-5 ${weak ? "border-brand-300 bg-brand-50" : "border-line bg-paper"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[length:calc(16px*var(--fs))] font-bold text-brand-800">{t.term}</p>
                <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-[length:calc(12px*var(--fs))] font-medium text-ink-mute">
                  {t.group}
                </span>
                {weak && (
                  <span className="rounded-full bg-brand-800 px-2 py-0.5 text-[length:calc(12px*var(--fs))] font-semibold text-brand-100">
                    你答错过
                  </span>
                )}
                {qid && (
                  <button
                    type="button"
                    onClick={() => onQuizJump(qid)}
                    className="ml-auto min-h-9 rounded-lg border border-brand-300 bg-paper px-3.5 py-2 text-[length:calc(13px*var(--fs))] font-semibold text-brand-800 transition hover:bg-brand-100"
                  >
                    考我一下 →
                  </button>
                )}
              </div>
              {t.aliases.length > 0 && (
                <p className="mt-1.5 text-[length:calc(12px*var(--fs))] text-ink-mute">也写作：{t.aliases.join("、")}</p>
              )}
              <p className="mt-2 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink-soft">{t.plain}</p>
              <p className="mt-2 flex gap-2 text-[length:calc(13px*var(--fs))] leading-relaxed text-brand-800">
                <Icon name="alert" className="mt-[0.2em] h-[1.05em] w-[1.05em] text-risk-amber" />
                <span>{t.watch}</span>
              </p>
            </li>
          );
        })}
        {list.length === 0 && (
          <li className="rounded-2xl border border-line bg-paper shadow-card p-5 text-[length:calc(14px*var(--fs))] text-ink-mute">
            没有匹配的术语。
          </li>
        )}
      </ul>
    </div>
  );
}
