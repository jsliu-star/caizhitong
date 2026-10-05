"use client";

/**
 * 小通助手：右下角常驻，点开就能问。
 *
 * 回答分三条路，越靠前越确定、越快：
 *   ① 问一个词      → 本地术语表直接答（不调模型，秒出）
 *   ② 贴一段话      → 本地规则先扫一遍，命中就说命中了几条特征，并一键送去首页完整体检
 *   ③ 其他问题      → 规划师接口 /api/plan/chat：越界问题规则拒答、不调模型；
 *                     模型回答先过输出审查层，才会显示出来
 *
 * 合规上和全站一致：判定归规则，模型只讲人话。小通不会说「这是诈骗」「这个产品安全」，
 * 只会说「命中 N 条监管明令禁止的表述特征」。
 *
 * 面板 Portal 到 body，fixed 定位——header 用了 backdrop-filter，
 * 放在里面 fixed 会相对 header 定位（botool 规范「弹出层必须 Portal」）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Mascot, type MascotMood } from "@/components/assistant/Mascot";
import { Icon } from "@/components/ui/Icon";
import { findTerms } from "@/lib/rules/glossary";
import { analyzeText } from "@/lib/rules/match";
import { detectGenre } from "@/lib/rules/genre";
import { loadProfile, saveProfile } from "@/lib/profile";
import { isAbort, streamSSE } from "@/lib/sse";
import { STAGES, getStage, type LifeStage, type LifeStageId } from "@/lib/stage";
import {
  MASCOT_EVENT,
  POKES,
  ROUTE_LINES,
  SMALL_TALK,
  TIPS,
  WAKE_LINES,
  pick,
  timeGreeting,
  type Line,
} from "@/components/assistant/lines";

/** 首页读这个 key：小通把一段话交给「识别与翻译」做完整体检 */
export const PENDING_CHECK_KEY = "caidun.pendingCheck";
export const PENDING_CHECK_EVENT = "caidun:check";

interface Msg {
  id: string;
  role: "user" | "bot";
  text: string;
  /** 小标题，比如「年化是什么」 */
  title?: string;
  /** 补一句提醒 */
  watch?: string;
  /** 这条回答是怎么来的——给用户看得见的依据 */
  source?: string;
  tone?: "normal" | "worry" | "blocked";
  /** 这条回答出来时小通的表情 */
  mood?: MascotMood;
  action?: { label: string; text: string };
}

/** 空闲多久开始打盹 */
const SLEEP_AFTER = 60_000;
/** 每隔多久冒一条小贴士；每页最多几条 */
const TIP_EVERY = 45_000;
const TIP_MAX = 3;
/** 气泡停留时间 */
const BUBBLE_MS = 7000;

const STARTERS = ["年化是什么意思？", "保本保息的理财能买吗？", "群里老师带我炒股，靠谱吗？", "应急金要留多少？"];

const INTRO: Msg = {
  id: "intro",
  role: "bot",
  mood: "wave",
  text: "我是小通。你可以问我一个看不懂的词，也可以把群里转来的话、广告文案直接贴过来，我先帮你看看里面有没有监管明令禁止的说法。",
  watch: "我不推荐具体产品，不预测涨跌，也不承诺收益。",
};

/** 聊天里说出自己的处境 → 识别人生阶段（只认明确的自述，宁可不认也不乱认） */
const STAGE_SAYINGS: Array<[RegExp, LifeStageId]> = [
  [/(我是|我还是|我在读)(大学生|学生|研究生|大一|大二|大三|大四)|还在上学/, "student"],
  [/(刚毕业|刚工作|刚参加工作|刚上班|工作没几年|职场新人)/, "early-career"],
  [/(刚结婚|新婚|准备结婚|我们俩|和对象)/, "couple"],
  [/(我有孩子|有了孩子|当妈|当爸|宝宝|我家孩子|二胎)/, "parenting"],
  [/(上有老下有小|要养父母|照顾爸妈)/, "midlife"],
  [/(快退休|要退休了|马上退休|临近退休)/, "pre-retire"],
  [/(我退休了|已经退休|退休在家|退休金)/, "retired"],
];

function stageFromText(text: string): LifeStageId | undefined {
  return STAGE_SAYINGS.find(([re]) => re.test(text))?.[1];
}

let seq = 0;
const nid = () => `m${Date.now().toString(36)}${(seq += 1)}`;

/** ① ② 两条本地路径。返回 null 表示交给接口 */
function localReply(q: string): Msg | null {
  const bare = q.replace(/[\s？?。！!，,、]/g, "");

  // 寒暄：谢谢、再见、夸它。放在问候前面——「你好可爱」是夸，不是打招呼
  const talk = SMALL_TALK.find((t) => t.re.test(bare));
  if (talk && bare.length <= 16) {
    return { id: nid(), role: "bot", text: talk.line.text, mood: talk.line.mood };
  }

  if (/^(你好|您好|hi|hello|在吗|你是谁|你叫什么)/i.test(bare)) {
    return { ...INTRO, id: nid() };
  }

  // ② 一段像宣传文案的话：先过规则
  if (bare.length >= 24) {
    const r = analyzeText(q);
    // 讲骗局的文字（新闻、提醒、科普）：不按「命中违规」回答，而是告诉他这是在讲哪些话术
    if (r.hits.length > 0 && detectGenre(q, r.hits).kind === "report") {
      const types = [...new Set(r.hits.map((h) => h.type))];
      return {
        id: nid(),
        role: "bot",
        mood: "look",
        title: "这段文字是在讲骗局，不是在推销",
        text: `看起来是一段报道、提醒或科普。它提到的 ${types.length} 类话术——${types.slice(0, 4).join("、")}——正是骗子常用的说法。`,
        watch: "以后如果有人真这样对你说，就要警惕。如果这其实是别人发给你的宣传，去掉转述的部分再发给我一次。",
        source: "规则比对 + 文体识别 · 不调用模型",
      };
    }
    if (r.hits.length > 0) {
      const types = [...new Set(r.hits.map((h) => h.type))];
      const sample = r.hits[0].matched;
      return {
        id: nid(),
        role: "bot",
        tone: "worry",
        title: `命中 ${types.length} 条监管明令禁止的表述特征`,
        text: `比如「${sample}」。命中的类型有：${types.slice(0, 4).join("、")}${types.length > 4 ? " 等" : ""}。`,
        watch: "我只能检查它说了什么，检查不了它实际做什么。要看每一条的法规依据，做一次完整体检。",
        source: "规则比对 · 不调用模型",
        action: { label: "去做完整体检", text: q },
      };
    }
    if (bare.length >= 60) {
      return {
        id: nid(),
        role: "bot",
        title: "规则没有识别到违规表述特征",
        text: "这不等于它就没问题——这只说明它没用那些监管明令禁止的说法。正规材料该有的风险提示、产品编码、费率这些，完整体检会逐项帮你对。",
        source: "规则比对 · 不调用模型",
        action: { label: "去做完整体检", text: q },
      };
    }
  }

  // ① 问一个词
  const terms = findTerms(q);
  const asksMeaning = /是什么|什么意思|啥意思|怎么理解|解释|指什么|是啥/.test(q);
  if (terms.length > 0 && (asksMeaning || bare.length <= 12)) {
    const t = terms[0];
    return {
      id: nid(),
      role: "bot",
      title: `「${t.term}」是什么`,
      text: t.plain,
      watch: t.watch,
      source: "本地术语表 · 不调用模型",
    };
  }
  return null;
}

/** ③ 规划师接口（SSE）。只取最终结果，阶段进度用小通的表情代替 */
async function askAdvisor(question: string, signal: AbortSignal): Promise<Msg> {
  let out: Msg | null = null;
  let checked = false;
  await streamSSE<any>("/api/plan/chat", { question, profile: loadProfile() }, {
    signal,
    onEvent: (ev) => {
      if (ev.stage === "gate" && ev.blocked) {
        out = {
          id: nid(),
          role: "bot",
          tone: "blocked",
          title: ev.reply.title,
          text: ev.reply.body,
          watch: ev.reply.instead,
          source: "规则直接拦下 · 这一步没有调用模型",
        };
      } else if (ev.stage === "guard") {
        checked = true;
      } else if (ev.stage === "answer") {
        out = {
          id: nid(),
          role: "bot",
          text: ev.text,
          source: ev.demoMode ? "规则模板回答 · 已过输出审查" : checked ? "模型讲解 · 已过输出审查" : "已过输出审查",
        };
      } else if (ev.stage === "error") {
        throw new Error(ev.message || "回答失败");
      }
    },
  });
  if (!out) throw new Error("没有拿到回答");
  return out;
}

export function Assistant() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([INTRO]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  /** 右下角的气泡：一句话 + 说这句话时的表情 */
  const [bubble, setBubble] = useState<Line | null>(null);
  /** 临时表情（被戳、被吵醒、打开面板时挥手），过一会儿自动恢复 */
  const [react, setReact] = useState<MascotMood | null>(null);
  const [sleeping, setSleeping] = useState(false);
  const [hover, setHover] = useState(false);
  const bubbleTimer = useRef<number | null>(null);
  const reactTimer = useRef<number | null>(null);
  const pokeIdx = useRef(0);
  /** 进行中的提问；关掉面板时取消 */
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }, [open]);
  /** 档案里的人生阶段。打开面板时读一次 */
  const [stage, setStage] = useState<LifeStage | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setMounted(true), []);

  /** 冒一句话；同时把表情切过去 */
  const say = useCallback((line: Line, ms = BUBBLE_MS) => {
    setBubble(line);
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  }, []);

  /** 临时换个表情 */
  const flash = useCallback((m: MascotMood, ms = 1800) => {
    setReact(m);
    if (reactTimer.current) window.clearTimeout(reactTimer.current);
    reactTimer.current = window.setTimeout(() => setReact(null), ms);
  }, []);

  useEffect(
    () => () => {
      if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
      if (reactTimer.current) window.clearTimeout(reactTimer.current);
    },
    [],
  );

  // 打招呼：本次会话第一次见面按时间问好；之后每个页面第一次进来，从该页的台词里随机挑一句。
  // 「已打过招呼」要等气泡真的冒出来再记——开发模式下 effect 会跑两遍，提前记会把招呼吞掉
  useEffect(() => {
    if (open) return;
    const read = (k: string) => {
      try {
        return window.sessionStorage.getItem(k);
      } catch {
        return null;
      }
    };
    const mark = (k: string) => {
      try {
        window.sessionStorage.setItem(k, "1");
      } catch {
        /* 隐私模式 */
      }
    };
    const pageKey = `caidun.greeted:${pathname}`;
    const first = !read("caidun.greeted");
    if (!first && (read(pageKey) || !ROUTE_LINES[pathname])) return;
    const t = window.setTimeout(() => {
      mark("caidun.greeted");
      mark(pageKey);
      say(first ? timeGreeting() : pick(ROUTE_LINES[pathname]), 8000);
    }, 1400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // 空闲小贴士：面板关着、没在说话时，隔一阵冒一条；每页最多 TIP_MAX 条
  useEffect(() => {
    if (open || navigator.webdriver) return;
    let shown = 0;
    let lastTip = -1;
    const id = window.setInterval(() => {
      if (shown >= TIP_MAX || document.hidden) return;
      let i = Math.floor(Math.random() * TIPS.length);
      if (i === lastTip) i = (i + 1) % TIPS.length;
      lastTip = i;
      shown += 1;
      setSleeping(false);
      say(TIPS[i]);
    }, TIP_EVERY);
    return () => window.clearInterval(id);
  }, [open, pathname, say]);

  // 打盹：一分钟没动静就睡着；一动就惊醒，偶尔嘟囔一句
  useEffect(() => {
    if (open || navigator.webdriver) return;
    let last = Date.now();
    let asleep = false;
    const wake = () => {
      last = Date.now();
      if (!asleep) return;
      asleep = false;
      setSleeping(false);
      flash("surprise", 1400);
      if (Math.random() < 0.5) say(pick(WAKE_LINES), 3500);
    };
    const tick = window.setInterval(() => {
      if (!asleep && Date.now() - last > SLEEP_AFTER) {
        asleep = true;
        setSleeping(true);
        setBubble(null);
      }
    }, 5000);
    const evs = ["pointermove", "keydown", "scroll", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      window.clearInterval(tick);
      evs.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [open, flash, say]);

  // 页面上发生的事（答对一题、体检出结果……）通过 mascotSay() 让小通冒一句
  useEffect(() => {
    const on = (e: Event) => {
      const line = (e as CustomEvent<Line>).detail;
      if (!line) return;
      setSleeping(false);
      if (open) flash(line.mood, 2400);
      else say(line, 5000);
    };
    window.addEventListener(MASCOT_EVENT, on);
    return () => window.removeEventListener(MASCOT_EVENT, on);
  }, [open, flash, say]);

  /** 戳一下：按顺序换反应 */
  const poke = () => {
    const line = POKES[pokeIdx.current % POKES.length];
    pokeIdx.current += 1;
    flash(line.mood, 2200);
    if (!open) say(line, 3000);
  };

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  // 新回答出来时，让回答自带的表情接管（清掉打开面板时那次挥手之类的临时反应）
  useEffect(() => {
    const m = msgs[msgs.length - 1];
    if (m && m.role === "bot" && m.id !== "intro") setReact(null);
  }, [msgs]);

  useEffect(() => {
    if (!open) return;
    setBubble(null);
    setSleeping(false);
    flash("wave", 1600);
    setStage(getStage(loadProfile().lifeStage));
    const t = window.setTimeout(() => inputRef.current?.focus(), 120);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, flash]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setQ("");
      setMsgs((m) => [...m, { id: nid(), role: "user", text }]);

      // 自述处境且档案里还没有阶段 → 记下来（只是补一句确认，原问题照常回答）
      const said = stageFromText(text);
      if (said && !loadProfile().lifeStage) {
        const st = getStage(said)!;
        saveProfile({ lifeStage: said });
        setStage(st);
        setMsgs((m) => [
          ...m,
          {
            id: nid(),
            role: "bot",
            mood: "happy",
            text: `记下了，你现在处在「${st.label}」阶段。以后我会按这个阶段来提醒你。`,
            source: "已写进你的档案 · 只存在你自己的浏览器里，可在「我的档案」里改",
          },
        ]);
      }

      const local = localReply(text);
      if (local) {
        setBusy(true);
        // 本地答案是秒出的，留一小段「想一想」，不然像没在听
        window.setTimeout(() => {
          setMsgs((m) => [...m, local]);
          setBusy(false);
        }, 450);
        return;
      }

      setBusy(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const reply = await askAdvisor(text.slice(0, 500), ctrl.signal);
        setMsgs((m) => [...m, reply]);
      } catch (e) {
        if (isAbort(e)) return; // 关掉了面板，不算出错
        setMsgs((m) => [
          ...m,
          { id: nid(), role: "bot", text: e instanceof Error ? e.message : "回答失败，再试一次？", tone: "worry" },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const handoff = (text: string) => {
    try {
      window.sessionStorage.setItem(PENDING_CHECK_KEY, text);
    } catch {
      /* 存不进去就只能靠事件了 */
    }
    setOpen(false);
    if (pathname === "/") window.dispatchEvent(new CustomEvent(PENDING_CHECK_EVENT));
    else router.push("/");
  };

  const last = msgs[msgs.length - 1];
  // 面板里的表情：临时反应 > 正在想 > 最后一条回答带的表情
  const chatMood: MascotMood =
    react ??
    (busy
      ? "think"
      : last?.role !== "bot"
        ? "idle"
        : last.mood ?? (last.tone === "worry" ? "worry" : last.tone === "blocked" ? "wink" : last.id === "intro" ? "idle" : "happy"));
  // 入口按钮上的表情：临时反应 > 气泡那句话的表情 > 睡着 > 鼠标悬停时眨眼
  const dockMood: MascotMood = react ?? bubble?.mood ?? (sleeping ? "sleepy" : hover ? "wink" : "idle");

  if (!mounted) return null;

  return createPortal(
    <>
      {/* ── 常驻入口 ── */}
      {!open && (
        <div className="fixed bottom-3 right-3 z-[60] flex items-end gap-2 sm:bottom-6 sm:right-6">
          {bubble && (
            <div key={bubble.text} className="cd-pop relative mb-10 max-w-[15rem]">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="block rounded-2xl rounded-br-md border border-brand-200 bg-paper py-2.5 pl-3.5 pr-7 text-left text-[length:calc(13.5px*var(--fs))] leading-snug text-brand-900 shadow-pop transition-colors hover:bg-brand-50"
              >
                {bubble.text}
              </button>
              <button
                type="button"
                onClick={() => setBubble(null)}
                aria-label="收起这句话"
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full text-ink-mute transition-colors hover:bg-brand-100 hover:text-brand-800"
              >
                <Icon name="x" className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => setHover(false)}
            aria-label="打开小通助手，问一个问题"
            title="问问小通"
            className="group relative grid h-16 w-16 place-items-center rounded-full bg-paper shadow-pop ring-1 ring-brand-200 transition hover:-translate-y-0.5 hover:ring-brand-400 sm:h-20 sm:w-20"
          >
            <Mascot mood={dockMood} size={52} follow className="translate-y-0.5 sm:hidden" />
            <Mascot mood={dockMood} size={60} follow className="hidden translate-y-0.5 sm:block" />
            <span className="absolute -top-1 right-0 rounded-full bg-brand-700 px-1.5 py-0.5 text-[length:calc(10.5px*var(--fs))] font-semibold text-on-brand shadow-card ring-2 ring-paper">
              {sleeping ? "zzz" : "问我"}
            </span>
          </button>
        </div>
      )}

      {/* ── 对话面板 ── */}
      {open && (
        <div
          role="dialog"
          aria-label="小通助手"
          className="cd-pop fixed inset-x-2 bottom-2 z-[60] flex h-[min(38rem,calc(100dvh-1rem))] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-pop sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[25rem]"
        >
          <header className="relative flex items-center gap-3 overflow-hidden bg-gradient-to-br from-brand-800 to-brand-700 px-4 py-3">
            <button
              type="button"
              onClick={poke}
              aria-label="戳一下小通"
              title="戳一下"
              className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-50/95 ring-1 ring-brand-300/40 transition hover:bg-paper active:scale-95"
            >
              <Mascot mood={chatMood} size={44} follow />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[length:calc(16px*var(--fs))] font-bold text-on-brand">小通</p>
              <p className="flex items-center gap-1.5 text-[length:calc(12px*var(--fs))] text-brand-100">
                <span className={`h-2 w-2 rounded-full ${busy ? "cd-pulse bg-brand-200" : "bg-brand-300"}`} />
                {busy ? "正在想…" : "在线 · 不推荐产品 · 不预测涨跌"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="关闭"
              className="grid h-9 w-9 place-items-center rounded-full text-brand-100 transition-colors hover:bg-brand-900/40 hover:text-on-brand"
            >
              <Icon name="x" className="h-5 w-5" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-paper-soft px-3.5 py-4">
            {msgs.map((m) => (m.role === "user" ? <UserBubble key={m.id} m={m} /> : <BotBubble key={m.id} m={m} onAction={handoff} />))}

            {busy && (
              <div className="cd-in flex items-end gap-2">
                <Avatar />
                <div className="cd-typing flex gap-1 rounded-2xl rounded-bl-md border border-line bg-paper px-3.5 py-3 shadow-card">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                </div>
              </div>
            )}

            {/* 还不知道人生阶段：先问一句。选了就写进档案，三个智能体都会用上 */}
            {msgs.length === 1 && !busy && !stage && (
              <div className="cd-in pl-9">
                <p className="text-[length:calc(13px*var(--fs))] font-medium text-brand-900">先告诉我，你现在处在哪个阶段？</p>
                <p className="text-[length:calc(12px*var(--fs))] text-ink-mute">同一个问题，学生和快退休的人该听到的不一样。</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {STAGES.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        saveProfile({ lifeStage: st.id });
                        setStage(st);
                        setMsgs((m) => [
                          ...m,
                          { id: nid(), role: "user", text: `我现在是：${st.label}` },
                          {
                            id: nid(),
                            role: "bot",
                            mood: "happy",
                            title: `好，「${st.label}」`,
                            text: st.talk,
                            watch: `这个阶段最该先做的：${st.focus[0].title}。${st.focus[0].why}`,
                            source: "已写进你的档案 · 只存在你自己的浏览器里，可在「我的档案」里改",
                          },
                        ]);
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-paper px-2.5 py-1.5 text-[length:calc(12.5px*var(--fs))] text-brand-800 transition hover:border-brand-400 hover:bg-brand-50"
                    >
                      <Icon name={st.icon} className="h-3.5 w-3.5" />
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.length <= 3 && !busy && (stage || msgs.length === 1) && (
              <div className="cd-in pl-9">
                <p className="text-[length:calc(12px*var(--fs))] text-ink-mute">{stage ? `「${stage.label}」常问：` : "也可以直接问："}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(stage ? stage.questions : STARTERS).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="rounded-full border border-brand-200 bg-paper px-3 py-1.5 text-[length:calc(13px*var(--fs))] text-brand-800 transition hover:border-brand-400 hover:bg-brand-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(q);
            }}
            className="flex items-end gap-2 border-t border-line bg-paper p-3"
          >
            <textarea
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(q);
                }
              }}
              rows={1}
              placeholder="问一个词，或贴一段可疑的话"
              aria-label="输入问题"
              className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-line bg-paper-soft px-3.5 py-2.5 text-[length:calc(14.5px*var(--fs))] leading-snug text-ink outline-none transition placeholder:text-ink-mute/70 focus-visible:border-brand-500 focus-visible:bg-paper focus-visible:ring-2 focus-visible:ring-brand-200"
            />
            <button
              type="submit"
              disabled={busy || !q.trim()}
              aria-label="发送"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-800 text-on-brand shadow-card transition hover:bg-brand-900 disabled:cursor-not-allowed disabled:bg-brand-100 disabled:text-brand-400 disabled:shadow-none"
            >
              <Icon name="arrowRight" className="h-5 w-5 -rotate-90" strokeWidth={2.25} />
            </button>
          </form>
        </div>
      )}
    </>,
    document.body,
  );
}

/** 回答里只会出现 **加粗** 这一种标记（规则模板写的），其余原样显示 */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <b key={i} className="font-semibold text-brand-900">
            {p.slice(2, -2)}
          </b>
        ) : (
          p
        ),
      )}
    </>
  );
}

function Avatar() {
  return (
    <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 ring-1 ring-brand-200">
      <Mascot size={20} />
    </span>
  );
}

function UserBubble({ m }: { m: Msg }) {
  return (
    <div className="cd-in flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand-700 px-3.5 py-2.5 text-[length:calc(14.5px*var(--fs))] leading-relaxed text-on-brand shadow-card">
        {m.text}
      </p>
    </div>
  );
}

function BotBubble({ m, onAction }: { m: Msg; onAction: (text: string) => void }) {
  const toneCls =
    m.tone === "worry"
      ? "border-risk-amber-line bg-risk-amber-bg"
      : m.tone === "blocked"
        ? "border-brand-300 bg-brand-50"
        : "border-line bg-paper";
  return (
    <div className="cd-in flex items-end gap-2">
      <Avatar />
      <div className={`max-w-[85%] rounded-2xl rounded-bl-md border px-3.5 py-2.5 shadow-card ${toneCls}`}>
        {m.title && (
          <p
            className={`flex items-center gap-1.5 text-[length:calc(14.5px*var(--fs))] font-semibold ${
              m.tone === "worry" ? "text-risk-amber" : "text-brand-900"
            }`}
          >
            {m.tone === "worry" && <Icon name="alert" className="h-4 w-4" />}
            {m.tone === "blocked" && <Icon name="lock" className="h-4 w-4" />}
            {m.title}
          </p>
        )}
        <p className={`whitespace-pre-line text-[length:calc(14.5px*var(--fs))] leading-relaxed text-ink ${m.title ? "mt-1" : ""}`}>
          <Rich text={m.text} />
        </p>
        {m.watch && (
          <p className="mt-2 whitespace-pre-line border-t border-line/70 pt-2 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
            <Rich text={m.watch} />
          </p>
        )}
        {m.action && (
          <button
            type="button"
            onClick={() => onAction(m.action!.text)}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-3 py-1.5 text-[length:calc(13px*var(--fs))] font-semibold text-on-brand transition hover:bg-brand-900"
          >
            <Icon name="shieldCheck" className="h-4 w-4" />
            {m.action.label}
          </button>
        )}
        {m.source && (
          <p className="mt-2 flex items-center gap-1 text-[length:calc(11.5px*var(--fs))] text-ink-mute">
            <Icon name="check" className="h-3 w-3" strokeWidth={2.5} />
            {m.source}
          </p>
        )}
      </div>
    </div>
  );
}
