# 卖房（资产顾问）领域架构 v1

最后更新：2026-04-21

这份文档回答一个核心问题：

> 卖房这个游戏，领域到底该怎么拆，后面代码应该围着什么建。

不是写技术选型。
不是写 React 页面结构。
是写**领域模型**。

目标只有两个：

1. 以后新增规则时，不再把所有东西都塞回 `Case`
2. 以后新增客户、业主、竞品、复盘、排行榜时，模型还能站得住

---

## 0. 一句话结论

卖房游戏最稳的结构是：

- `Case`：房子本身
- `Owner`：业主本人
- `Customer`：客户本人
- `BrokerageCompany`：经纪公司
- `Brand`：公司对外经营的品牌
- `ACN`：品牌内部的经纪人协作网络
- `Store`：门店
- `Broker`：玩家
- `Rival`：竞品力量
- `OwnerCaseRelation`：业主卖这套房的关系
- `CustomerCaseRelation`：客户买这套房的机会
- `Matter`：一次具体事项
- `Event`：发生过的事实
- `Projection`：给 UI / 结果页 / 复盘页看的投影

核心原则：

> 谁的东西挂谁身上；两者之间的东西挂 Relation；一次具体工作挂 Matter；给页面看的总结只做 Projection。

---

## 1. 为什么现在容易乱

现在最容易乱，是因为很多本来不属于 `Case` 的东西都挂在 `Case` 上。

比如：

- 业主信任、耐心、底价
- 客户对这套房的意向、信心、阶段
- 玩家视角下的优先级、风险提示

这些其实是三种不同层级：

- `Owner` 自己的东西
- `Customer × Case` 的关系东西
- `Viewport / Session` 的投影东西

一旦混在一起，就会出现几个后果：

- case 变成上帝对象
- 一个客户没法自然同时看多套房
- 业主像房子的附属字段，不像一个真正主体
- 结果页和复盘只能“倒推猜原因”，不能顺着事实链讲出来

---

## 2. 领域分层

我建议整个领域分成 7 层。

先补一条这轮必须固定下来的总边界：

> `游戏层` 和 `局内层` 必须硬隔离。

因为很多东西看起来都像“资源”或“结果”，但其实不在一个层级。

- `游戏层`
  回答：这个用户是谁，跨局留下了什么。
- `局内层`
  回答：这一局现在发生了什么，这一局还能怎么打。
- `投影层`
  回答：系统怎么把事实翻译成人能看懂的话。

如果这三层不分开，后面最容易出现的问题是：

- 排行榜字段反过来驱动局内世界
- 局内精力和跨局资产混成一个 `reputation`
- 页面提示词被错误落成数据库真相

### 2.0 游戏层

这层回答：

> 不管开不开局，这个用户自己长期拥有的是什么。

建议放：

- `Account`
- `AccountIdentity`
- `AccountWorkspaceGrant`
- `PlayerProfile`
- `PlayerCareerStats`
- `PlayerProgression`
- `LeaderboardEntry`

这层只放跨局仍然成立的东西：

- 邮箱、昵称、白名单
- 可玩哪些项目
- 总局数、最好成绩、总成交
- 榜单记录
- 已解锁内容

这层不该放：

- 当前精力
- 当前推广金
- 当前房源热度
- 当前机会推进阶段

这些都属于局内。

### 2.0.1 局内层

这层回答：

> 这一局里，世界现在是什么样，玩家手上还有什么牌。

建议放：

- `GameRun`
- `World`
- `Session`
- 全部局内 Actor / Relation / Matter / Event / Model

这层里的对象只负责“这一局正在运行时”的状态推进。局终后，这些运行态被冻结，只保留可追溯摘要，不再直接作为跨局沉淀继续复用。

`RunResult` 不放在“进行中的局内世界对象”里。它是由 `World / Events / Relations` 在局终结算后生成的稳定记录：可以引用局内事实，但不能像 `Session` 或 `GameRun` 当前状态一样随时改。

### 2.1 主体层

这层回答：谁是世界里真正会动的人或对象。

- `Case`
- `Owner`
- `Customer`
- `BrokerageCompany`
- `Brand`
- `ACN`
- `Store`
- `Broker`
- `Rival`

这里要补一条重要边界：

> 经纪公司本质上有品牌，每一个品牌内部有自己的 ACN。

所以 `Rival` 不应该长期只是一个竞品黑盒。
真正的竞争和合作，来自不同品牌、不同 ACN、不同门店、不同经纪人之间的关系。

### 2.2 关系层

这层回答：两个主体之间，当前是什么关系。

- `OwnerCaseRelation`
- `CustomerCaseRelation`

### 2.3 事项层

这层回答：现在具体在做什么事。

- `Matter`

### 2.4 模型层

这层回答：有哪些独立评估器，不属于某个主体本身，但会评价世界状态。

- `GoodHouseModel`
- `PriceModel`
- `MarketModel`

### 2.5 事实层

这层回答：刚刚到底发生了什么。

- `Event`

### 2.6 投影层

这层回答：给人看时怎么总结。

- Dashboard 数据
- 房源详情数据
- Review 复盘数据
- Result 结果数据
- Leaderboard 榜单数据

这里要强调一遍：

- `LeaderboardEntry` 作为跨局成绩记录，属于游戏层
- `leaderboard rows` 作为页面展示行，属于投影层

不是一个东西。

---

## 3. 三种最容易混的东西

后面所有建模都先问这个。

### 3.1 画像

这个人/这个房本来是什么样。

特点：

- 相对稳定
- 开局就有
- 不是因为一次交互立刻变化

### 3.2 运行时状态

这个主体当前整体是什么状态。

特点：

- 会变化
- 但还是属于这个主体自己
- 不针对某一段具体关系

### 3.3 关系状态

某个人和某个对象之间，现在走到哪一步。

特点：

- 必须挂在 relation 上
- 不能挂回主体
- 是最容易被误挂的部分

---

## 4. 核心实体

## 4.1 Case

`Case` 就是房子本身。

它应该只放房子的客观属性和长期吸引力来源。

### Case 该放什么

- 标题
- 小区
- 板块
- 户型
- 面积
- 朝向
- 楼层
- 装修
- 房屋标签
- 房屋缺点
- 市场参考价
- 当前挂牌价
- 房源客观吸引力来源

### Case 不该放什么

- 业主信任
- 业主耐心
- 业主底价
- 客户对它的意向
- 客户推进到哪一步
- 当前玩家视角下的优先级

### 我建议的 Case 两层

#### A. CaseProfile

房子本来是什么样。

#### B. CaseRuntime

房子当前市场表现如何。

例如：

- 当前热度
- 当前曝光
- 当前竞争压力
- 当前吸引力投影

---

## 4.2 Owner

`Owner` 是业主本人，不是房子的一个字段包。

### Owner 该放什么

#### A. OwnerProfile

- 出售动机
- 性格
- 风险偏好
- 是否强势
- 是否着急
- 是否看重面子
- 是否价格优先
- 是否效率优先

#### B. OwnerRuntimeState

- 当前情绪
- 当前焦虑度
- 当前防御状态
- 当前对市场的理解程度

### Owner 不该放什么

- 对某一套房的底价
- 对某一位经纪人的信任
- 是否愿意接受开放日

这些都更像关系级状态。

---

## 4.3 Customer

`Customer` 是买房的人。

### Customer 该放什么

#### A. CustomerProfile

- 预算区间
- 目标板块
- 偏好户型
- 偏好标签
- 价格敏感度
- 决策风格
- 家庭阶段
- 核心需求

#### B. CustomerRuntimeState

- 当前活跃度
- 当前疲劳度
- 当前注意力容量
- 当前在看几套房
- 当前第一选择 relation 是哪条
- 当前是否处于比较态
- 当前整体购房 urgency
- 当前是否多经纪人咨询
- 注意力是否被多个经纪人分散
- 撞客风险

### Customer 不该放什么

- 对 A 房的意向
- 对 B 房的信心
- 对 C 房的阶段

这些都应该挂在 `CustomerCaseRelation` 上。

---

## 4.4 Broker

`Broker` 是玩家自己。

### Broker 该放什么

- 今日精力
- 推广预算
- 当前声誉
- 当前佣金统计
- 当前权限和操作能力

### Broker 不该放什么

- 世界里所有机会的真相
- 客户是否晋级
- 业主是否降价

这些是世界状态，不是玩家状态。

---

## 4.5 BrokerageCompany / Brand / ACN / Store

这是组织层。

它不替代 `Broker`，而是解释经纪人背后的组织能力。

### 一句话结构

```text
BrokerageCompany
  -> Brand
    -> ACN
      -> Store
        -> BizAreaManager
        -> Broker
```

### BrokerageCompany 该放什么

- 公司管理风格
- 数据能力
- 培训能力
- 目标压力方式
- 旗下品牌

### Brand 该放什么

- 品牌名
- 品牌口碑
- 业主信任基线
- 客户信任基线
- 曝光能力
- 服务标准
- 品牌下的 ACN

### ACN 该放什么

ACN 是品牌内部的经纪人协作网络。

它应该放：

- 合作规则
- 房源可见规则
- 客户私有规则
- 平台匹配计算规则
- 分佣规则
- 撞客/撞盘冲突规则
- 协作效率
- 内部竞争强度
- 房源端规则
- 客源端规则
- 联卖规则
- 丢盘判定规则

ACN 不应该只是一个团队名。
它是连接门店、经纪人、房源、客户的网络规则。

这里要把边界说死：

- 同 ACN 内，房源是互相公开的
- 同 ACN 经纪人都可以带自己的客户看公开房源
- 客户不是公开的，客户是经纪人私有维护资产
- 一个客户可以同时找多个经纪人，经纪人彼此默认不知道
- 平台可以用所有客户画像和所有房源做匹配计算
- 但平台计算结果不等于客户明细对所有经纪人可见

平台可以为每套房计算：

- 潜在客户规模
- 高匹配客户规模
- 可合规触达客户规模
- 房源机会分
- 匿名客户类型分布

这会进入 `GoodHouseModel.D1` 和房源经营建议。
但具体客户进入推进漏斗，仍然要建立 `CustomerCaseRelation`。

同一个 ACN 内，房源是联卖的。
每一次成交都要分清：

- 房源端：谁维护房源、谁服务业主、谁保住房源价值
- 客源端：谁带来客户、谁推进看房、谁促成出价和成交

一个经纪人在不同房源上的角色可以不同。
所以房源端 / 客源端不能只挂在 `Broker` 身上，必须挂在 `BrokerCaseRole`、`BrokerCustomerRelation` 或成交事件里。

品牌内还要看市场占有率。
如果一个品牌在某商圈占有率高，它会带来更强的业主信任、客户信任和房源流通效率。
如果你的房源被别人成交，要判断是不是丢盘。

### Store 该放什么

- 所属品牌
- 所属 ACN
- 主经营商圈
- 门店自然流量能力
- 店长管理风格
- 店内协作文化
- 本地市场熟悉度
- 管理者列表

### BizAreaManager 该放什么

商圈经理是组织里的管理角色。

他负责：

- 管理一组经纪人
- 分配目标和重点
- 协调同 ACN 联卖
- 做保盘动作
- 协调线索分配
- 推动商圈市场占有率

他应该放：

- 所属品牌
- 所属 ACN
- 管理商圈
- 管理门店
- 管理经纪人列表
- 目标压力
- 协调能力
- 保盘能力
- 客源分配能力

商圈经理不直接拥有客户和业主。
他通过管理经纪人，间接影响业主池、客户池和房源端/客源端协作。

一个客户可以同时找多个经纪人。
这些经纪人之间默认互相不知道。

所以模型上是：

- 一个 `Customer` 可以对应多条 `BrokerCustomerRelation`
- 每条 `BrokerCustomerRelation` 是某个经纪人视角里的客户维护关系
- 平台后台可以做 `CustomerIdentityResolution`，识别多个维护关系是否指向同一个真实客户
- 但这个识别不等于把客户明细公开给其他经纪人

### Broker 还要补什么

经纪人维护一些业主和客户。

但这不是把业主和客户直接挂在 `Broker` 字段里。
更稳的是：

- `BrokerOwnerRelation`：经纪人维护某个业主
- `BrokerCustomerRelation`：经纪人维护某个客户

这两条关系要记录：

- 维护深度
- 信任
- 最近联系时间
- 是否主维护人
- 对需求或出售动机的理解程度

### 它们影响什么

- 房源曝光
- 客户线索分发
- 平台基于客户画像计算房源准客规模
- 业主对品牌的信任
- 同品牌经纪人之间的协作
- 内部竞争和跨品牌竞争
- 开放日、联合推广、客户转接等 Matter 的成功率
- 联卖成交的房源端和客源端归因
- 品牌市场占有率
- 丢盘和丢客
- 商圈经理对经纪人的任务分配
- 经纪人的业主池和客户池维护质量

详细设计见：
[selling-houses-organization-acn-model.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-organization-acn-model.md)

---

## 4.6 Rival

`Rival` 是竞品力量。

早期可以先简化，但领域上要给它留位置。

这里要改一个理解：

> Rival 不是一个单独黑盒。Rival 是来自其他品牌、其他门店、其他经纪人的竞争力量。

同品牌同 ACN 内部，核心是联卖。
里面会有合作、分佣和抢时机，但不能按纯竞品处理。

不同品牌之间，才是明确竞争关系。

如果你的房源被不同品牌成交，这是丢盘。
如果你的客户被不同品牌成交，这是丢客。
如果同 ACN 内别人带客户成交了你的房源，要按房源端 / 客源端归因，不要直接算竞品打败你。

还有一个很重要的竞争原则：

> 越相似的房源，竞争越激烈。

这里的“相似”，本质上不是看两个房源文案像不像，
而是看它们是不是在争同一批客户。

所以竞争强度要同时看：

- 同小区
- 同商圈
- 同户型段
- 同总价带
- 同需求标签
- 同预算客户重叠度

客户重叠越高，竞争越强。

### Rival 该放什么

- 竞品盘策略
- 竞品强度
- 竞品当前曝光能力
- 竞品抢客能力
- 所属品牌
- 所属门店
- 是否同 ACN
- 是否跨品牌

它后面会通过事件和关系状态影响客户推进。

---

## 5. 两类核心 Relation

这部分是整个模型最重要的。

## 5.1 OwnerCaseRelation

这是“这个业主卖这套房”时形成的关系。

### 为什么要独立

因为：

- 不是所有业主都一样
- 同一个业主卖不同房，也可能策略不同
- 业主本人和这套房的出售关系，不是一个东西

### OwnerCaseRelation 该放什么

- trust
- patience
- urgency
- bottomPrice
- 当前授权程度
- 是否接受调价
- 是否接受开放日
- 是否愿意配合反馈
- 当前对这套房出售路径的认同度

### 它影响什么

- `D3 业主面`
- 调价空间
- 开放日可行性
- 经营节奏是否能推进

---

## 5.2 CustomerCaseRelation

这就是“机会”。

### 一句话定义

> 机会不是一个独立人，它是“某个客户对某一套房当前走到哪一步”的关系状态。

### 多对多关系

- 一个客户可以同时和很多套房建立关系
- 一套房也可以同时被很多客户关注

所以它一定是：

- `Customer 1 -- N CustomerCaseRelation`
- `Case 1 -- N CustomerCaseRelation`

### 机会主线阶段

我建议直接按客户推进漏斗来定义：

1. 线上咨询
2. 有意向
3. 预约首次看房
4. 看房
5. 再次看房
6. 见面
7. 出价
8. 成交

注意：

- “自己来”
- “参加周末开放日”

这两个不是阶段。
它们是进入 `看房` 阶段的方式。

### CustomerCaseRelation 该放什么

- fitScore
- affordabilityScore
- demandMatchScore
- attractivenessScore
- marketingExposureScore
- intent
- confidence
- stageIndex
- status
- selected
- compareRank
- rivalPullScore
- stagnationDays
- recentTouchScore
- lastAdvanceDay

### 什么不该放在这里

- 客户本人的预算
- 客户本人的偏好
- 房子本身的客观资料

这些应该来自 `CustomerProfile` 和 `Case`。

---

## 6. Matter：事项系统

`Matter` 是一次具体工作，不是一个按钮，不是一段文案。

### Matter 的作用

- 承载动作
- 承载过程
- 承载参与者
- 承载结果

### Matter 的 4 大类

- `report`
  汇报
- `diagnose`
  诊断
- `execute`
  执行
- `negotiate`
  博弈

### 卖房里常见 Matter

- 向业主做周反馈
- 做一次诊断
- 安排带看
- 周末开放日
- 谈底价
- 谈报价
- 推进签约

如果要继续往下拆“经纪人到底做了什么”，详细设计见：
[selling-houses-broker-action-architecture.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-broker-action-architecture.md)

这份动作架构会把：

- 沟通型动作
- 营销推广型动作
- 业主客户互动型动作
- 协同型动作

统一接到 `Matter / Interaction / Event / Relation` 上。

### Matter 和机会的关系

Matter 不是机会本身。

Matter 完成后，会去影响：

- `CustomerCaseRelation`
- `OwnerCaseRelation`
- `CaseRuntime`

---

## 7. Event：事实流

所有重要变化都应该尽量留下事件。

### 事件例子

- 客户首次咨询
- 客户进入有意向
- 客户预约首次看房
- 客户完成看房
- 客户完成再次看房
- 客户与经纪人见面
- 客户出价
- 客户成交
- 客户被竞品拉走注意力
- 业主同意开放日
- 业主松口调价
- 开放日结束
- 推广曝光抬升

### 事件的 3 个价值

1. 驱动世界变化
2. 给复盘和结果页讲因果
3. 为回放、训练、榜单分析打基础

---

## 8. 三维度和好房分

我建议三维度保留，但要明确来源。

## 8.0 GoodHouseModel 要独立

`好房模型` 不应该只是 `Case` 上几个字段的加权。

它应该是一个独立的第三方客观评估器。

它回答的问题是：

> 站在今天这个市场环境里，这套房整体到底好不好卖。

所以：

- 好房模型不属于 `Case`
- 好房模型不属于 `Owner`
- 好房模型也不属于 `Customer`

它是吃很多输入后，给出一个客观评估结果。

### GoodHouseModel 的输入

- `CaseProfile`
- `CaseRuntime`
- `OwnerCaseRelation`
- 这套房关联的 `CustomerCaseRelation[]`
- `PriceModel` 的部分输出
- `MarketModel` 的部分输出

### GoodHouseModel 的输出

- `D1 准客池`
- `D2 房屋吸引力`
- `D3 业主意愿`
- `goodHouseScore`
- `explanations[]`

## 8.1 D1：客户面

不是“客户有几个”。
而是“有效机会厚不厚、走得快不快、后段机会够不够”。

来源主要是：

- `CustomerCaseRelation` 集合
- 其中的 stage 分布
- 高 intent / 高 confidence 的 relation 数量
- 出价前机会厚度

## 8.2 D2：房子面

来源主要是：

- `CaseProfile`
- `CaseRuntime`

看这套房本身够不够打。

## 8.3 D3：业主面

来源主要是：

- `OwnerCaseRelation`

看业主是否配合、价格能不能谈、节奏能不能推进。

## 8.4 好房分

`好房分` 不是原始数据。

它是：

> `GoodHouseModel` 基于 `D1 + D2 + D3` 给出的结构化评估结果

所以：

- 好房分不是领域真相
- 好房分不是 `Case` 的原始字段
- 好房分属于 `GoodHouseModelOutput / GoodHouseEvaluation`
- 页面可以把好房分继续投影成摘要卡片、标签和提示语
- 好房分可以存快照，但不应代替底层事实

---

## 9. PriceModel：价格模型

价格要独立于好房模型。

因为“这套房是不是好房”和“这个价格体系是不是合理”不是一回事。

### PriceModel 回答什么

> 这套房今天在这个市场里，这个挂价、这个心理价、这个市场估价之间的关系是什么样。

### PriceModel 最少输出

- `listingPrice`
- `ownerPsychPrice`
- `marketEstimatedPrice`
- `priceGapToMarket`
- `priceFeasibility`
- `dealFeasibility`

### PriceModel 的输入

- `Case`
- `OwnerProfile`
- `OwnerRuntimeState`
- `OwnerCaseRelation`
- `MarketModel`

### PriceModel 的作用

- 影响 `OwnerCaseRelation`
- 影响 `CustomerCaseRelation` 推进概率
- 影响 `GoodHouseModel` 的 D3 和整体判断

---

## 10. MarketModel：市场模型

市场不能只做一个“热度”字段。

它应该是独立环境模型。

### MarketModel 回答什么

> 今天这套房所处的外部市场，到底是顺风还是逆风。

### MarketModel 的三层

#### A. MacroMarket

大盘层。

- 政策温度
- 季节性
- 整体买方信心
- 整体成交节奏

#### B. DistrictMarket

板块层。

- 板块热度
- 板块供给压力
- 板块竞争强度

#### C. SegmentMarket

细分层。

例如：

- `浦东前滩 × 80-90㎡ × 2房改善`
- `静安寺北 × 60-75㎡ × 1房资产型`

真正拿来影响房子的，主要是这层。

### MarketModel 最少输出

- `marketEstimatedPrice`
- `demandHeat`
- `supplyPressure`
- `competitionIntensity`
- `transactionSpeed`
- `buyerConfidence`
- `ownerConfidence`

### MarketModel 还需要两组基础维度

#### A. 空间维度

市场不能只知道“今天热不热”，还要知道“热发生在哪”。

最少建议定义：

- `city`
- `district`
- `bizArea`
- `segment`

其中：

- `city`
  决定大盘和政策环境
- `district`
  决定区域热度和价格带
- `bizArea`
  决定真实竞争和客户流向
- `segment`
  决定真正可比较的市场单元

例子：

`上海 / 浦东前滩 / 前滩商圈 / 80-90㎡ / 两房改善`

#### B. 时间维度

市场也不能只知道 `day`。

最少要感知：

- `year`
- `quarter`
- `month`
- `week`
- `day`
- `dayOfWeek`
- `isWeekend`

因为很多事件和节奏不是“随机发生”，而是和时间结构强相关。

例如：

- 周末更容易出现看房高峰
- 月底更容易出现价格松动
- 季度切换更容易出现整体情绪变化

### 市场标准事件要独立定义

我建议市场事件不要散写在规则里，而是先定义一套标准事件。

这些事件不是“页面文案”，而是环境层真实事件。

### A. Macro 级事件

作用范围：整个城市，甚至全盘。

例子：

- `policy.loosened`
- `policy.tightened`
- `mortgage.easier`
- `mortgage.harder`
- `macro.sentiment.up`
- `macro.sentiment.down`

### B. District 级事件

作用范围：一个板块。

例子：

- `district.demand.up`
- `district.demand.down`
- `district.supply.up`
- `district.competition.up`
- `district.transaction-speed.down`

### C. BizArea 级事件

作用范围：一个商圈。

例子：

- `bizarea.open-house-weekend`
- `bizarea.rival-campaign.up`
- `bizarea.new-listing-wave`
- `bizarea.customer-visit.up`

### D. Segment 级事件

作用范围：一个细分市场。

例子：

- `segment.two-bedroom-improve.hot`
- `segment.asset-small-unit.cooling`
- `segment.price-sensitive-buyers.up`
- `segment.family-demand.up`

### E. 节奏类事件

这类事件和真实日期强相关，可以是半确定性的。

例子：

- `calendar.weekend-viewing-peak`
- `calendar.month-end-price-flex`
- `calendar.quarter-shift-sentiment`
- `calendar.holiday-traffic-up`

### 推荐的市场事件结构

```ts
type MarketEvent = {
  id: string
  kind: string

  scope: {
    level: 'macro' | 'district' | 'bizArea' | 'segment'
    cityId?: string
    districtId?: string
    bizAreaId?: string
    segmentId?: string
  }

  time: {
    day: number
    startDay: number
    endDay?: number
    dayOfWeek?: number
    month?: number
    quarter?: number
  }

  persistence: 'instant' | 'temporary' | 'seasonal'
  intensity: number
  direction: 'up' | 'down' | 'mixed'

  impact: {
    demandHeat?: number
    supplyPressure?: number
    competitionIntensity?: number
    buyerConfidence?: number
    ownerConfidence?: number
    marketEstimatedPrice?: number
    transactionSpeed?: number
  }
}
```

### 事件和时间、地区的关系

市场事件不是全国统一掉下来。

它应该至少满足两个绑定：

1. `scope binding`
   它发生在哪个空间层级
2. `time binding`
   它更容易在什么时间结构下发生

比如：

- `calendar.weekend-viewing-peak`
  - scope：通常是 `bizArea` 或 `segment`
  - time：`isWeekend = true`

- `district.supply.up`
  - scope：某个 district
  - time：可以和 month / quarter 有关

- `policy.tightened`
  - scope：macro
  - time：低频，但持续时间更长

### 市场事件发生概率怎么判断

我建议不要纯随机。

也分两层：

#### 第一层：先看有没有发生条件

例如：

- 是不是周末
- 是不是月底
- 当前板块是不是本来就供给紧
- 当前商圈是不是竞品已经活跃
- 当前细分市场是不是最近连续升温

#### 第二层：再算发生概率

```text
P(market event e) =
  baseRate(e)
  * timeAffinity(e, currentTime)
  * scopeSensitivity(e, currentScope)
  * pressureGap(e, marketState)
  * noise(seed)
```

也可以理解成：

- `baseRate`
  这类事件天生常不常见
- `timeAffinity`
  当前时间是不是它的高发窗口
- `scopeSensitivity`
  这个地区是不是更容易发生这种事
- `pressureGap`
  当前市场状态是不是已经逼近触发线

举例：

`P(calendar.weekend-viewing-peak)` 会在周六周日显著变高。

`P(district.supply.up)` 会在同类新盘连续进入时变高。

`P(segment.family-demand.up)` 会在某些学区、改善细分市场和季度节点更高。

### 哪些市场事件不该靠随机

我建议分 3 类：

#### A. 确定性事件

一定发生。

例如：

- 周末看房高峰
- 月底价格松动窗口

#### B. 半确定性事件

满足条件后高概率发生。

例如：

- 竞品集中投放后，商圈竞争抬升
- 某细分市场连续升温后，需求热度再上一个台阶

#### C. 纯概率事件

可以保留少量随机性。

例如：

- 短期市场情绪小波动
- 某商圈临时来一波高质量客户流量

### 事件对全局的影响

市场事件不直接改具体客户。

它们应该先改环境，再由环境去影响别的模型。

建议按下面链路传播：

#### 第一层：改 MarketState

- `demandHeat`
- `supplyPressure`
- `competitionIntensity`
- `transactionSpeed`
- `buyerConfidence`
- `ownerConfidence`
- `marketEstimatedPrice`

#### 第二层：影响三个核心模型

- 影响 `PriceModel`
- 影响 `GoodHouseModel`
- 影响 `CustomerCaseRelation` 推进概率

#### 第三层：间接影响主体和关系

- 影响 `OwnerRuntimeState`
- 影响 `OwnerCaseRelation`
- 影响 `CustomerRuntimeState`
- 影响 `CustomerCaseRelation`

### 一个典型例子

```text
事件：
  bizarea.rival-campaign.up

先影响：
  competitionIntensity +12
  buyerConfidence -3

再影响：
  PriceModel.dealFeasibility 下降
  GoodHouseModel.D1 下降
  CustomerCaseRelation.rivalPullScore 上升

最后表现为：
  更多 relation 进入 comparing
  推进概率下降
  流失概率上升
```

### MarketModel 影响什么

- `PriceModel`
- `GoodHouseModel`
- `CustomerCaseRelation`
- `OwnerCaseRelation`

### 一句边界

市场模型提供的是公共环境，不是私人真相。

它可以说：

- 这类房最近整体更难卖
- 这个板块竞争更强了

但不能直接说：

- 张三客户今天一定流失

那是 relation 层的事。

---

## 11. 机会推进机制

这里是卖房游戏最核心的一段。

## 11.1 总原则

机会推进不是“客户整体升级”。

机会推进是：

> 某个客户对某一套房的关系，是否往下一阶段走。

所以要算的是：

> `P(advance CustomerCaseRelation)`

而不是：

> `P(customer advances)`

---

## 11.2 决定推进概率的三大主因子

你前面说得对，我认同这三个就是主因子：

### A. 房子的吸引力

这套房本身够不够吸引人。

主要来自：

- 户型和条件
- 卖点是否清晰
- 房源竞争力
- 当前热度

### B. 推广动作

最近有没有把这套房有效推到客户面前。

主要来自：

- 小红书推广
- 经纪人投放
- 私域转介绍
- 周末开放日
- 最近带看和跟进动作

### C. 客户需求与预算和房子的匹配程度

这个客户到底和这套房配不配。

主要来自：

- 预算匹配
- 户型匹配
- 板块匹配
- 标签需求匹配
- 价格接受度

---

## 11.3 机会推进概率的完整输入

### 画像输入

- 预算是否覆盖
- 需求是否匹配
- 决策风格是否偏快
- 价格敏感度高不高

### 客户状态输入

- 当前活跃度
- 当前疲劳度
- 当前注意力容量
- 当前是否在同时比较太多套

### 房源输入

- attractiveness
- currentHeat
- currentCompetitiveness
- storyClarity
- ownerCooperation

### 关系输入

- intent
- confidence
- selected
- compareRank
- rivalPullScore
- stagnationDays
- recentTouchScore

### 事项与事件输入

- 最近有没有有效推广
- 最近有没有带看
- 最近有没有开放日
- 最近有没有谈价把信心打掉
- 最近有没有被竞品抢客

---

## 11.4 推荐公式

我建议不要再用一颗裸骰子。

而是两步走：

### 第一步：先过门槛

不是所有 relation 都有资格推进。

先判断：

- attentionCapacity 是否还有空位
- fit 是否过线
- affordability 是否过线
- attractivness 是否过线
- intent / confidence 是否过线
- 最近是否刚被强烈拉走

### 第二步：再算概率

```text
P(advance relation) =
  baseRate
  + attractivenessBoost(case)
  + demandMatchBoost(customerProfile, case)
  + affordabilityBoost(customerProfile, case)
  + marketingBoost(recentMatters, recentEvents)
  + intentBoost(relation)
  + confidenceBoost(relation)
  + recentTouchBoost(relation)
  - rivalPressurePenalty(relation)
  - compareLoadPenalty(customerState)
  - fatiguePenalty(customerState)
  - stagnationPenalty(relation)
```

更工程一点可以做成：

```text
score = Σ正向因子 - Σ负向因子
probability = clamp(sigmoid(score), minRate, maxRate)
```

这样好处是：

- 因子可解释
- 参数可调
- 比单一随机更像真实经营

---

## 11.5 推进路径里的“看房方式”

你说的这个点也很重要。

`看房` 是阶段。
但“怎么进入看房”是方式。

比如：

- 自己来
- 参加周末开放日
- 经纪人约看

这些不应该新增 stage。
应该挂在：

- `Matter.context`
  或
- `CustomerCaseRelation.lastVisitChannel`

也就是：

- 阶段不变
- 进入阶段的方式可变

这样模型会更稳。

---

## 12. 每天计算一次时，到底发生什么

我建议系统每天只做一次统一日结。

白天动作是局部即时更新。
结束当天时，`advanceDay()` 再做全局结算。

### 12.1 白天即时发生的事

玩家白天做动作时，会即时发生：

- 创建或推进 `Matter`
- 记录对应 `Event`
- 局部更新受影响的 relation
- 局部更新推广曝光、信心、意向等状态

例如：

- 做开放日 -> `marketingExposureScore +x`
- 完成带看 -> `confidence +x`
- 谈价成功 -> `ownerCaseRelation.trust +x`

### 12.2 日结统一流程

每天统一结算建议固定成下面顺序：

1. 结算当天未完成的 `Matter`
2. 写入所有当日 `Event`
3. 更新 `OwnerRuntimeState`
4. 更新 `CustomerRuntimeState`
5. 更新 `MarketModel`
6. 重算 `PriceModel`
7. 重算 `GoodHouseModel`
8. 对所有 active `CustomerCaseRelation` 计算推进 / 比较 / 停滞 / 流失
9. 更新 `OwnerCaseRelation`
10. 最后生成 projection

### 12.3 每天可能发生的事

#### A. 事项完成

- 开放日结束
- 带看结束
- 汇报结束
- 谈价结束

#### B. 业主变化

- 焦虑升降
- 情绪变化
- 信任变化
- 耐心变化
- 心理价变化

#### C. 客户变化

- 活跃度变化
- 疲劳度变化
- 注意力变化
- 比较模式变化

#### D. 机会变化

- 线上咨询
- 有意向
- 预约首次看房
- 看房
- 再次看房
- 见面
- 出价
- 成交
- 比较
- 停滞
- 流失

#### E. 价格变化

- 市场估价变化
- 挂牌价相对市场偏差变化
- 成交可行性变化

#### F. 好房模型变化

- D1 变化
- D2 变化
- D3 变化
- 好房分变化

#### G. 市场变化

- 需求热度变化
- 供给压力变化
- 竞争强度变化

### 12.4 计算量

每天不是全量 `customers × cases` 重算。

建议只维护 active relations。

所以复杂度大体应控制在：

```text
O(cases + owners + customers + activeRelations)
```

在当前 6-8 套房、几十到百级客户的规模下，是完全可承受的。

---

## 13. Projection：给页面看的东西

下面这些都不该做成世界真相。

它们应该是投影：

- priorities
- schedule
- signals
- daily brief
- result summary
- review summary
- leaderboard rows

它们的来源是：

- World
- Relations
- Matters
- Events

最后派生出来给页面看。

这里要补一条非常重要的约束：

> `Projection` 可以使用判断词，但不能把判断词回写为世界真相。

比如：

- `适合谈价`
- `先稳关系`
- `客户池偏薄`
- `建议本周做开放日`

这些都可以存在于页面层。
但不能反过来在 world 里写：

- `ownerWindow = 72`
- `caseWorthFighting = true`
- `mustDoOpenDay = true`

因为这些都不是事实，而是系统基于事实做出的解释。

### 13.1 Action Readiness 也是 Projection，不是事实

像下面这些东西：

- 现在适不适合谈价
- 现在适不适合推开放日
- 现在适不适合强推进成交

都应该由评估器即时计算。

建议输出结构类似：

```ts
type ActionReadinessProjection = {
  action: string;
  score: number;
  level: 'high' | 'medium' | 'low';
  drivers: string[];
  blockers: string[];
  evidence: string[];
};
```

它的输入来自：

- `OwnerRuntimeState`
- `BrokerOwnerRelation`
- `OwnerCaseRelation`
- `CaseRuntime`
- `CustomerCaseRelation`
- `MarketState`

它的输出只给页面和建议动作系统用，不回写 world。

---

## 14. Session / Viewport

`Session` 只承载玩家视角态。

### Session 该放什么

- 当前看哪套房
- 当前 tab
- 面板展开状态
- 上次派生结果快照
- 页面偏好

### Session 不该放什么

- 客户是否晋级
- 机会是否流失
- 业主是否降价
- 世界里真实发生了什么

### 14.1 Session 和 RunResult 也不是一个东西

容易混的一点是：

- `Session`
  是这局进行中，玩家当前怎么看
- `RunResult`
  是这局结束后，系统怎么算

`Session` 可以随时改、随时丢、随时重建。
`RunResult` 一旦结算，应视为稳定记录。

所以：

- 当前选中哪套房，进 `Session`
- 这局最后总分多少，进 `RunResult`
- 这局复盘摘要给用户怎么展示，进 `ResultProjection`

---

## 15. 游戏层、局内层和局终沉淀

这一节回答一个最关键的问题：

> 一局里发生的事，最后哪些留在局内，哪些沉淀到游戏层。

### 15.1 游戏层该放什么

建议游戏层只放：

- `Account`
- `AccountIdentity`
- `AccountWorkspaceGrant`
- `PlayerProfile`
- `PlayerCareerStats`
- `PlayerProgression`
- `LeaderboardEntry`

### 15.2 局内层该放什么

建议局内层放：

- `GameRun`
- `World`
- `BrokerRuntimeState`
- `CaseRuntime`
- `OwnerRuntimeState`
- `CustomerRuntimeState`
- `OwnerCaseRelation`
- `BrokerOwnerRelation`
- `BrokerCustomerRelation`
- `CustomerCaseRelation`
- `Matter`
- `EventStore`
- `RunSession`

### 15.3 局终只沉淀什么

局终不把整个 world 塞回游戏层。

只沉淀以下摘要：

- 本局总分
- 本局单房结果摘要
- 本局成交数、守盘数、丢盘数、丢客数
- 本局最好成绩是否刷新
- 是否进入排行榜
- 用户累计局数、累计成交等统计

建议沉淀链路是：

```text
World / Events / Relations
  -> SettlementEngine
  -> RunResult
  -> PlayerCareerStats / LeaderboardEntry / Progression
```

如果要继续往下细化“玩家为什么持续玩、跨局具体沉淀什么、三张榜单怎么设计”，详细见：
[selling-houses-game-layer-goals-leaderboard.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-game-layer-goals-leaderboard.md)

### 15.4 哪些东西绝不能跨层直接搬

下面这些局终后不应该直接成为游戏层字段：

- 当前精力
- 当前预算
- 当前 heat / exposure
- 当前 trust / patience
- 当前某个客户的推进阶段
- 当前某个 Matter 的阶段

它们最多只该以“摘要结果”的方式留下。

比如：

- “本局共完成 12 个关键事项”
- “本局有 3 套房进入后段机会”
- “本局 2 次成功调价”

可以留。
但不是把运行时字段跨层复制过去。

---

## 16. 模块边界建议

我建议按下面拆模块。

先按层拆，再按领域拆。

### 16.0 Game Platform

- `user/`
- `identity/`
- `permission/`
- `stats/`
- `leaderboard/`
- `progression/`
- `difficulty-catalog/`

职责：

- 登录
- 白名单/邮箱身份
- 权限
- 跨局统计
- 榜单
- 解锁
- 难度档位目录与版本

### 16.1 Run Runtime

- `run/`
- `run-session/`
- `run-result/`
- `settlement/`
- `persistence/`
- `scenario-generation/`
- `difficulty-compiler/`

职责：

- 开局
- 读档
- 存档
- 结算
- 局内与游戏层之间的沉淀桥接
- 把难度配置编译成这一局真正使用的运行参数

### 16.2 World Domain

- `case/`
- `owner/`
- `customer/`
- `broker/`
- `organization/`
- `difficulty/`
- `relations/owner-case/`
- `relations/customer-case/`
- `relations/broker-owner/`
- `relations/broker-customer/`
- `relations/co-sale/`
- `matter/`
- `event/`
- `models/good-house/`
- `models/price/`
- `models/market/`

### 16.3 Engine

- `tickWorld`
- `tickOwners`
- `tickCustomers`
- `tickRelations`
- `tickOrganizations`
- `applyMatter`
- `recordEvent`
- `evaluateActionReadiness`
- `settleRun`

### 16.4 Projection

- `deriveDashboard`
- `deriveCaseDetail`
- `deriveReview`
- `deriveResult`
- `deriveLeaderboard`
- `deriveActionReadiness`

### 16.5 App / UI

- `world persistence`
- `game persistence`
- `session persistence`
- `UI`

---

## 17. 持久化边界建议

为了防止后面表设计又混层，我建议从一开始就按两套存储对象看。

### 17.1 游戏层持久化

建议单独持久化：

- `accounts`
- `account_identities`
- `account_sessions`
- `account_workspace_grants`
- `player_profiles`
- `player_career_stats`
- `player_achievements`
- `leaderboard_entries`

### 17.2 局内层持久化

建议单独持久化：

- `game_runs`
- `game_run_saves`
- `daily_run_snapshots`
- `run_events`
- `run_matters`
- `run_results`
- `run_sessions`

### 17.3 最关键的规则

- `run_events` 不能省
  因为复盘、归因、结果可信度都靠它
- `run_sessions` 可以轻
  因为它是视角态，不是业务真相
- `daily_run_snapshots` 可以按阶段性快照做
  但不要拿它替代事件流

---

## 18. 难度层：怎么配置化、可控化接入

这层回答的是：

> 一局游戏的难度，到底是什么，怎么被配置，怎么真正作用到运行时。

先说结论：

> 难度不能只是一个 `difficulty = easy` 字符串。

因为“热身 / 入门 / 标准 / 进阶 / 高压 / 极限”这些名字，只是给用户看的档位名。
真正能控制一局难不难的，必须是一个独立的配置层。

如果不把难度独立出来，后面会出现 4 个问题：

1. 难度只能靠散落参数调，无法解释。
2. 新增一个档位要改很多代码，无法稳定扩展。
3. 标准局和随机局的难度很容易漂。
4. 评分、生成、日结、事件池会各自理解不同的“难度”。

### 18.1 难度分三层，不要混成一层

我建议把难度明确拆成三层：

#### A. `DifficultyTier`

这是给用户看的档位。

例如：

- `warmup`
- `intro`
- `standard`
- `advanced`
- `pressure`
- `extreme`

这一层回答：

- 档位叫什么
- 对外文案是什么
- 是否已解锁
- 默认推荐哪个标准局

它解决的是产品表达，不直接控制世界。

#### B. `DifficultyProfile`

这是系统内部的难度画像。

这一层回答：

- 这档难度允许出现什么样的局面
- 强度边界在哪
- 哪些压力可以叠加，哪些不能叠加

它是难度真正的“配置中心”。

#### C. `RunDifficultyConfig`

这是某一局真正落地生效的配置。

这一层回答：

- 这局最终的房源数是多少
- 这局总天数是多少
- 这局事件密度是多少
- 这局竞争耦合是多少
- 这局容错到底多低

也就是说：

- `DifficultyTier` 是产品目录
- `DifficultyProfile` 是规则边界
- `RunDifficultyConfig` 是本局生效值

### 18.2 难度不该只控制一个总分

难度不应该只用一个 `difficultyScore` 统管全部。

更稳的做法是拆成几组旋钮。

我建议至少固定 6 个主旋钮：

1. `caseLoad`
   房源负载：一局几套房、几套重点盘、几套可放弃盘。
2. `timePressure`
   时间压力：总天数、短窗口盘比例、周末节点密度。
3. `relationshipFragility`
   关系脆弱度：业主耐心、信任初值、客户流失敏感度。
4. `marketPressure`
   市场压力：竞品强度、同类盘密度、价格压力、外部事件强度。
5. `eventDensity`
   事件密度：负面事件频率、脚本事件数量、波动强弱。
6. `couplingComplexity`
   耦合复杂度：一套盘的变化会不会更强地外溢到别的盘。

必要时还可以加两个副旋钮：

7. `resourceTightness`
   资源紧度：精力、预算、事项容量的宽松程度。
8. `executionTolerance`
   执行容错：错误动作的惩罚有多重，补救空间有多大。

### 18.3 难度配置不直接写进代码判断

不要在代码里到处写：

```ts
if (difficulty === 'hard') { ... }
```

这会让难度很快失控。

建议所有引擎只读统一配置，不识别档位名。

也就是说：

- `MarketEngine` 不认识 `高压`
- `TickEngine` 不认识 `极限`
- `ActionReadinessEngine` 不认识 `入门`

它们只认识：

- 时间压力是多少
- 关系脆弱度是多少
- 事件密度是多少
- 资源紧度是多少

这样一来：

- 换一档难度不用改引擎代码
- 新增隐藏档位或活动档位也很容易

### 18.4 难度的接入链路

我建议固定成这条链：

```text
DifficultyTier
  -> DifficultyProfile
  -> ScenarioBlueprint / ScenarioGenerationRequest
  -> DifficultyCompiler
  -> RunDifficultyConfig
  -> World / Engine / Settlement
```

具体来说：

1. 用户在开始页选择一个 `DifficultyTier`
2. 系统读取对应的 `DifficultyProfile`
3. 生成器按该画像选蓝图、选素材、选事件池
4. `DifficultyCompiler` 把画像编译成这局的 `RunDifficultyConfig`
5. 开局时把 `RunDifficultyConfig` 写入 `GameRun`
6. 局内所有引擎只读取 `RunDifficultyConfig`
7. 结算时再根据 `DifficultyTier` 和 `RunDifficultyConfig` 解释这局成绩

### 18.5 难度具体会作用到哪些地方

架构上，难度应该至少接入 5 个点：

#### A. 开局生成

控制：

- 房源数
- 房源角色分布
- 业主类型分布
- 客户池规模
- 外部门店和竞品强度
- 市场事件池

#### B. 局内资源初值

控制：

- 初始精力
- 初始预算
- 初始事项容量
- 初始信任/耐心基线

#### C. 日结规则

控制：

- 热度衰减速度
- 业主耐心衰减速度
- 客户停滞和流失概率
- 负面事件命中强度
- 外部竞品施压频率

#### D. Action Readiness 和推进门槛

控制：

- 谈价需要多高证据
- 客户推进需要多强匹配
- 高风险动作的容错

#### E. 结算解释

控制：

- 这档难度下什么叫“好局”
- 哪类失败是合理失败
- 榜单分数如何解释

这里要强调：

> 难度不该换一套完全不同的评分公式。

更稳的是：

- 评分维度不变
- 但同样的高分，在更高难度下更难打出来

### 18.6 难度对象建议长什么样

建议类型如下：

```ts
type DifficultyTierId =
  | 'warmup'
  | 'intro'
  | 'standard'
  | 'advanced'
  | 'pressure'
  | 'extreme';

type DifficultyTier = {
  id: DifficultyTierId;
  name: string;
  description: string;
  unlockRule?: string;
  defaultScenarioId?: string;
  profileId: string;
};

type DifficultyProfile = {
  id: string;
  tierId: DifficultyTierId;
  caseLoad: RangeConfig;
  timePressure: RangeConfig;
  relationshipFragility: RangeConfig;
  marketPressure: RangeConfig;
  eventDensity: RangeConfig;
  couplingComplexity: RangeConfig;
  resourceTightness: RangeConfig;
  executionTolerance: RangeConfig;
  allowedBlueprintIds: string[];
  allowedEventPools: string[];
  validationRules: string[];
};

type RunDifficultyConfig = {
  tierId: DifficultyTierId;
  profileId: string;
  blueprintId: string;
  caseCount: number;
  maxDays: number;
  initialEnergy: number;
  initialBudget: number;
  matterCapacity: number;
  ownerTrustBase: NumberRange;
  ownerPatienceBase: NumberRange;
  customerPoolScale: number;
  rivalPressure: number;
  eventDensity: number;
  heatDecayRate: number;
  patienceDecayRate: number;
  leakageRate: number;
  scoringTargetBand: NumberRange;
};
```

### 18.7 哪些是配置文件，哪些是运行态

这一刀也必须切清楚。

配置文件里放：

- `DifficultyTier`
- `DifficultyProfile`
- `ScenarioBlueprint`
- 标准事件池
- 难度校验规则

运行态里放：

- `GameRun.selectedDifficultyTier`
- `GameRun.runDifficultyConfig`
- 当前世界按该配置跑出来的结果

也就是说：

- 配置是“规则”
- 运行态是“本局实例”

### 18.8 哪些地方绝不能自己偷偷带难度逻辑

下面这些模块不能私藏自己的“难度判断”：

- `CaseRuntime`
- `OwnerCaseRelation`
- `CustomerCaseRelation`
- `Matter`
- `Projection`

它们可以读取难度编译后的结果，
但不能自己再发明一套 `easy/hard` 逻辑。

否则会出现：

- 开局生成理解的难度
- 日结理解的难度
- 结果页理解的难度

三套不一致。

### 18.9 最后一句：难度是配置层，不是情绪词

对用户来说，难度当然可以有气质：

- 顺手
- 拉扯
- 高压
- 极限

但对架构来说，难度必须是：

- 有目录
- 有画像
- 有编译
- 有运行配置
- 有校验

只有这样，它才真的是“可配置、可控、可解释”的。

---

## 19. 最后一句总原则

以后只要再遇到“这个字段该挂哪”的问题，就按这 4 句判断：

1. 这是主体自己的东西，还是两者之间的东西
2. 这是画像，还是运行时状态
3. 这是持续关系，还是一次事项
4. 这是世界真相，还是页面投影

只要这 4 句不乱，后面架构就不会再轻易塌回 `GameState` 大对象。
