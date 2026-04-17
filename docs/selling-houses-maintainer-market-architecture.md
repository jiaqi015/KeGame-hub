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

## 十一、代码目录改造建议

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

## 十二、Scenario 与 World 的扩展建议

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

## 十三、存档与云端持久化建议

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

## 十四、分阶段落地方案

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

## 十五、最终收敛

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
