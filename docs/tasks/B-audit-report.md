# 全站移动端与无障碍走查报告

> 走查人：任务 B 终端 · 2026-09-07 · **只读走查，除我自己的文件外没有改动任何代码**
> 复查方式全部写在每条下面，改完可自己验。

## 方法与范围

- **实测**：本机 dev server（`localhost:3001`）逐页拉取渲染后的 HTML，检查标题层级、`aria-*`、`viewport`、固定字号出现次数。覆盖 `/`、`/shield`、`/translate`、`/plan`、`/profile`、`/shield/cases`，六页全部 200。
- **静态检查**：`app/**`、`components/**` 全量 grep（点击目标尺寸、未加断点的栅格、`whitespace-nowrap`、固定像素宽度、`overflow-x` 容器、`outline-none`、`onClick` 挂载元素）。
- **对比度**：按 WCAG 相对亮度公式实算 `app/globals.css` 里**实际成对使用**的 26 组前景/背景（含 `/70` `/80` 透明度混合后的实际色值），不是目测。
- **未做**：真机触摸测试、读屏软件实测（VoiceOver/TalkBack）。下面凡属推断的地方都标了「推断」。

## 摘要

| # | 问题 | 严重度 | 归属 |
|---|---|---|---|
| 1 | 「放大字号」开关**实际不生效** | 🔴 P0 | 共享 `globals.css` + 任务 A（开关）/ 任务 C（入口） |
| 2 | `DEMO_PROFILE.cleared` 的 id 对不上题库，示例档案载入后闯关页不显示已通关 | 🔴 P0 | 任务 C（`lib/profile.ts`） |
| 3 | `--ink-mute` 正文对比度 3.81–4.08:1，不达 4.5 | 🟠 P1 | 共享 `globals.css` |
| 4 | 6 个输入框 `outline-none` 且全站零焦点环，键盘用户看不到焦点 | 🟠 P1 | 任务 A（1 处）/ `plan`（3 处，已冻结）/ 我（2 处，已修） |
| 5 | `--line` 卡片描边 1.27:1，几乎看不见 | 🟠 P1 | 共享 `globals.css` |
| 6 | 13px 及以下正文共 189 处，是老年人场景的实际字号下限 | 🟠 P1 | 全体 |
| 7 | 用户粘贴内容的引文缺 `break-words`，长串会撑破卡片 | 🟡 P2 | 任务 A |
| 8 | 圆角小按钮高约 30px，低于 44px 触摸目标建议 | 🟡 P2 | 任务 A（4 处）/ 我（已修） |
| 9 | 共享 `Radar` 的轴标签被 SVG 自身盒子裁掉，**安全盾报告页也中招且无兜底** | 🟠 P1 | 共享 `components/viz` + 任务 A（`Report.tsx`）|

---

## 1. 🔴「放大字号」开关实际不生效

**现象**：`/shield` 的「放大字号」按钮把 `document.body.dataset.large` 置为 `"1"`，`globals.css` 对应规则是：

```css
body[data-large="1"] { font-size: 19px; line-height: 1.85; }
```

但全站有 **406 处** `text-[Npx]` 直接写在元素上（`text-[13px]` 141 处、`text-[14px]` 83 处、`text-[15px]` 58 处…）。元素自身的 `font-size` 优先于 `body` 的继承值，所以这些文字**一个都不会变大**。渲染后单页仍带固定字号的类名：首页 130 处、`/translate` 71 处、`/plan` 57 处、`/shield` 25 处、`/profile` 13 处。真正会变大的只有少数没写字号类的元素。

**影响**：这是 PRD 里点名的老年人友好特性，答辩现场如果评委按一下发现没反应，比没有这个功能更糟。

**建议改法**（两天内唯一现实的一行解，归属：共享 `globals.css`，需人工拍板）：

```css
body[data-large="1"] { zoom: 1.18; }   /* 替换现有的 font-size / line-height */
```

`zoom` 会触发重排（不同于 `transform: scale`，后者会造成横向溢出），px 写死的字号也会跟着放大。**改完必须在 375px 宽复测一遍横向滚动**——这是唯一的副作用风险点。

**顺带两点**（都在 P0 的同一个功能上）：
- 开关只在 `/shield` 有。`data-large` 写在 `body` 上，客户端路由切页不会重置，所以从 `/shield` 打开后去别的页仍然生效，但**别的页没有关闭入口**。建议把开关提到 `app/layout.tsx` 的 header（任务 C）。
- 刚才看到 `lib/profile.ts` 已新增 `loadLargeText/saveLargeText`（带 localStorage 持久化），但目前**全站没有任何地方调用它**（`grep` 结果为空）。持久化那半已经做好了，接上就行。

**怎么验**：开开关，看 `/translate` 的正文是否变大；然后 375px 宽度下确认页面不横向滚动。

---

## 2. 🔴 示例档案的通关 id 对不上题库

**现象**：`lib/profile.ts` 的 `DEMO_PROFILE.knowledge.cleared = ["quiz-term-1"]`，而题库 `data/quiz.json` 的五个关卡 id 是 `term-1 / term-2 / scam-1 / scam-2 / sense-1`。没有 `quiz-` 前缀。

**影响**：答辩演示点「载入示例档案」后，翻译官闯关页的「已通关 0/5」——积分 120 分显示正常，通关记录却是空的，看起来像功能坏了。这是纯粹的 id 拼写不一致，不是逻辑问题。

**建议改法**（归属：任务 C，`lib/profile.ts` 一行）：

```diff
- cleared: ["quiz-term-1"],
+ cleared: ["term-1", "scam-1"],
```

顺便建议：`points: 120` 恰好是「不好骗」等级的门槛，配 `["term-1","scam-1"]` 两关正好讲得通（术语一关 50 + 反诈一关 70），演示时数字对得上。

**怎么验**：`/profile` 点「载入示例档案」→ 去 `/translate` 看「已通关 2/5」，两张关卡卡片带 ✓。

---

## 3. 🟠 `--ink-mute` 正文对比度不达标

实算结果（WCAG 普通文字要求 4.5:1）：

| 组合 | 对比度 | |
|---|---|---|
| `text-ink-mute` / `bg-paper`（白） | 4.08 | ❌ |
| `text-ink-mute` / `bg-paper-soft` | 3.90 | ❌ |
| `text-ink-mute` / `bg-brand-50` | 3.81 | ❌ |
| `text-ink-mute/80` / 白（页脚） | 2.90 | ❌ |
| `placeholder:text-ink-mute/70` | 2.42 | ❌ |

`ink-mute` 不是装饰色，它承载的是**免责声明、法规要义、原文引文、页脚**——恰恰是合规上最需要被看见的那些字。

**建议改法**（共享 `globals.css` 一行）：

```diff
- --ink-mute: #6b8378;
+ --ink-mute: #60766c;   /* 白底 4.88 / paper-soft 4.66 / brand-50 4.55，三种底色全部达标 */
```

这是保持原色相与饱和度、只压亮度得到的**最浅达标值**，视觉变化很小。透明度写法（`/70` `/80`）建议直接去掉——换成实色即可，本来也没有叠加需求。

---

## 4. 🟠 键盘焦点不可见

6 个输入框写了 `outline-none`，全站 `focus-visible` / `focus:ring` / `focus:outline` 命中数为 **0**。焦点态只有一个 `focus:border-brand-400` 的边框变色，而 brand-400 对白底只有 3.00:1，且 1px 边框在小屏上几乎看不出来。

位置：`app/shield/page.tsx:315`（任务 A）、`components/plan/Calculators.tsx:9`、`components/plan/Assessment.tsx:105`、`components/plan/Result.tsx:221`（`plan/**` 已冻结，需人工决定动不动）、`components/translate/dict.tsx` 与 `translator.tsx`（我的，已修）。

**建议改法**（每处加两个类，我已在 `dict.tsx` 上做了示范）：

```
focus-visible:border-brand-600 focus-visible:ring-2 focus-visible:ring-brand-300
```

按钮不受影响——`<button>` 保留了浏览器默认 outline，Tailwind preflight 不会移除它。

---

## 5. 🟠 卡片描边几乎不可见

`--line: #d8e8e0` 对白底 **1.27:1**，对 `paper-soft` 1.21:1。非文字界面元素的建议下限是 3:1。

这可能正是「全站文字过密」观感的来源之一：卡片之间没有可见的边界，几百行文字看起来是连成一片的。

**建议**（共享 `globals.css`，**需人工拍板，会明显改变全站观感**）：
- 严格达标 3:1 需要 `#5d9e7d`——太重了，会像描了绿框，不建议。
- 折中：`#94c0aa`（白底 2.02:1）或 `#b3d2c3`（1.62:1）。我倾向 `#b3d2c3`，肉眼能分出卡片边界，又不抢文字。
- 或者不动颜色，改用背景色差分卡片（卡片 `bg-paper` + 页面 `bg-paper-soft` 已经是这个思路，只是差值太小）。

这条不改也能交付，列出来是因为它便宜且对观感提升明显。

---

## 6. 🟠 小字号占比偏高

`text-[12px]` 27 处 + `text-[12.5px]` 4 处 + `text-[13px]` 141 处 + `text-[13.5px]` 17 处 = **189 处 ≤13.5px**。在放大开关修好之前，这就是老年人实际看到的字号。

**建议**（各自负责的页面）：13px 只留给纯装饰性标签（分类 chip、"h 单位"），凡是**要读的句子**——免责声明、法规要义、原文引文、错题解释——至少 14px。我自己这一页的解释文案已经是 14px。

---

## 7. 🟡 用户粘贴内容的引文缺 `break-words`

全站 `break-words` / `break-all` 只有 1 处（我的 `judge.tsx`）。中文会自然换行，所以大部分文案没问题；有风险的是**用户粘贴的内容原样回显**的地方：`components/shield/Report.tsx:89` 的 `「<Highlight …>」`、`:324` 的 `「{e.clause}」`、`:395` 的 `已出现「{e.evidence}」`。如果用户粘进来的广告里带一串长 URL 或产品编码（样本里就有 `C1234567890` 这种），会把卡片撑破，进而横向滚动整页。

**建议**：给这几处的 `<p>` 加 `break-words`（一个类）。

**已确认安全**：`Report.tsx:490` 的原文展开块用了 `<pre className="… overflow-auto whitespace-pre-wrap">`，长串在 pre 内部滚动，不会影响页面 —— 这是正确写法。

---

## 8. 🟡 圆角小按钮触摸目标偏小（推断，未真机测）

`px-3 py-1.5 text-[13px]` 算下来约 30px 高，低于 44px 的常见建议值。位置：`app/shield/page.tsx:288 / 295 / 433`、`components/shield/Report.tsx:267`。

**建议**：`py-1.5` → `py-2` 并加 `min-h-9`（36px）。完全达到 44px 会让 chip 行变得很占地方，36px 是我在自己页面上采用的折中值。

（我自己的三处 `py-1.5` 已改完：词典分类 chip、「考我一下」按钮。`grep py-1.5 components/translate/*.tsx` 现在为 0。）

---

## 查过、确认没问题的（别在这上面花时间）

- ✅ `viewport` 是 `width=device-width, initial-scale=1`，**没有** `maximum-scale` / `user-scalable=no`——系统级缩放可用，这在老年人场景里比我们自己的字号开关更常用。
- ✅ 六个页面各有且仅有 1 个 `<h1>`。
- ✅ **所有 `onClick` 都挂在 `<button>` 上**，全站没有 `div`/`span` 假按钮，键盘可达性没有硬伤。
- ✅ 没有任何未加断点的 `grid-cols-3` 及以上。
- ✅ `PathChart` 的 `min-w-[520px]` 包在 `overflow-x-auto` 里——宽图表自己滚，页面不滚，写法正确。
- ✅ 顶部导航 `overflow-x-auto`，窄屏可横向滑动，正确。
- ✅ `@media (prefers-reduced-motion: reduce)` 已关掉 `.cd-in` / `.cd-pulse`。
- ✅ 图表尺寸在 375px 下不溢出：卡片内宽约 303px（375 − 页面 `px-4` 32 − 卡片 `p-5` 40），Radar 260 / Donut 220 / Gauge 148–180 均放得下。
  ⚠️ **但 Radar 的轴标签会被裁**——见下面第 9 条。我原先把「`/profile` 已单独处理过标签越界」记在这一节，
  当作已解决；实际上那只是 `/profile` 一处的绕法，同一个缺陷在 `/plan` 和 `/shield` 上仍然存在。**这条我判断错了，已改写成第 9 条。**
- ✅ 所有图表 `<svg>` 都有 `role="img"` + `aria-label`；装饰性元素都标了 `aria-hidden`（`/shield/cases` 有 179 处）。
- ✅ 风险语义色对比度全部达标：`risk-red` on `risk-red-bg` 5.72、`risk-amber` on `risk-amber-bg` 4.92、`risk-green` on `brand-50` 8.24。深绿系文字全部达标（`brand-600` 白底 6.10、`brand-800` 白底 11.81、白字 on `brand-800` 11.81）。
- ✅ 图表分类色作为**图形填充**达 3:1（cat-3 3.19、cat-5 3.68 是最低的两个，仍达标）；全站没有把 `cat-*` 当文字色用，所以 4.5 的门槛不适用。

## 9. 🟠 共享 `Radar` 的轴标签被 SVG 自身盒子裁掉

**这条是任务 C（ai-dd）在补测窄屏时实测发现的，我独立复算确认，并把范围推广了一步。**

**成因**（`components/viz/index.tsx` 的 `Radar`）：轴标签画在 `c ± (R+20)`，也就是紧贴 viewBox 边缘；
`textAnchor` 在 `|cos(角度)| > 0.3` 时取 `start`/`end`，于是整段文字从贴边处**向画布外**排；
而 SVG 默认 `overflow: hidden`。**所以它跟视口宽度无关，桌面端一样裁**——裁的是 SVG 自己的盒子。

**判据不是「4 轴」，是 `|cos(角度)| > 0.3` 且标签够长。** 按 `size=260`、`R=96`、`fontSize=12`
（中文按 1em/字算）复算，三个调用点全部中招：

| 调用点 | 轴数 | 被裁标签 | 文字横跨 | viewBox | 裁掉 |
|---|---|---|---|---|---|
| `components/plan/Result.tsx:111` | 4 | 风险意愿（east） | 246.0 → 294.0 | 0..260 | 右 34px |
| 同上 | 4 | 金融知识（west） | −34.0 → 14.0 | 0..260 | 左 34px |
| `components/shield/Report.tsx:156` | 5 | 资质可核验（east） | 240.3 → 300.3 | 0..260 | **右 40px** |
| 同上 | 5 | 情感操控（west） | −28.3 → 19.7 | 0..260 | **左 28px** |
| `app/profile/page.tsx:241` | 4 | — | — | — | 已用绕法规避 |

我算出的 34px 与 ai-dd 用 headless Chrome + CDP 实测的 34px 完全一致（他们量的是
「风险意愿」624..672 vs SVG 盒子 378..638），所以这套几何推算可以信。

**⚠️ 比原报告范围更大的一点**：ai-dd 只测了 `/plan` 和 `/profile`，因此结论写成「4 轴时」。
但安全盾报告页的雷达是 **5 轴**（收益承诺 / 资质可核验 / 渠道正规 / 紧迫压迫 / 情感操控，
见 `lib/rules/radar.ts`），5 轴同样满足 `|cos|>0.3`，而且标签更长——**裁得比 4 轴更多（40px）**。
`components/shield/Report.tsx:156` 的 Radar 外层**没有** `/profile` 那个 overflow 绕法，
所以**安全盾报告页的雷达图现在是裁着的**。这是答辩要出镜的那张图，优先级因此比 ai-dd 判断的更高。

**建议改法**

- **今天能做的（一行 class，各所有者自己改）**：照 `/profile` 的绕法，给 Radar 外层容器加
  `[&_svg]:overflow-visible` 并留出左右内边距：
  ```
  <div className="flex justify-center px-8 sm:px-14 [&_svg]:overflow-visible">
  ```
  归属：`components/shield/Report.tsx`（任务 A）、`components/plan/Result.tsx`（`plan/**` 已冻结，需人工定）。
- **真正的修法（共享只读文件，需人工拍板）**：在 `Radar` 里把 viewBox 横向放宽，
  例如 `viewBox={\`-44 0 ${size + 88} ${size}\`}` 并同步 `width`，让标签有地方待，
  三个调用点一次性解决，不必每处再贴绕法 class。我没有改 `components/viz`。

**顺带一条同源问题（ai-dd 实测，我未复算）**：`PathChart` 的序列终点标签也被裁——
「3% 假设下的路径」横跨 1007..1101，而 SVG 盒子到 1063 为止；终点标签画在 `x(n-1)+6`，
但 `PAD.r` 只有 58 单位，放不下中文标签。外层 `overflow-x-auto` 帮不上忙，因为 SVG 是按 `w-full` 缩放的。
建议加大 `PAD.r` 或把终点标签移进图例。同属共享只读文件。

## 一处需要人工判断的边界

`disabled:bg-brand-200` 上的白色文字只有 1.49:1，几乎读不出来（首页 CTA、各页提交按钮的禁用态）。禁用控件不受 WCAG 对比度要求约束，所以**不算违规**；但「翻译成人话」这类按钮在没输入时就是禁用态，是用户第一眼看到的样子。若要改，`disabled:bg-brand-200 disabled:text-brand-700`（9.7:1）比白字好读，也仍然看得出是禁用。归属：各页自己。

---

## 复现

```bash
npm run dev                    # 3000 被占用会自动用 3001
# 逐页看渲染后的结构
curl -s http://localhost:3001/translate | grep -o "<h[12][^>]*>"
# 数固定字号
grep -ro 'text-\[[0-9.]*px\]' app components | wc -l
# 对比度：本报告的算法是标准 WCAG 相对亮度公式，26 组配对的脚本在走查过程中即时生成，未落库
```

### 375px 横向溢出：已由任务 C 实测补齐（2026-09-07 当日）

我这份走查里的窄屏结论是**按源码几何推断**的，写报告时标了「未真机验证」。
任务 C（ai-dd）随后用 headless Chrome + CDP 实测量过，方法是比对
`document.documentElement.scrollWidth` 与 `innerWidth`，并单独量 `header nav` 的
`scrollWidth - clientWidth`。结果：

- 375px 下 `/`、`/profile`、`/shield`、`/shield/cases` **均无横向滚动**
- 开启大字号（`zoom: 1.18`）后导航内部会横向滚动 28px，但开关始终可见
- 320px + 大字号时，导航最后一项「档案」会被裁掉一点——已记为已知取舍

这也实测确认了 P0-1 的 `zoom` 方案有效：写死的 `text-[13px]` 确实跟着放大。
任务 C 随后补测了 `/translate` 与 `/plan`，**六个页面全部实测完毕，无一页停留在推断**：
三档（375px 常规 / 375px 大字号 / 320px 大字号）下 `documentElement.scrollWidth == innerWidth`，
无页面级横向滚动。我点名的三个风险点也都在**渲染出来之后**才量的——`/translate` 是用 CDP
点进闯关题目里量的（选项卡片长文本已渲染），`/plan` 是注入 `caidun.plan.answers.v1` 让
`Result`/`PathChart` 真的画出来才量的（第一次没注入等于没测到图表，这个细节值得记下）。
`PathChart` 的 `min-w-[520px]` 容器在 375px + 大字号下内滚 284px，页面本身不滚——写法是对的。

**结论：横向溢出一项全部通过，只剩 320px + 大字号时导航裁掉「档案」一处已知取舍。**
但这一轮同时暴露了一个与窄屏无关的真问题，见上面第 9 条。
