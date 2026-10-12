/** 客户端可用的纯格式化函数，不依赖服务端模块。 */
export const fmtBig = (n: number | null): string => {
  if (n === null) return "—";
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)} 万亿`;
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(1)} 亿`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(1)} 万`;
  return n.toFixed(0);
};

export const fmtPct = (n: number | null, d = 2): string => (n === null ? "—" : `${n.toFixed(d)}%`);
export const fmtNum = (n: number | null, d = 2): string => (n === null ? "—" : n.toFixed(d));
