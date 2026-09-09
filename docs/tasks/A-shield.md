# 任务 A · 安全盾丰富（主终端进行中）

## 已完成
六阶段流水线、双通道识别（规则 314 关键词 + 语义通道）、三层误判防护、
主体核查、法规引证、输出审查层、演示样本与仿真图。

## 本轮要做
1. **骗局剧本预测**——识别出类型后，告诉用户「接下来他会这样做」（`data/scam-cases.json` 的 `playbook` 已就绪）
2. **五维风险雷达**——收益承诺 / 资质可核验性 / 渠道正规性 / 紧迫压迫 / 情感操控
3. **AI 主动追问**——信息不足时反问用户，追问后重算风险（真 Agent 行为）
4. **骗局图鉴页 `/shield/cases`**——8 张卡片 + 运作机制 SVG 图解
5. **给家人看的提醒卡**——可保存的结论摘要

## 拥有的文件
`lib/**`（除 `lib/plan/**`）、`app/api/shield/**`、`app/shield/**`、`components/shield/**`、
`data/violation-patterns.json`、`data/scam-cases.json`、`data/samples.json`

## 待接收
- 任务 D 的 `docs/scam-cases-draft.md`（真实案例）→ 落进 `data/scam-cases.json` 的 `cases` 字段
