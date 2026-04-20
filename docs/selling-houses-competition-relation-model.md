# 卖房（资产顾问）竞品关系数据模型

最后更新：2026-04-19

这份文档只回答一件事：

> 竞品到底该怎么建模，才能不是一个 `rivalPressure` 数字，而是一套来自真实事实计算的竞争关系系统。

它重点回答：

1. 竞品是不是一种关系
2. 竞品关系从哪些事实算出来
3. 哪些对象要存在
4. 哪些关系要存在
5. 最后怎么投影成 `rivalPressure / competitionPressure / rivalPullScore`

---

## 0. 一句话结论

竞品不是单个字段，也不是单个对象。

最稳的结构是：

```text
竞品对象
  + 竞争关系
  + 客户比较关系
  + 组织关系
  + 事实事件
  -> 计算出竞争压力投影
```

所以更准确地说：

> 竞品本质上是一组由真实事实驱动、持续变化的竞争关系网络。

---

## 1. 为什么不能只做 rivalPressure

如果只做：

```ts
rivalPressure: 73
```

后面会出现 5 个问题：

1. 说不清是谁在压你。
2. 说不清是在抢房、抢客，还是抢窗口。
3. 说不清是跨品牌竞争，还是同 ACN 协作失败。
4. 说不清为什么压力今天升了。
5. 说不清该怎么缓解。

所以 `rivalPressure` 只能是结果投影，不能是底层真相。

---

## 2. 竞品到底是什么

竞品至少有四层。

### 2.1 竞品房源

这是最直观的一层。

和你这套房在争同一批客户的房源，就是竞品房源。

比如：

- 同小区同户型
- 同商圈同预算带
- 同需求命中的类似盘

### 2.2 客户比较对手

某个客户当前在比较哪些房。

这层不是“房子像不像”，而是：

> 这位客户有没有把别的房当成你这套房的替代选择。

### 2.3 组织竞争对手

谁在和你争这套房、争这批客户、争这个成交窗口。

这层包括：

- 同 ACN 联卖方
- 同品牌其他门店
- 跨品牌竞争门店
- 跨品牌竞争经纪人

### 2.4 市场盘面对手

不是某一套房，而是一类盘整体在变卷。

比如：

- 前滩 650-750 万两房突然上新变多
- 同小区低价盘集中成交
- 周末开放日流量被低总价产品吸走

---

## 3. 竞品不是一个 Actor，也不只是一个 Relation

这个边界很重要。

我建议这样理解：

- `RivalListing` / `RivalBroker` / `RivalStore` 是对象
- `CaseCompetitionRelation` / `CustomerCaseRelation` / `BrandCompetitionRelation` / `CoSaleRelation` 是关系
- `rivalPressure` / `competitionPressure` / `rivalPullScore` 是投影结果

所以：

> 竞品既不是一个单独 actor，也不是单独一条 relation，而是一组对象和关系共同构成的竞争网络。

---

## 4. 第一版必须有的对象

第一版不需要把所有竞品都做成完整 AI。

但至少要有这些对象。

### 4.1 RivalListing

```ts
type RivalListing = {
  rivalListingId: string;
  brandId: string;
  storeId?: string;
  bizAreaId: string;
  communityId?: string;

  title: string;
  listingPrice: number;
  marketEstimatedPrice?: number;
  layoutTags: string[];
  area: number;
  bedroomCount?: number;
  demandTags: string[];

  attractivenessScore: number;
  marketingPower: number;
  leadSiphonPower: number;
  currentHeat: number;
  status: 'active' | 'sold' | 'withdrawn';

  createdAt: string;
  updatedAt: string;
};
```

### 4.2 RivalStore / RivalBroker / RivalBrand

第一版不一定全拆到经纪人粒度。

可以先做：

```ts
type RivalBrand = {
  brandId: string;
  name: string;
  marketShareIndex: number;
  trustIndex: number;
};

type RivalStore = {
  storeId: string;
  brandId: string;
  bizAreaId: string;
  trafficCapturePower: number;
  negotiationPower: number;
  coSaleFriendliness?: number;
};
```

如果第一版复杂度要压低，先做到 `brand + store + listing` 就够。

---

## 5. 第一版必须有的关系

### 5.1 CaseCompetitionRelation

这是最关键的一条。

回答：

> 你的这套房，和哪套竞品房存在直接竞争关系。

```ts
type CaseCompetitionRelation = {
  relationId: string;
  caseId: string;
  rivalListingId: string;

  similarityScore: number;
  customerOverlapScore: number;

  sameCommunityScore: number;
  sameBizAreaScore: number;
  sameBudgetBandScore: number;
  sameLayoutScore: number;
  sameDemandScore: number;
  samePriceWindowScore: number;

  overallCompetitionScore: number;
  competitionType: 'direct' | 'nearby' | 'segment';

  lastComputedAt: string;
};
```

这里要强调：

> 房源竞争关系，本质不是“长得像”，而是“争同一批客户”。

所以 `customerOverlapScore` 应该权重最高。

### 5.1.1 页面上怎么表达

房子和房子之间，页面最适合表达成两件事：

1. 相似度
2. 客群重合度

也就是说，页面上不要直接抛出一堆技术字段。

更适合这样显示：

```text
B 房
相似度：82
客群重合度：76
关系：直接竞品
原因：同小区同户型，同预算客户高度重叠
```

### 5.1.2 为什么要分成两件事

因为这两个概念不是一回事。

#### 相似度

回答：

> 这两套房，从产品角度看有多像。

它主要来自：

- 同小区
- 同商圈
- 同总价带
- 同面积段
- 同户型段
- 同卖点 / 缺点结构

#### 客群重合度

回答：

> 这两套房，在争同一批客户的程度有多高。

它主要来自：

- 是否命中同一批需求
- 是否命中同一批预算
- 平台画像匹配池是否高度重叠
- 已见面客户是否高度重叠
- 客户最近是否反复把这两套房放在一起比较

所以：

> 两套房可以相似度高，但客群重合度不一定高；也可以产品没那么像，但因为预算和需求替代，客群重合度很高。

---

## 5.1.3 相似度底层怎么做

建议把“相似度”作为 `CaseCompetitionRelation` 的一个独立结果值。

```ts
type CaseSimilarityBreakdown = {
  sameCommunityScore: number;
  sameBizAreaScore: number;
  sameBudgetBandScore: number;
  sameLayoutScore: number;
  sameAreaScore: number;
  sameDemandTagScore: number;
  samePriceWindowScore: number;
};
```

建议第一版公式：

```text
similarityScore =
  0.22 * sameCommunityScore
  + 0.10 * sameBizAreaScore
  + 0.18 * sameBudgetBandScore
  + 0.18 * sameLayoutScore
  + 0.10 * sameAreaScore
  + 0.12 * sameDemandTagScore
  + 0.10 * samePriceWindowScore
```

### 字段来源

相似度主要来自房源客观信息和房源运行时信息：

- `CaseProfile.communityId`
- `CaseProfile.bizAreaId`
- `CaseProfile.layoutTags`
- `CaseProfile.area`
- `CaseProfile.bedroomCount`
- `CaseProfile.demandTags`
- `PriceModelOutput.marketEstimatedPrice`
- `CaseRuntime.listingPrice`

### 计算建议

#### sameCommunityScore

- 同小区：100
- 不同小区：0

#### sameBizAreaScore

- 同商圈：100
- 同区不同商圈：40
- 其他：0

#### sameBudgetBandScore

- 价差 3% 内：100
- 价差 3%-8%：70
- 价差 8%-15%：40
- 更大：0

#### sameLayoutScore

- 户型完全一致：100
- 房型接近：70
- 其他：0

#### sameAreaScore

- 面积差 5 平内：100
- 面积差 10 平内：70
- 面积差 20 平内：35
- 更大：0

#### sameDemandTagScore

- 命中需求标签重合率

#### samePriceWindowScore

- 两套房当前价格窗口、谈价状态是否接近

---

## 5.1.4 客群重合度底层怎么做

建议把“客群重合度”单独建成一个可解释分，而不是混进相似度里。

```ts
type CustomerOverlapBreakdown = {
  demandOverlapScore: number;
  budgetOverlapScore: number;
  platformPoolOverlapScore: number;
  activeOpportunityOverlapScore: number;
  comparisonBehaviorScore: number;
  channelOverlapScore: number;
};
```

建议第一版公式：

```text
customerOverlapScore =
  0.22 * demandOverlapScore
  + 0.18 * budgetOverlapScore
  + 0.22 * platformPoolOverlapScore
  + 0.18 * activeOpportunityOverlapScore
  + 0.12 * comparisonBehaviorScore
  + 0.08 * channelOverlapScore
```

### 字段来源

客群重合度主要来自三类输入：

#### A. 平台匹配结果

- `PlatformCaseCustomerMatch[]`
- `CasePotentialPoolProjection`

它回答：

> 平台算出来，这两套房潜在会命中同一批客户吗。

#### B. 已见面机会结果

- `CustomerCaseRelation[]`

它回答：

> 当前真实推进中的客户，有没有在比较这两套房。

#### C. 客户行为事实

- 看房
- 复看
- 竞品询问
- 对比税费 / 楼层 / 总价

它回答：

> 客户有没有把这两套房放进同一个比较集合。

### 计算建议

#### demandOverlapScore

看两套房命中的需求类型是不是接近：

- 刚需两房
- 学区需求
- 家庭改善
- 资产配置

#### budgetOverlapScore

看两套房命中的预算带是否接近。

#### platformPoolOverlapScore

看平台算出来的潜在人群交集比例。

建议理解成：

```text
poolOverlap =
  intersection(matchedCustomerSet(caseA), matchedCustomerSet(caseB))
  / union(matchedCustomerSet(caseA), matchedCustomerSet(caseB))
```

#### activeOpportunityOverlapScore

看当前真实已见面客户中，有多少在两套房之间摇摆。

#### comparisonBehaviorScore

看最近事件里：

- 有没有同一天看两套房
- 有没有主动问竞品
- 有没有拿另一套房压价

#### channelOverlapScore

看两套房是不是在争同一类流量入口：

- 开放日
- 私域推盘
- 门店推荐
- 平台流量

---

## 5.1.5 相似度和客群重合度怎么进整体竞争分

建议 `overallCompetitionScore` 不直接替代这两个值。

它应该是更高一层的总竞争分：

```text
overallCompetitionScore =
  0.28 * similarityScore
  + 0.34 * customerOverlapScore
  + 0.16 * priceAdvantageScore
  + 0.12 * rivalActivityScore
  + 0.10 * organizationPressureScore
```

这样做的好处是：

- 页面可以分别讲“像不像”和“争不争同一批人”
- 引擎可以继续用一个总竞争分算压力
- 复盘也能解释清楚：到底是产品太像，还是客群太重合

### 5.2 CustomerCaseRelation

这条关系已经在整体架构里存在。

竞品相关的核心字段在这里：

```ts
type CustomerCaseRelation = {
  customerId: string;
  caseId: string;
  fitScore: number;
  affordabilityScore: number;
  compareRank?: number;
  rivalPullScore: number;
  comparedListingIds?: string[];
  lastComparedAt?: string;
};
```

这意味着：

> 客户和竞品的比较，不需要再单独建一张“客户竞品关系表”才能起步，第一版可以先挂在 `CustomerCaseRelation` 上。

后面如果复杂度上来，再拆出 `CustomerListingComparisonRelation`。

### 5.3 BrandCompetitionRelation

回答：

> 某个品牌和另一个品牌，在这个商圈内竞争强度怎样。

```ts
type BrandCompetitionRelation = {
  relationId: string;
  bizAreaId: string;
  brandId: string;
  rivalBrandId: string;
  marketShareGap: number;
  trafficCompetitionScore: number;
  listingCompetitionScore: number;
  customerCompetitionScore: number;
  overallBrandCompetitionScore: number;
  lastComputedAt: string;
};
```

### 5.4 CoSaleRelation

这条不是纯竞品关系，但必须一起建。

回答：

> 同 ACN 内这笔协作是怎么分工的。

```ts
type CoSaleRelation = {
  relationId: string;
  acnId: string;
  caseId: string;
  listingSideBrokerId: string;
  customerSideBrokerId: string;
  status: 'proposed' | 'active' | 'completed' | 'abandoned';
  contributionScore?: number;
  createdAt: string;
  updatedAt: string;
};
```

这条关系很重要，因为：

- 同 ACN 带客成交，不该简单算竞品打败你
- 但也不能简单算完全没损失

---

## 6. 竞品关系来自哪些事实

这里是核心。

关系不能手填，必须来自事实计算。

我建议第一版至少从 6 类事实算。

### 6.1 房源相似事实

- 同小区
- 同商圈
- 同总价带
- 同面积段
- 同户型段
- 同标签组合

这类事实主要进入：

- `sameCommunityScore`
- `sameBizAreaScore`
- `sameBudgetBandScore`
- `sameLayoutScore`

### 6.2 客户重叠事实

- 是否命中同一类需求
- 是否命中同一类预算
- 是否被同类客户多次比较
- 当前客户池画像是否高度重叠

这类事实主要进入：

- `customerOverlapScore`
- `CustomerCaseRelation.comparedListingIds`
- `CustomerCaseRelation.rivalPullScore`

### 6.3 价格对位事实

- 竞品挂牌价是否更低
- 竞品市场估价是否更合理
- 竞品是否刚降价
- 竞品是否处于更好的价格窗口

这类事实主要进入：

- `overallCompetitionScore`
- `rivalPriceAdvantageScore`

### 6.4 竞品活跃事实

- 最近有没有上新
- 最近有没有开放日
- 最近有没有集中推广
- 最近有没有成交样板

这类事实主要进入：

- `marketingPower`
- `leadSiphonPower`
- `RivalActivityProjection`

### 6.5 客户比较事实

- 客户最近看了哪些房
- 客户是否问到竞品价格
- 客户是否要求比较税费 / 楼层 / 装修 / 总价
- 客户第二次看房后是否转向别盘

这类事实主要进入：

- `CustomerCaseRelation.compareRank`
- `CustomerCaseRelation.rivalPullScore`

### 6.6 组织事实

- 是同 ACN 还是跨品牌
- 品牌市场占有率
- 品牌天然信任度
- 门店流量能力
- 是否可借联卖力

这类事实主要进入：

- `BrandCompetitionRelation`
- `CoSaleRelation`
- `internalCompetitionLevel`
- `externalCompetitionLevel`

---

## 7. 竞品压力怎么从关系里算出来

### 7.1 CaseRuntime.rivalPressure

这个字段应该是房源视角下的总竞争压力。

```ts
type CaseRuntime = {
  caseId: string;
  rivalPressure: number;
  competitionPressureBreakdown?: {
    directListingCompetition: number;
    customerComparisonPressure: number;
    pricePressure: number;
    brandPressure: number;
    lostWindowPressure: number;
  };
};
```

计算来源建议是：

```text
CaseCompetitionRelation[]
  + CustomerCaseRelation[] 中的 rivalPullScore
  + BrandCompetitionRelation
  + 最近 7 天 rival events
  -> rivalPressure
```

### 7.2 CustomerCaseRelation.rivalPullScore

这是机会视角下的竞品拉扯强度。

它回答：

> 这个客户是不是正在被别的房拉走。

建议主要看：

- 客户比较中的替代盘数量
- 替代盘价格优势
- 替代盘吸引力优势
- 近期是否被别的经纪人抢先承接
- 当前这套房是不是还卡在价格 / 业主不配合

### 7.3 Brand / Store competitionPressure

这是组织视角下的竞争压力。

回答：

> 这个商圈里，别的品牌是不是正在整体抢你的盘和客户。

---

## 8. 页面上怎么投影

### 8.1 房源页

房源页不应该只显示：

```text
竞品压力：73
```

而应该显示：

```text
竞品动静
  同小区直接竞品：2 套
  低价竞品：1 套
  本周活跃竞品活动：2 次
  当前最强替代盘：B 房
  主要压力：价格略高、同预算客户容易转向
```

### 8.2 客户页 / 机会详情

应该显示：

```text
比较情况
  当前主要比较：A 房 / B 房 / C 房
  你的排序：第 2
  被拉走风险：中高
  原因：B 房更便宜，且客户已经完成二看
```

### 8.3 市场雷达

应该显示：

```text
竞品动静
  前滩两房本周新增竞品 3 套
  其中低总价盘 2 套
  某品牌周末开放日活跃
  你这一类房的客户比较正在加重
```

### 8.4 复盘

复盘要能讲：

```text
这局不是客户少，而是 A 房和 B 房在同一批客户上竞争太激烈。
李女士在二看后转向 B 房，核心原因是 B 房价格更低，且对方经纪人提前做了税费测算。
```

---

## 9. 第一版实现顺序

不要第一版就把竞品做成完整 AI 世界。

建议分 4 步。

### 第一步：先有竞品对象

先落：

- `RivalListing`
- `RivalBrand`
- `RivalStore`

### 第二步：再算房源竞争关系

先落：

- `CaseCompetitionRelation`

先解决：

- 哪套房和哪套房是直接竞争

### 第三步：再接客户比较关系

先落：

- `CustomerCaseRelation.compareRank`
- `CustomerCaseRelation.rivalPullScore`
- `comparedListingIds`

先解决：

- 某个客户为什么不往后推

### 第四步：最后再接组织竞争和联卖

再落：

- `BrandCompetitionRelation`
- `CoSaleRelation`

先解决：

- 同 ACN 和跨品牌为什么不是一回事

---

## 10. 第一版最小闭环

如果只做最小闭环，我建议做到这条线就够：

```text
RivalListing
  -> CaseCompetitionRelation
  -> CustomerCaseRelation.rivalPullScore
  -> CaseRuntime.rivalPressure
  -> 房源页 / 客户页 / 复盘页投影
```

这样你就已经不是在做一个“竞品压力黑盒”了。

你是在做：

- 有竞品对象
- 有竞争关系
- 有客户比较
- 有结果投影

---

## 11. 和现有文档的关系

这份文档补的是“竞品关系模型”这一层。

它和其他文档的关系是：

- 业务事实：为什么这套模型成立
  见 [selling-houses-business-facts.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-business-facts.md)
- 组织、ACN、联卖、品牌竞争
  见 [selling-houses-organization-acn-model.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-organization-acn-model.md)
- 客户机会推进与 rivalPullScore
  见 [selling-houses-customer-opportunity-architecture.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-customer-opportunity-architecture.md)
- 字段归属
  见 [selling-houses-field-ownership-matrix.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-field-ownership-matrix.md)

---

## 12. 最后一句

竞品不是一个“压力值”。

竞品是：

> 哪些房、哪些品牌、哪些门店、哪些客户比较关系，正在和你争同一批注意力、同一个成交窗口。

只有先把这些对象和关系建出来，`rivalPressure` 才会变成一个可信的结果，而不是一个拍脑袋数字。
