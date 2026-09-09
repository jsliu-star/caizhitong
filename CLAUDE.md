@AGENTS.md

# 财智通 · 项目宪法

**所有终端、所有 agent 在动手前必须读完本文件。** 违反「合规红线」或「文件归属」的改动一律作废。

---

## 1. 这是什么

面向理财小白与易受骗人群的**金融安全智能体**。

> Slogan：我们不保证你赚钱，但保证你不被骗。

- **参赛**：北京大学「金融 AI 智能体创新大赛」· 方向三（金融 AI 智能体行业场景落地）
- **官方评分重心**：方案的**商业可行性与场景适配度**
- **提交时间**：2026-09-09（**两天后**，一切取舍以此为准）
- 完整产品需求见 `PRD.md`（797+ 行，是本项目的唯一需求源）

### 三个 Tab 与用户旅程

```
Tab A /shield    安全盾    先别被骗   ★ 核心，差异化所在
Tab B /translate 翻译官    再看得懂
Tab C /plan      规划师    才敢规划
```

顺序即价值主张：**防骗在最前面**。

---

## 2. 🔴 合规红线（最高优先级，任何情况下不得越界）

判断基准：**推荐具体标的 = 证券投资咨询业务，须持牌；风险提示与投教 = 监管鼓励。**
我们没有牌照，因此：

### 绝对禁止出现在任何页面、任何文案、任何模型输出里

| 禁止 | 说明 |
|---|---|
| 推荐具体股票 / 基金 / 理财产品 | 含名称、代码、管理人。**连举例都不行** |
| 预测涨跌、指导择时 | 「会涨」「该买入」「现在是低点」 |
| 承诺或暗示收益 | 「预期年化 X%」「稳健收益」「保本」 |
| 声称某产品或机构「安全」「可靠」「正规」 | 我们只能说「未识别到违规表述特征」 |
| 对广告作「是否诈骗」的法律定性 | 只能说「命中 N 条监管明令禁止的表述特征」 |
| 编造数字、法条、统计数据、案例 | **一个都不许编**。见 §7 |

### 允许且鼓励

- 术语翻译、条款解读、知识科普
- 广告「风险体检」：对照监管违规情形识别话术陷阱（属投资者保护）
- 大类资产配置**思路科普**：只讲品类与比例原则，不指向具体产品
- 纯计算工具（IRR、应急金、目标可行性）
- 引用监管公开信息并标注来源

### 写文案时的措辞规范

- ❌「这是诈骗」→ ✅「该内容命中 N 条监管明令禁止的表述特征」
- ❌「这个产品安全」→ ✅「未识别到违规表述特征。这不构成对该产品的安全性保证」
- ❌「建议配置 20% 股票基金」→ ✅「权益类参考比例 20%」
- 每个功能页底部必须有免责声明（照抄现有页面的写法）

---

## 3. 核心架构：判定归规则，转述归模型

```
① 视觉识别   模型   OCR 提取原文
② 规则比对   规则   14 类特征 / 314 关键词（高精度）
③ 语义识别   模型   覆盖口语与变体（高召回），引文必须真实存在
④ 主体核查   规则   资质、性质、渠道疑点 + 官方核查入口
⑤ 法规引证   规则   为每条命中调取法规条文
⑥ 汇总裁决   模型   把客观判定转述成大白话
   输出审查   规则   六类越界表述硬拦截 + 编造数字检测
```

**风险等级、命中项、法规依据全部由确定性规则产生，模型只负责「提取」和「讲人话」。**
新增任何模型调用时，必须保持这个原则：模型的输出要么可验证（引文比对），要么经过审查层。

三道防线（`lib/rules/guard.ts`）：
1. 提示词禁止引入原文之外的事实
2. 输出审查层确定性拦截 + 编造数字检测（出现即整段丢弃）
3. 超时兜底；`green` 档一律用模板措辞，不让模型开口

---

## 4. 可直接复用的东西（不要重复实现）

### 图表（`components/viz/index.tsx`）
```tsx
import { Donut, Radar, Gauge, PathChart, StatTile, CAT } from "@/components/viz";

<Donut slices={[{label:"存款", value:40}]} centerValue="20%" centerLabel="权益类占比" />
<Radar axes={[{label:"承受能力", value:0.7, hint:"…"}]} color="var(--brand-600)" />
<Gauge value={0.62} display="62" label="风险承受综合得分" />
<PathChart xLabels={["现在","1年"]} yFormat={n=>`${n}万`} series={[{label:"路径", points:[1,2], color:"var(--cat-1)"}]} />
<StatTile label="真实年化" value="13.03%" tone="danger" />
```
分类色**固定顺序不循环**：`--cat-1 … --cat-5`（已过 dataviz 验证器五项检查）。
tritan 分离度偏低，**所有分类色使用处必须配直接标签**作二次编码。

### 共享用户档案（`lib/profile.ts`）
```ts
import { loadProfile, saveProfile, RISK_META, DEMO_PROFILE } from "@/lib/profile";
```
三个 Tab 共读共写，是「智能体协作」的载体。存 localStorage，读写都要 try/catch。
字段：`riskType / riskScore / conflicts / knowledge{level,points,cleared,weakTerms} / encountered / debtApr / emergencyMonths / goals`

### 规则引擎（`lib/rules/`）
```ts
import { analyzeText, matchPatterns, checkElements, riskLevel, contextAt, normalize } from "@/lib/rules/match";
import { checkEntity } from "@/lib/rules/entity";
import { guardOutput } from "@/lib/rules/guard";   // 所有模型自由文本输出前必须过这一层
import { redact } from "@/lib/rules/redact";       // 进模型前脱敏
import { findTerms, findKeyPoints, TERMS } from "@/lib/rules/glossary";
```

### 模型适配层（`lib/llm/`）
```ts
import { getProvider } from "@/lib/llm";
const p = getProvider();          // 无 key 时自动返回 mock，isMock=true
await p.extractFromImage(dataUrl);
await p.summarize(prompt, onDelta);
```
**永远不要直接 fetch 模型 API**，一律走适配层。无 key 时产品必须仍能完整演示。

### 计算与规划（`lib/finance.ts`、`lib/plan/`）
```ts
import { installmentIrr, emergencyFund, fmtMoney, fmtPct } from "@/lib/finance";
import { QUESTIONS, nextQuestion, scoreAnswers, findConflicts } from "@/lib/plan/questions";
import { buildAllocation, assessGoal, requiredRate, fmtMoneyCN } from "@/lib/plan/allocation";
```

### 知识库（`data/`，纯 JSON，可版本控制可溯源）
| 文件 | 内容 |
|---|---|
| `violation-patterns.json` | 违规话术特征库 + 否定/科普语境 + 术语白名单 |
| `regulations.json` | 法规条文库（`verified:false` 表示原文待核对） |
| `glossary.json` | 术语表 24 条 + 关键点规则 |
| `scam-cases.json` | 骗局图鉴 8 张 + **骗局剧本 playbook** |
| `directions.json` | 投资方向科普 9 类 |
| `traps.json` | 按用户画像定向推送的陷阱提醒 |
| `samples.json` | 自制仿真演示样本（含 `public/demo/` 三张图） |
| `market-snapshot.json` | 市场基准快照（数值待填，`verified:false` 时只能定性表述） |

---

## 5. 设计系统

- **配色**：深绿 + 浅绿。全部走 CSS 变量，**不要硬编码颜色**
  - 品牌：`brand-50 … brand-950`（`bg-brand-800` `text-brand-900` …）
  - 文字：`text-ink` `text-ink-soft` `text-ink-mute`
  - 表面：`bg-paper` `bg-paper-soft`，描边 `border-line`
  - 风险语义：`risk-red` / `risk-amber` / `risk-green`（安全档复用品牌深绿）
  - 图表分类：`cat-1 … cat-5`，网格 `grid`
- **只做浅色主题**，不要加 dark mode（演示环境要可预测）
- **不得引用任何外链资源**：图片、字体、CDN 全部禁止。Google Fonts 在国内会让构建挂掉。需要插画就写内联 SVG
- 字号用方括号写法（`text-[15px]`）保持与现有页面一致；圆角 `rounded-xl` / `rounded-2xl`；卡片 `border border-line bg-paper p-5`
- 移动端优先：手机要能扫码用（答辩现场靠这个）
- 老年人友好：`/shield` 有「放大字号」开关（`document.body.dataset.large`）

### 文案风格（很重要，这是产品的一部分）
- 大白话，像耐心的晚辈跟长辈解释。**不说教、不吓唬、不堆感叹号**
- 短句。专业词第一次出现要就地解释
- 敢下判断，但判断必须有依据。宁可说「我们只能检查它说了什么，检查不了它实际做什么」
- 不要「赋能」「闭环」「抓手」这类词

---

## 6. 测试（改完必须跑）

```bash
npm test              # 全部，49+ 项断言
npm run test:rules    # 违规话术库回归 27 例 —— 改 data/violation-patterns.json 或 lib/rules/match.ts 后【必须】跑
npm run test:guard    # 输出审查层 10 例 —— 改 guard.ts 后必须跑
npm run test:finance  # IRR / 应急金
npm run test:plan     # 自适应分支 / 定级 / 矛盾发现 / 配置 / 目标推演
npm run build         # 提交前必须通过
```

**误判比漏判更致命。** 现场演示时一次误判（把正规产品判成骗局）比没有 demo 更糟。
新增关键词后，务必用 `data/samples.json` 里的**正规产品对照样本**验证仍判 green。

---

## 7. 🔴 不许编造

- **法条**：`data/regulations.json` 全部 `verified:false`、`officialText:null`。
  只能展示 `gist`（要义概述）并标注「条文原文待核对」。**不要自己填 officialText**
- **统计数据**：涉案金额、受害人数等必须有公开来源链接，没有就留空并标 TBD
- **市场数据**：`market-snapshot.json` 数值为 `null` 时，文案只能用定性表述
  （「远高于银行存款的常见水平」），**不得写具体数字**
- **案例**：`scam-cases.json` 的 `cases` 字段留空待补真实公开报道，**不许编故事**
- **演示样本**：公开演示只用 `data/samples.json` 与 `public/demo/` 的自制仿真样本。
  **不得使用可识别到真实公司的截图**——公开指认真实企业「涉嫌违法」有名誉风险

---

## 8. 并行开发规则（多终端同时工作时）

**一个文件只能有一个所有者。** 见 `docs/tasks/` 下的任务书，每份都写明了归属。

| 区域 | 所有者 |
|---|---|
| `lib/**`（除 `lib/plan/**`）、`app/api/shield/**`、`app/shield/**`、`components/shield/**`、`data/violation-patterns.json`、`data/scam-cases.json` | **任务 A（安全盾）** |
| `app/translate/**`、`components/translate/**`、`app/api/translate/**`、`data/quiz.json`、`data/glossary.json` | **任务 B（翻译官）** |
| `app/page.tsx`、`app/profile/**`、`components/home/**`、`app/layout.tsx` | **任务 C（首页与档案）** |
| `docs/**`、`data/regulations.json`、`data/market-snapshot.json` | **任务 D（素材与核对）** |
| `app/plan/**`、`components/plan/**`、`lib/plan/**`、`data/directions.json`、`data/traps.json` | 已完成，**只读** |
| `components/viz/**`、`lib/profile.ts`、`app/globals.css`、`lib/types.ts` | **共享基础设施，一律只读** |

**需要改别人的文件时**：不要改。在自己的任务书里写下「需要 X 文件增加 Y」，由人工协调。

**不要碰**：`package.json`（除非新增测试脚本）、`node_modules`、`.env.local`、`AGENTS.md`。

**不要 git commit / push**，除非被明确要求。

---

## 9. 环境

- Node 22 / npm 10 / Next 16（App Router，Turbopack）/ React 19 / Tailwind v4
- 开发：`npm run dev`（3000 被占用时会自动用 3001）
- 模型：`.env.local` 里的 `DASHSCOPE_API_KEY`（阿里云百炼）。
  默认 `qwen-vl-plus`（视觉，1.7s）+ `qwen-flash`（文本，1.9s）——**实测选型，为演示速度而定**
- `api.anthropic.com` 在大陆不可达，所以不用 Claude 做产品内的模型调用
- npm 走 `.npmrc` 里的国内镜像
