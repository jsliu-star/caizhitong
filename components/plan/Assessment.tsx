"use client";

import { useMemo, useState } from "react";
import {
  activeQuestions,
  nextQuestion,
  scoreAnswers,
  type Answers,
  type Question,
} from "@/lib/plan/questions";

/**
 * 自适应测评向导。
 * 每答一题就重新计算「下一题该问什么」——问卷不是固定的一张纸。
 */
export function Assessment({
  onDone,
  initial,
}: {
  onDone: (answers: Answers) => void;
  initial?: Answers;
}) {
  const [answers, setAnswers] = useState<Answers>(initial ?? {});
  const [history, setHistory] = useState<string[]>([]);
  const [numInput, setNumInput] = useState("");

  const q = useMemo(() => nextQuestion(answers), [answers]);
  const planned = useMemo(() => activeQuestions(answers), [answers]);
  const answeredCount = planned.filter((p) => p.id in answers).length;
  const progress = Math.round((answeredCount / Math.max(1, planned.length)) * 100);

  const answer = (id: string, value: string | number) => {
    const next = { ...answers, [id]: value };
    setHistory((h) => [...h, id]);
    setNumInput("");
    setAnswers(next);
    if (!nextQuestion(next)) onDone(next);
  };

  const back = () => {
    const last = history[history.length - 1];
    if (!last) return;
    const next = { ...answers };
    delete next[last];
    setHistory((h) => h.slice(0, -1));
    setAnswers(next);
  };

  if (!q) return null;

  return (
    <div className="rounded-2xl border border-line bg-paper shadow-card p-6">
      {/* 进度 */}
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-50">
          <div
            className="h-full rounded-full bg-brand-600 transition-all duration-300"
            style={{ width: `${Math.max(6, progress)}%` }}
          />
        </div>
        <span className="shrink-0 text-[length:calc(13px*var(--fs))] tabular-nums text-ink-mute">
          {answeredCount + 1} / {planned.length}
        </span>
      </div>

      <p className="mt-5 text-[length:calc(13px*var(--fs))] font-semibold uppercase tracking-widest text-brand-600">
        {answeredCount === 0 ? "开始测评" : "根据你上一题的回答，接下来问"}
      </p>
      <h2 className="mt-2 text-[length:calc(21px*var(--fs))] font-bold leading-snug text-brand-950">{q.text}</h2>
      {q.hint && <p className="mt-2 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink-soft">{q.hint}</p>}

      {q.kind === "single" && q.options && (
        <div className="mt-5 space-y-2">
          {q.options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => answer(q.id, o.value)}
              className="group w-full rounded-xl border border-line bg-paper shadow-card p-4 text-left transition hover:border-brand-500 hover:bg-brand-50"
            >
              <span className="block text-[length:calc(15px*var(--fs))] font-semibold text-ink group-hover:text-brand-900">{o.label}</span>
              {o.desc && <span className="mt-0.5 block text-[length:calc(13px*var(--fs))] text-ink-mute">{o.desc}</span>}
            </button>
          ))}
        </div>
      )}

      {q.kind === "number" && (
        <form
          className="mt-5 flex flex-wrap items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(numInput);
            if (Number.isFinite(v) && v >= 0) answer(q.id, v);
          }}
        >
          <input
            type="number"
            inputMode="numeric"
            min={q.min ?? 0}
            step={q.step ?? 1}
            value={numInput}
            onChange={(e) => setNumInput(e.target.value)}
            placeholder="请输入"
            className="w-48 rounded-lg border border-line bg-paper-soft px-3 py-2.5 text-[length:calc(16px*var(--fs))] tabular-nums outline-none focus:border-brand-400"
          />
          <span className="text-[length:calc(14px*var(--fs))] text-ink-mute">{q.unit}</span>
          <button
            type="submit"
            disabled={!numInput}
            className="rounded-lg bg-brand-800 px-5 py-2.5 text-[length:calc(15px*var(--fs))] font-semibold text-on-brand transition hover:bg-brand-900 disabled:bg-brand-200"
          >
            下一步
          </button>
        </form>
      )}

      <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
        <button
          type="button"
          onClick={back}
          disabled={history.length === 0}
          className="text-[length:calc(14px*var(--fs))] text-ink-mute transition hover:text-brand-700 disabled:opacity-40"
        >
          ← 上一题
        </button>
        <span className="text-[length:calc(12px*var(--fs))] text-ink-mute">题目会根据你的回答变化，共 {planned.length} 题</span>
      </div>
    </div>
  );
}

/** 供结果页复用 */
export { scoreAnswers };
export type { Question };
