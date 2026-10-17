/**
 * 决赛新增：发给家人（规则拼出的固定措辞）+ 语音识别接口 + WAV 编码。
 * 全部在演示模式下跑（不调用模型、不花钱），结果确定。
 *
 * 「发给家人」的消息会离开产品、被转发，所以它必须和页面一样守合规红线：
 * 每一种结论都要能通过输出审查层，不出现「是诈骗」「安全」「保本」之类的定性或承诺。
 */
process.env.LLM_PROVIDER = "mock";
process.env.SHIELD_NO_BEAT = "1";

let fail = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (!cond) fail += 1;
  console.log(`  ${cond ? "✅" : "❌"} ${name}${cond ? "" : `  ${detail}`}`);
};

async function main() {
  const { POST: shield } = await import("@/app/api/shield/route");
  const { POST: asr } = await import("@/app/api/asr/route");
  const { __resetLimits } = await import("@/lib/server/limits");
  const { buildFamilyMessage } = await import("@/lib/report/share");
  const { guardOutput } = await import("@/lib/rules/guard");
  const { encodeWav, speakable, clipsOf } = await import("@/lib/speech");
  const { POST: tts } = await import("@/app/api/tts/route");
  const samples = (await import("@/data/samples.json")).default.samples as Array<{ id: string; text: string }>;
  type Report = import("@/lib/types").ShieldReport;

  __resetLimits();
  let ip = 0;
  const check = async (text: string): Promise<Report> => {
    ip += 1;
    const res = await shield(
      new Request("http://local/api/shield", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": `7.7.7.${ip}` },
        body: JSON.stringify({ kind: "text", text, mode: "risk" }),
      }),
    );
    return (await res.text())
      .split("\n\n")
      .map((c) => c.trim())
      .filter((c) => c.startsWith("data:"))
      .map((c) => JSON.parse(c.slice(5).trim()))
      .find((e) => e.stage === "report")?.report;
  };

  console.log("\n=== 发给家人：每种结论的措辞 ===");
  const red = await check(samples.find((s) => s.id === "sample-red-classic")!.text);
  const green = await check(samples.find((s) => s.id === "sample-green-legit")!.text);
  const story = await check(
    "警方提醒：近期有不法分子在微信群里散布这样的宣传——「【鑫利财富】国资背景，保本保息！年化收益 15%，每月分红。名额仅剩 20 个，今日截止。」，以所谓高额回报为诱饵骗取钱财。切勿相信这类话术。",
  );
  ok("三段样本都拿到了报告", Boolean(red && green && story));
  const cases: Array<[string, Report, RegExp]> = [
    ["高风险", red, /命中 \d+ 类监管明令禁止的表述特征/],
    ["未命中", green, /未识别到违规表述特征。这不构成对该产品的安全性保证/],
    ["讲骗局", story, /在讲骗局（提醒或报道），不是在推销/],
  ];
  for (const [name, report, expect] of cases) {
    const msg = buildFamilyMessage(report);
    ok(`${name}：结论措辞正确`, expect.test(msg), msg);
    ok(`${name}：附反诈咨询与报警电话`, msg.includes("96110") && msg.includes("110"));
    ok(`${name}：说明只检查表述、不判断产品`, msg.includes("只检查宣传说了什么，不判断产品本身"));
    ok(`${name}：不作诈骗定性`, !/是诈骗|是骗局|是骗子|肯定是骗/.test(msg), msg);
    // 消息里原样引用了原文开头（可能含「保本」等原文用词），审查时去掉引文再查
    const own = msg.replace(/「[^」]*」/g, "");
    const g = guardOutput(own);
    ok(`${name}：自己的措辞通过输出审查层`, g.violations.length === 0 && !g.shouldFallback, g.violations.join("、"));
  }
  ok("本机地址不附链接", !buildFamilyMessage(red).includes("http"));
  ok("给了链接就附在最后一行", buildFamilyMessage(red, { link: "自己也可以查：https://x.example" }).endsWith("https://x.example"));
  const longRed = { ...red, text: "保".repeat(200) };
  ok("原文摘录截断，不把整段原文发出去", buildFamilyMessage(longRed).includes("…") && buildFamilyMessage(longRed).length < 400);

  console.log("\n=== 语音识别接口 ===");
  __resetLimits();
  const post = (body: unknown, raw?: string) =>
    asr(
      new Request("http://local/api/asr", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "6.6.6.6" },
        body: raw ?? JSON.stringify(body),
      }),
    );
  const wav = `data:audio/wav;base64,${Buffer.from(encodeWav(new Float32Array(16000), 16000)).toString("base64")}`;
  const mock = await post({ audio: wav });
  const mockJson = await mock.json();
  ok("演示模式 → 503，提示改为打字", mock.status === 503 && mockJson.code === "NO_ASR" && mockJson.error.includes("打字"), `${mock.status} ${JSON.stringify(mockJson)}`);
  ok("不是 WAV → 400", (await post({ audio: "data:text/html;base64,PGh0bWw+" })).status === 400);
  ok("空录音 → 400", (await post({ audio: "data:audio/wav;base64,AAAA" })).status === 400);
  ok("超过 30 秒的量 → 413", (await post({ audio: `data:audio/wav;base64,${"A".repeat(2_000_001)}` })).status === 413);
  ok("坏 JSON → 400", (await post(null, "{nope")).status === 400);

  console.log("\n=== WAV 编码与朗读文本 ===");
  const bytes = encodeWav(new Float32Array([0, 1, -1, 0.5]), 16000);
  const v = new DataView(bytes.buffer);
  ok("WAV 头：RIFF / WAVE / 16kHz / 单声道 / 16bit", Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString() === "WAVE" && v.getUint32(24, true) === 16000 && v.getUint16(22, true) === 1 && v.getUint16(34, true) === 16);
  ok("WAV 数据长度 = 采样数 × 2", v.getUint32(40, true) === 8 && bytes.length === 44 + 8);
  ok("满幅采样不溢出", v.getInt16(46, true) === 0x7fff && v.getInt16(48, true) === -0x8000);
  ok("朗读前去掉排版符号", speakable("**命中**「保本」《广告法》") === "命中保本广告法");

  console.log("\n=== 小通的声音（/api/tts，演示模式） ===");
  const say = (text: unknown) =>
    tts(new Request("http://local/api/tts", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "8.8.8.8" }, body: JSON.stringify({ text }) }));
  ok("空文字 → 400", (await say("")).status === 400);
  ok("超长 → 413", (await say("字".repeat(301))).status === 413);
  const noTts = await say("你好呀，我是小通。");
  ok("演示模式没有语音合成 → 503 NO_TTS（前端退回系统语音）", noTts.status === 503 && (await noTts.json()).code === "NO_TTS");
  const clips = clipsOf(["第一句。", "第二句。", "很长".repeat(40) + "。"], 20);
  ok("按段合并：不超长的句子并在一起，超长的单独成段", clips.length === 2 && clips[0] === "第一句。第二句。");
  ok("按段合并：文字一个不丢", clips.join("") === "第一句。第二句。" + "很长".repeat(40) + "。");

  console.log(fail ? `\n=== ${fail} 项失败 ===` : "\n=== 全部通过 ===");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
