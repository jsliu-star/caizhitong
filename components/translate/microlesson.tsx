"use client";

/**
 * 定向微课。
 *
 * 读共享档案的 `encountered`——那是用户在安全盾里**实际遇到过**的违规特征 patternId。
 * 遇到过什么，就在这里补什么，不做通用科普轰炸。
 *
 * 每条都带一行「依据」，让用户能当场对照验证这条推送是怎么来的，
 * 措辞与安全盾侧的个性化提示（lib/shield/personalize.ts）保持一致。
 */
import { useState } from "react";
import quizData from "@/data/quiz.json";
import patternsData from "@/data/violation-patterns.json";

interface Lesson {
  patternId: string;
  title: string;
  body: string;
  linkQuestion?: string;
}

const LESSONS = (quizData as { microLessons: { items: Lesson[] } }).microLessons.items;

/** patternId → 特征名称，用于「依据」行。只读引用规则库，不修改 */
const TYPE_OF: Record<string, string> = {
  ...Object.fromEntries(
    (patternsData as { patterns: Array<{ id: string; type: string }> }).patterns.map((p) => [p.id, p.type]),
  ),
  "vp-yield-outlier": "收益率明显高于市场常见水平",
};

const SHOW_FIRST = 2;

export function MicroLessons({
  encountered,
  onQuizJump,
}: {
  encountered: string[];
  onQuizJump: (questionId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const matched = LESSONS.filter((l) => encountered.includes(l.patternId));

  if (matched.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-paper-soft p-4 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-mute">
        这里会放<b className="font-semibold text-ink-soft">定向微课</b>
        ：去识别一段广告，这里会按命中的话术补对应的解释。
      </p>
    );
  }

  const shown = expanded ? matched : matched.slice(0, SHOW_FIRST);

  return (
    <section aria-labelledby="micro-h" className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-5">
      <h2 id="micro-h" className="text-[length:calc(16px*var(--fs))] font-bold text-brand-900">
        给你的定向微课 · {matched.length} 条
      </h2>
      <p className="mt-1.5 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
        按你在安全盾里<b className="font-semibold text-brand-800">实际遇到过</b>的话术类型挑的，不是通用科普。
      </p>

      <ul className="mt-4 space-y-3">
        {shown.map((l) => (
          <li key={l.patternId} className="rounded-xl border border-line bg-paper p-4">
            <h3 className="text-[length:calc(15px*var(--fs))] font-bold text-brand-900">{l.title}</h3>
            <p className="mt-2 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink">{l.body}</p>
            <p className="mt-2.5 text-[length:calc(12px*var(--fs))] leading-relaxed text-ink-mute">
              依据：安全盾在你分析过的内容里识别到「{TYPE_OF[l.patternId] ?? l.patternId}」特征
            </p>
            {l.linkQuestion && (
              <button
                type="button"
                onClick={() => onQuizJump(l.linkQuestion as string)}
                className="mt-3 min-h-9 rounded-lg border border-brand-300 bg-paper px-3.5 py-2 text-[length:calc(13px*var(--fs))] font-semibold text-brand-800 transition hover:bg-brand-100"
              >
                做一道对应的题 →
              </button>
            )}
          </li>
        ))}
      </ul>

      {matched.length > SHOW_FIRST && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-[length:calc(13px*var(--fs))] font-semibold text-brand-700 underline transition hover:text-brand-900"
        >
          {expanded ? "收起" : `展开剩下 ${matched.length - SHOW_FIRST} 条`}
        </button>
      )}
    </section>
  );
}
