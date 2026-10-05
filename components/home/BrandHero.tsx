"use client";

import { Icon } from "@/components/ui/Icon";
import { useEffect, useRef, useState } from "react";
import { Mascot, type MascotMood } from "@/components/assistant/Mascot";
import { POKES, type Line } from "@/components/assistant/lines";

/**
 * 首页品牌区。只出现在首页，承载 slogan。
 *
 * 为什么之前没有：这个产品是 Tab 优先的，进来第一眼是「识别与翻译」这个工具页，
 * 没有落地页，所以 slogan 一直只活在提交材料里，网站上一个字都没有。
 *
 * 为什么做得克制：它上面是导航、下面就是「丢进来」的输入框。
 * 品牌区一大，工具就被推到折叠线以下——这个产品的价值是「马上能查」，
 * 不是「先看我们的理念」。所以只给一句 slogan 加三条边界承诺，不做整屏 hero。
 *
 * 深绿底是全站唯一一块深色面：让人一眼认出「这是财智通」，
 * 也和下方白色的工具区拉开层次。纹理和盾牌都是内联 SVG（项目禁止任何外链资源）。
 */
const PLEDGES = ["不推荐具体产品", "不预测涨跌", "不承诺收益"];

export function BrandHero() {
  return (
    <section
      aria-label="财智通"
      className="relative isolate overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-5 shadow-raised sm:p-7"
    >
      {/* 细网格纹理，往右下渐隐。纯装饰 */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 -z-10 h-full w-full text-brand-600 opacity-40">
        <defs>
          <pattern id="cz-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0v28" fill="none" stroke="currentColor" strokeWidth="0.6" />
          </pattern>
          <linearGradient id="cz-fade" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="white" stopOpacity="0" />
            <stop offset="1" stopColor="white" stopOpacity="1" />
          </linearGradient>
          <mask id="cz-mask">
            <rect width="100%" height="100%" fill="url(#cz-fade)" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#cz-grid)" mask="url(#cz-mask)" />
      </svg>

      {/* 小通站在右侧打招呼，可以戳。手机上缩小、贴右上角，不挡文字 */}
      <HeroMascot />

      <p className="mr-20 inline-flex items-center gap-1.5 rounded-full bg-brand-950/40 sm:mr-0 px-2.5 py-1 text-[length:calc(12px*var(--fs))] font-semibold tracking-widest text-brand-200 ring-1 ring-brand-600/60">
        <Icon name="shieldCheck" className="h-[1.15em] w-[1.15em]" />
        财智通 · 金融安全智能体
      </p>
      <p className="mt-3 max-w-xl pr-16 text-[length:calc(22px*var(--fs))] sm:pr-0 font-bold leading-snug tracking-tight text-on-brand sm:text-[length:calc(28px*var(--fs))]">
        让每个人都能读懂金融，
        <br className="hidden sm:block" />
        守护每一分财富
      </p>
      <p className="mt-2 max-w-xl text-[length:calc(14px*var(--fs))] sm:pr-24 leading-relaxed text-brand-100">
        只帮你看清对方到底说了什么。判定靠规则，模型只负责讲人话。
      </p>

      <ul className="mt-4 flex max-w-xl flex-wrap gap-2 sm:pr-40">
        {PLEDGES.map((p) => (
          <li
            key={p}
            className="inline-flex items-center gap-1.5 rounded-full bg-paper/10 px-3 py-1 text-[length:calc(12.5px*var(--fs))] font-medium text-brand-50 ring-1 ring-paper/15"
          >
            <Icon name="ban" className="h-[1.05em] w-[1.05em] text-brand-300" />
            {p}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 品牌区里的小通：默认挥手；戳一下按顺序换表情，头上冒一句话 */
function HeroMascot() {
  const [line, setLine] = useState<Line | null>(null);
  const idx = useRef(0);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const poke = () => {
    const l = POKES[idx.current % POKES.length];
    idx.current += 1;
    setLine(l);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLine(null), 2600);
  };
  const mood: MascotMood = line?.mood ?? "wave";

  return (
    <div className="absolute -right-2 top-3 sm:right-8 sm:top-1/2 sm:-translate-y-1/2">
      <div aria-hidden className="pointer-events-none absolute inset-x-2 bottom-3 top-6 rounded-full bg-brand-300/35 blur-2xl" />
      {line && (
        <p
          key={line.text}
          role="status"
          className="cd-pop absolute right-full top-6 z-10 mr-1 whitespace-nowrap rounded-xl rounded-br-sm bg-paper px-2.5 py-1.5 text-[length:calc(12.5px*var(--fs))] font-medium text-brand-900 shadow-pop sm:-top-6 sm:right-24 sm:mr-0"
        >
          {line.text}
        </p>
      )}
      <button
        type="button"
        onClick={poke}
        aria-label="戳一下小通"
        title="戳一下"
        className="relative block rounded-full transition-transform hover:scale-105 active:scale-95"
      >
        <Mascot mood={mood} follow size={150} className="hidden sm:block" />
        <Mascot mood={mood} size={78} className="sm:hidden" />
      </button>
    </div>
  );
}
