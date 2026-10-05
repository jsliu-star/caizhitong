"use client";

/**
 * 知识闯关。答完立刻出解释——这是这一页真正的产品价值：
 * 用户不是来考试的，是来在犯错的那一秒钟被告知「为什么错」。
 */
import { useEffect, useMemo, useState } from "react";
import quizData from "@/data/quiz.json";
import { Gauge, StatTile } from "@/components/viz";
import type { Profile } from "@/lib/profile";
import { TierBadge } from "./badge";
import { award, CATEGORY_META, tierOf, TIERS, type QuizLevel } from "./state";
import { Icon } from "@/components/ui/Icon";
import { mascotSay, pick } from "@/components/assistant/lines";
import { stageOf } from "@/lib/stage";

const LEVELS = (quizData as { levels: QuizLevel[] }).levels;
const QUIZ_TOTAL = LEVELS.reduce((s, l) => s + l.questions.reduce((t, q) => t + q.points, 0), 0);
/** 骗局识别测试的满分，5 段 × 10 分——写在这里是为了让进度环的分母诚实 */
export const JUDGE_PER_SEGMENT = 10;
export const JUDGE_TOTAL = 50;
const MAX_POINTS = QUIZ_TOTAL + JUDGE_TOTAL;

export function findLevelOfQuestion(questionId: string) {
  for (const lv of LEVELS) {
    const idx = lv.questions.findIndex((q) => q.id === questionId);
    if (idx >= 0) return { level: lv, index: idx };
  }
  return null;
}

/** 术语 → 题目 id，供词典的「考我一下」跳转 */
export const TERM_TO_QUESTION: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const lv of LEVELS) for (const q of lv.questions) if (q.linkTerm && !map[q.linkTerm]) map[q.linkTerm] = q.id;
  return map;
})();

export function Quiz({
  profile,
  onProfile,
  jumpQuestion,
  onJumpConsumed,
}: {
  profile: Profile;
  onProfile: (p: Profile) => void;
  jumpQuestion: string | null;
  onJumpConsumed: () => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [finished, setFinished] = useState(false);

  const active = useMemo(() => LEVELS.find((l) => l.id === activeId) ?? null, [activeId]);

  // ?level=<关卡 id>：从档案页「推荐先学」直接进入某一关
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("level");
    if (id && LEVELS.some((l) => l.id === id)) {
      setActiveId(id);
      setQIndex(0);
      setPicks({});
      setFinished(false);
    }
  }, []);

  // 词典「考我一下」→ 直接落到那一题
  useEffect(() => {
    if (!jumpQuestion) return;
    const found = findLevelOfQuestion(jumpQuestion);
    if (found) {
      setActiveId(found.level.id);
      setQIndex(found.index);
      setPicks({});
      setFinished(false);
    }
    onJumpConsumed();
  }, [jumpQuestion, onJumpConsumed]);

  const points = profile.knowledge.points;
  const { tier, index: tierIndex, next, toNext } = tierOf(points);

  const openLevel = (id: string) => {
    setActiveId(id);
    setQIndex(0);
    setPicks({});
    setFinished(false);
  };

  const backToList = () => {
    setActiveId(null);
    setFinished(false);
  };

  const finish = (lv: QuizLevel, finalPicks: Record<string, string>) => {
    const correctQs = lv.questions.filter((q) => {
      const picked = finalPicks[q.id];
      return picked && q.options.find((o) => o.id === picked)?.correct;
    });
    const wrongQs = lv.questions.filter((q) => !correctQs.includes(q));
    const p = award({
      newlyEarned: correctQs.map((q) => ({ id: q.id, points: q.points })),
      clearedLevelId: correctQs.length >= lv.passScore ? lv.id : undefined,
      weakTerms: wrongQs.map((q) => q.linkTerm).filter((t): t is string => Boolean(t)),
      masteredTerms: correctQs.map((q) => q.linkTerm).filter((t): t is string => Boolean(t)),
    });
    onProfile(p);
    setFinished(true);
    mascotSay(
      correctQs.length >= lv.passScore
        ? { mood: "cheer", text: "过关啦！" }
        : { mood: "happy", text: "差一点点，再来一次就过了。" },
    );
  };

  // ── 结算 ──────────────────────────────────────────────
  if (active && finished) {
    const correctQs = active.questions.filter((q) => {
      const picked = picks[q.id];
      return picked && q.options.find((o) => o.id === picked)?.correct;
    });
    const wrongQs = active.questions.filter((q) => !correctQs.includes(q));
    const passed = correctQs.length >= active.passScore;
    return (
      <div className="cd-in">
        <section
          className={`rounded-2xl border-2 p-6 text-center ${
            passed ? "border-brand-200 bg-brand-50" : "border-risk-amber-line bg-risk-amber-bg"
          }`}
        >
          <p className="text-[length:calc(13px*var(--fs))] font-semibold tracking-widest text-ink-mute">{active.name}</p>
          <p className={`mt-2 text-[length:calc(30px*var(--fs))] font-bold ${passed ? "text-brand-900" : "text-risk-amber"}`}>
            答对 {correctQs.length} / {active.questions.length}
          </p>
          <p className="mt-2 text-[length:calc(15px*var(--fs))] text-ink-soft">
            {passed
              ? "通关了。这一关的知识点已经记到你的档案里。"
              : `还差一点，答对 ${active.passScore} 题通关。错题解释在下面。`}
          </p>
        </section>

        {wrongQs.length > 0 && (
          <section className="mt-5">
            <h3 className="text-[length:calc(15px*var(--fs))] font-bold text-brand-900">这几题再看一眼</h3>
            <ul className="mt-3 space-y-3">
              {wrongQs.map((q) => (
                <li key={q.id} className="rounded-xl border border-line bg-paper shadow-card p-4">
                  <p className="text-[length:calc(14px*var(--fs))] font-semibold leading-relaxed text-ink">{q.stem}</p>
                  <p className="mt-2 text-[length:calc(14px*var(--fs))] font-medium leading-relaxed text-brand-800">
                    正确答案：{q.options.find((o) => o.correct)?.text}
                  </p>
                  <p className="mt-2 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">{q.explain}</p>
                  {q.linkTerm && (
                    <p className="mt-2 text-[length:calc(12px*var(--fs))] text-ink-mute">
                      已记入你的薄弱术语：{q.linkTerm}——
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => openLevel(active.id)}
            className="rounded-xl bg-brand-800 px-5 py-2.5 text-[length:calc(15px*var(--fs))] font-semibold text-on-brand transition hover:bg-brand-900"
          >
            再来一次
          </button>
          <button
            type="button"
            onClick={backToList}
            className="rounded-xl border border-brand-200 bg-paper px-4 py-2.5 text-[length:calc(14px*var(--fs))] font-semibold text-brand-800 transition hover:bg-brand-50"
          >
            回到关卡列表
          </button>
        </div>
      </div>
    );
  }

  // ── 答题中 ────────────────────────────────────────────
  if (active) {
    const q = active.questions[qIndex];
    const picked = picks[q.id];
    const pickedOpt = q.options.find((o) => o.id === picked);
    const answered = Boolean(picked);
    const isLast = qIndex === active.questions.length - 1;

    return (
      <div>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={backToList}
            className="text-[length:calc(13px*var(--fs))] font-medium text-ink-mute transition hover:text-brand-800"
          >
            ← 退出这一关
          </button>
          <p className="text-[length:calc(13px*var(--fs))] font-semibold text-ink-soft">
            {active.name} · 第 {qIndex + 1} / {active.questions.length} 题
          </p>
        </div>

        {/* 进度条 */}
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-brand-100">
          <div
            className="h-full rounded-full bg-brand-600 transition-all"
            style={{ width: `${((qIndex + (answered ? 1 : 0)) / active.questions.length) * 100}%` }}
          />
        </div>

        <section key={q.id} className="cd-in mt-5 rounded-2xl border border-line bg-paper shadow-card p-5 sm:p-6">
          <p className="text-[length:calc(17px*var(--fs))] font-semibold leading-relaxed text-brand-950">{q.stem}</p>

          <ul className="mt-4 space-y-2.5">
            {q.options.map((o) => {
              const chosen = picked === o.id;
              let cls = "border-line bg-paper-soft hover:border-brand-300 hover:bg-brand-50";
              if (answered) {
                if (o.correct) cls = "border-risk-green-line bg-risk-green-bg";
                else if (chosen) cls = "border-risk-red-line bg-risk-red-bg";
                else cls = "border-line bg-paper-soft opacity-60";
              }
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    disabled={answered}
                    onClick={() => {
                      setPicks((p) => ({ ...p, [q.id]: o.id }));
                      mascotSay(
                        o.correct
                          ? pick([
                              { mood: "cheer", text: "答对了！" },
                              { mood: "cheer", text: "漂亮，这个记住了。" },
                              { mood: "wink", text: "这题难不倒你。" },
                            ])
                          : pick([
                              { mood: "shy", text: "没关系，看看下面的解释。" },
                              { mood: "shy", text: "这题容易错，看完解释就记住了。" },
                            ]),
                      );
                    }}
                    className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition disabled:cursor-default ${cls}`}
                  >
                    <span
                      aria-hidden
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[length:calc(13px*var(--fs))] font-bold ${
                        answered && o.correct
                          ? "bg-risk-green text-on-brand"
                          : answered && chosen
                            ? "bg-risk-red text-on-brand"
                            : "bg-brand-100 text-brand-800"
                      }`}
                    >
                      {answered && o.correct ? <Icon name="check" className="h-[1.1em] w-[1.1em]" strokeWidth={2.5} /> : answered && chosen ? <Icon name="x" className="h-[1.1em] w-[1.1em]" strokeWidth={2.5} /> : o.id.toUpperCase()}
                    </span>
                    <span className="text-[length:calc(15px*var(--fs))] leading-relaxed text-ink">{o.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {answered && (
            <div
              className={`cd-in mt-4 rounded-xl border-2 p-4 ${
                pickedOpt?.correct
                  ? "border-risk-green-line bg-risk-green-bg"
                  : "border-risk-amber-line bg-risk-amber-bg"
              }`}
            >
              <p
                className={`text-[length:calc(15px*var(--fs))] font-bold ${pickedOpt?.correct ? "text-risk-green" : "text-risk-amber"}`}
              >
                {pickedOpt?.correct ? `答对了 · +${q.points} 分` : "这题答错了"}
              </p>
              <p className="mt-2 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink">{q.explain}</p>
            </div>
          )}

          {answered && (
            <button
              type="button"
              onClick={() => (isLast ? finish(active, picks) : setQIndex((i) => i + 1))}
              className="mt-4 w-full rounded-xl bg-brand-800 px-5 py-3 text-[length:calc(15px*var(--fs))] font-semibold text-on-brand transition hover:bg-brand-900 sm:w-auto"
            >
              {isLast ? "看结果" : "下一题 →"}
            </button>
          )}
        </section>
      </div>
    );
  }

  // ── 关卡列表 ──────────────────────────────────────────
  const clearedCount = LEVELS.filter((l) => profile.knowledge.cleared.includes(l.id)).length;
  // 跳过已通关的：直接指向第一个没过的关卡，不重复考已经会的
  // 有人生阶段时，先推荐这个阶段最该学的那一关（还没通关的）；否则按顺序
  const stage = stageOf(profile);
  const stagePick = stage?.learn
    .map((id) => LEVELS.find((l) => l.id === id))
    .find((l) => l && !profile.knowledge.cleared.includes(l.id));
  const nextLevel = stagePick ?? LEVELS.find((l) => !profile.knowledge.cleared.includes(l.id));

  return (
    <div>
      <section className="rounded-2xl border border-line bg-paper shadow-card p-5 sm:p-6">
        <h2 className="sr-only">我的学习档案</h2>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <TierBadge index={tierIndex} />
            <div>
              <p className="text-[length:calc(13px*var(--fs))] text-ink-mute">当前等级</p>
              <p className="text-[length:calc(22px*var(--fs))] font-bold leading-tight text-brand-900">{tier.name}</p>
              <p className="mt-1 max-w-[24rem] text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">{tier.meaning}</p>
            </div>
          </div>
          <div className="sm:ml-auto">
            <Gauge
              value={MAX_POINTS ? points / MAX_POINTS : 0}
              display={`${points}`}
              label={`累计积分 / 满分 ${MAX_POINTS}`}
              size={148}
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="已通关" value={`${clearedCount}`} unit={`/ ${LEVELS.length}`} />
          <StatTile
            label={next ? `距「${next.name}」` : "已是最高等级"}
            value={next ? `${toNext}` : "满级"}
            unit={next ? "分" : undefined}
          />
          <StatTile
            label="薄弱术语"
            value={`${profile.knowledge.weakTerms.length}`}
            unit="个"
            note={profile.knowledge.weakTerms.length ? "在下方「术语词典」已置顶" : "答错的术语会自动记在这里"}
          />
        </div>
        <p className="mt-4 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-mute">
          积分和通关记录写进共享档案。规划师会按你的等级调整讲解深度，安全盾会跳过你已经掌握的科普。
          满分 {MAX_POINTS} 分里有 {JUDGE_TOTAL} 分来自「骗局识别测试」——想到「能护家人」，得去和财智通比一场。
        </p>
      </section>

      {nextLevel ? (
        <div className="mt-5 flex flex-col gap-3 rounded-2xl border-2 border-brand-200 bg-brand-50 p-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-[length:calc(13px*var(--fs))] font-semibold tracking-wide text-brand-600">
              {stagePick && stage
                ? `按你的人生阶段「${stage.label}」，推荐先闯这一关`
                : clearedCount > 0
                  ? `已通关 ${clearedCount} 关，跳过它们，从这里继续`
                  : "从这一关开始"}
            </p>
            <p className="mt-1 text-[length:calc(17px*var(--fs))] font-bold text-brand-950">{nextLevel.name}</p>
            <p className="mt-0.5 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">{nextLevel.intro}</p>
          </div>
          <button
            type="button"
            onClick={() => openLevel(nextLevel.id)}
            className="shrink-0 rounded-xl bg-brand-800 px-5 py-3 text-[length:calc(15px*var(--fs))] font-semibold text-on-brand transition hover:bg-brand-900"
          >
            {clearedCount > 0 ? "继续闯关" : "开始闯关"}
          </button>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border-2 border-brand-200 bg-brand-50 p-5">
          <p className="text-[length:calc(17px*var(--fs))] font-bold text-brand-950">全部关卡通关</p>
          <p className="mt-1 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
            已通关的不再推送。可以重做，不重复计分。
          </p>
        </div>
      )}

      <h2 className="mt-8 text-[length:calc(17px*var(--fs))] font-bold text-brand-950">全部关卡</h2>
      <ul className="mt-3 space-y-3">
        {LEVELS.map((lv) => {
          const done = profile.knowledge.cleared.includes(lv.id);
          const meta = CATEGORY_META[lv.category];
          const total = lv.questions.reduce((s, q) => s + q.points, 0);
          return (
            <li key={lv.id}>
              <button
                type="button"
                onClick={() => openLevel(lv.id)}
                className={`flex w-full items-center gap-4 rounded-2xl border p-5 text-left transition hover:border-brand-300 hover:bg-brand-50 ${
                  done ? "border-line bg-paper-soft" : "border-line bg-paper"
                }`}
              >
                <span
                  aria-hidden
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[length:calc(13px*var(--fs))] font-bold ${
                    done ? "bg-brand-800 text-brand-100" : "bg-brand-100 text-brand-800"
                  }`}
                >
                  {done ? <Icon name="check" className="h-5 w-5" strokeWidth={2.5} /> : meta.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[length:calc(16px*var(--fs))] font-bold text-brand-950">{lv.name}</span>
                  <span className="mt-0.5 block text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">{lv.intro}</span>
                  <span className="mt-1.5 block text-[length:calc(12px*var(--fs))] text-ink-mute">
                    {lv.questions.length} 题 · 满分 {total} 分 · 答对 {lv.passScore} 题通关
                    {done && " · 已通关，可跳过"}
                  </span>
                </span>
                <span aria-hidden className="text-[length:calc(18px*var(--fs))] text-brand-600">
                  →
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <h2 className="mt-8 text-[length:calc(17px*var(--fs))] font-bold text-brand-950">五个等级</h2>
      <ol className="mt-3 grid gap-2 rounded-2xl border border-line bg-paper-soft p-5 sm:grid-cols-5">
        {TIERS.map((t, i) => (
          <li key={t.name} className="flex items-center gap-2 sm:flex-col sm:items-start">
            <span
              className={`h-1.5 w-8 shrink-0 rounded-full sm:w-full ${i <= tierIndex ? "bg-brand-600" : "bg-brand-100"}`}
            />
            <span className={`text-[length:calc(13px*var(--fs))] font-semibold ${i <= tierIndex ? "text-brand-900" : "text-ink-mute"}`}>
              {t.name}
            </span>
            <span className="text-[length:calc(12px*var(--fs))] text-ink-mute sm:mt-0.5">{t.min} 分</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
