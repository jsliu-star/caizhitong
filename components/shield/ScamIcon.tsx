/** 骗局图鉴图标。全部内联 SVG 自绘，不引用任何外链资源。 */
export function ScamIcon({ name, className = "" }: { name: string; className?: string }) {
  const common = {
    width: 40,
    height: 40,
    viewBox: "0 0 40 40",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  switch (name) {
    case "vault": // 保本高息：保险柜 + 上扬箭头
      return (
        <svg {...common}>
          <rect x="6" y="9" width="22" height="22" rx="3" />
          <circle cx="17" cy="20" r="5" />
          <path d="M17 17v3l2 1" />
          <path d="M28 15l6-4m0 0v4m0-4h-4" />
        </svg>
      );
    case "chat": // 荐股群：气泡 + 上涨曲线
      return (
        <svg {...common}>
          <path d="M6 12a3 3 0 013-3h18a3 3 0 013 3v11a3 3 0 01-3 3H16l-6 5v-5H9a3 3 0 01-3-3z" />
          <path d="M12 20l4-4 3 3 5-6" />
        </svg>
      );
    case "coin": // 虚拟币：币 + 电路
      return (
        <svg {...common}>
          <circle cx="20" cy="20" r="10" />
          <path d="M20 14v12M16 17h6a2.5 2.5 0 010 5h-6m0 0h6" />
          <path d="M30 10h4M30 30h4M6 10h4M6 30h4" />
        </svg>
      );
    case "handoff": // 代客理财：钱袋交到另一只手
      return (
        <svg {...common}>
          <path d="M12 15c0-2 2-4 4-4s4 2 4 4" />
          <path d="M10 15h12l2 9a4 4 0 01-4 5h-8a4 4 0 01-4-5z" />
          <path d="M27 20h7m0 0l-3-3m3 3l-3 3" />
        </svg>
      );
    case "chart": // 原始股：上市曲线 + 问号
      return (
        <svg {...common}>
          <path d="M6 30V10M6 30h26" />
          <path d="M10 25l6-7 5 4 7-11" />
          <circle cx="30" cy="9" r="1" />
          <path d="M28 6a2 2 0 114 0c0 1.5-2 1.5-2 3" />
        </svg>
      );
    case "network": // 拉人头：层级结构
      return (
        <svg {...common}>
          <circle cx="20" cy="8" r="3" />
          <circle cx="10" cy="22" r="3" />
          <circle cx="30" cy="22" r="3" />
          <circle cx="6" cy="33" r="2.4" />
          <circle cx="15" cy="33" r="2.4" />
          <path d="M20 11l-8 8M20 11l8 8M10 25l-3 5M10 25l4 5" />
        </svg>
      );
    case "heart": // 杀猪盘：心 + 裂纹
      return (
        <svg {...common}>
          <path d="M20 32s-11-6.6-11-14a6 6 0 0111-3.3A6 6 0 0131 18c0 7.4-11 14-11 14z" />
          <path d="M20 15l-2.5 5h5L20 26" />
        </svg>
      );
    case "badge": // 冒充：证件 + 感叹号
      return (
        <svg {...common}>
          <rect x="7" y="8" width="26" height="20" rx="3" />
          <circle cx="15" cy="16" r="3" />
          <path d="M10 24c1.4-2.2 3-3.2 5-3.2s3.6 1 5 3.2" />
          <path d="M25 13h4M25 17h4M27 21v3M27 26v.6" />
        </svg>
      );
    case "card": // 出借账户：银行卡 + 递出的手
      return (
        <svg {...common}>
          <rect x="5" y="11" width="22" height="15" rx="2.5" />
          <path d="M5 16h22" />
          <path d="M9 21h5" />
          <path d="M31 14v10m0 0l-3-3m3 3l3-3" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="20" cy="20" r="12" />
          <path d="M20 14v8M20 26v.6" />
        </svg>
      );
  }
}
