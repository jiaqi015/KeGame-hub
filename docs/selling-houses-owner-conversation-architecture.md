# 卖房（资产顾问）业主沟通架构

最后更新：2026-04-19

这份文档回答的是：

> 从架构上，怎么设计“经纪人和业主沟通”这件事。

不是写某个按钮名字。
不是写某句文案。
是写底层结构。

---

## 0. 一句话结论

反馈也好，面访也好，谈价也好，这些都只是**交互外壳**。

真正该建模的核心是：

> 一次业主沟通 = 一个交互壳 + 一个话题 + 一组事实 + 一个影响解析过程

也就是：

```text
OwnerConversationShell
  + ConversationTopic
  + TopicEvidenceBundle
  + ConversationStyle
  -> OwnerConversationResolver
  -> WorldEvent / EventImpact
```

一句话理解：

- 动作壳决定“这次是在什么场景下聊”
- 话题决定“你在聊什么”
- 事实包决定“你拿什么聊”
- 解析器决定“这个业主听完会怎么变”

---

## 1. 为什么不能只做“动作”

如果只做：

- `首次面访`
- `周度反馈`
- `定价建议`

这类动作按钮，会有 4 个问题：

1. 同一个动作里到底聊什么讲不清。
2. 只会变成“点一下改几个数”。
3. 没法表达同样是周度反馈，有的重点讲市场，有的重点讲客户。
4. 没法解释为什么同样的话，对不同业主效果完全不同。

所以“动作”只能是入口，不该是核心。

---

## 2. 四层结构

### 2.1 第一层：交互壳

交互壳回答：

> 这次沟通是以什么形式发生的。

建议叫：

- `OwnerConversationShell`

例如：

- `first-visit`
- `weekly-feedback`
- `deep-diagnosis`
- `pricing-talk`
- `risk-stabilization`
- `open-day-invite`

它只解决场景，不解决内容。

### 2.2 第二层：话题

话题回答：

> 这次主要聊什么。

建议独立成：

- `OwnerConversationTopic`

### 2.3 第三层：事实包

事实包回答：

> 这次拿哪些事实来支撑这个话题。

建议独立成：

- `TopicEvidenceBundle`

### 2.4 第四层：影响解析器

解析器回答：

> 对这个业主、这套房、这段关系来说，这次沟通最后产生什么影响。

建议独立成：

- `OwnerConversationResolver`

---

## 3. 对象定义

## 3.1 OwnerConversationShell

```ts
type OwnerConversationShellId =
  | 'first-visit'
  | 'weekly-feedback'
  | 'deep-diagnosis'
  | 'pricing-talk'
  | 'risk-stabilization'
  | 'open-day-invite'
  | 'promotion-mobilization'
  | 'deal-push';

type OwnerConversationShell = {
  id: OwnerConversationShellId;
  name: string;
  description: string;
  allowedTopicIds: OwnerConversationTopicId[];
  allowedStyles: ConversationStyleId[];
  energyCost: number;
  budgetCost?: number;
};
```

这个层的意思是：

- 首次面访
  更适合讲共识、市场、后续计划
- 周度反馈
  更适合讲进展、反馈、问题、下周安排
- 定价沟通
  更适合讲价格、成交、竞品、客户反馈

也就是说，动作壳限制“适合聊什么”，但不直接决定效果。

---

## 3.2 OwnerConversationTopic

这是核心。

```ts
type OwnerConversationTopicId =
  | 'market-status'
  | 'recent-transactions'
  | 'customer-progress'
  | 'showing-review'
  | 'price-position'
  | 'rival-pressure'
  | 'open-day-value'
  | 'cooperation-request'
  | 'next-step-plan'
  | 'risk-warning';

type OwnerConversationTopic = {
  id: OwnerConversationTopicId;
  name: string;
  objective:
    | 'build-trust'
    | 'align-expectation'
    | 'push-price'
    | 'push-cooperation'
    | 'reduce-anxiety'
    | 'accelerate-deal';
  requiredEvidenceTypes: EvidenceTypeId[];
  primaryTargets: ConversationImpactTarget[];
};
```

### 建议固定的核心话题

1. `market-status`
   市场状态
2. `recent-transactions`
   成交数据
3. `customer-progress`
   客户进展
4. `showing-review`
   带看情况
5. `price-position`
   价格情况
6. `rival-pressure`
   竞品情况
7. `open-day-value`
   开放日价值
8. `cooperation-request`
   配合请求
9. `next-step-plan`
   下周安排
10. `risk-warning`
   风险提示

---

## 3.3 TopicEvidenceBundle

这层决定“你不是空聊”。

```ts
type EvidenceTypeId =
  | 'market-data'
  | 'transaction-data'
  | 'customer-progress'
  | 'showing-feedback'
  | 'price-gap'
  | 'rival-update'
  | 'campaign-result'
  | 'plan-summary';

type EvidenceItem = {
  id: string;
  type: EvidenceTypeId;
  sourceType: 'market' | 'event' | 'relation' | 'model' | 'campaign';
  sourceId?: string;
  label: string;
  value: string | number;
  happenedAt?: string;
  confidence?: number;
};

type TopicEvidenceBundle = {
  topicId: OwnerConversationTopicId;
  caseId: string;
  ownerId: string;
  evidenceItems: EvidenceItem[];
  summary: string;
};
```

### 话题和事实的绑定关系

#### 1. 市场状态

可绑定：

- `MarketState`
- `MarketModelOutput`
- 区域需求变化事件
- 商圈流量变化事件

#### 2. 成交数据

可绑定：

- 同小区成交
- 同商圈成交
- 同总价带成交
- 平均成交周期

#### 3. 客户进展

可绑定：

- 活跃客户数
- 后段客户数
- 哪几个客户进入二看 / 见面 / 出价
- 停滞客户数

#### 4. 带看情况

可绑定：

- 带看次数
- 带看后反馈
- 流失原因
- 看后犹豫点

#### 5. 价格情况

可绑定：

- 挂牌价
- 市场估价
- 心理价
- 价格压力
- 成交可行度

#### 6. 竞品情况

可绑定：

- 同类竞品新增
- 竞品降价
- 竞品成交
- 竞品开放日 / 聚焦动作

---

## 3.4 ConversationStyle

同一个话题，怎么说，也会影响结果。

```ts
type ConversationStyleId =
  | 'data-first'
  | 'empathy-first'
  | 'pressure-first'
  | 'plan-first'
  | 'market-first'
  | 'customer-first';

type ConversationStyle = {
  id: ConversationStyleId;
  name: string;
  description: string;
};
```

### 例子

- `data-first`
  先摆数据，适合理性型业主
- `empathy-first`
  先稳情绪，适合焦虑、防御高的业主
- `pressure-first`
  先讲窗口和风险，适合短窗口盘
- `plan-first`
  先讲接下来怎么卖，适合想要确定感的业主

---

## 3.5 OwnerConversationInteraction

这是一次真正落地的沟通实例。

```ts
type OwnerConversationInteraction = {
  id: string;
  shellId: OwnerConversationShellId;
  topicId: OwnerConversationTopicId;
  styleId: ConversationStyleId;
  evidenceBundleId: string;
  brokerId: string;
  ownerId: string;
  caseId: string;
  placeId: string;
  happenedAt: string;
  relatedMatterId?: string;
  outcome?: Record<string, unknown>;
};
```

---

## 4. 影响解析器

## 4.1 核心原则

你前面说得很对。

> 业主画像 + 房源情况，决定了这些话题最后的影响。

我把它再补完整一点：

> 话题的效果，取决于业主画像、当前情绪、你和业主的关系、这套房当前状态、你拿出的事实质量，以及你的表达方式。

所以解析器输入应该至少包括：

- `OwnerProfile`
- `OwnerRuntimeState`
- `BrokerOwnerRelation`
- `OwnerCaseRelation`
- `CaseRuntime`
- `PriceModelOutput`
- `GoodHouseModelOutput`
- `OwnerConversationTopic`
- `TopicEvidenceBundle`
- `ConversationStyle`

## 4.2 输出什么

```ts
type OwnerConversationOutcome = {
  trustDelta: number;
  patienceDelta: number;
  priceFlexibilityDelta: number;
  cooperationDelta: number;
  marketBeliefDelta: number;
  emotionDelta: number;
  notes: string[];
};
```

---

## 5. 影响哪些底层对象

一次业主沟通，主要影响 4 层：

### 5.1 BrokerOwnerRelation

- 信任
- 维护深度
- 最近联系质量

### 5.2 OwnerCaseRelation

- 耐心
- 调价松动度
- 配合度
- 是否接受开放日
- 是否接受联合推广
- 是否认同当前路径

### 5.3 OwnerRuntimeState

- 情绪
- 焦虑
- 市场认知

### 5.4 Matter / Event

- 当前事项是否推进
- 是否产出新的后续事项
- 是否记录为关键转折事件

---

## 6. 同一个话题为什么效果不同

这部分必须在架构上成立。

比如同样是 `price-position`：

- 对理性、着急、信任高的业主
  可能提高调价松动度
- 对强势、好面子、信任低的业主
  可能让防御更强
- 对已经看过多轮反馈的业主
  可能增强市场认知
- 对刚接手、关系还薄的业主
  可能被理解成“你想压价”

所以：

同一个 Topic 不能写死“+trust / +priceFlexibility”。

它必须经过 Resolver。

---

## 7. 话题和动作壳的关系

动作壳不是没用。

它主要提供三件事：

1. 玩家入口
   玩家看到的是“首次面访”“周度反馈”，不是抽象 topic
2. 话题范围
   不同壳允许的 topic 不一样
3. 成本和节奏
   不同壳消耗精力、时间和场景不同

### 例子

#### 首次面访

适合的话题：

- 市场状态
- 下周计划
- 配合请求

#### 周度反馈

适合的话题：

- 客户进展
- 带看情况
- 市场状态
- 风险提示

#### 定价沟通

适合的话题：

- 成交数据
- 价格情况
- 竞品情况

#### 开放日邀请

适合的话题：

- 开放日价值
- 配合请求
- 客户池情况

---

## 8. 和事件流怎么接

一次业主沟通做完，不是直接“改状态结束”。

建议固定产出这两类东西：

### 8.1 沟通完成事件

比如：

- `owner.conversation.completed`
- `owner.topic.market-status.discussed`
- `owner.topic.price-position.discussed`

### 8.2 状态影响事件

比如：

- `owner.trust.gain`
- `owner.patience.loss`
- `owner.price-flexibility.up`
- `owner.cooperation.up`
- `owner.market-belief.up`

这样复盘和回放才能讲清：

- 这次聊了什么
- 用了哪些事实
- 为什么会有这个结果

---

## 9. 最推荐的实现顺序

如果要从现在代码往这套架构迁，我建议分 4 步。

### 第一步

先把现有业主动作外壳保留：

- 首次面访
- 周度反馈
- 深度诊断
- 定价建议
- 询问心理价
- 商讨挂牌价调整
- 邀请参加开放日

### 第二步

给每个壳加上：

- 可选话题
- 话题证据包
- 说法风格

### 第三步

把效果从“固定数值”改成：

- `OwnerConversationResolver` 计算结果

### 第四步

把关键沟通接入：

- EventStore
- ReviewProjection
- CaseTimelineProjection

---

## 10. 最后一句设计原则

以后只要再遇到“和业主沟通怎么设计”的问题，就先问 5 句：

1. 这次是用什么壳在聊？
2. 这次核心话题是什么？
3. 这次拿了哪些事实？
4. 这个业主会怎么理解这些事实？
5. 这次沟通最后影响了哪一层状态？

如果这 5 句答得清，业主沟通系统就不会退化成“点一个按钮加 5 点信任”。
