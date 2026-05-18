# 卖房（资产顾问）字段归属表

最后更新：2026-04-21

这份文档只解决一个最实际的问题：

> 一个字段到底该挂在哪，为什么挂在那里，以后代码迁移时怎么判断对不对。

这份表不是讲抽象原则。
是讲落地归属。

如果后面有人继续把字段往 `Case` 上堆，或者把玩家视角字段写回世界状态，就拿这份表直接拦。

当前实现层 canonical 命名和最小字段合同，以 [selling-houses-implementation-contracts.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-implementation-contracts.md) 为准。本表只判断“字段该归谁”，不覆盖实现合同里的枚举、主键和 legacy bridge 口径。

---

## 0. 先记 5 句话

1. 谁自己的属性，就挂谁身上。
2. 两者之间才成立的状态，挂 `Relation`。
3. 一次具体工作，挂 `Matter`。
4. 给页面看的总结，不回写世界，只做 `Projection`。
5. 玩家当前点到哪、看到什么、先看什么，挂 `Session / Viewport`。

---

## 1. 归属总表

| 字段 | 应属对象 | 类型 | 为什么 | 当前最容易错挂到哪 |
| ---- | -------- | ---- | ------ | ---------------- |
| caseId | `Case` | identity | 房源主键 | 不该散落到 relation payload 当真相 |
| title | `CaseProfile` | 画像 | 房子本体资料 | 不该放 UI projection 当唯一来源 |
| community | `CaseProfile` | 画像 | 房子客观属性 | 不该只放市场快照 |
| district | `CaseProfile` | 画像 | 空间归属 | 不该放客户画像 |
| bizArea | `CaseProfile` | 画像 | 空间归属 | 不该放市场事件实例里当唯一来源 |
| layout | `CaseProfile` | 画像 | 房子客观属性 | 不该挂到客户 relation |
| area | `CaseProfile` | 画像 | 房子客观属性 | 不该挂到价格模型输出 |
| orientation | `CaseProfile` | 画像 | 房子客观属性 | 不该挂到好房模型输出 |
| decoration | `CaseProfile` | 画像 | 房子客观属性 | 不该挂到 D2 结果里覆盖原始值 |
| tags | `CaseProfile` | 画像 | 房子卖点标签 | 不该挂到客户身上 |
| disadvantages | `CaseProfile` | 画像 | 房子缺点 | 不该放到 relation |
| listingPrice | `CaseRuntime` | 运行时 | 当前真实挂牌价是当前在卖这套房的状态 | 不该跟 `ownerPsychPrice` 混成一个值 |
| marketEstimatedPrice | `PriceModelOutput` | 模型输出 | 这是模型评估结果 | 不该写回 `CaseProfile` |
| goodHouseScore | `GoodHouseModelOutput` | 模型输出 | 这是第三方评估结果 | 不该写回 `Case` 当原始字段 |
| heat | `CaseRuntime` | 运行时 | 房源当前热度是房源运行时表现 | 不该放客户 relation |
| exposure | `CaseRuntime` | 运行时 | 房源当前曝光是房源运行时表现 | 不该写成玩家私有信息 |
| rivalPressure | `CaseRuntime` | 运行时 | 某房当前竞争压力属于房源局部运行时 | 不该直接写到 `Customer` |
| companyId | `BrokerageCompany` | identity | 经纪公司主键 | 不该写成 broker 文案字段 |
| brandId | `Brand` | identity | 品牌主键 | 不该只挂到经纪人名字里 |
| brandReputation | `Brand` | 组织状态 | 品牌口碑影响客户和业主信任 | 不该写到单个 broker |
| acnId | `ACN` | identity | 品牌内部协作网络主键 | 不该和 company 混成一个字段 |
| acnCollaborationPower | `ACN` | 组织状态 | ACN 协作能力影响房源和客户流转 | 不该写到 market |
| internalCompetitionLevel | `ACN` | 组织状态 | 同品牌内部竞争强度 | 不该只写 rivalPressure |
| listingVisibilityRules | `ACN` | 组织规则 | 同 ACN 房源公开规则 | 不该写成市场曝光 |
| customerPrivacyRules | `ACN` | 组织规则 | 客户不是公开池，客户是经纪人私有维护资产 | 不该写成 AcnCustomerVisibility |
| platformMatchingRules | `ACN` | 组织规则 | 平台如何基于客户画像做房客匹配 | 不该写到前台可见规则 |
| listingSideRules | `ACN` | 组织规则 | ACN 内房源端分工规则 | 不该写到单个 broker |
| customerSideRules | `ACN` | 组织规则 | ACN 内客源端分工规则 | 不该写到 customer |
| coSaleRules | `ACN` | 组织规则 | 同 ACN 联卖规则 | 不该写成 rival 规则 |
| brandMarketShare | `Brand` | 组织状态 | 品牌在商圈的市场占有率 | 不该写到 MarketState 当外部环境 |
| platformCaseCustomerMatchId | `PlatformCaseCustomerMatch` | 模型输出 | 平台后台计算出的房客匹配结果 | 不该当成经纪人可见客户 |
| caseOpportunityScore | `GoodHouseModelOutput` 或 `PlatformMatchOutput` | 模型输出 | 房源基于客户画像的机会分 | 不该写回 CustomerCaseRelation |
| potentialCustomerCount | `PlatformMatchOutput` | 模型输出 | 匿名潜在客户规模 | 不该暴露客户明细 |
| listingSideBrokerId | `CoSaleRelation` | 关系 | 一次联卖的房源端经纪人 | 不该写到 Case 本体 |
| customerSideBrokerId | `CoSaleRelation` | 关系 | 一次联卖的客源端经纪人 | 不该写到 Customer 本体 |
| lostListingRisk | `OwnerCaseRelation` 或 `CaseRuntime` | 运行时/关系 | 玩家维护房源被别人成交的风险 | 不该只写 rivalPressure |
| lostListingEvent | `WorldEvent` | 事实 | 房源被其他品牌或非主控方成交的事实 | 不该写成日结文案 |
| storeId | `Store` | identity | 门店主键 | 不该写到 customer |
| storeTrafficPower | `Store` | 组织状态 | 门店自然流量能力 | 不该写到 case 本体 |
| managerId | `BizAreaManager` | identity | 商圈经理主键 | 不该写到 MarketState |
| managerBrokerIds | `BizAreaManager` | 组织关系 | 商圈经理管理哪些经纪人 | 不该写成经纪人数组文案 |
| managerCoordinationPower | `BizAreaManager` | 组织状态 | 商圈经理联卖协调能力 | 不该写到 ACN 总规则 |
| brokerOwnerRelationId | `BrokerOwnerRelation` | 关系 | 经纪人维护某个业主 | 不该把 ownerIds 直接塞 Broker |
| brokerCustomerRelationId | `BrokerCustomerRelation` | 关系 | 经纪人维护某个客户 | 不该把 customerIds 直接塞 Broker |
| ownerMaintenanceLevel | `BrokerOwnerRelation` | 关系状态 | 经纪人对业主的维护深度 | 不该写 Owner 本体 |
| customerMaintenanceLevel | `BrokerCustomerRelation` | 关系状态 | 经纪人对客户的维护深度 | 不该写 Customer 本体 |
| multiBrokerConsultingLevel | `CustomerRuntimeState` | 运行时 | 客户同时找多个经纪人的程度 | 不该写到某条 BrokerCustomerRelation |
| brokerOverlapRisk | `CustomerRuntimeState` | 运行时 | 同一客户多方咨询带来的撞客风险 | 不该写成 ACN 公开客户 |
| attentionFragmentation | `CustomerRuntimeState` | 运行时 | 客户注意力被多个经纪人分散 | 不该写到 CustomerCaseRelation |
| customerIdentityResolutionId | `CustomerIdentityResolution` | 平台后台 | 平台识别多个客户关系是否为同一真实客户 | 不该暴露给普通经纪人 |
| ownerId | `Owner` | identity | 业主主体 | 不该被 case 内嵌替代 |
| ownerMotivation | `OwnerProfile` | 画像 | 业主本来为什么卖 | 不该挂到 case |
| ownerPersonality | `OwnerProfile` | 画像 | 业主性格 | 不该挂到 case |
| riskPreference | `OwnerProfile` | 画像 | 业主风险偏好 | 不该挂到 price model 输出 |
| emotion | `OwnerRuntimeState` | 运行时 | 业主当前情绪是业主整体状态 | 不该直接挂 relation |
| anxietyLevel | `OwnerRuntimeState` | 运行时 | 业主整体焦虑度 | 不该直接挂 case |
| marketUnderstanding | `OwnerRuntimeState` | 运行时 | 业主对市场理解是其自身能力状态 | 不该挂在 projection |
| ownerCaseTrust | `OwnerCaseRelation` | 关系 | 是业主对经纪人卖这套房的信任 | 现在最容易误挂在 `Case` |
| ownerCasePatience | `OwnerCaseRelation` | 关系 | 是卖这套房这件事上的耐心 | 现在最容易误挂在 `Case` |
| ownerCaseUrgency | `OwnerCaseRelation` | 关系 | 是这套房的出售紧迫度 | 现在最容易误挂在 `OwnerRuntimeState` |
| bottomPrice | `OwnerCaseRelation` | 关系 | 是这套房上的底价，不是业主全部房子的底价 | 现在最容易误挂在 `Case` |
| acceptsOpenDay | `OwnerCaseRelation` | 关系 | 对这套房是否接受开放日 | 不该挂到 `OwnerProfile` |
| acceptsPriceCut | `OwnerCaseRelation` | 关系 | 对这套房是否接受调价 | 不该挂到 `OwnerRuntimeState` |
| customerId | `Customer` | identity | 客户主体 | 不该用 relation 反推主体 |
| budgetMin | `CustomerProfile` | 画像 | 客户本来预算 | 不该挂 relation |
| budgetMax | `CustomerProfile` | 画像 | 客户本来预算 | 不该挂 relation |
| preferredDistricts | `CustomerProfile` | 画像 | 客户稳定偏好 | 不该挂到市场状态 |
| preferredLayouts | `CustomerProfile` | 画像 | 客户稳定偏好 | 不该写到某一套 case |
| demandTags | `CustomerProfile` | 画像 | 客户买房核心需求 | 不该写 relation 当临时结果 |
| priceSensitivity | `CustomerProfile` | 画像 | 客户价格敏感度 | 不该放 opportunity 输出 |
| decisionStyle | `CustomerProfile` | 画像 | 客户决策风格 | 不该挂 `CustomerRuntimeState` |
| activityLevel | `CustomerRuntimeState` | 运行时 | 客户当前活跃度 | 不该写在单房 relation |
| fatigueLevel | `CustomerRuntimeState` | 运行时 | 客户当前疲劳度 | 不该写在单房 relation |
| attentionCapacity | `CustomerRuntimeState` | 运行时 | 客户当前还能同时盯多少套 | 不该写在某个 case |
| currentFocusSlots | `CustomerRuntimeState` | 运行时 | 客户当前注意力分配容量 | 不该写成 market 指标 |
| globalUrgency | `CustomerRuntimeState` | 运行时 | 客户整体买房紧迫度 | 不该直接等于某条机会阶段 |
| fitScore | `CustomerCaseRelation` | 关系 | 客户和房子的匹配结果 | 不该写回客户画像 |
| affordabilityScore | `CustomerCaseRelation` | 关系 | 客户预算与价格的匹配结果 | 不该写回 case |
| demandMatchScore | `CustomerCaseRelation` | 关系 | 客户需求与房子的匹配结果 | 不该写回客户画像 |
| attractivenessScore | `CustomerCaseRelation` | 关系 | 客户对这套房感受到的吸引力 | 不该替代 D2 |
| marketingExposureScore | `CustomerCaseRelation` | 关系 | 客户对这套房实际接触到的曝光强度 | 不该写回 `CaseRuntime.exposure` |
| intent | `CustomerCaseRelation` | 关系 | 客户对这套房的购买意向 | 不该写到 `CustomerRuntimeState` |
| confidence | `CustomerCaseRelation` | 关系 | 客户觉得这套房能不能成 | 不该写到 `CustomerRuntimeState` |
| stage | `CustomerCaseRelation` | 关系 | 这是这条机会走到哪一步 | 不该写在 `Customer` |
| lifecycleStatus | `CustomerCaseRelation` | 关系 | 进行中/停滞/流失/因成交关闭/因房源关闭是单房关系状态 | 不该写在 `Customer` |
| compareRank | `CustomerCaseRelation` | 关系 | 客户内部比较中的位置 | 不该写在 `CaseRuntime` |
| rivalPullScore | `CustomerCaseRelation` | 关系 | 竞品对这条机会的拉扯 | 不该写在客户整体状态 |
| stagnationDays | `CustomerCaseRelation` | 关系 | 这条机会卡了多少天 | 不该写到客户整体疲劳度 |
| viewingMode | `CustomerCaseRelation` | 关系 | 自己来/开放日是这条机会的看房方式 | 不该挂到阶段定义里 |
| lastAdvanceDay | `CustomerCaseRelation` | 关系 | 记录这条关系最近推进时间 | 不该挂 customer |
| matterId | `Matter` | identity | 一次事项主键 | 不该用 event id 代替 |
| matterScene | `Matter` | 事项 | 这件事在业务上是什么 | 不该混同 template |
| matterTemplate | `Matter` | 事项 | 事项用什么交互方式处理 | 不该写 relation |
| matterLifecycleCategory | `Matter` 或派生分类 | 事项分类 | 汇报/诊断/执行/博弈是设计分类，不是当前 `template` 枚举 | 不该覆盖 interaction template |
| matterStage | `Matter` | 事项 | 事项自身流程进到哪 | 不该写 relation stage |
| initiatorActorId | `Matter` | 事项 | 谁发起了这次事 | 不该写成 event 中唯一来源 |
| subjectIds | `Matter` | 事项 | 这次事涉及谁和什么 | 不该只塞一堆字符串在 UI |
| openedAtDay | `Matter` | 事项 | 开始时间 | 不该只写事件不留事项态 |
| closedAtDay | `Matter` | 事项 | 结束时间 | 不该写 relation |
| matterOutcome | `Matter` | 事项 | 完成结果是事项结果 | 不该直接写 projection |
| eventId | `WorldEvent` | 事实 | 事实主键 | 不该拿 UI log 代替 |
| kind | `WorldEvent` | 事实 | 发生了什么 | 不该放 projection 当唯一来源 |
| actorId | `WorldEvent` | 事实 | 谁触发 | 不该省掉来源 |
| subjectId | `WorldEvent` | 事实 | 影响对象是谁 | 不该埋在文案里 |
| payload | `WorldEvent` | 事实 | 发生细节 | 不该作为页面长驻状态 |
| city | `MarketState` | 环境 | 市场范围 | 不该写到 case 上当唯一来源 |
| districtDemandIndex | `MarketState` | 环境 | 区域需求强弱是环境变量 | 不该写到单个客户 |
| segmentLiquidity | `MarketState` | 环境 | 户型/总价带流动性是环境变量 | 不该写 relation |
| weekendTrafficBoost | `MarketState` | 环境 | 周末节奏影响是环境变量 | 不该写到单个 matter 里当真相 |
| selectedCaseId | `Session / Viewport` | 视角 | 这是玩家当前正在看哪套 | 不该写回 world |
| currentTab | `Session / Viewport` | 视角 | 这是 UI 导航状态 | 不该写回 world |
| panelState | `Session / Viewport` | 视角 | 页面展开收起状态 | 不该写回 world |
| priorities | `Session / Viewport` | 视角派生 | 这是玩家当前视角下的优先级 | 现在最容易误挂 `Case` |
| scheduleSuggestion | `Projection` | 投影 | 这是算给玩家看的建议 | 不该写回 world |
| riskNote | `Projection` | 投影 | 这是页面说明 | 不该写回 relation |
| leaderboardScore | `Projection` | 投影 | 榜单展示字段 | 不该反过来驱动世界 |

---

## 2. Case 相关字段

### 2.1 应该留在 Case 的

| 字段 | 应属对象 | 为什么 |
| ---- | -------- | ------ |
| 标题、小区、板块、户型、面积、朝向、楼层、装修 | `CaseProfile` | 这些是房子的客观资料 |
| 热度、曝光、竞品压力、当前挂牌价 | `CaseRuntime` | 这些是房子当前在市场里的表现 |

### 2.2 不该继续挂在 Case 的

| 字段 | 正确归属 | 为什么 |
| ---- | -------- | ------ |
| trust | `OwnerCaseRelation` | 是业主在卖这套房时对经纪人的信任 |
| patience | `OwnerCaseRelation` | 是卖这套房这件事的耐心 |
| urgency | `OwnerCaseRelation` | 是这套房出售关系上的急迫度 |
| bottomPrice | `OwnerCaseRelation` | 是这套房上的心理底价 |
| customerIntent | `CustomerCaseRelation` | 是客户对这套房的意向 |
| opportunityStage | `CustomerCaseRelation` | 是客户对这套房的推进阶段 |
| priorities | `Session / Viewport` | 是玩家视角排序，不是房子本体 |

---

## 3. Owner 相关字段

### 3.1 Owner 自己的字段

| 字段 | 应属对象 | 为什么 |
| ---- | -------- | ------ |
| 出售动机 | `OwnerProfile` | 业主本来为什么卖 |
| 性格、风险偏好、是否强势 | `OwnerProfile` | 这是人的类型 |
| 当前情绪、焦虑度、市场理解 | `OwnerRuntimeState` | 这是业主当前整体状态 |

### 3.2 业主和房子的关系字段

| 字段 | 应属对象 | 为什么 |
| ---- | -------- | ------ |
| trust | `OwnerCaseRelation` | 对你卖这套房的信任 |
| patience | `OwnerCaseRelation` | 对卖这套房的耐心 |
| urgency | `OwnerCaseRelation` | 对卖这套房的时间压力 |
| bottomPrice | `OwnerCaseRelation` | 对这套房的心理底线 |
| acceptsOpenDay | `OwnerCaseRelation` | 对这套房是否接受开放日 |
| acceptsPriceCut | `OwnerCaseRelation` | 对这套房是否接受调价 |

---

## 4. Customer 相关字段

### 4.1 Customer 自己的字段

| 字段 | 应属对象 | 为什么 |
| ---- | -------- | ------ |
| 预算、目标板块、偏好户型、需求标签 | `CustomerProfile` | 客户稳定偏好 |
| 价格敏感度、决策风格 | `CustomerProfile` | 客户固有风格 |
| 活跃度、疲劳度、注意力容量、整体紧迫度 | `CustomerRuntimeState` | 客户当前整体状态 |

### 4.2 Customer 和 Case 的关系字段

| 字段 | 应属对象 | 为什么 |
| ---- | -------- | ------ |
| fitScore | `CustomerCaseRelation` | 客户和房子的匹配结果 |
| affordabilityScore | `CustomerCaseRelation` | 客户预算与价格的匹配 |
| intent | `CustomerCaseRelation` | 客户对这套房的意愿 |
| confidence | `CustomerCaseRelation` | 客户对推进成功的信心 |
| stage | `CustomerCaseRelation` | 这条机会当前阶段 |
| lifecycleStatus | `CustomerCaseRelation` | 推进中、停滞、流失、因成交关闭、因房源关闭 |
| compareRank | `CustomerCaseRelation` | 这套房在客户候选池里的排序 |

---

## 5. Matter 和 Event 的分工

### 5.1 Matter 放什么

| 字段 | 应属对象 | 为什么 |
| ---- | -------- | ------ |
| scene | `Matter` | 这次事在业务上是什么 |
| template | `Matter` | 这次事用什么交互方式完成 |
| lifecycleCategory | `Matter` 或派生分类 | 如果要记录汇报/诊断/执行/博弈，应独立于当前 `template` 字段 |
| stage | `Matter` | 这次事当前进度 |
| initiatorActorId | `Matter` | 谁发起 |
| subjectIds | `Matter` | 涉及哪些人、关系、房子 |
| outcome | `Matter` | 这次事做完结果如何 |

### 5.2 Event 放什么

| 字段 | 应属对象 | 为什么 |
| ---- | -------- | ------ |
| kind | `WorldEvent` | 记录发生了什么 |
| actorId | `WorldEvent` | 谁触发 |
| subjectId | `WorldEvent` | 影响对象是谁 |
| payload | `WorldEvent` | 变化细节 |
| parentEventId | `WorldEvent` | 因果链追踪 |

### 5.3 两者别混

| 场景 | 属于 Matter 还是 Event | 原因 |
| ---- | ---------------------- | ---- |
| 安排一次带看 | `Matter` | 这是持续中的具体事项 |
| 带看完成 | `Event` | 这是某个时间点发生的事实 |
| 谈底价进行中 | `Matter` | 这是过程态 |
| 业主同意降价 20 万 | `Event` | 这是结果事实 |

---

## 6. 市场和模型输出的归属

## 6.0 组织字段

| 字段 | 应属对象 | 为什么 |
| ---- | -------- | ------ |
| 经纪公司名、管理风格、数据能力 | `BrokerageCompany` | 这是公司层能力 |
| 品牌名、品牌口碑、服务标准 | `Brand` | 这是对外品牌认知 |
| 房源公开规则、客户私有规则、分佣规则、冲突规则 | `ACN` | 这是品牌内部协作网络 |
| 房源端规则、客源端规则、联卖规则 | `ACN` | 同 ACN 房源是联卖的，必须分清两端 |
| 平台房客匹配规则 | `ACN` 或 `PlatformMatchModel` | 平台可以算所有客户画像和所有房源，但不等于客户公开 |
| 房源机会分、潜在客户规模 | `PlatformMatchOutput` / `GoodHouseModelOutput` | 这是模型输出，不是客户明细 |
| 品牌市场占有率 | `Brand` | 不同品牌之间竞争，品牌占有率影响信任和压力 |
| 房源端经纪人、客源端经纪人 | `CoSaleRelation` | 这是一次联卖成交的分工，不是 broker 固定身份 |
| 丢盘事件 | `WorldEvent` | 这是发生过的事实，要能复盘 |
| 门店商圈、门店流量、店内协作文化 | `Store` | 这是门店经营能力 |
| 经纪人所属品牌、所属门店、所属 ACN | `Broker` 或 `OrgMembership` | 这是经纪人组织归属 |
| 商圈经理管理范围、目标压力、协调能力 | `BizAreaManager` | 这是组织管理角色 |
| 经纪人维护业主 | `BrokerOwnerRelation` | 这是经纪人和业主之间的维护关系 |
| 经纪人维护客户 | `BrokerCustomerRelation` | 这是经纪人和客户之间的维护关系 |
| 多经纪人咨询程度、撞客风险 | `CustomerRuntimeState` | 这是客户整体状态，不是某个经纪人的私有关系 |
| 客户去重识别 | `CustomerIdentityResolution` | 这是平台后台能力，不是前台客户明细 |

组织字段不要和市场字段混。

- 市场回答“外部环境怎么样”
- 品牌和 ACN 回答“组织网络能怎么借力”
- 同 ACN 回答“怎么联卖”
- 不同品牌回答“怎么竞争”
- 平台匹配回答“这套房有多大准客规模”
- 客户私有规则回答“谁能看和触达客户”

### 6.1 市场字段

| 字段 | 应属对象 | 为什么 |
| ---- | -------- | ------ |
| city / district / bizArea / segment 的需求指数 | `MarketState` | 这是环境变量 |
| 周末流量抬升 | `MarketState` | 这是时段环境变量 |
| 区域供需压力 | `MarketState` | 不是单房字段 |

### 6.2 模型输出字段

| 字段 | 应属对象 | 为什么 |
| ---- | -------- | ------ |
| D1 / D2 / D3 | `GoodHouseModelOutput` | 是评价结果，不是原始字段 |
| goodHouseScore | `GoodHouseModelOutput` | 是聚合评分 |
| ownerPsychPrice | `PriceModelOutput` | 是模型估出来的心理价 |
| marketEstimatedPrice | `PriceModelOutput` | 是模型估出来的市场估值 |
| dealFeasibility | `PriceModelOutput` | 是模型输出的成交可行度 |

模型输出可以缓存。
但不要覆盖原始世界字段。

---

## 7. Session、Viewport、Projection 的边界

### 7.1 Session / Viewport 放什么

| 字段 | 应属对象 | 为什么 |
| ---- | -------- | ------ |
| 当前选中的房子 | `Session / Viewport` | 这是玩家当前视角 |
| 当前页面 tab | `Session / Viewport` | 这是 UI 导航态 |
| 当前筛选条件 | `Session / Viewport` | 这是视角态 |
| priorities | `Session / Viewport` | 这是玩家此刻的工作排序 |

### 7.2 Projection 放什么

| 字段 | 应属对象 | 为什么 |
| ---- | -------- | ------ |
| 仪表盘摘要 | `Projection` | 是给页面看的总结 |
| 房源详情提示文案 | `Projection` | 是解释层，不是真相 |
| 日结摘要 | `Projection` | 是事实的阅读结果 |
| 榜单展示 | `Projection` | 是表现层数据 |

### 7.3 绝对不要做的事

1. 不要把 `priorities` 写回 `Case`。
2. 不要把 UI 文案写回 `WorldEvent.payload` 当唯一来源。
3. 不要把 projection 字段反过来作为 engine 输入。

---

## 8. 迁移时的判断清单

每迁一个字段，只问 6 个问题：

1. 这个值是“谁自己的”？
2. 它是不是只在两者之间才成立？
3. 它是不是一次具体工作本身的流程状态？
4. 它是不是已经发生过的事实？
5. 它是不是市场或时间环境？
6. 它是不是只是给玩家看的总结？

如果前 5 个都不是，大概率它属于 `Projection`。

---

## 9. 已收口与后续校准

这份表已经能支持第一轮代码迁移。
原来的字段归属缺口已经分别收口到：

1. 竞品字段体系：
   [selling-houses-competition-relation-model.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-competition-relation-model.md)
2. 公司、门店、组织动作：
   [selling-houses-organization-acn-model.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-organization-acn-model.md)
3. 房源阶段和生命周期：
   [selling-houses-listing-lifecycle-design.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-listing-lifecycle-design.md)
4. 复盘页和排行榜页投影：
   [selling-houses-projection-architecture.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-projection-architecture.md)

剩下主要是代码迁移时逐字段落表，不再是方向缺口。

---

## 10. 一句话结论

以后判断一个字段挂得对不对，最稳的顺序是：

> 先看是不是主体自己的，再看是不是关系，再看是不是事项，再看是不是事实，最后再看是不是投影。

只要这个顺序守住，`Case` 就不会再变回上帝对象。
