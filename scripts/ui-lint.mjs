/**
 * UI 规范检查。规则取自 botool 开发规范（botool-开发流程参考/05-claude-rules自动加载规则/ui-components.md）
 * 里适用于本项目的部分；那份规范面向 @botool/ui monorepo，组件库相关的条款这里不适用。
 *
 * 用法：npm run test:ui     有违规时退出码 1
 *
 * 只扫 app/ 与 components/ 下的 .tsx。注释行跳过。
 * 确属特例时在行尾加 `// ui-lint-ok: 理由`。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const RULES = [
  {
    id: "emoji-icon",
    title: "不用 emoji 做图标，改用 components/ui/Icon",
    re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u,
  },
  {
    id: "palette-color",
    title: "不用 Tailwind 调色板色 / white / black，改用 globals.css 里的 token",
    re: /\b(?:bg|text|border|ring|from|to|via|fill|stroke)-(?:white|black|(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b/,
  },
  {
    id: "hardcoded-hex",
    title: "className 里不写 hex 颜色",
    re: /className=[^>]*#[0-9a-fA-F]{3,8}\b/,
  },
  {
    id: "banned-font-weight",
    title: "字重只用 normal / medium / semibold / bold",
    re: /\bfont-(?:thin|extralight|light|extrabold|black)\b/,
  },
  {
    id: "arbitrary-shadow",
    title: "阴影只用 shadow-card / shadow-raised / shadow-pop",
    re: /\bshadow-\[/,
  },
  {
    id: "native-dialog",
    title: "不用原生 alert / confirm / prompt",
    re: /(?<![\w.])(?:window\.)?(?:alert|confirm)\(|window\.prompt\(/,
  },
  {
    id: "dark-variant",
    title: "只做浅色主题，不写 dark: 变体",
    re: /\bdark:/,
  },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const files = ["app", "components"].flatMap((d) => walk(join(ROOT, d)));
const hits = [];
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*")) return;
    if (line.includes("ui-lint-ok")) return;
    for (const r of RULES) {
      if (r.re.test(line)) hits.push({ file: relative(ROOT, f), line: i + 1, rule: r, text: t.slice(0, 120) });
    }
  });
}

if (hits.length === 0) {
  console.log(`✓ UI 规范检查通过（${files.length} 个文件，${RULES.length} 条规则）`);
  process.exit(0);
}
for (const h of hits) console.log(`✗ ${h.file}:${h.line}  [${h.rule.id}] ${h.rule.title}\n    ${h.text}`);
console.log(`\n共 ${hits.length} 处违规`);
process.exit(1);
