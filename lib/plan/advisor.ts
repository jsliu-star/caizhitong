/**
 * 规划师问答的规则层。
 *
 * 架构与全站一致：**判定归规则，转述归模型**。
 * 这里负责三件确定性的事，模型只负责把它们讲成人话：
 *   ① 意图闸门：问「买哪个 / 什么时候买 / 能赚多少 / 帮我操作」的，规则直接模板拒答，不让模型开口
 *   ② 档案事实：从共享档案里取出可用事实，每条都带「依据」，数字全部是算出来的
 *   ③ 可讲要点：把问题匹配到允许讲的投教主题，作为模型的唯一素材来源
 *
 * 为什么闸门要在模型之前：推荐具体标的、预测涨跌属于证券投资咨询业务，须持牌。
 * 我们没有牌照，所以这类问题不是「让模型小心地回答」，而是**根本不问模型**。
 * 拒答本身是产品的一部分——它是守规矩的证据。
 */
import { RISK_META, type Profile } from "@/lib/profile";
import { fmtPct } from "@/lib/finance";
import { assessGoal } from "@/lib/plan/allocation";

// ────────────────────────────────────────────────────────────
// ① 意图闸门
// ────────────────────────────────────────────────────────────

export type BlockCategory = "specific" | "pick" | "timing" | "promise" | "delegate";

/** 顺序即优先级：先认最具体的 */
const GATES: Array<{ category: BlockCategory; keywords: string[]; regex?: RegExp[] }> = [
  {
    category: "specific",
    keywords: [],
    // 6 位证券代码；以及「某产品怎么样」这类点评请求
    regex: [
      /(?<![\d.])\d{6}(?![\d.])/,
      /(基金|股票|理财产品|ETF|债券)[^。？?]{0,10}(怎么样|好不好|如何|值得|靠不靠谱|能不能买|可不可以买)/,
    ],
  },
  {
    category: "pick",
    keywords: [
      "买哪", "买什么", "哪只", "哪支", "哪个基金", "哪个产品", "哪家的",
      "有什么推荐", "给我推荐", "帮我选", "帮我挑", "选哪",
      "值得买", "该买", "买不买", "能买吗", "可以买吗",
    ],
    // 「推荐」不能当关键词直接拦：「群里有人推荐产品，我该怎么判断」是正当的投教问题。
    // 只拦「让我们推荐」的句式——推荐后面跟数量词或疑问词，才是在要标的。
    regex: [/推荐(几|一下|点|个|些|什么|哪|下)/],
  },
  {
    category: "timing",
    keywords: [
      "现在能买", "现在该买", "现在可以买", "什么时候买", "什么时候卖", "何时买入", "何时卖出",
      "会涨", "会跌", "涨到", "跌到", "抄底", "逃顶", "加仓", "减仓", "清仓",
      "后市", "走势", "点位", "择时", "行情怎么",
    ],
  },
  {
    category: "promise",
    keywords: [
      "能赚多少", "赚多少", "收益多少", "有多少收益", "年化多少", "多久翻倍", "几年翻",
      "保本吗", "保不保本", "稳不稳", "稳赚", "包赚",
    ],
  },
  {
    category: "delegate",
    keywords: ["帮我操作", "替我买", "帮我买", "代我", "帮我管", "帮我理财", "你帮我下单", "代客"],
  },
];

const BLOCK_REPLY: Record<BlockCategory, { title: string; body: string; instead: string }> = {
  specific: {
    title: "具体到某一个产品，我不能评价",
    body:
      "对具体的股票、基金、理财产品作评价或作「能不能买」的判断，属于证券投资咨询业务，必须持牌才能做。财智通没有这个牌照，所以这件事我不做——不是不想帮你，是做了就违规，而一个越界的建议对你也不安全。",
    instead:
      "我能做的是另外三件更实在的事：把这份产品的条款翻译成人话、逐条比对它的宣传里有没有监管明令禁止的表述、以及告诉你该在哪里核验它的资质编号。把产品说明书或广告截图丢到「识别与翻译」，走一遍就有结果。",
  },
  pick: {
    title: "买哪个，我不能替你选",
    body:
      "推荐具体标的需要证券投资咨询牌照，财智通没有。而且说实话，任何一个不了解你全部财务状况的人（包括我）替你决定买什么，本身就是不负责任的。",
    instead:
      "但「怎么想这件事」我可以陪你把顺序理清楚：这笔钱多久要用、亏多少你会睡不着、有没有更确定该先做的事（比如先还高息负债、先备应急金）。这些理清了，选择范围会自己收窄，而且是按你的情况收窄的。",
  },
  timing: {
    title: "涨跌和买卖时点，我不预测",
    body:
      "预测涨跌、指导择时，一样属于持牌业务，而且没有人能稳定做到——任何声称能的，你都该更警惕，这本身就是「识别与翻译」里教你识别的信号之一。",
    instead:
      "更有用的问法是：这笔钱我什么时候要用？如果三年内要用，市场涨跌就不该是你的决策依据，期限才是。要不要我按你档案里的期限和承受能力，把「先做什么后做什么」排一遍？",
  },
  promise: {
    title: "能赚多少，谁都不能承诺",
    body:
      "承诺或暗示收益是监管明令禁止的表述，我不会给你一个数字。看到任何人给你「预期年化 X%」，那句话本身就已经越界了。",
    instead:
      "能算的是另一个方向：**要达成你的目标，需要多少年化收益率**。这是纯数学，可以算得很准，而且算完你就知道这个目标是靠攒钱能成，还是在指望一个不现实的收益率。你档案里的目标我可以直接算。",
  },
  delegate: {
    title: "代客操作，谁提都要警惕",
    body:
      "替客户操作账户、约定分享收益，是从业人员被明令禁止的行为。财智通不碰钱、不碰账户、不代下单——我们连你的资金账户信息都不需要知道。",
    instead:
      "顺便提醒：如果现实里有人跟你说「把账户交给我，亏了我赔」，那句「亏了我赔」在法律上什么都不是。证监会公开案例里，有从业人员代操客户 60 万元、约定「亏损超过 20% 就免费做到盈利为止」，最后亏损照样是投资者自己承担，从业人员只挨了一张警示函（来源：中国证监会投资者保护「明规则、识风险」案例）。",
  },
};

export interface GateResult {
  blocked: boolean;
  category?: BlockCategory;
  matched?: string;
  /** 被拦时的完整回答（模板，确定性） */
  reply?: { title: string; body: string; instead: string };
}

export function gateQuestion(question: string): GateResult {
  const q = question.replace(/\s/g, "");
  for (const g of GATES) {
    const kw = g.keywords.find((k) => q.includes(k));
    if (kw) return { blocked: true, category: g.category, matched: kw, reply: BLOCK_REPLY[g.category] };
    const re = g.regex?.find((r) => r.test(q));
    if (re) {
      const m = q.match(re);
      return { blocked: true, category: g.category, matched: m?.[0], reply: BLOCK_REPLY[g.category] };
    }
  }
  return { blocked: false };
}

// ────────────────────────────────────────────────────────────
// ② 档案事实（每条带依据，数字都是算出来的）
// ────────────────────────────────────────────────────────────

export interface Fact {
  key: string;
  label: string;
  value: string;
  /** 这条事实从哪来——让用户能当场对照验证 */
  basis: string;
}

export function profileFacts(p: Profile): Fact[] {
  const out: Fact[] = [];

  if (p.riskType) {
    const m = RISK_META[p.riskType];
    out.push({
      key: "risk",
      label: "风险承受类型",
      value: `${m.label}（${m.short}）`,
      basis: "规划师的风险测评结果",
    });
    out.push({
      key: "equity-cap",
      label: "权益类参考比例上限",
      value: fmtPct(m.equityCap, 0),
      basis: `${m.label}对应的参考区间，只是品类比例，不指向任何具体产品`,
    });
  }

  if (p.conflicts.length > 0) {
    out.push({
      key: "conflict",
      label: "测评中的矛盾",
      value: p.conflicts[0],
      basis: "测评里两个互斥的回答，规划师已标出",
    });
  }

  if (typeof p.debtApr === "number" && p.debtApr > 0) {
    out.push({
      key: "debt",
      label: "已识别的高息负债",
      value: `真实年化 ${fmtPct(p.debtApr)}`,
      basis: "你在规划师的分期计算器里算出的 IRR",
    });
  }

  if (typeof p.emergencyMonths === "number") {
    out.push({
      key: "emergency",
      label: "应急金覆盖月数",
      value: `${p.emergencyMonths} 个月`,
      basis: "规划师的应急金计算结果",
    });
  }

  for (const g of p.goals.slice(0, 2)) {
    const f = assessGoal(
      { years: g.years, targetAmount: g.targetAmount, current: g.current, monthly: g.monthly },
      0.03,
    );
    out.push({
      key: `goal-${g.id}`,
      label: `目标「${g.name}」`,
      value: f.required === null
        ? `${g.years} 年，目标 ${Math.round(g.targetAmount / 10000)} 万`
        : `需要年化 ${fmtPct(f.required, 1)} 才能达成`,
      basis: "按你填的年限、本金和月投入反解出来的，纯数学，不含任何收益假设",
    });
  }

  if (p.knowledge.weakTerms.length > 0) {
    out.push({
      key: "weak",
      label: "你答错过的术语",
      value: p.knowledge.weakTerms.slice(0, 4).join("、"),
      basis: "学习页闯关的错题记录——这些词我会多解释一句",
    });
  }

  if (p.encountered.length > 0) {
    out.push({
      key: "encountered",
      label: "你遇到过的话术类型",
      value: `${p.encountered.length} 类`,
      basis: "「识别与翻译」在你分析过的内容里识别到的特征",
    });
  }

  return out;
}

// ────────────────────────────────────────────────────────────
// ③ 可讲要点（允许讲的投教主题，是模型的唯一素材来源）
// ────────────────────────────────────────────────────────────

export interface Topic {
  id: string;
  keywords: string[];
  title: string;
  points: string[];
}

export const TOPICS: Topic[] = [
  {
    id: "debt-first",
    keywords: ["还债", "还款", "负债", "欠款", "分期", "信用卡", "花呗", "借呗", "先还", "贷款"],
    title: "高息负债与投资的先后顺序",
    points: [
      "还掉一笔年化 X% 的负债，等于确定地省下 X% 的支出；而任何产品都不能保证给你 X% 的收益。",
      "所以顺序上，先还高息负债几乎总是优于拿同一笔钱去投资——这是确定性对不确定性的胜出，不是收益率比大小。",
      "例外只有一种：手头连应急金都没有时，不要把最后一点活钱全部拿去还债，否则一有意外又得借更贵的钱。",
    ],
  },
  {
    id: "emergency",
    keywords: ["应急", "急用", "备用金", "失业", "生病", "存多少", "活钱"],
    title: "应急金",
    points: [
      "应急金的第一属性是「随时能取」，不是收益。它对应的是失业、生病这类突发情况。",
      "常见做法是覆盖 3 到 6 个月的必要开支；收入不稳定、家庭负担重的人应该更靠上限。",
      "放进有封闭期的产品，等于在最需要钱的时候取不出来；靠信用卡应急，是把窟窿换成更贵的负债。",
      "先有应急金，再谈投资——顺序错了，后面所有安排都会被一次意外打断。",
    ],
  },
  {
    id: "allocation",
    keywords: ["配置", "比例", "怎么分", "分配", "组合", "大类", "股债"],
    title: "大类资产配置的思路（只讲品类与比例，不指向具体产品）",
    points: [
      "配置先分三层：随时要用的活钱、几年内要用的稳健部分、长期不动的增值部分。钱的用途和期限决定它该放哪一层，而不是反过来。",
      "权益类的比例上限，应该由「亏多少你会睡不着」和「这笔钱多久要用」两个条件里更严的那个决定。",
      "比例是原则，不是产品清单。财智通只讲品类和比例区间，不推荐任何具体标的。",
    ],
  },
  {
    id: "risk-match",
    keywords: ["风险等级", "适当性", "测评", "R1", "R2", "R3", "R4", "R5", "匹配", "稳健型", "进取型"],
    title: "风险等级与适当性匹配",
    points: [
      "监管要求机构先了解你的风险承受能力，再把匹配的产品卖给你，这叫适当性管理。",
      "测评结果是稳健型却被推荐高风险等级的产品，说明销售流程本身有问题。",
      "如果销售教你「测评随便选高的，不然买不了」，那是在教你配合他违规——这一步是保护你的，不是流程障碍。",
    ],
  },
  {
    id: "lock",
    keywords: ["封闭", "锁定", "取不出", "赎回", "流动性", "期限", "多久"],
    title: "封闭期与流动性",
    points: [
      "封闭期就是这段时间钱取不出来，写进合同，找谁都通融不了。",
      "签之前该问自己的不是「收益高不高」，是「这段时间我确定不会用到这笔钱吗」。",
      "急用钱时取不出来，是新手最容易踩的坑，比亏一点收益严重得多。",
    ],
  },
  {
    id: "fee",
    keywords: ["费用", "手续费", "管理费", "托管费", "申购费", "赎回费", "费率", "成本"],
    title: "费用",
    points: [
      "管理费、托管费、销售服务费都是固定费用，按年从产品资产里扣，赚钱亏钱一样收。",
      "把几项费率加总看，才知道你的收益先被拿掉了多少。",
      "短期赎回往往还要收惩罚性费用，这部分容易被忽略。",
    ],
  },
  {
    id: "benchmark",
    keywords: ["业绩比较基准", "基准", "年化", "预期收益", "收益率", "怎么看收益"],
    title: "收益口径怎么读",
    points: [
      "「业绩比较基准」是管理人给自己定的参考目标，既不是承诺也不是保底，实际到手可能远低于它。",
      "「年化」只是换算口径：把一段时间的表现按一年折算，说的是过去，不是未来。",
      "监管禁止用「预期收益率」做宣传——主打这个数字的，本身就已经越界。",
      "看到任何收益数字，先问一句：这是过去实际发生的，还是它预计的？",
    ],
  },
  {
    id: "diversify",
    keywords: ["分散", "鸡蛋", "一个篮子", "集中"],
    title: "什么才算真的分散",
    points: [
      "分散的本质是「不要让同一个风险打中你全部的钱」。",
      "买五只跟踪同一个指数的基金，涨跌几乎一模一样，篮子还是同一个；换五个 App 更只是换了柜台。",
      "真正的分散发生在资产大类之间。",
    ],
  },
  {
    id: "deposit",
    keywords: ["存款", "定期", "银行", "存款保险", "跟存款", "理财和存款"],
    title: "存款与理财的区别",
    points: [
      "存款是银行欠你钱，本息受存款保险保障（同一家银行 50 万元以内全额偿付）。",
      "理财是你委托投资、自担盈亏，银行只是管理人或代销渠道，不兜底。",
      "同一个柜台卖的两样东西，法律关系完全不同。把理财说成「跟存款一样安全」是误导销售。",
    ],
  },
  {
    id: "leverage",
    keywords: ["杠杆", "配资", "融资", "借钱投", "加杠杆"],
    title: "杠杆",
    points: [
      "杠杆同时放大盈利和亏损：5 倍杠杆下标的跌 20% 本金就归零，而且往往在归零前就被强制平仓。",
      "场外配资是违法的，出了纠纷你连主张权利的依据都没有。",
    ],
  },
  {
    id: "scam",
    keywords: ["骗", "诈骗", "靠谱", "可信", "真的假的", "被骗", "杀猪盘", "荐股", "群里", "老师"],
    title: "识别话术的基本原则",
    points: [
      "承诺保本保收益、给出「预期年化」、催你「今日截止」、把你引到个人微信、晒盈利截图、要求你别告诉家人——这几类表述里任何一条出现，都值得停下来。",
      "资质是可以逐个查的：主体全称、许可证号、产品编码，缺一样就查不动。真有资质的会把编号写出来让你去查。",
      "我们只能检查它说了什么，检查不了它实际做什么——所以「未识别到违规表述」不等于安全。",
    ],
  },
  {
    id: "goal",
    keywords: ["目标", "首付", "买房", "养老", "攒钱", "多久能", "够不够", "存够"],
    title: "目标可行性",
    points: [
      "目标可行性是纯数学：给定年限、现有本金和月投入，可以反解出「需要多少年化收益率」。",
      "如果反解出来的收益率高得不现实，说明该调的是目标、年限或月投入，而不是去找一个更高收益的产品。",
      "能调的杠杆只有三个：延长年限、降低目标金额、提高月投入。",
    ],
  },
];

export function matchTopics(question: string): Topic[] {
  const q = question.replace(/\s/g, "");
  return TOPICS.filter((t) => t.keywords.some((k) => q.includes(k)));
}

// ────────────────────────────────────────────────────────────
// 提示词与模板回答
// ────────────────────────────────────────────────────────────

export function buildPrompt(question: string, facts: Fact[], topics: Topic[]): string {
  const factLines = facts.length
    ? facts.map((f) => `- ${f.label}：${f.value}（依据：${f.basis}）`).join("\n")
    : "（这位用户还没有填过档案）";
  const topicLines = topics.length
    ? topics.map((t) => `【${t.title}】\n${t.points.map((p) => `- ${p}`).join("\n")}`).join("\n\n")
    : "（没有匹配到具体主题，只能讲通用的思考顺序：钱的用途与期限 → 承受能力 → 先做确定的事）";

  return `你是「财智通」的理财规划助手，正在回答一位金融小白的问题。你了解他的档案，所以回答要针对他的具体情况，而不是泛泛而谈。

【用户的问题】
${question}

【你可以引用的用户事实】（这些是系统算出来的，可以直接用；不要修改其中的数字）
${factLines}

【你可以讲的要点】（**这是你唯一的素材来源**，不要引入这里没有的知识）
${topicLines}

【硬性要求】
1. 不推荐任何具体的股票、基金、理财产品，不提任何产品名称或代码，连举例都不行
2. 不预测涨跌，不指导买卖时点，不承诺或暗示收益
3. 不说任何产品或机构「安全」「可靠」「正规」
4. 不要出现上面【用户事实】和【可讲要点】里没有的数字——一个都不许编
5. 如果用户的情况里有更该先做的事（比如先还高息负债、先备应急金），先说那件事
6. 讲还债省下的利息时，说「省下」「少付」，不要用「白赚」「稳赚」「划算得多」这类像在许诺收益的说法
7. 用大白话，像耐心的晚辈跟长辈解释。3 到 6 句话，短句。不说教、不吓唬、不堆感叹号
8. 直接输出正文，不要标题、不要列表、不要 markdown 符号`;
}

/** 无 key（演示模式）或模型输出被审查层丢弃时的兜底回答：完全由规则拼出，可预测 */
export function templateAnswer(facts: Fact[], topics: Topic[]): string {
  const parts: string[] = [];

  const debt = facts.find((f) => f.key === "debt");
  const emergency = facts.find((f) => f.key === "emergency");

  // 先说更该先做的事——这个顺序判断是规则做的，不依赖模型
  if (debt) {
    parts.push(
      `先说一件比你问的问题更该先做的事：你档案里有一笔${debt.value}的负债。还掉它等于确定地省下这笔利息，而任何产品都不能保证给你同样的收益。`,
    );
  }
  if (emergency && /^[0-3] /.test(emergency.value)) {
    parts.push(`另外你的应急金只覆盖 ${emergency.value}，建议先补到 3 到 6 个月的必要开支再谈投资。`);
  }

  if (topics.length > 0) {
    parts.push(topics[0].points.slice(0, 2).join(""));
    if (topics[1]) parts.push(topics[1].points[0]);
  } else {
    parts.push(
      "针对你的问题，可以按这个顺序想：这笔钱多久要用、亏多少你会睡不着、有没有更确定该先做的事。这三个问题理清了，选择范围会自己收窄。",
    );
  }

  const risk = facts.find((f) => f.key === "risk");
  const cap = facts.find((f) => f.key === "equity-cap");
  if (risk && cap) {
    parts.push(
      `结合你的档案：你的测评结果是${risk.value}，对应的权益类参考比例上限是${cap.value}——这只是品类比例，不指向任何具体产品。`,
    );
  }

  return parts.join("");
}

/** 按档案给出的推荐问法：让用户一眼看出「它真的读了我的档案」 */
export function suggestedQuestions(p: Profile): string[] {
  const out: string[] = [];
  if (typeof p.debtApr === "number" && p.debtApr > 0) out.push("我该先还债还是先理财？");
  if (typeof p.emergencyMonths === "number" && p.emergencyMonths < 3) out.push("应急金要留多少才够？");
  if (p.goals.length > 0) out.push(`我的目标「${p.goals[0].name}」现在这个进度够吗？`);
  if (p.knowledge.weakTerms.length > 0) out.push(`「${p.knowledge.weakTerms[0]}」到底是什么意思？`);
  if (p.conflicts.length > 0) out.push("测评说我有矛盾，那我到底该按哪个来？");
  if (p.encountered.length > 0) out.push("群里有人推荐产品，我该怎么判断？");
  out.push("我这种情况，钱该怎么分成几份？");
  out.push("理财和存款到底差在哪？");
  return out.slice(0, 5);
}
