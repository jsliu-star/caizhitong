"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import samplesData from "@/data/samples.json";
import { CheckReport } from "@/components/check/CheckReport";
import { PageShell } from "@/components/ui/PageShell";
import { Icon } from "@/components/ui/Icon";
import { isAbort, streamSSE } from "@/lib/sse";
import { PENDING_CHECK_EVENT, PENDING_CHECK_KEY } from "@/components/assistant/Assistant";
import { BrandHero } from "@/components/home/BrandHero";
import { Progress, STAGES, type StageKey, type StageStatus } from "@/components/check/Progress";
import { personalizeReport, type PersonalNote } from "@/lib/shield/personalize";
import {
  EMPTY_PROFILE,
  loadLargeText,
  loadProfile,
  RISK_META,
  saveProfile,
  type Profile,
} from "@/lib/profile";
import { findTerms } from "@/lib/rules/glossary";
import { HowItWorks, SampleCases, TermCards, TermChips, type SampleCard } from "@/components/home/Guide";
import type { CheckMode, ShieldEvent, ShieldReport } from "@/lib/types";
import { mascotSay } from "@/components/assistant/lines";

const SAMPLES = samplesData.samples as Array<{
  id: string;
  label: string;
  desc: string;
  text: string;
  image?: string;
}>;

const CLAUSE_SAMPLE =
  "本产品为非保本浮动收益型理财产品，风险等级R3（中风险），业绩比较基准为年化2.90%—3.50%，投资周期为封闭期540天，封闭期内不可提前赎回。管理费0.60%/年，托管费0.05%/年，销售服务费0.20%/年。起购金额10000元。本产品不保证本金安全，可能因市场波动产生本金损失。过往业绩不代表未来表现。";

/** 首屏一键查的常用词。都在 data/glossary.json 里，点了秒出，不调模型。 */
const QUICK_TERMS = ["年化", "业绩比较基准", "非保本", "风险等级", "封闭期", "管理费", "杠杆", "IRR"];

/** 案例卡。samples.json 里的仿真样本 + 一段条款，条款走「只翻译」。 */
const CLAUSE_CARD: SampleCard = {
  id: "clause",
  label: "基金合同条款（读条款）",
  desc: "四百字的产品说明书，逐句翻成人话：封闭期多久、费用一年多少、本金保不保。",
  text: CLAUSE_SAMPLE,
};
const SAMPLE_CARDS: SampleCard[] = [...SAMPLES, CLAUSE_CARD];

const IDLE: Record<StageKey, StageStatus> = {
  vision: "idle",
  match: "idle",
  semantic: "idle",
  entity: "idle",
  citation: "idle",
  verdict: "idle",
};

async function fileToDataUrl(file: File, max = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法处理图片");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function CheckPage() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<CheckMode>("risk");
  const [status, setStatus] = useState<Record<StageKey, StageStatus>>(IDLE);
  const [detail, setDetail] = useState("");
  const [report, setReport] = useState<ShieldReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoNote, setDemoNote] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [analyzed, setAnalyzed] = useState("");
  const [supplements, setSupplements] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // 离开页面时取消进行中的体检
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    setProfile(loadProfile());
    document.body.dataset.large = loadLargeText() ? "1" : "0";

    // ?demo=<样本id|1> 自动跑一遍，用于分享深链与回归截图
    const d = new URLSearchParams(window.location.search).get("demo");
    if (!d) return;
    const sample = SAMPLES.find((x) => x.id === d) ?? SAMPLES[0];
    if (sample.image) void runSampleImage(sample.image);
    else {
      setText(sample.text);
      void run({ kind: "text", text: sample.text }, "risk");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 小通助手把一段话交过来做完整体检：别的页面过来时读 sessionStorage，人已在首页时听事件
  useEffect(() => {
    const take = () => {
      let pending: string | null = null;
      try {
        pending = window.sessionStorage.getItem(PENDING_CHECK_KEY);
        window.sessionStorage.removeItem(PENDING_CHECK_KEY);
      } catch {
        /* 隐私模式 */
      }
      if (!pending) return;
      setText(pending);
      setPreview(null);
      document.getElementById("丢进来")?.scrollIntoView({ behavior: "smooth", block: "start" });
      void run({ kind: "text", text: pending }, "risk");
    };
    take();
    window.addEventListener(PENDING_CHECK_EVENT, take);
    return () => window.removeEventListener(PENDING_CHECK_EVENT, take);
    // run 的依赖是 []，引用稳定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback(
    async (
      payload: { kind: "text"; text: string } | { kind: "image"; imageDataUrl: string; sampleId?: string },
      m: CheckMode,
    ) => {
      // 新的一次体检开始前，取消上一次还没跑完的——否则后到的旧结果会盖掉新结果
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setRunning(true);
      setReport(null);
      setError(null);
      setDemoNote(null);
      setNotes([]);
      setStatus({ ...IDLE });
      setDetail("");
      setMode(m);

      const c = { hits: 0, excluded: 0, sem: 0, regs: 0 };
      const setStage = (k: StageKey, s: StageStatus) => setStatus((p) => ({ ...p, [k]: s }));

      try {
        await streamSSE<ShieldEvent>("/api/shield", { ...payload, mode: m }, {
          signal: ctrl.signal,
          onEvent: (ev) => {

            switch (ev.stage) {
              case "vision":
                if (ev.status === "start") {
                  setStage("vision", "running");
                  setDetail(payload.kind === "image" ? "正在识别图片文字" : "读取文本");
                } else {
                  setStage("vision", "done");
                  if (ev.text) setAnalyzed(ev.text);
                  setDetail(`已提取 ${ev.text?.length ?? 0} 字${ev.redactedCount ? `，隐去 ${ev.redactedCount} 处个人信息` : ""}`);
                  if (ev.note) setDemoNote(ev.note);
                }
                break;
              case "match":
                if (ev.status === "start") setStage("match", "running");
                else if (ev.status === "progress") {
                  if (ev.hit) {
                    c.hits += 1;
                    setDetail(`命中「${ev.hit.type}」：${ev.hit.matched}`);
                  } else if (ev.excluded) c.excluded += 1;
                } else {
                  setStage("match", "done");
                  setDetail(`规则命中 ${c.hits} 条${c.excluded ? `，排除 ${c.excluded} 条误判` : ""}`);
                }
                break;
              case "semantic":
                if (ev.status === "start") setStage("semantic", "running");
                else if (ev.status === "progress" && ev.hit) {
                  c.sem += 1;
                  setDetail(`语义命中「${ev.hit.type}」：${ev.hit.matched}`);
                } else if (ev.status !== "progress") {
                  setStage("semantic", "done");
                  setDetail(ev.note ?? `语义命中 ${c.sem} 条`);
                }
                break;
              case "entity":
                if (ev.status === "start") setStage("entity", "running");
                else {
                  setStage("entity", "done");
                  setDetail(`主体疑点 ${ev.entity?.clues.length ?? 0} 条`);
                }
                break;
              case "citation":
                if (ev.status === "start") setStage("citation", "running");
                else if (ev.status === "progress" && ev.regulation) {
                  c.regs += 1;
                  setDetail(`${ev.regulation.law}${ev.regulation.article}`);
                } else if (ev.status === "done") {
                  setStage("citation", "done");
                  setDetail(`引证 ${c.regs} 条法规`);
                }
                break;
              case "verdict":
                if (ev.status === "start") {
                  setStage("verdict", "running");
                  setDetail("生成结论");
                } else if (ev.status === "done") setStage("verdict", "done");
                break;
              case "report":
                setReport(ev.report);
                // 小通按结论换个表情冒一句。措辞和报告一致：只说命中了什么，不下「诈骗 / 安全」的定性
                mascotSay(
                  ev.report.mode !== "risk"
                    ? { mood: "happy", text: "翻好了，先看看人话版。" }
                    : ev.report.genre?.kind === "report" && ev.report.verdict.headline.includes("讲骗局")
                      ? { mood: "look", text: "这是一段讲骗局的文字。里面引用的说法，正好可以记一记。" }
                    : ev.report.verdict.level === "red"
                      ? { mood: "worry", text: "命中了好几条监管明令禁止的表述特征。慢慢看，别着急做决定。" }
                      : ev.report.verdict.level === "yellow"
                        ? { mood: "look", text: "有几处要留意，往下看看是哪几句。" }
                        : { mood: "happy", text: "规则没识别到违规表述特征。不过我只能检查它说了什么。" },
                );
                try {
                  setNotes(personalizeReport(ev.report, loadProfile()));
                } catch {
                  setNotes([]);
                }
                if (ev.report.hits.length > 0) {
                  try {
                    const prev = loadProfile().encountered;
                    const merged = [...new Set([...prev, ...ev.report.hits.map((h) => h.patternId)])];
                    if (merged.length !== prev.length) setProfile(saveProfile({ encountered: merged }));
                  } catch {
                    /* noop */
                  }
                }
                break;
              case "error":
                setError(ev.message);
                break;
            }
          },
        });
      } catch (e) {
        if (isAbort(e)) return; // 被新的一次体检或离开页面取消，不算出错
        setError(e instanceof Error ? e.message : "分析失败");
      } finally {
        if (abortRef.current === ctrl) {
          abortRef.current = null;
          setRunning(false);
        }
      }
    },
    [],
  );

  const onFollowup = (append: string) => {
    if (!append) return;
    const next = `${analyzed || text}\n${append}`;
    setSupplements((s) => [...s, append]);
    setText(next);
    void run({ kind: "text", text: next }, "risk");
  };

  const pickFile = async (file?: File | null, m: CheckMode = "risk") => {
    if (!file) return;
    try {
      const url = await fileToDataUrl(file);
      setPreview(url);
      setSupplements([]);
      await run({ kind: "image", imageDataUrl: url }, m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "图片处理失败");
    }
  };

  const runSampleImage = async (url: string, m: CheckMode = "risk") => {
    try {
      const blob = await (await fetch(url)).blob();
      const dataUrl = await fileToDataUrl(new File([blob], "s.png", { type: blob.type }));
      setPreview(dataUrl);
      setSupplements([]);
      // sampleId 让服务端命中预生成快照：同一个演示案例，每次都是同一个结论
      await run({ kind: "image", imageDataUrl: dataUrl, sampleId: url }, m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "载入失败");
    }
  };

  const started = STAGES.some((s) => status[s.key] !== "idle");
  const trimmed = text.trim();
  // 两个字就能用：短输入走「只翻译」，服务端本来就没有长度门槛。
  const canTranslate = trimmed.length >= 2;
  // 风险体检需要完整的一段话，对两个字做体检没有意义。
  const canRisk = trimmed.length >= 12;
  const looksLikeTerm = canTranslate && !canRisk && !/[，。！？、\s,.!?]/.test(trimmed);
  // 本地词典命中：确定性、零延迟，watch 是人工写死的，比模型输出可靠。
  const glossaryHits = canTranslate ? findTerms(trimmed) : [];
  // 空框时让「风险体检」保持主按钮样式——它是拳头功能，不该看起来像次要项。
  // 只有真的输入了短词、风险体检做不了的时候，才把主按钮让给「查这个词」。
  const riskLeads = canRisk || trimmed.length === 0;

  return (
    <PageShell title="识别与翻译">
      <BrandHero />

      {/* 副标题原来写「截图或文字丢进来，先翻成人话，再看有没有风险」，
          和下面 HowItWorks 的三步说的是同一件事，只是更粗。品牌区加进来之后
          就成了第三层重复，把输入框压到 550px 以下——删掉，让工具早点出现。 */}
      <header className="mt-6">
        <h1 className="text-[length:calc(26px*var(--fs))] font-bold tracking-tight text-brand-950 sm:text-[length:calc(32px*var(--fs))]">识别与翻译</h1>
      </header>

      {(profile.riskType || profile.encountered.length > 0) && (
        <p className="mt-4 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-[length:calc(13px*var(--fs))] text-brand-800">
          已连接档案
          {profile.riskType && ` · ${RISK_META[profile.riskType].label}`}
          {profile.encountered.length > 0 && ` · 遇到过 ${profile.encountered.length} 类骗局`}
        </p>
      )}

      <HowItWorks />

      <section data-outline="丢进来" className="mt-5 rounded-2xl border border-line bg-paper p-5 shadow-raised sm:p-6">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="粘贴广告文案、群里转来的话、或产品说明书条款"
          className="w-full resize-y rounded-xl border border-line bg-paper-soft p-4 focus-visible:bg-paper text-[length:calc(15px*var(--fs))] leading-relaxed text-ink outline-none transition placeholder:text-ink-mute/70 focus-visible:border-brand-600 focus-visible:ring-2 focus-visible:ring-brand-300"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={running || !canRisk}
            onClick={() => run({ kind: "text", text: trimmed }, "risk")}
            className={
              riskLeads
                ? "inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-brand-700 to-brand-800 px-5 py-2.5 text-[length:calc(15px*var(--fs))] font-semibold text-on-brand shadow-card ring-1 ring-brand-900/20 transition hover:from-brand-800 hover:to-brand-900 hover:shadow-raised disabled:cursor-not-allowed disabled:from-brand-100 disabled:to-brand-100 disabled:text-brand-600 disabled:shadow-none disabled:ring-brand-200"
                : "inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-paper-soft px-5 py-2.5 text-[length:calc(15px*var(--fs))] font-semibold text-ink-mute transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
            }
          >
            <Icon name={running && mode === "risk" ? "sparkles" : "shieldCheck"} className={`h-[1.1em] w-[1.1em] ${running && mode === "risk" ? "cd-pulse" : ""}`} />
            {running && mode === "risk" ? "分析中" : "翻译 + 风险体检"}
          </button>
          <button
            type="button"
            disabled={running || !canTranslate}
            onClick={() => run({ kind: "text", text: trimmed }, "translate")}
            className={
              riskLeads
                ? "inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-300 bg-paper px-4 py-2.5 text-[length:calc(15px*var(--fs))] font-semibold text-brand-800 transition hover:border-brand-400 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
                : "inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-brand-700 to-brand-800 px-5 py-2.5 text-[length:calc(15px*var(--fs))] font-semibold text-on-brand shadow-card ring-1 ring-brand-900/20 transition hover:from-brand-800 hover:to-brand-900 hover:shadow-raised disabled:cursor-not-allowed disabled:from-brand-100 disabled:to-brand-100 disabled:text-brand-600 disabled:shadow-none disabled:ring-brand-200"
            }
          >
            {running && mode === "translate" ? "查询中" : looksLikeTerm ? "查这个词" : "只翻成人话"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
          <button
            type="button"
            disabled={running}
            onClick={() => fileRef.current?.click()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-300 bg-paper px-4 py-2.5 text-[length:calc(15px*var(--fs))] font-semibold text-brand-800 transition hover:border-brand-400 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="upload" className="h-[1.05em] w-[1.05em]" />
            上传截图
          </button>
          {text && !running && (
            <button type="button" onClick={() => setText("")} className="rounded-lg px-2 py-1 text-[length:calc(14px*var(--fs))] text-ink-mute transition-colors hover:bg-brand-50 hover:text-brand-700">
              清空
            </button>
          )}
        </div>

        {trimmed.length === 0 ? (
          <p className="mt-2 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-mute">
            一个词也可以，比如「年化」「封闭期」「平仓」——不用打整句。
          </p>
        ) : (
          !canRisk && (
            <p className="mt-2 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-mute">
              风险体检要有完整的一段话（12 字以上）才做得准，所以这几个字先按术语给你解释。
            </p>
          )
        )}

        {/* 词典命中就地展示：紧贴输入框，不用往下翻 */}
        {!report && !running && glossaryHits.length > 0 && <TermCards terms={glossaryHits} />}

        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="待分析图片" className="mt-3 max-h-56 w-full rounded-xl border border-line object-contain" />
        )}

        <TermChips terms={QUICK_TERMS} onPick={(t) => setText(t)} disabled={running} />
      </section>

      {demoNote && (
        <p className="mt-4 rounded-xl border border-risk-amber-line bg-risk-amber-bg p-4 text-[length:calc(13px*var(--fs))] leading-relaxed text-risk-amber">
          演示模式：{demoNote}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-xl border border-risk-red-line bg-risk-red-bg p-4 text-[length:calc(14px*var(--fs))] text-risk-red">{error}</p>
      )}

      {started && (
        <div className="mt-5">
          <Progress status={status} detail={detail} mode={mode} />
        </div>
      )}

      {supplements.length > 0 && (
        <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <p className="text-[length:calc(13px*var(--fs))] font-semibold text-brand-800">已根据 {supplements.length} 条补充重新分析</p>
          <ul className="mt-1.5 space-y-1">
            {supplements.map((x, i) => (
              <li key={i} className="text-[length:calc(13px*var(--fs))] text-ink-soft">· {x}</li>
            ))}
          </ul>
        </div>
      )}

      {report && (
        <div className="mt-5">
          <CheckReport report={report} notes={notes} onFollowup={onFollowup} />
        </div>
      )}

      <div data-outline="换个案例试试">
        <SampleCases
        samples={SAMPLE_CARDS}
        disabled={running}
        heading={started ? "换一个案例试试" : "不知道从哪开始？点一个案例，直接看结果"}
        onPick={(sample) => {
          if (sample.image) {
            void runSampleImage(sample.image);
            return;
          }
          setText(sample.text);
          setPreview(null);
          void run({ kind: "text", text: sample.text }, sample.id === "clause" ? "translate" : "risk");
        }}
        />
      </div>
    </PageShell>
  );
}
