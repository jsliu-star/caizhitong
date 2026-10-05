"use client";

/**
 * 人生阶段：选择 + 时间线 + 这个阶段的「要做 / 要防 / 要学」。
 *
 * 这是「越了解你，建议越准」的入口。阶段由用户自己选，不从年龄自动推断——
 * 年龄段只用来给出「可能是这几个」的提示。
 *
 * 「要防」每一条都标注依据类型：官方（附公开材料链接）或推理（基于处境，不代表统计结论）。
 */
import Link from "next/link";
import casesData from "@/data/scam-cases.json";
import quizData from "@/data/quiz.json";
import { Icon } from "@/components/ui/Icon";
import { STAGES, getStage, nextStage, stagesForAge, type LifeStageId } from "@/lib/stage";
import type { Profile } from "@/lib/profile";

const CASE_NAME = new Map((casesData.cases as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
const LEVEL_NAME = new Map((quizData.levels as Array<{ id: string; name: string }>).map((l) => [l.id, l.name]));

export function StageJourney({ profile, onChange }: { profile: Profile; onChange: (id: LifeStageId | undefined) => void }) {
  const stage = getStage(profile.lifeStage);
  const hinted = stagesForAge(profile.ageBand).map((s) => s.id);

  if (!stage) {
    return (
      <section data-outline="人生阶段" className="mt-8">
        <h2 className="text-[length:calc(18px*var(--fs))] font-bold text-brand-950">你现在处在哪个阶段？</h2>
        <p className="mt-1.5 text-[length:calc(13.5px*var(--fs))] leading-relaxed text-ink-soft">
          同样的问题，学生和快退休的人该听到的不一样。选一个最接近你的，三个智能体和小通都会按它来提醒你。随时可以改。
        </p>
        {hinted.length > 0 && (
          <p className="mt-2 text-[length:calc(12.5px*var(--fs))] text-ink-mute">
            按你测评里填的年龄段（{profile.ageBand}），可能是：{hinted.map((id) => getStage(id)?.label).join(" 或 ")}
          </p>
        )}
        <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {STAGES.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onChange(s.id)}
                className={`cd-lift group flex h-full w-full flex-col items-start gap-2 rounded-2xl border bg-paper p-3.5 text-left shadow-card transition hover:border-brand-400 ${
                  hinted.includes(s.id) ? "border-brand-300 ring-1 ring-brand-200" : "border-line"
                }`}
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                  <Icon name={s.icon} className="cd-wiggle h-5 w-5" />
                </span>
                <span className="text-[length:calc(14.5px*var(--fs))] font-semibold text-brand-950">{s.label}</span>
                <span className="text-[length:calc(12px*var(--fs))] text-ink-mute">{s.ageHint}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const idx = STAGES.findIndex((s) => s.id === stage.id);
  const next = nextStage(stage.id);

  return (
    <section data-outline="人生阶段" className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[length:calc(18px*var(--fs))] font-bold text-brand-950">你的人生阶段：{stage.label}</h2>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="rounded-lg px-2 py-1 text-[length:calc(13px*var(--fs))] font-medium text-brand-700 transition-colors hover:bg-brand-50"
        >
          换一个阶段
        </button>
      </div>

      {/* 时间线：手机上换行，不出横向滚动 */}
      <ol className="mt-4 flex flex-wrap items-center gap-y-3" aria-label="人生阶段时间线">
        {STAGES.map((s, i) => {
          const on = i === idx;
          const past = i < idx;
          return (
            <li key={s.id} className="flex items-center">
              <button
                type="button"
                onClick={() => onChange(s.id)}
                aria-current={on ? "step" : undefined}
                title={`切换到「${s.label}」`}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[length:calc(12.5px*var(--fs))] font-medium transition ${
                  on
                    ? "bg-brand-800 text-on-brand shadow-card"
                    : past
                      ? "text-ink-mute hover:bg-brand-50 hover:text-brand-800"
                      : "text-brand-700 hover:bg-brand-50"
                }`}
              >
                <Icon name={s.icon} className="h-4 w-4" />
                {s.label}
              </button>
              {i < STAGES.length - 1 && (
                <span aria-hidden className={`mx-0.5 h-px w-3 sm:w-5 ${i < idx ? "bg-brand-300" : "border-t border-dashed border-brand-300"}`} />
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-paper p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-700 text-on-brand shadow-card">
            <Icon name={stage.icon} className="h-6 w-6" />
          </span>
          <div>
            <p className="text-[length:calc(13px*var(--fs))] text-ink-mute">{stage.ageHint}</p>
            <p className="mt-0.5 text-[length:calc(15px*var(--fs))] leading-relaxed text-ink">{stage.situation}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-[length:calc(14.5px*var(--fs))] font-semibold text-brand-900">
              <Icon name="check" className="h-4 w-4" strokeWidth={2.25} />
              这个阶段最该先做的
            </h3>
            <ol className="mt-2 space-y-2.5">
              {stage.focus.map((f, i) => (
                <li key={f.title} className="flex gap-2.5">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-100 text-[length:calc(12px*var(--fs))] font-bold text-brand-800">{i + 1}</span>
                  <div>
                    <p className="text-[length:calc(14px*var(--fs))] font-semibold text-ink">{f.title}</p>
                    <p className="mt-0.5 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">{f.why}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h3 className="flex items-center gap-1.5 text-[length:calc(14.5px*var(--fs))] font-semibold text-risk-amber">
              <Icon name="alert" className="h-4 w-4" />
              这个阶段要特别防的
            </h3>
            <ul className="mt-2 space-y-2.5">
              {stage.guard.map((g) => (
                <li key={g.caseId} className="rounded-xl border border-line bg-paper p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href="/learn/cases" className="text-[length:calc(14px*var(--fs))] font-semibold text-brand-900 hover:underline">
                      {CASE_NAME.get(g.caseId) ?? g.caseId}
                    </Link>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[length:calc(11px*var(--fs))] font-medium ${
                        g.basis.type === "official" ? "bg-brand-100 text-brand-800" : "bg-paper-soft text-ink-mute ring-1 ring-line"
                      }`}
                      title={g.basis.type === "official" ? "有官方公开材料直接对应" : "基于这个阶段的处境推理，不代表统计结论"}
                    >
                      {g.basis.type === "official" ? "官方材料" : "处境推理"}
                    </span>
                  </div>
                  <p className="mt-1 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">{g.why}</p>
                  {g.basis.url && (
                    <a
                      href={g.basis.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-[length:calc(12px*var(--fs))] text-brand-700 underline decoration-brand-200 hover:decoration-brand-500"
                    >
                      {g.basis.source}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-5 grid gap-4 border-t border-brand-200 pt-4 md:grid-cols-2">
          <div>
            <h3 className="text-[length:calc(14px*var(--fs))] font-semibold text-brand-900">推荐先学</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {stage.learn.map((id) => (
                <Link
                  key={id}
                  href={`/learn?tab=quiz&level=${id}`}
                  className="rounded-full border border-brand-200 bg-paper px-3 py-1.5 text-[length:calc(12.5px*var(--fs))] font-medium text-brand-800 transition hover:border-brand-400 hover:bg-brand-50"
                >
                  {LEVEL_NAME.get(id) ?? id}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-[length:calc(14px*var(--fs))] font-semibold text-brand-900">可以问问规划师</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {stage.questions.map((q) => (
                <Link
                  key={q}
                  href={`/plan?q=${encodeURIComponent(q)}`}
                  className="rounded-full border border-brand-200 bg-paper px-3 py-1.5 text-[length:calc(12.5px*var(--fs))] text-brand-800 transition hover:border-brand-400 hover:bg-brand-50"
                >
                  {q}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {next && stage.next && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-paper px-3.5 py-3 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft ring-1 ring-brand-200">
            <Icon name="arrowRight" className="mt-0.5 h-4 w-4 text-brand-600" />
            <span>
              <b className="font-semibold text-brand-900">提前准备「{next.label}」：</b>
              {stage.next}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
