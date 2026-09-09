"use client";

import Link from "next/link";
import { useState } from "react";
import { Radar } from "@/components/viz";
import type { Hit, Regulation, ShieldReport } from "@/lib/types";
import type { PersonalNote } from "@/lib/shield/personalize";

const LEVEL = {
  red: { label: "高风险", cls: "border-risk-red-line bg-risk-red-bg text-risk-red", dot: "bg-risk-red", icon: "!" },
  yellow: { label: "需警惕", cls: "border-risk-amber-line bg-risk-amber-bg text-risk-amber", dot: "bg-risk-amber", icon: "?" },
  green: { label: "未发现违规表述", cls: "border-risk-green-line bg-risk-green-bg text-risk-green", dot: "bg-risk-green", icon: "✓" },
} as const;

function Mark({ clause, matched }: { clause: string; matched: string }) {
  const i = clause.indexOf(matched);
  if (i === -1) return <>{clause}</>;
  return (
    <>
      {clause.slice(0, i)}
      <mark className="rounded bg-risk-amber-bg px-0.5 font-semibold text-risk-red">{matched}</mark>
      {clause.slice(i + matched.length)}
    </>
  );
}

/** 同一特征类型的多次命中合并为一条 */
function group(hits: Hit[]): Hit[][] {
  const m = new Map<string, Hit[]>();
  for (const h of hits) (m.get(h.patternId) ?? m.set(h.patternId, []).get(h.patternId)!).push(h);
  return [...m.values()];
}

function Fold({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-line bg-paper">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="text-[length:calc(15px*var(--fs))] font-semibold text-brand-900">
          {title}
          {count !== undefined && <span className="ml-2 text-[length:calc(13px*var(--fs))] font-normal text-ink-mute">{count}</span>}
        </span>
        <span className="text-[length:calc(13px*var(--fs))] text-brand-600">{open ? "收起" : "展开"}</span>
      </button>
      {open && <div className="border-t border-line px-5 py-4">{children}</div>}
    </section>
  );
}

export function CheckReport({
  report,
  notes = [],
  onFollowup,
}: {
  report: ShieldReport;
  notes?: PersonalNote[];
  onFollowup?: (append: string) => void;
}) {
  const [openTerm, setOpenTerm] = useState<string | null>(null);
  const lv = LEVEL[report.verdict.level];
  const groups = group(report.hits);
  const missing = report.elements.filter((e) => !e.present);
  const isRisk = report.mode === "risk";

  return (
    <div className="space-y-4">
      {/* 人话版 */}
      {(report.plainText || (isRisk && report.verdict.summary)) && (
        <section data-outline="人话版" className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-5">
          <p className="text-[length:calc(12px*var(--fs))] font-semibold tracking-widest text-brand-600">人话版</p>
          <p className="mt-2 text-[length:calc(16px*var(--fs))] leading-relaxed text-ink">
            {report.plainText || report.verdict.summary}
          </p>
        </section>
      )}

      {/* 风险结论（只在体检模式） */}
      {isRisk && (
        <section data-outline="风险结论" className={`rounded-2xl border-2 p-5 ${lv.cls}`}>
          <div className="flex items-center gap-3">
            <span aria-hidden className={`grid h-9 w-9 place-items-center rounded-full text-[length:calc(18px*var(--fs))] font-bold text-white ${lv.dot}`}>
              {lv.icon}
            </span>
            <div>
              <p className="text-[length:calc(19px*var(--fs))] font-bold leading-tight">{lv.label}</p>
              {report.verdict.headline && <p className="text-[length:calc(13px*var(--fs))] opacity-90">{report.verdict.headline}</p>}
            </div>
          </div>
        </section>
      )}

      {/* 风险条目 */}
      {groups.length > 0 && (
        <section data-outline="风险条目">
          <h3 className="mb-2 text-[length:calc(15px*var(--fs))] font-semibold text-brand-900">
            风险条目 <span className="font-normal text-ink-mute">{groups.length} 类</span>
          </h3>
          <ul className="space-y-2">
            {groups.map((g, i) => {
              const h = g[0];
              const laws = report.regulations.filter((r) => h.regulationIds.includes(r.id));
              return (
                <li key={h.patternId} className="rounded-xl border border-line bg-paper p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded bg-brand-800 text-[length:calc(12px*var(--fs))] font-bold text-brand-50">
                      {i + 1}
                    </span>
                    <span className="text-[length:calc(15px*var(--fs))] font-semibold text-brand-900">{h.type}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[length:calc(11px*var(--fs))] font-semibold ${
                        h.severity === "hard"
                          ? "bg-risk-red-bg text-risk-red"
                          : "bg-risk-amber-bg text-risk-amber"
                      }`}
                    >
                      {h.severity === "hard" ? "明令禁止" : "高风险"}
                    </span>
                    {g.length > 1 && <span className="text-[length:calc(12px*var(--fs))] text-ink-mute">{g.length} 处</span>}
                  </div>

                  <p className="mt-2 break-words rounded-lg bg-paper-soft px-3 py-2 text-[length:calc(14px*var(--fs))] leading-relaxed">
                    「<Mark clause={h.clause} matched={h.matched} />」
                  </p>
                  <p className="mt-2 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink-soft">{h.plain}</p>
                  {laws.length > 0 && (
                    <p className="mt-2 flex flex-wrap gap-1.5">
                      {laws.map((r) => (
                        <span
                          key={r.id}
                          className="rounded bg-brand-50 px-2 py-0.5 text-[length:calc(12px*var(--fs))] text-brand-700"
                        >
                          {r.law}
                          {r.article}
                        </span>
                      ))}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 缺失要素 */}
      {isRisk && missing.length > 0 && (
        <section data-outline="缺了哪些要素" className="rounded-xl border border-risk-red-line bg-risk-red-bg p-4">
          <p className="text-[length:calc(14px*var(--fs))] font-semibold text-risk-red">正规产品该有、但这里没有</p>
          <p className="mt-1.5 text-[length:calc(14px*var(--fs))] text-ink-soft">{missing.map((m) => m.label).join(" · ")}</p>
        </section>
      )}

      {/* 五维画像 */}
      {isRisk && report.hits.length > 0 && (
        <section data-outline="在哪几路上做手脚" className="rounded-xl border border-line bg-paper p-5">
          <h3 className="text-[length:calc(15px*var(--fs))] font-semibold text-brand-900">在哪几路上做手脚</h3>
          <div className="mt-2 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <Radar
              size={240}
              color="var(--risk-red)"
              axes={report.radar.map((d) => ({ label: d.label, value: d.value, hint: d.hint }))}
            />
            <ul className="flex-1 space-y-1.5">
              {[...report.radar].sort((a, b) => b.value - a.value).map((d) => (
                <li key={d.key} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-[length:calc(13px*var(--fs))] text-ink-soft">{d.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-soft">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(2, d.value * 100)}%`,
                        background: d.value > 0.5 ? "var(--risk-red)" : d.value > 0.15 ? "var(--risk-amber)" : "var(--brand-300)",
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 骗局剧本 */}
      {isRisk && report.playbook.length > 0 && (
        <section data-outline="接下来会发生什么" className="rounded-2xl border-2 border-risk-red-line bg-risk-red-bg p-5">
          <p className="text-[length:calc(12px*var(--fs))] font-semibold tracking-widest text-risk-red">接下来会发生什么</p>
          <h3 className="mt-1.5 text-[length:calc(17px*var(--fs))] font-bold text-ink">
            套路吻合「{report.playbook[0].name}」{Math.round(report.playbook[0].score * 100)}%
          </h3>
          <ol className="mt-3 space-y-1.5">
            {report.playbook[0].playbook.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink">
                <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-risk-red text-[length:calc(11px*var(--fs))] font-bold text-white">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
          <Link
            href={`/learn/cases#${report.playbook[0].caseId}`}
            className="mt-3 inline-block text-[length:calc(13px*var(--fs))] font-semibold text-brand-700 underline"
          >
            完整解析
          </Link>
        </section>
      )}

      {/* 术语：默认只显示词，点开才展开（交互式） */}
      {report.terms.length > 0 && (
        <section data-outline="原文术语" className="rounded-xl border border-line bg-paper p-5">
          <h3 className="text-[length:calc(15px*var(--fs))] font-semibold text-brand-900">
            原文里的术语 <span className="font-normal text-ink-mute">点一下看解释</span>
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {report.terms.map((t) => (
              <button
                key={t.term}
                type="button"
                onClick={() => setOpenTerm(openTerm === t.term ? null : t.term)}
                className={`min-h-9 rounded-full border px-3 py-2 text-[length:calc(13px*var(--fs))] font-medium transition ${
                  openTerm === t.term
                    ? "border-brand-600 bg-brand-800 text-white"
                    : "border-brand-200 bg-paper text-brand-800 hover:bg-brand-50"
                }`}
              >
                {t.term}
              </button>
            ))}
          </div>
          {openTerm && (
            <div className="cd-in mt-3 rounded-lg bg-brand-50 p-4">
              {report.terms
                .filter((t) => t.term === openTerm)
                .map((t) => (
                  <div key={t.term}>
                    <p className="text-[length:calc(14px*var(--fs))] leading-relaxed text-ink">{t.plain}</p>
                    <p className="mt-2 text-[length:calc(13px*var(--fs))] leading-relaxed text-brand-800">注意：{t.watch}</p>
                  </div>
                ))}
            </div>
          )}
        </section>
      )}

      {/* 关键点 */}
      {report.keyPoints.length > 0 && (
        <section data-outline="最该注意的几点" className="rounded-xl border border-line bg-paper p-5">
          <h3 className="text-[length:calc(15px*var(--fs))] font-semibold text-brand-900">最该注意的几点</h3>
          <ul className="mt-2.5 space-y-2">
            {report.keyPoints.map((k, i) => (
              <li key={k.id} className="flex gap-2.5 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink">
                <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-700 text-[length:calc(11px*var(--fs))] font-bold text-white">
                  {i + 1}
                </span>
                {k.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 定向提示 */}
      {notes.length > 0 && (
        <section data-outline="针对你的提示" className="rounded-xl border border-brand-300 bg-brand-50 p-5">
          <h3 className="text-[length:calc(15px*var(--fs))] font-semibold text-brand-900">针对你的提示</h3>
          <ul className="mt-2.5 space-y-2.5">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-paper p-3">
                <p className="text-[length:calc(12px*var(--fs))] text-brand-500">{n.basis}</p>
                <p className="mt-1 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink">{n.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 追问 */}
      {isRisk && report.followups.length > 0 && onFollowup && (
        <section data-outline="补充后重判" className="rounded-xl border border-brand-300 bg-paper p-5">
          <h3 className="text-[length:calc(15px*var(--fs))] font-semibold text-brand-900">补充一下，重新判一遍</h3>
          <div className="mt-3 space-y-4">
            {report.followups.map((f) => (
              <div key={f.id}>
                <p className="text-[length:calc(14px*var(--fs))] font-medium text-ink">{f.question}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {f.options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      disabled={!o.append}
                      onClick={() => onFollowup(o.append)}
                      className="min-h-9 rounded-full border border-brand-200 bg-paper px-3 py-2 text-[length:calc(13px*var(--fs))] font-medium text-brand-800 transition hover:bg-brand-50 disabled:opacity-50"
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 行动建议 */}
      {isRisk && report.verdict.actions.length > 0 && (
        <section data-outline="现在该做什么" className="rounded-2xl bg-brand-900 p-5 text-brand-50">
          <h3 className="text-[length:calc(15px*var(--fs))] font-bold text-white">现在该做什么</h3>
          <ol className="mt-2.5 space-y-2">
            {report.verdict.actions.map((a, i) => (
              <li key={i} className="flex gap-2.5 text-[length:calc(14px*var(--fs))] leading-relaxed">
                <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-700 text-[length:calc(11px*var(--fs))] font-bold text-white">
                  {i + 1}
                </span>
                {a}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* 折叠区：法条原文（去重，只列一次）+ 主体核查 + 排除项 + 原文 */}
      {isRisk && report.regulations.length > 0 && (
        <Fold title="法规依据原文" count={report.regulations.length}>
          <ul className="space-y-3">
            {report.regulations.map((r: Regulation) => (
              <li key={r.id}>
                <p className="text-[length:calc(13px*var(--fs))] font-semibold text-brand-800">
                  {r.law}
                  {r.article}
                  {r.verified ? (
                    <span className="ml-2 rounded border border-brand-200 bg-brand-50 px-1.5 text-[length:calc(11px*var(--fs))] text-brand-700">
                      原文已核对
                    </span>
                  ) : (
                    <span className="ml-2 rounded border border-risk-amber-line bg-risk-amber-bg px-1.5 text-[length:calc(11px*var(--fs))] text-risk-amber">
                      原文待核对
                    </span>
                  )}
                </p>
                <p className="mt-1 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">{r.officialText ?? r.gist}</p>
              </li>
            ))}
          </ul>
        </Fold>
      )}

      {isRisk && report.entity.links.length > 0 && (
        <Fold title="去官方渠道核查" count={report.entity.links.length}>
          <ul className="space-y-2.5">
            {report.entity.clues.map((c) => (
              <li key={c.id} className="text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
                <b className="text-ink">{c.label}</b>：{c.detail}
              </li>
            ))}
            {report.entity.links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noreferrer noopener" className="text-[length:calc(13px*var(--fs))] font-semibold text-brand-700 underline">
                  {l.label} ↗
                </a>
                <p className="text-[length:calc(13px*var(--fs))] text-ink-soft">{l.note}</p>
              </li>
            ))}
          </ul>
        </Fold>
      )}

      {isRisk && report.excludedHits.length > 0 && (
        <Fold title="我们主动排除的疑似命中" count={report.excludedHits.length}>
          <p className="mb-2 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
            否定语境（本产品<b>不</b>保本）和科普语境（凡是承诺保本的<b>都是骗局</b>）不算违规。
          </p>
          <ul className="space-y-1.5">
            {report.excludedHits.map((e, i) => (
              <li key={i} className="text-[length:calc(13px*var(--fs))] text-ink-mute">
                <span className="line-through">{e.type}</span>
                <span className="ml-2">
                  {e.excluded === "negated" ? "否定语境" : "科普语境"}「{e.excludedBy}」
                </span>
              </li>
            ))}
          </ul>
        </Fold>
      )}

      <Fold title="被分析的原文" count={report.text.length}>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
          {report.text}
        </pre>
      </Fold>


    </div>
  );
}
