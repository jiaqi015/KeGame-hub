# 卖房（资产顾问）Matter 模板架构

最后更新：2026-04-21

这份文档回答的是：

> Matter 作为玩法单位，到底有哪些模板；每类 Matter 怎么推进；什么时候完成；完成后影响谁。

这份文档不回答：

- 每个按钮的最终名字
- 每个数值具体调多少
- 具体视觉稿长什么样

它只回答：

1. Matter 模板怎么分类
2. 每类模板的阶段怎么走
3. Matter 和动作、事件、关系怎么连接
4. 哪些 Matter 适合普通卡片，哪些适合独立页面，哪些适合专屏

当前实现合同以 [selling-houses-implementation-contracts.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-implementation-contracts.md) 为准：

- `scene` 说明“这是什么业务事”
- `template` 说明“用什么交互方式处理”，当前实现取值为 `dialog | form | schedule | realtime`
- `presentation` 说明“显示成卡片、详情页还是专屏”
- `report / diagnose / execute / negotiate` 是本文的生命周期分类，不是当前实现字段枚举
- `ClosedDealRecord` 不是 Matter；Matter 最多推进到成交前准备或收口动作

---

## 0. 一句话结论

Matter 是：

> 玩家正在推进的一件具体事。

动作是 Matter 里的步骤。
事件是 Matter 产生的事实。
关系和运行态是 Matter 影响的对象。

```text
Matter
  -> BrokerAction[]
  -> Interaction[]
  -> WorldEvent[]
  -> Relation / Runtime 更新
```

再补一句：

> Matter 可以独立成工作单元，但不能独立成世界真相。

也就是说：

- Matter 可以有自己的入口、页面、专屏
- 但最后还是通过 `Event` 去改 `Relation / Runtime / ClosedDealRecord`

---

## 0.5 Matter 的两条轴

我建议后面固定成双轴：

1. `scene`
2. `template`

一句话理解：

- `scene`
  回答玩家看到的这是什么业务事
- `template`
  回答系统应该用什么交互方式把它做完

比如：

- 带看
  是 `scene`
- 日程确认 / 到场执行
  是 `template`

这样能同时满足两件事：

1. 玩家看到的语言是真实业务语言
2. 系统内部可以复用 UI 模板

---

## 0.6 Matter 的三层展示形态

Matter 不应该一刀切都做成同一种详情。

建议固定成三层：

1. 普通卡片
2. 独立页面
3. 专屏

### 普通卡片

适合：

- 信息量小
- 决策步骤少
- 处理时长短
- 不需要持续占据注意力

典型表现：

- 在 `经营概览` 的 Inbox 区显示一条 Matter 卡
- 在房源详情中段显示一条 Matter 行
- 点击后开抽屉或弹层处理

### 独立页面

适合：

- 需要集中看一组事实
- 处理过程有 2-4 步
- 会反复回来查看
- 需要完整时间线、证据、状态和后续建议

典型表现：

- 有自己的详情页
- 可以从房源、客户、复盘、日志多处进入

### 专屏

适合：

- 占据一个连续时间段
- 有实时反馈
- 需要玩家持续盯着处理
- 同时影响多人、多对象、多事件

典型表现：

- 进入后切换到专门工作台
- 离开时做一次阶段性结算

---

## 0.7 判定规则

不要靠感觉决定一个 Matter 用哪层展示。

建议固定 5 个判断问题：

1. 它是不是有明确的开始时间和进行时段
2. 它是不是需要玩家连续盯着做
3. 它是不是需要同时看很多对象
4. 它是不是有一整套独立前置 / 执行 / 后置结算
5. 玩家会不会反复回来看它

判定原则：

- 只有第 5 条成立
  通常做独立页面
- 1/2/3/4 同时成立两条以上
  倾向做专屏
- 都不成立
  就做普通卡片

---

## 0.8 特别边界

这里有两个边界要定死。

### 成交相关 Matter

可以有：

- 成交条件确认
- 合同准备
- 过户推进

但：

> 成交本身不是 Matter 完成，而是 `ClosedDealRecord` 落账。

### 开放日 Matter

开放日不是普通执行事项。

它应该是：

- `scene = open_house`
- `template = realtime`
- `presentation = full-screen`

因为它天然有：

- 前置准备
- 当天专屏执行
- 后置统一结算

---

## 0.9 推荐数据结构

```ts
type MatterScene =
  | 'showing'
  | 'open_house'
  | 'valuation'
  | 'listing_prep'
  | 'client_call'
  | 'negotiation'
  | 'report_to_owner'
  | 'closing_prep'
  | 'diagnose'
  | 'co_selling'
  | 'risk_followup';

type InteractionTemplate =
  | 'dialog'
  | 'form'
  | 'schedule'
  | 'realtime';

type MatterPresentation =
  | 'inline-card'
  | 'detail-page'
  | 'full-screen';
```

---

## 1. 为什么 Matter 不能只是 action

如果只做 action，会出现几个问题：

1. 玩家做完动作以后，后续影响没地方放。
2. 多步推进会被拆成互不相干的按钮。
3. 复盘看不到一件事的完整因果。
4. 机会阶段会继续被随机推进。

所以玩法单位必须是 Matter。

---

## 2. 四类 Matter 生命周期分类

先固定四类：

1. `report`
2. `diagnose`
3. `execute`
4. `negotiate`

这四类不是 UI 分类，而是生命周期分类。

注意：当前实现里的 `Matter.template` 字段已经用于交互模板，即 `dialog | form | schedule | realtime`。本节的 `report / diagnose / execute / negotiate` 暂时只作为设计分类，不能直接当成当前字段枚举写进代码。

所以完整结构不是“4 个 Matter”。

而是：

```text
scene
  × lifecycle category
  × template
  × presentation mode
```

例如：

- `open_house`
  × `execute`
  × `realtime`
  × `full-screen`

- `report_to_owner`
  × `report`
  × `dialog`
  × `detail-page`

- `client_call`
  × `report`
  × `dialog`
  × `inline-card`

---

## 3. 通用 Matter 结构

```ts
type MatterLifecycleCategory =
  | 'report'
  | 'diagnose'
  | 'execute'
  | 'negotiate';

type MatterTemplate =
  | 'dialog'
  | 'form'
  | 'schedule'
  | 'realtime';

type Matter = {
  id: string;
  scene: MatterScene;
  lifecycleCategory?: MatterLifecycleCategory;
  template: MatterTemplate;
  presentation: MatterPresentation;
  title: string;
  initiatorBrokerId: string;
  subjectIds: string[];
  caseIds?: string[];
  ownerIds?: string[];
  customerIds?: string[];
  stage: string;
  status: 'planned' | 'active' | 'completed' | 'failed' | 'cancelled';
  openedDay: number;
  dueDay?: number;
  closedDay?: number;
  actionIds: string[];
  eventIds: string[];
  context: Record<string, unknown>;
};
```

再建议加两类字段：

```ts
type Matter = {
  ...
  priority?: 'must_respond' | 'recommended' | 'optional';
  scheduledSlot?: {
    day: number;
    time: string;
  };
};
```

原因：

- `priority` 决定它在 Inbox 怎么排
- `scheduledSlot` 决定它是不是会进今日日程

---

## 3.5 Scene 清单与默认落点

下面这张表建议后面定成标准口径。

| Scene | 含义 | 生命周期分类 | 当前 template | 默认展示层级 | 说明 |
| ---- | ---- | ---- | ---- | ---- | ---- |
| `showing` | 带看 | `execute` | `schedule` | `detail-page` | 需要预约、执行、反馈，通常不必整屏 |
| `open_house` | 开放日 | `execute` | `realtime` | `full-screen` | 独立专屏，前中后链路完整 |
| `valuation` | 勘察 / 定价 | `diagnose` | `form` | `detail-page` | 需要看一组事实和结论 |
| `listing_prep` | 挂盘准备 | `execute` | `form` | `detail-page` | 往往有多步清单和条件 |
| `client_call` | 客户沟通 | `report` | `dialog` | `inline-card` | 常见、频繁、处理时长短 |
| `negotiation` | 谈价 | `negotiate` | `dialog` | `detail-page` | 要看上下文，不适合只弹一次小框 |
| `report_to_owner` | 业主汇报 | `report` | `dialog` | `detail-page` | 需要事实包和历史上下文 |
| `closing_prep` | 合同 / 过户准备 | `negotiate` / `execute` | `form` | `detail-page` | 负责成交前后流程，不等于成交落账 |
| `diagnose` | 卡盘诊断 | `diagnose` | `form` | `detail-page` | 本质是分析页 |
| `co_selling` | 联卖协商 | `negotiate` | `dialog` | `detail-page` | 常牵涉多方和归因 |

---

## 3.6 哪些适合普通卡片

普通卡片的标准是：

- 处理时长短
- 单次决策少
- 不需要持续盯着
- 不需要同时看很多对象

建议第一批放进这类的：

1. `client_call`
2. 简单版 `report_to_owner`
3. 简单版 `co_selling` 邀约确认
4. 开放日前提醒
5. 带看前确认
6. 带看后补反馈

### 交互方式

- 在 `经营概览` 的 `必须回复 / 今日到达` 中显示
- 在房源详情中段也显示
- 点击后开抽屉或小弹层

### 典型例子

```text
李女士：是否接受 940 万？
星辉海岸 12B · 剩余 6h
[接受] [还价] [拒绝] [问业主]
```

这类 Matter 的目标是：

> 快速决策，不打断玩家整页浏览。

---

## 3.7 哪些适合独立页面

独立页面的标准是：

- 需要集中看事实包
- 有 2-4 步推进过程
- 玩家会反复回来查看
- 结果会持续影响后续很多天

建议第一批做独立页面的：

1. `showing`
2. `valuation`
3. `listing_prep`
4. `negotiation`
5. `report_to_owner`
6. `diagnose`
7. `co_selling`
8. `closing_prep`

### 页面应包含

1. 标题与状态
2. 参与对象
3. 事实包
4. 已做动作
5. 当前风险
6. 下一步动作
7. 完成条件
8. 事件流水

### 为什么这些不只做卡片

因为它们不是“回复一句就结束”。

它们更像：

- 一件要经营的业务事
- 一个会反复回看的工作单

---

## 3.8 哪些适合专屏

专屏的标准是：

- 有明确执行时段
- 有实时反馈
- 同时影响多对象
- 退出时需要统一结算

第一阶段我建议只明确一个：

1. `open_house`

第二阶段可预留：

1. 大型联卖活动
2. 集中签约 / 过户日

### 专屏必须满足

1. 有进入条件
2. 有离开后的统一结算
3. 进入期间可以持续产生事件
4. 结束后可以批量生成后续 Matter

如果没有这 4 条，就不要轻易做专屏。

---

## 3.9 同一个 Scene 可以升级展示层级

不要把 Scene 和页面形态绑死。

更稳的是：

> 同一个 Scene 在不同复杂度下，可以升级展示层级。

例如：

### `client_call`

- 普通跟进
  `inline-card`
- 涉及多房比较、家人意见、价格试探
  可以升级到 `detail-page`

### `showing`

- 简单预约
  可从卡片发起
- 正式带看执行
  进入 `detail-page`

### `co_selling`

- 只是确认联卖意向
  可做卡片
- 涉及分工、分佣、房源端 / 客源端归因
  应做 `detail-page`

---

## 3.10 Inbox、房源页、客户页各自怎么承接 Matter

### 经营概览 / Inbox

负责：

- 必须回复
- 今日到达
- 今日日程

这里适合放：

- 所有 `inline-card`
- 所有即将执行的 `schedule`
- 所有高优先级 Matter 的入口

### 房源详情中段

负责：

- 与这套房直接相关的 Matter 主战场

这里适合放：

- 进行中的 Matter
- 推荐新 Matter
- 已完成 / 失败 Matter 摘要

### 客户详情

负责：

- 跨房源看这个客户当前涉及的 Matter

这里适合放：

- 客户沟通
- 再看邀约
- 竞品比较沟通
- 成交前准备

---

## 3.11 跳转规则

为了避免玩家迷路，Matter 的跳转也要固定。

### 从卡片进入

- `inline-card`
  默认开抽屉 / 弹层
- `detail-page`
  直接进入独立页面
- `full-screen`
  二次确认后进入专屏

### 从日志进入

- 事件如果有来源 Matter
  必须能跳回 Matter 详情

### 从房源 / 客户进入

- 如果是当前主 Matter
  优先直接进入该 Matter 详情
- 如果只是历史 Matter
  打开 Matter 时间线页签

---

## 3.12 第一阶段推荐清单

为了避免第一版做太散，我建议第一阶段就按下面落：

### 先做普通卡片

1. `client_call`
2. 带看前确认
3. 开放日前确认
4. 简单版业主催反馈

### 先做独立页面

1. `negotiation`
2. `report_to_owner`
3. `valuation`
4. `diagnose`
5. `showing`

### 先做专屏

1. `open_house`

这样层次最清楚，也不会一上来做 10 个半残页面。

---

## 4. `report` 汇报型 Matter

### 典型场景

- 首次面访
- 周度反馈
- 开放日后反馈
- 带看反馈

### 目标

让业主或客户理解当前事实，并改变认知、信任或配合度。

### 推荐阶段

```text
prepare-evidence
  -> deliver-message
  -> receive-response
  -> settle-impact
```

### 完成条件

- 已选择话题
- 已绑定事实包
- 已完成沟通
- 已记录对方回应

### 主要影响

- `BrokerOwnerRelation.trust`
- `OwnerCaseRelation.marketUnderstanding`
- `OwnerCaseRelation.cooperation`
- `BrokerCustomerRelation.trust`
- `CustomerCaseRelation.confidence`

---

## 5. `diagnose` 诊断型 Matter

### 典型场景

- 房源卖点重做
- 竞品调研
- 客户池诊断
- 价格站位诊断

### 目标

找出当前卡点，并生成后续动作依据。

### 推荐阶段

```text
collect-signals
  -> compare-baseline
  -> identify-bottleneck
  -> produce-plan
```

### 完成条件

- 已收集必要事实
- 已完成模型或对比
- 已生成主问题和建议动作

### 主要影响

- `ActionReadinessProjection`
- `CaseDetailProjection`
- `Matter` 后续链路

注意：

诊断本身通常不直接大幅改变世界。
它更多改变玩家可见信息和后续行动质量。

---

## 6. `execute` 执行型 Matter

### 典型场景

- 安排带看
- 开放日承接
- 私域推盘
- 聚焦投放
- 联卖同步

### 目标

把计划变成实际接触、流量或推进。

### 推荐阶段

```text
prepare
  -> launch
  -> observe-result
  -> settle-impact
```

### 完成条件

- 动作已经发生
- 到场 / 曝光 / 反馈等结果已经记录
- 对 relation 或 runtime 的影响已经落账

### 主要影响

- `CaseRuntime.exposure`
- `CaseRuntime.heat`
- `CustomerCaseRelation.stage`
- `CustomerCaseRelation.intent`
- `CampaignParticipation`
- `CoSaleRelation`

---

## 7. `negotiate` 博弈型 Matter

### 典型场景

- 谈底价
- 谈挂牌价
- 组织业主客户见面
- 推进出价
- 成交条件协商

### 目标

推动关键条件达成一致。

### 推荐阶段

```text
probe
  -> anchor
  -> exchange
  -> close-or-fail
```

### 完成条件

- 双方核心立场已经明确
- 是否达成阶段目标已经明确
- 成功或失败影响已落账

### 主要影响

- `PriceModelOutput`
- `OwnerCaseRelation.priceFlexibility`
- `CustomerCaseRelation.confidence`
- `CustomerCaseRelation.stage`
- `RunResult` 的最终可能性

---

## 8. Matter 和 Action 的关系

一个 Matter 可以有多个 Action。

例如：

```text
Matter: 推动 A 房开放日
  Action 1: 和业主沟通开放日价值
  Action 2: 向经理申请活动名额
  Action 3: 做推广预热
  Action 4: 承接开放日到访
  Action 5: 给业主做活动反馈
```

这里 Matter 承载的是“一件事”。
Action 承载的是“这一步怎么做”。

---

## 9. Matter 和 Event 的关系

Matter 推进过程中必须留下事件。

典型事件：

- `matter.started`
- `matter.stage.changed`
- `matter.completed`
- `matter.failed`
- `owner.feedback.received`
- `customer.showing.completed`
- `price.window.opened`
- `campaign.result.settled`

事件链是复盘的基础。

---

## 10. Matter 的失败也要建模

Matter 不应该只有完成。

失败也很重要。

常见失败原因：

- 业主不配合
- 客户取消
- 资源申请失败
- 价格条件无法对齐
- 错过时间窗口

建议保留：

```ts
type MatterFailureReason =
  | 'owner-not-cooperative'
  | 'customer-cancelled'
  | 'resource-denied'
  | 'price-gap-too-large'
  | 'missed-window'
  | 'weak-preparation';
```

---

## 11. 日结怎么处理 Matter

日结里 Matter 至少要做 4 件事：

1. 检查是否到期
2. 结算当天完成的动作
3. 推进或关闭 Matter
4. 把影响写入 EventStore 和 relation

---

## 12. 最后一句

Matter 的作用不是让任务列表更复杂。

它的作用是：

> 让玩家做的每件事都有过程、有因果、有结果、有复盘。
