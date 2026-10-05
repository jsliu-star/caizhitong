"use client";

/**
 * 滚动渐入。挂在 layout 里一次，全站生效，页面不用改。
 *
 * 目标：main 里带 data-outline 的小节，以及显式标了 data-reveal 的元素。
 * 进入视口时淡入上移；已经出现过的不再重复。
 *
 * 几个刻意的保护：
 * - class 由 JS 加：脚本没跑起来时内容照常显示，不会整页空白
 * - 自动化浏览器（截图脚本、答辩前的回归截图）里不启用，否则整页截图下半截是空的
 * - 首页报告是流式渲染的，小节一个个冒出来，靠 MutationObserver 跟上
 */
import { useEffect } from "react";

const SELECTOR = "main [data-outline], main [data-reveal]";

export function Reveal() {
  useEffect(() => {
    if (navigator.webdriver) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("cd-shown");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
    );

    const scan = () => {
      document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        // 已经在首屏里的直接显示，不让用户一进来就等动画
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.9) return;
        el.classList.add("cd-reveal");
        io.observe(el);
      });
    };

    scan();
    const main = document.querySelector("main");
    const mo = new MutationObserver(scan);
    if (main) mo.observe(main, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  return null;
}
