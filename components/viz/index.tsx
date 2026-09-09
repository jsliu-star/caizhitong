"use client";

import { useId, useState } from "react";

/**
 * 图表基元。全部为内联 SVG，无外部依赖、无外链资源。
 * 遵循规范：细笔画、2px 线宽、≥8px 标记点、填充之间留 2px 表面间隙、
 * 网格与坐标轴收敛、始终配直接标签（分类色的 tritan 分离度偏低，需二次编码）。
 */

export const CAT = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)"] as const;

// ────────────────────────────────────────────────────────────
// 环形图：资产大类配置
// ────────────────────────────────────────────────────────────
export interface Slice {
  label: string;
  value: number;
  note?: string;
}

export function Donut({
  slices,
  centerLabel,
  centerValue,
  size = 220,
}: {
  slices: Slice[];
  centerLabel?: string;
  centerValue?: string;
  size?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2;
  const stroke = size * 0.17;
  const radius = r - stroke / 2 - 2;
  const circ = 2 * Math.PI * radius;
  const GAP = 2; // 表面间隙，px

  let offset = 0;
  const arcs = slices.map((s, i) => {
    const frac = s.value / total;
    const len = Math.max(0, circ * frac - GAP);
    const arc = { ...s, i, frac, len, offset, color: CAT[i % CAT.length] };
    offset += circ * frac;
    return arc;
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="资产大类配置比例">
          <g transform={`rotate(-90 ${r} ${r})`}>
            {arcs.map((a) => (
              <circle
                key={a.label}
                cx={r}
                cy={r}
                r={radius}
                fill="none"
                stroke={a.color}
                strokeWidth={active === a.i ? stroke + 4 : stroke}
                strokeDasharray={`${a.len} ${circ - a.len}`}
                strokeDashoffset={-a.offset}
                strokeLinecap="butt"
                onMouseEnter={() => setActive(a.i)}
                onMouseLeave={() => setActive(null)}
                style={{ transition: "stroke-width .15s" }}
              />
            ))}
          </g>
          {(centerValue || centerLabel) && (
            <>
              <text
                x={r}
                y={r - 2}
                textAnchor="middle"
                className="fill-brand-900"
                style={{ fontSize: size * 0.15, fontWeight: 700 }}
              >
                {centerValue}
              </text>
              <text
                x={r}
                y={r + size * 0.11}
                textAnchor="middle"
                className="fill-ink-mute"
                style={{ fontSize: size * 0.062 }}
              >
                {centerLabel}
              </text>
            </>
          )}
        </svg>
      </div>

      {/* 图例 + 直接标签（二次编码，必须保留） */}
      <ul className="w-full space-y-1.5">
        {arcs.map((a) => (
          <li
            key={a.label}
            onMouseEnter={() => setActive(a.i)}
            onMouseLeave={() => setActive(null)}
            className={`flex items-baseline gap-2 rounded-md px-2 py-1 transition ${
              active === a.i ? "bg-brand-50" : ""
            }`}
          >
            <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: a.color }} />
            <span className="flex-1 text-[length:calc(14px*var(--fs))] text-ink">{a.label}</span>
            <span className="text-[length:calc(15px*var(--fs))] font-semibold tabular-nums text-brand-900">
              {Math.round(a.frac * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 雷达图：多维风险画像（单序列，不需要图例）
// ────────────────────────────────────────────────────────────
export interface RadarAxis {
  label: string;
  /** 0–1 */
  value: number;
  hint?: string;
}

export function Radar({ axes, size = 280, color = "var(--risk-red)" }: { axes: RadarAxis[]; size?: number; color?: string }) {
  const uid = useId().replace(/[:]/g, "");
  const [active, setActive] = useState<number | null>(null);
  const c = size / 2;
  /**
   * 轴标签放在 viewBox 之外的预留边距里。
   *
   * 演进过程（两次都被实测推翻，记录下来免得再走回头路）：
   * ① 原实现 R = c-34、标签画在 R+20（紧贴边缘）+ textAnchor start/end 向外排字，
   *    而 SVG 默认 overflow: hidden —— 判据是 |cos(角度)| > 0.3 且标签够长，
   *    所以四轴切 34px、五轴切 40px，且与视口宽度无关，桌面端一样切。
   * ② 改成全部居中锚定并把标签收进盒子内 —— 不再被切，但当某一维接近满分时，
   *    标签内缘会压到该轴的顶点圆圈上。
   * ③ 现在：横向各留 MARGIN 的画布余量，标签半径与顶点保持 ≥8px 间距，
   *    居中锚定。三个调用点（/plan 四轴、安全盾报告五轴、/profile）一次解决。
   */
  const MARGIN_X = 40;
  const MARGIN_Y = 22; // 纵向也要留：只放宽横向时，顶/底标签会被切掉一截字
  const R = c - MARGIN_X;
  const LABEL_R = R + 38;
  const W = size + MARGIN_X * 2;
  const H = size + MARGIN_Y * 2;
  const n = axes.length;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v] as const;
  };
  const poly = axes.map((ax, i) => pt(i, Math.max(0.04, ax.value)).join(",")).join(" ");

  return (
    <div className="relative">
      <svg
        width={W}
        height={H}
        viewBox={`${-MARGIN_X} ${-MARGIN_Y} ${W} ${H}`}
        className="max-w-full"
        role="img"
        aria-label="风险画像雷达图"
      >
        <defs>
          <radialGradient id={`rg-${uid}`}>
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.12" />
          </radialGradient>
        </defs>

        {/* 收敛的网格 */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon
            key={f}
            points={axes.map((_, i) => pt(i, f).join(",")).join(" ")}
            fill="none"
            stroke="var(--grid)"
            strokeWidth={1}
          />
        ))}
        {axes.map((_, i) => {
          const [x, y] = pt(i, 1);
          return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--grid)" strokeWidth={1} />;
        })}

        <polygon points={poly} fill={`url(#rg-${uid})`} stroke={color} strokeWidth={2} />

        {axes.map((ax, i) => {
          const [x, y] = pt(i, Math.max(0.04, ax.value));
          return (
            <circle
              key={ax.label}
              cx={x}
              cy={y}
              r={active === i ? 6 : 4.5}
              fill="var(--paper)"
              stroke={color}
              strokeWidth={2}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            />
          );
        })}

        {/* 轴标签：一律居中锚定。start/end 会把文字推出画布，居中则始终落在预留边距内 */}
        {axes.map((ax, i) => {
          const a = (Math.PI * 2 * i) / n - Math.PI / 2;
          const lx = c + Math.cos(a) * LABEL_R;
          const ly = c + Math.sin(a) * LABEL_R;
          return (
            <text
              key={ax.label}
              x={lx}
              y={ly + 4}
              textAnchor="middle"
              className={active === i ? "fill-brand-900" : "fill-ink-soft"}
              style={{ fontSize: 12, fontWeight: active === i ? 700 : 500 }}
            >
              {ax.label}
            </text>
          );
        })}
      </svg>
      {active !== null && axes[active].hint && (
        <p className="mt-1 rounded-lg bg-paper-soft px-3 py-2 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">
          <b>{axes[active].label}</b>：{axes[active].hint}
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 仪表：单一头条数值
// ────────────────────────────────────────────────────────────
export function Gauge({
  value,
  label,
  display,
  color = "var(--brand-600)",
  size = 180,
}: {
  /** 0–1 */
  value: number;
  label: string;
  display: string;
  color?: string;
  size?: number;
}) {
  const r = size / 2;
  const radius = r - 14;
  const circ = Math.PI * radius; // 半圆
  const v = Math.min(1, Math.max(0, value));
  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`} role="img" aria-label={label}>
        <path
          d={`M 14 ${r} A ${radius} ${radius} 0 0 1 ${size - 14} ${r}`}
          fill="none"
          stroke="var(--grid)"
          strokeWidth={12}
          strokeLinecap="round"
        />
        <path
          d={`M 14 ${r} A ${radius} ${radius} 0 0 1 ${size - 14} ${r}`}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={`${circ * v} ${circ}`}
        />
        <text
          x={r}
          y={r - 6}
          textAnchor="middle"
          className="fill-brand-900"
          style={{ fontSize: size * 0.18, fontWeight: 700 }}
        >
          {display}
        </text>
      </svg>
      <p className="mt-1 text-center text-[length:calc(13px*var(--fs))] text-ink-mute">{label}</p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 折线：目标达成路径（两条序列 → 必须有图例 + 直接标签）
// ────────────────────────────────────────────────────────────
export interface Series {
  label: string;
  points: number[];
  color: string;
  dashed?: boolean;
}

export function PathChart({
  series,
  xLabels,
  yFormat,
  height = 220,
}: {
  series: Series[];
  xLabels: string[];
  yFormat: (n: number) => string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  /**
   * 右侧只留少量余量。原实现把序列标签画在 x(n-1) + 6，
   * 中文标签（如「3% 假设下的路径」）远超 PAD.r 的 58 单位，被 SVG 盒子切掉；
   * 外层 overflow-x-auto 也帮不上，因为 SVG 是 w-full 缩放的。
   * 现在标签改画在图内、终点上方、右对齐。
   */
  const PAD = { l: 52, r: 20, t: 26, b: 28 };
  const all = series.flatMap((s) => s.points);
  const max = Math.max(...all) * 1.08;
  const min = 0;
  const n = xLabels.length;
  const x = (i: number) => PAD.l + ((W - PAD.l - PAD.r) * i) / Math.max(1, n - 1);
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - min) / (max - min || 1));
  const ticks = [0, 0.5, 1].map((f) => min + (max - min) * f);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" role="img" aria-label="目标达成路径">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="fill-ink-mute" style={{ fontSize: 11 }}>
              {yFormat(t)}
            </text>
          </g>
        ))}

        {series.map((s) => (
          <polyline
            key={s.label}
            points={s.points.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            strokeLinejoin="round"
          />
        ))}

        {/* 终点直接标签：画在图内、终点上方、右对齐，避免向右溢出 */}
        {series.map((s, si) => (
          <text
            key={`${s.label}-end`}
            x={x(n - 1)}
            y={y(s.points[n - 1]) - 8 - si * 14}
            textAnchor="end"
            className="fill-ink-soft"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            {s.label}
          </text>
        ))}

        {xLabels.map((l, i) => (
          <text key={l} x={x(i)} y={H - 8} textAnchor="middle" className="fill-ink-mute" style={{ fontSize: 11 }}>
            {l}
          </text>
        ))}

        {/* 悬停十字准线 */}
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--brand-300)" strokeWidth={1} />
            {series.map((s) => (
              <circle
                key={`${s.label}-h`}
                cx={x(hover)}
                cy={y(s.points[hover])}
                r={5}
                fill={s.color}
                stroke="var(--paper)"
                strokeWidth={2}
              />
            ))}
          </>
        )}
        {xLabels.map((_, i) => (
          <rect
            key={i}
            x={x(i) - 14}
            y={PAD.t}
            width={28}
            height={H - PAD.t - PAD.b}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-4 px-1">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-2 text-[length:calc(13px*var(--fs))] text-ink-soft">
            <span aria-hidden className="h-0.5 w-5 rounded" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        {hover !== null && (
          <span className="text-[length:calc(13px*var(--fs))] font-medium text-brand-800">
            {xLabels[hover]}：
            {series.map((s) => `${s.label} ${yFormat(s.points[hover])}`).join("　")}
          </span>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 数据块：不需要图的头条数字
// ────────────────────────────────────────────────────────────
export function StatTile({
  label,
  value,
  unit,
  note,
  tone = "brand",
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  tone?: "brand" | "danger" | "warn";
}) {
  const cls =
    tone === "danger"
      ? "border-risk-red-line bg-risk-red-bg text-risk-red"
      : tone === "warn"
        ? "border-risk-amber-line bg-risk-amber-bg text-risk-amber"
        : "border-line bg-paper text-brand-900";
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <p className="text-[length:calc(13px*var(--fs))] font-medium opacity-80">{label}</p>
      <p className="mt-1 text-[length:calc(26px*var(--fs))] font-bold leading-none tabular-nums">
        {value}
        {unit && <span className="ml-1 text-[length:calc(15px*var(--fs))] font-semibold">{unit}</span>}
      </p>
      {note && <p className="mt-1.5 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">{note}</p>}
    </div>
  );
}


// ────────────────────────────────────────────────────────────
// 迷你走势图：只表达形状与方向，不标坐标
// ────────────────────────────────────────────────────────────
export function Sparkline({
  points,
  w = 132,
  h = 36,
  color,
}: {
  points: number[];
  w?: number;
  h?: number;
  color?: string;
}) {
  if (points.length < 2) return <span className="text-[length:calc(12px*var(--fs))] text-ink-mute">暂无走势</span>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const up = points[points.length - 1] >= points[0];
  const stroke = color ?? (up ? "var(--risk-red)" : "var(--brand-600)");
  const x = (i: number) => (w * i) / (points.length - 1);
  const y = (v: number) => h - 3 - ((v - min) / span) * (h - 6);
  const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={stroke} opacity="0.08" />
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r={2.6} fill={stroke} />
    </svg>
  );
}
