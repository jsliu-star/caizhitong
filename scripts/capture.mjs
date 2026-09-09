/**
 * 按区块截取产品图（用于 PPT）。
 * 通过标题文字定位所在 section，只截该区块，避免大片留白。
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const OUT = process.argv[2];
const BASE = process.argv[3] ?? "http://localhost:3003";
fs.mkdirSync(OUT, { recursive: true });

const JOBS = [
  // [文件名, 路径, 定位标题(留空=截首屏), 等待选择器]
  ["01-识别首屏", "/", "", null],
  ["02-人话版", "/?demo=sample-red-classic", "人话版", "文字:风险条目"],
  ["03-风险条目", "/?demo=sample-red-classic", "风险条目", "文字:风险条目"],
  ["04-五维画像", "/?demo=sample-red-classic", "在哪几路上做手脚", "文字:风险条目"],
  ["05-骗局剧本", "/?demo=sample-red-classic", "接下来会发生什么", "文字:风险条目"],
  ["06-主动追问", "/?demo=sample-red-classic", "补充一下，重新判一遍", "文字:风险条目"],
  ["07-术语交互", "/?demo=sample-red-classic", "原文里的术语", "文字:风险条目"],
  ["08-法规依据", "/?demo=sample-red-classic", "法规依据原文", "文字:风险条目"],
  ["09-学习首屏", "/learn", "", null],
  ["10-骗局图鉴", "/learn/cases", "", null],
  ["11-风险画像", "/plan?demo=1", "你的风险画像", "svg"],
  ["12-矛盾发现", "/plan?demo=1", "打架的地方", "svg"],
  ["13-方向走势", "/plan?demo=1", "有哪些方向", "svg"],
  ["14-配置环图", "/plan?demo=1", "大类资产配置", "svg"],
  ["15-品类优先级", "/plan?demo=1", "先做什么，后做什么", "svg"],
  ["16-定向陷阱", "/plan?demo=1", "冲你来的", "svg"],
  ["17-计算器", "/plan?demo=1", "分期真实年化计算器", "svg"],
  ["18-共享档案", "/profile", "", null],
];

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--hide-scrollbars", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 2 });

let lastUrl = "";
for (const [name, path, heading, waitFor] of JOBS) {
  const url = BASE + path;
  if (url !== lastUrl) {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
    if (waitFor && waitFor !== "-") {
      try {
        if (waitFor.startsWith("文字:")) {
          const needle = waitFor.slice(3);
          await page.waitForFunction(
            (n) => document.body.innerText.includes(n),
            { timeout: 90000, polling: 500 },
            needle,
          );
        } else {
          await page.waitForSelector(waitFor, { timeout: 60000 });
        }
      } catch {
        console.log(`  ⚠️ 等待「${waitFor}」超时，继续`);
      }
    }
    await new Promise((r) => setTimeout(r, 2500));
    lastUrl = url;
  }

  const file = `${OUT}/${name}.png`;
  if (!heading) {
    await page.screenshot({ path: file });
    console.log(`  ✅ ${name} (首屏)`);
    continue;
  }

  const handle = await page.evaluateHandle((h) => {
    const els = [...document.querySelectorAll("h1,h2,h3,p,button span,span")];
    const hit = els.find((e) => e.textContent && e.textContent.includes(h));
    if (!hit) return null;
    return hit.closest("section") ?? hit.parentElement;
  }, heading);

  const el = handle.asElement();
  if (!el) {
    console.log(`  ⬜ ${name}（未找到「${heading}」）`);
    continue;
  }
  await el.scrollIntoView();
  await new Promise((r) => setTimeout(r, 350));
  try {
    await el.screenshot({ path: file });
    const box = await el.boundingBox();
    console.log(`  ✅ ${name}  ${Math.round(box.width)}×${Math.round(box.height)}`);
  } catch (e) {
    console.log(`  ⬜ ${name} 截图失败: ${e.message.slice(0, 50)}`);
  }
}
await browser.close();
