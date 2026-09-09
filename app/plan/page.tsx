"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Assessment } from "@/components/plan/Assessment";
import { Result } from "@/components/plan/Result";
import { DebtCalculator, EmergencyCalculator } from "@/components/plan/Calculators";
import { Chat } from "@/components/plan/Chat";
import { PageShell } from "@/components/ui/PageShell";
import { findConflicts, scoreAnswers, type Answers } from "@/lib/plan/questions";
import { AGE_BAND_OF } from "@/lib/plan/questions";
import { DEMO_PROFILE, loadProfile, saveProfile } from "@/lib/profile";

const ANSWERS_KEY = "caidun.plan.answers.v1";

const DEMO_ANSWERS: Answers = {
  age: "26-35",
  source: "salary",
  stability: "normal",
  horizon: "6-12m",
  amount: 200000,
  emergency: "lt3",
  loss: "add",
  drawdown: "30",
  experience: "stock",
  debt: "high",
  kBenchmark: "wrong-promise",
};

export default function PlanPage() {
  const [answers, setAnswers] = useState<Answers | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // ?demo=1 直接载入示例答卷。答辩时可以把这个链接直接给评委，
    // 不必现场填完 11 道题；也方便回归截图。
    if (new URLSearchParams(window.location.search).get("demo") === "1") {
      commit(DEMO_ANSWERS);
      saveProfile({ encountered: DEMO_PROFILE.encountered });
      setReady(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(ANSWERS_KEY);
      if (raw) setAnswers(JSON.parse(raw) as Answers);
    } catch {
      /* noop */
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (a: Answers) => {
    const s = scoreAnswers(a);
    const conflicts = findConflicts(a, s);
    setAnswers(a);
    try {
      window.localStorage.setItem(ANSWERS_KEY, JSON.stringify(a));
    } catch {
      /* noop */
    }
    saveProfile({
      ageBand: AGE_BAND_OF(a),
      riskType: s.riskType,
      riskScore: s.score,
      riskDims: s.dims,
      conflicts: conflicts.map((c) => c.title),
      knowledge: { ...loadProfile().knowledge, level: s.knowledgeLevel, weakTerms: s.weakTerms },
    });
  };

  const redo = () => {
    setAnswers(null);
    try {
      window.localStorage.removeItem(ANSWERS_KEY);
    } catch {
      /* noop */
    }
  };

  return (
    <PageShell
      title="规划师"
      py="py-10"
      footLink={
        <Link href="/" className="font-semibold text-brand-700 underline">
          ← 遇到可疑广告，去识别
        </Link>
      }
    >
      <header>
        <h1 className="text-[length:calc(26px*var(--fs))] font-bold tracking-tight text-brand-950 sm:text-[length:calc(32px*var(--fs))]">规划师</h1>
        <p className="mt-2 text-[length:calc(15px*var(--fs))] text-ink-soft">
          有话直接问。想要更贴你的回答，再往下做测评——它会把测出来的东西记进档案，问答就能用上。
        </p>
      </header>

      {/* 问答放在最上面：人们不想读长报告，只想直接问一句。
          读共享档案，越界问题由规则层拒答（见 lib/plan/advisor.ts）*/}
      <div data-outline="问问规划师" className="mt-8">
        <Chat />
      </div>

      {ready && !answers && (
        <div data-outline="风险测评与画像" className="mt-10 space-y-4 border-t border-line pt-10">
          <Assessment onDone={commit} />
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper-soft p-4">
            <p className="flex-1 text-[length:calc(13px*var(--fs))] text-ink-mute">演示用：一键载入示例回答</p>
            <button
              type="button"
              onClick={() => {
                commit(DEMO_ANSWERS);
                saveProfile({ encountered: DEMO_PROFILE.encountered });
              }}
              className="shrink-0 rounded-lg border border-brand-300 bg-paper px-4 py-2 text-[length:calc(13px*var(--fs))] font-semibold text-brand-700 transition hover:bg-brand-50"
            >
              体验模式
            </button>
          </div>
        </div>
      )}

      {answers && (
        <div className="mt-10 border-t border-line pt-10">
          <Result answers={answers} onRedo={redo} />
        </div>
      )}

      <div data-outline="两个计算器" className="mt-10 space-y-6 border-t border-line pt-10">
        <h2 className="text-[length:calc(16px*var(--fs))] font-semibold text-brand-900">两个计算器</h2>
        <DebtCalculator />
        <EmergencyCalculator />
      </div>

      <p className="mt-8 text-[length:calc(13px*var(--fs))] text-ink-mute lg:hidden">
        <Link href="/" className="font-semibold text-brand-700 underline">
          遇到可疑广告 → 去识别
        </Link>
      </p>
    </PageShell>
  );
}
