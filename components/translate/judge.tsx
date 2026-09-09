"use client";

/**
 * 骗局识别测试 · 你 vs 财智通。
 *
 * 五段仿真文案，用户先自己判，再和规则引擎的判定并排看。
 * 判定由 /api/translate/judge 实时算出，题库里不预存答案——所以页面上显示的
 * 「财智通怎么判」就是引擎的真实输出，不是我们手写的漂亮结果。
 */
import { useState } from "react";
import quizData from "@/data/quiz.json";
import { StatTile } from "@/components/viz";
import type { Profile } from "@/lib/profile";
import { awardJudge } from "./state";
import { JUDGE_PER_SEGMENT } from "./quiz";

interface JudgeItem {
  id: string;
  label: string;
  text: string;
}

const ITEMS = (quizData as { judgeSet: { items: JudgeItem[] } }).judgeSet.items;

type UserSay = "bad" | "ok";
type Level = "red" | "yellow" | "green";

interface JudgeResult {
  id: string;
  label: string;
  level: Level;
  hardTypes: number;
  highTypes: number;
  hits: Array<{ patternId: string; type: string; severity: "hard" | "high"; matched: string; plain: string }>;
  missing: string[];
}

const LEVEL_META: Record<Level, { dot: string; name: string; cls: string }> = {
  red: { dot: "🔴", name: "高风险", cls: "text-risk-red" },
  yellow: { dot: "🟠", name: "需警惕", cls: "text-risk-amber" },
  green: { dot: "🟢", name: "未识别到违规表述特征", cls: "text-risk-green" },
};

/** 引擎判定折算成「有问题 / 没问题」，才能和用户的二选一对齐 */
const asUserSay = (level: Level): UserSay => (level === "green" ? "ok" : "bad");

export function Judge({ profile, onProfile }: { profile: Profile; onProfile: (p: Profile) => void }) {
  const [says, setSays] = useState<Record<string, UserSay>>({});
  const [results, setResults] = useState<JudgeResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAnswered = ITEMS.every((it) => says[it.id]);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/translate/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ITEMS.map((i) => i.id) }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "判定失败");
      const rs = json.results as JudgeResult[];
      setResults(rs);
      const agree = rs.filter((x) => asUserSay(x.level) === says[x.id]).length;
      onProfile(awardJudge(agree, JUDGE_PER_SEGMENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : "判定失败");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setSays({});
    setResults(null);
    setError(null);
  };

  // ── 结果：并排对比 ────────────────────────────────────
  if (results) {
    const rows = results.map((r) => ({ ...r, mine: says[r.id], agree: asUserSay(r.level) === says[r.id] }));
    const agree = rows.filter((r) => r.agree).length;
    /** 用户说没问题、引擎却标记了的段落——这是最该讲清的那一类 */
    const missed = rows.filter((r) => r.mine === "ok" && r.level !== "green");
    /** 用户说有问题、引擎没识别到的段落 */
    const overCautious = rows.filter((r) => r.mine === "bad" && r.level === "green");

    return (
      <div className="cd-in">
        <section className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-5 sm:p-6">
          <p className="text-[length:calc(13px*var(--fs))] font-semibold tracking-widest text-brand-600">你 vs 财智通</p>
          <p className="mt-2 text-[length:calc(24px*var(--fs))] font-bold text-brand-900 sm:text-[length:calc(28px*var(--fs))]">
            5 段里有 {agree} 段判断一致
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="一致" value={`${agree}`} unit="/ 5" />
            <StatTile
              label="你漏掉的"
              value={`${missed.length}`}
              unit="段"
              tone={missed.length ? "danger" : "brand"}
            />
            <StatTile label="你比财智通更谨慎的" value={`${overCautious.length}`} unit="段" />
          </div>
        </section>

        {/* 逐段对比 */}
        <ul className="mt-5 space-y-3">
          {rows.map((r) => {
            const m = LEVEL_META[r.level];
            return (
              <li
                key={r.id}
                className={`rounded-2xl border p-4 sm:p-5 ${
                  r.agree ? "border-line bg-paper" : "border-risk-amber-line bg-risk-amber-bg"
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <span className="text-[length:calc(15px*var(--fs))] font-bold text-brand-950">{r.label}</span>
                  <span
                    aria-hidden
                    className={`ml-auto grid h-6 w-6 place-items-center rounded-full text-[length:calc(13px*var(--fs))] font-bold text-white ${
                      r.agree ? "bg-risk-green" : "bg-risk-amber"
                    }`}
                  >
                    {r.agree ? "✓" : "✕"}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <p className="rounded-xl border border-line bg-paper-soft p-3 text-[length:calc(14px*var(--fs))] text-ink">
                    <span className="text-ink-mute">你：</span>
                    <b className="font-semibold">{r.mine === "bad" ? "有问题" : "没问题"}</b>
                  </p>
                  <p className="rounded-xl border border-line bg-paper-soft p-3 text-[length:calc(14px*var(--fs))] text-ink">
                    <span className="text-ink-mute">财智通：</span>
                    <b className={`font-semibold ${m.cls}`}>
                      {m.dot} {m.name}
                    </b>
                  </p>
                </div>
                {r.hits.length > 0 ? (
                  <p className="mt-2.5 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
                    命中 {r.hits.length} 类监管明令禁止或高风险的表述特征：
                    {r.hits.map((h) => `「${h.type}」（原文：${h.matched}）`).join("、")}
                  </p>
                ) : (
                  <p className="mt-2.5 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
                    未识别到违规表述特征。</p>
                )}
              </li>
            );
          })}
        </ul>

        {/* 总结 */}
        <section className="mt-5 rounded-2xl border border-line bg-paper p-5">
          <h3 className="text-[length:calc(15px*var(--fs))] font-bold text-brand-900">这一场说明了什么</h3>
          {missed.length > 0 ? (
            <p className="mt-2 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink">
              你和财智通的判断在 5 段中有 {agree} 段一致。你漏掉的那
              {missed.length > 1 ? `${missed.length} 段` : "一段"}，特征是
              {missed
                .flatMap((r) => r.hits.map((h) => `「${h.type}」`))
                .filter((v, i, a) => a.indexOf(v) === i)
                .join("、") || "缺少必要的风险提示与可核验要素"}
              ——不像广告，像熟人的好意。
            </p>
          ) : (
            <p className="mt-2 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink">
              你和财智通的判断在 5 段中有 {agree} 段一致，
              {agree === rows.length ? "全部对上了。" : "已经很接近了。"}
              
            </p>
          )}
          {overCautious.length > 0 && (
            <p className="mt-2 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink-soft">
              有 {overCautious.length} 段你判了「有问题」而财智通没有识别到违规表述特征。这不代表你错了：
              我们只检查表述，查不了资金流向和实际运作。多一分警惕，从来不是坏事。
            </p>
          )}
        </section>

        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-xl border border-brand-200 bg-paper px-4 py-2.5 text-[length:calc(14px*var(--fs))] font-semibold text-brand-800 transition hover:bg-brand-50"
        >
          再测一次
        </button>
      </div>
    );
  }

  // ── 答题 ──────────────────────────────────────────────
  return (
    <div>
      <section className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <h2 className="text-[length:calc(18px*var(--fs))] font-bold text-brand-950">骗局识别测试 · 你 vs 财智通</h2>
        <p className="mt-2 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink-soft">
          5 段文案，先自己判，再和财智通的判定并排看。仿真文本，机构名虚构。
        </p>
        <p className="mt-2 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-mute">
          
        </p>
      </section>

      <ul className="mt-5 space-y-4">
        {ITEMS.map((it) => (
          <li key={it.id} className="rounded-2xl border border-line bg-paper p-5">
            <p className="text-[length:calc(13px*var(--fs))] font-semibold tracking-wide text-brand-600">{it.label}</p>
            <p className="mt-2.5 whitespace-pre-wrap break-words rounded-xl border border-line bg-paper-soft p-4 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink">
              {it.text}
            </p>
            <div className="mt-3 flex gap-3">
              {(["bad", "ok"] as UserSay[]).map((v) => {
                const on = says[it.id] === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSays((s) => ({ ...s, [it.id]: v }))}
                    className={`flex-1 rounded-xl border px-4 py-3 text-[length:calc(15px*var(--fs))] font-semibold transition sm:flex-none sm:px-6 ${
                      on
                        ? v === "bad"
                          ? "border-risk-red-line bg-risk-red-bg text-risk-red"
                          : "border-risk-green-line bg-risk-green-bg text-risk-green"
                        : "border-line bg-paper text-ink-soft hover:border-brand-300 hover:bg-brand-50"
                    }`}
                    aria-pressed={on}
                  >
                    {v === "bad" ? "有问题" : "没问题"}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      {error && (
        <p className="mt-4 rounded-xl border border-risk-red-line bg-risk-red-bg p-4 text-[length:calc(14px*var(--fs))] text-risk-red">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!allAnswered || loading}
          onClick={submit}
          className="rounded-xl bg-brand-800 px-5 py-3 text-[length:calc(15px*var(--fs))] font-semibold text-white transition hover:bg-brand-900 disabled:cursor-not-allowed disabled:bg-brand-200"
        >
          {loading ? "财智通正在判定…" : "提交，看看财智通怎么判"}
        </button>
        <p className="text-[length:calc(13px*var(--fs))] text-ink-mute">
          已判断 {Object.keys(says).length} / {ITEMS.length} 段
          {profile.knowledge.points > 0 && ` · 当前积分 ${profile.knowledge.points}`}
        </p>
      </div>
    </div>
  );
}
