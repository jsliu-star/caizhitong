"use client";

import type { Term } from "@/lib/rules/glossary";
import { Icon } from "@/components/ui/Icon";

/* ────────────────────────────────────────────────────────────
   首屏说明与案例。纯展示组件，不发请求、不碰档案。
   为什么存在：原来首屏是一个空白大输入框，用户不知道该往里放什么、
   也不知道会得到什么。这里用图示 + 真实案例把这两件事说清。
   ──────────────────────────────────────────────────────────── */

/** 三步图示。图标全部内联 SVG —— 项目禁止任何外链资源。 */
export function HowItWorks() {
  return (
    <section aria-label="这一页怎么用" className="mt-5">
      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className="group cd-lift relative flex items-center gap-3 rounded-2xl border border-line bg-paper px-3.5 py-3 shadow-card sm:flex-col sm:items-stretch sm:gap-2.5 sm:p-4"
          >
            <div className="flex shrink-0 items-center gap-2">
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-700 ring-1 ring-brand-200"
              >
                <span className="cd-wiggle inline-flex">{s.icon}</span>
              </span>
              <span className="hidden text-[length:calc(12px*var(--fs))] font-semibold tracking-wider text-brand-600 sm:inline">
                第 {i + 1} 步
              </span>
            </div>
            {/* 步骤之间的箭头，只在三列并排时出现 */}
            {i < STEPS.length - 1 && (
              <span
                aria-hidden
                className="absolute -right-[0.95rem] top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-line bg-paper text-brand-500 shadow-card sm:grid"
              >
                <Icon name="chevronRight" className="h-3.5 w-3.5" strokeWidth={2.25} />
              </span>
            )}
            <div>
              <p className="text-[length:calc(15px*var(--fs))] font-semibold text-ink">{s.title}</p>
              <p className="mt-0.5 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const ICON = "h-5 w-5";

const STEPS = [
  {
    title: "丢进来",
    body: "广告截图、群里转来的话、合同条款，或者只是一个看不懂的词。",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ICON}>
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="m6 15 3.5-4 3 3.5L15 12l3 3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="8.5" r="1.2" />
        <path d="M8 21h8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "翻成人话",
    body: "先说清这段话到底在讲什么，术语就地解释，不评价好不好。",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ICON}>
        <path d="M20 12a8 8 0 1 0-3.2 6.4L20 19l-.8-3A7.9 7.9 0 0 0 20 12Z" strokeLinejoin="round" />
        <path d="M8.5 13.5h7M8.5 10h7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "标出风险点",
    body: "逐条比对监管明令禁止的表述，命中哪条、依据哪部法规，都写给你看。",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ICON}>
        <path d="M12 3.5 5 6v6c0 4 3 7 7 8.5 4-1.5 7-4.5 7-8.5V6l-7-2.5Z" strokeLinejoin="round" />
        <path d="M12 9v3.5" strokeLinecap="round" />
        <circle cx="12" cy="15.6" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

/* ── 术语卡：命中本地词典时秒出，不调模型 ───────────────── */

export function TermCards({ terms }: { terms: Array<Term & { hitBy: string }> }) {
  if (terms.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-[length:calc(13px*var(--fs))] text-ink-mute">词典里查到 {terms.length} 条（本地词典，不用等）</p>
      {terms.map((t) => (
        <div key={t.term} className="rounded-xl border border-brand-200 bg-brand-50 p-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-[length:calc(16px*var(--fs))] font-semibold text-brand-900">{t.term}</p>
            <span className="rounded-full border border-brand-300 bg-paper px-2 py-0.5 text-[length:calc(12px*var(--fs))] text-brand-700">
              {t.group}
            </span>
            {t.hitBy !== t.term && <span className="text-[length:calc(12px*var(--fs))] text-ink-mute">你输入的是「{t.hitBy}」</span>}
          </div>
          <p className="mt-2 text-[length:calc(15px*var(--fs))] leading-relaxed text-ink">{t.plain}</p>
          <p className="mt-2 border-t border-brand-200 pt-2 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink-soft">
            <span className="font-semibold text-brand-800">最该注意的：</span>
            {t.watch}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ── 常用词一键查 ────────────────────────────────────────── */

export function TermChips({ terms, onPick, disabled }: { terms: string[]; onPick: (t: string) => void; disabled?: boolean }) {
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="text-[length:calc(13px*var(--fs))] text-ink-mute">常被问到的词，点一下直接查</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {terms.map((t) => (
          <button
            key={t}
            type="button"
            disabled={disabled}
            onClick={() => onPick(t)}
            className="min-h-9 rounded-full border border-brand-200 bg-paper px-3.5 py-2 text-[length:calc(13px*var(--fs))] font-medium text-brand-700 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── 案例卡 ──────────────────────────────────────────────── */

export interface SampleCard {
  id: string;
  label: string;
  desc: string;
  image?: string;
  text: string;
}

/** 「理财广告（高风险）」→ name 与 tag 两段，tag 决定配色 */
function splitLabel(label: string) {
  const m = label.match(/^(.*?)（(.*)）$/);
  return m ? { name: m[1], tag: m[2] } : { name: label, tag: "" };
}

export function SampleCases({
  samples,
  onPick,
  disabled,
  heading = "不知道从哪开始？点一个案例，直接看结果",
}: {
  samples: SampleCard[];
  onPick: (s: SampleCard) => void;
  disabled?: boolean;
  heading?: string;
}) {
  return (
    <section aria-label="案例" className="mt-10">
      <h2 className="text-[length:calc(18px*var(--fs))] font-bold tracking-tight text-brand-950">{heading}</h2>
      <p className="mt-1 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
        下面都是我们自己做的仿真样本，机构名和数字全是虚构的，不指向任何真实公司或产品。
      </p>

      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {samples.map((s) => {
          const { name, tag } = splitLabel(s.label);
          const danger = tag.includes("高风险");
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(s)}
                className="cd-lift group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-line bg-paper text-left shadow-card hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex h-32 items-center justify-center overflow-hidden border-b border-line bg-paper-soft">
                  {s.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.image}
                      alt={`${name}示例截图`}
                      className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <TextPreview text={s.text} />
                  )}
                </span>
                <span className="flex flex-1 flex-col p-4">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[length:calc(15px*var(--fs))] font-semibold text-ink">{name}</span>
                    {tag && (
                      <span
                        className={
                          danger
                            ? "rounded-full border border-risk-red-line bg-risk-red-bg px-2 py-0.5 text-[length:calc(12px*var(--fs))] text-risk-red"
                            : "rounded-full border border-brand-300 bg-brand-50 px-2 py-0.5 text-[length:calc(12px*var(--fs))] text-brand-700"
                        }
                      >
                        {tag}
                      </span>
                    )}
                  </span>
                  <span className="mt-1.5 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">{s.desc}</span>
                  <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[length:calc(13px*var(--fs))] font-semibold text-brand-700 group-hover:text-brand-900">
                    走一遍完整流程
                    <Icon name="arrowRight" className="h-[1em] w-[1em] transition-transform group-hover:translate-x-0.5" />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 无配图的样本用原文前几行做预览，避免卡片空一块 */
function TextPreview({ text }: { text: string }) {
  return (
    <span className="block h-full w-full overflow-hidden p-3 text-[length:calc(11px*var(--fs))] leading-snug text-ink-mute">
      {text.split("\n").slice(0, 5).join("\n")}
    </span>
  );
}
