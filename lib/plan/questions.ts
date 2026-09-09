import type { AgeBand, RiskType } from "@/lib/profile";

/**
 * 自适应风险测评。
 * 关键点：题目不是固定的一张问卷——每答一题，下一题是根据已有回答重新挑的。
 * 填「62 岁 / 退休金」和填「30 岁 / 工资」，后面看到的题目完全不同。
 * 这是「会改变自己执行路径」的具体实现，也是与静态表单的根本区别。
 */

export type AnswerValue = string | number;
export type Answers = Record<string, AnswerValue>;

export interface Option {
  value: string;
  label: string;
  desc?: string;
  /** 风险承受力得分贡献 */
  score?: number;
}

export interface Question {
  id: string;
  text: string;
  hint?: string;
  kind: "single" | "number";
  options?: Option[];
  /** 数值题的单位与范围 */
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  /** 只有满足条件时才会出现——自适应的核心 */
  when?: (a: Answers) => boolean;
  /** 该题在总分中的权重 */
  weight?: number;
  /** 归入哪一维（用于结果页的画像雷达） */
  dim?: "capacity" | "willingness" | "horizon" | "knowledge";
}

const is = (a: Answers, k: string, ...v: string[]) => v.includes(String(a[k]));

export const QUESTIONS: Question[] = [
  {
    id: "age",
    text: "你的年龄段是？",
    kind: "single",
    dim: "capacity",
    weight: 1,
    options: [
      { value: "18-25", label: "18–25 岁", score: 70 },
      { value: "26-35", label: "26–35 岁", score: 85 },
      { value: "36-50", label: "36–50 岁", score: 70 },
      { value: "51-60", label: "51–60 岁", score: 45 },
      { value: "60+", label: "60 岁以上", score: 25 },
    ],
  },
  {
    id: "source",
    text: "这笔准备用来理财的钱，主要来自哪里？",
    kind: "single",
    dim: "capacity",
    weight: 1.4,
    options: [
      { value: "salary", label: "工资结余", score: 75 },
      { value: "business", label: "经营或劳务收入", score: 65 },
      { value: "pension", label: "退休金 / 养老储备", score: 20 },
      { value: "allowance", label: "生活费 / 兼职收入", score: 40 },
      { value: "borrowed", label: "借来的钱（信用卡、消费贷、亲友借款）", score: 0 },
    ],
  },
  // ── 分支：工薪 / 经营者才问收入稳定性 ──
  {
    id: "stability",
    text: "你的收入稳定性如何？",
    kind: "single",
    dim: "capacity",
    weight: 1,
    when: (a) => is(a, "source", "salary", "business"),
    options: [
      { value: "stable", label: "很稳定", desc: "体制内、长期合同", score: 85 },
      { value: "normal", label: "比较稳定", desc: "普通企业，基本固定", score: 60 },
      { value: "unstable", label: "波动较大", desc: "提成为主、自由职业", score: 30 },
    ],
  },
  // ── 分支：退休金人群专属 ──
  {
    id: "pensionShare",
    text: "这笔钱占你全部可支配资产的比例大概是？",
    hint: "养老钱一旦亏损很难再挣回来，所以这个比例特别重要",
    kind: "single",
    dim: "capacity",
    weight: 1.8,
    when: (a) => is(a, "source", "pension") || is(a, "age", "60+", "51-60"),
    options: [
      { value: "lt20", label: "两成以内", score: 55 },
      { value: "20-50", label: "两成到一半", score: 30 },
      { value: "gt50", label: "超过一半", score: 8 },
      { value: "all", label: "几乎是全部", score: 0 },
    ],
  },
  // ── 分支：学生 / 年轻人专属 ──
  {
    id: "studentDebt",
    text: "你目前有没有在用校园贷、网络小贷或分期？",
    kind: "single",
    dim: "capacity",
    weight: 1.6,
    when: (a) => is(a, "age", "18-25") || is(a, "source", "allowance"),
    options: [
      { value: "none", label: "没有", score: 70 },
      { value: "installment", label: "有花呗 / 信用卡分期", score: 30 },
      { value: "loan", label: "有网贷或校园贷", score: 0 },
    ],
  },
  {
    id: "horizon",
    text: "这笔钱多久之内可能会需要用到？",
    hint: "这是最关键的一题——期限决定了你能不能承受波动",
    kind: "single",
    dim: "horizon",
    weight: 2,
    options: [
      { value: "lt6m", label: "半年内", desc: "随时可能要取用", score: 5 },
      { value: "6-12m", label: "半年到一年", score: 25 },
      { value: "1-3y", label: "一到三年", score: 50 },
      { value: "3-5y", label: "三到五年", score: 75 },
      { value: "gt5y", label: "五年以上", desc: "确定不会动用", score: 95 },
    ],
  },
  {
    id: "amount",
    text: "计划投入的金额大约是多少？",
    kind: "number",
    unit: "元",
    min: 0,
    step: 5000,
    dim: "capacity",
    weight: 0,
  },
  {
    id: "emergency",
    text: "除了这笔钱，你还有多少个月的生活费能随时取用？",
    hint: "这就是应急备用金。没有它，一遇急事就只能在最坏的时点卖出资产",
    kind: "single",
    dim: "capacity",
    weight: 1.4,
    options: [
      { value: "none", label: "几乎没有", score: 5 },
      { value: "lt3", label: "不到 3 个月", score: 30 },
      { value: "3-6", label: "3 到 6 个月", score: 70 },
      { value: "gt6", label: "6 个月以上", score: 95 },
    ],
  },
  {
    id: "loss",
    text: "假设一年后这笔钱亏了 10%，你的第一反应是？",
    kind: "single",
    dim: "willingness",
    weight: 2,
    options: [
      { value: "add", label: "机会来了，再加一些", score: 95 },
      { value: "hold", label: "不动，继续拿着", score: 70 },
      { value: "reduce", label: "先卖掉一部分", score: 35 },
      { value: "sellall", label: "全部卖掉，而且这段时间会睡不着", score: 5 },
    ],
  },
  {
    id: "drawdown",
    text: "你能接受的最大亏损幅度是？",
    hint: "请按真实感受选，不要按「应该选哪个」选",
    kind: "single",
    dim: "willingness",
    weight: 1.8,
    options: [
      { value: "0", label: "一分都不能亏", score: 0 },
      { value: "5", label: "5% 以内", score: 30 },
      { value: "10", label: "10% 左右", score: 55 },
      { value: "20", label: "20% 左右", score: 80 },
      { value: "30", label: "30% 以上也能接受", score: 100 },
    ],
  },
  {
    id: "experience",
    text: "你以前买过下面哪一类？（选最靠右的那个）",
    kind: "single",
    dim: "knowledge",
    weight: 1.2,
    options: [
      { value: "deposit", label: "只存过定期或活期", score: 15 },
      { value: "money", label: "买过货币基金 / 余额宝", score: 35 },
      { value: "fund", label: "买过债券或混合基金", score: 60 },
      { value: "stock", label: "买过股票或股票型基金", score: 85 },
      { value: "leverage", label: "用过杠杆、期货、期权或虚拟货币", score: 100 },
    ],
  },
  {
    id: "debt",
    text: "你现在有没有需要还的高息负债？",
    hint: "分期、信用卡、消费贷的真实年化常在 13% 以上",
    kind: "single",
    dim: "capacity",
    weight: 1.2,
    options: [
      { value: "none", label: "没有", score: 85 },
      { value: "low", label: "有，但利率很低（如公积金房贷）", score: 65 },
      { value: "high", label: "有分期或消费贷", score: 15 },
      { value: "unknown", label: "有，但我不知道利率多少", score: 20 },
    ],
  },
  // ── 知识水平自测：答案会写入共享档案，影响另两个 Tab 的讲解深度 ──
  {
    id: "kBenchmark",
    text: "产品写着「业绩比较基准 3.2%」，这句话的意思是？",
    kind: "single",
    dim: "knowledge",
    weight: 0.8,
    options: [
      { value: "wrong-promise", label: "到期至少能拿到 3.2%", score: 0 },
      { value: "right", label: "管理人给自己定的参考目标，不是承诺", score: 100 },
      { value: "wrong-avg", label: "同类产品的平均收益", score: 20 },
      { value: "unknown", label: "不知道", score: 10 },
    ],
  },
  {
    id: "kDeposit",
    text: "银行卖的理财产品，和银行存款的区别是？",
    kind: "single",
    dim: "knowledge",
    weight: 0.8,
    when: (a) => !is(a, "experience", "stock", "leverage"),
    options: [
      { value: "right", label: "存款受存款保险保障，理财不保本、可能亏本金", score: 100 },
      { value: "wrong-same", label: "差不多，都是银行的，都安全", score: 0 },
      { value: "wrong-rate", label: "只是收益高低不同", score: 20 },
      { value: "unknown", label: "不知道", score: 10 },
    ],
  },
];

/** 下一道该问的题——这就是「自适应」 */
export function nextQuestion(answers: Answers): Question | null {
  return QUESTIONS.find((q) => !(q.id in answers) && (!q.when || q.when(answers))) ?? null;
}

/** 当前这套回答会走到的全部题目（用于进度显示） */
export function activeQuestions(answers: Answers): Question[] {
  return QUESTIONS.filter((q) => !q.when || q.when(answers));
}

export interface ScoreResult {
  score: number;
  riskType: RiskType;
  dims: Record<"capacity" | "willingness" | "horizon" | "knowledge", number>;
  /** 知识水平（写入共享档案） */
  knowledgeLevel: "none" | "basic" | "intermediate";
  weakTerms: string[];
}

const DIM_KEYS = ["capacity", "willingness", "horizon", "knowledge"] as const;

export function scoreAnswers(answers: Answers): ScoreResult {
  const dimSum: Record<string, number> = {};
  const dimW: Record<string, number> = {};
  let total = 0;
  let totalW = 0;
  const weakTerms: string[] = [];

  for (const q of QUESTIONS) {
    if (!(q.id in answers)) continue;
    if (q.kind !== "single" || !q.options) continue;
    const opt = q.options.find((o) => o.value === String(answers[q.id]));
    if (!opt || opt.score === undefined) continue;
    const w = q.weight ?? 1;

    if (q.dim) {
      dimSum[q.dim] = (dimSum[q.dim] ?? 0) + opt.score * w;
      dimW[q.dim] = (dimW[q.dim] ?? 0) + w;
    }
    if (w > 0) {
      total += opt.score * w;
      totalW += w;
    }
    if (q.id === "kBenchmark" && opt.value !== "right") weakTerms.push("业绩比较基准");
    if (q.id === "kDeposit" && opt.value !== "right") weakTerms.push("非保本浮动收益");
  }

  const dims = Object.fromEntries(
    DIM_KEYS.map((k) => [k, dimW[k] ? Math.round(dimSum[k] / dimW[k]) : 0]),
  ) as ScoreResult["dims"];

  // 风险承受力取「能力」与「意愿」的较小值——监管适当性管理的通行做法：
  // 敢亏但亏不起，或亏得起但不敢亏，都应按更保守的一侧定级
  const bounded = Math.min(dims.capacity, dims.willingness, (dims.horizon + 100) / 2);
  const score = Math.round(totalW ? total / totalW * 0.45 + bounded * 0.55 : 0);

  const riskType: RiskType =
    score < 25 ? "conservative" : score < 45 ? "steady" : score < 62 ? "balanced" : score < 78 ? "growth" : "aggressive";

  const knowledgeLevel = dims.knowledge >= 70 ? "intermediate" : dims.knowledge >= 40 ? "basic" : "none";

  return { score, riskType, dims, knowledgeLevel, weakTerms };
}

/**
 * 矛盾发现。这是真投顾会做、而静态问卷不会做的事：
 * 不只算出一个等级，而是指出你的回答之间互相打架的地方。
 */
export interface Conflict {
  id: string;
  severity: "hard" | "soft";
  title: string;
  detail: string;
  action: string;
}

export function findConflicts(answers: Answers, s: ScoreResult): Conflict[] {
  const out: Conflict[] = [];
  const a = answers;

  if (is(a, "source", "borrowed") || is(a, "studentDebt", "loan")) {
    out.push({
      id: "c-borrowed",
      severity: "hard",
      title: "用借来的钱投资",
      detail:
        "借来的钱有确定的利息成本和确定的还款日，而投资收益既不确定、也不由你控制。两者叠加时，一次正常的市场波动就可能让你被迫在最坏的时点卖出。",
      action: "先把借款还清，再谈理财。这不是保守，是顺序问题。",
    });
  }

  // 注意：这里判断的是「原始风险意愿」而不是最终定级。
  // 最终定级已被承受能力压低，若用它判断，这条矛盾永远不会触发——
  // 而这条矛盾的意义恰恰是「你想承担的风险，和这笔钱的性质不匹配」。
  if (is(a, "horizon", "lt6m", "6-12m") && s.dims.willingness >= 60) {
    out.push({
      id: "c-horizon-risk",
      severity: "hard",
      title: "短期要用的钱，配了长期才合适的风险",
      detail:
        "你的风险意愿测出来偏进取，但这笔钱一年内可能就要取用。权益类资产的波动周期常常长于一年——短钱长投，等于把「什么时候卖」交给了运气。",
      action: "要么把这笔钱当成短钱（以存款和货币类为主），要么确认它真的三五年不动。",
    });
  }

  if (is(a, "debt", "high", "unknown")) {
    out.push({
      id: "c-debt",
      severity: "hard",
      title: "背着高息负债去理财",
      detail:
        "分期和消费贷宣传的「月费率 0.6%」，真实年化常在 13% 以上。而理财的收益是不确定的——先还掉一笔确定的 13%，比追一个不确定的收益划算得多。",
      action: "去规划师的「分期真实年化计算器」把你的负债成本算出来，再决定先还债还是先理财。",
    });
  }

  if (is(a, "emergency", "none", "lt3")) {
    out.push({
      id: "c-emergency",
      severity: "soft",
      title: "还没有留出应急备用金",
      detail:
        "没有应急金的人，一旦遇到失业或生病，只能在最坏的时点卖出资产。这是小白最常见的亏损方式——不是买错了，是被迫卖早了。",
      action: "先用应急金计算器算出该留多少，把这部分放在随时可取的地方，剩下的再谈配置。",
    });
  }

  if (is(a, "drawdown", "0", "5") && is(a, "loss", "add", "hold")) {
    out.push({
      id: "c-inconsistent",
      severity: "soft",
      title: "两道题的回答不太一致",
      detail:
        "你说最多只能接受很小的亏损，但又说真亏了 10% 会加仓或继续持有。这通常意味着：你还没有真正经历过一次下跌。",
      action: "把「能接受的最大亏损」按更保守的那个答案来看待，先从小金额开始体验波动。",
    });
  }

  if ((is(a, "age", "60+") || is(a, "source", "pension")) && s.dims.willingness >= 60) {
    out.push({
      id: "c-pension-risk",
      severity: "hard",
      title: "养老钱不适合承担高波动",
      detail:
        "养老钱的特点是「不可再生」——年轻人亏了可以靠工资补回来，养老钱亏了很难。所以它的第一目标是不亏，而不是多赚。",
      action: "无论测评分数多高，养老钱都应以存款和固收类为主。",
    });
  }

  if (is(a, "pensionShare", "gt50", "all")) {
    out.push({
      id: "c-concentration",
      severity: "hard",
      title: "单笔投入占了你资产的绝大部分",
      detail: "把一半以上的资产放在同一个决定上，意味着这个决定一旦错了，你没有第二次机会。",
      action: "先分批、分散，把单笔投入控制在总资产的较小比例内。",
    });
  }

  return out;
}

export const AGE_BAND_OF = (a: Answers): AgeBand | undefined =>
  (["18-25", "26-35", "36-50", "51-60", "60+"] as AgeBand[]).find((x) => x === String(a.age));
