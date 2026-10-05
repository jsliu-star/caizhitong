"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FontScale } from "@/components/ui/FontScale";

/**
 * 每个 Tab 挂一个下拉菜单，把里面有什么直接列出来。
 *
 * 为什么需要：三个 Tab 的名字（识别 / 学习 / 规划师）说得清「是什么」，
 * 说不清「进去能干什么」。用户得先点进去、滚一遍，才知道有没有他要的东西。
 * 菜单把这一步提前——鼠标悬停就看见，不用先付出一次点击加一次滚动。
 *
 * `to` 带 #锚点的走 PageShell 标出的小节，带 ?tab= 的走页面内的分块。
 *
 * 只在 sm 以上出现：手机屏幕上四个 Tab 加四个箭头会把导航挤成两行，
 * 而手机用户点 Tab 直接进页面本来就是对的交互，不需要先看一眼菜单。
 */
const NAV: Array<{
  href: string;
  label: string;
  short: string;
  /** 这个 Tab 一句话是干什么的 */
  blurb: string;
  items: Array<{ to: string; label: string; hint: string }>;
}> = [
  {
    href: "/",
    label: "识别与翻译",
    short: "识别",
    blurb: "截图或文字丢进来，先翻成人话，再看有没有风险。",
    items: [
      { to: "/", label: "丢一段进来", hint: "广告截图、群里转来的话、合同条款" },
      { to: "/#丢进来", label: "查一个词", hint: "年化、封闭期、平仓——不用打整句" },
      { to: "/?demo=sample-red-classic", label: "看一个高风险案例", hint: "仿真样本，走一遍完整判定流程" },
      { to: "/?demo=sample-green-legit", label: "看正规材料长什么样", hint: "要素齐备的产品页做对照" },
    ],
  },
  {
    href: "/learn",
    label: "学习",
    short: "学习",
    blurb: "短平快搞懂金融常识，顺手学会识别骗局。",
    items: [
      { to: "/learn?tab=quiz", label: "闯关", hint: "九关五十四题，答错就地讲清" },
      { to: "/learn?tab=judge", label: "识别测试", hint: "五段文案，和财智通比一比" },
      { to: "/learn?tab=dict", label: "术语表", hint: "24 条，点开才展开，不用背" },
      { to: "/learn/cases", label: "骗局图鉴", hint: "九类套路的推进剧本" },
    ],
  },
  {
    href: "/plan",
    label: "规划师",
    short: "规划",
    blurb: "有话直接问；想要更贴你的回答，再做测评。",
    items: [
      { to: "/plan", label: "问问规划师", hint: "它读你的档案，不推荐产品" },
      { to: "/plan#风险测评与画像", label: "风险测评与画像", hint: "12 道自适应问题，测出风险类型" },
      { to: "/plan#配置思路", label: "配置思路与优先级", hint: "只讲品类和比例，不指向产品" },
      { to: "/plan#两个计算器", label: "两个计算器", hint: "分期真实年化、应急备用金" },
    ],
  },
  {
    href: "/profile",
    label: "我的档案",
    short: "档案",
    blurb: "三个智能体共用的一份记忆，只存在你自己浏览器里。",
    items: [
      { to: "/profile#画像概览", label: "画像概览", hint: "风险类型、知识等级、遇到过的骗局" },
      { to: "/profile#三个-Tab-怎么用它", label: "三个 Tab 怎么用它", hint: "看清每一条信息被谁读了" },
      { to: "/profile#管理这份档案", label: "管理这份档案", hint: "导出、清空、载入示例" },
    ],
  },
];

export function Nav() {
  const pathname = usePathname() || "/";
  const isHome = pathname === "/";
  const [open, setOpen] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  // 点空白处 / Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 悬停进出留一点延迟，鼠标斜着划过去不会把菜单甩掉
  const hoverIn = (href: string) => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    if (window.matchMedia("(hover: hover)").matches) setOpen(href);
  };
  const hoverOut = () => {
    if (!window.matchMedia("(hover: hover)").matches) return;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(null), 180);
  };

  return (
    <div
      ref={wrapRef}
      className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-3 sm:gap-x-4"
    >
      <Link
        href="/"
        aria-current={isHome ? "page" : undefined}
        className="flex shrink-0 items-center gap-2"
        title="财智通首页"
      >
        <span
          aria-hidden
          className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-700 to-brand-900 text-[length:calc(15px*var(--fs))] font-bold text-brand-50 shadow-card ring-1 ring-brand-950/10"
        >
          财
        </span>
        <span
          className={`hidden text-[length:calc(17px*var(--fs))] font-semibold tracking-tight sm:inline ${
            isHome ? "text-brand-950" : "text-brand-900"
          }`}
        >
          财智通
        </span>
      </Link>

      {/* 导航用 flex-wrap 而不是 overflow-x-auto：字号调到 150% 时窄屏放不下四项，
          换行能全看见，横滑则会把最后一项藏起来——藏起来的恰恰是最需要它的人找不到。 */}
      <nav
        aria-label="主导航"
        className="flex flex-1 flex-wrap items-center gap-0.5 text-[length:calc(13.5px*var(--fs))] sm:gap-2 sm:text-[length:calc(14px*var(--fs))]"
      >
        {NAV.map((n) => {
          // 根路径必须精确匹配，否则会在所有页面上高亮
          const active = n.href === "/" ? pathname === "/" : pathname === n.href || pathname.startsWith(`${n.href}/`);
          const isOpen = open === n.href;
          return (
            <div
              key={n.href}
              className="relative"
              onMouseEnter={() => hoverIn(n.href)}
              onMouseLeave={hoverOut}
            >
              <div className="flex items-center">
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap rounded-full px-2 py-1.5 transition sm:pl-3 sm:pr-1 ${
                    active
                      ? "bg-brand-100 font-semibold text-brand-900 ring-1 ring-brand-200"
                      : "text-ink-soft hover:bg-brand-50 hover:text-brand-800"
                  }`}
                >
                  <span className="sm:hidden">{n.short}</span>
                  <span className="hidden sm:inline">{n.label}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : n.href)}
                  aria-expanded={isOpen}
                  aria-haspopup="menu"
                  aria-label={`${n.label}里有什么`}
                  className={`hidden min-h-8 w-6 place-items-center rounded-full transition sm:grid ${
                    active ? "text-brand-900" : "text-ink-mute hover:text-brand-800"
                  }`}
                >
                  {/* 内联 SVG：▾ 这个字符在小字号下会糊成一个点，看不出是可展开的 */}
                  <svg
                    aria-hidden
                    viewBox="0 0 10 6"
                    className={`h-[6px] w-[10px] transition-transform ${isOpen ? "rotate-180" : ""}`}
                  >
                    <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              {isOpen && (
                <div
                  role="menu"
                  aria-label={n.label}
                  className="cd-in absolute left-0 top-full z-50 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-line bg-paper p-2 shadow-pop"
                >
                  <p className="px-3 pb-2 pt-1.5 text-[length:calc(12.5px*var(--fs))] leading-relaxed text-ink-mute">
                    {n.blurb}
                  </p>
                  <ul className="border-t border-line pt-1.5">
                    {n.items.map((it) => (
                      <li key={it.to}>
                        <Link
                          href={it.to}
                          role="menuitem"
                          onClick={() => setOpen(null)}
                          className="block rounded-xl px-3 py-2 transition hover:bg-brand-50"
                        >
                          <span className="block text-[length:calc(14px*var(--fs))] font-semibold text-brand-900">
                            {it.label}
                          </span>
                          <span className="mt-0.5 block text-[length:calc(12.5px*var(--fs))] leading-snug text-ink-mute">
                            {it.hint}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* 老年人友好：字号调节放在导航里，不用先进某一页才找得到。
          百分比调节的实现见 components/ui/FontScale.tsx */}
      <FontScale />
    </div>
  );
}
