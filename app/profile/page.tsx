"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Gauge, Radar } from "@/components/viz";
import {
  DEMO_PROFILE,
  RISK_META,
  clearProfile,
  loadProfile,
  saveProfile,
  type Profile,
} from "@/lib/profile";
import { buildLinkages, patternLabel, type Tab } from "./linkage";
import { PageShell } from "@/components/ui/PageShell";
import { StageJourney } from "@/components/stage/StageJourney";
import { Mascot } from "@/components/assistant/Mascot";

const KNOWLEDGE_LABEL = { none: "还没测出来", basic: "入门", intermediate: "进阶" } as const;

const TAB_STYLE: Record<Tab, string> = {
  安全盾: "bg-brand-800 text-on-brand",
  翻译官: "bg-brand-100 text-brand-800",
  规划师: "bg-brand-50 text-brand-700 border border-brand-200",
  全站: "bg-risk-amber-bg text-risk-amber border border-risk-amber-line",
};

const TAB_HREF: Record<Tab, string> = {
  安全盾: "/shield",
  翻译官: "/translate",
  规划师: "/plan",
  全站: "/",
};

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

function isEmptyProfile(p: Profile) {
  return (
    !p.ageBand &&
    !p.lifeStage &&
    !p.riskType &&
    p.riskScore === undefined &&
    p.riskDims === undefined &&
    p.conflicts.length === 0 &&
    p.knowledge.points === 0 &&
    p.knowledge.cleared.length === 0 &&
    p.knowledge.weakTerms.length === 0 &&
    p.encountered.length === 0 &&
    p.debtApr === undefined &&
    p.emergencyMonths === undefined &&
    p.goals.length === 0
  );
}

/** 一行档案字段：有值就显示值，没值就给出「去哪里测」的引导，不留空白 */
function Field({
  label,
  value,
  hint,
  todo,
}: {
  label: string;
  value?: React.ReactNode;
  hint?: string;
  todo?: { text: string; href: string };
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[length:calc(14px*var(--fs))] font-medium text-brand-900">{label}</p>
        {hint && <p className="mt-0.5 text-[length:calc(12.5px*var(--fs))] leading-relaxed text-ink-mute">{hint}</p>}
      </div>
      {value !== undefined ? (
        <p className="text-[length:calc(14.5px*var(--fs))] font-semibold text-ink">{value}</p>
      ) : (
        <Link href={todo?.href ?? "/plan"} className="text-[length:calc(13.5px*var(--fs))] font-semibold text-brand-700 underline decoration-brand-200">
          {todo?.text ?? "还没测，去规划师测一下"} →
        </Link>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mt-8 space-y-3" aria-hidden>
      {[64, 180, 120].map((h) => (
        <div key={h} className="cd-pulse rounded-2xl border border-line bg-paper shadow-card" style={{ height: h }} />
      ))}
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const refresh = useCallback(() => {
    setProfile(loadProfile());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadDemo = () => {
    saveProfile(DEMO_PROFILE);
    setConfirmClear(false);
    refresh();
  };

  const doClear = () => {
    clearProfile();
    setConfirmClear(false);
    refresh();
  };

  const empty = profile ? isEmptyProfile(profile) : false;
  const dims = profile?.riskDims ?? null;
  const linkages = profile ? buildLinkages(profile) : [];
  const risk = profile?.riskType ? RISK_META[profile.riskType] : null;

  return (
    <PageShell title="我的档案" py="py-10">
      <header>
        <h1 className="text-[length:calc(26px*var(--fs))] font-bold tracking-tight text-brand-950 sm:text-[length:calc(32px*var(--fs))]">我的档案</h1>
        <p className="mt-2 text-[length:calc(15px*var(--fs))] text-ink-soft">三个智能体共用的一份记忆。</p>
      </header>

      <section className="mt-5 rounded-xl bg-brand-900 px-5 py-4">
        <p className="flex items-center gap-2 text-[length:calc(14px*var(--fs))] font-semibold text-on-brand">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden fill="none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2.8 20 5.6v6.1c0 4.6-3.2 8.6-8 10.1-4.8-1.5-8-5.5-8-10.1V5.6Z" stroke="currentColor" />
            <path d="M12 11v4.4M12 8.3h.01" stroke="currentColor" />
          </svg>
          只存在你自己的浏览器里，不上传
        </p>
      </section>

      {profile !== null && (
        <StageJourney
          profile={profile}
          onChange={(id) => setProfile(saveProfile({ lifeStage: id }))}
        />
      )}

      {profile !== null && empty && (
        <section className="mt-6">
          <div className="flex items-center gap-4 rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-paper p-4 shadow-card sm:p-5">
            <Mascot mood="idle" follow size={76} className="shrink-0" />
            <div>
              <h2 className="text-[length:calc(18px*var(--fs))] font-bold text-brand-900">档案还是空的</h2>
              <p className="mt-1 text-[length:calc(13.5px*var(--fs))] leading-relaxed text-ink-soft">
                随便从下面哪一项开始，做完会自动记进来。三个智能体读的都是这一份。
              </p>
            </div>
          </div>

          <ul className="mt-4 space-y-2.5">
            {[
              { href: "/plan", t: "去规划师做风险测评", d: "12 道自适应问题，测风险类型，并指出回答里的矛盾" },
              { href: "/plan", t: "去算应急金和真实负债成本", d: "两个纯计算工具，算完自动记进档案" },
              { href: "/shield", t: "去安全盾体检一张广告", d: "遇到过的骗局类型会记进档案" },
              { href: "/translate", t: "去翻译官闯几关", d: "答错的术语会被记下来，之后讲到它会先解释" },
            ].map((x) => (
              <li key={x.t}>
                <Link href={x.href} className="cd-lift group block rounded-xl border border-line bg-paper p-4 shadow-card transition hover:border-brand-300">
                  <p className="text-[length:calc(14.5px*var(--fs))] font-semibold text-brand-800">
                    {x.t} <span className="inline-block transition group-hover:translate-x-0.5">→</span>
                  </p>
                  <p className="mt-1 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">{x.d}</p>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
            
            <button
              type="button"
              onClick={loadDemo}
              className="shrink-0 rounded-lg bg-brand-800 px-4 py-2 text-[length:calc(13.5px*var(--fs))] font-semibold text-on-brand transition hover:bg-brand-900"
            >
              载入示例档案
            </button>
          </div>
        </section>
      )}

      {/* ── 画像概览 ─────────────────────────── */}
      {profile !== null && !empty && (
        <>
          <section data-outline="画像概览" className="mt-8">
            <h2 className="text-[length:calc(17px*var(--fs))] font-bold text-brand-900">画像概览</h2>
            {risk || profile.riskScore !== undefined ? (
              <div className="mt-3 rounded-2xl border border-line bg-paper shadow-card p-5">
                <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                  {profile.riskScore !== undefined && (
                    <Gauge
                      value={profile.riskScore / 100}
                      display={String(profile.riskScore)}
                      label="风险承受综合得分（0–100）"
                      size={170}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    {risk && (
                      <>
                        <p className="flex items-baseline gap-2">
                          <span className="text-[length:calc(22px*var(--fs))] font-bold text-brand-900">{risk.label}</span>
                          <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[length:calc(12px*var(--fs))] font-semibold text-brand-700">
                            {risk.short}
                          </span>
                        </p>
                        <p className="mt-2 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink-soft">{risk.desc}</p>
                        <p className="mt-2 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-mute">
                          权益类参考比例上限 {Math.round(risk.equityCap * 100)}%。
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {dims ? (
                  <div className="mt-6 border-t border-line pt-5">
                    <p className="text-[length:calc(14px*var(--fs))] font-semibold text-brand-900">四维明细</p>
                    <p className="mt-1 text-[length:calc(12.5px*var(--fs))] leading-relaxed text-ink-mute">
                      定级取两者中更低的一侧。
                    </p>
                    {/* Radar 的 4 轴布局会把左右两个标签放到 viewBox 之外，
                        这里放开 svg 的 overflow 并留出左右内边距，避免标签被切掉。
                        （components/viz 是共享只读文件，不在这里改它） */}
                    <div className="mt-3 flex justify-center px-8 sm:px-14 [&_svg]:overflow-visible">
                      <Radar
                        color="var(--brand-600)"
                        axes={[
                          { label: "承受能力", value: dims.capacity / 100, hint: "亏得起多少：收入稳定性、资金来源、这笔钱多久要用" },
                          { label: "风险意愿", value: dims.willingness / 100, hint: "愿不愿意亏：看到浮亏时你说自己会怎么做" },
                          { label: "投资期限", value: dims.horizon / 100, hint: "这笔钱能放多久不动。期限短，能承受的波动就小" },
                          { label: "金融知识", value: dims.knowledge / 100, hint: "对基本概念的掌握程度，答错的术语会记进档案" },
                        ]}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="mt-5 border-t border-line pt-4 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-mute">
                    还没有四维明细，去规划师测一次。
                    <Link href="/plan" className="ml-1 font-semibold text-brand-700 underline">
                      去做一次测评 →
                    </Link>
                  </p>
                )}

                {profile.conflicts.length > 0 && (
                  <div className="mt-5 rounded-xl border border-risk-amber-line bg-risk-amber-bg p-4">
                    <p className="text-[length:calc(13.5px*var(--fs))] font-bold text-risk-amber">测评里发现的矛盾</p>
                    <ul className="mt-2 space-y-1.5">
                      {profile.conflicts.map((c) => (
                        <li key={c} className="flex gap-2 text-[length:calc(13.5px*var(--fs))] leading-relaxed text-ink-soft">
                          <span aria-hidden className="text-risk-amber">·</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-3 rounded-2xl border border-line bg-paper shadow-card p-5 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink-soft">
                还没有风险画像。
                <Link href="/plan" className="ml-1 font-semibold text-brand-700 underline">
                  去规划师测一下 →
                </Link>
              </p>
            )}
          </section>

          {/* ── 档案清单 ───────────────────────── */}
          <section data-outline="档案里已有什么" className="mt-8">
            <h2 className="text-[length:calc(17px*var(--fs))] font-bold text-brand-900">档案里已有什么</h2>
            <p className="mt-1.5 text-[length:calc(13.5px*var(--fs))] leading-relaxed text-ink-soft">
              
            </p>
            <div className="mt-3 rounded-2xl border border-line bg-paper shadow-card px-5 py-1">
              <Field label="年龄段" value={profile.ageBand} todo={{ text: "还没测，去规划师", href: "/plan" }} />
              <Field
                label="风险类型"
                value={risk ? `${risk.label}（${risk.short}）` : undefined}
                todo={{ text: "还没测，去规划师", href: "/plan" }}
              />
              <Field
                label="风险承受综合得分"
                value={profile.riskScore !== undefined ? `${profile.riskScore} / 100` : undefined}
                todo={{ text: "还没测，去规划师", href: "/plan" }}
              />
              <Field
                label="金融知识等级"
                value={`${KNOWLEDGE_LABEL[profile.knowledge.level]}${
                  profile.knowledge.points > 0 ? ` · ${profile.knowledge.points} 积分` : ""
                }`}
                hint={profile.knowledge.cleared.length > 0 ? `已通关 ${profile.knowledge.cleared.length} 个关卡` : undefined}
              />
              <Field
                label="答错过的术语"
                hint="翻译官会把这些词置顶"
                value={
                  profile.knowledge.weakTerms.length > 0 ? profile.knowledge.weakTerms.join("、") : undefined
                }
                todo={{ text: "还没有，去翻译官闯关", href: "/translate" }}
              />
              <Field
                label="遇到过的骗局类型"
                hint="来自安全盾的体检记录"
                value={
                  profile.encountered.length > 0
                    ? profile.encountered.map(patternLabel).join("、")
                    : undefined
                }
                todo={{ text: "还没有，去安全盾体检", href: "/shield" }}
              />
              <Field
                label="负债真实年化"
                hint="按现金流算出的 IRR"
                value={profile.debtApr !== undefined ? pct(profile.debtApr) : undefined}
                todo={{ text: "还没算，去规划师", href: "/plan" }}
              />
              <Field
                label="应急金月数"
                value={profile.emergencyMonths !== undefined ? `${profile.emergencyMonths} 个月` : undefined}
                todo={{ text: "还没算，去规划师", href: "/plan" }}
              />
              <Field
                label="财务目标"
                value={profile.goals.length > 0 ? profile.goals.map((g) => g.name).join("、") : undefined}
                todo={{ text: "还没有，去规划师", href: "/plan" }}
              />
            </div>
            {profile.updatedAt && (
              <p className="mt-2 text-[length:calc(12.5px*var(--fs))] text-ink-mute">
                档案最近一次更新：{profile.updatedAt.slice(0, 10)}
              </p>
            )}
          </section>

          {/* ── 联动说明：本页的灵魂 ─────────────── */}
          <section data-outline="三个 Tab 怎么用它" className="mt-10">
            <h2 className="text-[length:calc(17px*var(--fs))] font-bold text-brand-900">因为档案里有这些，所以……</h2>
            

            {linkages.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-line bg-paper shadow-card p-5 text-[length:calc(14px*var(--fs))] leading-relaxed text-ink-soft">
                做一次测评或用一次识别，这里就有内容。
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {linkages.map((l) => (
                  <li key={l.id} className="rounded-2xl border border-line bg-paper shadow-card p-5">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[length:calc(11.5px*var(--fs))] font-semibold text-brand-600">
                        档案字段 {l.field}
                      </span>
                      <p className="text-[length:calc(15px*var(--fs))] font-bold text-brand-900">{l.fact}</p>
                    </div>
                    <ul className="mt-3 space-y-2.5">
                      {l.effects.map((e) => (
                        <li key={e.text} className="flex flex-col gap-1.5 sm:flex-row sm:gap-3">
                          <Link
                            href={TAB_HREF[e.tab]}
                            className={`h-fit w-fit shrink-0 rounded-md px-2 py-1 text-[length:calc(12px*var(--fs))] font-semibold ${TAB_STYLE[e.tab]}`}
                          >
                            {e.tab}
                          </Link>
                          <p className="text-[length:calc(13.5px*var(--fs))] leading-relaxed text-ink-soft">{e.text}</p>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* ── 档案操作 ─────────────────────────── */}
      {profile !== null && !empty && (
        <section data-outline="管理这份档案" className="mt-10 border-t border-line pt-6">
          <h2 className="text-[length:calc(15px*var(--fs))] font-bold text-brand-900">管理这份档案</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={loadDemo}
              className="rounded-lg border border-brand-300 bg-paper px-4 py-2 text-[length:calc(13.5px*var(--fs))] font-semibold text-brand-700 transition hover:bg-brand-50"
            >
              载入示例档案（会覆盖现有档案）
            </button>
            {confirmClear ? (
              <span className="flex flex-wrap items-center gap-2 rounded-lg border border-risk-red-line bg-risk-red-bg px-3 py-2">
                <span className="text-[length:calc(13px*var(--fs))] font-medium text-risk-red">清掉后无法恢复，确定吗？</span>
                <button
                  type="button"
                  onClick={doClear}
                  className="rounded-md bg-risk-red px-3 py-1 text-[length:calc(13px*var(--fs))] font-semibold text-on-brand"
                >
                  确定清除
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="rounded-md border border-risk-red-line px-3 py-1 text-[length:calc(13px*var(--fs))] font-semibold text-risk-red"
                >
                  取消
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="rounded-lg border border-line bg-paper px-4 py-2 text-[length:calc(13.5px*var(--fs))] font-semibold text-ink-soft transition hover:border-risk-red-line hover:text-risk-red"
              >
                清除档案
              </button>
            )}
          </div>
        </section>
      )}

      
    </PageShell>
  );
}
