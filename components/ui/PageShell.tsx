"use client";

/**
 * 页面外壳：电脑版「左侧粘性目录 + 右侧正文」，手机版仍是单列。
 *
 * 为什么要有它：规划师页 9.1 屏、骗局图鉴 8.6 屏、首页出报告后 6.7 屏。
 * 内容本身不冗余——是判定依据、法规引证、剧本推演，一条都不该砍。
 * 所以解法不是砍内容，而是不让人靠滚轮找内容：目录常驻，点一下直接到。
 *
 * 目录是**自动发现**的，不用在每个页面另维护一份清单：
 * 正文里给小节加 `data-outline="标签"` 就会出现在目录里，去掉就消失。
 * 首页那些「出了报告才有」的小节因此也能自动跟上（靠 MutationObserver）。
 *
 * 少于 3 节时整条目录不渲染——两节东西还要目录，是给自己加噪音。
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface Item {
  id: string;
  label: string;
}

export function PageShell({
  title,
  children,
  py = "py-8",
  /** 目录最下方的一条跨页链接，比如「← 遇到可疑广告」 */
  footLink,
}: {
  /** 目录顶部显示的页名，和 h1 一致 */
  title: string;
  children: React.ReactNode;
  py?: string;
  footLink?: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState<string | null>(null);

  // ── 发现小节 ────────────────────────────────────────
  const scan = useCallback(() => {
    const root = contentRef.current;
    if (!root) return;
    const found: Item[] = [];
    const used = new Set<string>();
    root.querySelectorAll<HTMLElement>("[data-outline]").forEach((el) => {
      const label = el.dataset.outline?.trim();
      if (!label) return;
      // id 直接用标签（空格换成连字符），这样导航下拉菜单可以写成 /plan#两个计算器。
      // 换成 sec-0 这种序号就不行了——加一节会让所有旧链接错位。
      if (!el.id) {
        const base = label.replace(/\s+/g, "-");
        let id = base;
        for (let k = 2; used.has(id) || document.getElementById(id); k += 1) id = `${base}-${k}`;
        el.id = id;
      }
      used.add(el.id);
      found.push({ id: el.id, label });
    });
    setItems((prev) =>
      prev.length === found.length && prev.every((p, i) => p.id === found[i].id && p.label === found[i].label)
        ? prev
        : found,
    );
  }, []);

  useEffect(() => {
    scan();
    const root = contentRef.current;
    if (!root) return;
    // 首页的报告是流式出来的，小节会一节一节冒出来
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [scan]);

  // ── 跟随滚动高亮 ────────────────────────────────────
  useEffect(() => {
    if (items.length < 3) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        // 判定线放在视口上方 1/4 处：一节的标题刚过线就算「正在看这节」
        const line = window.innerHeight * 0.25;
        let cur: string | null = items[0]?.id ?? null;
        for (const it of items) {
          const el = document.getElementById(it.id);
          if (el && el.getBoundingClientRect().top <= line) cur = it.id;
        }
        setActive(cur);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [items]);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    // scroll-margin-top 在 globals.css 里给 [data-outline] 统一设过，
    // 所以这里直接 scrollIntoView 就不会被吸顶导航盖住
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  };

  // 带 #锚点进来时，小节往往比 hash 晚好几步才渲染出来（?demo=1 的结果是挂载后才算的），
  // 浏览器自己那次跳转会落空。所以要盯着 items 变化，等目标真的出现了再跳，且只跳一次。
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || !items.length) return;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash) {
      jumped.current = true; // 没带锚点，之后也不用再管
      return;
    }
    if (!items.some((i) => i.id === hash)) return; // 目标还没渲染出来，等下一次 items 变化
    const el = document.getElementById(hash);
    if (!el) return;
    jumped.current = true;
    requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
  }, [items]);

  const showOutline = items.length >= 3;

  return (
    <div className={`mx-auto max-w-6xl px-4 ${py}`}>
      <div className={showOutline ? "lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10" : ""}>
        {showOutline && (
          <nav
            aria-label="本页目录"
            className="hidden lg:block lg:sticky lg:top-20 lg:h-fit lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
          >
            <p className="text-[length:calc(13px*var(--fs))] font-semibold text-brand-900">{title}</p>
            <ul className="mt-3 space-y-0.5 border-l border-line">
              {items.map((it) => {
                const on = active === it.id;
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => go(it.id)}
                      aria-current={on ? "true" : undefined}
                      className={`-ml-px block w-full border-l-2 py-1.5 pl-3 pr-2 text-left text-[length:calc(13px*var(--fs))] leading-snug transition ${
                        on
                          ? "border-brand-700 font-semibold text-brand-900"
                          : "border-transparent text-ink-soft hover:border-brand-300 hover:text-brand-800"
                      }`}
                    >
                      {it.label}
                    </button>
                  </li>
                );
              })}
            </ul>
            {footLink && <div className="mt-4 text-[length:calc(13px*var(--fs))]">{footLink}</div>}
          </nav>
        )}

        <div
          ref={contentRef}
          className={`min-w-0 lg:max-w-3xl ${showOutline ? "" : "lg:mx-auto"}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
