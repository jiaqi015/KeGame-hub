# 卖房（资产顾问）市场事件目录

这份文档解决的是：

> 市场到底会发生哪些标准事件，它们怎么和时间、地区、房子、客户、业主发生关系。

市场模型不能只是一个“热度”数字。
一定要落到事件目录。

---

## 0. 一句话结论

我建议把市场事件分成 5 层：

1. `Macro`
2. `District`
3. `BizArea`
4. `Segment`
5. `Calendar`

每个事件至少都要回答 9 个问题：

1. 事件名
2. 作用层级
3. 什么时候更容易发生
4. 哪些地区更容易发生
5. 打到哪类房
6. 打到哪类客户
7. 打到哪类业主
8. 改哪些字段
9. 持续多久

---

## 1. 事件字段模板

每个事件建议都按下面结构定义：

| 字段 | 含义 |
| ---- | ---- |
| `eventCode` | 事件编码 |
| `name` | 事件名 |
| `layer` | Macro / District / BizArea / Segment / Calendar |
| `scope` | 命中的空间范围 |
| `timeAffinity` | 时间偏好 |
| `probabilityRule` | 发生条件与概率规则 |
| `caseTargets` | 更容易命中的房源类型 |
| `customerTargets` | 更容易命中的客户类型 |
| `ownerTargets` | 更容易命中的业主类型 |
| `fieldImpacts` | 改哪些字段 |
| `modelImpacts` | 影响 D1/D2/D3 或价格模型什么 |
| `durationDays` | 持续天数 |

---

## 2. 事件总表

| 事件名 | 层级 | 时间偏好 | 地区偏好 | 房子影响 | 客户影响 | 业主影响 | 主要改动 | 持续 |
| ---- | ---- | -------- | -------- | -------- | -------- | -------- | -------- | ---- |
| 市场情绪转强 | Macro | 季初、政策松动后 | 全城 | 主流盘更受益 | 活跃客户增加 | 业主更敢守价 | demandIndex、confidence | 14-30 天 |
| 市场情绪转弱 | Macro | 季末、政策收紧后 | 全城 | 高总价盘更受伤 | 客户更犹豫 | 业主更焦虑或更僵 | demandIndex、pricePressure | 14-30 天 |
| 某区需求升温 | District | 月内热点期 | 指定 district | 对该区主流盘有利 | 偏好该区客户更活跃 | 业主更有信心 | districtDemandIndex | 7-21 天 |
| 某区需求转弱 | District | 淡季、舆情后 | 指定 district | 对该区普通盘不利 | 外溢到其他区 | 业主松动度上升 | districtDemandIndex | 7-21 天 |
| 商圈流量上升 | BizArea | 周末、活动周 | 指定 bizArea | 看房便利房受益 | 到访客户增多 | 业主更愿试动作 | exposure、viewingRate | 3-10 天 |
| 商圈流量下降 | BizArea | 工作周、天气差 | 指定 bizArea | 依赖线下到访的房受伤 | 带看减少 | 业主开始怀疑动作效果 | exposure、matterHitRate | 3-7 天 |
| 刚需总价带走强 | Segment | 学区季、换房窗口 | 指定总价带 | 刚需盘明显受益 | 预算内客户推进变快 | 业主更敢守价 | segmentLiquidity | 14-30 天 |
| 改善总价带转弱 | Segment | 宏观承压期 | 高总价区更明显 | 高总价盘推进变慢 | 改善客户决策拉长 | 业主更焦虑 | segmentLiquidity、dealFeasibility | 14-30 天 |
| 周末开放日窗口 | Calendar | 周五到周日 | 交通便利板块更强 | 适合做开放日的房受益 | 自来客、比较型客户更容易进入看房 | 业主更容易接受开放日 | openDayTraffic、viewingModeWeight | 2-3 天 |
| 节后回流窗口 | Calendar | 长假后 7-14 天 | 全城 | 积压盘有补量机会 | 咨询量回升 | 业主预期回暖 | inboundLeads、activityLevel | 7-14 天 |
| 天气不利看房 | Calendar | 极端天气 | 户外到访依赖区更明显 | 线下带看受影响 | 客户更倾向延后 | 业主耐心下降 | showingCompletionRate | 1-3 天 |
| 同类成交示范 | Segment | 有标杆成交后 | 同商圈、同产品 | 相似优质房受益 | 客户信心上升 | 业主预期两极化 | marketEstimatedPrice、confidence | 5-14 天 |

---

## 3. 逐类展开

## 3.1 Macro 级事件

### 3.1.1 市场情绪转强

| 项 | 内容 |
| -- | ---- |
| 触发条件 | 宏观利好、信贷改善、成交连续走强 |
| 命中房源 | 主流总价带、适销户型、刚需盘先受益 |
| 命中客户 | 犹豫型客户、刚需客户更容易推进 |
| 命中业主 | 原本焦虑的业主更愿意先守价 |
| 改字段 | `MarketState.demandIndex`、`CustomerRuntimeState.activityLevel`、`CustomerCaseRelation.confidence` |
| 影响模型 | D1 上升，价格模型压力下降 |

### 3.1.2 市场情绪转弱

| 项 | 内容 |
| -- | ---- |
| 触发条件 | 宏观承压、政策收紧、成交连续走弱 |
| 命中房源 | 高总价、改善盘、议价空间小的盘更受伤 |
| 命中客户 | 预算边缘客户更观望 |
| 命中业主 | 强势业主前期嘴硬，后期焦虑上升 |
| 改字段 | `MarketState.demandIndex`、`PriceModel.pricePressure`、`CustomerCaseRelation.stagnationDays` |
| 影响模型 | D1 下降，`dealFeasibility` 下降 |

---

## 3.2 District 级事件

### 3.2.1 某区需求升温

| 项 | 内容 |
| -- | ---- |
| 触发条件 | 区域热点、板块话题、交通利好 |
| 命中房源 | 该区主流产品和性价比盘 |
| 命中客户 | 原本就看这个区的客户 |
| 命中业主 | 该区业主信心上升 |
| 改字段 | `districtDemandIndex`、`CustomerCaseRelation.intent` |
| 影响模型 | D1、D2 小幅上升 |

### 3.2.2 某区需求转弱

| 项 | 内容 |
| -- | ---- |
| 触发条件 | 区域负面消息、供给突然增加 |
| 命中房源 | 普通盘先受伤，稀缺盘抗压更强 |
| 命中客户 | 浅关系客户容易流走 |
| 命中业主 | 配合度弱的业主更容易僵住 |
| 改字段 | `districtDemandIndex`、`rivalPressure`、`stagnationDays` |
| 影响模型 | D1 下降，价格压力上升 |

---

## 3.3 BizArea 级事件

### 3.3.1 商圈流量上升

| 项 | 内容 |
| -- | ---- |
| 触发条件 | 商圈活动、周末客流、门店集中动作 |
| 命中房源 | 临近地铁、容易参观、适合开放日的房 |
| 命中客户 | 比较型和周末看房客户 |
| 命中业主 | 对开放日犹豫的业主更容易被说服 |
| 改字段 | `CaseRuntime.exposure`、`openDayTrafficBoost` |
| 影响模型 | D1 上升，部分 relation 更容易进看房 |

### 3.3.2 商圈流量下降

| 项 | 内容 |
| -- | ---- |
| 触发条件 | 天气、工作节奏、线下场景变弱 |
| 命中房源 | 依赖自然到访的房 |
| 命中客户 | 临时看房客户减少 |
| 命中业主 | 对动作效果信心下降 |
| 改字段 | `CaseRuntime.exposure`、`Matter.completionChance` |
| 影响模型 | D1 下降，执行类 matter 命中率下降 |

---

## 3.4 Segment 级事件

### 3.4.1 刚需总价带走强

| 项 | 内容 |
| -- | ---- |
| 触发条件 | 信贷放松、婚房季、学区窗口 |
| 命中房源 | 刚需主流总价带、两居三居适销盘 |
| 命中客户 | 刚需客户、首次置业客户 |
| 命中业主 | 议价空间会收紧 |
| 改字段 | `segmentLiquidity`、`CustomerRuntimeState.activityLevel` |
| 影响模型 | D1 上升，`priceGapToMarket` 容忍度提高 |

### 3.4.2 改善总价带转弱

| 项 | 内容 |
| -- | ---- |
| 触发条件 | 高总价承压、置换链条变慢 |
| 命中房源 | 改善大户型、高总价盘 |
| 命中客户 | 决策周期被拉长 |
| 命中业主 | 焦虑升高，但表面可能更强硬 |
| 改字段 | `segmentLiquidity`、`globalUrgency`、`pricePressure` |
| 影响模型 | D1 下降，D3 两极化 |

### 3.4.3 同类成交示范

| 项 | 内容 |
| -- | ---- |
| 触发条件 | 同小区、同产品有真实成交 |
| 命中房源 | 产品相似房最明显 |
| 命中客户 | 原本观望客户更敢推进 |
| 命中业主 | 对市场价理解改善 |
| 改字段 | `marketEstimatedPrice`、`OwnerRuntimeState.marketUnderstanding` |
| 影响模型 | 价格模型更稳定，D3 上升 |

---

## 3.5 Calendar 级事件

### 3.5.1 周末开放日窗口

| 项 | 内容 |
| -- | ---- |
| 触发条件 | 周五到周日自动增强 |
| 命中房源 | 易参观、卖点直观、适合多人流转的房 |
| 命中客户 | 自来客、首次看房客户 |
| 命中业主 | 原本犹豫的业主更容易接受 |
| 改字段 | `openDayTrafficBoost`、`viewingModeWeight` |
| 影响模型 | D1 上升，relation 更容易进到看房阶段 |

### 3.5.2 节后回流窗口

| 项 | 内容 |
| -- | ---- |
| 触发条件 | 长假结束后固定窗口 |
| 命中房源 | 节前积压但基础不错的房 |
| 命中客户 | 被打断的客户重新活跃 |
| 命中业主 | 信心回暖 |
| 改字段 | `inboundLeads`、`activityLevel`、`intent` |
| 影响模型 | D1 上升 |

### 3.5.3 天气不利看房

| 项 | 内容 |
| -- | ---- |
| 触发条件 | 下雨、大风、极端天气 |
| 命中房源 | 依赖线下看感受的房 |
| 命中客户 | 临时预约更容易取消 |
| 命中业主 | 耐心下降 |
| 改字段 | `showingCompletionRate`、`patience` |
| 影响模型 | 看房类 matter 推进率下降 |

---

## 4. 发生概率怎么判断

## 4.1 推荐顺序

先判断“有没有发生条件”，再算“发生概率”。

建议公式：

```text
eventProbability =
  baseRate
* timeAffinity
* scopeSensitivity
* pressureGap
* randomness
```

### 各项解释

| 项 | 含义 |
| -- | ---- |
| `baseRate` | 这个事件平时多常见 |
| `timeAffinity` | 这个时间点是不是更容易发生 |
| `scopeSensitivity` | 当前城市/区域/商圈是不是对这个事件敏感 |
| `pressureGap` | 当前市场状态是否积累了足够压力 |
| `randomness` | 留一点随机噪声，避免全死板 |

---

## 5. 事件影响传播顺序

一定不要事件一来就直接改客户最终结果。

推荐顺序：

1. 先改 `MarketState`
2. 再影响 `PriceModel`
3. 再影响 `GoodHouseModel`
4. 再影响 `OwnerCaseRelation` / `CustomerCaseRelation`
5. 最后才影响页面投影

这样因果链才顺。

---

## 6. 事件和“哪类房、哪类客户、哪类业主”的关系本质是什么

本质上是：

> 同一个市场事件，不会平均命中所有对象，而是通过“适配度”命中更敏感的对象。

举例：

- 刚需总价带走强
  更命中总价合适、户型主流的房
- 周末开放日窗口
  更命中适合多人流转、看感受就能打动人的房
- 市场情绪转弱
  更先打到预算边缘客户、高总价客户、强势但没反馈的业主

所以后面代码里建议统一做一个：

`impactFit(entity, marketEvent)`

不要每个引擎各写一套硬判断。

---

## 7. 已收口与后续校准

这份事件目录已经能做第一轮实现。
时间、组织、竞争、业务事实已经分别收口到：

- [selling-houses-time-architecture.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-time-architecture.md)
- [selling-houses-competition-and-cosale-architecture.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-competition-and-cosale-architecture.md)
- [selling-houses-organization-acn-model.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-organization-acn-model.md)
- [selling-houses-business-facts.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-business-facts.md)

剩下主要是配置表校准：

1. 城市、板块、商圈的默认基线表。
2. 不同 segment 的事件敏感度系数。
3. 和公司目标、门店动作联动的组织级事件。
4. 和政策时间表绑定的半确定性事件清单。

---

## 8. 一句话结论

市场事件最重要的，不是“随机出事”，
而是让系统清楚知道：

1. 什么时间更容易出什么事。
2. 什么地区更容易中什么事。
3. 这个事会先改哪里，再影响谁。
