/**
 * 小通的台词。集中放在这里，改文案不用碰组件。
 *
 * 写台词的规矩（和全站一致，见 CLAUDE.md §2、§5）：
 * - 不推荐产品、不预测涨跌、不承诺收益，不说「这是诈骗」「这个安全」
 * - 不写任何没有来源的数字、统计、案例
 * - 大白话、短句，像晚辈跟长辈说话；不说教，不吓唬，不堆感叹号
 */
import type { MascotMood } from "./Mascot";

export interface Line {
  mood: MascotMood;
  text: string;
}

/** 按当前时间打招呼。每个会话只说一次 */
export function timeGreeting(d = new Date()): Line {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m >= 23 * 60 || m < 5 * 60)
    return { mood: "sleepy", text: "夜深了。深夜最容易被「限时」「今天截止」催着做决定——明天再说也来得及。" };
  if (m < 9 * 60) return { mood: "wave", text: "早上好！今天也帮你把把关。" };
  if (m < 11 * 60 + 30) return { mood: "wave", text: "上午好，有看不懂的随时丢给我。" };
  if (m < 13 * 60 + 30) return { mood: "happy", text: "中午好。吃饭时刷到的「理财群」，先别急着进。" };
  if (m < 18 * 60) return { mood: "wave", text: "下午好，有什么想查的？" };
  return { mood: "wave", text: "晚上好。睡前刷到的广告，可以贴给我看看。" };
}

/** 每个页面第一次进来时随机挑一句 */
export const ROUTE_LINES: Record<string, Line[]> = {
  "/": [
    { mood: "wave", text: "看不懂的词、可疑的话，都可以直接问我。" },
    { mood: "look", text: "截图也行。丢进上面的框里，我陪你一条条看。" },
    { mood: "wink", text: "不知道从哪开始？点下面一个案例试试。" },
  ],
  "/learn": [
    { mood: "cheer", text: "来闯关啦！答错了也没关系，错的地方我会讲清楚。" },
    { mood: "wave", text: "闯关卡在哪个词上了？问我就行。" },
  ],
  "/learn/cases": [
    { mood: "worry", text: "这些套路都有固定的推进顺序。认出第一步，后面就不容易上当。" },
    { mood: "look", text: "看到眼熟的话术？可以把原话贴给我。" },
  ],
  "/plan": [
    { mood: "wave", text: "想先聊聊再做测评？点我。" },
    { mood: "happy", text: "我不推荐产品，但可以陪你把钱分成几份想清楚。" },
  ],
  "/profile": [
    { mood: "wave", text: "这份档案只存在你自己的浏览器里。" },
    { mood: "wink", text: "不知道档案怎么用？问我。" },
  ],
};

/** 空闲时偶尔冒一条小贴士。每条都是定性提醒，不带数字 */
export const TIPS: Line[] = [
  { mood: "worry", text: "看到「保本保息」四个字，先停一下：正规理财产品不允许这样承诺。" },
  { mood: "wink", text: "「名额有限、今日截止」是在催你。正规产品不靠催。" },
  { mood: "look", text: "收益越高，风险越大。只说收益、不提风险的宣传，本身就不完整。" },
  { mood: "happy", text: "看不懂的产品，先别买。看懂了，再说。" },
  { mood: "worry", text: "要你先交「解冻金」「保证金」才能提现的，先停手，找家人商量。" },
  { mood: "look", text: "群里晒的收益截图，改一张只要几秒钟。" },
  { mood: "wink", text: "「老师带单」不收钱？那对方想要的，是你接下来的钱。" },
  { mood: "happy", text: "家里长辈接到「客服」电话，教他们一句：先挂掉，自己回拨官方电话。" },
  { mood: "look", text: "让你加私人微信、进「内部群」的，都要多留个心眼。" },
  { mood: "happy", text: "理财不着急。今天没想清楚的事，明天再决定也不迟。" },
];

/** 戳一下小通的反应，按顺序轮着来 */
export const POKES: Line[] = [
  { mood: "surprise", text: "哎呀，吓我一跳！" },
  { mood: "shy", text: "别戳啦，有点痒。" },
  { mood: "wink", text: "被你发现我在偷看了。" },
  { mood: "cheer", text: "今天也要守住钱包！" },
  { mood: "love", text: "谢谢你来看我。" },
  { mood: "happy", text: "我在呢，有事就问。" },
];

/** 打盹被吵醒 */
export const WAKE_LINES: Line[] = [
  { mood: "surprise", text: "啊！我没睡着，真的。" },
  { mood: "surprise", text: "你回来啦！" },
];

/** 聊天里的寒暄：本地直接回，不调模型 */
export const SMALL_TALK: Array<{ re: RegExp; line: Line }> = [
  {
    re: /^(谢谢|感谢|多谢|谢啦|thx|thanks)/i,
    line: { mood: "love", text: "不客气！以后看到拿不准的，随时贴给我。" },
  },
  {
    re: /^(再见|拜拜|bye|下次见|晚安)/i,
    line: { mood: "wave", text: "拜拜！记住一句：拿不准的事，先停一下再决定。" },
  },
  {
    re: /(你真棒|真厉害|好厉害|好可爱|真可爱|聪明|好棒|牛)/,
    line: { mood: "shy", text: "嘿嘿，被你夸得不好意思了。其实我只是把监管的规矩记得比较牢。" },
  },
  {
    re: /^(哈哈|嘿嘿|好的|好嘞|嗯|ok|收到|明白了|懂了)/i,
    line: { mood: "happy", text: "好嘞！还有想问的，接着问就行。" },
  },
];

/** 页面上发生的事，让小通在右下角冒一句。由 mascotSay() 派发 */
export const MASCOT_EVENT = "caidun:mascot";

export function mascotSay(line: Line) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Line>(MASCOT_EVENT, { detail: line }));
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
