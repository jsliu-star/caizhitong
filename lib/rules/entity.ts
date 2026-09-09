import type { EntityCheck, EntityClue, LookupLink } from "@/lib/types";
import { normalize } from "@/lib/rules/match";

/**
 * 主体核查 Agent。
 * 全部规则本地可判，不依赖模型——这是「判定不交给模型」原则的一部分。
 */

/** 金融业务相关的主体字样 */
const FINANCIAL_SUFFIX =
  /(有限责任公司|股份有限公司|有限公司|集团有限公司|集团|银行|证券|保险|基金管理|资产管理|财富管理|投资管理|资本管理|信托|期货|交易所|交易中心|平台)/;

/** 主体名称候选 */
const NAME_RE =
  /[一-龥A-Za-z0-9（）()·]{2,24}?(有限责任公司|股份有限公司|有限公司|集团|银行|证券|保险|信托|期货|基金管理|资产管理|财富管理|投资管理|资本管理)/g;

/** 宣称的资质编号 */
const LICENSE_RE =
  /(备案|许可|批准|登记|注册|监管|牌照)\s*[编号码]{0,2}\s*[:：]?\s*([A-Za-z]{0,6}[\d\-]{4,20}[A-Za-z0-9]{0,6})/g;

/** 主体名称里出现这些字样，说明是非金融主体在做金融业务 */
const NON_FINANCIAL_NATURE = ["科技", "网络", "信息", "文化", "咨询", "商贸", "贸易", "电子商务", "供应链"];

/** 宣称的背景方 */
const CLAIMED_BACKING = ["国资", "国企", "央企", "上市公司", "政府", "国家级", "银保监", "证监会", "央行", "持牌", "监管备案"];

/** 个人渠道联系方式 */
const PERSONAL_CONTACT = ["加微信", "加我微信", "微信号", "扫码进群", "扫码添加", "私聊", "私信我", "加V", "加QQ", "客服私聊", "内部渠道"];

function uniq(xs: string[]): string[] {
  return [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
}

export function checkEntity(rawText: string): EntityCheck {
  const text = normalize(rawText);

  const names = uniq([...text.matchAll(NAME_RE)].map((m) => m[0])).slice(0, 6);
  const licenseNumbers = uniq([...text.matchAll(LICENSE_RE)].map((m) => m[2])).slice(0, 6);
  const contacts = PERSONAL_CONTACT.filter((c) => text.includes(c));

  const clues: EntityClue[] = [];
  const mentionsFinancialBiz =
    /(理财|投资|基金|股票|炒股|证券|期货|外汇|收益|回报|资管|入股|股权|存款|放款|借款|贷|币|盘|赚|分红|本金|资金|打款|转账|出金|入金)/.test(
      text,
    );
  const hasFinancialName = names.some((n) => FINANCIAL_SUFFIX.test(n));

  if (mentionsFinancialBiz && names.length === 0) {
    clues.push({
      id: "ec-no-entity",
      label: "全文没有出现任何主体全称",
      detail:
        "正规金融产品的宣传材料必须写明发行人/管理人的完整法定名称。只有品牌名、没有公司全称，意味着你无法核查它到底是谁、有没有资质。",
      severity: "hard",
    });
  }

  const claimsLicense = CLAIMED_BACKING.some((c) => text.includes(c));
  if (claimsLicense && licenseNumbers.length === 0) {
    const claimed = CLAIMED_BACKING.filter((c) => text.includes(c)).join("、");
    clues.push({
      id: "ec-license-unverifiable",
      label: "宣称有资质或背景，但未给出可核验的编号",
      detail: `内容中出现「${claimed}」等表述，却没有任何可核查的许可证号、备案编码或批准文号。正规机构一定会公示可查编号。`,
      severity: "hard",
    });
  }

  if (mentionsFinancialBiz && hasFinancialName) {
    const nonFin = names.filter((n) => NON_FINANCIAL_NATURE.some((k) => n.includes(k)));
    if (nonFin.length > 0) {
      clues.push({
        id: "ec-nature-mismatch",
        label: "主体性质与所售业务不匹配",
        detail: `「${nonFin.join("、")}」从名称看属于科技/信息/商贸类主体，却在销售金融产品。经营金融业务需要相应金融许可，一般工商企业不具备。`,
        severity: "hard",
      });
    }
  }

  if (contacts.length > 0) {
    clues.push({
      id: "ec-personal-channel",
      label: "通过个人渠道而非官方渠道成交",
      detail: `内容引导你「${contacts.join("、")}」。正规金融机构通过持牌渠道、官方App和线下网点销售，不会把交易转移到个人微信或私人群里——那是为了脱离监管留痕和平台审核。`,
      severity: "high",
    });
  }

  const links: LookupLink[] = [];
  const primary = names[0];
  if (primary || mentionsFinancialBiz) {
    links.push({
      label: "国家企业信用信息公示系统",
      url: "https://www.gsxt.gov.cn/",
      note: primary
        ? `查「${primary}」是否真实存在、成立时间、经营范围是否包含金融业务、有无经营异常`
        : "拿到公司全称后，在此核查其真实性与经营范围",
    });
    links.push({
      label: "中国证监会",
      url: "http://www.csrc.gov.cn/",
      note: "在「监管对象」/「行政许可」栏目核查是否具备证券期货业务资质（含证券投资咨询）",
    });
    links.push({
      label: "中国证券投资基金业协会",
      url: "https://www.amac.org.cn/",
      note: "核查私募基金管理人登记信息、产品备案信息、从业人员资格",
    });
    links.push({
      label: "中国证券业协会",
      url: "https://www.sac.net.cn/",
      note: "核查所谓「分析师」「投资顾问」是否有执业注册记录",
    });
  }

  return { names, licenseNumbers, contacts, clues, links };
}
