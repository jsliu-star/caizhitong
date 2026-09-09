"use client";

/**
 * 全站文字大小调节。**只放大文字，不放大版式。**
 *
 * 全站有 380 多处把字号写死在元素上，现在一律写成
 * `text-[length:calc(13px*var(--fs))]`，乘的就是这里改的 `--fs`（写在 <html> 行内）。
 * 间距用 Tailwind 的 rem 尺度、SVG 图表用自己的 viewBox，都不引用 `--fs`，
 * 所以按钮尺寸、卡片内边距、图表大小保持不变——放大之后屏幕上能看到的信息量不会变少。
 *
 * 早先用的是 body { zoom }，那是整页缩放（等价于浏览器 Cmd+），已经换掉：
 * 老人要的是「字大一点」，不是「什么都大一点、一屏只剩两行」。
 *
 * 偏好存 localStorage，任何一页刷新后都保持；同时把旧的布尔偏好 caidun.largeText
 * 一起写回去，它驱动 globals.css 里 body[data-large="1"] 的 SSR 首帧兜底。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { saveLargeText } from "@/lib/profile";

const KEY = "caidun.fontScale";
export const MIN_SCALE = 100;
export const MAX_SCALE = 160;
const STEP = 5;

/** 预设档：给不想拖滑块的人（尤其是老年人）一步到位的按钮 */
const PRESETS: Array<{ pct: number; label: string }> = [
  { pct: 100, label: "标准" },
  { pct: 115, label: "大" },
  { pct: 130, label: "更大" },
  { pct: 150, label: "最大" },
];

function clamp(n: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(n / STEP) * STEP));
}

export function loadFontScale(): number {
  if (typeof window === "undefined") return MIN_SCALE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return MIN_SCALE;
    const n = Number(raw);
    return Number.isFinite(n) ? clamp(n) : MIN_SCALE;
  } catch {
    return MIN_SCALE;
  }
}

/** 应用到页面。写 <html> 的行内 --fs，行内值优先于样式表里的兜底规则 */
export function applyFontScale(pct: number) {
  if (typeof document === "undefined") return;
  const v = clamp(pct);
  document.documentElement.style.setProperty("--fs", String(v / 100));
  try {
    window.localStorage.setItem(KEY, String(v));
  } catch {
    /* 隐私模式下写入失败，降级为本次会话内有效 */
  }
  // 旧布尔偏好保持同步：它驱动 globals.css 里 SSR 首帧的兜底放大
  saveLargeText(v > 100);
}

export function FontScale() {
  const [pct, setPct] = useState(MIN_SCALE);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = loadFontScale();
    setPct(v);
    applyFontScale(v);
  }, []);

  const set = useCallback((next: number) => {
    const v = clamp(next);
    setPct(v);
    applyFontScale(v);
  }, []);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="调节文字大小"
        className={`flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[length:calc(13px*var(--fs))] font-semibold transition sm:px-3 sm:text-[length:calc(13.5px*var(--fs))] ${
          pct > 100
            ? "border-brand-700 bg-brand-800 text-white"
            : "border-brand-200 bg-paper text-brand-700 hover:bg-brand-50"
        }`}
      >
        <span aria-hidden className="text-[length:calc(15px*var(--fs))] leading-none">
          A
        </span>
        <span className="tabular-nums">{pct}%</span>
      </button>

      {open && (
        <>
          {/* 点击空白处关闭 */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            ref={panelRef}
            role="dialog"
            aria-label="文字大小调节"
            className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-line bg-paper p-4 shadow-lg"
          >
            <div className="flex items-baseline justify-between">
              <p className="text-[length:calc(15px*var(--fs))] font-bold text-brand-900">文字大小</p>
              <p className="text-[length:calc(20px*var(--fs))] font-bold tabular-nums text-brand-800">{pct}%</p>
            </div>

            <label className="mt-3 block">
              <span className="sr-only">字号百分比</span>
              <input
                type="range"
                min={MIN_SCALE}
                max={MAX_SCALE}
                step={STEP}
                value={pct}
                onChange={(e) => set(Number(e.target.value))}
                className="w-full accent-brand-700"
              />
            </label>
            <div className="flex justify-between text-[length:calc(12px*var(--fs))] tabular-nums text-ink-mute">
              <span>{MIN_SCALE}%</span>
              <span>{MAX_SCALE}%</span>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.pct}
                  type="button"
                  onClick={() => set(p.pct)}
                  aria-pressed={pct === p.pct}
                  className={`min-h-9 rounded-lg border px-1 py-2 text-[length:calc(13px*var(--fs))] font-semibold transition ${
                    pct === p.pct
                      ? "border-brand-700 bg-brand-800 text-white"
                      : "border-line bg-paper text-brand-800 hover:bg-brand-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <p className="mt-3 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
              只放大文字，按钮、卡片和图表的大小不变——放大之后屏幕上能看到的内容不会变少。设置会记住，换页面也保持。
            </p>
            {pct >= 150 && (
              <p className="mt-2 text-[length:calc(12px*var(--fs))] leading-relaxed text-ink-mute">
                150% 以上在很窄的手机上，顶部导航会折成两行，长标题也会多折一行。
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
