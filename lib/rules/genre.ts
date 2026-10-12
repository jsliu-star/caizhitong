/**
 * 文体识别：这段文字是在「推销」，还是在「讲骗局」？
 *
 * 为什么需要：规则和模型都只看得见「保本保息」这四个字，看不见它站在谁的嘴里。
 * 复赛评测里（复赛工作区/评测/reports/P_首轮_冻结.md），官方报道与警示句——
 * 「犯罪分子以所谓"稳赚不赔""保本保息"为诱饵」「坚决抵制"保本保收益"等噱头」——
 * 被完整流水线判为高风险的比例是 55%。长辈把一篇反诈新闻转来问，得到一个「高风险」，只会更糊涂。
 *
 * 判定是确定性规则（不交给模型），三类线索 + 一票否决：
 *   叙述：第三人称指代诈骗方或办案方（不法分子、该团伙、被告人、警方……）
 *   手法：描述骗术的动词和框架（谎称、以…为诱饵、噱头、话术、所谓……）
 *   警示：提醒或定性（切勿、谨防、坚决抵制、违法、刑事责任、不可能同时成立……）
 *   引述：命中的违规说法被引号括着——是在引用，不是在说
 * 至少两类线索同时出现才算「讲骗局」。
 *
 * 一票否决：只要出现推销方的痕迹（本平台、我们公司、加微信、扫码、立即、名额有限、联系方式……），
 * 一律按宣传处理。骗子在广告里加一句「谨防诈骗」骗不过去。
 *
 * 判为「讲骗局」后，命中项照常列出（它们正是用户该认识的话术），但结论不给「高风险」。
 */
import type { Hit } from "@/lib/types";

export interface GenreResult {
  kind: "promo" | "report";
  /** 命中的线索，按类别 */
  cues: { narrative: string[]; tactic: string[]; warning: string[]; quoted: string[] };
  /** 否决原因（出现推销痕迹） */
  veto: string[];
}

const NARRATIVE =
  /犯罪分子|不法分子|诈骗分子|诈骗团伙|犯罪团伙|该团伙|团伙成员|骗子|被告人|犯罪嫌疑人|涉案|案发|立案|公安机关|警方|民警|检察院|检察机关|法院|被害人|受害人|集资参与人|投资人蒙受|招募者/g;
const TACTIC =
  /谎称|声称|宣称|号称|自称|吹嘘|吹捧|冒充|虚构|伪造|诱骗|骗取|蒙骗|诱导|诱使|诱饵|噱头|幌子|旗号|话术|套路|陷阱|所谓|假象|收割|拆东墙补西墙|洗白|赃款|以[^，。；]{1,20}为名/g;
const WARNING =
  /切勿|谨记|坚决抵制|谨防|警惕|不要轻信|千万不要|千万别|小心|提醒广大|违法|犯罪(?!分子|团伙|嫌疑人)|刑事责任|不能同时成立|不可能同时|传销|非法集资|非法吸收|监管重点|骗局|(?:都|均|就)(?:是|为)(?:诈骗|非法集资)|不存在(?:　|[“「『"])/g;
/** 推销方痕迹：一票否决 */
const VETO =
  /本平台|本公司|本群|本产品|我行|我司|我们(?:公司|平台|团队|是|的产品|不一样)|加(?:我|微信|客服|vx|VX|v信|V信|好友)|私信|扫码|扫描二维码|点击链接|下载.{0,6}APP|立即(?:加|扫|下载|转账|转入|投资|购买|抢|报名|领取|联系|咨询)|赶紧(?:加|上车|入|买|投)|速来|速抢|名额有限|今日截止|仅剩|限时(?:优惠|抢购|特惠|福利|开放)|联系电话|客服电话|微信号|进群|入群|领取(?:内部|额度|名额|福利|红包|收益|资料)|报名|开户送|[0-9]{7,}/g;

const QUOTE_OPEN = "“「『\"‘";
const QUOTE_CLOSE = "”」』\"’";

/** 命中位置是否落在一对引号之内 */
function insideQuotes(text: string, index: number, len: number): boolean {
  let open = -1;
  for (let i = index - 1; i >= 0 && index - i <= 40; i -= 1) {
    if (QUOTE_CLOSE.includes(text[i]) && !QUOTE_OPEN.includes(text[i])) return false;
    if (QUOTE_OPEN.includes(text[i])) {
      open = i;
      break;
    }
  }
  if (open === -1) return false;
  for (let j = index + len; j < text.length && j - index <= 60; j += 1) {
    if (QUOTE_CLOSE.includes(text[j])) return true;
    if (QUOTE_OPEN.includes(text[j]) && !QUOTE_CLOSE.includes(text[j])) return false;
  }
  return false;
}

const uniq = (xs: string[]) => [...new Set(xs)];

/**
 * 去掉成对引号里的内容，只留「说话人自己的话」。
 * 反诈报道常原样引用骗子的广告（「名额仅剩」「今日截止」都在引号里），这些不该算报道者在推销。
 */
function outsideQuotes(text: string): string {
  return text.replace(/[“「『"][^”」』"]{0,300}[”」』"]/g, "　");
}

export function detectGenre(text: string, hits: Hit[]): GenreResult {
  const outside = outsideQuotes(text);
  // 叙述 / 手法 / 警示线索只认引号外的——引号里的是被引用的话
  const narrative = uniq(outside.match(NARRATIVE) ?? []);
  const tactic = uniq(outside.match(TACTIC) ?? []);
  const warning = uniq(outside.match(WARNING) ?? []);
  const vetoOutside = uniq(outside.match(VETO) ?? []);
  const vetoAll = uniq(text.match(VETO) ?? []);
  const quoted = uniq(
    hits.filter((h) => h.index >= 0 && insideQuotes(text, h.index, h.matched.length)).map((h) => h.matched),
  );
  const cues = { narrative, tactic, warning, quoted };

  // 推销痕迹出现在引号外：说话人自己在推销，一票否决
  if (vetoOutside.length > 0) return { kind: "promo", cues, veto: vetoOutside };

  const own = [narrative, tactic, warning].filter((x) => x.length > 0).length;
  // 推销痕迹只出现在引号里：是在引用别人的广告。此时要求引号外有更强的报道线索（引述本身不计），
  // 防止骗子在自家广告外面套一句「警方提醒：」再把推销内容放进引号
  if (vetoAll.length > 0) return { kind: own >= 2 ? "report" : "promo", cues, veto: own >= 2 ? [] : vetoAll };

  const families = own + (quoted.length > 0 ? 1 : 0);
  return { kind: families >= 2 ? "report" : "promo", cues, veto: [] };
}
