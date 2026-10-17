import type { ShieldReport } from "@/lib/types";

/**
 * 「发给家人」：把一次体检的结论整理成一段能直接粘贴到微信的话。
 *
 * 完全由规则结果拼出来，不调用模型；措辞守同一条合规红线：
 * 不说「这是诈骗」，只说「命中 N 类监管明令禁止的表述特征」；
 * 未命中时也不说「安全」，而是明说这不构成安全性保证。
 *
 * 只在体检模式（mode === "risk"）下使用。
 */
export function buildFamilyMessage(report: ShieldReport, opts: { link?: string } = {}): string {
  const { verdict, hits } = report;
  const types = [...new Set(hits.map((h) => h.type))];
  const typeLine = types.length ? `${types.slice(0, 4).join("、")}${types.length > 4 ? ` 等 ${types.length} 类` : ""}` : "";
  const excerpt = excerptOf(report.text);
  const isReport = report.genre?.kind === "report" && verdict.headline.includes("讲骗局");

  const lines: string[] = ["【财智通 · 风险体检】"];
  if (excerpt) lines.push(`查的是这段话：「${excerpt}」`);

  if (isReport) {
    lines.push("结论：这段文字是在讲骗局（提醒或报道），不是在推销。");
    if (typeLine) lines.push(`里面提到的骗子常用说法：${typeLine}。`);
    lines.push("以后谁这样跟你说，先停下来，跟家里人商量。");
  } else if (verdict.level === "green") {
    lines.push("结论：本次未识别到违规表述特征。这不构成对该产品的安全性保证。");
    lines.push("买之前还是要看清风险等级、费用和期限，拿不准就先问问家里人。");
  } else {
    lines.push(`结论：${verdict.headline}。`);
    if (typeLine) lines.push(`主要是：${typeLine}。`);
    lines.push("转账前先别急，也别加对方的私人微信，咱们一起核实一下再说。");
  }

  lines.push("（财智通只检查宣传说了什么，不判断产品本身。反诈咨询拨 96110，已被骗请拨 110。）");
  if (opts.link) lines.push(opts.link);
  return lines.join("\n");
}

/** 原文开头一小段，方便家人知道说的是哪条消息。原文已在服务端脱敏 */
function excerptOf(text: string, max = 36): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
