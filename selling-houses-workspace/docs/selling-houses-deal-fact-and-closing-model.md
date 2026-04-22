# 卖房（资产顾问）成交事实与成交引擎设计

最后更新：2026-04-21

这份文档解决一个很关键的问题：

> 成交不能只是机会走到了 `closed`，而应该是一个独立的业务事实、独立的结算对象、独立的市场信号。

用户关心的其实是这些：

1. 一共多少套房。
2. 一共成交多少套。
3. 谁和谁成交的。
4. 是哪个品牌、哪个门店、哪个经纪人完成的。
5. 是房源端成交、客源端成交，还是联卖成交。
6. 成交概率怎么受市场控制。

如果这些回答不清楚，后面：

- 日结讲不清
- 市场讲不清
- 联卖讲不清
- 丢盘丢客讲不清
- 排行榜也会失真

---

## 0. 一句话结论

最稳的做法是把“成交”拆成三层：

```text
机会状态
  说明客户和房子的推进走到哪

成交判定
  说明今天有没有形成真实成交

成交记录
  说明这笔成交到底是谁、在什么市场条件下、以什么组织关系完成的
```

一句话理解：

- `CustomerCaseRelation.stage = offer`
  代表已经谈到能不能成交
- `DealClosingEvaluation`
  代表今天这条机会有没有资格收口
- `ClosedDealRecord`
  代表这笔成交已经成为世界里的正式事实

所以：

> 成交不是机会字段的一次改值，而是世界里新增了一条正式事实。

补充当前实现状态（2026-04-20）：

- 运行态已经落了最小版 `ClosedDealRecord`
- `CustomerCaseRelation.stage` / `OpportunityStage` 仍只到 `offer`
- 结果页和正式结算开始优先消费 `closedDeals`
- `auxiliaryStats.soldCount` / 顶层 `soldCount` 已降级为兼容镜像字段，只做旧存档、旧仓储和旧投影 bridge
- 但组织归因、品牌归因、市场快照还没完全接入，仍属于下一轮扩展

当前实现合同以 [selling-houses-implementation-contracts.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-implementation-contracts.md) 为准。代码里的 `ClosedDealRecord.dealType` 已使用下划线命名，旧文档里的连字符写法只作为历史语义参考。

---

## 1. 为什么必须把成交独立出来

如果不独立，成交只写成：

```ts
relation.stage = 'closed'
```

会有 6 个问题。

### 1.1 没法回答“谁和谁成交的”

`stage = closed` 只能说明这条关系结束了。
但它说不清：

- 客户是谁
- 房源是谁
- 房源端是谁
- 客源端是谁
- 属于哪个品牌
- 是不是同 ACN 联卖

### 1.2 没法回答“市场总共成交了多少”

市场页、昨日情报、周报、品牌占有率，都需要独立成交流水。

如果只有关系状态，没有成交事实，就很难做：

- 昨日成交数
- 本周商圈成交数
- 同小区近 7 天成交
- 品牌在某商圈的成交占比

### 1.3 没法把“机会结束”和“成交落账”分开

真实业务里：

- 有些关系虽然高意向，但没成交
- 有些关系已经被别处成交
- 有些关系已经流失
- 有些关系虽然还没完全结束，但房子已经卖掉了，必须一起关闭

所以：

> 关系的结束，不等于成交的产生。

### 1.4 没法表达联卖归因

同 ACN 内一笔成交，至少要区分：

- 房源端
- 客源端
- 是否都是玩家
- 是否跨门店
- 是否跨品牌

这些不能只靠一条机会状态去猜。

### 1.5 没法让市场真正控制成交节奏

成交不应该只是：

```text
客户到了出价阶段 -> 掷一次骰子 -> closed
```

更合理的是：

```text
市场流动性
+ 价格窗口
+ 业主愿意度
+ 客户购买准备度
+ 竞争截胡风险
+ 组织协作条件
  -> 共同决定今天有没有成交
```

### 1.6 没法给结算和排行榜提供干净事实

结算要消费的，不是“看起来快成了”。
而是：

- 真的成了几单
- 成的是哪类单
- 守住了哪些关键盘
- 丢了哪些盘
- 这单是玩家单边贡献，还是联卖贡献

这些都应该来自成交事实，而不是从各种 stage 倒推。

---

## 2. 三层对象

---

## 2.1 机会状态层

这层还是 `CustomerCaseRelation`。

它回答：

> 这个客户和这套房推进到哪了。

例如：

- `online-inquiry`
- `interested`
- `first-showing-booked`
- `shown`
- `second-showing`
- `owner-meeting`
- `offer`
- `stagnated`
- `lost`

这里故意把 `closed` 的业务含义降下来。

更稳的理解是：

- `offer` 是成交前最后一个主要推进阶段
- 是否成交，由独立成交引擎判断

也就是说：

> 机会负责讲推进，成交负责讲落地。

---

## 2.2 成交判定层

这层建议单独做成一份运行时计算结果：

```ts
type DealClosingEvaluation = {
  relationId: string;
  caseId: string;
  customerId: string;
  dayIndex: number;
  isEligible: boolean;
  closeReadiness: number;
  closeProbability: number;
  blockingReasons: string[];
  supportingReasons: string[];
};
```

它回答：

> 这条机会今天有没有成交资格，成交可能性有多大，主要被什么推着走、被什么卡住。

这层只是判断，不是最终事实。

---

## 2.3 成交事实层

这层才是正式落账对象。

建议新增：

```ts
type DealType =
  | 'self_closed'
  | 'internal_cosale_closed'
  | 'external_competitor_closed'
  | 'platform_matched_closed';

type ClosedDealRecord = {
  dealId: string;
  caseId: string;
  customerId: string;
  sourceRelationId: string;
  opportunityId: string;
  dayIndex: number;
  day: number;
  closedAt: string;
  dealType: DealType;
  dealPrice: number;
  price: number;
  closeReadiness: number;
  closeProbability: number;
  blockingReasons: string[];
  supportingReasons: string[];
};
```

说明：

- 这是当前代码已落地的最小事实层，不是最终完备版。
- `opportunityId`、`day`、`price` 仍保留为 legacy alias，方便旧投影和旧存档继续工作。
- 后续如果接组织层、联卖层、市场层，需要在这条记录上继续加 `listingSide* / customerSide* / marketSnapshot*`，而不是重新发明一套成交对象。

再补一个市场快照：

```ts
type DealMarketSnapshot = {
  cityId: string;
  districtId: string;
  bizAreaId: string;
  segmentKey: string;
  marketLiquidity: number;
  marketTemperature: number;
  competitorIntensity: number;
  activeMarketEventCodes: string[];
};
```

这条记录一旦生成，就是世界事实。

后面：

- 市场统计看它
- 组织占有率看它
- 结果页看它
- 排行榜和结算也看它

---

## 3. 成交不等于机会自然结束

这里要把边界定死。

### 3.1 什么叫成交

建议定义：

> 当一条 `CustomerCaseRelation` 已经进入可收口窗口，并且价格、业主、客户、竞争、组织条件一起过线时，系统生成一条 `ClosedDealRecord`，这才叫成交。

### 3.2 什么叫机会结束

机会结束可以有很多原因：

- 成交
- 流失
- 房源撤盘
- 客户退出
- 客户被别的房成交
- 房源被别的客户成交，导致该机会失效

所以：

> `CaseEnding` 是总结层概念，`ClosedDealRecord` 是事实层概念。

### 3.3 一套房成交后要发生什么

一套房一旦生成 `ClosedDealRecord`，当天需要同步做 4 件事：

1. 该房源标记为 `closed`.
2. 这套房上的其他 `CustomerCaseRelation` 统一关闭。
3. 相关 `Matter` 进入完成或终止。
4. 生成一组联动事件。

建议事件包括：

- `deal.closed`
- `case.closed`
- `relation.closed-by-deal`
- `owner.outcome.locked`
- `market.comparable-added`

---

## 4. 成交概率由什么控制

用户提得很对：

> 要整体按照市场情况控制成交概率。

这里关键不是“市场决定一切”，而是：

> 市场决定成交难不难，具体哪一单成不成，再由价格、关系、匹配、竞争、组织共同收口。

---

## 4.1 先分三层

建议把成交概率拆成三层：

```text
市场层
  决定今天整体好不好成交

房源层
  决定这套房在当前市场里是否容易成交

关系层
  决定这个客户和这套房今天能不能真正收口
```

---

## 4.2 市场层

市场层不直接指定“哪套房成交”，它控制的是：

- `marketLiquidity`
- `showingToOfferConversion`
- `offerToCloseConversion`
- `ownerPriceLooseningPressure`
- `customerDecisionConfidence`

建议至少看这些输入：

1. 城市情绪
2. 区域需求强弱
3. 商圈流量
4. 总价带流动性
5. 当前时间窗口
6. 最近成交示范

例如：

- 市场转弱时，`offer -> deal` 的基础收口率整体下降
- 周末开放日窗口时，`interested -> shown` 更容易，但不代表 `offer -> deal` 一定高
- 同类成交示范出来后，价格理解更清晰，`priceAgreementScore` 更容易上升

---

## 4.3 房源层

房源层控制的是：

> 这套房在当前盘面里，到底是不是一个容易成交的产品。

建议至少看：

1. 好房分
2. 价格竞争力
3. 客群覆盖度
4. 当前曝光和热度
5. 竞品压力
6. 业主配合度

这层产出一个：

`caseCloseSupportScore`

它不是成交概率本身，而是“这套房配不配成交”。

---

## 4.4 关系层

关系层是最后一跳。

它控制的是：

> 这个客户现在对这套房，是否真到了可以成交的程度。

建议至少看：

1. 是否进入 `offer` 或接近 `offer`
2. `fitScore`
3. `affordabilityScore`
4. `intent`
5. `confidence`
6. 客户疲劳与比较负荷
7. 业主是否愿意见面、愿意谈条件
8. 最近是否有有效带看、复看、见面、价格沟通

这层产出：

- `customerReadinessScore`
- `priceAgreementScore`
- `closeProbability`

---

## 5. 推荐的成交判定公式

不要做成一个看不懂的黑盒。

建议固定成“两段式”。

---

## 5.1 先过资格门槛

不是所有机会都能进成交判定。

先看这些门槛：

1. 关系阶段已到 `offer`，或满足“强收口候选”条件。
2. `affordabilityScore` 过线。
3. `priceGapToMarket` 没有极端失真。
4. 业主当前不是强拒绝状态。
5. 该房源尚未成交、撤盘。

如果不过线，直接不进成交抽样。

---

## 5.2 再算成交准备度

建议统一成：

```text
closeReadiness =
  marketLiquidityScore
+ caseCloseSupportScore
+ customerReadinessScore
+ ownerReadinessScore
+ priceAgreementScore
+ organizationSupportScore
- competitionInterferenceScore
- decisionDelayPenalty
- priceMismatchPenalty
```

再把它映射成概率：

```text
closeProbability = sigmoid(closeReadiness + rngNoise)
```

这里要注意两点：

1. 概率永远是收口概率，不是静态成交率。
2. 它只在已经进入“可成交窗口”的关系上计算。

这样能保证：

- 平时不会满地乱成交
- 到了后段机会，市场好的时候更容易收口
- 市场差的时候，即使有意向也可能继续拖

---

## 5.3 市场怎么整体控节奏

为了符合“高库存、低月成交率、长决策周期”，建议再加一层全局节流：

`cityDealThrottle`

它不是控制具体哪单。
它控制的是：

> 今天全市场整体有多容易发生成交。

建议来源：

1. 城市级 `marketLiquidity`
2. 区域级 `dealVelocity`
3. 当前月份 / 周内窗口
4. 当前剧本难度

最终可理解成：

```text
finalCloseProbability =
  relationCloseProbability
* cityDealThrottle
* segmentDealThrottle
```

这样后面你要做：

- 北京整体偏冷
- 某商圈回暖
- 某总价带更难成交

都会很自然。

---

## 6. 成交记录里必须记什么

这块一定要定全，不然后面又会补字段。

至少要分 6 类。

### 6.1 基本身份

- `dealId`
- `runId`
- `dayIndex`
- `closedAt`

### 6.2 核心业务对象

- `caseId`
- `ownerId`
- `customerId`
- `sourceRelationId`

### 6.3 价格与市场快照

- `dealPrice`
- `ownerExpectedPriceAtClose`
- `marketEstimatedPriceAtClose`
- `customerBudgetBandAtClose`
- `marketContextSnapshot`

### 6.4 组织归因

- `listingSideBrokerId`
- `listingSideStoreId`
- `listingSideBrandId`
- `customerSideBrokerId`
- `customerSideStoreId`
- `customerSideBrandId`
- `acnId`

### 6.5 玩家归因

- `isPlayerListingSide`
- `isPlayerCustomerSide`
- `dealType`

### 6.6 结算辅助

- `scoringTags`
- `closeReasonSummary`

建议 `scoringTags` 例如：

- `core-listing-closed`
- `important-listing-closed`
- `internal-cosale-win`
- `external-lost-listing`
- `external-lost-customer`
- `clean-price-close`
- `owner-regret-risk`

---

## 7. 成交之后对世界的影响

成交不是只加一条记录。
它会回写世界。

建议至少做 8 类影响。

### 7.1 对房源

- 房源变成已成交
- 停止新增机会
- 关闭现有其他机会

### 7.2 对客户

- 该客户的购房主线结束
- 其他强竞争房关系进入关闭或大幅降温

### 7.3 对业主

- 锁定结果体验
- 生成满意 / 后悔 / 体面程度评估

### 7.4 对组织

- 更新品牌 / 门店 / ACN 成交统计
- 更新商圈品牌占有率

### 7.5 对市场

- 这笔成交成为新的成交样板
- 进入同小区 / 同商圈 / 同段位可比池

### 7.6 对竞争

- 竞品压力重新分配
- 同客群竞争关系重算

### 7.7 对玩家资源

- 给推广金返投
- 给即时提示
- 给结果页累计

### 7.8 对流水与复盘

- 写全局日志
- 写房源日志
- 写客户日志
- 写组织日志

---

## 8. 日结里什么时候判成交

推荐顺序是：

```text
Step 0 结算白天事项
Step 1 推进时间
Step 2 结算市场事件
Step 3 更新房源运行态
Step 4 更新业主与业主关系
Step 5 更新客户与客户机会
Step 6 更新价格模型
Step 7 计算成交候选
Step 8 判定并落成交记录
Step 9 回写世界与投影
Step 10 一致性检查
```

为什么放在价格模型后面：

1. 成交前一定要知道价格窗口有没有打开。
2. 也要先知道市场当天是不是支持成交。
3. 还要先知道客户有没有推进到足够后段。

所以把成交判定放在：

> 关系、价格、市场都更新完之后。

---

## 9. 和组织、联卖、丢盘丢客的关系

### 9.1 同 ACN 内联卖成交

如果：

- `isSameAcn = true`
- 房源端和客源端不是同一个人

那么这是一笔：

`internal_cosale_closed`

它不是简单的输赢，而是要看：

- 玩家是不是房源端
- 玩家是不是客源端
- 玩家是否两端都有

### 9.2 跨品牌成交

如果：

- `listingSideBrandId !== customerSideBrandId`
  或者
- 这套房最终被外部品牌完成了成交闭环

则要进入：

- 丢盘判断
- 丢客判断
- 品牌市场占有率更新

### 9.3 丢盘和丢客不要靠猜

建议都从 `ClosedDealRecord` 反推：

```text
如果玩家维护房源，但成交记录显示房源端不在玩家控制范围内
  -> 丢盘

如果玩家维护客户，但成交记录显示客户端不在玩家控制范围内
  -> 丢客
```

这样是最干净的。

---

## 10. 页面上怎么表达

成交独立出来以后，页面信息会更清楚。

### 10.1 市场

可以看：

- 昨日成交数
- 本周商圈成交数
- 同小区最近成交
- 哪个品牌最近成单多

### 10.2 房源详情

可以看：

- 这套房是否已成交
- 成交价
- 谁成交的
- 是自成交还是联卖成交
- 这笔成交有没有成为价格参考

### 10.3 客户详情

可以看：

- 客户最终在哪套房成交
- 是通过什么方式推进成交
- 是否参加过开放日

### 10.4 结果页

可以看：

- 一共成交几单
- 自成交几单
- 联卖几单
- 丢盘几单
- 丢客几单
- 核心盘成交几单

### 10.5 流水日志

成交日志应该尽量像业务真实记录：

- “4 月 19 日 16:40，A 房与李女士完成成交，成交价 618 万。你为房源端，经开店张晨为客源端。”
- “4 月 19 日 18:10，B 房被外品牌客户成交，形成跨品牌丢盘。”

---

## 11. 结算怎么消费成交事实

结算层不要再从机会阶段硬推结果。

建议：

### 11.1 能力分

看：

- 成交数量
- 成交质量
- 相对盘面表现
- 成交是否发生在可贵窗口

### 11.2 守盘分

重点看：

- 核心盘有没有被成交在你手里
- 有没有跨品牌丢盘
- 有没有同 ACN 弱丢盘

### 11.3 满意分

看：

- 成交价格是否体面
- 业主最终体验
- 成交前后业主是否后悔

### 11.4 排行榜

排行榜只消费：

- `RunResult`
- `RunResult.dealStats`
- `RunResult.scoreSummary`

而 `dealStats` 的唯一正式来源，就是 `ClosedDealRecord[]`

---

## 12. 推荐新增的数据对象

建议最终至少新增 4 个对象：

```ts
type DealClosingEvaluation = { ... };
type ClosedDealRecord = { ... };
type DealMarketSnapshot = { ... };
type DealStatsProjection = {
  totalClosedDeals: number;
  selfClosedDeals: number;
  internalCoSaleDeals: number;
  externalLostListings: number;
  externalLostCustomers: number;
  coreListingClosedCount: number;
};
```

---

## 13. 开发落地顺序建议

如果后面要进开发，建议顺序是：

1. 先把 `ClosedDealRecord` 建出来。
2. 再把日结里的成交判定节点单独拉出来。
3. 再把结果页和复盘页改成消费成交记录。
4. 最后把市场、品牌占有率、竞品示范这些联动接进去。

这样做的原因是：

- 先把事实记住
- 再把概率算准
- 再把解释做完整

顺序最稳。
