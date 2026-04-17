# 我是王牌资产顾问 · 维护人主视角与影子商圈层技术方案

最后更新：2026-04-18

这份文档专门解决一个问题：

- 在不把系统做得过于晦涩、不过早引入全知世界双状态机的前提下，怎么把“同公司其他经纪人、外公司门店、竞品房源、共享客户压力、未知需求信号、每日商圈事件”放进当前卖房玩法。

一句话方案：

- 保留维护人主视角 `GameState`
- 在它旁边新增一个“影子商圈层”
- 让其他经营主体和市场变化通过轻量对象与每日结算进入局面

这不是要把当前玩法推翻重做。

这是要把当前的“多房经营”升级成“维护人主视角下的商圈经营博弈”。

---

## 一、设计目标

这次改造想解决的，不是 UI 不够多，也不是事件不够花。

它要解决 4 个根问题：

1. 现在默认只有玩家在行动，商圈不够活
2. 客户看起来几乎都是玩家私有，不像共享资源
3. 竞品更多像数值压力，不像真实存在的房
4. “有些业主不是你运营的、有些客户你不知道”还没有结构化落点

所以这次技术方案的目标是：

- 继续让玩家站在“维护人”视角玩
- 不要求玩家知道全部真相
- 不要求后端或前端立刻升级成完整双状态世界模拟
- 先把“别人也在动”“资源并不都属于你”“你看到的不等于全部真相”这三件事做成立

---

## 二、非目标

这版方案明确不做下面这些事：

- 不做完整 `TruthState / PlayerViewState` 双状态机
- 不做外部门店的完整玩家级模拟
- 不做所有未知客户、未知业主的全量真实对象池
- 不把 UI 改成过于抽象的策略地图
- 不要求第一期就引入全新数据库结构做所有对象持久化

第一期的目标不是“最完整”，而是“最可落地”。

---

## 三、核心收敛句

以后这条线统一按这句话设计：

- 玩家仍然是维护人主角
- 但玩家不是唯一行动者
- 房源、客户、价格锚和商圈热度都处在共享市场里
- 同公司其他经纪人和外公司门店每天都在轻量行动
- 玩家看到的是可操作的经营面，不是全量世界真相

这句话决定了技术架构的基本方向：

- 主状态继续围绕“我能经营什么”
- 影子状态补足“别人也在做什么”

---

## 四、总体架构

建议把当前卖房运行时架构收敛成两层：

1. `MaintainerCore`
2. `ShadowMarketLayer`

### 1. `MaintainerCore`

这是当前已经存在、并且应该继续保持为主轴的部分：

- 我的房源
- 我的线索
- 我的精力
- 我的推广金
- 我的每日动作
- 我的复盘与结算

这一层继续直接服务玩家操作。

### 2. `ShadowMarketLayer`

这是本次新增层。

它表达：

- 同公司其他经纪人的竞争压力
- 外公司门店的竞争压力
- 商圈里可见的竞品房源
- 玩家尚未完全掌握的需求信号
- 每日主事件和临时规则

这一层不要求玩家逐个操作。

它的作用是：

- 每天改变盘面
- 改写玩家可见机会
- 给我方房源施加压力
- 让游戏从“我经营我的房”升级成“我在共享商圈里经营我的房”

---

## 五、运行时状态收敛

当前 `GameState` 不拆掉。

第一期建议直接扩展现有 `GameState`，增加一个 `marketShadow` 分组。

推荐结构如下：

```ts
interface GameState {
  // 现有
  cases: Case[];
  opportunities: Opportunity[];
  markets: MarketCell[];
  eventLog: EventLogEntry[];
  rules: GameRules;
  day: number;
  energy: number;
  cash: number;
  reputation: number;

  // 新增
  marketShadow: ShadowMarketState;
}

interface ShadowMarketState {
  rivalStores: RivalStore[];
  rivalListings: RivalListing[];
  companyPressure: CompanyPressureState;
  marketSignals: MarketSignal[];
  dailyMarketEvent: DailyMarketEvent | null;
  activeRuleEffects: RuleEffect[];
}
```

这样做的好处是：

- 不打断当前前端状态流
- 不要求 UI 立刻重写
- 可以先让“影子商圈”进入日结算
- 存档层也能先直接跟着 JSON 快照走

---

## 六、新增对象定义

第一期只新增 5 类对象。

### 1. `RivalStore`

表达一个竞争主体。

它可能是：

- 同公司其他经纪人
- 外公司门店

建议字段：

```ts
interface RivalStore {
  id: string;
  name: string;
  type: 'same_company' | 'external_company';
  style: 'aggressive' | 'steady' | 'relationship' | 'traffic';
  districtFocus: string[];
  leadCapturePower: number;
  sellerInfluencePower: number;
  pricingPressurePower: number;
}
```

说明：

- `RivalStore` 不是完整玩家镜像
- 它只在每日结算时提供轻量竞争动作

### 2. `RivalListing`

表达商圈里可见的竞品房源。

建议字段：

```ts
interface RivalListing {
  id: string;
  storeId: string;
  title: string;
  district: string;
  marketCellId: string;
  segment: string;
  askPrice: number;
  heat: number;
  freshness: number;
  storyStrength: number;
  leadSiphonPower: number;
  ownerAnchorPower: number;
  status: 'active' | 'sold' | 'withdrawn';
  daysLeft: number;
  source: 'seed' | 'daily_event';
}
```

说明：

- 它不是玩家的房
- 不参与玩家动作系统
- 不进入玩家单房结局
- 但会通过价格锚、客户虹吸、热度压制影响我方房源

### 3. `CompanyPressureState`

表达同公司内部不是纯敌对、也不是纯协作的压力。

建议字段：

```ts
interface CompanyPressureState {
  sharedLeadPressure: number;
  focusSlotPressure: number;
  internalReferralChance: number;
  internalCompetitionHeat: number;
}
```

作用：

- 让“同公司其他经纪人也在竞争”成立
- 但不必先做完整同事房源模拟

### 4. `MarketSignal`

表达玩家只能模糊感知到的信息。

建议字段：

```ts
interface MarketSignal {
  id: string;
  type: 'buyer_demand' | 'seller_intent' | 'rival_activity';
  district: string;
  confidence: number;
  message: string;
  expiresInDays: number;
}
```

作用：

- “有的客户你不知道”
- “有的业主不是你在运营”

这两件事在第一期不需要完整对象化，先通过 `MarketSignal` 落地。

### 5. `DailyMarketEvent`

表达“今天整个商圈发生了什么”。

建议字段：

```ts
interface DailyMarketEvent {
  id: string;
  title: string;
  message: string;
  tone: 'success' | 'accent' | 'danger';
  layer: 'market' | 'rival' | 'company' | 'seller';
  effectPayload: Record<string, unknown>;
}
```

作用：

- 事件不再只是“给某套房加减数值”
- 事件首先是“今天整个商圈发生了什么”

---

## 七、页面与交互层收敛

前台仍然站在维护人视角，不做复杂地图。

第一期建议把页面结构收成：

- `我的房源`
- `竞品房源`
- `客户线索`
- `商圈动态`
- `复盘`

### `我的房源`

继续放玩家主维护的房源。

这里仍然是最核心的操作页。

### `竞品房源`

新增页。

展示：

- 可见的外部竞品盘
- 它们来自哪类门店
- 哪些盘正在抢你的客户
- 哪些盘在给你的业主制造锚点

### `客户线索`

保留原有 `opportunities`。

同时补一块：

- 市场需求信号
- 公司共享客户压力

### `商圈动态`

放：

- 今日主事件
- 市场信号
- 竞品入场/成交/撤出
- 同公司资源位压力

---

## 八、日循环改造方案

当前主日循环在：

- [src/selling-houses/domain/engine.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/engine.ts)

建议改成下面这个顺序：

```ts
resolveOneDay(state) {
  updateMarkets(state);
  tickSeasonality(state);

  rollDailyMarketEvent(state);
  applyDailyMarketEvent(state);

  tickRivalStores(state);
  tickRivalListings(state);
  applyRivalPressure(state);
  applyCompanyPressure(state);

  updateCustomers(state);
  tickOpportunities(state);
  tickCompetition(state);
  fireScheduledEvents(state);
  tickCases(state);
  spawnPassiveLeads(state);

  settleMarketSignals(state);
}
```

### 核心新增阶段解释

#### `rollDailyMarketEvent`

每天只生成一个“今日主事件”。

它回答：

- 今天整个商圈发生了什么

#### `tickRivalStores`

让同公司其他经纪人、外公司门店做轻量动作。

这些动作不直接暴露给玩家逐条操作，只体现在结果上。

#### `tickRivalListings`

推进竞品房源的状态：

- 持续加热
- 下架
- 成交
- 进入你的视野

#### `applyRivalPressure`

把竞品房源的存在转成我方盘面压力：

- 热度被吸走
- 价格锚被压低
- 业主信任波动
- 客户更易流失

#### `applyCompanyPressure`

表达同公司内部竞争：

- 公司共享客户更紧张
- 内部聚焦资源位更少
- 有时内部能转单
- 有时内部先截获客源

#### `settleMarketSignals`

根据今天真实发生的事情，给玩家投递新的模糊情报。

这一步让“你不知道全部真相”成立，但不需要完整双状态机。

---

## 九、竞争系统的收敛

以后竞争分三层：

### 1. 内部竞争

玩家自己手里的房之间争：

- 精力
- 推广金
- 周末资源位
- 行动力排序

### 2. 公司内竞争

同公司其他经纪人争：

- 公司共享客户
- 公司聚焦资源
- 房源主运营权

### 3. 外部竞争

外公司争：

- 业主信任
- 客户注意力
- 价格锚
- 成交先手

第一期技术上不要求三层都完全对象化。

但至少要做到：

- 内部竞争：继续保留现有系统
- 公司内竞争：通过 `CompanyPressureState` 进入日结算
- 外部竞争：通过 `RivalStore + RivalListing` 进入日结算

---

## 十、未知信息怎么做

“有些客户你不知道”“有些业主不是你在运营”，这两件事非常重要。

但第一期不建议直接做完整隐藏对象池。

建议分两步。

### 第一步：先做信号化

通过：

- `MarketSignal`
- `CompanyPressureState`
- `RivalListing`

表达这些事实。

例如：

- “最近静安一房首置客明显被吸走”
- “同公司另一位经纪人先接触了一位换房业主”
- “同小区有一套平替盘刚被另一家重点推广”

这一步已经能让玩家感到：

- 自己知道的不完整
- 自己不是唯一行动者

### 第二步：再做对象化

等玩法稳定后，再把：

- 潜在业主
- 未知客户
- 共享客户

升级成真正对象。

第一期不做这个，是为了控制复杂度。

---

## 十一、统一入场机制

你在讨论里反复提到三类很关键的需求：

- 别人客户找你了
- 别的房源找你了
- 新房源进来了

这三件事不要分别硬塞到不同地方。

它们本质上都属于同一种机制：

- 外部对象进入了玩家当前的可见范围、压力范围，或者可操作范围

所以建议统一抽象成：

- `InboundOpportunity`

### 为什么一定要统一抽象

如果不统一，后面会出现：

- 一类需求写成随机事件
- 一类需求直接塞进 `cases`
- 一类需求偷偷改 `opportunities`

最后同一个业务现象，会被三套不同代码路径处理，平衡和回放都会越来越乱。

统一后就会非常清楚：

- 它是什么对象进来了
- 进入的是“市场层”还是“玩家层”
- 玩家能不能立刻操作
- 它会给玩家带来机会，还是压力

### 建议类型

```ts
interface InboundOpportunity {
  id: string;
  type:
    | 'customer_to_player'
    | 'listing_to_player'
    | 'rival_listing_to_market'
    | 'signal_to_player';
  source:
    | 'same_company'
    | 'external_company'
    | 'seller_referral'
    | 'market_event'
    | 'system_seed';
  title: string;
  message: string;
  payload: Record<string, unknown>;
}
```

### 四类统一解释

#### `customer_to_player`

原本不归你掌握的客户，现在进入了你的线索池。

例子：

- 同公司同事转了一个客户给你
- 别家公司带看的客户转头来问你
- 老客户介绍了一个新需求

第一期落点：

- 直接生成 `Opportunity`

#### `listing_to_player`

原本不归你经营的房，现在进入了你的经营盘。

例子：

- 业主朋友的房找你来做
- 同公司内部把一套盘交给你
- 别家没做顺，业主转头来问你

第一期落点：

- 直接生成新的 `Case`
- 并带来源标签，便于后续复盘

#### `rival_listing_to_market`

有新房源进入市场，但不是你的房。

例子：

- 同小区新挂出一套急售盘
- 隔壁门店接到一套次新精装盘
- 同板块新增一套强平替盘

第一期落点：

- 生成新的 `RivalListing`

#### `signal_to_player`

你只收到风声，还没拿到真实对象。

例子：

- 听说某个换房业主在比较几家门店
- 最近某类客户在商圈里变活跃了
- 某个板块的投资客突然变多

第一期落点：

- 生成新的 `MarketSignal`

### 技术入口建议

第一期建议统一做一个调度入口：

```ts
applyInboundOpportunity(state, inbound)
```

它只做两件事：

1. 根据 `type` 决定对象落到哪一层
2. 记录日志与来源，保证之后能复盘“它是怎么来的”

这样以后新增类似需求时，不需要改很多地方，只要：

- 新增模板
- 生成 `InboundOpportunity`
- 交给统一入口分发

---

## 十二、需求支持矩阵

下面把这次对话里最关键的几类需求，收成一个可以直接指导实现的矩阵。

| 需求 | 第一阶段落点 | 玩家是否立刻可操作 | 技术实现方式 | 后续可升级方向 |
|---|---|---:|---|---|
| 别人客户找你了 | `opportunities` | 是 | `customer_to_player` | 以后升级为共享客户对象 |
| 同公司转一个客户给你 | `opportunities + companyPressure` | 是 | `customer_to_player` | 以后区分主跟进人与转单归因 |
| 别家公司客户回流找你 | `opportunities + dailyMarketEvent` | 是 | `customer_to_player` | 以后记录 rival 接触历史 |
| 别的房源找你了 | `cases` | 是 | `listing_to_player` | 以后升级为经营权争夺 |
| 同公司把一套盘交给你 | `cases + companyPressure` | 是 | `listing_to_player` | 以后区分接手 / 共管 / 转出 |
| 业主朋友的房找你来做 | `cases + dailyMarketEvent` | 是 | `listing_to_player` | 以后升级为卖方关系网络 |
| 新房源进市场但不是你的 | `rivalListings` | 否 | `rival_listing_to_market` | 以后升级为完整可追踪竞品盘 |
| 听说有业主在比较几家门店 | `marketSignals` | 否 | `signal_to_player` | 以后升级为潜在业主对象 |
| 有一类客户最近变多了 | `marketSignals` | 否 | `signal_to_player` | 以后升级为真实需求池 |

这个矩阵的核心意义是：

- 现在就能支持这些需求
- 但不必第一期就把它们做成完整复杂对象
- 先用“对象 + 信号 + 入场分发”三件套落地

---

## 十三、对象进入哪一层

这一步要特别写清楚，避免以后“新东西进来”时架构边界模糊。

### 进入玩家可操作层

会直接进入 `MaintainerCore` 的只有两类：

- `customer_to_player`
- `listing_to_player`

因为它们一进入，玩家就应该能做动作。

### 进入影子商圈层

会进入 `ShadowMarketLayer` 的有三类：

- `rival_listing_to_market`
- `signal_to_player`
- 各类 `dailyMarketEvent`

因为它们首先改变的是盘面，而不是立刻给玩家一个明确可操作对象。

### 边界判断标准

以后任何新需求，都先问这两个问题：

1. 玩家今天能不能直接对它做动作？
2. 它首先影响的是“我的经营对象”，还是“整个商圈盘面”？

如果答案是：

- 能直接操作
  放进 `MaintainerCore`
- 先改变盘面
  放进 `ShadowMarketLayer`

这样边界会一直很清楚。

---

## 十四、代码目录改造建议

在现有目录下，新增但不大拆。

建议新增：

```text
src/selling-houses/domain/
  market/
    dailyEventDirector.ts
    signalEngine.ts
  rivals/
    rivalStoreEngine.ts
    rivalListingEngine.ts
  company/
    companyPressureEngine.ts
```

### 模块职责

#### `market/dailyEventDirector.ts`

负责：

- 每天生成主事件
- 控制不同难度的事件密度

#### `market/signalEngine.ts`

负责：

- 根据当天真实结果生成玩家可见的市场信号
- 清理过期信号

#### `rivals/rivalStoreEngine.ts`

负责：

- 竞争主体的轻量行为

#### `rivals/rivalListingEngine.ts`

负责：

- 竞品房源的生成、衰减、成交、撤出
- 对玩家房源的竞争施压

#### `company/companyPressureEngine.ts`

负责：

- 同公司共享资源压力
- 内部客户竞争
- 转单概率

---

## 十五、Scenario 与 World 的扩展建议

在不推翻现有 `World / Scenario / Run` 的前提下：

### `WorldSpec` 新增

- `rivalStoreArchetypes`
- `rivalListingArchetypes`
- `signalTemplates`
- `dailyEventTemplates`

### `ScenarioDefinition` 新增

- `initialRivalStores`
- `initialRivalListings`
- `dailyEventPool`
- `companyPressureProfile`

这样一来：

- World 定义“这世界里可能有什么”
- Scenario 定义“这局一开始商圈里有什么”
- Run 负责“今天变成什么样”

---

## 十六、存档与云端持久化建议

第一期最稳的做法是：

- 不急着新建一堆结构化表
- 先让新增状态跟着 `save_data` 快照走

也就是说，先把这些字段放进存档 JSON：

- `marketShadow.rivalStores`
- `marketShadow.rivalListings`
- `marketShadow.companyPressure`
- `marketShadow.marketSignals`
- `marketShadow.dailyMarketEvent`
- `marketShadow.activeRuleEffects`

这样：

- 不会被数据库建模速度卡住
- 前后端都能快速验证玩法
- 之后结构稳定了，再拆表

### 第二期再考虑的结构化表

- `maintainer_rival_stores`
- `maintainer_rival_listings`
- `maintainer_market_signals`
- `maintainer_market_daily_events`
- `maintainer_rule_effects`

---

## 十七、未来扩展性与升级边界

这版方案的目标不是一次做到最终形态，而是先把未来 80% 到 90% 的需求接住。

### 现在就能稳接的需求

- 同公司竞争
- 外公司竞争
- 竞品房源
- 每日事件
- 市场信号
- 新客户、新房源、新竞品入场
- 玩家不知道全部真相的感觉

### 以后需要升级但不推翻的需求

下面这些需求也能做，但做到更深时，需要从“影子层”升级为“显式对象层”：

- 共享客户真正有主跟进人和转单关系
- 同一个业主同时比较多家门店
- 经营权不是瞬时切换，而是逐步争夺
- 情报会延迟、失真、误导
- 同公司协作与竞争同时存在更细粒度规则

### 升级路径

第一阶段：

- `signal + shadow + inbound`

第二阶段：

- `shared seller + shared demand + contested listing`

第三阶段：

- 更正式的 `TruthState / PlayerViewState`

所以这份方案不是死架构。

它是一个刻意设计成可演进的中间骨架：

- 第一阶段够落地
- 第二阶段够扩容
- 第三阶段不需要推翻，只需要继续结构化

---

## 十八、对游戏性的全局影响

这一节不讨论“代码好不好写”，而讨论：

- 这套架构会把游戏玩起来变成什么味道
- 会不会更有趣
- 会不会更上瘾
- 会不会更难
- 会不会更容易失控

这是必须写清楚的，因为这次改造不是普通系统扩容。

它会直接改写玩家每天在玩什么。

### 1. 对趣味性的正向影响

这套架构最大价值，不是“世界更真实”，而是：

- 让局面更会反扑
- 让每天更像在接招
- 让选择不再只是内部排序

当前版本的主要趣味来自：

- 多套房之间的资源分配
- 带看和收口节奏
- 单房结局差异

引入影子商圈层后，趣味来源会明显扩成五类：

#### A. 局面更活

以前局面主要靠玩家自己推动。

以后局面会因为：

- 别家门店动作
- 新竞品入场
- 公司内部资源变化
- 未知需求信号

而持续变化。

这会显著提升“今天又有点不一样”的感觉。

#### B. 决策更像经营，而不是刷动作

玩家不再只是问：

- 哪套房今天先带看
- 哪套房今天先收口

而会问：

- 这套盘还值得我守吗
- 这波客户是真机会，还是只是市场噪音
- 这套新来的房值不值得接
- 我现在是要保自己手里的盘，还是抢这套新机会

这会让玩法更有“经营判断”的味道。

#### C. 每日事件终于真的有戏剧作用

没有影子商圈层时，每日事件容易退化成：

- 给某套房加减几个数值

有了这层以后，每日事件更容易真正改写局势：

- 今天别家门店先打爆一套盘
- 今天同公司客户池变紧
- 今天一个新房源进入你的可操作面

这会让每日节奏更立体。

#### D. “接盘”“抢客”“守盘”会变成独立乐趣

以后不只是经营现有盘有趣。

下面这些动作本身也会变得有趣：

- 接一个新盘要不要接
- 一个别家的客户找你，你要不要抢
- 某竞品进场后，你要不要硬守

这意味着乐趣不再只来自“把盘做完”，也来自“决定要不要下场”。

#### E. 复盘的故事性更强

有了影子商圈层之后，复盘不再只是：

- 哪套房成交
- 哪套房没成交

而会变成：

- 这套盘原本不在我手里，我接进来后怎么做
- 这拨客户本来被别家带走，后来怎么回来的
- 这套竞品盘进场后，把我哪套房打崩了

这会显著提升每局结束后的可讲述性。

### 2. 对上瘾程度的正向影响

这套架构会明显提升“再开一局”的动力，但前提是控制得当。

最核心的原因有三点。

#### A. 盘面不再完全可预测

如果局势几乎只由开局决定，玩家很快会形成固定打法。

引入：

- 竞品入场
- 客户回流
- 新盘转入
- 市场信号

后，每局都会多出一层“中盘变化”。

这会强化：

- “我再来一局看看这次会怎么变”

#### B. “错失”和“捡漏”会带来强情绪

上瘾感很多时候不是来自绝对胜利，而是来自：

- 差一点就抢到了
- 这盘本来不想接，结果接了很赚
- 这个客户我以为没戏，居然回流了

这些高波动、小概率、但可解释的经营瞬间，会比单纯数值优化更让人想继续玩。

#### C. 维护人视角更容易形成代入感

因为我们没有把系统做成过于抽象的战争棋盘，而是仍然让玩家感觉：

- 我在带盘
- 我在接客户
- 我在看同业动作

所以它的上瘾点不是“纯策略推演”，而是：

- “这局商圈怎么又起变化了”
- “我这次能不能把局接住”

这更接近可重复玩的经营游戏。

### 3. 对难度的影响

这套架构一定会让游戏整体变难，但不是简单数值意义上的更难。

它会把难度从：

- 执行难度

推向：

- 判断难度
- 取舍难度
- 情报解读难度

具体会增加四种难度。

#### A. 优先级难度

因为玩家不再只面对“已有盘”。

还会面对：

- 新盘要不要接
- 新客户要不要抢
- 竞品入场后哪套房优先守

#### B. 认知难度

因为你看到的不再等于全部真相。

这会增加：

- 信息判断
- 风险识别
- 对模糊信号的取舍

#### C. 中盘难度

现在很多局最大问题是清局太快。

影子商圈层会让中盘持续产生新的对象和压力。

这会显著增强：

- 第 5 天以后还在博弈
- 不是一套收口动作就能速通

#### D. 止损难度

当新的房和新的客户不断进入时，玩家必须学会：

- 不是什么都接
- 不是什么都救

这会让“止损”从边缘判断升级成核心技能。

### 4. 对难度曲线的影响

这套架构不是所有难度都该同强度启用。

必须分档使用。

#### `warmup`

只允许：

- 少量正向市场信号
- 很弱的竞品存在感

不允许：

- 新盘转入
- 强公司内竞争
- 高频客户回流扰动

目标：

- 教玩家理解盘面，不让人被噪声压死

#### `easy`

开始允许：

- 偶发客户回流
- 少量竞品盘入场

但大多数仍然偏正向或可控。

#### `standard`

正式引入：

- 竞品房源
- 同公司压力
- 模糊市场信号

目标：

- 让玩家开始感到“不是只有我在行动”

#### `advanced`

开始把：

- 新盘入场
- 资源争夺
- 情报误差

都作为中盘压力源。

#### `hard / extreme`

这两个档位才能高频出现：

- 多主体同时施压
- 新盘和客户同时打断计划
- 公司内外双层竞争

这样难度会更真实，也更有分层感。

### 5. 对当前主要问题的帮助

这套架构不是只增加复杂度。

它正好能对当前几个核心问题提供帮助。

#### A. 对“清局过快”的帮助

新对象和新压力进入后，中盘更容易持续有局面。

也就是说：

- 局不会只靠开局那批房自己滚完

#### B. 对“后段动作可刷”的帮助

当商圈不断变化时，单一收口动作更难成为支配策略。

因为玩家必须不断应对：

- 新竞品
- 新客户
- 新房
- 新压力

这会天然削弱“一个动作打穿所有局”的问题。

#### C. 对“撤盘压力不显性”的帮助

当别家门店和竞品盘真实存在时，“被截走”“被锚死”“窗口错过”会更容易在过程中显性发生。

#### D. 对“难度梯度不够细”的帮助

以后难度不再只是调我方数值。

还可以调：

- 竞品存在感
- 公司压力
- 信号密度
- 新对象入场频率

这样难度设计会更细。

### 6. 上瘾风险与设计风险

这套架构虽然能增强趣味性和重复玩性，但也有明显风险。

必须写清楚。

#### 风险 A：信息噪音过大

如果每天同时来了：

- 新客户
- 新盘
- 新竞品
- 新事件

玩家会直接失焦。

所以第一原则是：

- 每天最多 1 个主变化
- 不是每天都要有新东西进来

#### 风险 B：维护人主角感被稀释

如果别家门店太活跃、外部事件太频繁，玩家会觉得：

- 我不是在经营，我是在被系统推着走

所以必须保证：

- 所有新变化最终都落回玩家可处理的经营决策

#### 风险 C：学习门槛突然抬太高

如果 `easy` 一上来就有：

- 同公司竞争
- 外公司抢客
- 模糊信号
- 新盘入场

玩家会觉得世界很真实，但不知道怎么玩。

所以必须按难度逐步放开。

#### 风险 D：复盘解释不清

如果玩家输了，却不知道：

- 是被谁抢了
- 为什么那盘会失守
- 为什么客户流走了

那这套系统会伤结算信任。

所以后续 UI 和复盘文案一定要能解释：

- 今天谁影响了你
- 哪类竞品盘压了你
- 哪个信号没接住

### 7. 设计上的总原则

这套架构不是为了让世界更复杂。

它真正要做的是让玩家更频繁地遇到这三种有趣瞬间：

1. 原计划被打断
2. 新机会突然出现
3. 你必须在不知道全部真相的情况下做判断

只要这三件事成立，游戏会更有趣、更耐玩，也更像真正的维护人经营局。

---

## 十九、分阶段落地方案

### Step 1：只读影子层

新增：

- 竞品房源
- 今日事件
- 市场信号

但它们先不强烈影响玩法。

目标：

- 先让“别人也在动”进入玩家认知

### Step 2：压力传导

让影子层开始影响我方房源：

- 热度被吸走
- 价格锚施压
- 同公司客户压力增加

目标：

- 让局面真正会反扑

### Step 3：盘面事件

让每日事件能生成：

- 新竞品入场
- 新市场信号
- 同公司资源位争夺

目标：

- 让每日事件不只是新闻，而是盘面驱动器

### Step 4：再考虑显式争夺

等前三步稳定后，再做：

- 非我运营业主
- 潜在房源
- 经营权争夺

目标：

- 把“争夺中的房源”正式做成玩法对象

---

## 二十、完整执行计划

这一节不再讲概念，而是基于当前真实代码状态，给出一条可以直接排期开发的执行路线。

当前卖房模块已经具备几个非常重要的现实前提：

- 运行时主状态集中在 [src/selling-houses/domain/models.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/models.ts) 的 `GameState`
- 初始状态创建集中在 [src/selling-houses/application/gameState.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/application/gameState.ts) 的 `createInitialState`
- 每日推进主循环集中在 [src/selling-houses/domain/engine.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/engine.ts) 的 `resolveOneDay`
- 前端启动与云同步集中在 [src/selling-houses/application/useGame.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/application/useGame.ts)
- 云端当前保存的是整局 `GameState` JSON，走 [src/selling-houses/application/cloudSync.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/application/cloudSync.ts) 和 [src/selling-houses/infrastructure/cloudClient.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/infrastructure/cloudClient.ts)
- 剧本生成链已经存在，集中在 [src/selling-houses/domain/scenario-generation](</Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/scenario-generation>) 目录

这意味着第一期最合理的打法，不是大拆。

而是：

- 扩 `GameState`
- 扩 `Scenario / World`
- 在日循环里插入影子商圈阶段
- 用当前整局快照存档把新机制先跑起来

### Phase 0：状态骨架与兼容层

这一步的目标不是让玩法立刻变复杂，而是先把“影子商圈层”安全挂到现有运行时里。

#### 0.1 修改 `models.ts`

在 [src/selling-houses/domain/models.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/models.ts) 里新增：

- `ShadowMarketState`
- `RivalStore`
- `RivalListing`
- `CompanyPressureState`
- `MarketSignal`
- `DailyMarketEvent`
- `RuleEffect`
- `InboundOpportunity`

并把 `GameState` 扩成：

```ts
interface GameState {
  // 现有字段
  // ...
  marketShadow: ShadowMarketState;
}
```

同时扩展 `ScenarioDefinition` 与 `WorldSpec`，但第一期只加可选字段：

- `WorldSpec.rivalStoreArchetypes?`
- `WorldSpec.rivalListingArchetypes?`
- `WorldSpec.signalTemplates?`
- `WorldSpec.dailyEventTemplates?`
- `ScenarioDefinition.initialRivalStores?`
- `ScenarioDefinition.initialRivalListings?`
- `ScenarioDefinition.dailyEventPool?`
- `ScenarioDefinition.companyPressureProfile?`

这里必须坚持一个原则：

- 新字段先全部 optional

原因很现实：

- 现有 builtin 剧本、云端 scenario、历史存档都还不知道这些字段
- 先做兼容扩展，避免一上来打碎已有内容

#### 0.2 修改 `gameState.ts`

在 [src/selling-houses/application/gameState.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/application/gameState.ts) 里补三件事：

1. `createInitialState(snapshot, seed)` 默认创建 `marketShadow`
2. `normalizeLoadedState(...)` 给旧存档补默认影子层
3. `buildLegacySnapshot(...)` 与旧版本迁移链不报错

建议新增：

```ts
function createInitialShadowMarket(snapshot: ScenarioSnapshot): ShadowMarketState
function normalizeShadowMarket(input: unknown): ShadowMarketState
```

其中默认策略应该非常克制：

- `rivalStores` 默认空
- `rivalListings` 默认空
- `marketSignals` 默认空
- `dailyMarketEvent` 默认 `null`
- `activeRuleEffects` 默认空
- `companyPressure` 默认一组低压值

这样即使旧剧本没有影子商圈配置，也仍然能正常跑。

#### 0.3 版本号策略

当前 `createInitialState` 里 `version` 已经在维护。

第一期建议：

- `GameState.version` 从当前版本递增
- 只做向前兼容，不做复杂迁移表

验收标准：

- 旧 localStorage 存档能正常载入
- 旧云存档能正常 hydrate
- 没有影子层配置的剧本行为基本不变

### Phase 1：只读影子商圈入场

这一步先解决“商圈里不只有你一个人在动”，但先不让它强压玩法。

#### 1.1 新增目录与模块

在当前目录基础上新增：

```text
src/selling-houses/domain/
  market/
    dailyEventDirector.ts
    signalEngine.ts
  rivals/
    rivalStoreEngine.ts
    rivalListingEngine.ts
  company/
    companyPressureEngine.ts
```

第一期这些模块只做“生成与展示”，不做强介入。

#### 1.2 最小引擎能力

新增函数建议：

- `rollDailyMarketEvent(state)`
- `tickRivalStores(state)`
- `tickRivalListings(state)`
- `settleMarketSignals(state)`

这一步先不做强数值传导，只做：

- 生成今天的商圈主事件
- 推进竞品盘可见状态
- 让同公司/外部门店出现在日志和市场视图里
- 产生模糊信号供玩家认知

#### 1.3 接入 `resolveOneDay`

在 [src/selling-houses/domain/engine.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/engine.ts) 里，当前顺序是：

- `updateMarkets`
- `tickSeasonality`
- `updateCustomers`
- `tickOpportunities`
- `tickCompetition`
- `fireScheduledEvents`
- `tickCases`
- `spawnPassiveLeads`
- `triggerRandomEvent`

第一阶段接入建议放在 `tickSeasonality` 后、`updateCustomers` 前：

```ts
updateMarkets(state);
tickSeasonality(state);

rollDailyMarketEvent(state);
tickRivalStores(state);
tickRivalListings(state);
settleMarketSignals(state);

updateCustomers(state);
```

这样插入的原因是：

- 影子商圈是“今天盘面先发生了什么”
- 然后才影响客户和机会流动

#### 1.4 最小 UI 暴露

当前 UI 结构已经有：

- [src/selling-houses/ui/features/Dashboard.tsx](/Users/jiaqi/Documents/开放日测算/src/selling-houses/ui/features/Dashboard.tsx)
- [src/selling-houses/ui/features/Cases.tsx](/Users/jiaqi/Documents/开放日测算/src/selling-houses/ui/features/Cases.tsx)
- [src/selling-houses/ui/features/Opportunities.tsx](/Users/jiaqi/Documents/开放日测算/src/selling-houses/ui/features/Opportunities.tsx)
- [src/selling-houses/ui/features/Market.tsx](/Users/jiaqi/Documents/开放日测算/src/selling-houses/ui/features/Market.tsx)

第一阶段不建议新开很多页面。

最小改造是：

- `Dashboard.tsx` 增加“今日商圈事件”和“公司压力”卡片
- `Market.tsx` 增加“竞品房源”和“市场信号”分区
- `Opportunities.tsx` 增加“来自商圈的模糊需求信号”区块

这一步不要做太多交互按钮。

目标是先让玩家看到：

- 有别家门店
- 有竞品盘
- 有未知信号
- 有公司内部压力

#### 1.5 Phase 1 验收标准

- 跑现有 builtin scenario 不报错
- UI 能看到非玩家主体存在
- 自博弈不会因为新对象出现而死循环或失真
- 如果 scenario 没有影子层配置，体验与当前版本接近

### Phase 2：压力传导正式接入

这一步开始让影子商圈不是“看板新闻”，而是“局势驱动器”。

#### 2.1 新增传导函数

建议把强影响逻辑独立出来：

- `applyDailyMarketEvent(state)`
- `applyRivalPressure(state)`
- `applyCompanyPressure(state)`

推荐职责如下：

`applyDailyMarketEvent(state)`

- 处理今天的全局增减益
- 例如某板块热度上升、某类买家活跃、某类竞品集中涌入

`applyRivalPressure(state)`

- 把 `rivalListings` 转换成我方盘面的真实压力
- 影响 `Case.heat`
- 影响 `Case.competitiveness`
- 影响部分 `Opportunity.intent/confidence`
- 在必要时写入 `eventLog`

`applyCompanyPressure(state)`

- 把同公司资源挤压转成共享客户与聚焦位压力
- 控制我方被动获得转单的概率
- 控制共享客源被内部先截获的概率

#### 2.2 插入日循环的正式顺序

第二阶段推荐把 `resolveOneDay` 收敛为：

```ts
updateMarkets(state);
tickSeasonality(state);

rollDailyMarketEvent(state);
applyDailyMarketEvent(state);

tickRivalStores(state);
tickRivalListings(state);
applyRivalPressure(state);
applyCompanyPressure(state);

updateCustomers(state);
tickOpportunities(state);
tickCompetition(state);
fireScheduledEvents(state);
tickCases(state);
spawnPassiveLeads(state);
triggerRandomEvent(state);
settleMarketSignals(state);
```

这里的设计重点是：

- 原有 `tickCompetition` 继续负责“我的房之间”的竞争
- 新的 rival/company 引擎负责“别人对我”的压力

不要把两者硬揉成一个函数，不然后面调平衡会越来越难读。

#### 2.3 规则参数进入 `GameRules`

当前 [src/selling-houses/domain/models.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/models.ts) 里的 `GameRules` 已经接住很多平衡项。

影子商圈第一批建议新增这些规则：

- `dailyMarketEventProbability`
- `rivalListingSpawnChance`
- `rivalPressureHeatImpact`
- `rivalPressureTrustImpact`
- `companySharedLeadPressureBase`
- `companyReferralChanceBase`
- `marketSignalDecayDays`
- `marketSignalMaxVisible`

原因是这类值本质上都是“平衡旋钮”。

把它们放进 `GameRules`，而不是散在模块常量里，后面调难度、调剧本、做自博弈分析都会清楚很多。

#### 2.4 与现有“推广金”系统的关系

当前代码里已经从“预算”走向“推广金”语义。

影子商圈进入后，推广金的作用要更业务化：

- 不是纯资源条
- 而是对抗共享市场压力的经营货币

所以第二阶段要保证：

- 某些既有推广动作，能够对 `rivalPressure` 或 `marketSignal` 有解释得通的效果
- 不要只对我方 `heat` 生效，看起来像真空经营

这一步不要求新建很多动作，但要把已有动作的说明和效果往“商圈竞争”上对齐。

#### 2.5 Phase 2 验收标准

- 竞品盘能实质影响我方房源热度/竞争力
- 同公司压力能影响共享客源与资源感受
- 玩家能在过程里感知“被人抢、被人压、有人转单”
- 自博弈结果里开始出现更显性的防守失败来源，而不只是结算扣分

### Phase 3：统一入场机制

这一步是为了把未来需求收敛到同一条技术路径，不让“新客户、新房源、新竞品、新信号”各走各路。

#### 3.1 新增统一入口

建议新增一个薄入口：

```ts
applyInboundOpportunity(state, inbound)
```

建议文件位置：

- `src/selling-houses/domain/market/inboundOpportunityEngine.ts`

职责只做三件事：

1. 根据 `InboundOpportunity.type` 分发到 `cases / opportunities / marketShadow`
2. 记录来源
3. 写入统一事件日志

#### 3.2 四类入场落点

`customer_to_player`

- 生成 `Opportunity`
- 可带 `source` 和 `brokerName`

`listing_to_player`

- 生成新的 `Case`
- 默认带来源标签，如 `same_company_transfer`、`seller_referral`

`rival_listing_to_market`

- 生成 `RivalListing`

`signal_to_player`

- 生成 `MarketSignal`

#### 3.3 与 scenario 生成链的衔接

当前生成式剧本入口在：

- [src/selling-houses/domain/scenario-generation/scenarioAssembler.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/scenario-generation/scenarioAssembler.ts)
- [src/selling-houses/domain/scenario-generation/types.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/scenario-generation/types.ts)

第三阶段建议扩生成链，但先不让它直接生成太复杂对象。

推荐加三类生成能力：

- 初始 rival store/listing 种子
- 每日事件池偏好
- 入场机会模板权重

也就是说，生成器先决定：

- 这局商圈里有哪些竞争主体
- 更容易发生哪类商圈事件
- 更容易出现哪类外部入场

而不是一开始就生成完整真相世界。

#### 3.4 与 `useGame.ts` 的关系

在 [src/selling-houses/application/useGame.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/application/useGame.ts) 里，这一阶段主要不是改 Hook 结构，而是保证：

- 新生成的 `GameState` 依然能直接由 `createInitialState` 产出
- `startFeaturedRun`、`startRandomGeneratedRun` 这类启动路径不需要分叉
- “随机来一局”时，难度只是在 scenario/world 侧给出不同影子商圈压力，而不是前端再做一套 if/else

换句话说：

- 难度差异继续沉到 scenario/world/rules
- `useGame` 继续只是装配与同步层

#### 3.5 Phase 3 验收标准

- “别人客户找你了 / 别的房源找你了 / 新竞品进来了”能走统一入口
- 新玩法需求不需要再同时改 3 到 4 个无关模块
- 生成式六难度都能带着影子商圈跑起来

### Phase 4：场景、世界与云端收口

这一步不是把数据库做复杂，而是把前面跑通的机制收进正式内容体系。

#### 4.1 World 与 Scenario 扩展落点

当前 builtin world 在：

- [src/selling-houses/domain/worlds/builtinWorld.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/worlds/builtinWorld.ts)

当前 builtin scenario 与 catalog 在：

- [src/selling-houses/domain/scenarios/builtinScenarios.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/scenarios/builtinScenarios.ts)
- [src/selling-houses/domain/scenarioCatalog.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/scenarioCatalog.ts)

第四阶段要做的是：

- 在 world 里定义 rival/store/signal/event 模板库
- 在 scenario 里定义初始 rival 布局和事件偏置
- 让 catalog summary 里逐步出现“商圈压力感”的简要描述

这里仍然遵守现有原则：

- World 负责“可能有什么”
- Scenario 负责“这一局开始时摆了什么”
- Run 负责“今天实际发生了什么”

#### 4.2 云端兼容策略

当前云端保存整局 `saveData: GameState`，这是优势。

因此第四阶段的策略应该是：

- API schema 先不拆
- 继续按整局快照保存
- 只要求服务端仓储接受更高版本的 `GameState`

也就是说，第一轮不要求：

- 新建 `rival_listings` 独立表
- 新建 `market_signals` 独立表

等玩法稳定后，再考虑把 leaderboard、局后分析、运营看板需要的字段提炼出来。

#### 4.3 `normalizeLoadedState` 的职责加强

因为云端和本地都可能存在旧局，第四阶段必须把 [src/selling-houses/application/gameState.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/application/gameState.ts) 的归一化职责写稳：

- 任意缺失的 `marketShadow` 子字段都能补默认值
- 旧 runContext 不知道新 scenario 字段时也不崩
- 新旧版本都能继续复盘与结算

#### 4.4 Phase 4 验收标准

- builtin scenario 与云端 scenario 都能带影子商圈
- 老存档和新存档都能读
- 云同步不因为新字段造成覆盖冲突放大

### Phase 5：评测、平衡与发布闸门

这一步非常关键。

因为这条线最大的风险不是代码写不出来，而是：

- 写出来以后过乱
- 难度曲线飘
- 新机制很热闹，但不形成好决策

#### 5.1 复用现有自博弈链路

当前已经有：

- [src/selling-houses/application/localAdversarialSelfPlayArena.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/application/localAdversarialSelfPlayArena.ts)
- [src/selling-houses/application/localAdversarialSelfPlayLab.ts](/Users/jiaqi/Documents/开放日测算/src/selling-houses/application/localAdversarialSelfPlayLab.ts)

这套链路不要丢，反而要升级成影子商圈的核心验证工具。

需要补充的观测指标包括：

- 平均每日 `rivalListings` 存量
- 平均每日 `marketSignals` 可见数
- `customer_to_player` / `listing_to_player` 入场频次
- 被竞品压制导致的坏收尾占比
- 被同公司资源压力影响的机会损失占比
- 剧本平均清局天数
- 失守发生在过程中的比例，而不是只体现在结算

#### 5.2 发布前的四类稳定性测试

1. 兼容测试

- 旧存档载入
- 云端旧 run hydrate
- 无影子层配置的剧本正常运行

2. 单局可解释性测试

- 玩家能看懂今天为什么被压
- 玩家能看懂新机会从哪里来
- 复盘能指出关键失守来源

3. 六难度多 seed 测试

- `warmup / easy / standard / advanced / hard / extreme`
- 每档至少 5 个 seed
- 观察目标达成率、平均清局天数、坏收尾率、入场频次

4. 动作分布测试

- 看后段动作是否继续被刷
- 看新机制有没有把单一套路打散
- 看推广金与精力是否变得更业务化、更有取舍

#### 5.3 发布闸门建议

满足下面条件再进入正式上线：

- 旧存档兼容稳定
- 六难度至少大体单调
- 新机制带来可解释的过程型失守
- 玩家不会因为信息噪声过多而失去主维护视角

---

## 二十一、最终收敛

这版技术方案最终想达成的是：

- 维护人仍然是主角
- 主状态仍然是维护人可操作状态
- 但商圈不再只有玩家一个行动者
- 竞品房源、同公司压力、未知需求信号和每日事件会持续改写局面

所以这不是一套“完全重做方案”。

这是一个足够克制、但足够有力量的架构升级方案：

- 保住现在的维护人手感
- 补上真实竞争和不完全信息
- 给后续更深的经营权争夺留出口

一句话总结：

- 先把世界做活，再把真相做深。
