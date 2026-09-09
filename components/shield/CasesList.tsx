"use client";

import { useEffect, useMemo, useState } from "react";
import { loadProfile, type AgeBand } from "@/lib/profile";
import { ScamIcon } from "@/components/shield/ScamIcon";
import type { ScamCase } from "@/lib/rules/playbook";

/**
 * 骗局图鉴列表。会依据共享档案里的年龄段调整排序——
 * 中老年用户优先看到针对中老年的骗局，学生优先看到校园相关的。
 * 档案为空时保持原始顺序，不做假的个性化。
 */
const AGE_PRIORITY: Partial<Record<AgeBand, string[]>> = {
  "60+": ["中老年人", "退休人员", "独居人群"],
  "51-60": ["中老年人", "退休人员", "有一定资产的中年人"],
  "18-25": ["年轻人", "县域与农村地区", "刚开户的新手"],
  "26-35": ["刚有积蓄的年轻人", "工作忙又想投资的人", "单身人群"],
};

export function CasesList({ cases }: { cases: ScamCase[] }) {
  const [ageBand, setAgeBand] = useState<AgeBand | undefined>();
  const [encountered, setEncountered] = useState<string[]>([]);

  useEffect(() => {
    const p = loadProfile();
    setAgeBand(p.ageBand);
    setEncountered(p.encountered);
  }, []);

  const ordered = useMemo(() => {
    const priority = ageBand ? (AGE_PRIORITY[ageBand] ?? []) : [];
    return [...cases]
      .map((c, i) => {
        const ageMatch = priority.some((t) => c.targets.some((x) => x.includes(t) || t.includes(x)));
        const met = c.patternIds.some((p) => encountered.includes(p));
        return { c, i, score: (met ? 2 : 0) + (ageMatch ? 1 : 0) };
      })
      .sort((a, b) => (b.score - a.score) || (a.i - b.i))
      .map(({ c, score }) => ({ c, score }));
  }, [cases, ageBand, encountered]);

  const personalized = Boolean(ageBand) || encountered.length > 0;

  return (
    <>
      {personalized && (
        <p className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-[length:calc(13px*var(--fs))] leading-relaxed text-brand-800">
          <b>已按你的档案调整顺序</b>
          {ageBand && <>：年龄段 {ageBand} 更容易遇到的类型排在前面</>}
          {encountered.length > 0 && <>；你在安全盾里遇到过的类型已标出</>}。
        </p>
      )}

      <div className="space-y-4">
        {ordered.map(({ c, score }, idx) => (
          <article
            key={c.id}
            id={c.id}
            data-outline={c.name}
            className="scroll-mt-20 rounded-2xl border border-line bg-paper p-6 target:border-brand-500 target:ring-2 target:ring-brand-200"
          >
            <div className="flex items-start gap-4">
              <span className="shrink-0 rounded-xl bg-brand-50 p-2.5 text-brand-700">
                <ScamIcon name={c.icon} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[length:calc(12px*var(--fs))] font-semibold tracking-widest text-brand-300">
                    {String(idx + 1).padStart(2, "0")}
                  </p>
                  {score >= 2 && (
                    <span className="rounded-full bg-risk-red-bg px-2 py-0.5 text-[length:calc(12px*var(--fs))] font-semibold text-risk-red">
                      你遇到过这一类
                    </span>
                  )}
                  {score === 1 && (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[length:calc(12px*var(--fs))] font-semibold text-brand-700">
                      你的年龄段易遇到
                    </span>
                  )}
                </div>
                <h2 className="mt-0.5 text-[length:calc(20px*var(--fs))] font-bold text-brand-900">{c.name}</h2>
                <p className="mt-1.5 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink-soft">{c.oneLine}</p>
              </div>
            </div>

            <p className="mt-4 rounded-xl bg-brand-900 px-4 py-3 text-[length:calc(15px*var(--fs))] font-semibold leading-relaxed text-brand-50">
              口诀：{c.hook}
            </p>

            <div className="mt-4">
              <p className="text-[length:calc(13px*var(--fs))] font-semibold uppercase tracking-wider text-brand-600">钱是怎么没的</p>
              <p className="mt-1.5 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink">{c.mechanism}</p>
            </div>

            <div className="mt-5">
              <p className="text-[length:calc(13px*var(--fs))] font-semibold uppercase tracking-wider text-brand-600">推进剧本</p>
              <ol className="mt-2.5">
                {c.playbook.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        aria-hidden
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-100 text-[length:calc(12px*var(--fs))] font-bold text-brand-700"
                      >
                        {i + 1}
                      </span>
                      {i < c.playbook.length - 1 && (
                        <span aria-hidden className="my-1 w-0.5 flex-1 rounded bg-brand-100" />
                      )}
                    </div>
                    <p className="pb-3 pt-0.5 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink">{step}</p>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <span className="text-[length:calc(13px*var(--fs))] text-ink-mute">常见目标：</span>
              {c.targets.map((t) => (
                <span key={t} className="rounded-full bg-paper-soft px-2.5 py-1 text-[length:calc(13px*var(--fs))] text-ink-soft">
                  {t}
                </span>
              ))}
            </div>

            {c.cases.length > 0 ? (
              <div className="mt-4 space-y-2 rounded-xl bg-paper-soft p-4">
                <p className="text-[length:calc(13px*var(--fs))] font-semibold text-brand-700">真实案例</p>
                {c.cases.map((x) => (
                  <p key={x.url} className="text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
                    {x.summary}
                    <a
                      href={x.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="ml-1 font-medium text-brand-700 underline"
                    >
                      {x.source} ↗
                    </a>
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-line p-3 text-[length:calc(13px*var(--fs))] text-ink-mute">
                真实案例待补充
              </p>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
