/**
 * 语义通道校验逻辑测试。
 * 用假 provider 喂各种「模型可能给出的坏输出」，验证校验层都能拦住。
 * 这是「模型说错了也不影响结论」这一设计的直接证据。
 */
import { detectSemantic } from "@/lib/llm/semantic";
import { matchPatterns } from "@/lib/rules/match";
import type { LLMProvider } from "@/lib/llm/types";

const stub = (raw: string): LLMProvider => ({
  name: "stub",
  isMock: false,
  async extractFromImage() {
    return { text: "" };
  },
  async summarize() {
    return raw;
  },
});

let fail = 0;
async function check(
  name: string,
  text: string,
  raw: string,
  expect: { hits?: number; dropReason?: string },
) {
  const ruleHits = matchPatterns(text).hits;
  const r = await detectSemantic(text, stub(raw), { ruleHits });
  const problems: string[] = [];
  if (expect.hits !== undefined && r.hits.length !== expect.hits) {
    problems.push(`采纳数 期望 ${expect.hits} 实际 ${r.hits.length}`);
  }
  if (expect.dropReason && !r.dropped.some((d) => d.reason.includes(expect.dropReason!))) {
    problems.push(`未出现预期的丢弃原因「${expect.dropReason}」，实际：${r.dropped.map((d) => d.reason).join(" / ") || "无"}`);
  }
  if (problems.length) {
    fail += 1;
    console.log(`  ❌ ${name}`);
    problems.forEach((p) => console.log(`      ${p}`));
  } else {
    console.log(`  ✅ ${name}`);
  }
}

const TEXT = "老弟，你听我的，钱打过来我给你操作，一个月不翻倍我给你补";

async function main() {
  console.log("\n=== 语义通道校验层 ===");

  await check(
    "正常输出被采纳",
    TEXT,
    JSON.stringify([
      { patternId: "vp-discretionary-trading", quote: "钱打过来我给你操作", why: "代客操作", confidence: "high" },
    ]),
    { hits: 1 },
  );

  await check(
    "引文不在原文中 → 丢弃",
    TEXT,
    JSON.stringify([
      { patternId: "vp-discretionary-trading", quote: "把资金委托给我全权打理", why: "改写了原文", confidence: "high" },
    ]),
    { hits: 0, dropReason: "引文在原文中不存在" },
  );

  // 复赛评测时在开发集上发现：模型把正规产品页的业绩比较基准标成收益承诺，正规产品被判高风险
  await check(
    "引文含合规术语「业绩比较基准」→ 丢弃",
    "风险等级：R2（中低风险）  投资期限：封闭期365天  业绩比较基准：年化2.80%—3.20%",
    JSON.stringify([
      { patternId: "vp-expected-return", quote: "业绩比较基准：年化2.80%—3.20%", why: "宣传收益率", confidence: "high" },
    ]),
    { hits: 0, dropReason: "合规术语" },
  );

  await check(
    "自创特征类别 → 丢弃",
    TEXT,
    JSON.stringify([{ patternId: "vp-my-own-category", quote: "你听我的", why: "编的类别", confidence: "high" }]),
    { hits: 0, dropReason: "不在特征分类表中" },
  );

  await check(
    "低置信度 → 丢弃",
    TEXT,
    JSON.stringify([
      { patternId: "vp-discretionary-trading", quote: "钱打过来我给你操作", why: "不确定", confidence: "low" },
    ]),
    { hits: 0, dropReason: "置信度不足" },
  );

  await check(
    "硬性违规仅 medium 置信度 → 丢弃",
    TEXT,
    JSON.stringify([
      { patternId: "vp-discretionary-trading", quote: "钱打过来我给你操作", why: "可能是", confidence: "medium" },
    ]),
    { hits: 0, dropReason: "硬性违规需高置信度" },
  );

  await check(
    "否定语境 → 丢弃",
    "本产品不保本，也不承诺任何收益",
    JSON.stringify([{ patternId: "vp-guarantee-principal", quote: "保本", why: "出现保本", confidence: "high" }]),
    { hits: 0, dropReason: "否定语境" },
  );

  await check(
    "科普语境 → 丢弃",
    "凡是承诺保本保息的都是骗局，请提高警惕",
    JSON.stringify([{ patternId: "vp-guarantee-principal", quote: "保本保息", why: "出现保本", confidence: "high" }]),
    { hits: 0, dropReason: "科普语境" },
  );

  await check(
    "规则通道已用其他特征解释同一片段 → 丢弃（消除偶发错标）",
    "保本保息，预期年化收益18%",
    JSON.stringify([{ patternId: "vp-deposit-confusion", quote: "保本保息", why: "错标", confidence: "high" }]),
    { hits: 0, dropReason: "已由规则通道以其他特征解释" },
  );

  await check(
    "非 JSON 输出 → 安全降级为零命中",
    TEXT,
    "抱歉，我无法完成这个任务。",
    { hits: 0 },
  );

  await check(
    "带 markdown 代码块的 JSON → 仍能解析",
    TEXT,
    "```json\n[{\"patternId\":\"vp-discretionary-trading\",\"quote\":\"钱打过来我给你操作\",\"why\":\"代客\",\"confidence\":\"high\"}]\n```",
    { hits: 1 },
  );

  await check(
    "空数组 → 零命中且无丢弃",
    TEXT,
    "[]",
    { hits: 0 },
  );

  console.log(fail === 0 ? "\n=== 全部通过 ===" : `\n=== ${fail} 项失败 ===`);
  if (fail) process.exit(1);
}

void main();
