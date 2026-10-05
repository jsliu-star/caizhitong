/**
 * 文体识别回归测试（lib/rules/genre.ts）。
 * 用例来自开发集（骗局图鉴、陷阱提醒、自制对抗样本），不含复赛测试集 P / B 的任何句子。
 *
 * 最要紧的是第二组：骗子在广告里加一句「谨防诈骗」「警方提醒」，不能因此被当成报道放过去。
 */
import { analyzeText } from "@/lib/rules/match";
import { detectGenre } from "@/lib/rules/genre";

let fail = 0;
function check(name: string, text: string, expect: "report" | "promo") {
  const { hits } = analyzeText(text);
  const g = detectGenre(text, hits);
  const ok = g.kind === expect;
  if (!ok) fail += 1;
  console.log(`  ${ok ? "✅" : "❌"} ${name}  → ${g.kind}${ok ? "" : `（期望 ${expect}）线索 ${JSON.stringify(g.cues)} 否决 ${JSON.stringify(g.veto)}`}`);
}

console.log("\n=== 讲骗局的文字 → report ===");
check("科普：静态收益与动态收益", "「静态收益」来自本金池，「动态收益」来自你发展的下线。参与人数增长有极限，崩盘是数学上的必然，骗子只是在等时间。", "report");
check("警示：陷阱提醒", "偏保守的人通常不会去追高收益，所以骗子的切入点不是「高收益」，而是「和存款一样安全但收益高一点」。这句话本身就是监管重点整治的误导销售。", "report");
check("报道：团伙作案", "该团伙成员冒充投资顾问，谎称跟着老师操作能稳赚不赔，以高额返利为诱饵骗取被害人资金。", "report");

console.log("\n=== 伪装成提醒的宣传 → promo（一票否决） ===");
check("谨防诈骗 + 本平台", "谨防诈骗！认准官方平台。本平台国资背景，保本保息，年化收益18%，加客服微信领取内部额度。", "promo");
check("骗子很多 + 我们是", "最近骗子很多，大家要警惕。我们是正规持牌机构，跟着王老师操作，稳赚不赔，名额有限。", "promo");
check("所谓理财平台 + 我们不一样", "很多人被所谓的理财平台骗过，但我们不一样：100%保本，每月分红，邀请好友再返现。", "promo");
check("切勿轻信 + 本群 + 私信", "切勿轻信陌生人推荐！本群老师免费带单，三天翻倍，私信我进VIP群。", "promo");
check("警方提醒 + 立即转入 + 扫码", "警方提醒：近期有不法分子冒充客服。为保障您的资金安全，请立即转入我行安全账户，扫码操作。", "promo");

console.log("\n=== 普通宣传 → promo ===");
check("无任何线索的宣传", "稳健理财新选择，保本保息，年化收益 15%，每月分红。", "promo");

console.log(fail ? `\n=== ${fail} 项失败 ===` : "\n=== 全部通过 ===");
process.exit(fail ? 1 : 0);
