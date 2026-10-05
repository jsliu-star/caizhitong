"use client";

/**
 * 规划师问答。
 *
 * 产品上的差异点不是「有个聊天框」，而是**它读你的档案**：
 * 每条回答上方都列出用到了哪几条档案事实、依据是什么，用户能当场对照验证。
 *
 * 越界问题（买哪个 / 什么时候买 / 能赚多少 / 帮我操作）由规则层直接拒答，
 * 界面上会明确显示「这一步没有调用模型」——拒答的样子就是守规矩的证据。
 */
import { useEffect, useRef, useState } from "react";
import { loadProfile, type Profile } from "@/lib/profile";
import { suggestedQuestions, type Fact } from "@/lib/plan/advisor";
import { isAbort, streamSSE } from "@/lib/sse";

interface BlockReply {
  title: string;
  body: string;
  instead: string;
}

interface Turn {
  id: string;
  question: string;
  /** 规则层拒答 */
  blocked?: { category: string; matched?: string; reply: BlockReply };
  facts?: Fact[];
  topics?: string[];
  guard?: { violations: string[]; inventedNumbers: string[]; fellBack: boolean };
  answer?: string;
  demoMode?: boolean;
  error?: string;
  stage: "gate" | "facts" | "compose" | "guard" | "done" | "error";
}

const STAGE_LABEL: Record<Turn["stage"], string> = {
  gate: "检查这个问题能不能答…",
  facts: "读取你的档案…",
  compose: "组织回答…",
  guard: "输出审查…",
  done: "",
  error: "",
};

const CATEGORY_LABEL: Record<string, string> = {
  specific: "点评具体产品",
  pick: "推荐具体标的",
  timing: "预测涨跌 / 指导择时",
  promise: "承诺或暗示收益",
  delegate: "代客操作",
};

export function Chat() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => setProfile(loadProfile()), []);

  // ?q=<问题>：从档案页「可以问问规划师」点进来，自动问
  const askedFromUrl = useRef(false);
  useEffect(() => {
    if (askedFromUrl.current || !profile) return;
    const q0 = new URLSearchParams(window.location.search).get("q");
    if (!q0) return;
    askedFromUrl.current = true;
    void ask(q0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns]);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    const id = `t${turns.length}-${question.length}`;
    setTurns((t) => [...t, { id, question, stage: "gate" }]);
    setQ("");
    setBusy(true);

    const patch = (p: Partial<Turn>) =>
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, ...p } : x)));

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamSSE<any>("/api/plan/chat", { question, profile: profile ?? loadProfile() }, {
        signal: ctrl.signal,
        onEvent: (ev) => {
          if (ev.stage === "gate" && ev.blocked) {
            patch({ blocked: { category: ev.category, matched: ev.matched, reply: ev.reply }, stage: "done" });
          } else if (ev.stage === "facts") {
            patch({ facts: ev.facts, topics: ev.topics, stage: "compose" });
          } else if (ev.stage === "guard") {
            patch({ guard: ev, stage: "guard" });
          } else if (ev.stage === "answer") {
            patch({ answer: ev.text, demoMode: ev.demoMode, stage: "done" });
          } else if (ev.stage === "error") {
            patch({ error: ev.message, stage: "error" });
          }
        },
      });
    } catch (e) {
      if (isAbort(e)) return;
      patch({ error: e instanceof Error ? e.message : "回答失败", stage: "error" });
    } finally {
      setBusy(false);
    }
  };

  const suggestions = profile ? suggestedQuestions(profile) : [];
  const hasProfile =
    profile != null &&
    (profile.riskType != null || profile.goals.length > 0 || profile.knowledge.points > 0);

  return (
    <section aria-labelledby="chat-h" className="rounded-2xl border border-line bg-paper shadow-card p-5 sm:p-6">
      <h2 id="chat-h" className="text-[length:calc(18px*var(--fs))] font-bold text-brand-950">
        问问规划师
      </h2>
      <p className="mt-2 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink-soft">
        它读得到你的档案，所以回答是针对你的情况说的，不是通用科普。
        每条回答上方会列出它用了你档案里的哪几条信息——你可以当场核对。
      </p>
      {!hasProfile && (
        <p className="mt-3 rounded-xl border border-dashed border-line bg-paper-soft p-3 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-mute">
          你的档案还是空的，现在只能给通用回答。做完下面的风险测评、或在
          <b className="font-semibold text-ink-soft">我的档案</b>里点「载入示例档案」，再来问会明显不一样。
        </p>
      )}

      {/* 已知信息 */}
      {hasProfile && profile && (
        <p className="mt-3 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-mute">
          它现在知道你：
          {[
            profile.riskType ? "风险测评结果" : null,
            typeof profile.debtApr === "number" && profile.debtApr > 0 ? "一笔高息负债的真实年化" : null,
            typeof profile.emergencyMonths === "number" ? "应急金覆盖月数" : null,
            profile.goals.length > 0 ? `${profile.goals.length} 个理财目标` : null,
            profile.knowledge.weakTerms.length > 0 ? `${profile.knowledge.weakTerms.length} 个答错过的术语` : null,
            profile.encountered.length > 0 ? `${profile.encountered.length} 类遇到过的话术` : null,
          ]
            .filter(Boolean)
            .join("、")}
          。
        </p>
      )}

      {/* 对话 */}
      {turns.length > 0 && (
        <ul className="mt-5 space-y-4">
          {turns.map((t) => (
            <li key={t.id} className="space-y-2.5">
              {/* 提问 */}
              <p className="ml-auto w-fit max-w-[85%] break-words rounded-2xl rounded-br-sm bg-brand-800 px-4 py-2.5 text-[length:calc(15px*var(--fs))] leading-relaxed text-on-brand">
                {t.question}
              </p>

              {/* 进行中 */}
              {t.stage !== "done" && t.stage !== "error" && (
                <p className="cd-pulse text-[length:calc(13px*var(--fs))] text-ink-mute">{STAGE_LABEL[t.stage]}</p>
              )}

              {/* 规则层拒答 */}
              {t.blocked && (
                <div className="cd-in rounded-2xl rounded-bl-sm border-2 border-risk-amber-line bg-risk-amber-bg p-4">
                  <p className="text-[length:calc(13px*var(--fs))] font-semibold text-risk-amber">
                    这个问题命中「{CATEGORY_LABEL[t.blocked.category] ?? t.blocked.category}」
                    {t.blocked.matched && <span className="font-normal">（触发词：{t.blocked.matched}）</span>}
                    ——由规则直接拦下，<b className="font-bold">没有调用模型</b>
                  </p>
                  <p className="mt-2.5 text-[length:calc(16px*var(--fs))] font-bold text-brand-950">{t.blocked.reply.title}</p>
                  <p className="mt-2 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink">{t.blocked.reply.body}</p>
                  <p className="mt-2.5 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink">{t.blocked.reply.instead}</p>
                </div>
              )}

              {/* 用到的档案事实 */}
              {t.facts && t.facts.length > 0 && (
                <div className="rounded-xl border border-line bg-paper-soft p-3.5">
                  <p className="text-[length:calc(12px*var(--fs))] font-semibold tracking-wide text-brand-600">
                    这条回答用到了你档案里的 {t.facts.length} 条信息
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {t.facts.map((f) => (
                      <li key={f.key} className="text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
                        <b className="font-semibold text-ink">{f.label}</b>：{f.value}
                        <span className="text-ink-mute">（依据：{f.basis}）</span>
                      </li>
                    ))}
                  </ul>
                  {t.topics && t.topics.length > 0 && (
                    <p className="mt-2 text-[length:calc(12px*var(--fs))] text-ink-mute">可讲要点：{t.topics.join("、")}</p>
                  )}
                </div>
              )}

              {/* 回答 */}
              {t.answer && (
                <div className="cd-in rounded-2xl rounded-bl-sm border border-brand-200 bg-brand-50 p-4">
                  <p className="whitespace-pre-wrap break-words text-[length:calc(15px*var(--fs))] leading-relaxed text-ink">{t.answer}</p>
                  <p className="mt-2.5 border-t border-brand-200 pt-2 text-[length:calc(12px*var(--fs))] leading-relaxed text-ink-mute">
                    {t.demoMode ? "演示模式：本条由规则模板生成（未配置模型 API Key，或模型输出未通过审查层）。" : "本条由模型转述，已通过输出审查层。"}
                    {t.guard && (t.guard.violations.length > 0 || t.guard.inventedNumbers.length > 0) && (
                      <>
                        {" "}审查层改写了 {t.guard.violations.length} 处越界表述
                        {t.guard.inventedNumbers.length > 0 && `，发现 ${t.guard.inventedNumbers.length} 处编造数字`}。
                      </>
                    )}
                    {" "}以上为投资者教育内容，不构成投资建议，不推荐任何具体产品。
                  </p>
                </div>
              )}

              {t.error && (
                <p className="rounded-xl border border-risk-red-line bg-risk-red-bg p-3 text-[length:calc(14px*var(--fs))] text-risk-red">
                  {t.error}
                </p>
              )}
            </li>
          ))}
          <div ref={endRef} />
        </ul>
      )}

      {/* 推荐问法 */}
      {suggestions.length > 0 && (
        <div className="mt-5">
          <p className="text-[length:calc(13px*var(--fs))] font-semibold text-ink-soft">
            {turns.length > 0
              ? "还可以问："
              : hasProfile
                ? "按你的档案，这几个问题最值得先问："
                : "先从这几个问起："}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => void ask(s)}
                className="min-h-9 rounded-full border border-brand-200 bg-paper px-3.5 py-2 text-left text-[length:calc(13px*var(--fs))] font-medium text-brand-800 transition hover:bg-brand-50 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 输入 */}
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q.trim());
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="问点什么，例如「我该先还债还是先理财」"
          className="min-h-11 flex-1 rounded-xl border border-line bg-paper-soft px-4 py-3 text-[length:calc(15px*var(--fs))] outline-none transition focus:border-brand-400 focus-visible:border-brand-600 focus-visible:ring-2 focus-visible:ring-brand-300"
        />
        <button
          type="submit"
          disabled={busy || q.trim().length < 2}
          className="min-h-11 shrink-0 rounded-xl bg-brand-800 px-5 py-3 text-[length:calc(15px*var(--fs))] font-semibold text-on-brand transition hover:bg-brand-900 disabled:cursor-not-allowed disabled:bg-brand-200 disabled:text-brand-700"
        >
          {busy ? "回答中…" : "问"}
        </button>
      </form>

      <p className="mt-3 text-[length:calc(12px*var(--fs))] leading-relaxed text-ink-mute">
        它不会推荐任何具体股票、基金或理财产品，不预测涨跌，不承诺收益——这类问题会被规则层直接拦下并说明原因。
        这不是能力不足，是我们没有证券投资咨询牌照，做了就违规。
      </p>
    </section>
  );
}
