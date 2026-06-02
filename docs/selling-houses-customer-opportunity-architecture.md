# 卖房（资产顾问）客户与机会架构

最后更新：2026-04-21

这份文档回答的是：

> 客户、客户状态、客户和房子的机会，到底该怎么详细设计；机会阶段怎么推进；哪些因素在影响推进、停滞、流失。

这份文档不回答：

- 某个 UI 标签叫什么
- 某个具体概率参数填多少
- 某个接口最后叫什么名字

它只回答：

1. 客户和机会怎么拆
2. 机会阶段怎么定义
3. 推进、停滞、流失怎么判断

当前实现合同以 [selling-houses-implementation-contracts.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-implementation-contracts.md) 为准：

- `CustomerCaseRelation.stage` / `OpportunityStage` 只表达推进主线，只到 `offer`
- `closed` 不是机会阶段，不能回写成 `stage = 'closed'`
- 关系是否关闭、为什么关闭，统一看 `lifecycleStatus`
- 正式成交事实统一落在 `DealClosingEvaluation` 和 `ClosedDealRecord`
- legacy `status = 'won' | 'closed'` 只作为兼容层输入，分别映射为 `closed_by_deal` / `closed_by_case`

---

## 0. 一句话结论

最稳的结构是：

```text
Customer
  + CustomerProfile
  + CustomerRuntimeState
  + BrokerCustomerRelation
  + CustomerCaseRelation
```

一句话理解：

- `CustomerProfile`
  这个客户本来是什么样
- `CustomerRuntimeState`
  这个客户最近整体是什么状态
- `BrokerCustomerRelation`
  这个经纪人和这个客户关系怎样
- `CustomerCaseRelation`
  这个客户和这套房走到哪了

机会主线真正挂在：

> `CustomerCaseRelation`

---

## 1. 为什么这块一定要拆开

如果不拆，后面一定会乱成这几种：

- 把客户预算和某套房阶段混在一起
- 把客户整体疲劳和某套房停滞混在一起
- 把经纪人和客户的信任，错挂成客户自己的字段
- 把客户看过一套房，误写成客户整体都升温了

所以必须拆成四层。

---

## 2. CustomerProfile

回答：

> 这个客户本来是什么样。

建议至少包括：

```ts
type CustomerProfile = {
  id: string;
  budgetMin: number;
  budgetMax: number;
  preferredDistrictIds: string[];
  preferredBizAreaIds?: string[];
  requiredTags: string[];
  preferredLayoutTags: string[];
  demandType:
    | 'rigid'
    | 'family-upgrade'
    | 'school-district'
    | 'asset-allocation'
    | 'urgent-replacement';
  decisionStyle:
    | 'fast'
    | 'steady'
    | 'hesitant'
    | 'comparison-heavy';
  priceSensitivity: number;
  qualitySensitivity: number;
  locationSensitivity: number;
};
```

这层相对稳定。

---

## 3. CustomerRuntimeState

回答：

> 这个客户最近整体怎么样。

建议至少包括：

```ts
type CustomerRuntimeState = {
  customerId: string;
  activityLevel: number;
  fatigueLevel: number;
  urgencyLevel: number;
  attentionCapacity: number;
  decisionClarity: number;
  activeComparisonLoad: number;
  lastGlobalTouchDay?: number;
};
```

这层会被很多事影响：

- 连续看房太多
- 长期没找到合适房
- 节后回流
- 市场信心变化
- 最近有没有被有效跟进

---

## 4. BrokerCustomerRelation

回答：

> 这个经纪人和这个客户关系怎么样。

建议至少包括：

```ts
type BrokerCustomerRelation = {
  brokerId: string;
  customerId: string;
  trust: number;
  understandingDepth: number;
  responseRate: number;
  lastContactDay?: number;
  isPrimaryMaintainer?: boolean;
};
```

这里要注意：

1. 同一个真实客户可以和多个经纪人有关系。
2. 这些关系彼此默认不可见。
3. 所以 `BrokerCustomerRelation` 不能被简化掉。

---

## 5. CustomerCaseRelation

回答：

> 这个客户和这套房目前走到哪一步了。

这是机会主线。

建议至少包括：

```ts
type OpportunityStage =
  | 'online-inquiry'
  | 'interested'
  | 'first-showing-booked'
  | 'shown'
  | 'second-showing'
  | 'owner-meeting'
  | 'offer'
  | 'stagnated'
  | 'lost';

type CustomerCaseRelation = {
  customerId: string;
  caseId: string;
  stage: OpportunityStage;
  lifecycleStatus: 'active' | 'stagnated' | 'lost' | 'closed_by_deal' | 'closed_by_case';
  viewingMode?: 'self-arranged' | 'open-day';
  fitScore: number;
  affordabilityScore: number;
  intent: number;
  confidence: number;
  compareRank?: number;
  rivalPullScore: number;
  stagnationDays: number;
  nextStepReadiness: number;
  lastTouchDay?: number;
  lastShowingDay?: number;
  lastStageChangedDay?: number;
  isActive: boolean;
};
```

这里要强调：

- “看房”是阶段
- “自己来 / 开放日”是方式
- canonical 主线只到 `offer`，不包含 `closed`
- 成交后这条关系不再继续推进，但关闭原因应该挂在 `lifecycleStatus`

---

## 6. 机会阶段定义

机会主线只负责推进，不负责成交真因；正式成交要交给独立的成交/结算链路，最后落到 `PriceConsensusProof` 和 `ContractFact`。

## 6.1 线上咨询

说明：

- 只是进来了
- 还不能代表高意向

典型特征：

- `intent` 低到中
- `confidence` 低
- 需要进一步澄清需求

## 6.2 有意向

说明：

- 不是随便问问了
- 这套房进了客户的认真比较池

典型特征：

- `fitScore` 和 `affordabilityScore` 过线
- 对卖点有基本认可

## 6.3 预约首次看房

说明：

- 客户愿意花时间来看
- 但还没形成足够强结论

## 6.4 看房

说明：

- 客户已经有现场接触
- 开始形成真实感受

## 6.5 再次看房

说明：

- 说明它没有被第一轮直接淘汰
- 已经进入更深比较

## 6.6 见面

说明：

- 开始进入更实质性的对齐和博弈

## 6.7 出价

说明：

- 已经不是“喜欢不喜欢”
- 而是在谈能不能成交

## 6.8 为什么这里不直接写“成交”

说明：

- `offer` 代表已经进入成交前最后一段窗口
- 但是否真的成交，要交给独立成交引擎判断

也就是说：

> 机会阶段负责讲推进，生命周期状态负责讲关闭原因，成交记录负责讲落账。

## 6.9 停滞 / 流失

说明：

- 这不是正常主线阶段
- 是机会的异常状态

停滞：

- 还没死
- 但最近没有推进

流失：

- 已经明显转向别处或退出

---

## 7. 推进看什么

我建议先固定成 6 组输入。

## 7.1 客户画像输入

- 预算是否覆盖
- 区域和板块偏好是否命中
- 户型和标签需求是否命中
- 决策风格是否偏快

## 7.2 客户状态输入

- 当前活跃度
- 当前疲劳度
- 当前注意力容量
- 当前比较负荷

## 7.3 房源输入

- 好房分 / 吸引力
- 当前热度
- 当前竞争力
- 卖点清晰度

## 7.4 业主输入

- 是否配合带看
- 是否愿意见面
- 价格是否卡死
- 当前是否处在可谈窗口

## 7.5 经纪人动作输入

- 最近有没有有效推广
- 最近有没有有效跟进
- 最近有没有带看
- 最近有没有开放日
- 最近有没有把这套房真的讲清楚

## 7.6 竞争输入

- 同预算竞品数量
- 同需求竞品吸引力
- 客户最近是否明显被别的房吸走

---

## 8. 推进怎么判断

最稳的方式不是一颗裸骰子。

而是两步走。

## 8.1 第一步：先看有没有资格推进

先过门槛：

1. `fitScore` 是否过线
2. `affordabilityScore` 是否过线
3. 当前是否还有注意力空位
4. 房子是否还有足够吸引力
5. 业主侧是否允许推进

如果这些没过，不要直接算高推进概率。

## 8.2 第二步：再看 readiness

建议统一算：

```text
advanceReadiness =
  fitScore
  + affordabilityScore
  + caseAttractiveness
  + recentMarketingBoost
  + recentTouchBoost
  + trustSupport
  + ownerCooperation
  - rivalPressure
  - comparisonLoadPenalty
  - fatiguePenalty
  - stagnationPenalty
```

## 8.3 第三步：再映射成概率

例如：

```text
P(advance) = sigmoid(advanceReadiness + noise(seed))
P(stagnate) = ...
P(lost) = ...
```

这样更稳：

- 可解释
- 可调参
- 可复盘

### 8.4 成交不在这里直接判

机会推进模型只负责把关系往后推，或者让它停滞、流失。

真正的成交建议在日结后段单独判断：

```text
CustomerCaseRelation
  -> 到达 offer 或强收口候选
  -> 进入 DealClosingEvaluation
  -> 满足条件后生成 ClosedDealRecord
```

---

## 9. 停滞怎么判断

停滞不是完全随机。

通常由这几类情况导致：

1. 很久没跟进
2. 客户比较负荷太高
3. 房子吸引力不够，但又没差到直接流失
4. 价格有卡点
5. 业主不够配合

建议输出一个：

`stagnationRisk`

当它过线时，机会进入停滞或强提醒状态。

---

## 10. 流失怎么判断

流失也不应该靠一颗裸骰子。

常见原因：

1. 客户找到更优替代
2. 价格明显不接受
3. 长期没动作
4. 首看体验不好
5. 经纪人和客户关系弱

建议至少留 `lostReasonTag`：

- `price-rejected`
- `rival-better-fit`
- `stagnation-timeout`
- `showing-bad-experience`
- `broker-connection-weak`

这样后面复盘才讲得清楚。

---

## 11. 进入不同阶段最需要什么

| 阶段 | 最关键条件 |
| ---- | ---- |
| 线上咨询 -> 有意向 | 匹配度、卖点清晰、客户真实需求 |
| 有意向 -> 预约首次看房 | 到访意愿、时间匹配、基础信心 |
| 首看预约 -> 看房 | 到场率、房源承接、业主配合 |
| 看房 -> 再次看房 | 现场体验、价格接受度、替代盘压力 |
| 再次看房 -> 见面 | 深度认可、条件对齐、沟通承接 |
| 见面 -> 出价 | 心理价差、业主 willingness、关系信心 |
| 出价 -> 成交评估 / 正式成交 | 价格窗口、条件谈拢、竞争未截胡 |

---

## 12. 开放日怎么进入这条链

开放日不是独立主线。

它更像一种加速器。

它主要影响：

1. 新关系建立
2. 首看到场率
3. 房源热度
4. 比较型客户进入池子的速度

但开放日不保证深推进。

如果后续承接不够：

- 只会热闹
- 不会沉淀成高质量机会

---

## 13. Case 视角的机会分层

从房源看客户池时，不能把所有客户都当成同一种机会。

Case 视角要分成两层：

1. 未见面潜力池
2. 已见面实名机会

### 13.1 未见面潜力池

没见过面的客户，不做详细阶段管理。

他们代表的是：

- 这套房在市场上大概能吸引多少人
- 其中有多少人是高匹配
- 本周新增潜力多不多
- 主力需求画像是什么
- 为什么这套房吸引不动更多人

这一层不是 `CustomerCaseRelation[]` 明细。

它应该是一个模型投影：

```ts
type CasePotentialPoolProjection = {
  caseId: string;
  estimatedTotalCustomers: number;
  estimatedHighFitCustomers: number;
  reachableLeadCount: number;
  weeklyNewPotentialCount: number;
  dominantDemandTypes: CustomerDemandType[];
  budgetFitDistribution: {
    strong: number;
    medium: number;
    weak: number;
  };
  mainBlockers: string[];
};
```

它来自：

- 房源吸引力
- 价格模型
- 商圈客群规模
- 平台曝光
- 推广动作
- 市场冷热
- 同类竞品挤压

### 13.2 已见面实名机会

见过面的客户，才进入详细阶段管理。

这里的“见过面”可以来自：

- 自己来看过房
- 参加过开放日
- 和经纪人做过有效面访 / 深聊
- 已经有明确到访、看房、出价等事实

这一层才使用 `CustomerCaseRelation`。

它要管理：

- 当前阶段
- 上一次推进事实
- 下一步 Matter
- 停滞天数
- 流失风险
- 竞品拉走风险
- 是否进入后段

### 13.3 房源详情里应该怎么展示

```text
客户池
  潜力池
    预估潜在人群：160
    高匹配人群：28
    本周新增潜力：12
    主力画像：刚需两房 / 预算 650-750
    阻塞：价格略高、卖点不够清晰

  已见面机会
    后段机会：2
    看房后机会：4
    快流失机会：1
```

这里有一个硬规则：

> 未见面客户只表达“潜力和规模”，已见面客户才表达“阶段和推进”。

这样做的好处是：

- 不会凭空造一堆假客户
- 房源页能看到市场潜力
- 客户页能专注处理真实可推进的人
- 机会阶段不会被平台流量、曝光人群污染

---

## 14. 和其他对象怎么连

### 和 `GoodHouseModel`

- 它给机会提供基础吸引力输入

### 和 `PriceModel`

- 它决定 affordability 和 deal feasibility

### 和 `OwnerCaseRelation`

- 它决定业主愿不愿意继续往下走

### 和 `BrokerCustomerRelation`

- 它决定客户是不是愿意继续听你推进

### 和 `Matter`

- 每一次有效推进，通常都来自某个事项完成

---

## 15. 最后一句

客户架构最重要的，不是把阶段列出来。

而是把下面四件事分清楚：

1. 客户本来是什么样
2. 客户最近整体怎么样
3. 你和这个客户关系怎样
4. 这个客户和这套房走到哪了

只要这四层不乱，后面的推进、停滞、流失、开放日承接，都会顺很多。
