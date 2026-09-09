# 任务 B · 翻译官游戏化

> 开工前必读 `/CLAUDE.md`（项目宪法）。**合规红线与「不许编造」两节尤其重要。**

## 目标

`/translate` 现在只有「条款翻译 + 术语词典」，太单薄。要把它做成**小白愿意反复打开的学习入口**，
并让学习结果写进共享档案，影响另两个 Tab 的讲解深度。

## 为什么重要（评分角度）

- 方向三考察「场景适配度」：投教是银行、券商、高校的**监管义务**，游戏化是他们最缺的手段
- 共享档案的读写是「多智能体协作」最直观的证据
- 答辩演示需要一个**轻松、有互动、评委自己想上手玩**的环节，缓和反诈部分的沉重感

## 你拥有的文件（只有你能改）

```
app/translate/**
components/translate/**        （新建）
app/api/translate/**
data/quiz.json                 （新建）
data/glossary.json
docs/tasks/B-translate-game.md （本文件，可追加进度与协调请求）
```

## 只读，不许改

`components/viz/**`、`lib/profile.ts`、`lib/types.ts`、`app/globals.css`、`lib/rules/**`、`lib/llm/**`、
`app/shield/**`、`app/plan/**`、`data/violation-patterns.json`、`data/samples.json`

## 要做的四件事

### B1. 知识闯关（题库 + 答题机）

新建 `data/quiz.json`。三个关卡类别：

| 类别 id | 名称 | 题目重点 |
|---|---|---|
| `term` | 术语关 | 年化、业绩比较基准、封闭期、风险等级、IRR、复利…（词表见 `data/glossary.json`） |
| `scam` | 反诈关 | 给一段广告文案，判断「有没有问题 / 问题在哪」 |
| `sense` | 常识关 | 存款 vs 理财、先还债还是先理财、应急金、分散、杠杆 |

题目结构（**严格照此，别自创字段**）：

```json
{
  "version": "0.1",
  "levels": [
    {
      "id": "term-1",
      "category": "term",
      "name": "术语关 · 第一关",
      "passScore": 3,
      "questions": [
        {
          "id": "q-term-benchmark",
          "stem": "产品写着「业绩比较基准 3.2%」，这句话的意思是？",
          "options": [
            { "id": "a", "text": "到期至少能拿到 3.2%", "correct": false },
            { "id": "b", "text": "管理人给自己定的参考目标，不是承诺", "correct": true },
            { "id": "c", "text": "同类产品的平均收益", "correct": false }
          ],
          "explain": "业绩比较基准是管理人自己设的参考目标，既不是承诺也不是保底。实际到手可能远低于它，甚至亏本金。",
          "linkTerm": "业绩比较基准",
          "points": 10
        }
      ]
    }
  ]
}
```

要求：
- **每关 5 题，共 4–5 关**（术语 2 关、反诈 2 关、常识 1 关），合计 20–25 题
- 每题必须有 `explain`——答错时立刻展示，这是产品价值所在
- `linkTerm` 填 `data/glossary.json` 里已有的术语名，答错则写入档案的 `weakTerms`
- 反诈关的题干**可以从 `data/samples.json` 的仿真文本里节选**，也可自己编写仿真文案，
  但**不得使用真实公司名**（用「XX 财富」这类虚构名）
- 题目里不得出现任何具体股票/基金/理财产品名称或代码

### B2. 骗局识别测试（与 AI 对比，这是亮点）

一个独立模式：给出 5 段文案（3 段有问题 + 2 段正规），用户逐段判断「有问题 / 没问题」。
提交后调用 `POST /api/translate/judge`（**你新建**，可直接在服务端 `import { analyzeText } from "@/lib/rules/match"`，
这是只读调用，不算改别人的文件），把**用户的判断和规则引擎的判定并排展示**：

```
第 3 段    你：没问题    财智通：🔴 高风险（命中「保本承诺」）    ✗
```

结尾给一句总结：「你和财智通的判断在 5 段中有 4 段一致。你漏掉的那一段，特征是……」

**注意**：正规样本一定要有，且必须判绿——如果引擎把正规样本判成红，说明规则库有误判，
**不要改规则库**（那是任务 A 的文件），把问题写进本文件末尾的「协调请求」。

### B3. 积分、等级与错题本

- 积分与通关记录写入共享档案：`saveProfile({ knowledge: { ...prev, points, cleared, weakTerms } })`
- **必须先 `loadProfile()` 再合并**，不要整体覆盖 `knowledge`（会抹掉规划师写的 `level`）
- 五个等级，按累计积分：

| 积分 | 等级 |
|---|---|
| 0 | 刚上路 |
| 50 | 看得懂 |
| 120 | 不好骗 |
| 220 | 会算账 |
| 350 | 能护家人 |

- 等级徽章用**内联 SVG** 自绘（禁止外链图片），深绿配色，复用 `--brand-*` 变量
- 「我的薄弱术语」区块：把 `weakTerms` 在术语词典里高亮置顶，并提示「规划师和安全盾也会按这个调整讲解深度」

### B4. 术语词典升级

- 按 `data/glossary.json` 里的内容加**分类筛选**（自己给 24 条术语加 `group` 字段：活钱/固收/权益/费用/风险/工具）
- 搜索保留
- 每条术语加「考我一下」按钮，直接跳到对应题目

## 视觉要求

- 现在全站文字过密，**你这一页要明显更「轻」**：进度环、徽章、答对/答错的即时反馈、卡片式题面
- 复用 `components/viz` 的 `Gauge`（当进度环）与 `StatTile`
- 不要引入任何动画库，用 CSS（`globals.css` 里已有 `.cd-in` 淡入和 `.cd-pulse`）
- 移动端必须可用（答辩现场评委用手机玩）

## 验收标准

- [ ] `npm run build` 通过，`npm test` 不变绿变红
- [ ] 20–25 道题，每题有 `explain`
- [ ] 答错立刻出解释，且术语写入 `weakTerms`
- [ ] 积分与通关持久化（刷新页面不丢），localStorage 读写包 try/catch
- [ ] 骗局识别测试能展示「你 vs 财智通」的并排对比
- [ ] 正规样本被判为 green（若不是，写协调请求，不要自己改规则库）
- [ ] 页面底部有免责声明
- [ ] 手机宽度下不横向滚动

## 进度（2026-09-07 完成）

四项全部落地，`npm run build` 与 `npm test` 通过（新增 `npm run test:quiz`，419 项断言）。

| 文件 | 说明 |
|---|---|
| `data/quiz.json` | 新建。5 关 25 题（术语 2 关、反诈 2 关、常识 1 关），每题必有 `explain`；13 题带 `linkTerm`。另含 `judgeSet`（B2 的五段文案） |
| `data/glossary.json` | 24 条术语各加 `group` 字段（活钱 3 / 固收 2 / 权益 5 / 费用 2 / 风险 6 / 工具 6） |
| `app/api/translate/judge/route.ts` | 新建。只读 `analyzeText`，服务端实时判定五段文案 |
| `app/translate/page.tsx` | 改为四模式同页切换：知识闯关 / 骗局识别测试 / 条款翻译 / 术语词典 |
| `components/translate/state.ts` | 等级表、计分、共享档案合并写入 |
| `components/translate/badge.tsx` | 等级徽章（内联 SVG，无外链） |
| `components/translate/quiz.tsx` | 答题机 + 关卡列表 + 结算（Gauge 当进度环、StatTile 三联） |
| `components/translate/judge.tsx` | 「你 vs 财智通」并排对比 |
| `components/translate/dict.tsx` | 词典分类筛选 + 薄弱术语置顶 + 「考我一下」跳题 |
| `components/translate/translator.tsx` | 原条款翻译功能抽成组件 |
| `tests/quiz.test.ts` | 新建。题库结构 / 词典分类 / 五段文案的真实判定 / 措辞红线 |
| `package.json` | 只加了 `test:quiz` 一行并接到 `test` 末尾 |

设计上的两个决定，答辩时值得讲：

1. **B2 的判定结果不预存在题库里**，每次由 `/api/translate/judge` 现算。所以页面上「财智通怎么判」
   一定是引擎的真实输出——规则库一改，这里立刻跟着变，不会出现「题库写着红、引擎实际判绿」。
   期望值写在 `tests/quiz.test.ts` 里当哨兵：两段正规样本一旦被误判成非 green，测试立刻红。
2. **积分口径**：题库 300 分 + 识别测试 50 分 = 满分 350，正好等于最高等级「能护家人」的门槛。
   想到最高级，必须去和财智通比一场。识别测试只为「进步」计分（best 提升的差额），既不能刷分，
   也不会因第一次手气差就永远差 30 分。

`judgeSet` 五段的引擎实测判定：j1=red、j2=green、j3=red、j4=green、j5=yellow
（3 段有问题 + 2 段正规，**两段正规样本均判 green，未发现误判**）。

## 追加（同日，应队友请求）

任务 B 四项验收之外又做了三件事，都在自己的归属范围内：

1. **全站移动端与无障碍走查** → `docs/tasks/B-audit-report.md`。只读走查，8 条问题 2 个 P0。
   任务 A 已照单全改（含共享 `globals.css` 的三处 token / zoom 修复），任务 C 已真机复测窄屏。
2. **定向微课**（`components/translate/microlesson.tsx` + `data/quiz.json` 的 `microLessons`）。
   读共享档案的 `encountered`，按用户在安全盾**实际遇到过**的特征推送对应科普，
   **16 条覆盖规则库全部 16 个特征**，每条带「依据：安全盾在你分析过的内容里识别到「X」特征」
   并可一键跳到对应题目。特征名称从 `violation-patterns.json` 的 `type` 只读取值，规则库改名不会对不上。
3. **跳过已通关关卡**。闯关列表顶部「继续闯关」直接指向第一个未通关的关卡，
   已通关的弱化并标「已通关，可跳过」，仍可重做（不重复计分）。

第 2、3 条是为了让 `/profile` 上任务 C 写的三条联动说明**真的成立**——那一页的价值全在
「写的每一条都真的做了」。三条现在都是真的（第 1 条 weakTerms 置顶原本就有）。
`npm run test:quiz` 从 419 项扩到 **611 项**，新增断言覆盖：微课 patternId 必须真实存在、
linkQuestion 必须是真实题目、16 个特征必须全覆盖、微课正文同样过措辞红线。
所以这三条联动以后被改坏会测试报红，不会悄悄退化成虚报。

另外替任务 D 做了 **D4 案例检索** → `docs/research-cases-b.md`（不属于本任务范围，
文件是新建的、归我写）。八类骗局全部找到官方来源（最高法/最高检/证监会），8/8，附原文关键表述
与可直接落库的 `cases` JSON。两处脱敏警告写在文件里，合并时必看。

## ⚠️ 跨文件契约（改 data/quiz.json 前必看）

任务 C 的 `app/profile/linkage.ts:7` 现在 **`import quizData from "@/data/quiz.json"`**，
建了 `patternId → title` 的映射，档案页显示的微课标题是从这里实时读出来的
（这样我改微课文案，档案页自动跟上，不会出现「/profile 说推送 A、翻译官实际推 B」）。

**所以这三个键名是对外契约，不能随便改：**
`microLessons.items[]` · `.patternId` · `.title`

改结构前先看 `app/profile/linkage.ts` 会不会跟着挂。`npm run test:quiz` 会守住
「字段存在且非空」，但守不住「键名被改」——那属于要人工确认的事。
反过来，任务 C 那侧不硬编码标题，我这侧测试保证 patternId/linkQuestion 真实存在，两头都不靠人记。

## 协调请求（写在这里，由人工转达给任务 A）

1. **`lib/rules/glossary.ts` 的 `Term` 接口建议补 `group: string`**（不阻塞）。
   `data/glossary.json` 的 24 条术语已加 `group`，但那个接口是任务 A 的文件，我没有改，
   目前在 `components/translate/dict.tsx` 里本地 `type DictTerm = Term & { group: string }` 兜着。
   任务 A 有空时把字段加进接口即可，加了之后我这边的本地类型可以删掉。

2. **规则库的口语化漏判（不是误判，不影响演示，供参考）**。写 B2 样本时实测发现两处：
   - `vp-deposit-confusion` 只覆盖「跟存款一样 / 相当于定期 / 存款级」这类固定说法，
     但「这个跟存款差不多的」「本金不会有事」「都是银行在卖的」这种熟人口语一条都不命中。
     我最后把样本改成了含「相当于定期」的写法才判红。
   - `vp-private-traffic` 有「扫码进群」，但「扫码进内部交流群」（中间插了字）不命中；
     「加我个人微信」同理。
   语义通道（任务 A 的模型侧）大概能覆盖，纯规则跑分时会漏。**没有发现任何正规样本被误判**——
   这一点两段对照样本已在 `tests/quiz.test.ts` 里持续把关。
