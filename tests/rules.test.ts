/**
 * 规则库回归测试。
 * 每次改动 violation-patterns.json 或 match.ts 都必须跑一遍。
 * 正例 = 应当被判为 red/yellow 的不当营销文本；反例 = 合规文本、否定语境、反诈科普语境。
 */
import { analyzeText } from "@/lib/rules/match";
import type { RiskLevel } from "@/lib/types";

interface Case {
  name: string;
  text: string;
  expect: RiskLevel;
  /** 必须命中的特征 patternId */
  mustHit?: string[];
  /** 必须不命中的特征 patternId */
  mustNotHit?: string[];
}

const POSITIVE: Case[] = [
  {
    name: "经典组合：国资背景+保本+高收益+紧迫感",
    text: "【XX财富】国资背景平台，保本保息，预期年化收益18%，名额有限，今日截止，加微信领取额度。",
    expect: "red",
    mustHit: ["vp-guarantee-principal", "vp-expected-return", "vp-unverifiable-license", "vp-urgency", "vp-private-traffic"],
  },
  {
    name: "荐股与带单",
    text: "跟着老师买，明日涨停，内幕消息提前送，精准买卖点，免费领取牛股名单。",
    expect: "red",
    mustHit: ["vp-stock-recommendation"],
  },
  {
    name: "代客理财",
    text: "把账户交给我帮你操作，稳定盈利后利润分成三七分，账号密码发我就行。",
    expect: "red",
    mustHit: ["vp-discretionary-trading"],
  },
  {
    name: "混淆存款与理财",
    text: "这款理财产品跟存款一样安全，相当于定期，收益还比存款高。",
    expect: "red",
    mustHit: ["vp-deposit-confusion"],
  },
  {
    name: "资金盘结构",
    text: "静态收益每天千分之三，动态收益靠拉人头，直推奖5%，团队计酬另算，出金秒到。",
    expect: "red",
    mustHit: ["vp-pyramid-compensation", "vp-fund-pool"],
  },
  {
    name: "非法集资标的",
    text: "上市前入股机会，原始股内部认购，投资养老床位，年年有息。",
    expect: "red",
    mustHit: ["vp-illegal-fundraising-targets"],
  },
  {
    name: "情感操控（单类特征 + 无风险提示 → 升级为需警惕）",
    text: "这个投资机会只告诉你一个人，别跟家里说，相信我不会骗你的。",
    expect: "yellow",
    mustHit: ["vp-emotional-manipulation"],
  },
  {
    name: "月费率伪装（折算年化异常）",
    text: "理财项目月息3%，稳赚不赔，本金随时可取。",
    expect: "red",
    mustHit: ["vp-guarantee-principal", "vp-yield-outlier"],
  },
  {
    name: "虚假业绩+身份包装",
    text: "首席分析师带队，学员战绩连续盈利27天，会员收益晒图见群内，扫码进群。",
    expect: "yellow",
    mustHit: ["vp-fake-track-record", "vp-identity-packaging", "vp-private-traffic"],
  },
  {
    name: "虚拟币质押",
    text: "USDT理财质押生息，日返0.8%，算力矿机现货，零风险稳定回报。",
    expect: "red",
    mustHit: ["vp-guarantee-principal", "vp-illegal-fundraising-targets", "vp-yield-outlier"],
  },
];

const COLLOQUIAL: Case[] = [
  {
    name: "口语：把钱给我帮你炒股赚大钱",
    text: "把钱全给我，我一定帮你炒股赚大钱",
    expect: "red",
    mustHit: ["vp-discretionary-trading", "vp-expected-return"],
  },
  {
    name: "口语：亏了我赔你",
    text: "放心跟着我操作，亏了我赔你，稳赚不亏",
    expect: "red",
    mustHit: ["vp-guarantee-principal"],
  },
  {
    name: "口语：微信喊单",
    text: "兄弟，票已备好，跟我买，明天就能赚翻，包你赚",
    expect: "red",
    mustHit: ["vp-stock-recommendation", "vp-expected-return"],
  },
  {
    name: "口语：转账要求",
    text: "钱转给我，我帮你打理，一年回本，半年翻倍，别跟家里说",
    expect: "red",
    mustHit: ["vp-discretionary-trading", "vp-expected-return", "vp-emotional-manipulation"],
  },
  {
    name: "熟人口语：跟存款差不多（ai-db 报的漏判）",
    text: "这个跟存款差不多的，本金不会有事，都是银行在卖的，收益还高些",
    expect: "red",
    mustHit: ["vp-deposit-confusion"],
  },
  {
    name: "口语：中间插字的私域导流（ai-db 报的漏判）",
    // 原用例没有任何金融语境词，按设计应判 green（避免把普通的「加个微信」判成风险）。
    // 补上「教你理财」才是真实的骗局话术形态。
    text: "先扫码进内部交流群，加我个人微信详聊，教你理财，名额不多了",
    expect: "yellow",
    mustHit: ["vp-private-traffic"],
  },
  {
    name: "诱导出借账户（帮信罪高发，原来完全没覆盖）",
    text: "兄弟帮个忙，借你的银行卡收一笔钱，走完给你两千手续费，很快的",
    expect: "red",
    mustHit: ["vp-account-lending"],
  },
  {
    name: "跑分话术",
    text: "招收款码，日结佣金，跑分不违法，只是走个账",
    expect: "red",
    mustHit: ["vp-account-lending"],
  },
  {
    name: "口语：躺着赚",
    text: "这个项目躺着赚，财富自由不是梦，加我微信详聊",
    expect: "red",
    mustHit: ["vp-expected-return"],
  },
];

const NEGATIVE: Case[] = [
  {
    name: "否定语境：不保本",
    text: "本产品不保本，不保证收益，可能损失本金，投资须谨慎。",
    expect: "green",
    mustNotHit: ["vp-guarantee-principal", "vp-expected-return"],
  },
  {
    name: "否定语境：非保本浮动收益",
    text: "本理财为非保本浮动收益型产品，风险等级R3，过往业绩不代表未来表现。",
    expect: "green",
    mustNotHit: ["vp-guarantee-principal"],
  },
  {
    name: "教育语境：反诈科普",
    text: "凡是承诺保本保息、宣称零风险高收益的都是骗局，请提高警惕，切勿相信。",
    expect: "green",
    mustNotHit: ["vp-guarantee-principal"],
  },
  {
    name: "教育语境：引用监管规定",
    text: "监管明令禁止宣传预期收益率，也禁止承诺保本保收益。",
    expect: "green",
    mustNotHit: ["vp-expected-return", "vp-guarantee-principal"],
  },
  {
    name: "合规要素齐备的正规产品页",
    text: "XX理财有限责任公司发行，产品编码C1234567，托管人为XX银行，管理费0.50%/年，封闭期365天，风险等级R2，业绩比较基准2.8%-3.2%。理财非存款、产品有风险、投资须谨慎，过往业绩不代表未来表现。",
    expect: "green",
    mustNotHit: ["vp-expected-return", "vp-guarantee-principal", "vp-yield-outlier"],
  },
  {
    name: "客观陈述市场数据（不是收益承诺）",
    text: "截至当日，10年期国债收益率约为1.8%，货币基金7日年化约1.5%，沪深300市盈率约12倍。",
    expect: "green",
    mustNotHit: ["vp-expected-return", "vp-yield-outlier"],
  },
  {
    name: "机构合规声明",
    text: "我们不承诺保本，也不会向您提供任何个股买卖建议，相关内容仅供参考。",
    expect: "green",
    mustNotHit: ["vp-guarantee-principal", "vp-stock-recommendation"],
  },
  {
    name: "投教课程介绍",
    text: "本节课讲解什么是市盈率与市净率，不涉及任何具体标的推荐，投资有风险。",
    expect: "green",
    mustNotHit: ["vp-stock-recommendation"],
  },
  {
    name: "存款保险科普",
    text: "根据存款保险条例，同一存款人在同一家银行的存款本息合计50万元以内可获全额偿付。",
    expect: "green",
    mustNotHit: ["vp-deposit-confusion", "vp-guarantee-principal"],
  },
  {
    name: "合法术语：固定收益类 / 无风险利率不应误判",
    text: "本产品属于固定收益类理财产品，业绩比较基准参考无风险利率水平设定，风险等级R2，投资须谨慎。",
    expect: "green",
    mustNotHit: ["vp-expected-return", "vp-guarantee-principal"],
  },
  {
    name: "投教文章讨论无风险收益率",
    text: "所谓无风险收益率，通常以10年期国债收益率作为参考，它是衡量各类理财产品性价比的标尺。",
    expect: "green",
    mustNotHit: ["vp-guarantee-principal", "vp-expected-return", "vp-yield-outlier"],
  },
  {
    name: "合规声明含「存款」不应误判",
    text: "本理财产品不同于银行存款，不受存款保险保障，可能损失本金，投资须谨慎。",
    expect: "green",
    mustNotHit: ["vp-deposit-confusion", "vp-guarantee-principal"],
  },
  {
    name: "投教文章讲存款保险不应误判",
    text: "存款和理财的区别在于：存款受存款保险保障，理财不保本。二者风险区别很大，不要混为一谈。",
    expect: "green",
    mustNotHit: ["vp-deposit-confusion"],
  },
  {
    name: "正常的代付请求不应误判",
    text: "妈，我这边网络不好，你先帮我付一下这个话费，回家给你。",
    expect: "green",
    mustNotHit: ["vp-account-lending"],
  },
  {
    name: "反诈科普讲出借银行卡不应误判",
    text: "谨防出租银行卡：出借银行卡帮人收款可能构成帮信罪，这类骗局请提高警惕。",
    expect: "green",
    mustNotHit: ["vp-account-lending"],
  },
  {
    name: "无金融语境的百分比",
    text: "手机电量还剩80%，微信通知我加个微信好友。",
    expect: "green",
    mustNotHit: ["vp-yield-outlier"],
  },
];

let pass = 0;
const failures: string[] = [];

function run(c: Case, kind: string) {
  const r = analyzeText(c.text);
  const ids = new Set(r.hits.map((h) => h.patternId));
  const problems: string[] = [];

  if (r.level !== c.expect) {
    problems.push(`风险等级 期望 ${c.expect} 实际 ${r.level} (hard=${r.hardTypes} high=${r.highTypes} escalated=${r.escalated})`);
  }
  for (const id of c.mustHit ?? []) {
    if (!ids.has(id)) problems.push(`应命中但未命中: ${id}`);
  }
  for (const id of c.mustNotHit ?? []) {
    if (ids.has(id)) {
      const h = r.hits.find((x) => x.patternId === id)!;
      problems.push(`不应命中却命中: ${id} ← 「${h.matched}」 in 「${h.clause}」`);
    }
  }

  if (problems.length === 0) {
    pass += 1;
    console.log(`  ✅ [${kind}] ${c.name}`);
  } else {
    failures.push(`[${kind}] ${c.name}\n      ${problems.join("\n      ")}`);
    console.log(`  ❌ [${kind}] ${c.name}`);
    problems.forEach((p) => console.log(`      ${p}`));
  }
}

console.log("\n=== 正例（应被标记）===");
POSITIVE.forEach((c) => run(c, "正例"));
console.log("\n=== 口语化正例（真实微信话术）===");
COLLOQUIAL.forEach((c) => run(c, "口语"));

console.log("\n=== 反例（不应被标记）===");
NEGATIVE.forEach((c) => run(c, "反例"));

const total = POSITIVE.length + COLLOQUIAL.length + NEGATIVE.length;
console.log(`\n=== 结果: ${pass}/${total} 通过 ===`);
if (failures.length) {
  console.log(`\n${failures.length} 个失败:\n`);
  failures.forEach((f) => console.log(`  • ${f}\n`));
  process.exit(1);
}
