"use client";

/**
 * 小通：财智通的形象。一面会眨眼、会挥手、眼睛跟着你走的小盾牌。
 *
 * 为什么要有它：全站原来只有文字和图标，信息很准但很「冷」，
 * 读起来像一份报告。我们的用户是理财小白和长辈，一个有表情的角色
 * 能把「被提醒有风险」这件事从「被教育」变成「有人陪你看」。
 *
 * 全部内联 SVG + CSS 动画（项目禁止外链资源，也不引入动画库）。
 * 颜色只用 globals.css 里的 token；动画在 prefers-reduced-motion 下全部停掉。
 *
 * mood：
 *   idle      上下浮动 + 眨眼
 *   wave      挥手打招呼
 *   think     头顶冒点点、嘴在动（等回答 / 分析中）
 *   happy     眯眼笑
 *   worry     八字眉 + 撇嘴（看到可疑话术）
 *   look      举着放大镜（识别中）
 *   surprise  圆眼 + 挑眉 + O 型嘴 + 感叹号（被戳 / 被吵醒）
 *   sleepy    闭眼 + 冒 zzz（一分钟没人理它）
 *   love      爱心眼 + 头顶飘爱心（被道谢）
 *   wink      单眼眨（被夸、打趣）
 *   cheer     双手举高 + 蹦 + 闪光（答对、过关）
 *   shy       眼睛往下看 + 大腮红（被夸）
 */
import { useEffect, useId, useRef } from "react";

export type MascotMood =
  | "idle"
  | "wave"
  | "think"
  | "happy"
  | "worry"
  | "look"
  | "surprise"
  | "sleepy"
  | "love"
  | "wink"
  | "cheer"
  | "shy";

const INK = "var(--ink)";
const SHIELD =
  "M60 18 C76 18 92 22 100 27 C102 58 96 88 60 110 C24 88 18 58 20 27 C28 22 44 18 60 18Z";

/** 小爱心，中心在 (0,0)，宽约 10 */
const HEART = "M0 3.6 C-5.2 0 -5.2 -4.6 -2.4 -4.6 C-1 -4.6 0 -3.4 0 -2.4 C0 -3.4 1 -4.6 2.4 -4.6 C5.2 -4.6 5.2 0 0 3.6Z";
/** 四角闪光星，中心在 (0,0) */
const SPARK = "M0 -6 C0.8 -1.6 1.6 -0.8 6 0 C1.6 0.8 0.8 1.6 0 6 C-0.8 1.6 -1.6 0.8 -6 0 C-1.6 -0.8 -0.8 -1.6 0 -6Z";

export function Mascot({
  mood = "idle",
  size = 96,
  follow = false,
  className = "",
  title,
}: {
  mood?: MascotMood;
  size?: number;
  /** 眼睛跟随鼠标 */
  follow?: boolean;
  className?: string;
  /** 有 title 时作为图片朗读，否则视为装饰 */
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const pupilRef = useRef<SVGGElement>(null);

  // 眼珠跟随：位移最多 2.6 个单位，rAF 节流，不触发 React 重渲染
  useEffect(() => {
    if (!follow) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const svg = svgRef.current;
        const g = pupilRef.current;
        if (!svg || !g) return;
        const r = svg.getBoundingClientRect();
        const dx = x - (r.left + r.width / 2);
        const dy = y - (r.top + r.height * 0.45);
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 260) * 2.6;
        g.style.transform = `translate(${((dx / d) * k).toFixed(2)}px, ${((dy / d) * k).toFixed(2)}px)`;
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [follow]);

  const body = `mz-body-${uid}`;
  const shine = `mz-shine-${uid}`;
  const armsUp = mood === "cheer";
  const bigBlush = mood === "shy" || mood === "love";

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 120 130"
      width={size}
      height={(size * 130) / 120}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={`mz overflow-visible ${className}`}
      data-mood={mood}
    >
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="var(--brand-400)" />
          <stop offset="1" stopColor="var(--brand-700)" />
        </linearGradient>
        <radialGradient id={shine} cx="0.35" cy="0.25" r="0.5">
          <stop offset="0" stopColor="var(--paper)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--paper)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 地面影子：跟着身体浮动一起缩放 */}
      <ellipse className="mz-shadow" cx="60" cy="122" rx="26" ry="4.5" fill="var(--brand-900)" opacity="0.14" />

      <g className="mz-float">
        {/* 头顶小芽 */}
        <g className="mz-sprout">
          <path d="M60 20 C60 14 60 10 60 8" stroke="var(--brand-700)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <path d="M60 10 C52 4 45 7 44 11 C50 14 56 13 60 10Z" fill="var(--brand-300)" />
          <path d="M60 9 C67 2 75 4 76 9 C70 12 64 12 60 9Z" fill="var(--brand-400)" />
        </g>

        {/* 手臂：cheer 时双手举高，其余垂在两侧（wave 时右手挥动） */}
        {armsUp ? (
          <>
            <path className="mz-arm-up-l" d="M24 52 C16 46 13 38 15 30" stroke="var(--brand-600)" strokeWidth="7" strokeLinecap="round" fill="none" />
            <path className="mz-arm-up-r" d="M96 52 C104 46 107 38 105 30" stroke="var(--brand-600)" strokeWidth="7" strokeLinecap="round" fill="none" />
          </>
        ) : (
          <>
            <path className="mz-arm-l" d="M22 62 C14 66 11 74 13 80" stroke="var(--brand-600)" strokeWidth="7" strokeLinecap="round" fill="none" />
            <path className="mz-arm-r" d="M98 62 C106 66 109 74 107 80" stroke="var(--brand-600)" strokeWidth="7" strokeLinecap="round" fill="none" />
          </>
        )}

        {/* 盾形身体 */}
        <path d={SHIELD} fill={`url(#${body})`} />
        <path d={SHIELD} fill={`url(#${shine})`} />

        {/* 脸盘 */}
        <ellipse cx="60" cy="56" rx="29" ry="23" fill="var(--brand-50)" />

        <Brows mood={mood} />
        <Eyes mood={mood} pupilRef={pupilRef} />

        {/* 腮红：害羞、比心时更大更红 */}
        <ellipse cx="40" cy="64" rx={bigBlush ? 6.5 : 4.5} ry={bigBlush ? 3.6 : 2.6} fill="var(--blush)" opacity={bigBlush ? 0.95 : 0.7} />
        <ellipse cx="80" cy="64" rx={bigBlush ? 6.5 : 4.5} ry={bigBlush ? 3.6 : 2.6} fill="var(--blush)" opacity={bigBlush ? 0.95 : 0.7} />

        <Mouth mood={mood} />

        {/* 胸前徽章：对勾 */}
        <circle cx="60" cy="90" r="8" fill="var(--brand-800)" />
        <path d="M56 90 L59 93 L64.5 87" stroke="var(--brand-100)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />

        {/* 放大镜：look 时拿在右手 */}
        {mood === "look" && (
          <g className="mz-glass">
            <circle cx="104" cy="74" r="10" fill="var(--paper)" fillOpacity="0.55" stroke="var(--brand-900)" strokeWidth="3" />
            <path d="M111 81 L118 88" stroke="var(--brand-900)" strokeWidth="4" strokeLinecap="round" />
          </g>
        )}
      </g>

      <Extras mood={mood} />
    </svg>
  );
}

function Brows({ mood }: { mood: MascotMood }) {
  if (mood === "worry") {
    return (
      <g stroke="var(--brand-900)" strokeWidth="2.2" strokeLinecap="round">
        <path d="M44 42 L52 45" />
        <path d="M76 42 L68 45" />
      </g>
    );
  }
  if (mood === "surprise") {
    return (
      <g stroke="var(--brand-900)" strokeWidth="2.2" strokeLinecap="round" fill="none">
        <path d="M43 42 Q48 38 53 41" />
        <path d="M67 41 Q72 38 77 42" />
      </g>
    );
  }
  return null;
}

function Eyes({ mood, pupilRef }: { mood: MascotMood; pupilRef: React.RefObject<SVGGElement | null> }) {
  // 眯眼笑：两道向上的弧
  if (mood === "happy" || mood === "cheer") {
    return (
      <g stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M44 56 Q49 50 54 56" />
        <path d="M66 56 Q71 50 76 56" />
      </g>
    );
  }
  // 犯困：两道向下的弧
  if (mood === "sleepy") {
    return (
      <g stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M44 55 Q49 59 54 55" />
        <path d="M66 55 Q71 59 76 55" />
      </g>
    );
  }
  // 爱心眼
  if (mood === "love") {
    return (
      <g fill="var(--heart)" className="mz-heart-eyes">
        <path d={HEART} transform="translate(49 55) scale(1.35)" />
        <path d={HEART} transform="translate(71 55) scale(1.35)" />
      </g>
    );
  }
  // 单眼眨：左眼睁、右眼闭
  if (mood === "wink") {
    return (
      <>
        <g ref={pupilRef} className="mz-pupils">
          <ellipse cx="49" cy="55" rx="4.6" ry="6" fill={INK} />
          <circle cx="50.6" cy="52.6" r="1.6" fill="var(--paper)" />
        </g>
        <path d="M66 56 Q71 51 76 56" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />
      </>
    );
  }
  // 害羞：眼珠往下看，不跟随鼠标
  if (mood === "shy") {
    return (
      <g>
        <ellipse cx="49" cy="58" rx="4.2" ry="4.8" fill={INK} />
        <ellipse cx="71" cy="58" rx="4.2" ry="4.8" fill={INK} />
        <circle cx="50.2" cy="56.4" r="1.3" fill="var(--paper)" />
        <circle cx="72.2" cy="56.4" r="1.3" fill="var(--paper)" />
      </g>
    );
  }
  // 惊讶：圆眼、瞳孔变小、高光变大
  const surprised = mood === "surprise";
  return (
    <g className={surprised ? undefined : "mz-blink"}>
      <g ref={pupilRef} className="mz-pupils">
        {surprised ? (
          <>
            <circle cx="49" cy="55" r="6.4" fill="var(--paper)" stroke={INK} strokeWidth="2" />
            <circle cx="71" cy="55" r="6.4" fill="var(--paper)" stroke={INK} strokeWidth="2" />
            <circle cx="49" cy="55" r="3" fill={INK} />
            <circle cx="71" cy="55" r="3" fill={INK} />
          </>
        ) : (
          <>
            <ellipse cx="49" cy="55" rx="4.6" ry="6" fill={INK} />
            <ellipse cx="71" cy="55" rx="4.6" ry="6" fill={INK} />
            <circle cx="50.6" cy="52.6" r="1.6" fill="var(--paper)" />
            <circle cx="72.6" cy="52.6" r="1.6" fill="var(--paper)" />
          </>
        )}
      </g>
    </g>
  );
}

function Mouth({ mood }: { mood: MascotMood }) {
  switch (mood) {
    case "worry":
      return <path d="M55 69 Q60 65 65 69" stroke={INK} strokeWidth="2.2" strokeLinecap="round" fill="none" />;
    case "think":
      return <ellipse className="mz-mouth-talk" cx="60" cy="68" rx="3" ry="2.4" fill={INK} />;
    case "surprise":
      return <ellipse cx="60" cy="69" rx="3.4" ry="4.2" fill={INK} />;
    case "sleepy":
      return <ellipse className="mz-snore" cx="60" cy="68" rx="2.2" ry="1.6" fill={INK} />;
    case "shy":
      // 抿嘴的小波浪
      return <path d="M54 67 Q57 69.5 60 67 Q63 64.5 66 67" stroke={INK} strokeWidth="2" strokeLinecap="round" fill="none" />;
    case "cheer":
    case "love":
      // 张嘴大笑：实心半月 + 小舌头
      return (
        <g>
          <path d="M51 64 Q60 76 69 64 Z" fill={INK} />
          <path d="M56 69.5 Q60 73 64 69.5 Q60 71 56 69.5Z" fill="var(--blush)" />
        </g>
      );
    case "wink":
      return <path d="M53 65 Q61 73 68 63" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />;
    default:
      return <path d="M53 65 Q60 72 67 65" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />;
  }
}

/** 身体之外的小道具：思考泡泡、zzz、爱心、闪光、感叹号 */
function Extras({ mood }: { mood: MascotMood }) {
  switch (mood) {
    case "think":
      return (
        <g fill="var(--brand-500)">
          <circle className="mz-dot mz-dot-1" cx="92" cy="14" r="3.2" />
          <circle className="mz-dot mz-dot-2" cx="102" cy="8" r="3.2" />
          <circle className="mz-dot mz-dot-3" cx="112" cy="2" r="3.2" />
        </g>
      );
    case "sleepy":
      return (
        <g fill="var(--brand-600)" fontWeight="700" fontFamily="inherit">
          <text className="mz-z mz-z-1" x="88" y="22" fontSize="12">z</text>
          <text className="mz-z mz-z-2" x="98" y="12" fontSize="15">z</text>
          <text className="mz-z mz-z-3" x="108" y="0" fontSize="18">Z</text>
        </g>
      );
    case "love":
      return (
        <g fill="var(--heart)">
          <g transform="translate(96 16) scale(1.2)"><path className="mz-rise mz-rise-1" d={HEART} /></g>
          <g transform="translate(22 12) scale(0.9)"><path className="mz-rise mz-rise-2" d={HEART} /></g>
          <g transform="translate(106 34) scale(0.8)"><path className="mz-rise mz-rise-3" d={HEART} /></g>
        </g>
      );
    case "cheer":
      return (
        <g fill="var(--spark)">
          <g transform="translate(10 18)"><path className="mz-twinkle mz-twinkle-1" d={SPARK} /></g>
          <g transform="translate(110 14) scale(0.8)"><path className="mz-twinkle mz-twinkle-2" d={SPARK} /></g>
          <g transform="translate(112 58) scale(0.6)"><path className="mz-twinkle mz-twinkle-3" d={SPARK} /></g>
          <g transform="translate(6 60) scale(0.55)"><path className="mz-twinkle mz-twinkle-1" d={SPARK} /></g>
        </g>
      );
    case "surprise":
      return (
        <g className="mz-pop-mark" fill="var(--spark)">
          <path d="M98 4 L104 4 L102.4 20 L99.6 20 Z" />
          <circle cx="101" cy="25" r="2.6" />
        </g>
      );
    case "wink":
      return <g transform="translate(92 40) scale(0.6)"><path className="mz-twinkle mz-twinkle-1" d={SPARK} fill="var(--spark)" /></g>;
    default:
      return null;
  }
}
