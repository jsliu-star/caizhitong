/**
 * 等级徽章。内联 SVG 自绘——全站禁止外链图片资源。
 * 颜色随等级加深，同时用底部圆点数量作二次编码（不只靠颜色区分）。
 */
import { TIERS } from "./state";

const FILL = ["var(--brand-200)", "var(--brand-300)", "var(--brand-500)", "var(--brand-700)", "var(--brand-900)"];

export function TierBadge({ index, size = 72 }: { index: number; size?: number }) {
  const i = Math.min(TIERS.length - 1, Math.max(0, index));
  const tier = TIERS[i];
  const dark = i >= 2;
  return (
    <svg
      width={size}
      height={size * (72 / 64)}
      viewBox="0 0 64 72"
      role="img"
      aria-label={`当前等级：${tier.name}（第 ${i + 1} 级，共 ${TIERS.length} 级）`}
      className="shrink-0"
    >
      <path
        d="M32 3 L59 12 V37 C59 53 47 63.5 32 69 C17 63.5 5 53 5 37 V12 Z"
        fill={FILL[i]}
        stroke="var(--brand-800)"
        strokeWidth={2}
      />
      {/* 盾面上的「盾」字笔画简化：一道横+一道竖，避免依赖字体 */}
      <path
        d="M20 30 H44 M32 22 V44"
        stroke={dark ? "var(--brand-100)" : "var(--brand-900)"}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.55}
      />
      {Array.from({ length: TIERS.length }).map((_, k) => (
        <circle
          key={k}
          cx={32 + (k - 2) * 8.5}
          cy={54}
          r={2.6}
          fill={k <= i ? (dark ? "var(--brand-100)" : "var(--brand-900)") : "transparent"}
          stroke={dark ? "var(--brand-100)" : "var(--brand-900)"}
          strokeWidth={1.2}
          opacity={k <= i ? 0.95 : 0.35}
        />
      ))}
    </svg>
  );
}
