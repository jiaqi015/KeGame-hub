# 卖房（资产顾问）日结与每日计算设计

最后更新：2026-04-21

这份文档回答的是：

> 一天结束后，系统到底会统一算什么，按什么顺序算，算完会发生什么。

用户之前问得很对：

> “每天计算后，会发生什么？”

这份文档就是把这件事一次讲透。

当前实现合同以 [selling-houses-implementation-contracts.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-implementation-contracts.md) 为准：

- 机会主线只到 `offer`
- 日结里的正式成交要通过 `DealClosingEvaluation -> ClosedDealRecord`
- `RunResult` 只在正式结算后生成，不混入进行中的日摘要

---

## 0. 一句话结论

推荐做成两层：

1. 白天动作，局部即时更新。
2. 晚上日结，统一跑一次 `advanceDay()`。

白天负责“刚刚做了什么”。
日结负责“这一天过去以后，世界整体怎么变了”。

---

## 1. 为什么一定要有日结

如果没有日结，后面会出 4 个问题：

1. 客户、业主、市场都只在玩家点按钮时才活着。
2. 很多变化只能写在局部 action 里，越来越散。
3. 复盘讲不清“为什么今天整体变了”。
4. 计算成本会被挤到各种页面派生里，最后更乱。

所以日结的意义是：

> 让世界每天至少统一呼吸一次。

这里还有一个很关键的市场背景：

> 这不是一个短成交周期的市场，而是一个高库存、高客户量、长决策周期、低月成交率的竞争市场。

以北京为例，可以粗理解成：

- 出售中的房源量级大约 10 万套
- 月成交量级大约 1.5 万套
- 客户量级大约是房源的 10 到 20 倍
- 但客户决策周期很长

这意味着：

1. 客户很多，但不会快速成交。
2. 房源很多，竞争会长期存在。
3. 绝大多数机会不会在短时间内收口。
4. 系统必须依赖日结，持续表达“慢推进、慢变化、少成交”的现实。

---

## 2. 日结的输入和输出

## 2.1 输入

```text
advanceDay(world, session, seed) -> nextDayResult
```

### world 里需要有

1. `cases`
2. `owners`
3. `customers`
4. `ownerCaseRelations`
5. `customerCaseRelations`
6. `matters`
7. `marketState`
8. `eventStore`

### session 里只给什么

1. 可选的玩家视角缓存
2. 不参与世界真相计算

也就是说：

- 日结核心输入是 `World`
- 不是 UI 状态

## 2.2 输出

建议统一输出：

| 输出 | 含义 |
| ---- | ---- |
| `nextWorld` | 更新后的世界 |
| `emittedEvents[]` | 今天新产生的事件 |
| `dirtyCases[]` | 哪些房源投影需要重算 |
| `dailySummary` | 给 UI 的日结摘要 |
| `seed` | 更新后的随机种子 |

更完整一点，建议把输出收成：

```ts
type AdvanceDayResult = {
  nextWorld: World;
  emittedEvents: WorldEvent[];
  invariantAlerts: TickInvariantAlert[];
  dirtyScopes: DirtyScopeSet;
  dailySummary: DailySummaryProjection;
  rngState: RngState;
};
```

这里多出来两个东西很重要：

- `invariantAlerts`
  用来做健壮性检查
- `dirtyScopes`
  用来控制后续哪些 projection 需要重算

---

## 3. 白天即时更新和日结的边界

## 3.1 白天即时更新负责什么

以下事情发生时，当场更新：

1. 玩家发起事项。
2. 事项阶段推进。
3. 客户立即反馈。
4. 业主立即回应。
5. 挂牌价立即修改。

这种更新特点是：

- 范围小
- 因果明确
- 玩家点完就该看见结果

## 3.2 日结负责什么

以下事情更适合日结：

1. 市场事件触发和衰减。
2. 客户整体活跃度、疲劳度变化。
3. 业主整体情绪和焦虑变化。
4. 机会停滞、流失、自然推进。
5. 价格压力积累。
6. 好房分和价格模型统一重算。
7. 第二天摘要生成。

---

## 4. 推荐的日结顺序

下面这个顺序我建议固定下来。
不要一会儿先算 relation，一会儿先算市场。

---

## 4.1 Step 0：结算白天遗留的事项

先处理今天已经完成但还没正式落账的事项。

例如：

1. 开放日结束。
2. 带看完成。
3. 约见结束。
4. 谈价事项完成。

### 产出

1. 事项状态变化。
2. 事项结果事件。
3. 对 relation 和 owner relation 的直接影响。

---

## 4.2 Step 1：推进时间

做最基础的一步：

1. `day + 1`
2. 更新时间上下文
3. 计算今天是不是周末、月末、季度节点

### 产出

1. `timeContext`
2. 日历类事件候选集

---

## 4.3 Step 2：结算市场事件

这一步先算环境。

### 做什么

1. 老事件衰减或结束。
2. 按时间和空间规则触发新事件。
3. 更新 `MarketState`。

### 可能发生的事

1. 某区需求升温。
2. 商圈流量下降。
3. 周末开放日窗口开启。
4. 某 segment 流动性变化。

### 产出

1. `marketEvent.started`
2. `marketEvent.ended`
3. 新的 `MarketState`

---

## 4.4 Step 3：更新 CaseRuntime

环境变了以后，更新每套房的运行时表现。

### 做什么

1. 曝光衰减或累积。
2. 热度衰减或累积。
3. 竞品压力变化。
4. 开放日、推广余波结算。

### 可能发生的事

1. 某套房曝光回落。
2. 某套房因为周末窗口热度抬升。
3. 某套房因同类竞品增多而压力上升。

### 产出

1. 更新后的 `CaseRuntime`
2. `case.heat.changed`
3. `case.exposure.changed`

---

## 4.5 Step 4：更新 Owner 和 OwnerCaseRelation

业主不是静止的。

### 先更新 OwnerRuntimeState

1. 焦虑度随时间和反馈变化。
2. 情绪随今天是否有进展变化。
3. 市场理解随事件和沟通积累变化。

### 再更新 OwnerCaseRelation

1. trust 会不会涨跌。
2. patience 会不会下降。
3. urgency 会不会上升。
4. 是否进入“可以谈价”的窗口。

### 可能发生的事

1. 连续无反馈，业主焦虑升高。
2. 今天有两组看房，业主信心回暖。
3. 同类盘刚成交，业主更理解市场。
4. 长期没进展，耐心下降。

### 产出

1. `owner.anxiety.changed`
2. `ownerCase.trust.changed`
3. `ownerCase.patience.changed`
4. `ownerCase.priceWindow.opened`

---

## 4.6 Step 5：更新 CustomerRuntimeState

客户整体也会每天变。

### 做什么

1. 活跃度变化。
2. 疲劳度变化。
3. 注意力容量变化。
4. 整体紧迫度变化。
5. 是否进入“更想推进”或“更想拖一拖”的状态。

### 可能发生的事

1. 连续看房太多，疲劳上升。
2. 节后回流，活跃度上升。
3. 刚需窗口打开，整体紧迫度上升。
4. 长期没找到合适房，注意力下降。

### 产出

1. `customer.activity.changed`
2. `customer.fatigue.changed`
3. `customer.urgency.changed`

---

## 4.7 Step 6：更新 CustomerCaseRelation

这是日结里最关键的一步。

### 做什么

对每条活跃 relation：

1. 重算 `fitScore`
2. 重算 `affordabilityScore`
3. 重算 `intent`
4. 重算 `confidence`
5. 累加 `stagnationDays`
6. 判断是否自然推进、停滞、流失

### 可能发生的事

1. 客户对 A 房意向上升。
2. 客户对 B 房信心下降。
3. 某条关系进入首次看房预约。
4. 某条关系因为久未跟进变成停滞。
5. 某条关系被竞品拉走。

### 推进判断建议

先判断门槛：

1. 买不买得起。
2. 房子有没有吸引力。
3. 最近有没有接触。
4. 业主侧是否允许推进。

再判断结果：

1. 晋级
2. 持平
3. 停滞
4. 流失

### 产出

1. `relation.intent.changed`
2. `relation.confidence.changed`
3. `relation.stage.advanced`
4. `relation.stagnated`
5. `relation.lost`

---

## 4.8 Step 7：更新价格模型

relation 和 owner 变完以后，再重算价格最稳。

### 做什么

1. 重算 `marketEstimatedPrice`
2. 重算 `ownerPsychPrice`
3. 重算 `priceGapToMarket`
4. 重算 `priceFlexibility`
5. 重算 `dealFeasibility`
6. 更新 `pricePressure`

### 可能发生的事

1. 价格压力升高。
2. 业主心理价下调。
3. 进入更适合谈价的窗口。

### 产出

1. `price.marketEstimate.changed`
2. `price.ownerPsych.changed`
3. `price.pressure.changed`

---

## 4.9 Step 8：计算成交候选与成交判定

价格、关系、市场都更新完以后，再判成交最稳。

### 做什么

1. 找出进入 `offer` 或强收口窗口的 `CustomerCaseRelation`
2. 计算每条候选关系的 `DealClosingEvaluation`
3. 用市场整体流动性做一次节流
4. 对通过条件的关系生成 `ClosedDealRecord`
5. 关闭同房源的其他冲突关系

### 可能发生的事

1. A 房与李女士成交，形成一条正式成交记录。
2. B 房虽然到出价，但因为价格差距太大，没有收口。
3. C 房同 ACN 联卖成交，房源端和客源端分属不同经纪人。
4. D 房被外品牌成交，形成跨品牌丢盘。

### 产出

1. `deal.closed`
2. `case.closed`
3. `relation.closed-by-deal`
4. `ClosedDealRecord[]`
5. `DealStatsProjection`

---

## 4.10 Step 9：更新好房模型

价格和关系变完，再算好房分。

### 做什么

1. 重算 `D1`
2. 重算 `D2`
3. 重算 `D3`
4. 重算 `goodHouseScore`
5. 生成原因标签

### 可能发生的事

1. 某房因周末开放日和新客户进入，D1 上升。
2. 某房因价格调整和业主松口，D3 上升。
3. 某房因竞品加剧，D2 下滑。

### 产出

1. `goodHouse.d1.changed`
2. `goodHouse.d2.changed`
3. `goodHouse.d3.changed`
4. `goodHouse.score.changed`

---

## 4.11 Step 10：生成 Projection 和日结摘要

世界算完以后，才投影给玩家看。

### 做什么

1. 生成 dashboard 摘要。
2. 生成房源详情摘要。
3. 生成今日新增风险提示。
4. 生成成交统计和排行榜所需统计。
5. 生成日结摘要。

### 日结摘要里建议包括

1. 今天哪些房变好了。
2. 哪些机会推进了。
3. 哪些机会停住了。
4. 哪些业主更着急了。
5. 哪些房已经到了该谈价的时候。
6. 哪些市场信号值得明天注意。
7. 今天有没有新增成交、丢盘、联卖成交。

---

## 4.12 Step 11：做一致性检查

这一步很重要，不能省。

因为日结不是简单算分，而是在推进一个复杂世界。
复杂世界最怕的不是算慢，而是算出脏状态还继续往下跑。

### 这一步要检查什么

1. 是否出现非法 stage 跳跃
2. 是否出现负数型字段越界
3. 是否出现已结束 relation 还在被推进
4. 是否出现已关闭 Matter 还被继续写事件
5. 是否出现价格关系自相矛盾
6. 是否出现同一客户当天在互斥状态里重复出现
7. 是否出现同一套房同一天重复成交
8. 是否出现已成交房源仍然新增机会

### 典型例子

- 已流失客户又在同一天自动预约带看
- 已撤盘房源还在继续参加开放日
- `ownerPsychPrice < marketEstimatedPrice` 但系统仍判定“价格极硬”
- 一个机会从“线上咨询”直接跳到“出价”

### 产出什么

- `tick.invariant.warning`
- `tick.invariant.error`
- `TickInvariantAlert[]`

这里建议原则很明确：

- 轻微不一致，记告警并继续
- 核心不一致，中断这一天结算并报错

---

## 5. 一天过去，引擎必须完成什么

你这个问题问得非常对。

站在引擎视角，一天过去，不只是“重算几个数”。

它其实必须完整做完 5 类工作：

1. 模拟
2. 推理
3. 计算
4. 检查
5. 完成

这 5 类缺一类，系统都会慢慢失真。

## 5.1 模拟什么

模拟回答的是：

> 如果今天过去了，这个世界自然会发生什么。

这里要模拟的，主要是“没人点按钮也会发生”的变化：

- 时间推进
- 市场事件启停
- 曝光和热度衰减
- 业主情绪自然变化
- 客户疲劳和活跃变化
- 机会自然停滞、回暖或流失
- 价格压力积累

这些东西如果不模拟，世界就只会在玩家点击时才活着。

## 5.2 推理什么

推理回答的是：

> 这些变化最后意味着什么。

例如：

- 今天两次带看，意味着业主焦虑不一定继续升
- 最近 5 天没跟进，意味着关系进入停滞风险
- 同预算竞品增多，意味着某条机会推进难度上升
- 周末开放日窗口开启，意味着某类房今天更适合组织到访

也就是说：

> 模拟是“发生了什么”，推理是“这些事说明什么”。

推理通常落在：

- readiness
- pressure
- risk
- window
- priority

这些中间状态上。

## 5.3 计算什么

计算回答的是：

> 具体数值变成多少。

这部分包括：

- exposure / heat
- trust / patience / urgency
- activity / fatigue / urgency
- fit / affordability / intent / confidence
- marketEstimatedPrice / ownerPsychPrice / pricePressure
- D1 / D2 / D3 / goodHouseScore

这部分应该尽量模块化，不要写成一个大函数里到处混算。

## 5.4 检查什么

检查回答的是：

> 今天算完以后，这个世界还像不像一个合法世界。

必须检查：

- 状态边界
- 生命周期合法性
- 引用完整性
- 互斥状态冲突
- 事件顺序合理性

这一层是引擎健壮性的底线。

## 5.5 完成什么

完成回答的是：

> 这一天结束以后，哪些结果要正式落账，供明天继续用。

包括：

- 写入 `EventStore`
- 更新对象 runtime
- 更新 relation
- 关闭或推进 Matter
- 生成日结摘要
- 标记 dirty projection

一句话：

> 完成不是“显示给 UI”，而是把今天正式结账。

---

## 6. 做这些事的目的是什么

如果往上抽一层，这套日结不是为了“真实而真实”。

它有 4 个明确目的。

## 6.1 目的 1：让世界自己活着

玩家不操作，市场也要继续变化。

这件事是这个项目和简单经营面板最大的差别。

## 6.2 目的 2：让动作产生后效

玩家今天做了推广、沟通、带看，不应该只在点下去那一刻生效。

它们应该在后面几天继续留下余波：

- 推广余波
- 信任余波
- 价格压力余波
- 市场竞争余波

## 6.3 目的 3：让复盘能讲清因果

如果没有统一日结，复盘最后只会看到：

- 分数变了
- 阶段变了

但看不到为什么变。

有日结后，复盘可以讲完整因果链：

```text
开放日报名成功
  -> 周末到访增加
  -> 房源热度上升
  -> 业主信心回暖
  -> 价格窗口打开
  -> 二看后的客户出价概率上升
```

## 6.4 目的 4：让系统可扩展

后面你加：

- 新客户类型
- 新业主类型
- 新活动
- 新市场事件
- 新区域
- 新模式

只要都接进统一日结链路，就不会变成散落补丁。

---

## 7. 哪些需要正常模拟，哪些需要概率

这是最容易做歪的一块。

我建议先定一个硬原则：

> 先确定结构，再决定哪里加概率。

不要上来就“全都随机一点”。

## 7.1 应该正常模拟的

下面这些更适合走确定性或准确定性计算。

### A. 时间结构

- 今天是不是周末
- 是不是月底
- 是不是季度节点
- 活动是不是到期

这些不该随机。

### B. 状态衰减和积累

- 曝光衰减
- 热度回落
- 疲劳积累
- 停滞天数增加
- 压力逐步累积

这些更像连续过程，也不该随机乱跳。

### C. 基于事实的直接后果

- 完成带看后写入带看事件
- 报价后进入报价阶段
- 撤盘后关闭相关关系
- Matter 完成后落账结果

这些本质是事实，不该靠概率决定。

### D. 模型重算

- 好房分
- 价格模型
- readiness
- risk
- 优先级投影

这些都是对当前世界状态的解释，应该确定性重算。

## 7.2 应该引入概率的

下面这些更适合引入概率。

### A. 外部扰动

- 某商圈临时来一波客户流量
- 市场情绪小波动
- 天气影响线下看房

这类事不是每天必然发生，适合概率。

### B. 行为结果的不确定部分

- 客户会不会临时取消看房
- 客户看完会不会明显升温
- 业主听完沟通后会不会真正松口
- 同 ACN 协同申请会不会拿到资源

这类不是结构性必然结果，适合概率。

### C. 自然推进结果

- 某条机会今天是持平、升温、停滞还是流失
- 某个价格窗口今天会不会真正打开

这类可以先算 readiness，再加一点概率抽样。

---

## 8. 概率怎么引入才稳

不要把概率直接写成：

- `30% 晋级`
- `20% 流失`

更稳的是两段式：

## 8.1 第一段：先算状态分

例如：

```text
advanceReadiness =
  fitScore
  + affordabilityScore
  + recentContactScore
  + ownerCooperationScore
  + marketWindowScore
  + marketingExposureScore
  - rivalPressureScore
  - fatiguePenalty
```

## 8.2 第二段：再把状态分映射成概率

例如：

```text
P(advance) = sigmoid(advanceReadiness + noise(seed))
P(stagnate) = ...
P(lost) = ...
```

这样做有几个好处：

1. 容易解释
2. 容易调参
3. 容易复盘
4. 比“拍脑袋随机”更像真实经营

---

## 9. 跳过多天怎么设计

你前面说得很对，一天过去，也可能是一下跳过好几天。

这里不能直接把 7 天压成一次粗算。

建议原则是：

> 跳过 7 天 = 连续跑 7 次 `advanceDay()`，不是跑一次 `advanceDays(7)` 的粗略版。

原因很简单：

- 周末窗口会穿过
- Matter 会到期
- 市场事件会启停
- 客户和业主状态会逐天变化

如果直接粗算，会把很多关键节点吃掉。

## 9.1 跳天的推荐接口

```ts
advanceDays(world, days, rngState) => {
  nextWorld,
  emittedEvents,
  dailySnapshots,
  rngState,
}
```

但它内部应该是：

```ts
for (let i = 0; i < days; i += 1) {
  result = advanceDay(world, rngState);
  world = result.nextWorld;
  rngState = result.rngState;
}
```

## 9.2 跳天时还要保留什么

至少要保留：

- 每天的关键事件
- 每天的状态告警
- 每天的摘要快照

否则玩家一口气跳 5 天后，会完全不知道中间发生了什么。

---

## 10. 受哪些约束

这套引擎要想健壮，至少受 6 类约束。

## 10.1 领域约束

- stage 不能乱跳
- 已撤盘不能继续带看
- 已流失关系不能自动复活
- 成交后要关闭冲突关系

## 10.2 时间约束

- 事件必须按时间顺序落账
- Matter 不能在关闭后继续推进
- 周期事件必须跟时间上下文一致

## 10.3 组织约束

- 同 ACN 协同和跨品牌竞争不能混
- 私有客户不能被错误公开
- 联卖归因要保留房源端和客源端

## 10.4 概率约束

- 同一类概率逻辑必须共用一套输入口径
- 概率不能绕过 readiness 直接拍
- 随机种子必须可复现

## 10.5 计算约束

- 只重算活跃对象
- 不做全量客户 x 房源笛卡尔积
- projection 不能反写世界真相

## 10.6 可解释性约束

- 任何一次自动推进，最好都能给出原因标签
- 任何一次自动流失，最好都能给出主因
- 任何一次价格窗口开启，最好都能给出触发事实

---

## 11. 怎么让引擎健壮、完备、可扩展

我建议守 6 条工程原则。

## 11.1 纯函数主链

`advanceDay()` 尽量保持纯函数：

```text
(World, rngState, config) -> (World', events, alerts, rngState')
```

这样好处是：

- 可复现
- 可回放
- 好测
- 好做跳天

## 11.2 子引擎分层

不要一个大函数全包。

建议至少拆成：

- `settleMatters`
- `advanceCalendar`
- `tickMarket`
- `tickCases`
- `tickOwners`
- `tickCustomers`
- `tickRelations`
- `tickPriceModel`
- `tickGoodHouseModel`
- `runInvariantChecks`
- `deriveDailySummary`

## 11.3 共享中间量

很多值不要每个引擎各自再算一遍。

比如：

- `impactFit`
- `advanceReadiness`
- `priceWindowReadiness`
- `marketWindowScore`

这些应该做成共享 evaluator。

## 11.4 事件先行

任何重要变化，尽量都通过事件链留下痕迹。

因为：

- 复盘靠它
- 结果页靠它
- 排行榜解释靠它
- 后面 AI 复盘也靠它

## 11.5 检查内建

一致性检查不是测试时才做。

它应该内建在 tick 主链里。

## 11.6 配置化而不是写死

下面这些都应该配置化：

- 各阶段默认门槛
- 各模型权重
- 各事件 baseRate
- 各难度 modifier
- 各类对象的敏感度

这样后面新增模式、新城市、新事件时，不用重写引擎。

---

## 5. 每天计算后，到底会发生什么

把用户最关心的问题直接列成清单。

## 5.1 房源侧会发生的事

1. 曝光增加或衰减。
2. 热度增加或衰减。
3. 竞品压力增加或缓解。
4. 当前挂牌状态变化。
5. 好房分变化。

## 5.2 业主侧会发生的事

1. 焦虑上升或缓解。
2. 信任上涨或下降。
3. 耐心上涨或下降。
4. 紧迫度上涨或回落。
5. 是否更愿意接受开放日、调价、反馈。

## 5.3 客户侧会发生的事

1. 活跃度变化。
2. 疲劳度变化。
3. 注意力容量变化。
4. 整体买房紧迫度变化。
5. 是否更容易推进或更容易掉线。

## 5.4 机会侧会发生的事

1. 新关系建立。
2. 关系推进到下一阶段。
3. 关系停滞。
4. 关系流失。
5. 客户比较顺位变化。
6. 看房方式变化。

## 5.5 价格侧会发生的事

1. 市场估价变化。
2. 业主心理价变化。
3. 价格压力变化。
4. 成交可行度变化。

## 5.6 市场侧会发生的事

1. 新市场事件触发。
2. 老市场事件结束。
3. 区域需求变化。
4. 总价带流动性变化。
5. 节奏窗口切换。

---

## 6. 复杂度怎么控制

用户之前问了一个很关键的问题：

> “每天会整体计算一次么？计算量有多大？”

答案是：

会整体计算一次。
但不是全量笛卡尔积。

### 目标复杂度

```text
O(cases + owners + customers + activeRelations + activeMatters)
```

### 为什么能做到

1. 只遍历活跃 relation，不遍历所有客户乘所有房子。
2. 市场事件先改环境，再由环境影响局部对象。
3. 好房模型和价格模型只对活跃房源重算。
4. projection 最后统一算，不在每一步重复算。

### 哪些事不能做

1. 不要每天对所有客户和所有房全量重新建关系。
2. 不要在 UI 渲染阶段临时重算整套模型。
3. 不要让事件直接逐个暴力改所有对象。

---

## 7. 读写边界

日结里每一步最好明确“谁读、谁写”。

| Step | 主要读什么 | 主要写什么 |
| ---- | ---------- | ---------- |
| 0 事项结算 | `Matter` | `Matter`、`EventStore`、局部 relation |
| 1 推进时间 | `World.day` | `timeContext` |
| 2 市场事件 | `MarketState`、时间 | `MarketState`、`EventStore` |
| 3 CaseRuntime | `Case`、`MarketState` | `CaseRuntime`、`EventStore` |
| 4 Owner | `Owner`、`OwnerCaseRelation`、事件 | `OwnerRuntimeState`、`OwnerCaseRelation` |
| 5 Customer | `Customer`、`MarketState` | `CustomerRuntimeState` |
| 6 Relation | `Customer`、`Case`、`OwnerCaseRelation`、`MarketState` | `CustomerCaseRelation` |
| 7 PriceModel | `Case`、`OwnerCaseRelation`、`MarketState`、关系反馈 | `PriceModelOutput` |
| 8 GoodHouseModel | `Case`、`OwnerCaseRelation`、`PriceModelOutput`、关系池 | `GoodHouseModelOutput` |
| 9 Projection | 全部模型结果 | dashboard、日结摘要、详情提示 |

---

## 12. 已收口与后续校准

这份日结设计已经能指导一轮实现。
原来几个关键缺口已经分别收口到：

1. Matter 结算细则：
   [selling-houses-matter-template-architecture.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-matter-template-architecture.md)
2. relation 阶段晋级：
   [selling-houses-customer-opportunity-architecture.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-customer-opportunity-architecture.md)
3. 市场、组织、竞争联动：
   [selling-houses-competition-and-cosale-architecture.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-competition-and-cosale-architecture.md)
4. 日结摘要与页面投影：
   [selling-houses-projection-architecture.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-projection-architecture.md)

剩下主要是实现期的参数校准和文案库，不再是架构缺口。

---

## 13. 一句话结论

每天统一计算后，真正发生的不是“随机跳数字”，
而是下面 5 条链一起动：

1. 市场变了。
2. 房子表现变了。
3. 业主状态变了。
4. 客户和机会变了。
5. 价格与好房分重新站位了。

只要日结顺序守住，这个世界就会像一个真的市场，而不是一堆页面按钮。
