/**
 * 联动说明：根据档案里【真实存在】的字段，生成「因为档案里有 X，所以另外两个 Tab 为你做了 Y」。
 * 原则：只列真实触发的条目，不触发的一律不出现，不假装档案里有东西。
 */

import patternsData from "@/data/violation-patterns.json";
import quizData from "@/data/quiz.json";
import { RISK_META, type Profile } from "@/lib/profile";

export type Tab = "安全盾" | "翻译官" | "规划师" | "全站";

export interface Effect {
  tab: Tab;
  text: string;
}

export interface Linkage {
  id: string;
  /** 档案里的哪条事实触发了它 */
  fact: string;
  /** 触发它的字段，方便对照上面的档案清单 */
  field: string;
  effects: Effect[];
}

const TYPE_OF: Record<string, string> = Object.fromEntries(
  patternsData.patterns.map((p) => [p.id, p.type]),
);

/** patternId → 翻译官微课标题。标题从题库读出，翻译官改文案这里自动跟上 */
const LESSON_OF: Record<string, string> = Object.fromEntries(
  quizData.microLessons.items.map((m) => [m.patternId, m.title]),
);

/** patternId → 中文类型名；库里没有就原样返回 id，不编 */
export function patternLabel(id: string): string {
  return TYPE_OF[id] ?? id;
}

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

export function buildLinkages(p: Profile): Linkage[] {
  const out: Linkage[] = [];

  // ── 风险画像 ──────────────────────────────
  if (p.riskType === "growth" || p.riskType === "aggressive") {
    out.push({
      id: "risk-aggressive",
      field: "riskType",
      fact: `风险类型是${RISK_META[p.riskType].label}`,
      effects: [
        {
          tab: "安全盾",
          text: "重点提示「高收益」话术。愿意承担风险的人，最容易相信「高收益但没风险」——而这两者在金融上不可能同时成立。",
        },
        {
          tab: "规划师",
          text: `定向推送「最容易被高收益话术钓走」的陷阱提醒，并把权益类参考比例上限压在 ${Math.round(RISK_META[p.riskType].equityCap * 100)}% 以内。`,
        },
      ],
    });
  }

  if (p.riskType === "conservative" || p.riskType === "steady") {
    out.push({
      id: "risk-conservative",
      field: "riskType",
      fact: `风险类型是${RISK_META[p.riskType].label}`,
      effects: [
        {
          tab: "安全盾",
          text: "重点提示「跟存款差不多」「和定期一样安全」这类混淆存款与理财的说法——这是最贴着保守型偏好设计的话术。",
        },
        {
          tab: "规划师",
          text: "配置思路以存款与货币类工具为主，讲权益类时先讲它的波动来自哪里。",
        },
      ],
    });
  }

  if (p.conflicts.length > 0) {
    out.push({
      id: "conflicts",
      field: "conflicts",
      fact: `测评中发现 ${p.conflicts.length} 处互相打架的回答`,
      effects: [
        {
          tab: "规划师",
          text: "定级按「能力」与「意愿」中更保守的一侧取值——敢亏但亏不起、亏得起但不敢亏，都按更保守的那一侧算。",
        },
        {
          tab: "全站",
          text: "不会因为你自评敢冒风险就放宽提示口径。矛盾没解决之前，按更保守的口径提醒你。",
        },
      ],
    });
  }

  // ── 金融知识 ──────────────────────────────
  if (p.knowledge.weakTerms.length > 0) {
    const list = p.knowledge.weakTerms.join("、");
    out.push({
      id: "weak-terms",
      field: "knowledge.weakTerms",
      fact: `答错过的术语：${list}`,
      effects: [
        {
          tab: "翻译官",
          text: `在词典里把「${list}」排到最前面、卡片高亮标注「你答错过」，解释和注意点默认展开——不用你自己去翻。`,
        },
        {
          tab: "安全盾",
          text: "体检的内容里出现这些词时会提醒你：这个概念你在翻译官里答错过，建议先回去看一眼解释再判断。",
        },
        { tab: "规划师", text: "讲资产配置时先解释这些词，再给参考比例——先看得懂，才谈得上敢规划。" },
      ],
    });
  }

  if (p.knowledge.cleared.length > 0 || p.knowledge.points > 0) {
    out.push({
      id: "knowledge-progress",
      field: "knowledge.points / cleared",
      fact: `已通关 ${p.knowledge.cleared.length} 个关卡，积分 ${p.knowledge.points}`,
      effects: [
        {
          tab: "翻译官",
          text: `闯关列表顶部直接指向第一个没通关的关卡（「已通关 ${p.knowledge.cleared.length} 关，跳过它们，从这里继续」）；通关过的标成可跳过，想复习还能重做，重做不重复计分。`,
        },
      ],
    });
  }

  // ── 遇到过的骗局 ──────────────────────────
  if (p.encountered.length > 0) {
    const labels = p.encountered.map(patternLabel).join("、");
    const effects: Effect[] = [
      {
        tab: "安全盾",
        text: "同一类话术再出现时直接点出来，并提示你可能已经进了某个持续推送的名单或群，该清理了。",
      },
    ];
    const lessons = p.encountered.map((id) => LESSON_OF[id]).filter(Boolean);
    if (lessons.length > 0) {
      effects.push({
        tab: "翻译官",
        text: `定向推送对应的微课：${lessons.map((t) => `「${t}」`).join("、")}。每条都标出依据来自安全盾的哪次识别，并带一道对应的题。`,
      });
    }
    if (p.encountered.includes("vp-stock-recommendation")) {
      effects.push({
        tab: "规划师",
        text: "讲权益类资产时追加提示：荐股与「带单」在现行监管下都需要持牌，群里那位老师大概率没有。",
      });
    }
    out.push({
      id: "encountered",
      field: "encountered",
      fact: `在安全盾里遇到过：${labels}`,
      effects,
    });
  }

  // ── 负债 ─────────────────────────────────
  if (p.debtApr !== undefined && p.debtApr > 0.1) {
    out.push({
      id: "debt-high",
      field: "debtApr",
      fact: `已算出手上负债的真实年化是 ${pct(p.debtApr)}`,
      effects: [
        {
          tab: "全站",
          text: `全站统一提示：先还掉年化 ${pct(p.debtApr)} 的债，再谈理财。省下这笔利息是确定的，理财收益不是。`,
        },
        {
          tab: "安全盾",
          text: `体检结果不是「安全」时会追加一句：在还清这笔 ${pct(p.debtApr)} 的负债之前，任何投资机会的性价比都不如还债。`,
        },
        { tab: "规划师", text: "定向推送「有负债的人是『以贷养贷』骗局首要目标」的陷阱提醒。" },
      ],
    });
  } else if (p.debtApr !== undefined && p.debtApr > 0) {
    out.push({
      id: "debt-some",
      field: "debtApr",
      fact: `已算出手上负债的真实年化是 ${pct(p.debtApr)}`,
      effects: [
        {
          tab: "规划师",
          text: `讲配置前先把这笔 ${pct(p.debtApr)} 的成本摊在桌上比一比——收益要先跑过它，才算真的赚到。`,
        },
      ],
    });
  }

  // ── 应急金 ───────────────────────────────
  if (p.emergencyMonths !== undefined) {
    out.push({
      id: "emergency",
      field: "emergencyMonths",
      fact: `已算出你需要 ${p.emergencyMonths} 个月的应急金`,
      effects: [
        { tab: "规划师", text: "配置框架里的活钱比例按这个月数来定，而不是给一个所有人都一样的数。" },
        {
          tab: "安全盾",
          text: "遇到同时强调「随时可取」和高收益的内容会额外提示：收益性、流动性、安全性不可能同时最优，同时承诺这三样的一定有一样是假的。",
        },
      ],
    });
  }

  // ── 年龄段 ───────────────────────────────
  if (p.ageBand === "60+" || p.ageBand === "51-60") {
    const elder = p.ageBand === "60+";
    out.push({
      id: "age-elder",
      field: "ageBand",
      fact: `年龄段是 ${p.ageBand}`,
      effects: [
        ...(elder
          ? [
              {
                tab: "安全盾" as Tab,
                text: "页面顶部给出「放大字号」开关，开启后整站字号一起变大；术语进一步简化，长句拆短。",
              },
            ]
          : []),
        {
          tab: "安全盾",
          text: "骗局图鉴按年龄段重排，熟人推荐、上门推销、养老项目这几类排在前面；报告里也会提示：判断关键往往不是内容本身，而是「是谁让你看到它的」。",
        },
        { tab: "规划师", text: "定向推送「熟人推荐和上门推销比广告更危险」的陷阱提醒。" },
      ],
    });
  }

  if (p.ageBand === "18-25") {
    out.push({
      id: "age-young",
      field: "ageBand",
      fact: "年龄段是 18-25",
      effects: [
        { tab: "规划师", text: "定向推送校园里的三类坑：网贷、刷单、虚拟币。" },
        {
          tab: "安全盾",
          text: "对「兼职」「刷单」「日结」「零门槛」这类内容额外提示：这类套路通常要求先垫资或先借款，一旦开始很难只损失一次。",
        },
      ],
    });
  }

  // ── 目标 ─────────────────────────────────
  if (p.goals.length > 0) {
    out.push({
      id: "goals",
      field: "goals",
      fact: `档案里有 ${p.goals.length} 个财务目标`,
      effects: [
        {
          tab: "规划师",
          text: "把目标反推成「需要多少年化才做得到」。如果这个数字高得不合常理，会直接告诉你目标本身要改，而不是去找更高收益的产品。",
        },
      ],
    });
  }

  // 卡片内的联动效果按 Tab 归组展示，读起来顺
  const ORDER: Record<Tab, number> = { 安全盾: 0, 翻译官: 1, 规划师: 2, 全站: 3 };
  for (const l of out) {
    l.effects = l.effects
      .map((e, i) => ({ e, i }))
      .sort((a, b) => ORDER[a.e.tab] - ORDER[b.e.tab] || a.i - b.i)
      .map((x) => x.e);
  }

  return out;
}
