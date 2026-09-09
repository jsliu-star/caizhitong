import type { ElementCheck, EntityCheck, Hit } from "@/lib/types";

/**
 * 五维风险画像。把散落的命中项收敛成五个可视化维度，
 * 让用户一眼看出「这份内容主要在哪一路上做手脚」。
 * 纯确定性计算，不经过模型。
 */

export interface RiskDimension {
  key: string;
  label: string;
  /** 0–1 */
  value: number;
  hint: string;
  /** 贡献这个维度的命中项 */
  from: string[];
}

const DIMS: Array<{
  key: string;
  label: string;
  patternIds: string[];
  /** 缺失要素也会贡献分值 */
  elementIds?: string[];
  /** 主体线索也会贡献分值 */
  entityClueIds?: string[];
  hintOn: string;
  hintOff: string;
}> = [
  {
    key: "yield",
    label: "收益承诺",
    patternIds: ["vp-guarantee-principal", "vp-expected-return", "vp-yield-outlier", "vp-fake-track-record"],
    hintOn: "在收益上做承诺或暗示——这是监管明令禁止的核心红线，也是绝大多数骗局的入口。",
    hintOff: "没有出现对收益的承诺或暗示。",
  },
  {
    key: "license",
    label: "资质可核验",
    patternIds: ["vp-unverifiable-license", "vp-identity-packaging"],
    elementIds: ["me-manager-code", "me-risk-level"],
    entityClueIds: ["ec-no-entity", "ec-license-unverifiable", "ec-nature-mismatch"],
    hintOn: "宣称的资质、背景或头衔无法核验。正规机构一定会公示可查的编号与主体全称。",
    hintOff: "资质相关信息未发现明显疑点（但仍需你自行到官方渠道核查）。",
  },
  {
    key: "channel",
    label: "渠道正规",
    patternIds: ["vp-private-traffic", "vp-discretionary-trading", "vp-fund-pool"],
    elementIds: ["me-risk-warning", "me-fee-term"],
    entityClueIds: ["ec-personal-channel"],
    hintOn: "引导你脱离持牌渠道成交（个人微信、私人群、非官方 App）——这是为了脱离监管留痕。",
    hintOff: "未发现明显的脱离正规渠道的引导。",
  },
  {
    key: "urgency",
    label: "紧迫压迫",
    patternIds: ["vp-urgency"],
    hintOn: "制造时间压力，目的是阻止你思考和求证。正规金融销售有冷静期，不会催你马上转账。",
    hintOff: "没有明显的催促和稀缺性话术。",
  },
  {
    key: "emotion",
    label: "情感操控",
    patternIds: ["vp-emotional-manipulation", "vp-stock-recommendation", "vp-pyramid-compensation"],
    hintOn: "利用信任、保密要求或熟人关系降低你的防御，并切断你向家人求证的机会。",
    hintOff: "未发现明显的情感操控手法。",
  },
];

export function buildRiskRadar(hits: Hit[], elements: ElementCheck[], entity: EntityCheck): RiskDimension[] {
  return DIMS.map((d) => {
    const matched = hits.filter((h) => d.patternIds.includes(h.patternId));
    const hardCount = matched.filter((h) => h.severity === "hard").length;
    const highCount = matched.length - hardCount;
    const missing = (d.elementIds ?? []).filter((id) => elements.some((e) => e.id === id && !e.present)).length;
    const clues = (d.entityClueIds ?? []).filter((id) => entity.clues.some((c) => c.id === id)).length;

    // 硬性违规权重最高，其次高风险诱导，缺失要素与主体疑点作补充
    const raw = hardCount * 0.5 + highCount * 0.25 + missing * 0.18 + clues * 0.22;
    const value = Math.min(1, raw);
    const types = [...new Set(matched.map((h) => h.type))];

    return {
      key: d.key,
      label: d.label,
      value,
      hint: value > 0.15 ? d.hintOn : d.hintOff,
      from: types,
    };
  });
}
