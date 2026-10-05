import type { Profile } from "@/lib/profile";
import type { ShieldReport } from "@/lib/types";
import { normalize } from "@/lib/rules/match";
import { stageOf } from "@/lib/stage";
import casesData from "@/data/scam-cases.json";

const CASES = casesData.cases as Array<{ id: string; name: string; patternIds: string[] }>;

/**
 * 按共享档案给体检报告加定向提示。
 *
 * 这是三个 Tab 联动的安全盾一侧：规划师测出的画像、翻译官记录的知识水平、
 * 用户在本页遇到过的骗局类型，共同决定这次报告额外强调什么。
 *
 * 原则：只在档案里**真实存在**对应字段时才产出提示。
 * 档案是空的就一条都不出——宁可不说，不能虚报联动。
 */

export interface PersonalNote {
  id: string;
  /** 触发它的档案字段，展示给用户看，让联动可验证 */
  basis: string;
  text: string;
  tone: "warn" | "info";
}

const AGGRESSIVE = new Set(["growth", "aggressive"]);
const CONSERVATIVE = new Set(["conservative", "steady"]);

export function personalizeReport(report: ShieldReport, profile: Profile): PersonalNote[] {
  const notes: PersonalNote[] = [];
  const text = normalize(report.text);
  const hitIds = new Set(report.hits.map((h) => h.patternId));
  const hitTypes = new Map(report.hits.map((h) => [h.patternId, h.type]));

  // ① 风险偏好 → 强调对应的话术路径
  if (profile.riskType && AGGRESSIVE.has(profile.riskType)) {
    const yieldHits = [...hitIds].filter((id) =>
      ["vp-expected-return", "vp-guarantee-principal", "vp-yield-outlier"].includes(id),
    );
    if (yieldHits.length > 0) {
      notes.push({
        id: "pn-aggressive-yield",
        basis: "规划师测出你的风险偏好偏进取",
        text: `这份内容里的${yieldHits.map((id) => `「${hitTypes.get(id)}」`).join("、")}，正是最容易打动你这类人的地方——愿意承担风险的人，更容易相信「高收益是风险换来的，我承担得起」。但骗子承诺的从来不是高风险高收益，而是「高收益但没风险」，这两者在金融上不可能同时成立。`,
        tone: "warn",
      });
    }
  }
  if (profile.riskType && CONSERVATIVE.has(profile.riskType)) {
    if (hitIds.has("vp-deposit-confusion") || hitIds.has("vp-guarantee-principal")) {
      notes.push({
        id: "pn-conservative-deposit",
        basis: "规划师测出你偏保守",
        text: "针对偏保守的人，骗子的切入点不是「高收益」，而是「和存款一样安全，收益高一点」。这份内容里就出现了这类表述——它是监管重点整治的误导销售，不是善意的简化说法。",
        tone: "warn",
      });
    }
  }

  // ② 遇到过的骗局类型 → 指出这是第几次
  const repeat = [...hitIds].filter((id) => profile.encountered.includes(id));
  if (repeat.length > 0) {
    notes.push({
      id: "pn-repeat",
      basis: "你在安全盾里遇到过同类内容",
      text: `${repeat.map((id) => `「${hitTypes.get(id)}」`).join("、")}你之前也碰到过。同一类话术反复出现，说明你可能已经进入了某个名单或某个群的持续推送——建议清理一遍相关的群和好友。`,
      tone: "warn",
    });
  }

  // ③ 年龄段 → 定向骗局提醒
  if (profile.ageBand === "60+" || profile.ageBand === "51-60") {
    notes.push({
      id: "pn-elder",
      basis: `档案里的年龄段是 ${profile.ageBand}`,
      text: "针对中老年人的骗局很少通过广告投放，多是通过邻居、老同事、社区活动、免费体检和赠送礼品先建立信任。所以判断的关键往往不是内容本身，而是「是谁让你看到它的」。",
      tone: "info",
    });
  }
  if (profile.ageBand === "18-25") {
    if (/(兼职|刷单|日结|零门槛|轻松|学生|校园|代理)/.test(text)) {
      notes.push({
        id: "pn-student",
        basis: "档案里的年龄段是 18-25",
        text: "这份内容出现了「兼职」「日结」「零门槛」这类字样。针对学生的套路通常要求你先垫资或先借款，一旦开始就很难只损失一次。",
        tone: "warn",
      });
    }
  }

  // ③b 人生阶段 → 命中的话术正好是这个阶段要特别防的骗局
  const stage = stageOf(profile);
  if (stage && report.verdict.level !== "green") {
    const guarded = stage.guard
      .map((g) => ({ g, c: CASES.find((c) => c.id === g.caseId) }))
      .find(({ c }) => c && c.patternIds.some((id) => hitIds.has(id)));
    if (guarded?.c) {
      const shared = guarded.c.patternIds.filter((id) => hitIds.has(id)).map((id) => `「${hitTypes.get(id)}」`);
      notes.push({
        id: "pn-stage",
        basis: `你在档案里选的人生阶段是「${stage.label}」`,
        text: `这份内容里的${shared.join("、")}，正是「${guarded.c.name}」的典型特征——这是「${stage.label}」阶段要特别防的一类。${guarded.g.why}${
          guarded.g.basis.type === "official" && guarded.g.basis.source ? `（参考：${guarded.g.basis.source}）` : ""
        }`,
        tone: "warn",
      });
    }
  }

  // ④ 应急金 → 对「灵活存取 + 高收益」额外提示
  if (
    profile.emergencyMonths !== undefined &&
    /(随时可取|随存随取|灵活存取|T\+0|秒到|活期|随时提现)/.test(text) &&
    (hitIds.has("vp-expected-return") || hitIds.has("vp-fund-pool") || hitIds.has("vp-yield-outlier"))
  ) {
    notes.push({
      id: "pn-liquidity",
      basis: `你算过应急金（建议预留 ${profile.emergencyMonths} 个月）`,
      text: "这份内容同时宣称「随时可取」和「高收益」。收益性、流动性、安全性三者不可能同时最优——同时承诺这三样的，一定有一样是假的。你的应急金应该放在只求随时可取、不求收益的地方。",
      tone: "warn",
    });
  }

  // ⑤ 高息负债 → 提醒优先级
  if (profile.debtApr !== undefined && profile.debtApr > 0.1 && report.verdict.level !== "green") {
    notes.push({
      id: "pn-debt",
      basis: `你算出自己的分期真实年化是 ${(profile.debtApr * 100).toFixed(1)}%`,
      text: `你还背着年化 ${(profile.debtApr * 100).toFixed(1)}% 的负债。在还清之前，任何「投资机会」的性价比都不如还债——还债省下的利息是百分之百确定的。`,
      tone: "info",
    });
  }

  // ⑥ 知识薄弱项 → 就地补讲
  const weak = profile.knowledge.weakTerms.filter((t) => text.includes(t));
  if (weak.length > 0) {
    notes.push({
      id: "pn-weak-terms",
      basis: `翻译官记录了你答错过：${profile.knowledge.weakTerms.join("、")}`,
      text: `这份内容里出现了${weak.map((t) => `「${t}」`).join("、")}——你在翻译官里答错过这个概念，建议回去看一眼解释再做判断。`,
      tone: "info",
    });
  }

  return notes;
}
