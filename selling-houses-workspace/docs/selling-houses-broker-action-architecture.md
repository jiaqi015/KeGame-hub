# 卖房（资产顾问）经纪人动作架构

最后更新：2026-04-21

这份文档回答的是：

> 除了沟通类型，经纪人自己做的营销推广、以及业主和客户互动类型的动作，底层到底该怎么统一设计。

这份文档不回答：

- 某个按钮文案叫什么
- 某个动作 UI 放左边还是右边
- 某个接口最后叫 `submitAction` 还是 `applyMatter`

它只回答：

1. 经纪人的动作应该怎么分类
2. 各类动作背后分别靠什么起作用
3. 这些动作怎么接到 `Matter`、`Interaction`、`Event`、`Relation`

---

## 0. 一句话结论

经纪人的动作，最稳的底层结构不是一堆散按钮，而是：

```text
BrokerActionShell
  + Topic / Strategy / MatchContext
  + Evidence / Asset / ParticipantState
  -> ActionResolver
  -> Interaction
  -> WorldEvent / EventImpact
  -> Matter / Relation / Projection 更新
```

一句话理解：

- 动作是壳
- 话题是内容
- 事实是弹药
- 策略是打法
- 解析器决定结果

页面负责讲人话，底层负责存真相。

---

## 1. 为什么不能只做“动作按钮”

如果后面还是只做：

- 打电话
- 跟进客户
- 做推广
- 开放日
- 谈价格

这些按钮，后面一定会乱。

因为这几件事本质不是同一种东西：

- 和业主聊周反馈，是沟通
- 做小红书推广，是运营
- 带客户看房，是撮合
- 申请聚焦、联卖同步、找经理过盘，是协同

它们的成功条件完全不同：

- 沟通看话题、事实、关系、风格
- 运营看渠道、内容、预算、受众
- 撮合看匹配、双方状态、现场承接
- 协同看组织关系、资源配额、他人意愿

所以一定要拆开，但又不能拆成四套互不相认的系统。

最好的做法是：

> 上层统一叫 `BrokerAction`，下层按动作家族走不同解析器。

---

## 2. 动作总模型

## 2.1 动作在领域里的位置

动作不是世界真相本身，它是世界里一次“由经纪人发起的介入”。

它和其他对象的关系是：

- `Matter`
  承载这件事的生命周期
- `BrokerAction`
  承载这次具体怎么做
- `Interaction`
  承载这次交互具体和谁发生了什么
- `Event`
  承载已经发生的事实
- `Relation`
  承载这次事实最后改了哪些关系

可以理解成：

```text
Matter = 这件事
BrokerAction = 这一步怎么做
Interaction = 这次具体发生了什么接触
Event = 已经发生的事实
Relation / Runtime = 被改动后的状态
```

## 2.2 统一动作壳

```ts
type BrokerActionFamily =
  | 'conversation'
  | 'operation'
  | 'encounter'
  | 'coordination';

type BrokerAction = {
  id: string;
  family: BrokerActionFamily;
  shellType: string;
  initiatorBrokerId: string;
  participantActorIds: string[];
  caseIds?: string[];
  ownerIds?: string[];
  customerIds?: string[];
  placeId?: string;
  relatedMatterId?: string;
  relatedCampaignId?: string;
  topicIds?: string[];
  evidenceBundleIds?: string[];
  strategyId?: string;
  plannedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  stage: 'planned' | 'ongoing' | 'done' | 'cancelled';
  resourceCost?: {
    energy?: number;
    budget?: number;
    attention?: number;
    timeBlock?: number;
  };
  outcomeSummary?: Record<string, unknown>;
};
```

这个统一壳解决两件事：

1. 页面和 `Matter` 可以用统一方式挂动作
2. 底层可以根据 `family` 分发到不同解析器

---

## 3. 四大家族

## 3.1 `conversation` 沟通型

### 一句话定义

经纪人和某个对象说话，通过“话题 + 事实”改变对方认知、情绪、信任和下一步意愿。

### 典型对象

- 业主
- 客户

### 典型动作壳

- `owner-weekly-feedback`
- `owner-pricing-talk`
- `owner-risk-stabilization`
- `customer-need-diagnosis`
- `customer-showing-invite`
- `customer-offer-guidance`

### 这类动作靠什么起作用

- 话题对不对
- 事实够不够硬
- 关系基础够不够
- 沟通方式合不合适
- 时机对不对

### 会改什么

- `OwnerCaseRelation`
- `BrokerOwnerRelation`
- `CustomerCaseRelation`
- `BrokerCustomerRelation`
- 相关 `Matter`

### 细分

- `OwnerConversation`
  见 [selling-houses-owner-conversation-architecture.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-owner-conversation-architecture.md)
- `CustomerConversation`
  本文补齐客户侧

---

## 3.2 `operation` 运营型

### 一句话定义

经纪人不是去说服某个人，而是在操作渠道、物料、活动入口和资源分配，让房源获得更多合适流量。

### 典型对象

- `Case`
- `Campaign`
- `Platform`
- `Channel`

### 典型动作壳

- `listing-polish`
- `photo-refresh`
- `short-video-publish`
- `private-channel-push`
- `focus-application`
- `campaign-registration`
- `co-sale-broadcast`

### 这类动作靠什么起作用

- 推什么内容
- 往哪推
- 推给谁
- 推多久
- 当前市场和房源适不适合推

### 会改什么

- `CaseRuntime.exposure`
- `CaseRuntime.heat`
- `CampaignParticipation`
- `CustomerCaseRelation` 的新建和升温
- `Matter` 的后续可选动作

---

## 3.3 `encounter` 撮合型

### 一句话定义

经纪人把业主、客户、房源、场地、时间真正组织到一起，推动机会往前走。

### 典型对象

- `Owner`
- `Customer`
- `Case`
- `Place`
- `Campaign`

### 典型动作壳

- `first-showing`
- `second-showing`
- `weekend-open-day-visit`
- `owner-customer-meeting`
- `offer-round`
- `contract-push`

### 这类动作靠什么起作用

- 房客匹配够不够
- 双方 readiness 到没到
- 到场率高不高
- 现场体验好不好
- 后续承接跟不跟得上

### 会改什么

- `CustomerCaseRelation.stage`
- `CustomerCaseRelation.intent`
- `CustomerCaseRelation.confidence`
- `OwnerCaseRelation.trust`
- `OwnerCaseRelation.priceExpectation`
- 成交、流失、再次带看等后续 `Matter`

---

## 3.4 `coordination` 协同型

### 一句话定义

经纪人不是直接和业主或客户推进，而是在组织体系里调资源、拉协同、争入口。

### 典型对象

- 同 ACN 经纪人
- 商圈经理 / 店经理
- 平台
- 活动主办方

### 典型动作壳

- `manager-review`
- `focus-request`
- `open-day-application`
- `co-sale-sync`
- `lead-transfer-negotiation`

### 这类动作靠什么起作用

- 组织关系
- 品牌和门店当前占有率
- 经纪人信用
- 当前盘源质量
- 资源是否紧张

### 会改什么

- `Campaign` 资格
- `FocusAllocation`
- `CoSaleRelation`
- 后续 `operation` 和 `encounter` 的成功率

---

## 4. 各家族的内部结构

## 4.1 沟通型：话题驱动

沟通型动作不能只存一个 `actionType`。

它至少要拆成：

```text
ConversationShell
  + ConversationTopic
  + EvidenceBundle
  + ConversationStyle
  -> ConversationResolver
```

### 业主侧已经固定

业主侧沿用现有设计：

- `OwnerConversationShell`
- `OwnerConversationTopic`
- `TopicEvidenceBundle`
- `ConversationStyle`
- `OwnerConversationResolver`

### 客户侧建议补齐

```ts
type CustomerConversationTopicId =
  | 'need-discovery'
  | 'area-fit'
  | 'budget-fit'
  | 'showing-invite'
  | 'showing-review'
  | 'second-visit-push'
  | 'offer-guidance'
  | 'rival-comparison'
  | 'decision-push';
```

这些话题背后用的事实通常是：

- 房源亮点
- 价格带匹配
- 同预算竞品对比
- 最近带看反馈
- 开放日或活动结果
- 市场窗口变化

客户沟通真正影响的是：

- `BrokerCustomerRelation.trust`
- `CustomerRuntimeState.decisionClarity`
- `CustomerCaseRelation.intent`
- `CustomerCaseRelation.nextStepReadiness`

一句话：

> 客户沟通的目标，不是“把客户聊开心”，而是把客户往下一步推进。

---

## 4.2 运营型：策略驱动

运营型动作的核心不是“说什么”，而是“怎么投”。

建议拆成：

```text
OperationShell
  + MarketingStrategy
  + ContentAsset
  + ChannelTarget
  + AudienceRule
  -> MarketingOperationResolver
```

### 建议的核心策略

```ts
type MarketingStrategyId =
  | 'listing-refresh'
  | 'selling-point-rebuild'
  | 'image-upgrade'
  | 'short-video-seeding'
  | 'private-domain-push'
  | 'community-open-day-signup'
  | 'focus-slot-request'
  | 'co-sale-broadcast';
```

### 运营型动作的关键输入

- 房子的卖点是否清晰
- 当前适合哪类客户
- 推广渠道的受众是谁
- 预算够不够
- 这套房是否值得拿稀缺资源

### 运营型动作的典型输出

- 曝光增加
- 准客进入池子
- 某类客户匹配概率抬升
- 开放日报名数提升
- 后续带看 `Matter` 增加

这里要强调一条：

> 运营型动作不直接等于成交推进，它先改变流量和注意力，再间接改变机会。

---

## 4.3 撮合型：匹配驱动

撮合型动作的核心不是“有没点按钮”，而是：

> 让一个客户和一套房，在一个合适时机，发生一次有效接触。

建议拆成：

```text
EncounterShell
  + MatchContext
  + ParticipantReadiness
  + PlaceContext
  + FollowupPlan
  -> EncounterResolver
```

### MatchContext 关键输入

- `GoodHouseModel`
- `PriceModel`
- 客户画像和预算
- 当前竞品替代情况
- 最近推广带来的关注度

### ParticipantReadiness 关键输入

- 业主是否愿意配合
- 客户是否有真实时间和真实意向
- 房源当前是否适合见客
- 经纪人是否还有承接精力

### 撮合型动作的典型结果

- 客户从咨询推进到有意向
- 从有意向推进到预约首次看房
- 从首次看房推进到再次看房
- 从再次看房推进到见面 / 出价
- 因体验不好、价格不合适而停滞或流失

也就是说：

> 机会状态的推进，不是客户自己的独白，而是客户和房子的匹配结果。

---

## 4.4 协同型：组织驱动

协同型动作本质上是在争组织资源。

建议拆成：

```text
CoordinationShell
  + CoordinationGoal
  + OrgContext
  + ResourceConstraint
  -> CoordinationResolver
```

### 常见目标

- 申请聚焦
- 报名商圈活动
- 找同 ACN 经纪人联卖
- 申请经理协助
- 推动店内资源倾斜

### 关键输入

- 当前品牌 / 门店 / ACN 的位置
- 房源质量和成交潜力
- 经纪人和组织的关系信用
- 当前资源是否紧张

### 典型结果

- 获得活动资格
- 获得聚焦位
- 拿到联卖支持
- 获得更多客户协同
- 被拒绝，或者优先级靠后

---

## 5. 动作矩阵

这张表是后面做动作系统时最实用的锚点。

| 家族 | 动作壳 | 主要参与者 | 内容核心 | 成功关键 | 主要影响对象 | 解析器 |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| 沟通型 | 业主周反馈 | 经纪人、业主 | 话题 + 事实包 | 关系、证据、时机 | `OwnerCaseRelation` `BrokerOwnerRelation` | `OwnerConversationResolver` |
| 沟通型 | 定价沟通 | 经纪人、业主 | 价格话题 + 成交数据 | 价格证据、业主性格 | `OwnerCaseRelation` `PriceExpectation` | `OwnerConversationResolver` |
| 沟通型 | 客户需求诊断 | 经纪人、客户 | 需求澄清 | 问得准不准 | `BrokerCustomerRelation` `CustomerRuntimeState` | `CustomerConversationResolver` |
| 沟通型 | 客户邀约看房 | 经纪人、客户 | 邀约话术 + 房源亮点 | 匹配度、时机 | `CustomerCaseRelation` | `CustomerConversationResolver` |
| 运营型 | 房源重做卖点 | 经纪人、房源 | 内容策略 | 卖点清不清 | `CaseRuntime` | `MarketingOperationResolver` |
| 运营型 | 图片/短视频升级 | 经纪人、房源、渠道 | 物料投放 | 内容质量、渠道契合 | `CaseRuntime.exposure` | `MarketingOperationResolver` |
| 运营型 | 私域推盘 | 经纪人、渠道、客群 | 目标客群投放 | 受众对不对 | `CustomerCaseRelation` `CaseRuntime.heat` | `MarketingOperationResolver` |
| 运营型 | 报名开放日/申请聚焦 | 经纪人、平台、活动 | 资源申请 | 资格和盘源质量 | `CampaignParticipation` `FocusAllocation` | `CoordinationResolver` |
| 撮合型 | 首次带看 | 经纪人、客户、房源 | 现场接触 | 房客匹配、现场体验 | `CustomerCaseRelation.stage` | `EncounterResolver` |
| 撮合型 | 再次带看 | 经纪人、客户、房源 | 深度验证 | 前次反馈、价格接受度 | `CustomerCaseRelation` | `EncounterResolver` |
| 撮合型 | 开放日到访 | 经纪人、客户、房源、活动 | 活动接触 | 到场率、现场承接 | `CustomerCaseRelation` `CampaignResult` | `EncounterResolver` |
| 撮合型 | 业主客户见面 | 经纪人、业主、客户 | 双方预期对齐 | 双方 readiness、情绪 | `OwnerCaseRelation` `CustomerCaseRelation` | `TriPartyInteractionResolver` |
| 撮合型 | 出价轮 | 经纪人、业主、客户 | 条件博弈 | 心理价差、信任 | `PriceModel` `Relation` | `TriPartyInteractionResolver` |
| 协同型 | 联卖同步 | 经纪人、同 ACN 经纪人 | 房客协同 | 组织关系、利益一致性 | `CoSaleRelation` | `CoordinationResolver` |
| 协同型 | 经理过盘 | 经纪人、经理 | 资源争取 | 信用、盘源质量 | `FocusAllocation` `CampaignPriority` | `CoordinationResolver` |

---

## 6. 动作和 `Matter` 怎么接

动作系统不能绕开 `Matter`。

后面最稳的接法是：

- `Matter`
  回答“这件事现在进行到哪”
- `BrokerAction`
  回答“这一步具体怎么做”

一个 `Matter` 里可以有多个动作。

例如：

### 例子 1：推动一套房参加周末开放日

```text
Matter: 周末开放日推动
  1. 和业主沟通开放日价值        -> conversation
  2. 向平台 / 经理报名活动        -> coordination
  3. 准备卖点物料并做预热推广      -> operation
  4. 周末承接客户到访             -> encounter
  5. 对到访客户做后续跟进          -> conversation
```

### 例子 2：推动一个客户进入出价

```text
Matter: 某客户推进成交
  1. 澄清需求和预算               -> conversation
  2. 安排首次看房                 -> encounter
  3. 做二看和竞品比较             -> conversation + encounter
  4. 组织业主客户见面             -> encounter
  5. 推动出价和条件沟通           -> encounter / negotiation
```

所以：

> Matter 是线，Action 是点。

---

## 7. 动作对白天和日结的影响

动作不是等到日结才生效。

### 7.1 白天即时发生

玩家做动作后，白天先即时更新：

- 创建或推进 `Matter`
- 生成一条或多条 `Interaction`
- 写入临时 `Event`
- 局部更新受影响的关系和运行态

例如：

- 做客户邀约
  立刻改 `nextStepReadiness`
- 做私域推盘
  立刻改 `CaseRuntime.exposure`
- 完成带看
  立刻改 `CustomerCaseRelation.stage`

### 7.2 日结统一放大

到了 `advanceDay()`，系统再统一算：

- 当天动作带来的持续影响
- 这些影响在全局竞争里有没有被放大或被抵消
- 是否引发新的机会、停滞、流失、报价、调价

一句话：

> 白天动作先改局部，日结再改全局。

---

## 8. 几条硬原则

### 8.1 不能把所有动作都做成“改概率”

动作要先产生中间状态，再由日结去消费这些状态。

比如：

- 推广动作先改曝光和客群覆盖
- 沟通动作先改 trust / clarity / readiness
- 撮合动作先改 stage / feedback / attendance

不要直接写：

- “做一次开放日，成交率 +15%”

这会很快失真。

### 8.2 动作结果不能只改一个地方

一次有效动作，通常同时影响多个对象。

比如：

- 一次好的带看
  不只改客户关系，也会改业主信心、房源反馈、后续谈价空间

所以解析器输出应该是一个影响集合，不是单字段更新。

### 8.3 动作要区分“说了”和“发生了”

例如：

- 邀约客户
  是一次沟通
- 客户真的到场看房
  是一次撮合结果

不能把两者混成一条状态。

### 8.4 动作和页面提示要分开

页面里可以说：

- 建议先做一次客户二看
- 这套房适合争取开放日

但底层不要存“建议动作”。

底层应该存：

- 当前哪些动作可做
- 做这些动作需要什么条件
- 做完会改哪些对象

建议只是投影。

---

## 9. 推荐的代码落点

如果后面开始写代码，我建议按下面拆：

```text
src/selling-houses/domain/actions/
  brokerActionTypes.ts
  brokerActionShells.ts
  customerConversationTopics.ts
  marketingStrategies.ts
  encounterShells.ts
  coordinationShells.ts
  resolvers/
    ownerConversationResolver.ts
    customerConversationResolver.ts
    marketingOperationResolver.ts
    encounterResolver.ts
    coordinationResolver.ts
    triPartyInteractionResolver.ts
```

再强调一遍：

- 沟通、运营、撮合、协同，共用一个动作母模型
- 解析逻辑分开
- 结果统一回写 `Interaction / Event / Relation / Matter`

这样后面新加动作时，不会再次把一切塞回 `Case`。

---

## 10. 最后一句

这套动作架构真正要守住的是：

> 同样叫“做动作”，底层一定要分清你是在说服谁、推什么、撮合谁、争什么资源。

只有这样，后面的客户推进、业主反馈、开放日、联卖、聚焦、报价，才能接成一个世界，而不是一堆彼此不认识的按钮。
