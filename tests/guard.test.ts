import { dropRedacted, guardOutput } from "@/lib/rules/guard";

let fail = 0;
function check(name: string, input: string, opts: { mustNotContain?: string[]; fallback?: boolean; source?: string }) {
  const r = guardOutput(input, opts.source ? { sourceText: opts.source } : undefined);
  const problems: string[] = [];
  for (const bad of opts.mustNotContain ?? []) {
    if (r.text.includes(bad)) problems.push(`仍包含越界表述「${bad}」`);
  }
  if (opts.fallback !== undefined && r.shouldFallback !== opts.fallback) {
    problems.push(`shouldFallback 期望 ${opts.fallback} 实际 ${r.shouldFallback}（violations=${r.violations.length} invented=${JSON.stringify(r.inventedNumbers)}）`);
  }
  if (problems.length) {
    fail += 1;
    console.log(`  ❌ ${name}`);
    problems.forEach((p) => console.log(`      ${p}`));
    console.log(`      输出: ${r.text.slice(0, 120)}`);
  } else {
    console.log(`  ✅ ${name}`);
  }
}

console.log("\n=== 输出审查层 ===");
check("投资建议", "综合来看建议买入这只基金，值得配置。", { mustNotContain: ["建议买入", "值得配置"] });
check("涨跌预测", "这只股票一定会涨，后市必然向好。", { mustNotContain: ["一定会涨", "必然"] });
check("安全保证", "这个产品绝对安全，可以放心购买。", { mustNotContain: ["绝对安全", "放心购买"] });
check("诈骗定性", "这就是诈骗，对方是骗子。", { mustNotContain: ["这就是诈骗", "是骗子"] });
check("合规定性", "所以从现在看，它没有违反金融监管规定，属于合规产品。", {
  mustNotContain: ["没有违反", "属于合规"],
});
check("可信度评价", "这家平台还挺靠谱的，可以信赖。", { mustNotContain: ["挺靠谱", "可以信赖"] });
check("标的代码脱敏", "参考一下 600519 的表现。", { mustNotContain: ["600519"] });

check("模型自己说「白赚」→ 拦截", "每还掉一元就等于白赚 13.03%。", { mustNotContain: ["白赚"] });
check("模型自己说「稳赚」→ 拦截", "这种做法基本是稳赚的。", { mustNotContain: ["稳赚的"] });
check("引用广告原文里的「稳赚不赔」→ 放行", "这份宣传里写着「稳赚不赔」，这是监管禁止的表述。", {
  mustNotContain: ["（此处原有收益承诺式表述"],
});

// 复赛个性化评测中发现：提醒句被改坏成「听着像（此处原有…已移除）」
check("比喻提醒「听着像稳赚」→ 放行", "朋友说的分红项目，听着像稳赚，但得先看清楚收益是怎么来的。", {
  mustNotContain: ["（此处原有收益承诺式表述"],
});
check("否定提醒「没有稳赚不赔」→ 放行", "股市有风险，没有稳赚不赔的事。", { mustNotContain: ["（此处原有收益承诺式表述"] });
check("模型自己承诺「这个稳赚」→ 仍拦", "跟着做这个稳赚，放心。", { mustNotContain: ["这个稳赚"] });

{
  const r = dropRedacted(guardOutput("先还掉高息负债。这种做法基本是稳赚的。等应急金够了再说。").text);
  const ok = r.dropped === 1 && !r.text.includes("此处原有") && r.text.includes("先还掉高息负债") && r.text.includes("等应急金够了再说");
  if (!ok) fail += 1;
  console.log(`  ${ok ? "✅" : "❌"} 给用户看的版本：整句去掉被改写的句子，其余保留${ok ? "" : `  → ${r.text}`}`);
}

console.log("\n=== 编造数字检测 ===");
check(
  "模型自行补出市场数据 → 应回退",
  "宣传说年化18%，但银行大额存单才2%左右。",
  { source: "预期年化收益18%，月月分红", fallback: true },
);
check(
  "只转述原文数字 → 不回退",
  "宣传里承诺年化18%的收益，这属于监管禁止的表述。",
  { source: "预期年化收益18%，月月分红", fallback: false },
);
check(
  "定性对比表述 → 不回退",
  "这个收益率远高于银行存款的常见水平，多出来的部分一定对应着风险。",
  { source: "预期年化收益18%", fallback: false },
);

console.log(fail === 0 ? "\n=== 全部通过 ===" : `\n=== ${fail} 项失败 ===`);
if (fail) process.exit(1);
