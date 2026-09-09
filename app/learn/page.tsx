"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Dict } from "@/components/translate/dict";
import { Judge } from "@/components/translate/judge";
import { MicroLessons } from "@/components/translate/microlesson";
import { JUDGE_TOTAL, Quiz } from "@/components/translate/quiz";
import quizData from "@/data/quiz.json";
import { TierBadge } from "@/components/translate/badge";
import { maxPoints, tierOf } from "@/components/translate/state";
import { EMPTY_PROFILE, loadLargeText, loadProfile, type Profile } from "@/lib/profile";
import { PageShell } from "@/components/ui/PageShell";

type Tab = "quiz" | "judge" | "dict";

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: "quiz", label: "闯关", hint: "九关五十四题，答错就地讲清" },
  { id: "judge", label: "识别测试", hint: "五段文案，和 AI 比一比" },
  { id: "dict", label: "术语", hint: "点开才展开，不用背" },
];

export default function LearnPage() {
  const [tab, setTab] = useState<Tab>("quiz");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [jump, setJump] = useState<string | null>(null);

  useEffect(() => {
    setProfile(loadProfile());
    document.body.dataset.large = loadLargeText() ? "1" : "0";
    // ?tab=quiz|judge|dict —— 让导航下拉菜单能直接落到某一块
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "quiz" || t === "judge" || t === "dict") setTab(t);
  }, []);

  const pts = profile.knowledge.points;
  const { tier, index, toNext } = tierOf(pts);
  // 直接从题库算满分，避免依赖未导出的常量
  const quizTotal = (quizData.levels as Array<{ questions: Array<{ points: number }> }>).reduce(
    (a, lv) => a + lv.questions.reduce((b, q) => b + q.points, 0),
    0,
  );
  const total = maxPoints(quizTotal, JUDGE_TOTAL);

  const onQuizJump = (questionId: string) => {
    setJump(questionId);
    setTab("quiz");
  };

  return (
    <PageShell title="学习">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[length:calc(26px*var(--fs))] font-bold tracking-tight text-brand-950 sm:text-[length:calc(32px*var(--fs))]">学习</h1>
          <p className="mt-2 text-[length:calc(15px*var(--fs))] text-ink-soft">短平快搞懂金融常识，顺手学会识别骗局。</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3">
          <TierBadge index={index} size={44} />
          <div>
            <p className="text-[length:calc(14px*var(--fs))] font-semibold text-brand-900">{tier.name}</p>
            <p className="text-[length:calc(12px*var(--fs))] text-ink-mute">
              {pts} / {total} 分{toNext > 0 && ` · 再 ${toNext} 分升级`}
            </p>
          </div>
        </div>
      </header>

      <MicroLessons encountered={profile.encountered} onQuizJump={onQuizJump} />

      <nav className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-10 rounded-xl px-4 py-2.5 text-left transition ${
              tab === t.id ? "bg-brand-800 text-white" : "border border-line bg-paper text-brand-800 hover:bg-brand-50"
            }`}
          >
            <span className="block text-[length:calc(15px*var(--fs))] font-semibold">{t.label}</span>
            <span className={`block text-[length:calc(12px*var(--fs))] ${tab === t.id ? "text-brand-200" : "text-ink-mute"}`}>{t.hint}</span>
          </button>
        ))}
        <Link
          href="/learn/cases"
          className="min-h-10 rounded-xl border border-line bg-paper px-4 py-2.5 text-left transition hover:bg-brand-50"
        >
          <span className="block text-[length:calc(15px*var(--fs))] font-semibold text-brand-800">骗局图鉴</span>
          <span className="block text-[length:calc(12px*var(--fs))] text-ink-mute">九类套路的推进剧本</span>
        </Link>
      </nav>

      <div className="mt-5">
        {tab === "quiz" && (
          <Quiz profile={profile} onProfile={setProfile} jumpQuestion={jump} onJumpConsumed={() => setJump(null)} />
        )}
        {tab === "judge" && <Judge profile={profile} onProfile={setProfile} />}
        {tab === "dict" && <Dict weakTerms={profile.knowledge.weakTerms} onQuizJump={onQuizJump} />}
      </div>


    </PageShell>
  );
}
