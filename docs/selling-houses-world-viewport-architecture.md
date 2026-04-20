# selling-houses · 世界-视角架构：从第一性原理重构

> **角色**：本文档现为 `selling-houses-master.md` 的**附录 C（详细论证）**。
> 总纲 §2 的"第一性原理"主张已并入总纲正文；本文保留作为详细推导过程，
> 非必读。想了解"为什么 World 是主体 / Viewport 是视角"可直接读总纲 §2；
> 想追究每个原子的推导、4 种 Viewport 的工程形态、14-16 周 Phase 分解，
> 再读此处。
>
> 总纲已在 §3 Q6 把 Matter 升级为 World 第五原子，本文 §1 的"四原子"需
> 读作"五原子"。本文 §10 的 Phase 编号仍有效，但已被总纲 §5 的 6 周路径
> 替代（Phase B 以后才再启用本文分期）。

---

## 0. 起点问题：这个游戏本质上模拟的是什么？

三种叙述方式，只有一种是对的。

1. **"玩家扮演一个资产顾问经营房源"** —— 当前代码的视角。玩家是根，世界是玩家的资源池。
2. **"玩家和 AI 经纪人们在一个虚拟楼市里竞争"** —— 对抗游戏视角。世界是舞台，玩家是众多演员之一。
3. **"这是一个自运转的楼市，人和 AI 只是挂在上面的视角"** —— 模拟器视角。世界是根，玩家是观察者 + 有限介入者。

**只有第三种经得起第一性原理追问。**

追问如下：

- 问：如果没有玩家，楼市会发生什么？
- 叙述 1 的答：什么都不会发生，因为玩家是根。
- 叙述 3 的答：业主会焦虑/游戏/拍卖，客户会看房/比较/流失，竞品会降价/拉客/盘整，市场会涨/跌/变季节。**玩家是否在场不改变世界规律**。

现实对照：
- 真实的楼市从不为某一个经纪人而存在。
- 一个门店倒闭，城市不会停转。
- 一个新手加入行业，他不是在"启动"这个市场，而是"进入"这个市场。

**所以正确的建模是：World 是 first-class，Player 是 Viewport。**

这一行字值这整份文档。

---

## 1. 世界的原子

World 由且仅由四类东西构成：

```
World = Actors × Relations × Events × Environment
```

这四类之外的一切都是上述四类的**派生或投影**，不是 world 的原子。

### 1.1 Actor

**定义**：在世界里有 `identity + state + perception + policy + agency` 的实体。

五要素：

| 要素 | 含义 | 当前代码的对应 |
|---|---|---|
| `identity` | 稳定 id、类型、角色标签（anchor/fragile/spoiler/etc） | 当前 `Case.role` 有标签但不用，`ownerArchetypeId` 赋值后不驱动行为 |
| `state` | 这个 actor 的当前状态（mood / trust / stress / financials） | 当前是 `Case` 里的平铺字段 |
| `perception` | 这个 actor 能观察到的 world 子集 | **完全缺失**。owner 看不到市场新闻，customer 看不到价格对比 |
| `policy` | 规则 + 倾向：给定 perception，actor 下一步做什么 | **完全缺失**。owner 只会被动衰减 |
| `agency` | 主动能发起哪些 event | **完全缺失**。所有 actor 都是 state 而非行动者 |

**actor 类型清单**（project 需要的全集）：

- `Owner`：每个房源背后的业主。有 mood、有 archetype、有 role。
- `Customer`：买方。有 hidden budget、hidden criteria、有家庭成员、有当前考察名单（N:M）。
- `Broker`：门店。**玩家绑的是其中一个**。AI 门店和玩家门店是同一 actor 类型，差别只是驱动者（Human vs AI）。
- `Agent`：broker 门店里的经纪人员（目前玩家 = 经纪人本人；后期可以分离"门店经营者"和"一线经纪人"两层）。
- `Rival`：现在代码里的 `rival stores` 是简化的 Broker，逻辑上应该归并。
- `MarketForce`：一种"拟人化的市场"，承载 competitivePressure / demandHeat / sentiment 这类汇总指标。
- `Regulator`：政策 actor，产生 policyShift 事件。现在是 eventPool 里的 template，应该升级为持续性 actor。
- `Journalist`：新闻 actor（school-boom 这种事件的源头）。可选，产生 ambient noise。

每个 actor 的 `policy` 用**状态机 + 概率分支**描述，而不是一串 if-else。例子：

```ts
// Owner.policy
type OwnerPolicy = {
  onMorning: (self: Owner, perceived: PerceivedWorld) => OwnerAction[]
  // 早晨：决定今天主动做什么（打电话催 / 主动调价 / 威胁撤盘 / 安静等待）

  onEvent: (self: Owner, event: DomainEvent) => OwnerAction[]
  // 事件触发：业主听到竞品降价 → 可能焦虑 → 可能主动联系

  onInteraction: (self: Owner, fromBroker: Interaction) => OwnerResponse
  // 被动响应：玩家做动作时，业主怎么反应（取决于 role × mood × trust）
}
```

### 1.2 Relation

**定义**：actor 之间的连边。

当前代码只隐式存在（通过 id 引用），应该显式化：

| Relation | 含义 | 需要承载的信息 |
|---|---|---|
| `OwnershipEntrust` | Owner 委托 Broker 代理房源 | 委托期限、exclusivity、窗口倒计时、trust 级别 |
| `InterestedIn` | Customer 对某 Case 有兴趣 | stage、intent、confidence、priority 相对其它 case |
| `Competing` | Broker 与 Broker 在某 `competitionGroup` 竞争同一批客户 | 当前 `competitionGroups` 已有骨架，需要抽出来 |
| `SimilarTo` | Case 与 Case（同小区、同户型）相互参考 | 价格联动、客户横向比较的基础 |
| `Knows` | Customer 认识哪位 Broker / 哪个 Case | 私域、口碑、老客户复购 |
| `ShadowBrokerTrail` | Customer 来自某个 broker shadow 线索 | 现在 `opportunity.visibility='shadow'` 隐含表达，应显式 |

**为什么显式 Relation 重要**：

1. **事件路由**：一个 event 应该传播给"所有与源实体有 Relation 的 actor"，而不是全世界广播也不是硬编码受众。
2. **信息不对称的自然实现**：Customer 对 Case A 的看法，可以被 Case B 的 Owner 通过 `SimilarTo` 关系观察到（"对面小区的客户也嫌贵了"）。
3. **归因的深度**：trust 掉 5 点的原因可以回到"因为某个 Relation 上产生的 event"。

### 1.3 Event

**事件是世界真相的单一来源。state 是事件流的 fold。**

这一句是所有后续设计的前提。

Event 的分类（按发起方）：

```ts
type DomainEvent =
  | ActorAction       // 某个 actor（包括玩家绑定的 broker）主动做了什么
  | ActorResponse     // 某个 actor 对别人做的事的响应
  | MarketTick        // 环境自然演化（market cell heat 波动、季节性）
  | Scheduled         // 剧本预埋的事件（政策、学区、事故）
  | Emergent          // 规则涌现的（如 `shouldLoseToRival` 的概率击中）
```

每个 event 的 payload：

```ts
type DomainEvent = {
  id: string
  day: number
  tick: number                  // 如果启用 intra-day time
  source: ActorId | 'system'    // 谁发起的
  targets: ActorId[]            // 影响谁
  relations: RelationId[]       // 经由哪些关系传播
  kind: string                  // 事件类型（如 'owner.price-cut' / 'customer.churned-to-rival'）
  payload: unknown              // 具体数据
  parentEventId?: string        // 因果链：这个事件由哪个事件触发
  reasoning?: string            // 给 UI 展示用的中文原因（非规则一部分）
}
```

`parentEventId` 是**事件因果链**的关键。v3 里我说"生动来自事件链"，技术机制就是这个字段。玩家点开"trust 为什么掉 8"，能顺着 parent 链看到根因："因为对面小区降价 → 同小区客户心动 → 比价后转向别家 → 你的 owner 看到 intent 下滑 → 焦虑加深 → 此次接触 trust 衰减加倍"。

Event 不是"结果"，事件**就是世界**。state 只是事件流的快照缓存（为了性能，不是为了语义）。

### 1.4 Environment

非 actor 的背景态：

- `MarketCell[]`：地理维度的市场状况（demandHeat / supplyPressure / competitivePressure / sentiment / monthlyFactors）。actor 可以感知 market，但 market 本身不是 actor（没有意图、没有策略）。
- `Calendar`：day + currentDate + weeklyRoutine + season。当前代码已有。
- `MacroState`：政策利率、宏观情绪。当前作为事件存在，可以升级为持续 state + 事件更新。
- `Rules`：balance 配置。**明确不应该是 state**，是只读的规则常量。

---

## 2. 世界的规则

World 演化是一个**纯函数**：

```ts
type WorldEvolution = (
  prevState: WorldState,
  pendingEvents: DomainEvent[],
  seed: RngState,
) => {
  nextState: WorldState,
  emittedEvents: DomainEvent[],
  nextSeed: RngState,
}
```

"纯"的含义：
- 无 `Date.now()` / `Math.random()` / localStorage / React state
- 输入相同 → 输出相同
- 可以无副作用地在测试 / arena / 服务器 / 客户端 / CI 多环境执行

pendingEvents 的来源：
- 玩家/AI 通过 viewport 注入的 `ActorAction`
- 上一 tick 规则产生的级联事件
- 剧本预埋的 scheduled event

emittedEvents 是这一步产生的新事件（写进 event log）。下一 tick 它们可能引发新的级联。

**规则不是一坨 switch-case**，而是注册表：

```ts
type Rule = {
  id: string
  kind: 'phase' | 'reactor' | 'emitter'
  appliesTo: (event: DomainEvent) => boolean
  apply: (state, event, seed) => { stateDiff, newEvents, nextSeed }
}

const rules: Rule[] = [
  PriceCutPropagationRule,       // 某房源降价 → 同组其它房源感受到压力
  CustomerChurnOnComparisonRule, // 客户看到更便宜选项 → 概率流向
  OwnerAnxietyOnSlowProgressRule,// 业主多日未见进展 → 焦虑值抬升
  RivalOpportunisticPoachRule,   // 竞品抓住玩家暴露窗口 → 截客
  MarketTickRule,                // 周期性市场波动
  // ... 每条规则独立可测
]
```

**这是"规则即数据"的正解**。v3 说"data-driven dispatch"，更准确的说法是：规则也是实体，和 event 是一等公民的关系。

---

## 3. 玩家 = Viewport

Viewport 是挂在 World 上的"视角绑定"。它**不是 World 的一部分**，它是 World 的**观察者 + 有限干预者**。

### 3.1 Viewport 的结构

```ts
type Viewport = {
  sessionId: string              // 这个视角的会话 id
  ownerId: UserId                // 谁在操作这个视角（用户/AI）
  worldId: WorldId               // 绑在哪个 World 上
  
  binding: {
    boundActorId: ActorId        // 绑到 world 里哪个 actor（通常是一个 Broker）
    role: 'controller' | 'observer' | 'coach'
    // controller: 可以注入 action
    // observer: 只读（观战）
    // coach: 只读但能 annotate（教学模式）
  }
  
  viewScope: ViewScope           // 这个视角能看到 world 的哪些部分
  actionScope: ActionScope       // 能发起哪些 action 类型
  
  // Viewport 私有状态（不属于 world）
  viewState: {
    selectedCaseId: string | null
    expandedPanels: string[]
    dismissedHints: string[]
    currentReport: Report | null
  }
  
  // UI 偏好
  preferences: {
    theme: 'light' | 'dark'
    notifications: NotificationPrefs
  }
}

type ViewScope = {
  // 可见性 filter：给定一个 entity 或 event，viewport 能不能看到它
  canSeeEntity: (entity: Entity, world: WorldState) => boolean
  canSeeEvent: (event: DomainEvent, world: WorldState) => boolean
}

type ActionScope = {
  // 可发起 action 的类型集
  allowedActionTypes: Set<ActionKind>
  // 检查某具体 action 是否合法
  validate: (action: ActorAction, world: WorldState) => ValidationResult
}
```

### 3.2 信息不对称 = ViewScope 的 filter

当前代码里所谓的 "shadow opportunity" 其实就是"这个 opportunity 存在于 world，但玩家视角下看不到全部信息"。这在现架构里是特例，在新架构里是**基础机制**。

默认 ViewScope：
- 看得到：绑定 broker 的所有 opportunity、该 broker 负责的 cases、所在 marketCell 的公开指标、自己的门店财务
- 看不到：隔壁 broker 的 opportunity 细节、Customer 的 trueBudget、Owner 的 bottomPrice（除非 rapport 足够）
- 部分看到：ambient 市场新闻（Journalist actor 发出）、竞品的 ambient KPI（每周结算时才能看到）

这样 **shadow city 不是"P5 阶段加的功能"**，而是**默认行为**。

### 3.3 Viewport 的四种形态

同一个接口，四种实现：

| Viewport 类型 | 谁驱动 | 用途 |
|---|---|---|
| `HumanViewport` | React UI + 玩家键盘鼠标 | 正常玩游戏 |
| `AIViewport` | AI policy（greedy / heuristic / RL） | Arena 自对弈、AI 对手、玩家离线时 AI 接管 |
| `ObserverViewport` | 无（只读渲染） | 观战、分享局面、赛事解说 |
| `ReplayViewport` | event log + 可拖动时间轴 | 录像回放、教学、复盘 |

**全部同构**。Arena 不是"测试代码"，Arena 就是 `World + AIViewport`。多人不是新功能，多人就是 `World + HumanViewport × N`。

### 3.4 Action 注入

玩家（或 AI）通过 viewport 注入事件，不直接改 state：

```ts
// 当前代码的做法（错）
executeAction(state, 'adjust-listing-price', caseItem, 'small-cut')
// → 直接改 state.cases[i].askPrice / trust / heat / competitiveness ...

// 新架构的做法（对）
viewport.emit({
  kind: 'broker.adjust-listing-price',
  source: viewport.binding.boundActorId,
  targets: [caseItem.ownerId, caseItem.id],
  payload: { strategy: 'small-cut' }
})
// world 的规则引擎消费这个事件，产生级联事件：
//   → owner.price-adjusted-response (trust + 8, patience + 2)
//   → marketCell.heat-bumped (+6)
//   → opportunities.intent-raised (+8)
//   → rival.perceived-broker-move (用于对手策略)
```

**这才是事件溯源**。玩家的"动作"和 world 自己产生的"事件"在同一条流里，没有特殊地位。

---

## 4. Tick 模型

World 在什么节奏下演化？三种选择：

### 4.1 On-demand tick（当前）

玩家点"下一天"，world 走一 tick。玩家不操作，world 不动。

- 优点：单机最省心
- 缺点：多人不自然（等谁？），"世界自治"的语义被削弱
- 适合：纯单机 + 回合制

### 4.2 Passive tick（wall-clock）

world 按真实时间跑，每 N 分钟一 tick，玩家操不操作世界都前进。

- 优点：多人、观战、AI 接管全部自然
- 缺点：玩家离线会"错过局势"，需要离线 AI 托管机制
- 适合：长周期赛季 / 多人 / 社交型

### 4.3 Batch tick（arena）

world 以 CPU 速度连续跑到完，无 UI 阻塞。

- 用途：自对弈测试、golden master、AI 训练
- 和上面两种并存，不冲突

**三种 cadence 在新架构下是"tick driver"的不同实现**：

```ts
interface TickDriver {
  start(world: World, viewports: Viewport[]): void
  stop(): void
}

class OnDemandDriver implements TickDriver { /* 等待 viewport 的 tick-request */ }
class WallClockDriver implements TickDriver { /* 每 N 秒一 tick */ }
class BatchDriver implements TickDriver { /* 一个 while loop 到 world.ended */ }
```

**产品决策点**：长期做 passive tick。短期为了快速上线可以先 on-demand。但架构接口要按 passive 设计，这样 passive 启用时不重构。

### 4.4 Intra-day time 扩展

当前 tick = 1 天。粒度粗。升级方案：

```
一天 = 若干 time slots
  Morning (09:00): 市场新闻 + 业主主动行为
  Day (13:00): 客户看房 + 玩家主要操作
  Evening (19:00): 客户横向比较 + 结算当日
  Night (22:00): 事件冷却 + 自动汇总
```

每个 slot 是一次 `WorldEvolution` 调用。玩家的精力配额按 day 而非 slot，但 **事件因果链能在一天内走完**（早上的新闻 → 下午的业主联系 → 晚上的客户转向）。

这就是 v3 里说的"生动感"的技术根基。

---

## 5. 确定性

完全的确定性建立在三个契约之上：

1. **规则函数纯净**：`WorldEvolution` 无任何外部依赖。
2. **Rng 纯种**：`RngState` 是普通不可变对象，每次 `nextRandom` 返回 `{value, nextState}`。当前 `utils.ts:22-23` 的 fallback to `Math.random()` 必须删除 —— 宁可抛错也不要静默漂移。
3. **事件流有序**：同一 tick 内多个 event 的应用顺序是确定的（按规则注册顺序 + event kind 优先级 + source.id 字典序）。

给定：
- 初始种子 `seed0`
- 初始 world 条件 `world0`
- 玩家动作序列 `actions[]`

**必然得到同一条 event log，同一个 final state。**

这个性质的价值：

- **Arena golden master**：同 seed + 同 AI policy → byte-identical 结果
- **Replay**：只存种子和动作就能回放任何一局
- **分布式一致性**：多人场景下，客户端收到 event 流后本地重演 → 所有客户端 state 对齐
- **Balance 实验**：拿一百份真实玩家的 action log，在新 balance 下批量重跑 → 看数据漂移

这是为什么 v3 要把 RNG 边界修干净。不修，上面这些全是泡影。

---

## 6. 持久化

当前持久化的混乱程度：

- `GameState` 里 30+ 个顶层字段混合了 world state + viewport state + UI 文案 + 内容（scenarioSnapshot）+ 历史
- `runContext.scenarioSnapshot` 把内容嵌进 state（内容本应只读、按 id 引用）
- `schedule / priorities / metrics` 是 UI 派生，却被写进存档
- `eventLog` cap 120，truncate 丢失历史
- `buildLegacySnapshot` 90 行永久运行的迁移 adapter

新架构下：

```ts
// World 的持久化 —— 最小充要
type WorldPersistence = {
  worldId: string
  version: number
  initialSeed: RngState
  initialConditions: {
    scenarioId: string          // 引用外部内容库，不内嵌
    startDay: number
    startDate: string
  }
  events: DomainEvent[]          // append-only 真历史，不 truncate
  // state 不存 —— 可从 events fold 重建
  // 但为了加载速度，可以存 snapshot checkpoints
  snapshotCheckpoints?: Array<{
    atDay: number
    state: WorldState
  }>
}

// Viewport 的持久化 —— 私有
type ViewportPersistence = {
  viewportId: string
  ownerId: UserId
  worldId: string
  binding: ViewportBinding
  viewState: ViewportPrivateState
  preferences: ViewportPreferences
}

// Session 是 World + Viewport 的绑定
type SessionPersistence = {
  sessionId: string
  worldId: string
  viewports: ViewportId[]
  startedAt: string
  endedAt: string | null
}
```

**存档体积对比**：
- 当前：一个中长局的 save ≈ 200-500 KB（大量派生 + 文案 + snapshot）
- 新架构：一个中长局 events ≈ 30-80 KB + 可选 checkpoint 20-40 KB
- 缩减 60-80%

**格式演化**：event schema 变化用 `event.version` 处理。旧 event 在加载时经过 migration pipeline 升级到新 schema。这是一次性的单调升级，不需要 `buildLegacySnapshot` 那种永久 adapter。

---

## 7. 模拟质量：在这个抽象下是自然结果

v3 里我花 §4 专门回答"怎么让每天更生动/有规模/有质量"。在世界-视角架构下，这些问题大部分**不需要专门解决** —— 它们是架构的副产品。

| v3 里要做的事 | 新架构下它是什么 |
|---|---|
| Owner 早晨做 mood judgment | Owner.policy.onMorning 的默认调用 |
| Customer 在多个 case 间漂浮 | Customer 天生是 actor，`InterestedIn` relation 是 N:M 的 |
| Rival 装 policy 循环 | Rival 本来就是一个 Broker actor，和玩家同构，天生有 policy |
| Shadow city（50 listings + 120 customers 在后台跑） | World 天生有 N 个 actor 跑，viewport 只看到其中一部分 |
| Trust/patience/heat drivers 归因 | event log 是真相，drivers 是 event log 的 view |
| 事件能触发事件（A→B 链） | parentEventId 和规则 emitter 自然支持 |
| 信息不对称 | viewScope filter 自然支持 |
| CaseRole 运行期接通 | Owner.identity.role 驱动 policy，天然生效 |

**v3 的 P1/P2/P5 大部分变成"世界该这样建"而不是"额外加的功能"。**

### 7.1 "生动" 的精确定义

世界足够"生动"当且仅当：
- actor 的 policy 不是纯衰减，而是对 perceived events 有响应行为
- event 有因果链（parentEventId 非空率 > 30%）
- 玩家每一天的事件日志读起来像一段叙事，不是一串 `heat -3 trust -2 competitiveness +1`

### 7.2 "规模" 的精确定义

世界足够"有规模"当且仅当：
- world 里 actor 数量 / viewport 可见数量 ≥ 5：1
- 玩家看到的"市场新闻"来源于真实发生在别处的事件（Journalist actor 不是凭空生文案）
- 每周 KPI 汇总能反映出 world 真实发生的事

### 7.3 "质量" 的精确定义

世界足够"高质量"当且仅当：
- 任何一个玩家看到的数字变化，能追溯到至少一条具体 event 和其 parent
- 任何一个结局（好/中/坏）能追溯到至少 3 条关键 event 构成的故事
- 两局同 seed 完全一致；换 seed 完全不同

---

## 8. 多人 / 观战 / 教学 / AI 接管：不是功能，是绑定

### 8.1 多人合作（同门店双视角）

```
World W1
  └─ Broker B1 (actor)
       ├─ Viewport V1 ← Human user A
       └─ Viewport V2 ← Human user B (同 binding.boundActorId = B1)
```

两个人同时操作同一门店。action 注入按时间戳排序。

### 8.2 多人对战（两门店同世界）

```
World W1
  ├─ Broker B1 ← Viewport V1 (human A)
  ├─ Broker B2 ← Viewport V2 (human B)
  └─ Broker B3 ← AIViewport (computer)
```

三方同在一城。每个 viewport 看自己门店视角 + 共享的 ambient 市场事件。

### 8.3 观战 / 教学

```
World W1
  ├─ Broker B1 ← Viewport V1 (controller, human A)
  └─ Broker B1 ← Viewport V3 (observer, human coach)
                  ↑ 同一 boundActorId，role 不同
                  coach 看得到 A 看到的一切 + 可以 annotate
```

### 8.4 AI 接管（玩家离线）

```
// 离线前
World W1
  └─ Broker B1 ← HumanViewport V1 (user A, online)

// 离线后（同一 world 不停，viewport 切换 driver）
World W1
  └─ Broker B1 ← AIViewport V1' (driver=GreedyPolicy, take over)

// A 回来
World W1
  └─ Broker B1 ← HumanViewport V1 (user A, online)
```

**没有特殊代码**。替换 driver 而已。

### 8.5 Replay

```
SessionReplay from events[0..k]
  → derive state_at_day_k
  → ReplayViewport with time scrubber
  → 教学、复盘、争议回放
```

**所有这些在当前架构里都是重写工程。在新架构里都是既有抽象的不同使用。**

---

## 9. 现在代码的字段到底应该归谁？

最硬核的问题：`GameState` 里 30 个字段，哪些去 world，哪些去 viewport？

### 9.1 World state（属于世界）

| 当前字段 | 说明 | 归属调整 |
|---|---|---|
| `day / currentDate / maxDay` | 世界时间 | `world.calendar` |
| `cases[]` | 业主委托的房源 | `world.cases` + cases 里的 owner 独立成 `world.owners[]` |
| `opportunities[]` | 客户机会 | `world.opportunities` + customers 独立成 `world.customers[]` |
| `markets[]` | 市场 cell | `world.marketCells` |
| `competitionGroups[]` | 竞争分组 | `world.relations` 的一种 |
| `scheduledEvents[]` | 预埋事件 | `world.pendingEvents` |
| `weeklyReviews[]` | 周度复盘（基于 world 事实） | `world.weeklyReviews` |
| `eventLog[]` | **拆分**：UI 文字流 vs 真事件流 | UI 流 → viewport；真事件流 → `world.events` |

### 9.2 Actor state（属于 actor，在 world 里）

当前混在 `Case` / `Broker` 平铺的字段：

| 当前字段 | 归属 actor |
|---|---|
| `ownerName / ownerMood / personality / ownerArchetypeId / trust / patience / urgency` | `Owner.state` |
| `customer.*` | `Customer.state` |
| `cash / energy / maxEnergy / reputation / commission / soldCount / withdrawnCount / promotionBudget / budgetLedger` | `Broker.state`（玩家绑的那个 Broker actor 的状态） |

**玩家的"个人资源" 放 Broker actor 里**。这样 AI 门店也遵守同样约束（AI broker 也有 energy），多人天然公平。

### 9.3 Viewport state（属于视角）

| 当前字段 | 归属 viewport |
|---|---|
| `selectedCaseId` | viewport.viewState |
| `currentReport` | viewport.viewState |
| `gameOver` | **拆分**：world 产生 `WorldEnded` 事件（world 属性），viewport 展示结算页面（viewport 属性） |
| `schedule / priorities / metrics` | viewport.derivedView（selectors，不持久化） |
| `finalResult` | world 的 `endingSummary` event + viewport 展示 |

### 9.4 内容（Content，既不属于 world 也不属于 viewport）

| 当前字段 | 归属 |
|---|---|
| `rules.*` | `ContentLibrary.balance`（只读常量，按 scenarioId 加载） |
| `runContext.scenarioSnapshot` | 拆分：scenarioId 引用外部内容库；初始状态转成 event 序列写入 world.events[0..N] |
| `channels / housePrototypes / ownerArchetypes / customerProfiles / eventTemplates` | `ContentLibrary.*`（按 id 引用） |

**scenarioSnapshot 从 state 消失**。剧本是内容，不是存档的一部分。剧本变了不影响旧存档的回放（因为 events 里记录的是当时的原子事实）。

---

## 10. 迁移路径：重写 v3 的 P0-P6

**新路径的阶段 A-H。** 前提：你接受"世界-视角"作为目标形态。

### Phase A — 地基（2 周）

目的：确立确定性、golden master、balance 可调层。

- RNG 边界全修（`useGame.ts:34,87,287` / `utils.ts:22`）
- Arena 加 golden master：`saveGolden(label)` / `diffGolden(label)`
- 抽 balance config：6-8 处硬编码公式的系数搬到 `rules/balance.ts`
- 关门：同 seed 双跑 byte-identical，改一个系数 arena 能 diff 到

**这一步和 v3 的 P0 完全一样。是任何路径的前提。**

### Phase B — Event log 作为 World 的单一真相（2 周）

目的：把 tick 的 17 步从"直接改 state"改成"emit events, then fold"。

- 定义 `DomainEvent` discriminated union，覆盖现有所有 state 变动种类
- 17 步 tick 重构：每步不再改 state，而是返回 `events[]`
- 新增 `applyEvents(state, events) => state'` 统一 fold
- `logEvent` 拆成两个：`world.emit(event)` 写真历史 / `viewport.notify(message)` 写 UI 流
- Event log 不再 cap 120（那个 cap 移到 UI 层）
- 新增 `parentEventId` 字段，规则产生级联事件时填上

**关门**：事件流重建 state 与直接改 state 结果一致（arena diff = 0）；玩家点 trust 数值能看到 drivers 链。

### Phase C — World / Viewport 切分（3 周，最关键一步）

目的：把 GameState 拆成 WorldState + ViewportState。

按第 9 节的字段分配表实施：

1. 新增 `WorldState` 类型，把属于 world 的字段搬进来
2. 新增 `ViewportState` 类型，把 selectedCaseId / currentReport / schedule / priorities / metrics 搬进来
3. 引入 `Session` 概念：一个 session = 一个 world + 一组 viewports
4. `useGame` 重构为 `useSession` + `useViewport`
5. 持久化拆分：world events 存一份，viewport state 存一份
6. scenarioSnapshot 从 state 中删除，改为按 `scenarioId` 引用 `ContentLibrary`

**关门**：
- 同 world 可以挂 2 个 viewport（即使只有 1 个渲染），证明 viewport 无状态逃逸
- 存档体积 ≥ 40% 下降
- scenarioSnapshot 不在存档里出现

### Phase D — Actor 独立化（3 周）

目的：Owner / Customer / Rival-Broker 都成为 first-class actor，有 policy / perception / agency。

- 拆 Case → `Case`（交易客体）+ `Owner`（actor）+ `OwnershipEntrust`（relation）
- 客户从 Opportunity 1:1 绑定中独立：`Customer` 是 world actor，`Opportunity` 是 `InterestedIn` relation（N:M）
- `competitionEngine.shouldLoseToRival` 的 8 信号 6 加权拆成 Rival-Broker 的 `onPerceivedOpportunity` policy
- personality 三元系统彻底删除，OwnerArchetype 唯一来源
- 给每个 actor type 写 `policy.onMorning / onEvent / onInteraction`
- 接通 CaseRole：`Owner.role` 影响 policy

**关门**：两份剧本（全 anchor vs 全 fragile）在 arena 跑出可区分的不同节奏；owner 在不接触时也有主动行为事件产生。

### Phase E — 规则与内容数据化（2 周）

目的：解锁内容快速扩容。

- 事件 template 从硬编码 switch 改成 JSON 表 + handler 注册
- Event template 从 6 条扩到 30+
- OwnerArchetype 从 4 扩到 12
- Customer profile 从 6 扩到 20
- Action 执行器从 `ACTION_EXECUTORS` dict 改成 handler registry + 声明式 effects 表
- balance config 拆成"核心规则 + 难度覆盖层"

**关门**：新增一个事件/一个业主原型/一个难度等级只改数据文件不改代码。

### Phase F — 多 Viewport + AI driver 同构（2 周）

目的：把 arena 和真实游戏合并到同一代码路径。

- 定义 `ViewportDriver` 接口：`HumanDriver` / `AIDriver` / `ObserverDriver` / `ReplayDriver`
- 现有 `localAdversarialSelfPlayArena` 重写成 `AIDriver` + `BatchTickDriver`（代码行数可缩减至 ≤ 150 行）
- UI 增加"观战模式"（同 binding.boundActorId，role='observer'）
- UI 增加"离线托管"（HumanDriver → AIDriver 切换，world 不重启）

**关门**：一局 Arena 跑完 = 一局人类游戏跑完（同 event 流格式）；玩家点"交给 AI 托管今晚"，第二天回来可以接管继续。

### Phase G — Intra-day 时间层 + ambient city（3 周）

目的：把"每天"从 1 个 tick 变成 3-4 个 time slot，并让 world 里真正跑着 50+ shadow listings。

- Calendar 扩展：`timeSlot: 'morning' | 'day' | 'evening' | 'night'`
- 17 步 tick 重构为若干 time-slot 里的 phase
- 新增 `JournalistActor`：根据 world 里真实发生的事件生成新闻事件
- 新增 shadow listings：world 里有 30-50 个由 AI Broker 持有的 case，跑简化 policy
- `ambient market ticker` 变成 world 的 Journalist 事件流在 viewport 里的展示

**关门**：玩家周复盘能看到 "东区某 620 万房源 3 天成交，业主让了 12 万" 这种来自 world 真实事件的新闻；同一 world 可以 fork 出多个 viewport 观察不同门店的局势。

### Phase H — 生态扩展（持续）

- Policy / Regulator 作为持续 actor
- 多门店联赛（同 world 多 human）
- 录像回放 UI（ReplayViewport + 时间轴）
- 教学模式（CoachViewport + annotate）
- 赛季排行榜（多 world 的最终 event 聚合）

### 时间对比

| 路径 | 周期 | 风险 | 结果 |
|---|---|---|---|
| v3 补丁 | 8-10 周 | 低 | 现状修到 100%；shadow city / 多人 / 观战 / 教学是后续重构 |
| 本文 | 14-16 周 | 中 | 到 Phase F（~12 周）已经开启全部衍生能力，Phase G/H 是内容/运营驱动 |

**14-16 周换"后续 1-2 年不需要第二次重构"**。

---

## 11. 决策点（开工前必须拍板）

### Q1: 商业节奏 vs 架构投资

- 3-6 个月内要上线商业版本 → 走 v3 补丁路径，本文放在 v2 发版后再做
- 12 个月内不急着商业化，想做成行业标杆 → 直接走本文路径
- 中间态（6-9 个月上线）→ Phase A + Phase B + Phase C 先做（~7 周），其余走 v3 里的子集

### Q2: 目标产品形态

- **纯单机回合制**：走 v3 就够。多人/观战/AI 托管都用不上。
- **单机但要"世界感"**：走本文到 Phase E（~12 周）。
- **赛季型 / 社交型 / 联赛型**：必须走本文到 Phase F 及以后。
- **教育/培训产品**：Phase H 的 CoachViewport / 录像回放才是核心。

### Q3: World 的边界多大

- 狭义（玩家覆盖的 4-8 个小区）：简单，当前就是这个 scope
- 广义（整个城市 × 多门店 × 上万客户）：对标现实，但复杂度 3-5×

我的主张：**世界狭义（4-8 核心小区） + ambient 事件表达外部**。这样 world 不无限大，但 Journalist 和 Regulator 让它有"呼吸感"。

### Q4: Tick driver 是 On-demand 还是 Passive

- On-demand：单机回合制，玩家驱动
- Passive：wall-clock 真实时间，world 自主跑

决策依据是 Q2。如果做社交/赛季，必须 Passive；单机可以先 On-demand，但**接口按 Passive 设计**（TickDriver 抽象一早就做好），后期切换不重构。

### Q5: 玩家身份 / 账号 / session

- 当前 `getOrCreateMaintainerUserId` + localStorage
- Passive tick 下需要真正的云端 session（每个 viewport 一个 session，可断线重连）
- 这不是架构问题，是产品 + 基础设施问题，但 Phase C 会先遇到

---

## 12. 风险与反对意见

### 12.1 "过度设计，一个单机游戏而已"

反驳：**当前代码已经在承受"半个 world-viewport 分离"的代价**（glbduget、snapshot、arena 各自实现一套），但没有享受到任何红利。继续补丁会让代价累积，红利仍然为零。

### 12.2 "重构周期比补丁长 50%"

反驳：14-16 周 vs 8-10 周，但补丁路径的"后续要重构第二次"的隐藏成本是 10-20 周。**总成本本文路径更低**。前提是你相信产品会持续迭代 1 年以上。

### 12.3 "团队认知切换成本大"

反驳：world-viewport 分离是一个核心概念 + 四个原子（actor/relation/event/env）+ 一个视角接口。学习曲线 < 2 周。比 v3 里"事件总线 + 神函数拆分 + personality/archetype 双系统迁移 + UI 文案剥离"要认知友好。

### 12.4 "中间状态（Phase C 进行中）比单一方向更脆弱"

这是真实风险。Phase C 是 3 周，期间 world 和 viewport 半分家。缓解：
- Phase C 用 feature flag 渐进切换
- 先新代码路径跑通，再把旧路径切过来
- Arena 每天跑 golden diff 监控漂移

### 12.5 "万一做到一半产品改方向怎么办"

Phase A + B + C 的价值是通用的（任何架构都需要确定性 / 事件流 / state 分层）。即使 Phase D-H 不做，前 7 周的投资不浪费。

### 12.6 "为什么不用现成 ECS / Redux / MobX"

- ECS：过度工程，不是游戏引擎。Actor + Component 的关注点在这里不需要。
- Redux：event log → state fold 的模式和 Redux 的 reducer 形似，但 world 的规则不是 UI-facing action。硬套 Redux 反而扭曲。
- MobX：反向，observable 会让确定性更难。

**本文的方案是"domain-first event sourcing" + 纯函数 tick + pluggable viewport**。这是业界做模拟器的主流范式（见 Factorio / Dwarf Fortress / Football Manager 的公开讨论），不是新发明。

---

## 13. 为什么这个比 v3 更值得

v3 回答的问题："怎么把现状修到 100%？"  
本文回答的问题："100% 是什么？现状的 100% 够不够？"

v3 的 100% 是：
- 半成品全部补满
- 简单内容扩容可行
- Arena 作为 QA 可用
- 玩家能看到归因
- 单机游戏的完成态

本文的 100% 是：
- 世界自主运行，玩家是挂件
- Arena / 多人 / 观战 / 教学 / 录像 / AI 托管 都是同一抽象
- 内容扩容 + 规则迭代彻底解耦
- 可跨 1-2 年持续演进不用重构

**v3 的终点是本文的起点。**

如果产品目标只是 v3 的 100%，走补丁路径。  
如果产品目标包括本文的 100%，直接走这条路，因为**做到 v3 再往上走是 10-20 周，从零走到本文是 14-16 周**。做一次比做两次省。

---

## 14. 最小验证路径（如果你还不确定）

如果还在犹豫，做一个 2-3 天的 spike：

1. 写一个最小 `World + Viewport` 原型（单 Broker / 2 Owner / 5 Customer）
2. 跑 3 条规则：OwnerAnxiety / CustomerChurn / PriceCutPropagation
3. 挂 2 个 viewport：一个 HumanViewport（React 展示）+ 一个 AIViewport（自动打 hello action）
4. 验证：同 seed 重跑 byte-identical；替换 HumanViewport → AIViewport，world 不停；event log 可展开因果链

这个 spike 跑通 = 你对"世界-视角分离"的直觉正确，架构可行。
spike 跑不通 = 发现隐藏难点，有具体问题再讨论，不要盲目开大工程。

**spike 2-3 天，比 14 周的决策更便宜**。

---

## 附录 A · 与 v3 诊断的一对一映射

| v3 诊断条 | 在新架构下 |
|---|---|
| A1 17 步 tick 硬编码 | 变成规则注册表 + Phase 组合 |
| A2 domain → application 反向依赖 | 消失：domain 是 world，application 是 session/viewport |
| A3 GameState ~30 字段神对象 | 拆成 WorldState + ActorState + ViewportState + Content |
| A4 伪不可变 setState | Viewport 用 reducer，world 用 pure tick，两者都不原地改 |
| A5 RNG 边界漏 | Phase A 修掉 |
| A6 7 union 不 narrow | Actor 类型区分后自然 narrow |
| A7 cloud sync 在 useGame | 归到 session manager |
| A8 scenarioSnapshot embed | Phase C 删掉 |
| A9 Snapshot 只覆盖 competitiveness | event log 是真相，所有派生都可归因 |
| A10 magic proxy priceFactor === 1 | ActionHandler 显式 optionId，Phase E |
| A11 any 逃逸率 | Actor 拆分后类型自动收紧 |
| A12 公式即代码 | Phase A balance config |
| A13 每 action 自己落档 | session manager 统一调度 |
| A14 state 全息改写 | actor 只能改自己的 state，跨 actor 变化通过 event |
| A15 logEvent cap 120 | UI 流和 event log 分家 |
| A16 updateDerivedState 神函数 | 拆成 selector，memo 化 |
| A17 UI 文案污染 state | Phase C 剥离到 viewport |
| A18 legacy adapter 常驻 | event version migration 替代 |
| S1-S14（模拟层） | 全部落在 Phase D（actor）+ Phase E（内容）+ Phase G（intra-day / shadow city） |

---

## 附录 B · 关键数据结构草图

```ts
// ======== World ========

type World = {
  id: WorldId
  version: number
  seed: RngState
  calendar: Calendar
  
  actors: {
    owners: Map<OwnerId, Owner>
    customers: Map<CustomerId, Customer>
    brokers: Map<BrokerId, Broker>
    marketForces: Map<MarketCellId, MarketForce>
    // regulator, journalist 单例
  }
  
  relations: {
    entrustments: Map<EntrustmentId, OwnershipEntrust>
    interests: Map<InterestId, InterestedIn>       // Customer → Case
    competitions: Map<CompetitionGroupId, Competing>
    similarities: Map<SimilarityId, SimilarTo>
    // ...
  }
  
  environment: {
    marketCells: Map<MarketCellId, MarketCell>
    macroState: MacroState
  }
  
  // 事件流（append-only）
  events: DomainEvent[]
  
  // 待处理事件（下一 tick 要消费）
  pendingEvents: DomainEvent[]
  
  // 规则只读引用
  rulesConfig: RulesConfigId  // 外部内容库引用
  scenarioId: ScenarioId      // 外部内容库引用
  
  // 生命周期
  startedAt: string
  endedAt: string | null
  endReason: WorldEndReason | null
}

// ======== Actor ========

type Actor = Owner | Customer | Broker | MarketForce | Regulator | Journalist

type Owner = {
  id: OwnerId
  archetypeId: OwnerArchetypeId  // 内容库引用
  role: CaseRole                  // 继承自 scenario blueprint
  
  state: {
    mood: OwnerMood
    trust: number
    patience: number
    urgency: number
    lastInteractionDay: number
    stressLevel: number
  }
  
  perception: OwnerPerception  // 这个 owner 能感知到什么（由规则给出 filter）
  
  // policy 实际是常量表 + 函数组合，不是 state 的一部分
  // policyId 引用内容库，behavior 从 archetype × role × mood 查表
}

type Customer = {
  id: CustomerId
  profileId: CustomerProfileId
  
  state: {
    activity: number
    urgency: number
    familyStage: FamilyStage
    currentlyConsideringCaseIds: Set<CaseId>  // N:M 核心
    churnRiskToRival: BrokerId | null
  }
  
  hidden: {
    trueBudget: number
    trueTopCriteria: Criterion[]
    // 玩家通过 perception + 交互逐步揭示
  }
}

type Broker = {
  id: BrokerId
  name: string
  kind: 'player' | 'ai-rival'  // 只影响 driver，不影响数据结构
  
  state: {
    cash: number
    energy: number
    maxEnergy: number
    reputation: number
    commission: number
    soldCount: number
    withdrawnCount: number
    budgetLedger: BudgetTransaction[]  // 已是事件溯源，保留
  }
  
  // 当前经手的 case 通过 entrustment relation 查，不冗余存
}

// ======== Viewport ========

type Viewport = {
  id: ViewportId
  sessionId: SessionId
  worldId: WorldId
  
  binding: {
    boundActorId: ActorId
    role: 'controller' | 'observer' | 'coach'
    driver: 'human' | 'ai' | 'replay'
  }
  
  scope: {
    view: ViewScope
    action: ActionScope
  }
  
  state: {
    selectedCaseId: CaseId | null
    expandedPanels: string[]
    currentReport: Report | null
    unreadEvents: EventId[]
  }
  
  preferences: UserPreferences
}

// ======== Session ========

type Session = {
  id: SessionId
  worldId: WorldId
  viewportIds: ViewportId[]
  createdBy: UserId
  startedAt: string
  endedAt: string | null
}
```

---

## 附录 C · 一句话决策表

| 如果你… | 就… |
|---|---|
| 想 3 个月内上商业版本 | 走 v3 补丁路径 |
| 想做长期模拟器，不赶时间 | 走本文路径 |
| 不确定产品方向 | 先做 Phase A + spike 原型，2 周决策点 |
| 团队刚接手不久 | 先花 1 周读懂现状（v3 诊断），再决策 |
| 已经启动 v3 迁移且投入 > 50% | 走完 v3，之后再做本文的 Phase C 起步 |
| 最看重多人/联赛/社交属性 | 本文，且必做到 Phase F |

**不要纠结过久。最差的决策是没有决策。**
