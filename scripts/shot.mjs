/**
 * 页面截图工具（开发用）。复用本机已安装的 Chrome，不下载 Chromium。
 * 用法: node scripts/shot.mjs <url> <输出文件> [等待选择器] [视口宽] [视口高]
 */
import puppeteer from "puppeteer-core";

const [url, out, waitFor, w = "1440", h = "1000"] = process.argv.slice(2);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--hide-scrollbars", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: Number(w), height: Number(h), deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

if (waitFor && waitFor !== "-") {
  try {
    await page.waitForSelector(waitFor, { timeout: 45000 });
    await new Promise((r) => setTimeout(r, 1200)); // 等动画收尾
  } catch {
    console.error(`  ⚠️ 等不到选择器 ${waitFor}，仍然截图`);
  }
}

const box = await page.evaluate(() => ({
  scrollH: document.documentElement.scrollHeight,
  scrollW: document.documentElement.scrollWidth,
  innerW: window.innerWidth,
}));
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`  ✅ ${out}  高 ${box.scrollH}px  横向溢出: ${box.scrollW > box.innerW ? `是（${box.scrollW}>${box.innerW}）` : "无"}`);
