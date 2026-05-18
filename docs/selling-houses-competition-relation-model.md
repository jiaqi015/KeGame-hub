# 卖房 Competition / Co-Sale 合同

最后整理：2026-05-18

竞品不是 `rivalPressure` 数字，而是由房源、客户重合、组织关系、价格动作和市场事件共同形成的关系网络。本文件同时承接旧“竞争与联卖”文档，不再保留两份竞争真相。

## 1. 竞争主链

```text
market / listing / customer / organization source
  → competition causal event
  → broker actor knowledge
  → competition belief / pressure
  → available command
  → action / organization receipt
  → runtime feedback
```

## 2. 竞争对象

| 对象 | 含义 |
| --- | --- |
| `RivalListing` | 与当前房源争同一批需求的房源 |
| `CompetitionRelation` | 本房与竞品之间的持续关系 |
| `CustomerOverlap` | 两套房命中同一批客户的程度 |
| `RivalAction` | 竞品调价、推广、成交、撤盘、抢客 |
| `CoSaleRelation` | 同 ACN 内的协作关系 |
| `CompetitionPressure` | actor-visible 的竞争压力投影 |

## 3. 竞争来源

- 同商圈 / 同小区 / 同价位 / 同户型相似。
- 客户比较列表重合。
- 竞品最近调价、推广、成交、撤盘。
- 跨品牌经纪人抢同一批客户。
- 同 ACN 联卖协作进展。
- 市场 cell 热度和供给变化。

## 4. 竞争 vs 联卖

| 场景 | 口径 |
| --- | --- |
| 跨品牌成交你的目标客户 | 丢客 / 竞争失败 |
| 跨品牌成交同类房源 | 竞品压力增强 |
| 同 ACN 客源端成交你的房源 | 联卖成交，需做双边归因 |
| 同 ACN 房源端维护失败 | 协作风险，不等同竞品失败 |
| 组织提报聚焦会 | organization source + command + receipt |

## 5. POV 边界

broker POV 能看到：

- 与自己房源有关的竞品动作。
- 客户明确比较过的竞品。
- 组织允许可见的联卖信息。
- 公开市场变化。

broker POV 不能看到：

- 其他经纪人的完整私有客户池。
- rival broker 的内部策略。
- hidden shadow demand 全量真相。

## 6. 推荐动作

竞争压力只能通过 decision chain 生成动作：

```text
actor knowledge
  → competition belief
  → pressure
  → command
```

典型 command：

- 做竞品反馈
- 调整价格建议
- 提报聚焦会
- 发起联卖协作
- 定向补客源
- 推进客户比较后的二看 / 面谈

## 7. Timeline 要求

竞品区不能只显示当前 PK。必须能展示相关行为时间线：

- 竞品上架
- 竞品调价
- 竞品推广
- 竞品成交
- 竞品撤盘
- 客户比较
- 本房采取的应对动作
- 本房应对后的 receipt

## 8. 反模式

- `rivalPressure` 单字段直接驱动 UI。
- “暂无竞品”掩盖底层世界太小或未 ingestion。
- 同 ACN 联卖被算成跨品牌竞争失败。
- 竞品推荐动作没有 source / causal refs。
- 竞品时间线不是 live causal，而是页面拼文案。
