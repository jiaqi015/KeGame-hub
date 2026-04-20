# 卖房（资产顾问）架构总纲 v1

> **这份是总纲**。展开细节见：
> - `selling-houses-architecture-diagnosis.md` — v3.1 诊断完整证据（本纲 §1 的来源）
> - `selling-houses-world-viewport-architecture.md` — 世界-视口完整论证（本纲 §2 的来源）
> - `selling-houses-iteration-plan.md` — 6 周执行手册（本纲 §5 的来源）
>
> 如果以下结论之间有冲突，以总纲为准。

---

## 0. 为什么有这份总纲

此前 3 份 md 各自成立但分散：诊断不告诉你做什么，主张不告诉你怎么开始，
迭代手册不解释为什么要改。加上 18 份历史 md 中存在**被推翻的 shadow city**、
**漏掉的 Matter 事项系统**、**陈旧的云端优先焦点**，任何人接手都会撞车。

总纲做四件事：
1. 把"看到什么 / 怎么想 / 往哪走"压到一页可记住的体量
2. 登记 Q1-Q8 八个决策，未来讨论以此为锚
3. 合并旧 md 的有效信号（Matter、评分数字、8 类结局、durable-decisions）
4. 给新加入的人一份"3 分钟读完 + 能判断任何 PR 是否跑偏"的判据

---

## 1. 一页现状诊断

**病症**：每个好想法走到 60% 就停。

- 事件流只在 budget.ts（80 行）是真的，其他地方是滚动文本 + 硬写 snapshot
- Shadow city 被降级为 scenarioSnapshot 适配层，仍被 4 级深度访问
- `buildLegacySnapshot` 是 90 行永久性适配器，`normalizeCase` 是防御性 fallback
- `updateDerivedState` 每次 setState 走 O(cases × opportunities)
- Case 是上帝对象：`trust / patience / urgency / askPrice / bottomPrice` 挂 Case，真实归属是 Owner
- Customer 1:1 锁写在 `createOpportunity` 第 101-104 行，一个买家只能对应一个 case
- 6+ 处魔法数：D1/D2/D3 权重 / 谈判 0.46/0.24/0.18/0.16/0.6 / fit 18/4/18/0/24/6 / 0.35 晋级 / activeCount >= 4
- `shouldLoseToRival` 8 signal 6 项加权是唯一真深度；其余竞品系统只算玩家暴露

**根因**：GameState = 玩家的世界。玩家是根，其他一切是玩家的属性。
所以"业主有自己节奏""买家同时看多个房""市场在没人看时运行"这些**必然
需求**都变成补丁，永远装不进 Case 对象里。

证据详见附录 A（`-diagnosis.md`）§1-§11。

---

## 2. 第一性原理：World 第一，Player 是 Viewport

现实：房产市场不因为经纪人观察而运行。业主每天醒来仍有心情、买家每天
都在刷房源、同行仍在竞争。世界是主体。

**玩家（经纪人）= 世界的一个 Actor + 一个观察/操作窗口（Viewport）**，
不是根。

### 2.1 World 的五原子

| 原子 | 含义 | 示例 |
| ---- | ---- | ---- |
| **Actor** | 有 policy 和 agency 的个体 | Broker（玩家）/ Owner（业主）/ Customer（买家）/ Rival（同行）/ Regulator |
| **Relation** | 两个 Actor 间的持续关系状态 | `Customer × Case` 的 intent / confidence / stageIndex（= 当前 Opportunity 对象） |
| **Event** | 时间点上发生的瞬时事实 | `trust.gain / opportunity.advanced / matter.completed` |
| **Environment** | 无主的场域/制度/市场 | `Channel / District / Market / PolicyClimate` |
| **Matter** | 带状态机的工作项（见 §2.3） | "见王叔 → 谈底价"、"带小李看 A 房"、"做竞品调研" |

> **为什么 Matter 是独立原子而不是 Relation**：Matter 有状态机（pending
> → in_progress → completed/abandoned）、有开启关闭时间、可以只涉及一个
> Actor（市场调研）或关联多 Actor（三方协调）。Relation 是无限期的状态
> 连续；Matter 是一次具体的协作事件。混在一起会把 Opportunity 的 7 阶
> 推进逻辑和 Matter 生命周期搅乱——这正是现状的病根之一。

### 2.2 Actor 五要素

```
Actor = { identity, state, perception, policy, agency }
```

- **identity**：稳定 id、姓名、画像 archetype
- **state**：自己的属性（业主：patience/urgency/底价；买家：budget/活跃度）
- **perception**：能看见 World 的哪些部分（= 其 ViewScope）
- **policy**：决策规则（业主：耐心低于 X 撤盘；买家：intent > 82 主动推进）
- **agency**：能产生哪些 Event（业主：降价 / 撤盘；买家：出价 / 流失）

玩家 Broker 和 NPC 只在 **perception 范围**与**policy 复杂度**上有别，
数据结构一致。Q5（"未来玩家可能是任意 Actor"）仅当此条件成立才成立。

### 2.3 Matter 的生命周期（Q6 决策的落地）

```typescript
type Matter = {
  id: string;
  initiator: ActorId;                 // 发起者（通常是玩家）
  subjects: (ActorId | RelationId | CaseId)[];
  template: 'report' | 'negotiate' | 'diagnose' | 'execute';
  stage: 'pending' | 'in_progress' | 'completed' | 'abandoned';
  openedAt: number;                   // day
  closedAt?: number;
  events: WorldEventId[];             // 本 Matter 产生的事件链
  context: Record<string, unknown>;   // 模板专属参数
};
```

**4 类交互模板**（对齐 `game-architecture.md` durable decision）：

| template | 目的 | 典型阶段序列 | 典型产出事件 |
| -------- | ---- | ------------ | ------------ |
| report（汇报） | 告知业主进展 | 约见 → 沟通 → 跟进 | `trust.gain`, `owner.updated` |
| negotiate（博弈） | 推进关键价格/条件 | 接洽 → 试探 → 摊牌 → 落地 | `owner.priceAdjust`, `opportunity.advanced`, `patience.loss` |
| diagnose（诊断） | 诊断房源/客户问题 | 调研 → 分析 → 建议 | `heat.gain`, `qualityStory.gain` |
| execute（执行） | 带看 / 出价 / 签约 | 准备 → 行动 → 反馈 | `opportunity.*`, `deal.closed` |

**动作 → Matter 映射规则**：当前 `ACTION_EXECUTORS` 里每个 action 都归到一类 template。
Week 5-6 实现时，一个 action 要么 open 新 Matter，要么 advance 既有 Matter。
Opportunity 的 stageIndex 推进不再靠 `chance(0.35)` 硬币——而是
某个 Matter 走完特定 stage 触发的事件副作用。

### 2.4 三种 tick 驱动抽象

Q4 "玩家点" 选中 **OnDemand**：`advanceDay()` 是纯函数
`(World, seed) → (World', events, seed')`。另两种（WallClock / Batch）
先不实现但签名预留，Phase C+ 若做观战/多人直接插入。

---

## 3. 决策记录（Q1-Q8）

八个决策一起看才能判断架构路径。任一改动，下面整张表都要重算。

| # | 决策 | 你的答案 | 含义与约束 |
| - | ---- | -------- | ---------- |
| Q1 | 商业化节奏 | 未显式答；由 Q2 推出"12 个月可容忍重构" | 不强推 v3.1 短期补丁 |
| Q2 | 产品终态 | 先单机剧情 | 不做观战 / 多人 / 真陪练；叙事 > 系统开放 |
| Q3 | 世界规模 | 6-8 case 人视角 | 所有循环 O(cases × opportunities) 可承受，不做 spatial index |
| Q4 | Tick 驱动 | 玩家点 (OnDemand) | 不做 WallClock / Batch |
| Q5 | 玩家身份 | 未来可能是任意 Actor | **架构闸门**：新增字段必须归到真正的主人 |
| Q6 | Matter 系统 | 一等公民（World 第五原子） | ActionResolver 签名对齐 Matter 生命周期；+1.5 周 |
| Q7 | Cloud schema | 单机改 state 时同步改 schema | schema 始终可回接单机；每次 state 改动 +0.5 天 migration；+0.5 周 |
| Q8 | Priorities 落点 | 搬 Viewport + Session 持久化 | Session 层新建（世界-视口 §6）；+0.5-1 周 |

**组合后果**：原 4 周迭代 → **6 周**。执行细节见附录 B（`-iteration-plan.md` 扩展版）。

若预算压力需要缩回 4 周：
- 降 Q6→b（Matter 延到 Phase B） = 省 1.5 周，但 Week 4 ActionResolver 签名会再改一次
- 降 Q8→a（priorities 留 state） = 省 0.5-1 周，但违反 Q5 精神
- 降 Q7→a（schema 冻结） = 省 0.5 周，未来接回云端时要迁移

---

## 4. 字段归属审查六级表（Q5 执行工具）

**原则**：每个字段只能属于一个层级。碰到归属错的，经过时顺手改。

| 层级 | 含义 | 现有代表字段 | 目前错挂处 | 修正方向 |
| ---- | ---- | ------------ | ---------- | -------- |
| **World** | 所有 Actor 都看见的客观事实 | `day`, `markets[]`, `channels[]`, `eventStore[]` | eventLog 目前只是 UI 滚动条 | Week 2 建 eventStore |
| **Actor: Owner** | 某业主自己的状态 | 目前无独立对象 | `case.trust/patience/urgency/bottomPrice` | Week 3-5 抽离 Owner |
| **Actor: Customer** | 某买家自己的状态 | `customer.budget*/activity` | 基本对 | 保留 |
| **Actor: Broker** | 玩家自己 | `world.energy/budget/reputation` | 基本对，但散落 GameState 根 | Week 4 收拢到 `player.*` |
| **Actor: Rival** | 同行同行 | `rival.*`（scoring 有但没有 agency） | 只被动 | Phase B 加 policy |
| **Relation: Customer×Case** | 买家-房源关系 | `opportunity.intent/confidence/stageIndex/daysLeft` | 对；但被当成独立实体 | Week 5 改为 Relation |
| **Matter** | 正在进行的工作项 | 尚不存在 | 当前"动作"=Matter 但无容器 | Week 5-6 建模 |
| **Case** | 房源本身 | `heat/layout/tags/askPrice` | 对；但 askPrice 是 Owner 决定的 | Week 3 askPrice 移 Owner |
| **Environment** | 场域 | `channels/districts/rules` | 对 | 保留 |
| **Viewport** | 仅玩家当前视角的派生 | `schedule/priorities/signals/dailyBrief` | 写进 state 树 | Week 4 移出 + Session 层持久化 |

UI 派生文案（title/badge/note/tone）**永远**不进 state 树。在组件里 memo。

---

## 5. 6 周路径总览

每周有一个可验收的赢家。任一周闸门不过，停下来诊断，不进下周。
详细清单（文件列表、代码样板、验收项、风险回退）见附录 B。

| 周 | 标题 | 核心交付 | 对应 Q 决策 | 闸门（必过） |
| -- | ---- | -------- | ----------- | ------------ |
| **W1** | 配置抽离 | `content/balance.ts` 集中所有手感数字（含 scoring 40/35/25、六档目标分、返投系数、谈判权重、fit 权重、0.35 晋级等） | Q2/Q3 | 30 分钟 playtest 与 W0 行为一致；非工程师能独立调数 |
| **W2** | EventStore 双写 + 8 类结局 enum | `budget.ts` schema 泛化；trust/patience/heat/urgency/reputation 双写事件；`buildEndingSummary` 切换数据源 | Q5 | 一局 eventStore > 50 条；结局叙事条目 3x 以上 |
| **W3** | 删 legacy + 砍 1:1 + archetype 二选一 + **同步改 cloud schema** | 删 `buildLegacySnapshot` / `normalizeCase` fallback；选 archetype，cloud 的 `seller_profile_code` 同步改名/迁移；删 Customer 1:1 锁 | Q5 / Q7 | legacy 在代码内清零；cloud schema 对应字段同步完成；同一 customer 可挂多 case |
| **W4** | 拆 god function + **Session 层建立** + priorities 搬迁 | `updateDerivedState` 拆；ActionResolver 签名改 `(world, actor, matter?, params) → events[]`；Session 对象新建并写 localStorage；priorities 搬入 Session | Q5 / Q8 | state 树无 UI 派生；dispatch 耗时 -40%；`any` 在 domain 清零 |
| **W5** | Matter 数据模型 + 4 类模板槽位 | `Matter` 类型与容器；4 类 template 的 stage 机；现有动作映射到 template（不改行为） | Q6 | 每个既有 action 有明确 template；`opportunities[].stageIndex` 推进改为由 Matter 完成触发 |
| **W6** | Matter ActionResolver + Opportunity 降级为 Relation | 动作执行全部走 Matter 生命周期；Opportunity 对象改名 + 语义降级为 Customer×Case Relation 容器 | Q5 / Q6 | Matter 覆盖率 = 100% 既有动作；随机 35% 晋级硬币消除 |

6 周结束后回到本总纲 §7 选下一步。

---

## 6. 不可违反的约束（durable constraints）

摘自 `project-memory/durable-decisions.md` 中与 selling-houses 相关
的 7 条 + `DESIGN.md` 的 UI 约束 + 各旧 md 的产品承诺。这些在 6 周内
**永远不破**：

1. **玩法单位是"事项"不是"动作"**（source: game-architecture.md + durable-decisions §46）→ Week 5-6 Matter 建模直接落地
2. **每个动作都能映射到有来有回的交互模板**（4 类）（source: durable-decisions §46）
3. **房源详情页保持三段式：总览-动作-Tab**（source: DESIGN.md）
4. **动作区双层：建议动作（当前主矛盾优先级）+ 全部动作（可做/不可做及原因）**（source: durable-decisions §54-56）→ priorities 搬 Session 但不消失
5. **5 问法是房源详情稳定观察面**（是谁/业主/能不能打/池子厚不厚/本周处理什么）（source: how-to-play.md + durable-decisions §48-52）
6. **首次面访必须独立完成状态，不能被隐式替代**（source: durable-decisions §57）→ Week 3 删 `normalizeCase` 时 `firstVisitDone` 保留
7. **单房结局的 8 种枚举先于三维评分**（sold_by_you_happy/neutral/regret / sold_by_other / not_sold_no_regret/regret / switch_to_rent / withdrawn_unhappy）（source: listing-lifecycle-design.md）→ Week 2 `EventKind` 纳入 `ending.*` 8 种
8. **禁用"教学 / 训练营 / 刷题"类词**（source: game-positioning.md）；游戏是策略游戏不是培训系统
9. **三维评分权重固定 40/35/25**，六档目标分 55/60/68/72/78/82（source: scoring-system.md）→ Week 1 balance.ts 纳入
10. **难度通过剧本蓝图控制而非单一数字**（5 旋钮：房源数/窗口/竞争耦合/关系脆弱/事件密度）（source: game-positioning.md + generated-scenario-architecture.md）

任何 PR 违反上述任一条，直接打回。

---

## 7. 6 周之后：三个分支

- **Happy（闸门全过，手感 = W0 或更佳，domain 干净度 ≥ 7/10）**
  → 进 **Phase B**：Owner 真正升级为 Actor 拥有自己的 `tickOwners` 循环；
  Customer 同上；Rival 拿到自己的 policy；剧本 blueprint 接入 5 旋钮。
  预计 8-10 周。

- **Stuck（某周反复不过闸）**
  → 写 postmortem，降档：Q6→b 或 Q8→a，回到 4-5 周路径。
  承认短板，继续做能做的。

- **Pivot（Q2 变了：产品转向社区/观战/AI 陪练）**
  → 立即停 W5-W6，回到 `-world-viewport-architecture.md` §10 的 Phase A。
  W1-W4 的产出全部可继续使用。

---

## 8. 旧 md 清单（处置结果）

### 已删除（已被新主干替代）
- `selling-houses-maintainer-market-architecture.md`（shadow city 方案已被 Q2 否决）
- `selling-houses-unified-game-architecture.md`（与 `complete-framework-plan` 重复）
- `selling-houses-complete-framework-plan.md`（整体框架已被总纲 + 领域正文吸收）
- `selling-houses-game-architecture.md`（Matter / 事项主张已被总纲、日结与领域正文吸收）

### 已删除（过时索引 / 已失真）
- `selling-houses-cloud-data-model.md`（Q7b 会同步改 schema，内容需重写）
- `project-memory/current-focus.md`（第一焦点"云端闭环"已过时）
- `project-memory/current-state.md`（定性"从单机走向云"与 Q2 相反）

### 保留并按总纲更新（长期文档）
- `selling-houses-game-positioning.md`（北极星 / 禁用词仍生效）
- `selling-houses-generated-scenario-architecture.md`（5 旋钮难度模型）
- `selling-houses-how-to-play.md`（5 问法）
- `selling-houses-listing-lifecycle-design.md`（8 类结局）
- `selling-houses-scoring-system.md`（权重数字去 balance.ts 后仍可参考）
- `selling-houses-business-facts.md`（业务事实总表）
- `selling-houses-business-language-guide.md`（页面、事件、建议和投影解释的业务语言口径）
- `platform-account-player-run-score-architecture.md`（平台账号、玩家、局、得分、总分和榜单的数据边界）
- `selling-houses-customer-opportunity-architecture.md`（客户与机会推进）
- `selling-houses-deal-fact-and-closing-model.md`（成交事实、成交概率、成交记录和结算消费路径）
- `selling-houses-competition-and-cosale-architecture.md`（竞争与联卖）
- `selling-houses-matter-template-architecture.md`（Matter 模板）
- `selling-houses-projection-architecture.md`（投影体系）
- `selling-houses-archetype-architecture.md`（业主与客户类型）
- `selling-houses-time-architecture.md`（时间架构）
- `project-memory/durable-decisions.md`（本纲 §6 的来源，继续权威）
- `project-memory/handoff-checklist.md`（接入新 md 清单）
- `project-memory/module-map.md`（代码落点索引）
- `DESIGN.md`（UI 约束）
- `MEMORY.md`（项目级索引）
- `src/selling-houses/domain/README.md`（与 §2.1 最接近，值得对齐）

### 角色转变（作为总纲的附录继续存在）
- `selling-houses-architecture-diagnosis.md` → 附录 A（证据）
- `selling-houses-world-viewport-architecture.md` → 附录 C（详细论证，非必读）
- `selling-houses-iteration-plan.md` → 附录 B（6 周手册，Week 5-6 新增）

---

## 9. 总纲未涵盖（Phase B+ 或单独立项）

- Matter 4 类模板已经有架构定义；DSL 与编辑器仍属 Phase B
- Owner / Customer / Rival 各自的 tick 循环（Phase B）
- 剧本 blueprint 的 5 旋钮编译（Phase B）
- 观战 / 多人 / AI 陪练（Phase C+，需先回答 Q2 变更）
- 云端同步的冲突解决策略升级（Q7 锁定后单独立项）
- UI 组件树重构（单独立项，不在架构目标上）

---

## 10. 使用说明

- **每次做架构决策前**：先过 §3（Q1-Q8）与 §6（durable constraints），
  看答案是否需要调整
- **每次 code review**：过 §4（归属表）与 §6（约束），有违反直接打回
- **每次 playtest 后**：对照 §5 的本周闸门，闸门不过不推进
- **每次想新写一份 md**：先问"是否能作为本纲某一节的延伸？"
  能的话改本纲 + 附录；不能的话说明方向有新变化，先改 §3

---

**版本**：v1（2026-04-19）
**下次更新触发条件**：Q1-Q8 任一答案变化 / 进入 Phase B / §6 约束变更
