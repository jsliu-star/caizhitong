import type { ElementCheck, EntityCheck, Hit } from "@/lib/types";
import { normalize } from "@/lib/rules/match";

/**
 * 追问生成。
 *
 * 这是「智能体」与「表单」的分界线：系统先判断自己缺什么信息，
 * 再决定要不要问、问什么。信息足够时一个都不问。
 *
 * 每个追问都带 `appendIf`——用户的回答会被拼回原文重新走一遍完整分析，
 * 所以追问不是装饰，它会真的改变结论。
 */

export interface FollowupOption {
  value: string;
  label: string;
  /** 选择该项时追加到待分析文本里的内容 */
  append: string;
}

export interface Followup {
  id: string;
  question: string;
  why: string;
  options: FollowupOption[];
}

const has = (text: string, ...kw: string[]) => kw.some((k) => text.includes(k));

export function buildFollowups(
  rawText: string,
  hits: Hit[],
  elements: ElementCheck[],
  entity: EntityCheck,
): Followup[] {
  const text = normalize(rawText);
  const out: Followup[] = [];
  const hitIds = new Set(hits.map((h) => h.patternId));

  // ① 渠道信息缺失——这是判断是否脱离持牌渠道的关键
  if (entity.contacts.length === 0 && !has(text, "微信", "扫码", "群", "客服", "App", "下载", "链接", "电话")) {
    out.push({
      id: "f-channel",
      question: "对方是通过什么方式联系你的？",
      why: "正规金融机构通过持牌渠道、官方 App 和线下网点销售。成交渠道往往比宣传话术更能说明问题。",
      options: [
        { value: "wechat", label: "加微信或拉我进群", append: "对方让我加微信、扫码进群私聊。" },
        { value: "phone", label: "打电话或发短信", append: "对方通过电话和短信联系我，催我尽快办理。" },
        { value: "acquaintance", label: "熟人、邻居或同事推荐", append: "是熟人推荐的，说是自己人才告诉我，让我先别跟家里说。" },
        { value: "official", label: "银行网点或官方 App", append: "是在银行网点或机构官方 App 上看到的。" },
        { value: "unknown", label: "记不清了", append: "" },
      ],
    });
  }

  // ② 主体全称缺失——没有全称就无法核查
  if (entity.names.length === 0) {
    out.push({
      id: "f-entity",
      question: "对方有没有告诉你公司的完整名称？",
      why: "只有品牌名、没有公司全称，意味着你无法在任何官方系统里查到它是谁、有没有资质。",
      options: [
        { value: "no", label: "只说了品牌名，没给全称", append: "对方只给了品牌名称，没有提供公司全称，也没有可核验的备案编号。" },
        { value: "asked-refused", label: "问了，但对方回避", append: "我问过公司全称，对方回避了这个问题。" },
        { value: "yes", label: "给了完整的公司名", append: "" },
      ],
    });
  }

  // ③ 是否已经发生资金动作——决定行动建议的紧迫程度
  if (hits.length > 0 && !has(text, "已经转", "已经打", "已经买", "已经投", "打了钱")) {
    out.push({
      id: "f-money",
      question: "你已经转过钱了吗？",
      why: "这决定了你现在最该做的是「不要转」还是「立刻报警并固定证据」。",
      options: [
        { value: "no", label: "还没有", append: "我还没有转钱。" },
        { value: "small", label: "转过一笔小额，还提现成功了", append: "我先小额试了一笔，顺利提现了，对方正在劝我加大投入。" },
        { value: "big", label: "已经转了较大金额", append: "我已经转了较大一笔钱。" },
        { value: "cannot-withdraw", label: "转了，但现在提不出来", append: "我转了钱，现在提现失败，对方要求我再交一笔费用才能解冻。" },
      ],
    });
  }

  // ④ 收益承诺的具体数字缺失
  if (hitIds.has("vp-guarantee-principal") && !hitIds.has("vp-yield-outlier") && !/\d+\s*[%％]/.test(text)) {
    out.push({
      id: "f-rate",
      question: "对方说过大概能拿到多少收益吗？",
      why: "把承诺的收益率折算成年化，再和无风险利率对比，是判断合理性最直接的办法。",
      options: [
        { value: "lt5", label: "5% 以内", append: "对方说年化收益在 5% 以内。" },
        { value: "5-10", label: "5% 到 10%", append: "对方承诺年化收益 8%。" },
        { value: "10-20", label: "10% 到 20%", append: "对方承诺年化收益 15%。" },
        { value: "gt20", label: "20% 以上，或按天算收益", append: "对方承诺日返 0.5%，年化超过 20%。" },
        { value: "unknown", label: "没说具体数字", append: "" },
      ],
    });
  }

  // ⑤ 是否被要求保密——情感操控的关键信号
  if (!hitIds.has("vp-emotional-manipulation") && hits.length > 0) {
    out.push({
      id: "f-secret",
      question: "对方有没有让你先别告诉家里人？",
      why: "要求保密是所有财产骗局的共同特征——因为家人是最后一道防线。",
      options: [
        { value: "yes", label: "有，说是内部机会别外传", append: "对方特别叮嘱我先别跟家里说，说这是只告诉我一个人的内部机会。" },
        { value: "no", label: "没有", append: "" },
      ],
    });
  }

  return out.slice(0, 3);
}
