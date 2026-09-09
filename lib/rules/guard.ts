/**
 * 输出审查层。
 * 只作用于「模型自由生成的文本」，不作用于规则库文案与被引用的原文。
 * 设计原则：不指望模型守规矩，用确定性代码强制拦截。
 */

/** 越界表述 → 合规替代表述 */
const REWRITE: Array<[RegExp, string]> = [
  // 投资建议类
  [/建议(买入|购买|申购|加仓|抄底)/g, "（此处原有买入建议，已按合规要求移除）"],
  [/推荐(买入|购买|申购)/g, "（此处原有买入建议，已按合规要求移除）"],
  [/建议(卖出|减仓|清仓)/g, "（此处原有卖出建议，已按合规要求移除）"],
  [/(值得|可以|应该)(买|购买|入手|配置)/g, "（此处原有买入倾向表述，已按合规要求移除）"],
  // 涨跌预测类
  [/(一定|必然|肯定|必)(会)?(涨|跌|上涨|下跌)/g, "（此处原有涨跌预测，已按合规要求移除）"],
  [/(未来|后市)(一定|必然|肯定)/g, "（此处原有确定性预测，已按合规要求移除）"],
  // 安全保证类
  [/(可以)?放心(买|购买|投|投资)/g, "（此处原有安全性保证，已按合规要求移除）"],
  [/(绝对|完全|百分百)(安全|可靠|没问题)/g, "（此处原有安全性保证，已按合规要求移除）"],
  [/这(个|家|款)?(是|就是)(安全|可靠|正规)的/g, "（此处原有安全性保证，已按合规要求移除）"],
  // 合规定性类——「未命中违规表述」不等于「合规」，这个判断我们同样无权做
  [/(没有|未曾|未|不)(违反|违规|触犯)[^。，！？]{0,14}/g, "未识别到违规表述特征"],
  [/(完全|基本)?(属于|是)合规(的|产品|机构)?/g, "未识别到违规表述特征"],
  [/符合[^。，！？]{0,14}?(监管要求|法律规定|相关规定|合规要求|基本要求|规范要求|正规.{0,6}要求)/g,
    "（此处原有合规性评价，已按合规要求移除）"],
  [/(可以|值得)信赖/g, "（此处原有可信度评价，已按合规要求移除）"],
  [/(比较|挺|还)(靠谱|正规|规范)/g, "（此处原有可信度评价，已按合规要求移除）"],
  // 法律定性类——我们无权认定诈骗
  [/(这|该|此)(个|家|款)?(是|就是)(诈骗|骗局|骗子|非法的)/g, "该内容命中了监管明令禁止的表述特征"],
  [/(一定|肯定|必然)(是)?(诈骗|骗局)/g, "高度符合不当营销与涉诈内容的表述特征"],
  [/(是|为)(骗子|诈骗团伙|犯罪团伙)/g, "存在需要核查的重大疑点"],
];

/**
 * 收益承诺式的口语表达。
 * 由规划师问答实测发现：模型讲「还债省利息」时说成「每还掉一元就等于白赚 13.03%」——
 * 数学上站得住，但「白赚」是承诺式措辞，不该出现在我们的输出里。
 *
 * 只在**未被引号包裹**时拦截：模型转述广告原文「他说稳赚不赔」是正确引用，不能改；
 * 模型自己说「稳赚」才是越界。
 */
const PROMISE_WORDS = ["白赚", "净赚", "躺赚", "稳赚", "包赚", "准赚", "轻松赚", "闭眼赚"];
const QUOTE_CHARS = new Set(["「", "」", "“", "”", '"', "'", "『", "』", "《", "》"]);

function stripPromiseWords(input: string): { text: string; hits: string[] } {
  let text = input;
  const hits: string[] = [];
  for (const w of PROMISE_WORDS) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(w, from);
      if (i === -1) break;
      const before = text[i - 1] ?? "";
      const after = text[i + w.length] ?? "";
      // 前后紧邻引号 → 视为引用原文，放行
      if (QUOTE_CHARS.has(before) || QUOTE_CHARS.has(after)) {
        from = i + w.length;
        continue;
      }
      hits.push(w);
      const to = "（此处原有收益承诺式表述，已按合规要求移除）";
      text = text.slice(0, i) + to + text.slice(i + w.length);
      from = i + to.length;
    }
  }
  return { text, hits };
}

/** 具体标的代码：6 位 A 股代码、6 位基金代码 */
const TICKER_RE = /(?<![\d.])(\d{6})(?![\d.])/g;

export interface GuardResult {
  text: string;
  violations: string[];
  /** 模型引入的、原文中不存在的数字 */
  inventedNumbers: string[];
  /** 命中过多或出现编造数字时，应放弃模型输出、改用模板 */
  shouldFallback: boolean;
}

/** 数字与百分比：用于检测模型是否引入了原文之外的"事实" */
const NUMBER_RE = /\d+(?:\.\d+)?\s*(?:[%％]|万元|万|亿|元|倍|个月|年|天|期)/g;

/** 常识性表述里允许出现的数字，不算编造 */
const NUMBER_ALLOWLIST = ["100%", "0%", "1倍", "12个月", "1年", "50万元", "50万"];

/**
 * 检测模型输出中的"凭空数字"。
 * 我们的模型只负责转述已有判定，一旦它自己补出一个市场数据（如"大额存单才2%"），
 * 就属于不可核实的事实主张——宁可丢弃整段模型输出，也不把它展示给用户。
 */
function findInventedNumbers(output: string, source: string): string[] {
  const src = source.replace(/\s/g, "");
  const found = new Set<string>();
  for (const m of output.matchAll(NUMBER_RE)) {
    const token = m[0].replace(/\s/g, "");
    if (NUMBER_ALLOWLIST.includes(token)) continue;
    // 原文里出现过这个数字（或其纯数字部分紧邻同一单位）即视为转述
    const digits = token.match(/\d+(?:\.\d+)?/)?.[0] ?? "";
    if (src.includes(token) || (digits && src.includes(digits))) continue;
    found.add(token);
  }
  return [...found];
}

export function guardOutput(
  input: string,
  opts?: { maskTickers?: boolean; sourceText?: string },
): GuardResult {
  const violations: string[] = [];
  let text = input;

  for (const [re, to] of REWRITE) {
    text = text.replace(re, (m) => {
      violations.push(m);
      return to;
    });
  }

  const promise = stripPromiseWords(text);
  text = promise.text;
  violations.push(...promise.hits);

  if (opts?.maskTickers !== false) {
    text = text.replace(TICKER_RE, (m) => {
      violations.push(`标的代码 ${m}`);
      return "【代码已隐去】";
    });
  }

  const inventedNumbers = opts?.sourceText ? findInventedNumbers(text, opts.sourceText) : [];

  return {
    text,
    violations,
    inventedNumbers,
    shouldFallback: violations.length >= 4 || inventedNumbers.length > 0,
  };
}
