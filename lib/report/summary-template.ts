import type { ElementCheck, EntityCheck, Hit, RiskLevel, Verdict } from "@/lib/types";

/**
 * 确定性总结生成器。
 * 双重身份：① 演示模式下 mock provider 的输出；② 模型不可用或输出被审查层拦截时的兜底。
 * 因为它由真实分析结果驱动，所以演示模式下的报告仍然是「真的」。
 */

const HEADLINE: Record<RiskLevel, (hard: number, high: number) => string> = {
  red: (hard, high) =>
    `命中 ${hard} 类监管明令禁止的表述特征${high > 0 ? `，另有 ${high} 类高风险诱导特征` : ""}`,
  yellow: (_hard, high) => `未发现明令禁止的表述，但存在 ${high} 类常见于不当营销的特征`,
  green: () => "本次未识别到明显的违规表述特征",
};

const OPENING: Record<RiskLevel, string> = {
  red: "这份内容里有几句话，是法律不允许说的。",
  yellow: "这份内容没有触碰明确的红线，但有几处值得你停下来想一想。",
  green: "这份内容里没有出现我们规则库中的违规表述特征。",
};

export function buildVerdict(args: {
  level: RiskLevel;
  hits: Hit[];
  elements: ElementCheck[];
  entity: EntityCheck;
  hardTypes: number;
  highTypes: number;
  escalated: boolean;
  /** 被分析的原文，用于识别用户处境（是否已转账、是否提现受阻） */
  text?: string;
}): Verdict {
  const { level, hits, elements, entity, hardTypes, highTypes, escalated } = args;

  const hardTypeNames = [...new Set(hits.filter((h) => h.severity === "hard").map((h) => h.type))];
  const highTypeNames = [...new Set(hits.filter((h) => h.severity === "high").map((h) => h.type))];
  const missing = elements.filter((e) => !e.present);
  const present = elements.filter((e) => e.present);

  const parts: string[] = [OPENING[level]];

  if (hardTypeNames.length > 0) {
    parts.push(
      `其中${hardTypeNames.map((t) => `「${t}」`).join("、")}属于监管明令禁止的表述——不是"可能有问题"，而是正规机构在任何宣传材料里都不会这样写。`,
    );
  }
  if (highTypeNames.length > 0) {
    parts.push(
      `另外还出现了${highTypeNames.map((t) => `「${t}」`).join("、")}，这些单看不一定违法，但它们同时出现，是不当营销的典型组合。`,
    );
  }
  if (escalated) {
    parts.push("虽然只命中一类特征，但这段内容在谈钱，却完全没有任何风险提示——正规的金融宣传做不到这一点。");
  }
  if (missing.length > 0) {
    parts.push(
      `更值得注意的是它缺了什么：${missing.map((m) => m.label).join("、")}全都没有。${
        missing.some((m) => m.id === "me-risk-warning")
          ? "一份正规的理财宣传材料，不可能不写风险提示。"
          : "这些要素是监管要求必须披露的。"
      }`,
    );
  } else if (present.length === elements.length && level === "green") {
    parts.push("风险提示、风险等级、管理人信息、费率期限四项要素齐备，这是正规产品材料的样子。");
  }

  const hardClues = entity.clues.filter((c) => c.severity === "hard");
  if (hardClues.length > 0) {
    parts.push(`在主体方面：${hardClues.map((c) => c.label).join("；")}。`);
  }

  if (level === "green") {
    parts.push("但请注意：未命中违规特征不等于这个产品或机构是安全的。我们只能检查它说了什么，检查不了它实际做什么。");
  }

  return {
    level,
    headline: HEADLINE[level](hardTypes, highTypes),
    summary: parts.join(""),
    actions: buildActions(level, hits, entity, args.text ?? ""),
  };
}

/**
 * 处境信号。用户在追问里补充的信息会改变「现在最该做什么」——
 * 已经转了钱的人不需要被告知「不要转账」，他需要的是止损和报警。
 */
function readSituation(text: string) {
  return {
    alreadyPaid: /(已经|已)?(转了钱|打了钱|转过钱|已经转|已经打款|已经投|投进去了|把钱转)/.test(text),
    withdrawBlocked: /(提现失败|提不出来|无法提现|取不出|冻结|解冻金|解冻费|再交.{0,6}(费用|钱|税))/.test(text),
    borrowedToInvest: /(借钱|贷款|网贷|信用卡).{0,8}(投|买|理财)/.test(text),
    secrecy: /(别跟家里说|不要告诉|先别说|只告诉你)/.test(text),
  };
}

function buildActions(level: RiskLevel, hits: Hit[], entity: EntityCheck, text: string): string[] {
  const actions: string[] = [];
  const sit = readSituation(text);

  // 最紧急的处境优先——顺序本身就是建议的一部分
  if (sit.withdrawBlocked) {
    actions.push(
      "【最紧急】不要再交任何「解冻金」「保证金」「税费」「手续费」——这是提现骗局的最后一步，交了同样提不出来，只会再损失一笔",
    );
    actions.push("立即拨打 110 报警，并保存全部聊天记录、转账凭证、平台页面截图（截图要包含时间和账号）");
    actions.push("同时联系你的银行说明情况，询问是否还能冻结或止付");
  } else if (sit.alreadyPaid) {
    actions.push("【最紧急】立即停止追加任何资金，先固定证据：聊天记录、转账凭证、宣传材料、对方账号");
    actions.push("尽快拨打 110 报警——涉网络诈骗的资金追回高度依赖时间，越早越好");
  } else if (level === "red") {
    actions.push("现在不要转账，也不要提供身份证、银行卡号或任何验证码");
  } else if (level === "yellow") {
    actions.push("先不要急着决定，给自己 24 小时");
  }

  if (level !== "green") {
    actions.push(
      sit.secrecy
        ? "把这份报告拿给家人看——对方要求你保密，恰恰说明家人是能拦住这件事的人"
        : "把这份报告转给家人看一遍——骗局最怕第二个人过目",
    );
  }

  if (sit.borrowedToInvest) {
    actions.push("你提到用借来的钱投资：借款的利息和还款日是确定的，投资收益不是。请先停下来处理债务");
  }

  if (entity.links.length > 0) {
    const primary = entity.names[0];
    actions.push(
      primary
        ? `拿「${primary}」这个全称去下方官方入口逐个核查：企业是否真实存在、经营范围是否含金融业务、有无相应金融许可`
        : "先索要对方的公司全称（不是品牌名），再用下方官方入口核查资质",
    );
  }

  if (hits.some((h) => h.patternId === "vp-stock-recommendation")) {
    actions.push("向不特定对象推荐个股需要证券投资咨询牌照，可在证监会官网核查对方是否持牌");
  }
  if (hits.some((h) => h.patternId === "vp-discretionary-trading")) {
    actions.push("任何情况下不要把账户、密码、验证码交给他人——交出去就同时失去了资金控制权和法律保护");
  }
  if (hits.some((h) => h.patternId === "vp-pyramid-compensation" || h.patternId === "vp-fund-pool")) {
    actions.push("不要参与，也不要介绍给亲友——按人数计酬的模式在崩盘时，介绍人往往也要承担责任");
  }
  if (level !== "green") {
    if (!sit.alreadyPaid && !sit.withdrawBlocked) {
      actions.push("若已经转账：立即拨打 110 报警，并保留聊天记录、转账凭证、宣传材料截图");
    }
    actions.push("涉网络诈骗可拨打全国反诈专线 12381 咨询预警");
  } else {
    actions.push("即使本次未发现问题，购买前仍应索要产品说明书，确认风险等级与你的风险测评结果匹配");
  }

  return actions;
}

/** 供模型使用的提示词——只让它做「转述」，不让它做「判定」 */
export function buildSummaryPrompt(args: {
  text: string;
  level: RiskLevel;
  hits: Hit[];
  elements: ElementCheck[];
  entity: EntityCheck;
}): string {
  const { text, level, hits, elements, entity } = args;
  const levelLabel = { red: "高风险", yellow: "需警惕", green: "暂未发现明显问题" }[level];

  const hitLines = hits
    .map((h) => `- [${h.severity === "hard" ? "明令禁止" : "高风险诱导"}] ${h.type}：命中「${h.matched}」，原句「${h.clause}」`)
    .join("\n");
  const missingLines = elements.filter((e) => !e.present).map((e) => `- 缺失：${e.label}（${e.why}）`).join("\n");
  const clueLines = entity.clues.map((c) => `- ${c.label}：${c.detail}`).join("\n");

  return `你是一个金融安全科普助手，正在帮一位完全没有金融知识的普通人（可能是老年人或刚工作的年轻人）理解一份可疑的理财宣传内容。

【已由规则引擎完成的客观判定，你必须完全采信，不得推翻或补充新的判定】
风险等级：${levelLabel}
命中的违规表述特征：
${hitLines || "（无）"}
正规产品应有但缺失的要素：
${missingLines || "（无）"}
主体核查线索：
${clueLines || "（无）"}

【被分析的原文】
${text.slice(0, 1500)}

【你的任务】
用 3 到 5 句大白话，向这位普通人解释"这份内容为什么值得警惕"或"为什么暂时没发现问题"。要求：
1. 只解释和转述上面已给出的判定，不要自己新增任何判断
2. 不要说"这是诈骗""这家公司是骗子"这类法律定性，只说"命中了监管禁止的表述"
3. 不要说任何产品"安全""可以买""值得买"
4. 不要推荐任何具体股票、基金或理财产品
5. 语气像一个耐心的晚辈在跟长辈解释，不要用专业术语，不要说教
6. **绝对不要引入原文和上述判定之外的任何数字、利率、统计数据、机构名称或案例**。
   你不知道当前的存款利率、国债收益率或市场平均水平，不要猜、不要举例说"银行才百分之几"。
   需要作对比时，只用定性说法，例如"远高于银行存款的常见水平"。
7. 直接输出正文，不要标题、不要列表、不要 markdown 符号`;
}
