# 卖房 6 周执行手册（Phase A）

> **角色**：本文档现为 `selling-houses-master.md` 的**附录 B（执行手册）**。
> 总纲 §5 的 6 周路径总览由本文展开。原 4 周方案（Q1-Q5）在总纲补完 Q6-Q8 后
> 扩展为 6 周：Week 4 加入 Session 层与 priorities 搬迁（Q8）；新增 Week 5
> Matter 数据模型、Week 6 Matter ActionResolver（Q6）；cloud schema 同步
> 改动分摊到每周（Q7）。
>
> **阅读顺序**：先读总纲（决策 + 约束 + 字段归属表）→ 再读本文对应周的
> 详细执行清单。总纲 §6 列出的 10 条 durable constraints 在 6 周内永不破。

---

## 0. 前提（不可改，改一条全盘重排）

| # | 决策 | 你的回答 | 对迭代的约束 |
| - | ---- | -------- | ------------ |
| Q2 | 产品终态 | 先单机剧情 | 不做观战/多人/陪练；剧情收束优先于系统开放性 |
| Q3 | 世界规模 | 6-8 case 人视角 | 所有循环可 O(cases × opportunities) 跑完；不做 spatial index |
| Q4 | Tick 驱动 | 玩家点 | OnDemand；没有 WallClock / Batch 需求 |
| Q5 | 玩家身份 | 未来都可能 | **架构闸门**：新增字段必须归到正确的主人，否则未来切换视角时全部回滚 |
| Q6 | Matter 系统 | 一等公民（World 第五原子） | ActionResolver 签名对齐 Matter 生命周期；新增 Week 5-6 |
| Q7 | Cloud schema | 单机改 state 时同步改 schema | 每周状态改动都有对应 migration 提交；每周 +0.5 天 |
| Q8 | Priorities 落点 | 搬 Viewport + Session 持久化 | Session 层新建；Week 4 扩容 |

Q2/Q3/Q4 说明短期没有规模压力，走补丁路径经济上合理。
Q5/Q6 说明 12 个月后要玩家扮演任意 Actor、且 Matter 要成为一等公民，
所以 6 周里每一处字段归属、每一个动作 resolver 都不能再回头改一次。
Q7 说明 cloud schema 始终可回接单机，不能在 Phase A 结束时变孤儿。
Q8 说明玩家视角状态（priorities 等）在架构上属于 Viewport 而非 World。

**方针**：6 周内不追求"正确的架构"（那是 Phase B），追求"正确的字段归属
+ 正确的动作容器（Matter）+ 可回接的 schema + 独立的 Session 层"。
Phase B 再把 Actor 的 agency/policy 真正建起来。

---

## 1. 总览

```
Week 1  配置抽离           零风险 · 立即交付 · 建立调参出口
Week 2  事件存储 + 8 结局   双写骨架；EventKind 纳入 ending / matter
Week 3  删祖传 · 砍 1:1 · schema 同步   legacy + 1:1 锁 + archetype + cloud migration
Week 4  god function + Session 层   updateDerivedState 拆 · Session 新建 · priorities 搬迁
Week 5  Matter 数据模型      Matter 容器 + 4 类模板槽位 + 现有动作映射
Week 6  Matter ActionResolver  动作执行走 Matter 生命周期 · Opportunity 降级为 Relation
--------------------------------------------------------------
门槛    6 周末评估：进 Phase B（Actor agency）还是稳住（总纲 §7）
```

每周独立交付，失败任一周不污染之前：
- Week 1 即使不往下走也是纯加分
- Week 2 双写可随时只读旧字段回退
- Week 3 删除用 git 可恢复；schema 变更由单独 migration commit 可回滚
- Week 4 拆解不改变行为，Session 层失败可回退到 state 树
- Week 5 新增 Matter 类型与容器，不影响既有 action 路径（既有动作仍旧工作）
- Week 6 动作逐个迁移到 Matter 路径，可按 action 粒度回滚

---

## 2. 贯穿六周的纪律：字段归属审查（六级）

**碰到任何字段（新增 / 修改 / 移动），先填这张表**。Q6 把 Matter 升为
World 第五原子后，归属表从五级变为六级：

| 类别 | 含义 | 当前误挂处示例 | 正确归属 |
| ---- | ---- | -------------- | -------- |
| World 级 | 所有 Actor 都看见的客观事实 | `world.day`, `world.markets`, `world.channels`, `world.eventStore` | `World` |
| Actor 级（Owner） | 某个业主自己的状态/感受 | `caseItem.trust`, `caseItem.patience`, `caseItem.urgency`, `caseItem.bottomPrice` | `Owner` |
| Actor 级（Customer） | 某个买家自己的状态 | `opportunity.budgetMax`（已对） | `Customer` |
| Actor 级（Broker / 玩家） | 玩家自己的状态 | `world.energy`, `world.budget` 散落 state 根 | `player.*`（Week 4 收拢） |
| Actor 级（Rival） | 同行的状态 | rival 仅被动 | `Rival`（Phase B 补 policy） |
| Relation 级 | 两个 Actor 间的持续关系 | `opportunity.intent`, `opportunity.stageIndex` | `Customer × Case` Relation（Week 6 重命名） |
| **Matter 级** | 带状态机的工作项 | 目前散落在 `ACTION_EXECUTORS` 各 handler | `Matter`（Week 5 新建） |
| Case 级（物件） | 房源本身的属性 | `caseItem.heat`, `caseItem.layout`, `caseItem.tags`, `caseItem.askPrice` | `Case`（askPrice 注意：挂牌价是 Case，但底价归 Owner） |
| Environment | 场域/制度 | `channels`, `districts`, `rules` | `World.environment` |
| Viewport 级 | 仅玩家视角的派生 | `caseItem.schedule`, `caseItem.priorities`, `world.eventLog` | **Session**（Week 4 建立），不进 World 持久化 |

**执行规则**（六周内永不违反）：
1. 新增字段前先判断类别；挂错位置拒绝合入。
2. 已存在的错归属不强求本周修，但经过它时必须就地纠正。
3. UI 派生文案（title/badge/note/tone）从此不再写回 state 树，在组件里 memo。
4. Relation 与 Matter 的区别：Relation 是**无限期**的连续状态（如买家对房
   子的兴趣从认识到流失/成交），Matter 是**一次具体协作**（如"本周一约业主见面谈底价"）。Relation 的推进由 Matter 的完成触发。
5. `Opportunity` 在 Week 5 之前视为 Relation 容器，Week 5 后重命名为
   `CustomerCaseRelation`，并把`stageIndex` 推进改为 Matter 完成的副作用。

这张表是 6 周的北极星。每次 PR review 只看两件事：
(a) 是否达成本周目标？(b) 有没有违反归属表？

---

## 3. Week 1 — 配置抽离

### 目标
把散落在 `domain/**` 里的所有"调手感"数字集中到 `content/balance.ts`。
代码逻辑不变，只做物理位移。

### 文件清单（需修改）
```
src/selling-houses/content/balance.ts               [新建]
src/selling-houses/domain/scoring.ts                [替换 inline 数字]
src/selling-houses/domain/engine/opportunityEngine.ts
src/selling-houses/domain/engine/actionResolvers.ts
src/selling-houses/domain/engine/eventEngine.ts
src/selling-houses/domain/engine/competitionEngine.ts
src/selling-houses/domain/engine/marketEngine.ts    [若有 inline]
```

### balance.ts 结构样板

> 完整样板见附录 B。此处只列骨架与关键约定。

```typescript
// src/selling-houses/content/balance.ts
//
// 所有影响手感的数字集中于此。每个值必须带 3 行注释：
//   1. 语义（它代表什么）
//   2. 调参方向（调大/调小的玩家体验变化）
//   3. 上次调整的依据（playtest #N / 数值建模）
//
// 严禁在 domain/** 内写 inline 数字。例外：遍历/索引/数组长度等
// 跟游戏手感无关的程序性常量。

export const COMPETITIVENESS = { ... };
export const OPPORTUNITY = { ... };
export const NEGOTIATION = { ... };
export const COMMISSION = { ... };
export const SCHEDULED_EVENTS = { ... };
export const COMPETITION = { ... };
```

### 执行步骤（按此顺序，每步独立 commit）

1. **抽 scoring.ts**
   - `Math.log2 * 20 / * 40 / * 30`, `stagnationCount * 10`,
     `baselineFunnel = 5`, `baselineSpeed = 3`, 漏斗权重 `5/4/2/1.5`,
     `priceFlex * 10 * 100`, `consistency * 80`, driver contributions,
     `calculateUrgency` 里的 `* 5 / * 100 / * 100`
   - `npm test`（若无则 `npm run build`）通过
2. **抽 opportunityEngine.ts**
   - `maxActivePerCase = 4`, `slice(0, 3)`, `bonus >= 14`,
     intent/confidence clamp 边界，`daysLeft = 5/4`,
     `0.35` 晋级, `82 / 75 / 32` 阈值, pricePenalty 除数 `5 / 9`,
     fit 六项权重, passiveLead 除数 `240/600`,
     brokerVisibility `0.35 / 0.20`
3. **抽 actionResolvers.ts**
   - `resolveNegotiation` 六权重 `0.46/0.24/0.18/0.16/0.6`
   - `sellCase` 佣金公式拆解，注释写明
     `soldPrice * 0.01 * 0.25 * 10 / 10` 的语义
     （目前读起来就是 `* 0.0025`，10 和 10 互抵——注释里明确，暂不化简）
4. **抽 eventEngine.ts**
   - 9 个 delta；随机事件分支的触发阈值
5. **抽 competitionEngine.ts**
   - `shouldLoseToRival` 的 8 个 signal 权重与 6 项组合
6. **清扫**
   - 全仓 grep `/ \* 0\.[0-9]+/` 和 `/>= [0-9]+/` 再过一遍，抽剩的

### 验收
- [ ] `src/selling-houses/domain/**` 内没有"手感相关"数字字面量
  （由 reviewer 肉眼过一遍 diff）
- [ ] 开新一局，playtest 30 分钟，与 Week 0 比**行为完全一致**
  （手感差异 = 有数字漏抽）
- [ ] 非工程师能拉 `balance.ts`，改一个数，重启看到变化
- [ ] `content/balance.ts` 行数 ≥ 150，反过来说如果 < 80 行，说明还有
  大量数字没抽出来

### 风险与回退
- **风险**：漏抽某个关键数字，playtest 出现细微手感偏移且没人察觉
- **缓解**：执行步骤里的 6. 清扫必须由另一人复核
- **回退**：单个 commit revert，不影响其他

### Q5 保护
无关。Week 1 不触及数据结构。

---

## 4. Week 2 — 事件存储骨架（双写）

### 目标
以 `budget.ts` 的事件 schema 为模板，建立通用 `EventStore`；把
`trust / patience / heat / urgency / reputation` 每次变化**同时**记为
事件，**不删**现有 scalar 字段。`resultEvaluation.buildEndingSummary`
切换到从事件流重建叙事。

### 为什么现在做
- 成本最低的时间点：
  Week 1 的 balance 抽完后，改 domain 逻辑代价最小
  Week 3 要删祖传代码，到时候事件表已在用会更有底气
- Q5 的核心地基：未来 ReplayViewport / ObserverViewport / AI 陪练
  无一例外依赖事件流；现在种下，以后不用重做

### 文件清单
```
src/selling-houses/domain/events/eventStore.ts      [新建]
src/selling-houses/domain/events/eventKinds.ts      [新建·类型]
src/selling-houses/domain/events/record.ts          [新建·记录 helper]
src/selling-houses/domain/engine/*.ts               [在状态写入点加 record(...)]
src/selling-houses/domain/resultEvaluation.ts       [切换数据源]
src/selling-houses/domain/models.ts                 [GameState 增加 eventStore 字段]
```

### EventStore schema（budget.ts 泛化）

```typescript
// src/selling-houses/domain/events/eventKinds.ts
export type EventKind =
  // 状态变化类
  | 'trust.gain'   | 'trust.loss'
  | 'patience.gain'| 'patience.loss'
  | 'heat.gain'    | 'heat.loss'
  | 'urgency.rise' | 'urgency.fall'
  | 'reputation.gain' | 'reputation.loss'
  | 'qualityStory.gain'

  // 关系进展类（Opportunity / Customer×Case Relation）
  | 'opportunity.created'
  | 'opportunity.advanced'
  | 'opportunity.lost'
  | 'opportunity.won'

  // 业主行为类
  | 'owner.priceAdjust'
  | 'owner.withdrawn'
  | 'owner.updated'

  // 结算类
  | 'budget.income' | 'budget.expense'        // 现有 budget 合并进来
  | 'deal.closed'

  // 8 类单房结局（source: listing-lifecycle-design.md，本周必建）
  | 'ending.sold_by_you_happy'
  | 'ending.sold_by_you_neutral'
  | 'ending.sold_by_you_regret'
  | 'ending.sold_by_other'
  | 'ending.not_sold_no_regret'
  | 'ending.not_sold_regret'
  | 'ending.switch_to_rent'
  | 'ending.withdrawn_unhappy'

  // Matter 生命周期（Week 5-6 真正使用；Week 2 先定义）
  | 'matter.opened'
  | 'matter.advanced'
  | 'matter.completed'
  | 'matter.abandoned';

export interface WorldEvent {
  id: string;             // `${day}-${seq}`
  day: number;
  timeSlot?: 'morning'|'day'|'evening'|'night';  // 预留 Week 4+
  kind: EventKind;
  subjectId: string;      // 事件的主角（Case/Customer/Owner id）
  actorId?: string;       // 事件发起者（多数为玩家 Broker id）
  relatedId?: string;     // 相关对象（Opportunity/Channel id）
  amount?: number;        // 数值变化量（可正可负）
  valueAfter?: number;    // 作用后的值（可选，方便重建）
  title: string;          // 一句话摘要（已本地化）
  detail?: string;        // 富文本细节
  parentEventId?: string; // 因果链，现在可空
}
```

### record helper（每个写入点都走它）

```typescript
// src/selling-houses/domain/events/record.ts
export function record(world: GameState, ev: Omit<WorldEvent, 'id'|'day'>) {
  const seq = world.eventStore.length + 1;
  const full: WorldEvent = {
    id: `${world.day}-${seq}`,
    day: world.day,
    ...ev,
  };
  world.eventStore.push(full);
  // 不 unshift。按时间顺序 append。
  // 不做大小上限。6-8 case 一局最多万条，可接受。
}
```

### Dual-write 范式

以 trust 为例（其余同理）：

```typescript
// before
caseItem.trust = clamp(caseItem.trust + 5, 0, 100);

// after（双写）
const before = caseItem.trust;
caseItem.trust = clamp(caseItem.trust + 5, 0, 100);
record(world, {
  kind: 'trust.gain',
  subjectId: caseItem.ownerId ?? caseItem.id,   // 业主抽象前先用 case.id
  actorId: 'player',
  amount: caseItem.trust - before,
  valueAfter: caseItem.trust,
  title: `${caseItem.title} 业主信任 +${caseItem.trust - before}`,
});
```

**原则**：
- Scalar 字段保留不动，UI 继续读旧字段
- 事件流只增不减
- 不往 eventStore 加 UI 派生字段（违反归属表 Viewport 层）

### resultEvaluation 切换（本周产出最大的用户可感变化）

当前 `buildEndingSummary` 从终局 snapshot 倒推——所以结局故事颗粒
粗、缺少时间感。改为：

```typescript
// 从事件流抽取关键节点，按时间排序，生成叙事
const narrative = world.eventStore
  .filter(ev => isNarrativeWorthy(ev))
  .map(ev => ({
    day: ev.day,
    tone: toneOf(ev.kind),
    line: ev.title,
    detail: ev.detail,
  }));
```

`isNarrativeWorthy` 初版可硬编码：opportunity.* 全收，
trust/patience/heat 变化 > 10 的收，reputation.* 全收。

### 验收
- [ ] `world.eventStore.length > 50` 在一局标准 playtest 后成立
  （一局若 < 50 条，说明漏了写入点）
- [ ] `buildEndingSummary` 输出的故事条目数比 Week 0 多 3x 以上
- [ ] 事件流每一条都符合归属表（subject/actor/relation 位置正确）
- [ ] 关掉 scalar 字段的 UI 读取（临时 hack 一次）后，UI 能回放出
  近似的状态曲线——这是 Q5 的"影子"验证

### Q5 保护
**强**。事件流就是 Q5 的门。这周做完，未来 Actor 抽象落地时不需要回溯
历史状态——事件流就是历史。

### 风险与回退
- **风险**：写入点遗漏，scalar 和 event 不一致
- **缓解**：写一个 dev-only 校验——每次 tick 结束时抽查 5 个字段对
  事件重建，差 > 2 报 console.warn
- **回退**：resultEvaluation 切回 snapshot 倒推即可

---

## 5. Week 3 — 删祖传 · 砍 1:1 · schema 同步（Q7）

### 目标
- 删除 `buildLegacySnapshot`（90 行永久性适配器）
- 删除 `normalizeCase` 的防御性回退——**逐字段标注"产品约束（保留） vs
  技术债（删）"**。特别：`firstVisitDone` 是 durable-decisions 第 57 行
  的硬约束，不删
- 双人格/archetype 二选一，**cloud schema 同步迁移**
- 去掉 `createOpportunity` 的 Customer 1:1 锁

### 为什么现在做
这周是 6 周里风险最高的一周。但越晚删越贵：
- Week 4 要拆 `updateDerivedState` + 建 Session 层，它们目前仍依赖
  legacy 字段。先删 legacy 再拆 god function
- 1:1 锁删掉后，`computeCustomerFit` 的排序变得更有意义（否则同一
  买家只能上一个 case 的列表，fit 算完也没用武之地）
- Q7 决定"schema 始终可回接"：personality → archetype 改名这种会动
  外键的迁移，必须与代码改动同步 commit，不能延到 Phase B

### 删除清单（pure deletion）

```
src/selling-houses/application/gameState.ts
  - buildLegacySnapshot (lines 292-383)           [DELETE]
  - 所有调用点改为直接读取新结构

src/selling-houses/application/gameState.ts
  - normalizeCase 的 fallback 分支 (lines 385-417) [TRIAGE-THEN-DELETE]
  - 删前必须对每个分支分类：
    * 产品约束（保留）：firstVisitDone、qualityStory 之类的"首次面访独立"
      类（durable-decisions §57）。保留为显式必填字段
    * 技术债（删）：personality 的 fallback、legacy archetype 映射
    * 不确定的：落到 doc/triage.md 由产品决策后再删

src/selling-houses/domain/models.ts
  - 二选一后，另一套 personality/ownerArchetype 类型 [DELETE]
  - 选 ownerArchetype（符合 Actor 归属方向），删 personality
```

### 修改清单

```
src/selling-houses/domain/engine/opportunityEngine.ts
  - createOpportunity 第 101-104 行
    删掉 `&& !world.opportunities.some(...)` 过滤
    允许同一 customer 同时活跃在多个 case 上

  - 新增：每个 customer 的 activeRelationCount 上限（建议 3）
    避免一个买家挂 8 个 case 这种不真实场景
    数字进 balance.ts: OPPORTUNITY.maxActivePerCustomer

src/selling-houses/infrastructure/** + cloud schema（Q7 同步）
  - 若云端已有 seller_profile_code / seller_profile_definitions 表，
    同步改名为 owner_archetype_code / owner_archetype_definitions
  - 新增一条 migration：旧 seller_profile_code 值 → 新 archetype id 映射
  - `maintainer_matters` 表的 interaction_template_code 字段保持不动
    （Week 5 才真正用起来）
  - 提交由 2 个独立 commit 组成：一个改 code、一个带 migration SQL；
    便于回退时只 revert schema 而保留代码删除
```

### 二选一抉择

**personality vs ownerArchetype：选 `ownerArchetype`**。
理由：
- archetype 是 Actor 维度的概念（业主是什么人），对齐 Q5
- personality 当前是 Case 挂载，违反归属表
- archetype 已有叙事产出（`scenarioSnapshot.world.ownerArchetypes`），
  删 personality 用户感知最小

执行：
1. 统计两个系统的所有 consumer，记录清单
2. 把 personality 的独有逻辑 port 到 archetype（按需求可能为 0）
3. 删 personality 定义，让 TS 报错引导到所有使用点
4. 一个个改

### 验收
- [ ] `grep -r 'legacySnapshot\|normalizeCase' src/` 只在 git history 里
- [ ] `grep -r 'personality' src/` 只在 UI 文案或测试 fixture 里
- [ ] 同一局中观察到：同一个 `customer.name` 出现在 ≥2 个不同 case 的
  opportunity 列表里
- [ ] Week 2 的 eventStore 依然工作，没被 delete 波及

### Q5 保护
**强**。1:1 锁是 Customer 作为 Actor 的最大障碍，删掉后 Customer 才
有可能在 Phase B 拿到自己的 tickCustomers 循环。

### 风险与回退
- **风险**：删 legacy 后某个 UI 组件（尤其是 `details` tab）白屏
- **缓解**：删除前用 ripgrep 全量搜调用点，列清单逐一改；保留
  git-revert 的单 commit 粒度
- **回退**：若 UI 大面积破坏，revert 该 commit，改为"把 legacy 标为
  `@deprecated` 但不删"——至少已经验证了没有新代码依赖它

---

## 6. Week 4 — 拆上帝函数 + Session 层（Q8）

### 目标
- `updateDerivedState` 拆解 → 按需派生，纯函数
- **新建 Session 层**：玩家视角状态独立持久化（localStorage 本地 + 云端可
  按需镜像）
- `priorities / schedule / signals` 从 World 状态树搬去 Session 层
- `executeAction` 字典化 ActionResolver，签名靠近 Q6/Q5 形态（Matter 占位
  本周空置）
- engine 导出去掉 `any`

### 为什么 Session 和拆 god function 同一周

- 两者都围绕"什么是 World 状态、什么是 Viewport 状态"这个归属判断
- 如果拆完 `updateDerivedState` 才建 Session，中间状态是：派生字段在组件
  里 memo 但又没地方持久化，刷新页面 priorities 消失——durable-decisions
  §54-56 要求的"建议动作"闪烁
- 合并一周做能一次到位。代价是 Week 4 工作量比其他周重约 30%

### Session 数据结构

```typescript
// src/selling-houses/application/session.ts
export interface Session {
  id: string;                    // 本地会话 id，跨日稳定
  boundActorId: string;          // 当前 Viewport 绑定的 Actor id（= 玩家 Broker）
  viewState: {
    lastVisitedCaseId?: string;
    collapsedPanels: string[];
    preferredLayout: 'compact' | 'full';
  };
  derivedCache: {
    // 派生结果的最近一次快照，用于启动时瞬时渲染
    // 真实计算仍由组件 useMemo 完成，这只是"上次的值"
    prioritiesAt?: { day: number; items: PriorityItem[] };
    scheduleAt?: { day: number; items: ScheduleItem[] };
    signalsAt?: { day: number; items: SignalItem[] };
  };
  ui: {
    lastRoute: string;
    sidebarOpen: boolean;
  };
}

// 持久化：localStorage
//   key: `selling-houses.session.${worldId}`
//   write: debounced 500ms（与 cloudSync 分开，本地只写 Session）
// World 状态仍走原有 `saveGameState`，不受影响
```

**关键原则**：
- Session 与 World 状态完全隔离。World 不知道 Session 的存在
- Session 只持久化**用户视角偏好**和**派生结果的最近快照**——不是派生逻辑
- 派生逻辑仍在 `derive*(world)` 纯函数里；Session 只是 cache

### 拆 updateDerivedState

当前：每次 setState 都全量重算，O(cases × opportunities)。拆法：

```
// src/selling-houses/domain/derivations/ (纯函数，新目录)
deriveSchedule(world, caseId)          // 某个 case 的日程派生
derivePriorities(world, session)        // 当日优先级列表（读 session 上次结果做增量）
deriveSignals(world)                    // 信号聚合
deriveCompetitiveness(world, caseId)    // 已有 scoring.updateCompetitiveness，
                                        // 但当前被 updateDerivedState 在错误时机触发
deriveDailyBrief(world, session)        // 首页"本局目标/主风险/建议先做什么"
```

每个 derive 函数：
- 纯函数（不写 state）
- 返回值由组件 useMemo 消费并写回 Session 的 derivedCache
- 组件 `const priorities = useMemo(() => derivePriorities(world, session), [world.day, world.opportunities.length, ...])`

**关键**：把 schedule/priorities/signals 从 World state 树**移出**，
同时把"上次结果"写入 Session。这是归属表 Viewport 层的首次落地。

### "双层动作区" 保护（durable-decisions §54-56）

priorities 搬去 Session 不能破坏"建议动作（当前主矛盾优先级）+ 全部动作
（可做/不可做及原因）"的 UI 对比。落地：
- `derivePriorities` 返回 `{ suggested: Action[]; all: Action[] }`
- 组件直接消费该结构，无需再派生第二次
- `Session.derivedCache.prioritiesAt` 在启动时读取，避免首屏闪烁

### ActionResolver 签名（签名先于行为；为 Matter 留位）

当前：
```typescript
ACTION_EXECUTORS: Record<string, (world, params) => void>  // mutation
```

本周改为（为 Week 5 Matter 预留 `matter?` 参数）：
```typescript
type ActionResolver<P> = (
  world: GameState,
  actor: Actor,              // 目前总是 world.player
  matter: Matter | null,     // Week 4 一律传 null；Week 5 开始真的用
  params: P,
) => WorldEvent[];           // 返回事件数组
```

**本周不真的用返回的事件流替代 mutation**——那是 Phase B 的事。本周只是：
- 签名改过来（matter 参数占位）
- 每个 resolver 在 mutation 之后，把自己 record 过的事件收集返回
- 调用方丢弃返回值

### 去 `any`

engine 导出面上的 13+ 处 `any` 替换为具体类型。做法：
1. 先改 `models.ts` 里每个导出类型的 readonly / 不可选字段，明确最小合同
2. 逐个 engine 文件把 `any` 换成正确类型
3. 预期会暴露 2-3 处真的类型不匹配——那就是真 bug，顺手修

### 验收
- [ ] `grep -rn ': any' src/selling-houses/domain/` 为 0
- [ ] setState 的性能 profile：单次 dispatch 的 JS 耗时从 Week 0 基线
  下降 ≥ 40%（6-8 case 规模下）
- [ ] `world.schedule / world.priorities / world.signals` 从 state 树
  里消失，没有组件依赖它们
- [ ] `Session` 对象存在，刷新页面 priorities/schedule 不闪烁
- [ ] "双层动作区"（建议动作 + 全部动作）在详情页仍然工作
- [ ] 每个 ActionResolver 都返回 `WorldEvent[]`，签名包含 `matter` 参数

### Q5 / Q8 保护
**Q5 强**：ActionResolver 签名对齐 `(world, actor, matter, params) →
events`，为 Q5/Q6 落地准备干净的起跑线。
**Q8 强**：Session 层建立是 Q8 的直接落地。未来 Phase C 做 Observer
Viewport 时，Session 已经是独立对象，一套代码支持多种视角。

### 风险与回退
- **风险 A**：UI 组件依赖 `world.schedule` 的时机比想象的深
- **缓解**：拆前 grep `world.schedule|world.priorities`，按组件逐个改用
  useMemo
- **回退 A**：schedule 暂时保留在 state 但标 `@deprecated`，UI 仍能用，
  只是没拿到性能收益
- **风险 B**：Session 的 localStorage 在浏览器禁用时失败
- **缓解 B**：`SessionStorage` 作为 fallback；完全失败时内存对象仍工作
- **风险 C**：derivedCache 与真实派生结果不一致，首屏闪烁后"跳变"
- **缓解 C**：useMemo 第一次计算后**立即** overwrite Session.derivedCache，
  使二次进入时 cache 和真值一致

---

## 7. Week 5 — Matter 数据模型 + 4 类模板槽位（Q6 落地上半）

### 目标
把 Matter 作为独立容器建立起来。现有 `ACTION_EXECUTORS` 的每个动作都映射
到一类 template（report/negotiate/diagnose/execute），但本周**不改变动作
行为**——只是给每个动作贴标签 + 准备好容器。Week 6 再把动作执行真正走 Matter
生命周期。

### 为什么拆成两周
Matter 是玩法最小单位的重定义（durable-decisions §46：从动作到事项）。一周
内既改数据模型又改全部 actionResolver 会同时破坏"类型系统一致性"和"用户可
感行为"——回退不明确。

分法：
- Week 5 = 建 Matter 容器 + 模板定义 + action 贴标签（纯 additive）
- Week 6 = 把现有 action 的执行路径改为 open/advance Matter（behavior change）

Week 5 可以随时独立停下来（只新增容器，不改行为；balance.ts、eventStore、
Session 都继续工作）。Week 6 若卡死可回退到"Matter 容器存在但动作不用它"
的状态，不影响 W1-W5 成果。

### Matter 数据结构

```typescript
// src/selling-houses/domain/matters/types.ts

export type MatterTemplate = 'report' | 'negotiate' | 'diagnose' | 'execute';

export type MatterStage =
  | 'pending'        // 已创建尚未开始
  | 'in_progress'    // 进行中
  | 'completed'      // 正常完成
  | 'abandoned';     // 被终止（玩家弃项 / 时间耗尽 / 条件失效）

export interface Matter {
  id: string;                         // `${day}-${actor}-${seq}`
  initiator: ActorId;                 // 发起者（通常 = 玩家 broker id）
  template: MatterTemplate;

  // 作用对象（Actor / Relation / Case 的 id，至少一个）
  subjects: {
    caseId?: string;
    ownerId?: string;
    customerId?: string;
    relationId?: string;              // Customer×Case relation id
  };

  // 状态机
  stage: MatterStage;
  openedAt: number;                   // day
  closedAt?: number;                  // day
  expiresAt?: number;                 // day，pending 状态超过此天未启动自动 abandoned

  // 因果链
  events: WorldEventId[];             // 本 Matter 产生的事件 id 列表
  parentMatterId?: string;            // 若由另一个 Matter 派生

  // 模板专属 context（松类型，由模板自己解释）
  context: Record<string, unknown>;

  // 为 UI 提供（只读派生，不持久化）—— 实际用 derive*(matter) 计算
}
```

### 4 类模板的 stage 机

```typescript
// src/selling-houses/domain/matters/templates.ts

// report：汇报类（对业主说明进展）
// 典型 context: { topic: 'price_feedback' | 'market_update' | 'deal_progress' }
export const REPORT_TEMPLATE = {
  stageSequence: ['pending', 'in_progress', 'completed'] as const,
  expiryDaysInPending: 3,
  legalTransitions: {
    pending: ['in_progress', 'abandoned'],
    in_progress: ['completed', 'abandoned'],
    completed: [],
    abandoned: [],
  },
};

// negotiate：博弈类（推进关键价格/条件）
// 典型 context: { target: 'lowerAsk' | 'raiseBottom' | 'adjustTerms' }
export const NEGOTIATE_TEMPLATE = {
  stageSequence: ['pending', 'in_progress', 'completed'] as const,
  expiryDaysInPending: 5,
  // ...
};

// diagnose / execute 同理
```

具体 stage 子步（如"约见→到场→谈底价→定下一步"）由 `context` 描述，
不是类型。Week 5 先支持最小 3 状态，Week 6 若需要细分再扩 context。

### 现有动作 → template 映射

| 当前 action（actionResolvers.ts） | template | 典型 subjects |
| -------------------------------- | -------- | -------------- |
| `resolveVisit`（上门） | execute | caseId, ownerId |
| `resolveFollowup`（跟进） | report | caseId, ownerId |
| `resolveShowing`（带看） | execute | caseId, customerId, relationId |
| `resolveNegotiation`（谈判） | negotiate | caseId, ownerId（底价） 或 relationId（出价） |
| `resolveSellCase`（成交） | execute | caseId, relationId |
| `resolveMarketResearch`（调研） | diagnose | caseId |
| `resolveAdjustPrice`（调价） | negotiate | caseId, ownerId |
| `resolveQualityStory`（梳理卖点） | diagnose | caseId |
| `resolvePromote`（推广） | execute | caseId |
| `resolveAddToFocus`（加入主攻） | execute | caseId |
| …其余 | （按最接近的分类） | |

**规则**：每个现有 action 必须明确归到一类。不确定的写 `execute` 占位，
Week 6 再微调。

### Opportunity 推进改为 Matter 副作用（关键信号）

当前：`opportunityEngine.tickOpportunities` 第 61 行 `chance(0.35)` 决定晋级。
Week 5 先不改这个，但必须**同时** record 一个 `matter.completed`（类型
`execute`）事件——模拟"买家自发推进"由系统代他 open+complete 一个 Matter。

这是 Week 6 真正去掉 0.35 硬币前的"伪 Matter"铺垫。Week 6 会把买家的自发
推进改为：系统按条件 open 一个 buyer-initiated Matter，自动走完。

### 文件清单
```
src/selling-houses/domain/matters/types.ts        [新建]
src/selling-houses/domain/matters/templates.ts    [新建]
src/selling-houses/domain/matters/registry.ts     [新建·action → template 映射]
src/selling-houses/domain/models.ts               [GameState 加 matters 数组]
src/selling-houses/domain/events/eventKinds.ts    [matter.* 真正启用]
src/selling-houses/application/gameState.ts      [矿 matters 初始化 / 持久化]
```

### 验收
- [ ] `world.matters` 数组存在，被持久化
- [ ] 每次执行 action 都会 open 一个 Matter（stage='pending' 或
  'in_progress'）
- [ ] 每个 ActionResolver 收到的 `matter` 参数不再是 null，而是该 action
  对应的 Matter 对象
- [ ] `ACTION_TEMPLATE_MAP` 覆盖所有 ~13 个现有 action，无遗漏
- [ ] 原有动作行为**完全没变**（playtest 与 W4 末行为一致）

### Q6 保护
**强**。本周把 Matter 从概念变成运行时对象，且为每个 action 贴好标签。
没有这一步，Week 6 的行为迁移无从下手。

### 风险与回退
- **风险**：Matter 的 stage 机与现有 action 的隐含多阶段逻辑冲突
  （例：`resolveNegotiation` 自己内部已经包含"谈判尝试→成功/失败"两步）
- **缓解**：Week 5 最小 3 状态够用；复杂多步留到 Week 6 的 execution
  改造时扩 context
- **回退**：删除 `matters` 初始化 + resolver 的 matter 参数传 null，
  回到 Week 4 形态

---

## 8. Week 6 — Matter ActionResolver + Opportunity 降级（Q6 落地下半）

### 目标
- 动作执行全部走 Matter 生命周期：`open → advance → complete/abandon`
- `Opportunity` 重命名为 `CustomerCaseRelation`，降级为纯 Relation 容器
- `tickOpportunities` 的 `chance(0.35)` 晋级硬币消除，改为"买家自发触发的
  Matter 完成 → Relation stageIndex 推进"
- 确保 8 类结局由 Matter 链路驱动（而不是终局 snapshot 倒推）

### 为什么放最后
- 这是 6 周里用户可感行为**真正改变**的一周（每个 action 走 Matter 路径）
- 需要 W5 的 Matter 容器和贴标签作为前提
- 需要 W4 的 ActionResolver 签名已经接受 matter 参数
- 需要 W2 的 eventStore 已经有 `matter.*` 事件 kind

### 改动清单

```
src/selling-houses/domain/engine/actionResolvers.ts
  - 每个 resolver 改造：
    * 接收到 matter 参数（W4 已铺签名）
    * 执行前判断 matter.stage，非 in_progress 的进入对应转换
    * 执行完毕 record matter.completed 或 matter.advanced
    * mutation 的副作用改由事件驱动（本周仍保留 mutation，Phase B 再切）

src/selling-houses/domain/engine/opportunityEngine.ts
  - tickOpportunities 第 61 行 chance(0.35) 删除
  - 改为：每个 active opportunity 在 tick 内判断"是否触发买家自发 Matter"
    * 条件：intent >= 82 && confidence >= 60 && stagnation < threshold
    * 触发时 open 一个 template='execute', initiator=customerId 的 Matter
    * 同 tick 内立即 complete 该 Matter，产出 'opportunity.advanced' 事件
  - stageIndex 推进从"直接 mutation"改为"Matter 完成的副作用"

src/selling-houses/domain/models.ts
  - `Opportunity` 类型 → `CustomerCaseRelation`（rename + docstring 更新）
  - 所有引用处同步改名（TS 帮忙）
  - `world.opportunities` 保留字段名不改，只改类型（减少 UI 改动）

src/selling-houses/domain/resultEvaluation.ts
  - `buildEndingSummary` 改为：优先从 matter 链路 + ending.* 事件生成
    narrative
  - 8 类结局的判定从终局 snapshot 回退为"最后一个成交/撤盘类 Matter 的
    outcome 事件"
```

### Matter 驱动 Opportunity 推进的示意

```typescript
// Week 6 的 tickOpportunities 伪码
function tickOpportunities(world) {
  for (const rel of world.opportunities) {  // 现在类型是 CustomerCaseRelation
    if (shouldBuyerInitiateAdvance(rel, world)) {
      const matter = openMatter(world, {
        initiator: rel.customerId,
        template: 'execute',
        subjects: { relationId: rel.id, caseId: rel.caseId },
        context: { reason: 'buyer_initiated_advance' },
      });
      advanceMatter(world, matter, 'in_progress');
      rel.stageIndex += 1;
      record(world, {
        kind: 'opportunity.advanced',
        subjectId: rel.id,
        actorId: rel.customerId,
        parentEventId: matter.events[0],  // 因果链
      });
      completeMatter(world, matter);
    }
  }
}
```

### 验收
- [ ] `grep -n 'chance(0\.35' src/selling-houses/` 为 0
- [ ] 每个动作执行都有对应的 Matter 生命周期事件（至少 opened + completed）
- [ ] `Opportunity` 类型已改名为 `CustomerCaseRelation`
- [ ] 8 类结局至少有 5 种能在 playtest 中被触发并 record 为 `ending.*`
  事件
- [ ] 一局完整 playtest 后 `world.matters.length > 30`
- [ ] 手感评估：与 W0 比，随机性**更可解释**（原先 0.35 硬币导致的"突然
  晋级"感消失）

### Q6 保护
**核心**。本周是 Q6 的完整落地。没有本周，Matter 只是一张贴在动作上的
标签；有了本周，Matter 成为动作执行的真实容器，durable-decisions §46
的"事项"设定才真正可用。

### 风险与回退
- **风险 A**：买家自发推进的触发条件调不好，导致晋级频率显著偏离 W5
- **缓解 A**：触发条件参数进 balance.ts，playtest 后 tune；预设与 W5
  0.35 硬币的期望晋级率接近
- **风险 B**：Matter 完成的 mutation 副作用散落在各 resolver，难以审计
- **缓解 B**：Phase B 统一做"mutation → applyEvents"改造；本周不追求
- **回退**：整周回退可以恢复到 W5 形态（Matter 容器存在但 action 执行
  不依赖它）；代价是 W6 的行为改进丢失，其他周产出不受影响

---

## 9. 每周闸门（Stop conditions）

**每周结束前必须过的门**。任一闸门不过，**不进下周**，停下来诊断。

### Week 1 闸门
1. balance.ts ≥ 150 行且覆盖所有 grep 列表
2. 30 分钟 playtest 与 Week 0 行为一致
3. 非工程师能独立改数并看到效果

### Week 2 闸门
1. eventStore 一局 > 50 条
2. resultEvaluation 使用 eventStore 作为主数据源
3. scalar ↔ event 一致性校验通过

### Week 3 闸门
1. legacy / personality 在代码里清零
2. 同一 customer 可出现在多个 case
3. 完整局游戏可通关（win / lose / timeout 三种结局都能产出）

### Week 4 闸门
1. `any` 在 domain 里清零
2. state 树无 UI 派生字段
3. dispatch 性能下降 ≥ 40%

**任一闸门连续 2 天不过**：立刻停手，写一份 300 字 postmortem，回到 §9
的决策分支。

---

## 8. 明确不做（四周内 scope 外）

| 事项 | 为什么不做 | 什么时候做 |
| ---- | ---------- | ---------- |
| Shadow city / 平行世界 | Q2 单机剧情 | Phase B/C 若产品转向社区 |
| AI broker / AI 陪练 | Q2 单机剧情 | Phase D |
| 真的 event sourcing (reducer + replay) | 风险大 | Phase B，Week 2 只铺 append 骨架 |
| 多 Viewport 支持 | Q2 单机剧情 | Phase C |
| Customer / Owner 自主 tick 循环 | Q5 是"未来可能"，不是"现在就要" | Phase B |
| 重构 UI 组件树 | 不在架构目标上 | 单独立项 |
| 国际化 / i18n | 与架构无关 | 单独立项 |
| 测试基础设施 | Week 1-4 内可用手动 playtest 验收 | 随 Phase B 补齐 |

如果 4 周里出现"顺手把 X 也做了"的冲动，停下来问：X 是否满足下列**全部**
条件？
- 不违反归属表
- 不改变用户可感行为
- 不超过当日工时 2 小时

三个都是，可以做。否则记到 backlog。

---

## 9. 4 周后的决策分支

### Happy path（4 个闸门全过）
- 一局 playtest 30 分钟，手感与 Week 0 一致或更好
- domain 层干净度自评：给自己打分 > 7/10
- → **进 Phase B（Actor 抽象）**：按 `world-viewport` §10 的 Phase B
  展开。核心任务：Owner / Customer 从 field 升级为 Actor，拥有自己
  的 policy；Relation 从 Opportunity 抽取。

### Stuck path（某个闸门反复不过）
常见卡点与对策：
- **Week 1 卡住**：数字抽不干净 → 多半是语义不明的魔法数。写一份
  "balance_debt.md" 记录这些数字，以 domain expert（你 + 策划）访谈
  补全
- **Week 2 卡住**：eventStore 写入点遗漏 → 建立"每次改 scalar 都过
  helper" 的 lint 规则；或 Phase B 提前到此处
- **Week 3 卡住**：legacy 删不干净 → 退回到 `@deprecated` 标记策略，
  继续 Week 4
- **Week 4 卡住**：any 去不干净 → 可容忍，engine 内部保留 any，导出
  面必须干净

### Pivot path（Q2 改变：产品转向社区/观战）
如果 4 周期间 Q2 的答案变化（例如市场调研发现社区诉求强），**立即停
Week 3-4**，回到 `world-viewport` md 的 Phase A 重新评估。Week 1-2
的产出是有效资产，不浪费。

---

## 附录 A — 本方案与前两份 md 的映射

| 本方案 | v3.1 诊断 | 世界-视口 |
| ------ | --------- | --------- |
| Week 1 | P0（balance 抽离） | 无直接对应，但为 Phase A 准备 |
| Week 2 | P1（eventLog vs eventStore 拆分）的前半 | Phase A（事件存储） |
| Week 3 | P2（any 清理 + 删 legacy + 砍 1:1） | Phase A/B（Actor 准备） |
| Week 4 | P2（god function 拆分） | Phase B（Rule registry 雏形） |
| 4 周后 | v3.1 剩余 P3-P5 | Phase B 正式开启 |

---

## 附录 B — balance.ts 完整样板

```typescript
// src/selling-houses/content/balance.ts

// ═══════════════════════════════════════════════════
// 竞争力评分（D1 / D2 / D3）
// ═══════════════════════════════════════════════════

export const COMPETITIVENESS = {
  weights: { d1: 0.4, d2: 0.3, d3: 0.3 },

  d1: {
    // D1 = 客户漏斗宽度 + 推进速度 - 停滞
    poolSizeScale: 20,               // log2(n+1) * scale → 0-100 曲线
    activeContactsScale: 20,
    lateStageScale: 40,              // funnelWeight / baselineFunnel * scale
    advanceSpeedScale: 30,
    stagnationPenalty: 10,           // 每个停滞客户扣分

    poolWindowDays: 7,               // 池子大小统计窗口
    advanceWindowDays: 7,            // 推进速度统计窗口
    stagnationThresholdTicks: 3,     // tick > 此值 记为停滞

    // 漏斗阶段权重（stageIndex → 贡献）
    // 0:了解 1:咨询 2:看房 3:再看 4:出价 5:谈判 6:成交
    funnelStageWeights: { 2: 1.5, 3: 2, 4: 4, 5: 5 },

    baselineFunnel: 5,
    baselineSpeed: 3,
  },

  d3: {
    // 价格灵活度：(askPrice - bottomPrice) / askPrice
    flexPctMappedTo100: 0.10,        // 10% flex → 100 分
    consistencyPlaceholder: 80,      // TODO: 抽取真实 consistency 信号
  },

  drivers: {
    activeContactsNarrowThreshold: 2,
    priceFlexLowThreshold: 0.02,
    patienceLowThreshold: 40,
  },

  // 紧迫度权重（已经在 constants PORTAL_URGENCY_WEIGHTS，待合并）
  urgency: {
    deltaScale: 5,                   // delta * scale
    levelScale: 100,
    criticalEventScale: 100,
    timeWindowScale: 100,
    criticalWindowDays: 3,
    criticalTrustThreshold: 40,
    windowPressureHorizonDays: 15,
  },
};

// ═══════════════════════════════════════════════════
// 机会（Opportunity = Customer × Case Relation）
// ═══════════════════════════════════════════════════

export const OPPORTUNITY = {
  create: {
    maxActivePerCase: 4,
    maxActivePerCustomer: 3,         // Week 3 新增；此前为 1
    candidatePoolSize: 3,            // ranked top N 中选一个
    advanceBonusStageThreshold: 14,  // bonus >= 此值 初始 stage=1
    pricePenaltyDivisor: 5,
    intentClamp: { min: 35, max: 89 },
    confidenceClamp: { min: 30, max: 92 },
    initialDaysLeft: { stage0: 5, staged: 4 },

    // intent 基础值组合
    intentBase: 46,
    fitToIntent: 0.24,
    heatToIntent: 0.14,
    activityToIntent: 0.12,
    channelQualityToIntent: 10,

    confidenceBase: 48,
    fitToConfidence: 0.25,
    trustToConfidence: 0.16,
  },

  tick: {
    pricePenaltyDivisor: 9,
    intentClamp: { min: 8, max: 98 },
    confidenceClamp: { min: 10, max: 98 },
    untouchedIntentDecay: 4,

    // intent 增量系数
    heatNeutralMid: 55,              // (heat - mid) / divisor
    heatDivisor: 10,
    d1NeutralMid: 50,
    d1Divisor: 16,
    intentNoise: [-4, 4],            // randomInt 范围

    // confidence 增量系数
    d3Divisor: 14,
    confidenceNoise: [-3, 3],
  },

  advance: {
    intentThreshold: 82,
    chance: 0.35,
    resetDaysLeft: 5,
  },

  offer: {
    stageIndexMin: 4,
    intentThreshold: 75,
  },

  lose: {
    intentFloor: 32,                 // < 此值 或 daysLeft<=0 判失败
  },

  fit: {
    layoutMatch: 18,
    layoutMiss: 4,
    districtMatch: 18,
    districtMiss: 0,
    budgetBase: 24,
    budgetPenaltyDivisor: 10,        // 每差 10 价格扣 1
    budgetFloor: 2,
    preferencePerMatch: 6,
    competitivenessMultiplier: 0.16,
  },

  passiveLead: {
    heatDivisor: 240,
    d1Divisor: 600,
    // 最终 chance = (heat/240 + d1/600) * rules.passiveLeadBaseMultiplier
    //              * (isFocused ? focusedMultiplier : 1)
  },

  brokerVisibility: {
    // channel → broker shadow lead 概率
    recommend: 0.35,
    search: 0.20,
    brokerNetwork: 0.20,
  },
};

// ═══════════════════════════════════════════════════
// 谈判 / 动作
// ═══════════════════════════════════════════════════

export const NEGOTIATION = {
  weights: {
    competitiveness: 0.46,
    trust: 0.24,
    patience: 0.18,
    urgency: 0.16,
    offerRatio: 0.60,
  },
};

export const COMMISSION = {
  // 成交价 × 1% × 0.25 × 10 / 10
  // = 成交价 × 0.0025
  // 保留原式等待产品确认是否可化简
  multiplier: 0.0025,
};

// ═══════════════════════════════════════════════════
// 定时事件 / 竞品
// ═══════════════════════════════════════════════════

export const SCHEDULED_EVENTS = {
  // fireScheduledEvents 的 9 个 delta 占位
  // Week 1 从 eventEngine.ts 迁移时填入
};

export const COMPETITION = {
  // shouldLoseToRival 的 8 个 signal + 6 项组合
  // Week 1 从 competitionEngine.ts 迁移时填入
};
```

---

## 附录 C — eventStore.ts 完整骨架

```typescript
// src/selling-houses/domain/events/eventStore.ts
import type { GameState } from '../models';
import type { WorldEvent } from './eventKinds';

export function createEventStore(): WorldEvent[] {
  return [];
}

export function record(
  world: GameState,
  ev: Omit<WorldEvent, 'id' | 'day'>,
): WorldEvent {
  const seq = world.eventStore.length + 1;
  const full: WorldEvent = {
    id: `${world.day}-${String(seq).padStart(4, '0')}`,
    day: world.day,
    ...ev,
  };
  world.eventStore.push(full);
  return full;
}

export function eventsByDay(world: GameState, day: number): WorldEvent[] {
  return world.eventStore.filter(e => e.day === day);
}

export function eventsBySubject(world: GameState, subjectId: string): WorldEvent[] {
  return world.eventStore.filter(e => e.subjectId === subjectId);
}

export function eventsByKind(
  world: GameState,
  kind: WorldEvent['kind'],
): WorldEvent[] {
  return world.eventStore.filter(e => e.kind === kind);
}

// ——Dev-only 一致性校验——
// 在 tick 末尾抽查，发现 scalar 与事件流偏差 > 2 时 console.warn
export function verifyConsistency(world: GameState): void {
  if (!__DEV__) return;
  // 随机挑一个 case 的 trust，对照事件流重建
  const caseItem = world.cases[Math.floor(Math.random() * world.cases.length)];
  if (!caseItem) return;
  const trustEvents = world.eventStore.filter(
    e => e.subjectId === caseItem.id
      && (e.kind === 'trust.gain' || e.kind === 'trust.loss')
  );
  const reconstructed = trustEvents.reduce((sum, e) => sum + (e.amount ?? 0), 50);
  const diff = Math.abs(reconstructed - caseItem.trust);
  if (diff > 2) {
    console.warn(`[EventStore] ${caseItem.title} trust 不一致: scalar=${caseItem.trust} reconstructed=${reconstructed} diff=${diff}`);
  }
}
```

---

## 附录 D — ActionResolver 签名规范

```typescript
// src/selling-houses/domain/engine/actionResolvers.ts

// Week 4 的目标形态
export type ActionResolver<P = unknown> = (
  world: GameState,
  actor: { id: string; kind: 'broker' | 'owner' | 'customer' }, // 现在总是 broker
  params: P,
) => WorldEvent[];  // 返回本次行动产生的事件流（先 collect 不消费）

// 示例：resolveVisit
export const resolveVisit: ActionResolver<{ caseId: string }> = (world, actor, params) => {
  const caseItem = world.cases.find(c => c.id === params.caseId);
  if (!caseItem) return [];

  const emitted: WorldEvent[] = [];

  // Mutation 保留（Week 4 不改行为）
  const trustBefore = caseItem.trust;
  caseItem.trust = clamp(caseItem.trust + BALANCE.visit.trustGain, 0, 100);

  emitted.push(record(world, {
    kind: 'trust.gain',
    subjectId: caseItem.id,
    actorId: actor.id,
    amount: caseItem.trust - trustBefore,
    valueAfter: caseItem.trust,
    title: `上门 → 信任 +${caseItem.trust - trustBefore}`,
  }));

  // …其他 mutation…

  return emitted;
};

// 调用方（Week 4 内不消费返回值）
const events = resolveVisit(world, world.player, { caseId });
// TODO Phase B: const state1 = applyEvents(state0, events);
```

---

**本方案止步于 4 周**。第 5 周开始做什么，由 §9 的决策分支决定，不提前
绑定。
