# 《我是王牌资产顾问》设计鉴赏

> 一份针对 selling-houses 模块的全栈解读：世界模型 / 资源体系 / 引擎家族 / 编排时序 / 评分回路。
> 写作姿态：把这套代码当作一份已落地的设计稿来读，而不是当作业务系统去验收。
> 数据来源：基于 `/Users/jiaqi/Documents/开放日测算/src/selling-houses/**` 的全文 CR，所有断言带 `file:line` 索引。

---

## 第 1 章 · 概览：这是一台什么样的机器？

### 1.1 一句话定位

这是一台 **以"21 天经营周期"为骨架、以"客户漏斗 + 业主关系"为双引擎、以"市场—竞品—公司—客户"四方压力为外环境** 的全状态确定性模拟器。玩家是一个二手房经纪人，每天用有限的精力和推广金，在多套房源、多个客户、多家竞品之间分配注意力，争取在窗口关闭之前把房子卖出去。

它不是一个回合制策略游戏，也不是一个数值养成游戏；它更像一台 **小型的代理人市场仿真**——所有 NPC（业主、客户、对手店、商圈、公司）都有自己的态势变量，每天独立 tick，玩家的动作是这台仿真的众多输入源之一。

### 1.2 五层架构鸟瞰

```
┌─────────────────────────────────────────────────────────────┐
│  Interfaces / UI                                            │
│  Dashboard · Cases · Customers · Market · ResultOverlay …   │
└──────────────────────────▲──────────────────────────────────┘
                           │ 投影（projections，每 tick 重算）
┌──────────────────────────┴──────────────────────────────────┐
│  Application                                                │
│  gameTransitions · todayPlan · scenarioOpening · cloudSync  │
└──────────────────────────▲──────────────────────────────────┘
                           │ 不可变状态转移（clone → mutate → return）
┌──────────────────────────┴──────────────────────────────────┐
│  Domain — World Model                                       │
│  Case · Opportunity · Customer · Market · Rival · Group …   │
└──────────────────────────▲──────────────────────────────────┘
                           │ 引擎按序读写
┌──────────────────────────┴──────────────────────────────────┐
│  Domain — Engines                                           │
│  market · case · customer · opportunity · competition       │
│  · company · rivalListing · rivalStore · event · matter     │
│  · dealClosing · actionResolvers …                          │
└──────────────────────────▲──────────────────────────────────┘
                           │ 配置驱动
┌──────────────────────────┴──────────────────────────────────┐
│  Domain — Config                                            │
│  baseRules.ts · balance.ts · difficultyProfiles.ts          │
│  · scenarioBlueprints.ts · WEEKLY_ROUTINE                   │
└─────────────────────────────────────────────────────────────┘
```

五层之间的契约非常清晰：**配置驱动引擎，引擎读写模型，应用层做不可变状态转移，UI 只看投影**。这是相当干净的 DDD 实现，比绝大多数业务系统的分层都要严肃。

### 1.3 引擎家族关系图

把 `engine.ts` 的 `resolveOneDay()` 翻译成数据流图（具体顺序见 §5.1）：

```
                   ┌─→ market (商圈脉冲)
                   │   └─→ rivalStore / rivalListing (对手活跃度)
                   │       └─→ companyPressure (公司共享客群)
            外环境  │
              ↓    ┘
   ┌──────► customer  ─────────► opportunity
   │  (客户态)              (客户机会漏斗)
   │   ↑                        │
   │   └── customerFeedback ←───┘
   │              │
   │              ▼
   └─── case  ←── competition (竞品压力, shouldLoseToRival)
        (业主态/房源态)         │
              ▲                 ▼
              │            dealClosing (议价 / 成交判定)
              └─── actionResolvers (玩家 15+ 个动作)
                       │
                       ▼
                  matter / schedule / priority (UI 待办)
```

外环境（市场、竞品、公司）先 tick → 客户和机会基于新环境推进 → 房源（业主侧）承受所有反馈 → 议价桌做最终成交判定。**注意所有箭头不是依赖关系，是 tick 顺序**——后面跑的引擎读的是前面引擎写完的快照。这套排序不是随意的，它隐含了一条因果假设："世界先变，人再反应，最后才是交易"。

### 1.4 难度配置：一张交接表

在深入之前，先把"调难度"这件事的接口面摊开。这是接手项目的第一份必备清单。

#### 1.4.1 难度档位（`difficultyProfiles.ts`）

| 档位 | 名称 | 房源数 | 目标分 | 初始资金 | 窗口区间 | 信任区间 | 关键特征 |
|---|---|---|---|---|---|---|---|
| warmup | 热身局 | 3 | 58 | 24 | 10–16 | 62–74 | 对手能力 ×0.75 / 客源 ×1.15 |
| easy | 入门局 | 4 | 64 | 22 | 8–14 | 58–70 | 漏斗推进 ×1.08 |
| standard | 标准局 | 5 | 72 | 18 | 7–12 | 54–66 | BASE_RULES 基准 |
| advanced | 进阶局 | 5 | 78 | 17 | 6–10 | 51–63 | 客源 ×0.9 / 对手 ×1.33 |
| hard | 困难局 | 6 | 84 | 16 | 5–8 | 49–61 | 对手 ×1.46 / 市场事件 ×0.32 |
| extreme | 极限局 | 6 | 88 | 14 | 4–7 | 46–58 | 客户停滞 ×1.4 / 全压满 |

来源：`difficultyProfiles.ts:122-356`。注意 maxDay 在所有档位都是 21（baseRules.ts:24），档位本身只调"压力"和"资源"，不调"周期长度"。

#### 1.4.2 三层调参面板

| 层 | 名称 | 调什么 | 注入路径 |
|---|---|---|---|
| L1 | `DifficultyProfile.ruleAdjustments` | 全局 rules（初始资金、市场事件概率、对手压力倍率…） | `mergeRules()` 合并到 `state.rules` |
| L2 | `DifficultyProfile.outcomeControl` | 成交容量、玩家/对手成交期望、漏斗推进倍率 | `state.rules.outcomeControl` 被多个引擎读取 |
| L3 | `BLUEPRINT.ruleAdjustments`（场景级） | 蓝图特定的小幅微调 | 同 L1，优先级更高 |

合并优先级：**Blueprint > Profile > BASE_RULES**。三层都不动 `BALANCE.ts`——`BALANCE` 是全局硬编码常量，所有难度共用（这是个值得讨论的设计选择，见 §7）。

#### 1.4.3 OutcomeControl：一组真正的"难度旋钮"

`outcomeControl` 是这套系统最具仿真感的一块设计。它直接说："本周期市场只允许成交 N 套，其中你预期拿 M 套，对手拿 K 套"——以容量分配的方式控制成交，而不是单纯调一个概率。

| 参数 | warmup | easy | standard | advanced | hard | extreme | 含义 |
|---|---|---|---|---|---|---|---|
| `marketDealCapacity21d` | 5 | 5 | 4 | 4 | 3 | 3 | 21 天市场总容量（同一商圈最多卖几套） |
| `playerBaseDealExpectation21d` | 2 | 2 | 1 | 0.68 | 0.7 | 0.66 | 玩家保底成交期望 |
| `playerLeadSupplyScale` | 1.15 | 1.15 | 1.0 | 0.9 | 0.9 | 0.85 | 被动客户供给倍率 |
| `playerFunnelProgressionScale` | 1.08 | 1.08 | 1.0 | 0.86 | 0.85 | 0.78 | 客户漏斗推进倍率 |
| `playerDealClosingScale` | 1.0 | 1.0 | 0.84 | 0.72 | 0.78 | 0.76 | 议价成功概率倍率 |
| `customerStagnationScale` | 0.85 | 0.85 | 1.08 | 1.25 | 1.25 | 1.4 | 客户停滞/疲劳倍率 |
| `rivalDealShareScale` | 0.75 | 0.75 | 1.15 | 1.33 | 1.46 | 1.45 | 对手抢盘倍率 |
| `rivalCaseLossScale` | 0.65 | 0.65 | 1.08 | 1.28 | 1.18 | 1.32 | 失盘概率倍率 |

这张表是"调难度第一去看的地方"。它们最终被各引擎用 `state.rules.outcomeControl.X` 读取，乘到对应的概率/速率上。

#### 1.4.4 哪些参数 **没有** 接入难度

| 字段 | 文件:行 | 现状 |
|---|---|---|
| `stageAdvanceIntentThreshold = 82` | balance.ts:72 | 全档位共用 |
| `stageAdvanceChance = 0.35` | balance.ts:73 | 全档位共用（但乘 `funnelProgressionScale`） |
| `untouchedIntentLoss = 4` | balance.ts:71 | 全档位共用 |
| `lossIntentThreshold = 32` | balance.ts:75 | 全档位共用 |
| `negotiation.trustGate = 60` | balance.ts:127 | 全档位共用 |
| `WEEKLY_ROUTINE` 精力曲线 | constants.ts:125 | 全档位共用 |
| `BALANCE.competition.rivalLoss.*` 27 个常量 | balance.ts:201–233 | 全档位共用 |

简言之：**漏斗机制的核心阀门、议价信任门槛、精力节奏，目前都是难度无关的硬常量**。这是后续调优时最值得讨论的边界。

### 1.5 一份从源代码出发的判断

把这台机器的特征摘成五点：

1. **确定性优先**：所有 RNG 走 `world.rng` seed，同 seed 同 opening 必复现。
2. **信号丰富，反馈稀疏**：状态变量极多（每个 Case 50+ 字段、每个 Opportunity 30+ 字段），但写到 UI 的反馈只有 `logEvent` 文本和指标条；玩家很难看见自己改动了什么。
3. **多维难度，单点瓶颈**：`outcomeControl` 8 个倍率给了精细的难度面板，但 §1.4.4 那批常量没纳入，意味着难度档位无法触达漏斗最深的瓶颈。
4. **架构干净**：DDD 五层分得清楚，不可变状态转移、脏范围追踪、投影分离，能看出有人认真在做。
5. **仿真层完成度高于反馈层**：从代码量上 domain 层 ~8000 行，UI 投影 ~1500 行——典型"模拟先于体感"的项目阶段。

---

> **第 1 章亮点卡**
> - **三层调参面板**：rules / outcomeControl / blueprint。
> - **8 旋钮 outcomeControl**：用容量分配控制成交，而不是单纯调概率。
> - **当前难度边界**：漏斗主阀门、信任门、精力节奏均未接入难度。
> - **机器特征**：确定性 + 多变量仿真 + 反馈稀疏。

---

## 第 2 章 · 世界模型：实体的拓扑学

这一章只讲"游戏里有什么"，不讲"它们怎么动"。后者交给第 4 章。

### 2.1 GameState：所有故事的容器

`GameState`（`models.ts:1422-1481`）是顶层状态。它不只是一个 DTO，它的字段布局本身就在讲一个故事：

```
GameState
├── 元信息：runId, version, localRevision
├── 时间轴：day, maxDay, currentDate
├── 资源：energy/maxEnergy, cash, auxiliaryStats（成交统计）
├── 五大集合：
│   ├── cases[]              你的房源
│   ├── opportunities[]      你的客户机会
│   ├── customers[]          客户人设池（静态）
│   ├── customerStates[]     客户运行时（动态）
│   └── markets[]            商圈
├── 竞争：competitionGroups[]（同类房源耦合）
├── 影子层：marketShadow（rivals + signals + inboundQueue）
├── 日程：schedule, priorities, matters, todayPlan, focusMeeting
├── 事件：eventLog（UI日志） + eventStore（结构化）
├── 规则：rules（含 outcomeControl）
└── 派生：metrics, currentReport, finalResult
```

**值得圈出的设计：**

- **客户和客户运行时分离**：`customers[]` 是静态人设（preferences、budget、activity），`customerStates[]` 是运行时（interest、fatigue、churnRisk、对每套房的 `caseStates[caseId]`）。这是工程上少见但语义上正确的分层——同一个"林老伯"在不同剧本里人设不变，只有运行时变。
- **marketShadow（影子层）**：竞品、市场信号、回流队列都放在这里。命名"影子"不是修辞，它对应游戏里 Opportunity 的 `visibility: 'shadow' | 'revealed'` 概念——玩家有些信息是不可见的。
- **eventLog vs eventStore 双轨**：前者给 UI 阅读（`logEvent` 写入），后者给系统溯源（`recordDomainEvent` 写入，结构化、带 caseId/opportunityId/customerId 关联）。`logEvent` 内部其实会调一次 `recordDomainEvent`（runtimeState.ts:53-71），所以 UI 文本永远是结构化事件的子集。

### 2.2 Case：50 字段的房源人格

`Case` (`models.ts:853-916`) 是这套系统里字段最多的实体。把它的字段按语义分组后是这样：

#### A. 物理属性（写入即固定）
`id, title, community, district, layout, area, marketCellId, housePrototypeId, story, tags[], defects[], axisScores{}`

`axisScores` 是房源在多个维度（layout/light/floor/decor/amenity/neighborhood/structure）上的 0–100 分，由蓝图决定，整局不变——它是 **D2（房源品质）** 的全部输入。

#### B. 价格三元组
`askPrice / marketPrice / bottomPrice`

`askPrice` 是业主报价（玩家可商讨），`marketPrice` 是市场参考价（每天 ±3 浮动），`bottomPrice` 是业主底线（隐藏，只能问出）。玩家做调价动作时，新 `askPrice` 不能跌破 `bottomPrice`（actionResolvers.ts 内 `adjust-listing-price` executor）。

#### C. 关系五元组
`trust, patience, heat, urgency, competitiveness`

| 字段 | 含义 | 关键阈值 |
|---|---|---|
| trust | 业主对你的信任 | < 60 议价被拒（balance.ts:127） |
| patience | 业主耐心 | 7 天无进展 −2（baseRules.ts:45-46） |
| heat | 房源热度 | 决定客户 intent 增长（heat-55）/10 |
| urgency | 业主急迫 | 影响议价权重（urgent → trust 权重 0.25 vs 0.18） |
| competitiveness | 综合竞争力 | 由 d1/d2/d3 加权（scoring.ts） |

这五个字段实际上是 **业主的情绪面板**，而 d1/d2/d3 是它的 **能力面板**。两者分离得很清楚。

#### D. 三维竞争力（d1/d2/d3）
`d1（故事力/客户线）, d2（房源品质）, d3（业主配合度）`

这是这套系统最核心的概念之一。每天由 `updateCompetitiveness()`（scoring.ts:5-48）重算，且**保留最近 10 次快照**，让 UI 可以画出"这套房的竞争力曲线"。

每个维度都有自己的信号组件（详见第 6 章）：
- **D1**：池子大小、活跃接触数、漏斗后段厚度、推进速度、停滞惩罚 — 5 个信号
- **D2**：7 个房源 axis 加权 — 与玩家无关（房源品质）
- **D3**：价格弹性、耐心、紧迫、信任、一致性 — 5 个信号

#### E. 推进 & 互动
`status, windowDays, stageIndex, stageLabel, hasCompletedFirstVisit, goalTier, actionsToday, touchedToday, touchedOwnerToday, lastTouchedDay, lastOwnerTouchedDay, lastAction, viewings, offers, openDayCooldown`

`goalTier`（core / important / normal）是结算时的权重分配——核心房不保住，分数会被狠拉。

#### F. 业主 & 维护
`ownerName, ownerMood, ownerArchetypeId, maintainerName, personality`

业主性格（personality）有三种：`pragmatic / emotional / urgent`，由 `OwnerArchetype.id` 推导（generator.ts:6-16）。这三种性格在好几个引擎里都会查表，例如：
- `dealClosing.ts`：urgent 业主在议价时 trust 权重 0.25（其他 0.18）
- `marketEngine.ts`：emotional 业主未触摸时热度 −4（其他 −2）

#### G. 结局信息
`storylineState, relativeOutcome, ownerSatisfaction, defenseOutcome, endingType, endingBucket`

游戏结束时填充，由 `resultEvaluation.ts` 一系列 resolver 函数计算。**8 种 endingType + 3 桶 endingBucket** 是这套系统对"局末叙事"的承诺：每套房都有一个能写一段话的结局。

### 2.3 Opportunity：客户机会的漏斗状态

`Opportunity` (`models.ts:1081-1109`) 是 `(case, customer)` 的二元关系实例。它和 `Case` 一起构成"销售漏斗"。

7 个 stage：`线上咨询 → 有意向 → 预约首次看房 → 已看房 → 再次看房 → 见面沟通 → 出价`（constants.ts:10）。从 0 推到 6 要走 6 步。

关键字段：

| 字段 | 含义 | 关键值 |
|---|---|---|
| `intent` | 购买意向（0–100） | ≥ 82 才能推进 stage（balance.ts:72） |
| `confidence` | 交易自信度 | 用于议价计算 |
| `fit` | 与房源匹配度 | 由 BALANCE.opportunities.fit 计算 |
| `daysLeft` | 决策窗口 | 推进 stage 后重置为 5（balance.ts:74） |
| `stagnationTicks` | 停滞计数 | ≥ 3 时 lifecycleStatus 改成 stagnated |
| `leadSource` | direct / broker | 影响公司压力惩罚 |
| `visibility` | shadow / revealed | 影响竞品判断 |
| `pendingClosingEvaluation` | 是否进入议价桌 | dealClosing.ts 的入口 |

**Visibility 的妙处**：`shadow` 表示这条线索玩家自己掌握、对手不知道；`revealed` 是已经在市场曝光（参见 `competitionEngine.ts:22-27` — broker shadow leads 多于 2 条会触发"被对手抓住空档"的判定）。这是把"商业机密"用一个枚举建模出来的简洁做法。

### 2.4 Customer：人设 vs 运行时双轨

`CustomerProfile`（`models.ts:474-486`）是静态人设：预算、户型偏好、活跃度、紧迫度、价格敏感度。一局开局后不变。

`CustomerRuntimeState`（`models.ts:513-524`）是运行时：

```
CustomerRuntimeState
├── status: idle | browsing | comparing | engaged | negotiating | lost | converted
├── decisionStyle: decisive | balanced | hesitant
├── advisorTrust（对你的信任）
├── fatigue（看房疲劳）
├── churnRisk（流失风险）
├── activeCaseIds[]（同时在看的房源）
└── caseStates[caseId] → { fit, interest, confidence, stageIndex, viewed, offered, selected, competingCaseIds[] }
```

`caseStates` 是 Record，意味着 **同一客户对每套房有独立的兴趣/信心/阶段**。这才是真正的"客户在比较多套房子"的建模——而不是简单地把客户绑定到一个机会上。

`decisionStyle` 由 `customerEngine.ts:8-16` 决定：
- urgency ≥ 76 AND activity ≥ 72 → decisive
- priceSensitivity ≥ 72 OR activity ≤ 54 → hesitant
- 其他 → balanced

`decisionStyle` 决定了客户阶段推进的阈值（customerEngine.ts:175-180）：
- decisive → interest ≥ 64 即可推进
- balanced → interest ≥ 70
- hesitant → interest ≥ 78

**这是一组"性格 → 行为参数"的优雅映射**：客户人设没有写死客户行为，而是把性格压成几个连续值，再让运行时的判断从这些值导出 `decisionStyle`，由 style 决定具体阈值。这层间接让人设设计有了延展性。

### 2.5 双轨 Stage 的隐藏问题

⚠️ **这里有一个值得指出的设计张力**：客户运行时也有一个 `caseStates[caseId].stageIndex`（见 customerEngine.ts），最大到 5；而 `Opportunity.stageIndex` 最大到 6（出价）。两者并行存在但不强同步。

成交逻辑只看 `Opportunity.stageIndex`（dealClosing.ts），这意味着 **"客户对房源的兴趣推进"和"机会能否进入议价桌"是两套独立的 stage**。客户侧的进展不会自动翻译为机会侧的进展。

这套双轨设计的优点是：客户可以同时对多套房保有不同程度的兴趣（`caseStates` 是 Record）；缺点是：玩家做客户向动作时，可能感觉"客户已经对这房子很感兴趣了"，但 Opportunity 的 stage 还没动，议价仍然进不了。

### 2.6 Market / Rival / Competition：四方外环境

#### MarketCell（商圈）
`models.ts:464-472`。每个商圈有：

```
demandHeat（需求）, supplyPressure（供应）, competitivePressure（竞争）
sentiment（情绪）, monthlyFactors[12]（季节调整）
```

每天由 `marketEngine.updateMarkets()` 用 `wave(day, offset) * pulseScale + random(-2, 2)` 这种正弦+噪声组合更新（balance.ts:148-160），保证既有节奏感又不机械。

#### CompetitionGroup（竞品组）
`models.ts:579-585`。这是 **同类房源之间的耦合**：

```
priceElasticity: 0.86–1.33（一套调价影响其他几套的力度）
customerSpillover: 0.38–0.68（一套热度跌时多少客户分流到组内其他）
```

蓝图定义三种竞争拓扑：`paired_pressure`（同商圈 ≤3 套配对）/`district_clusters`（同商圈全组队）/`chain_clusters`（全部强耦合，extreme 用）。**调价动作通过这个组耦合扩散到其他房源** —— 这是这套系统里最有"江湖感"的一笔。

#### RivalStore + RivalListing（对手门店和对手房源）
`models.ts:649-678`。对手不是单一抽象，而是：

- **RivalStore**：门店级别，有 `style`（aggressive / steady / relationship / traffic）、`leadCapturePower`、`sellerInfluencePower`、`pricingPressurePower`、`activityHeat`
- **RivalListing**：对手某套具体房源，有 `leadSiphonPower`（吸客力）、`ownerAnchorPower`（影响业主锚定）、`storyStrength`（卖点强度）

`competitionEngine.shouldLoseToRival()`（competitionEngine.ts:9-94）的判定逻辑也很丰富：6 类"可见滑落"信号（urgentOpening / relationshipOpening / trustCollapse / coldAndNeglected / pipelineOpening / priceAndPressureTrap）任一触发，加上"对手有机会"，再扣去"近期维护过"的保护，最后才进入概率计算。

### 2.7 时间维度：21 天 × WEEKLY_ROUTINE

`maxDay = 21`（baseRules.ts:24），3 周。每天有一个固定主题（constants.ts:125-189）：

| 周几 | 主题 | 精力 | 推荐方向 |
|---|---|---|---|
| 周一 | 业主反馈 | 8 | weekly-feedback / pricing-advice |
| 周二 | 休假整理 | 1 | 只补关键漏 |
| 周三 | 内部会议 | 4 | 判断房源/客户优先级 |
| 周四 | 聚焦会 | 3 | focus-meeting-submit |
| 周五 | 找带看 | 5 | showing / private-referral |
| 周六 | 集中带看 | 6 | showing / open-day |
| 周日 | 集中带看 | 6 | 同周六 |

精力周总和 33 点，三周共 99 点（playtest 显示具体某天有 ±1 浮动，可能由 RNG 微调）。**这是一个用日历建模而不是用回合建模的设计**——精力起伏对应真实工作节奏（周一情绪日、周中策略日、周末执行日）。

---

> **第 2 章亮点卡**
> - **业主情绪 vs 房源能力分离**：trust/patience/heat/urgency 是情绪面板，d1/d2/d3 是能力面板。
> - **客户人设 vs 运行时双轨**：CustomerProfile 不变，CustomerRuntimeState 才是真正"在玩"的客户。
> - **客户 stage vs 机会 stage 双轨（设计张力）**：客户运行时进展不会自动同步到 Opportunity，议价只看后者。
> - **Visibility = shadow/revealed**：把"商业机密"做成枚举，干净利落。
> - **Competition Group 的耦合**：调价能通过组扩散，"江湖感"从这里来。
> - **WEEKLY_ROUTINE**：日历驱动而非回合驱动，节奏更真实。

---

## 第 3 章 · 资源体系：21 天的预算约束

经营游戏的灵魂是预算约束。这一章把所有"可消耗资源"摆出来。

### 3.1 三种资源 + 一种伪资源

| 资源 | 容器 | 补给方式 | 21 天总量（standard） | 文件 |
|---|---|---|---|---|
| 精力 | `state.energy / maxEnergy` | 每天根据 WEEKLY_ROUTINE 重置 | ~99 点 | engine.ts:388-390 |
| 推广金 | `state.auxiliaryStats.promotionBudget` | 初始 + 每周末 +4 | 18 + 12 = 30 点 | engine.ts:300-310 |
| 时间 | `state.day` | 每天 +1 直到 maxDay=21 | 21 天 | engine.ts:321 |
| 关系窗口 | `case.windowDays` | 不主动补给，靠维护减缓衰减 | 初始 7–12（standard） | marketEngine.ts:152-177 |

最后一项不是真正的"资源"——它是 **每套房自己的状态变量**，但表现得像稀缺资源（一旦归零房源进入续期判定）。

### 3.2 精力的日历曲线

精力 **不是均匀回血**。`engine.ts:388-390` 在每天结束时根据 `WEEKLY_ROUTINE[getDayOfWeek(day)]` 直接覆盖式重置 `maxEnergy` 和 `energy`：

```
周一 8 → 周二 1 → 周三 4 → 周四 3 → 周五 5 → 周六 6 → 周日 6
```

这个曲线给了玩家一个 **节奏感**：周一要重点处理业主反馈（高精力日），周二只能补漏（资源枯竭日），周三/周四是策略和聚焦会，周末执行带看。它对应的是真实经纪人的工作节奏。

**有趣的副作用**：周二只有 1 点精力，这意味着你周一/周日没安排好的事，周二就只能放弃一件——精力本身在做"重要性筛选"。

### 3.3 推广金：周补给 + 高成本节点

15 个动作的成本表（actions/definitions.ts）：

| 动作 | 精力 | 推广金 | 用途 |
|---|---|---|---|
| first-visit / weekly-feedback / deep-diagnosis | 1 | 0 | 业主关系 |
| story | 1 | 0 | 卖点重构 |
| pricing-advice / ask-psychological-price / adjust-listing-price | 1 | 0 | 价格三件套 |
| sincerity-sale / invite-customer-negotiation | 1 | 0 | 议价桌 |
| showing | 1 | 0 | 带看 |
| focus-meeting-submit | 1 | 0 | 周四提报 |
| **xiaohongshu-boost** | 1 | **2** | 小红书 |
| **broker-broadcast** | 1 | **3** | 经纪人投放 |
| **private-referral** | 1 | **2** | 私域转介 |
| **open-day** | **2** | **5** | 开放日（双高成本） |

**只有 4 个动作消耗推广金，且 open-day 是绝对的预算杀手**（5 点 ≈ 全周补给的 1.25 倍）。这意味着推广金主要约束的是 **"获客投放节奏"**——业主关系、价格谈判、议价桌都是免费的。

### 3.4 windowDays：最稀缺的资源

window 是 **每套房独立的倒计时**，而且只衰减不补给：

- 每天 −1（marketEngine.ts，tickCases）
- 7 天无业主进展额外 −2（baseRules.ts:45-46 `ownerPatienceDecayAfterDays`）
- 触底（≤0）触发续期判定（marketEngine.ts:152-177）：
  - `trust ≥ 76 && d3 ≥ 62 && ownerSatisfaction !== 'unhappy'` → 重置为 4 天，但 trust −6
  - 否则 → 房源 withdrawn

**这是整套资源系统里玩家压力最大的一项**：standard 难度初始 7–12 天，每天都在掉，而且需要维护性动作来止血。

### 3.5 资源约束的几何形状

把三种资源画在一个空间里，21 天的 standard 局是这样：

```
          ┌────────────────────────┐
          │  时间：21 天硬上限     │
          │  精力：~99 点          │
          │  推广金：30 点         │
          │                        │
          │  → 精力是 "动作总数限制"│
          │  → 推广金是 "投放节奏限制"│
          │  → window 是 "维护频率限制"│
          └────────────────────────┘
```

如果一局有 5 套房，window 衰减压力 = 5 × 21 = 105 房·天。一次维护性动作（first-visit / weekly-feedback）大致 +2 到 +6 patience 或 trust，以 patience 为例每 7 天 −2 的衰减需要每周至少 1 次维护。**5 套房 × 3 周 × 1 次/周 = 15 次维护，占用 15 点精力**——几乎 1/6 的总精力都得花在"防止衰减"上。这是一个不容忽视的"维护税"。

---

> **第 3 章亮点卡**
> - **精力日历曲线 8-1-4-3-5-6-6**：用节奏建模工作压力，周二是天然的"瓶颈日"。
> - **推广金的二极性**：12 个动作免费，4 个收费（其中 open-day 5 点是预算杀手）。
> - **window 是真正稀缺资源**：只衰减不补给，且决定房源生死，玩家 ~17% 精力要交"维护税"。
> - **没有动作能补精力**：精力是硬上限，不是经济循环。

---

## 第 4 章 · 引擎家族：12 台日常 tick 的小机器

引擎层是这套代码量最大的一块。把它们按职责重排（区别于 §1.3 的数据流图）：

### 4.1 引擎清单（按职责）

| 类别 | 引擎 | 职责 |
|---|---|---|
| 客户漏斗 | `opportunityEngine.ts` | Opportunity 生命周期：创建、推进、流失、关闭 |
|  | `customerEngine.ts` | Customer 运行时：interest/confidence/fatigue/churnRisk |
| 业主 / 房源 | `marketEngine.tickCases()` | 房源每日衰减、window 续期 |
|  | `caseLifecycle.ts` | 失盘标记 |
| 市场 | `marketEngine.updateMarkets()` | 商圈脉冲 |
|  | `market/signalEngine.ts` | 市场信号衰减/补给 |
|  | `market/dailyEventDirector.ts` | 每日市场事件触发 |
|  | `market/inboundOpportunityEngine.ts` | 回流机会落地 |
| 竞品 | `competitionEngine.ts` | 竞品压力 + 失盘判定 |
|  | `rivals/rivalStoreEngine.ts` | 对手门店活跃度 |
|  | `rivals/rivalListingEngine.ts` | 对手房源生成/成交 |
| 公司 | `company/companyPressureEngine.ts` | 共享客群 + 内部转介绍 |
| 事件 | `eventEngine.ts` | 随机 + 计划事件 |
| 议价 | `dealClosing.ts` | 成交评估 + 落锤 |
| 玩家 | `engine/actionResolvers.ts` | 15 个 action executor |
| 派生 | `matterEngine.ts` | matter 卡片生成（衍生，无状态变更） |

12 个真正修改状态的引擎 + 1 个派生卡片生成。每个引擎都是纯函数：传入 `world: GameState`，原地修改特定字段，写日志。没有引擎跨层调用 UI，也没有引擎抛异常。

### 4.2 三道关键公式

整个 21 天经营的"成败"主要由三道公式决定。把它们摆在一起看：

#### 4.2.1 客户意向日推进（opportunityEngine.ts:51-71）

```
intent = clamp(
  intent
    + (heat - 55) / 10              # 房源热度推力
    + (d1 - 50) / 16                # 故事力推力
    + randomInt(-4, 4)              # 噪声
    - max(0, askPrice - budgetMax) / 9   # 价格惩罚
  , 8, 98)

if (!touchedToday) intent -= 4       # 未接触惩罚
```

被触摸时净增长 ≈ +1/天（heat≈58, d1≈50 时），未触摸时净流失 ≈ −3/天。这个不对称是"维护成本"在客户侧的镜像。

#### 4.2.2 阶段推进（opportunityEngine.ts:73-78）

```
if (stageIndex < 6
    && intent >= 82
    && chance(0.35 * playerFunnelProgressionScale))
  stageIndex += 1
  daysLeft = 5
```

**6 段 stage 共用同一道阀门**。intent 必须爬到 82，每天 35% 概率通过——这是这套机制最严苛的设计点。从 intent 50 涨到 82 需要净 +1/天 × 32 天（理论），现实里靠动作 buff（showing +12, sincerity +8, deep-diagnosis +5）才能在 21 天里把 stage 推到 6。

#### 4.2.3 议价成功分（dealClosing.ts:42-47）

```
successScore =
  intent * 0.46
  + confidence * 0.24
  + trust * (urgent ? 0.25 : 0.18)
  + competitiveness * 0.16
  - max(0, askPrice - marketPrice) * 0.6
  + strategy.shift                    # hold:-6, balanced:+4, close:+9

closeProbability = clamp(round(successScore * playerDealClosingScale), 0, 95)

# 阻挡条件（任一为 true 直接置 0）
if (soldPrice > budgetMax)            blockingReasons.push('客户超预算')
if (case.trust < 60)                  blockingReasons.push('业主不信任')
if (marketDealSlots <= 0)             blockingReasons.push('市场容量不足')
if (playerClaimedDeals >= playerAllowedDeals)  blockingReasons.push('玩家配额用完')
```

这条公式的 **阻挡条件比成功概率更狠**：一个 trust < 60 直接让 closeProbability = 0，无论 intent/confidence 多高都不行。**整套 21 天经营的关键约束之一就是 trust 必须在议价那天 ≥ 60**。

### 4.3 一组隐藏的硬性参数：BALANCE.competition.rivalLoss

`competitionEngine.shouldLoseToRival()`（competitionEngine.ts:9-94）是这套系统里 **逻辑最复杂的引擎**。它要先判 6 类"可见滑落"，再判"对手有机会"，再扣"近期维护保护"，最后才进概率公式。

6 类可见滑落（任一触发）：

| 信号 | 条件 |
|---|---|
| urgentOpening | windowDays ≤ 1 OR brokerShadowLeads ≥ 2 |
| relationshipOpening | gap ≥ 4d AND trust ≤ 58 |
| trustCollapse | trust ≤ 36 |
| coldAndNeglected | heat ≤ 24 AND gap ≥ 3d |
| pipelineOpening | (无活跃客户 OR 无合格客户 AND heat ≤ 34) AND (压力 ≥ 16 OR premium ≥ 7.5% OR priceGap ≥ 8.5%) |
| priceAndPressureTrap | (压力 ≥ 18 OR premium ≥ 8.5% OR priceGap ≥ 9%) AND (trust ≤ 48 OR gap ≥ 3d OR window ≤ 2) |

最后概率：

```
rawProbability =
  0.03                                     # 基础
  + pressureOverLine * 0.008
  + max(0, premium - 0.04) * 1.8
  + max(0, priceGap - 0.055) * 1.5
  + brokerShadowLeads * 0.035
  + (windowDays <= 1 ? 0.05 : 0)

probability = clamp(
  rawProbability * rivalLossProbabilityScale * rivalCaseLossScale * maintainedGuard,
  0.005, 0.18
)
```

`maintainedGuard` 在"近 2 天维护过且 trust ≥ 58 且 pipelineOpen"时取 0.6，否则 1。这是"刚维护过的房不容易丢"的具体落地。

**这个引擎的精细程度足以单独写一篇文章**：它不是单一概率，是一组守门员（`visibleSlip` 必须有，`rivalHasOpening` 必须有，`recentlyMaintained` 是缓冲），层层过滤之后才赌一次。

### 4.4 引擎之间的耦合

虽然引擎都是纯函数，但它们通过 `GameState` 互相耦合得相当紧。一个例子：

```
玩家做 adjust-listing-price (deep-cut)
  ↓
actionResolvers.adjust-listing-price
  ↓ 修改 case.askPrice
  ↓
等到下一天 advanceOneDay()
  ↓
1. updateMarkets()         → marketPrice 也基于 demandHeat 浮动
2. tickCases()             → 比 marketPrice 高 5% 触发 overpriced 惩罚
3. progressCustomerDemand()  → customer.interest += priceAdvantage（如果 askPrice ≤ marketPrice * 1.01）
4. tickOpportunities()     → opportunity.intent 因 askPrice/budgetMax 变化重算
5. tickCompetition()       → competitionGroup 的 priceElasticity 把降价影响扩散到组内其他房
6. shouldLoseToRival()     → priceGap 变小 → rivalHasOpening 概率下降
```

一次调价，6 个引擎都会反应。**这套耦合不是 bug，是设计**——它让玩家的每个动作都有"水波效应"。

### 4.5 玩家的 15 把锤子（actionResolvers.ts）

不展开每个 action 的执行细节，但值得指出动作系统的几个分类：

| 大类 | 动作 | 共同特征 |
|---|---|---|
| 业主关系（一日一锁） | first-visit, weekly-feedback, deep-diagnosis, pricing-advice, ask-psychological-price, adjust-listing-price | 共享 `touchedOwnerToday` 锁 |
| 卖点 | story | 单独锁 `lastAction === 'story'` |
| 获客投放 | xiaohongshu-boost, broker-broadcast, private-referral, open-day | 推广金消耗 |
| 客户推进 | showing, sincerity-sale, invite-customer-negotiation | 需要 `findBestOpportunity` 命中 |
| 协作 | focus-meeting-submit | 仅周四 |

**业主关系六件套共享同一把锁**（actionResolvers.ts:628-630）是这套 action 设计里最值得讨论的一笔：玩家每天每套房只能做一件业主向动作。这强制了"业主接触不可堆叠"的现实主义假设——但代价是 6 个动作之间的策略差异变小（早期玩家会发现这 6 个的体感很接近）。

### 4.6 dealClosing 的"市场容量门"

`dealClosing.settlePendingDealClosings()` 还有一道少有人提及的门：**market deal slots**（容量）。

`outcomeControl.marketDealCapacity21d` 在 standard 是 4——意思是 **整个市场 21 天最多成交 4 套**。这个容量被分配给玩家和对手，玩家拿 `playerBaseDealExpectation21d`（standard 是 1），对手拿 `expectedRivalClosedDeals21d`（standard 是 2.7）。

当玩家的成交"配额"用完（`playerClaimedDeals >= playerAllowedDeals`），即使下一次议价 successScore 100，也直接 blockingReason 拒绝。**这是一种"市场已饱和"的硬约束**，比单纯调概率更接近真实业务（一个商圈一年就那么多刚需，谁先签谁拿）。

---

> **第 4 章亮点卡**
> - **三大公式**：intent 日推进、stage 阀门 82、议价成功分 + 4 道阻挡条件。
> - **shouldLoseToRival 的 6 + 1 + 1 守门员设计**：可见滑落 + 对手机会 + 维护保护，最后才进概率。
> - **一动六响**：调价会经过 6 个引擎才走完，水波效应是设计目标不是副作用。
> - **业主接触一日一锁**：现实主义假设，代价是 6 件套差异化变小。
> - **市场容量门**：成交配额是硬上限，比概率更像"商圈有限性"。

---

## 第 5 章 · 编排与时序：一天里到底发生了什么

如果说第 4 章讲的是 **每个引擎在做什么**，这一章讲的是 **它们什么时候做、为什么这个顺序**。

### 5.1 resolveOneDay()：20 步主流程

`engine.ts:261-485` 的 `resolveOneDay()` 是这台机器的心脏。完整顺序：

```
01. 快照 eventStore / closedDeals 长度（用于脏范围追踪）
02. buildExpectations()：当天的"预期背景"

外环境层（先变天）
03. releaseMarketDealSlotsForDay()    释放今天的成交容量
    updateMarkets()                    商圈脉冲
    tickSeasonality()                  季节因子
    rollDailyMarketEvent() + apply     当日市场事件

竞争层
04. tickRivalStores()                  对手门店活跃度
    tickRivalListings() + applyRivalPressure()  对手房源压力

公司层
05. tickCompanyPressure() + applyCompanyPressure()  共享客群压力

客户—机会—反馈三段
06. updateCustomers()                  客户活跃度/紧迫度脉冲
    progressCustomerDemand()           客户需求推进
    applyRivalPullOnCustomers()        竞品对客户的拉力
07. tickOpportunities()                机会日推进
    applyCustomerFeedbackToCases()     客户反馈回写房源

竞争计分
08. tickCompetition()                  竞品压力 + 失盘判定

事件 & 成交
09. fireScheduledEvents()              脚本事件
    settlePendingDealClosings()        议价桌结算

后期对手干预（day ≥ maxDay − 7 才开）
10. tryClaimOpenMarketDealForRivals()  对手最后冲刺

房源 & 客户获取
11. tickCases()                        房源每日衰减、window
12. spawnPassiveLeads()                被动客户进入
    triggerRandomEvent()               随机事件

市场信号收尾
13. settleMarketSignals()              信号过期/补给

派生态（第一次）
14. updateDerivedState()               重算 d1/d2/d3、风险、日程

周期性
15. if (day % 7 === 0) createWeeklyReview() + 周补给推广金

新一天初始化
16. day += 1, currentDate += 1d
    advanceProductRunsForDay()         产品 Run 推进
    重置 energy 和 todayPlan
    maxEnergy = WEEKLY_ROUTINE[day].energy

周四聚焦会
17. if (getDayOfWeek == 4) 算分选 top 2 → 入选房 +12 heat / +4 trust / +3 patience

每日报告
18. 收集 major events
    计算前后 delta
    生成 currentReport
    checkForeshadowing() / generateDailyNarrative()

派生态（第二次）
19. updateDerivedState()  再算一次（确保报告生成后的状态可用）

结束判定
20. if (day >= maxDay || !any(active)) → finishGame() → evaluateFinalResult()
```

### 5.2 顺序背后的因果假设

这个顺序不是随意的，它隐含了一组因果链：

1. **外环境先变**（步 03–05）：商圈脉冲、对手活跃度、公司压力都是 NPC 行为，**它们不该看见玩家今天的动作**。所以最先 tick。
2. **客户根据新环境反应**（步 06）：customer 看到的市场和对手都已是新的。
3. **机会基于客户更新**（步 07）：机会的 intent 公式会读 case.heat 和 d1，但这些是昨天的——意味着 **昨天的房源状态决定今天的机会推进**。
4. **房源承受所有反馈**（步 11，关键）：tickCases 在所有客户/机会/竞争 tick 之后才动，意味着 **今天的客户反馈、竞品压力、客户回流，都在 case 衰减之前已经写入**。
5. **议价在房源衰减前**（步 09 vs 11）：值得注意的是，议价桌（步 09）跑在 tickCases（步 11）之前——说明 **议价用的是"昨晚"的 case 状态**，不是今天衰减后的。这避免了"刚要议价房源就被衰减干掉"的边缘情况。
6. **派生态算两次**（步 14 + 19）：第一次让事件/成交看到的状态完整；第二次让报告/UI 看到的状态完整。两次之间发生了步 15–18 的内容（周补、聚焦会、报告生成），这些动作本身又会改 state，所以再算一次是对的。

这种"双派生"设计让 `updateDerivedState` 的成本翻倍，但保证了 UI 看到的永远是稳定一致的视图。

### 5.3 Application 层：不可变状态转移

`gameTransitions.ts` 是 Application 层的核心。它的设计哲学只有一句话：**所有用户操作都是 (state) → newState 的纯函数**。

```ts
export function advanceGameDays(state, count, onMessage) {
  return transitionGameState(state, (next) => {
    settledResults = advanceDays(next, count, onMessage)
    syncTodayPlanForCurrentDayMutable(next)
  }).nextState
}
```

`transitionGameState` 内部做 `clone(state) → mutate → return`。看起来浪费内存，但收益是：

- **撤销/回放**：每个 state 都是独立快照
- **测试性**：所有引擎可以单独跑，不影响外部
- **脏范围追踪**：clone 前后对比就能知道哪些字段变了

在一个频繁修改 GameState 的引擎集群里，能坚持不可变状态是相当克制的设计选择。

### 5.4 投影层：UI 永远看见的是"已经算完"

`workspaceShellProjection / operatingProjection / resultProjection / leaderboardProjection` 这一层的职责是 **把 GameState 翻译成 UI 数据模型**。

它的关键性质：
- **无副作用**：投影函数只读 state，不修改
- **无缓存**：每次 UI 请求都重新计算
- **针对性**：每个投影负责一种屏幕（工作台、详情、结算、排行榜）

在 21 天 × 一天若干次状态变化的尺度下，每次重算投影并不昂贵。**比起维护增量缓存，重算更安全也更易调试**——这又是一个"以确定性换性能"的取舍。

### 5.5 脏范围追踪：精细到 caseId / opportunityId / customerId

`engine.ts:144-207` 的 `buildDirtyScopes()` 干了一件少见的事：每次 advanceOneDay 后，反向追踪受影响的：

```
DirtyScopeSet {
  cases: Set<caseId>
  opportunities: Set<opportunityId>
  customers: Set<customerId>
  owners: Set<ownerRef>
  districts: Set<district>
  marketCells: Set<cellId>
  matters: bool
  market: bool
  dashboard: bool
  result: bool
}
```

这套 dirty scope 给了前端一个 **精准的缓存失效指引**：哪个 caseId 的卡片需要重渲染、哪个 customerId 需要重排序、是否需要刷新整个 dashboard。

这是一段在游戏代码里相当少见的工程级设计——更像是大型 SaaS 的数据层在做的事。

---

> **第 5 章亮点卡**
> - **20 步 day tick**：外环境 → 客户 → 机会 → 房源 → 议价 → 派生 → 报告 → 派生（再算一次）。
> - **顺序的因果假设**：NPC 不该看见玩家今天的动作，所以先 tick。
> - **议价用昨晚的 case**：tickCases 在议价之后跑，避免衰减干扰决策。
> - **不可变状态转移**：clone → mutate → return，撤销/回放/测试都受益。
> - **脏范围追踪**：精确到 caseId/customerId 的缓存失效，工程级用心。

---

## 第 6 章 · 评分与结算：让 21 天有一个故事

仿真跑完之后，怎么把这局 21 天压成一个分数和一段叙事？这是 `scoring.ts + resultEvaluation.ts` 在干的事。

### 6.1 三维分：D1 / D2 / D3 → competitiveness

每天每套房都会重算一次 competitiveness，构成一条曲线：

```
competitiveness = clamp(d1 * w_d1 + d2 * w_d2 + d3 * w_d3, 0, 100)
```

| 维度 | 含义 | 信号源 |
|---|---|---|
| D1 | 客户线维度 | 池子大小、活跃接触数、漏斗后段厚度、推进速度、停滞惩罚 |
| D2 | 房源品质 | axisScores（layout/light/floor/decor/amenity/neighborhood/structure） |
| D3 | 业主配合 | 价格弹性、耐心、紧迫、信任、一致性 |

D2 是开局就固定的（房子本身），D1 和 D3 是玩家每天的工作面。**这套维度划分让玩家有清晰的归因**：成绩好不是因为运气，是因为 D1 推进得力，或 D3 经营到位。

### 6.2 房源结局矩阵：8 种 endingType

`resultEvaluation.ts` 用一组 resolver 把每套房映射到 8 种结局：

```
sold_by_you_happy        ←  status=sold & satisfaction=happy
sold_by_you_neutral      ←  status=sold & satisfaction=neutral/no_regret
sold_by_you_regret       ←  status=sold & satisfaction=regret
sold_by_other            ←  defenseOutcome=lost_to_rival
withdrawn_unhappy        ←  status=withdrawn
not_sold_no_regret       ←  unsold & satisfaction=no_regret/neutral
not_sold_regret          ←  unsold & satisfaction=regret
switch_to_rent_no_regret ←  reserved（可见但当前未触发）
```

8 种再合并成 3 桶（good / neutral / bad）：

```
good     = [sold_by_you_happy, sold_by_you_neutral, not_sold_no_regret, switch_to_rent_no_regret]
neutral  = [sold_by_you_regret, not_sold_regret]
bad      = [sold_by_other, withdrawn_unhappy]
```

注意 **"没卖出但业主无憾"算 good**——这说明设计者认为 21 天卖不出不是失败，**让业主带着信心继续等**才是成功的。这是这套系统的一处价值取向。

### 6.3 三维总分：能力 / 防守 / 满意

`evaluateFinalResult()`（resultEvaluation.ts:801-861）给出最终分：

```
score = ability + defense + satisfaction   # max 40 + 35 + 25 = 100

ability:    relativeOutcome (outrun/flat/lose) * goalTier * endingModifier * 40
defense:    defenseOutcome (held/at_risk/lost/withdrawn) * goalTier * 35
satisfaction: ownerSatisfaction (happy/neutral/no_regret/regret/unhappy) * goalTier * 25
```

`goalTier` 是房源的权重（core=1.0, important=0.7, normal=0.4），由蓝图决定。**核心房不保住，三个维度都被狠拉**——这给了"必保盘"一个清晰的语义。

### 6.4 等级与阈值

```
score >= ace      → "王牌"（这局你真的把房子卖顺了）
score >= strong   → "漂亮"（这局基本是你在带着节奏走）
score >= pass     → "过线"（至少把最关键的部分撑住了）
else              → "没保住"（这局先交了一笔学费）
```

阈值是相对的：`pass = max(42, target − 12)`, `strong = min(94, target + 12)`, `ace = min(98, target + 20)`。**用相对阈值意味着同样 75 分在 standard 是"漂亮"，在 hard 可能只是"过线"** —— 难度在这里再次体现。

### 6.5 归因摘要：让玩家学到东西

`buildAttributionSummary()`（resultEvaluation.ts:369-437）统计了：

- **关键推进动作**：story / xiaohongshu / broker / private-referral / open-day / showing / sincerity / invite-negotiation / deep-diagnosis
- **守盘动作**：first-visit / weekly-feedback / deep-diagnosis / pricing 三件套
- **关键事件**：opportunity_advanced / opportunity_closed / case_sold / case_lost_to_rival / window_extended / market_event

最终结算屏会把这些数字 + 三维分 + 8 种 endingType 拼成一段叙事："你这局做了 8 次带看、4 次开放日，但有 2 套核心房 trust 滑到 50 以下，最后 lost_to_rival —— 下一局可以多分配业主向动作"。

**这是这套系统真正的承诺**：每一局都给一个可学习的复盘。但实际落地时（参见 `artifacts/playtest-10runs`），这部分 UI 投影还相对单薄——结局叙事的 "潜力 vs 实现度" 是当前最大的 gap 之一。

---

> **第 6 章亮点卡**
> - **D1/D2/D3 三维分 + 快照**：玩家每天能看到自己的曲线，归因清晰。
> - **8 种 endingType + 3 桶**：把"21 天的故事"塞进有限的形状。
> - **"没卖出但业主无憾" = good**：价值取向不是单纯成交导向。
> - **goalTier 权重**：核心房失守三维同跌，必保盘语义明确。
> - **归因摘要**：关键推进 + 守盘 + 事件三轴统计，给可学习的复盘。

---

## 第 7 章 · 设计哲学的几个判断

读完整套代码，落几个有立场的判断（不是建议、不是修复方案，是 **对设计选择的解读**）：

### 7.1 仿真先于体感

这套系统的工程量集中在 domain 层。模型干净、引擎精细、tick 顺序经得起推敲——但 UI 投影到玩家心智的桥梁还偏窄。结果是：**机制实际在工作，但玩家可能感觉不到自己改变了什么**。

这是大多数仿真游戏的通病，不是这一套独有的。它体现在 playtest 报告里反复出现的 "因果链弱" 评价上。

### 7.2 难度档位是"压力面板"，不是"机制面板"

`outcomeControl` 8 个倍率和 `ruleAdjustments` 一组 rules 给了精细的难度调整面板，但 **它们都作用在"压力大小"上，不动机制本身**。最深的瓶颈（intent ≥ 82 的 stage 阀门、trust < 60 的议价门）在所有难度下相同。

这意味着 **难度调整能改变"困难程度"，但改变不了"困难的形状"**。一个一直推不到 stage 6 的玩家，在 easy 也推不到（只是慢一点）。

### 7.3 客户—机会双轨是 Feature 还是 Bug？

`CustomerRuntimeState.caseStates[caseId].stageIndex`（上限 5）和 `Opportunity.stageIndex`（上限 6，议价桌入口）并行存在。

这套双轨可以解读为：客户的"心理 stage"和经纪人的"业务 stage"是两件事——客户主观上对房子很感兴趣（caseStates.stageIndex=4），但 **关系还没推到能上议价桌**（Opportunity.stageIndex 卡在 2）。这其实贴近真实业务。

但代价是：**玩家做客户向动作时缺乏明确反馈**——客户兴趣涨了，但 Opportunity 不动，体感像"没起作用"。这是一个真实但不友好的设计。

### 7.4 BALANCE.competition.rivalLoss 是这套系统的"骨"

27 个常量、6 类可见滑落信号、3 道守门员逻辑——这块代码的精致程度远超其他引擎。它单独承担了 **整个系统的对手压力建模**。

读这块代码可以反推设计者的判断：失盘不应该单看一个指标（trust 低就丢、价格高就丢），而是 **几个维度同时滑落 + 对手刚好有机会 + 你最近没维护**——三件事撞在一起才会真丢。这是非常贴近真实房产经纪体验的建模。

### 7.5 21 天 × 5 房 × 6 stage 是一道紧约束方程

把数学摆出来：

- 时间：21 天
- 精力：~99 点（standard）
- 房源：5 套
- 客户机会：每套房最多 4 个活跃机会（balance.ts:54）
- stage 推进：每段 5 天窗口，35% 推进概率，最多 6 段

如果想让所有房源都推到 stage 6 议价桌，理论需要 **5 × 6 × 1/0.35 ≈ 86 days**，远超 21 天。所以 **设计就没期望玩家把 5 套都卖出去** —— `outcomeControl.playerBaseDealExpectation21d = 1`（standard）说明设计意图就是 1 套。

这个隐式约束需要在 UI 上更显式——如果玩家以为目标是"5 套都卖出"，就会一直觉得自己在失败。**目标管理是这套系统当前最值得展开的一块**。

### 7.6 反馈层是潜力最大的扩张面

domain 层做得够好了，再深挖收益递减。下一阶段如果要做扩张，**ROI 最高的是把已有的 state 翻译给玩家看**：

- 每个动作的 effect 列表（不只是 logEvent 文本）
- 每条情报对应的 suggestedAction（让消息变成入口）
- 结算时的归因链（哪天的哪个动作导致了哪个房源的最终结局）
- 当前推进的"距离感"（这套房还差多少分能进议价桌）

这些都是 **对仿真的可视化**，不是对机制的修改。投入小、收益大。

---

> **第 7 章亮点卡**
> - **仿真先于体感**：机制工作，但玩家看不见。
> - **难度调压力不调机制**：最深的瓶颈对所有档位相同。
> - **双轨 stage**：贴近真实但反馈不友好。
> - **shouldLoseToRival 是骨**：6 + 1 + 1 守门员，是整个对手压力的脊梁。
> - **目标隐式**：玩家以为要卖 5 套，设计意图是 1 套。
> - **反馈层是 ROI 最高的扩张面**。

---

## 附录 · 关键文件 / 行号速查

### 核心模型
| 文件 | 关键内容 |
|---|---|
| `domain/models.ts:853-916` | Case 全字段 |
| `domain/models.ts:1081-1109` | Opportunity 全字段 |
| `domain/models.ts:474-486` | CustomerProfile |
| `domain/models.ts:513-524` | CustomerRuntimeState |
| `domain/models.ts:534-544` | OwnerArchetype |
| `domain/models.ts:464-472` | MarketCell |
| `domain/models.ts:579-585` | CompetitionGroup |
| `domain/models.ts:649-678` | RivalStore / RivalListing |
| `domain/models.ts:1422-1481` | GameState 顶层 |
| `domain/constants.ts:10` | OPPORTUNITY_STAGES |
| `domain/constants.ts:125-189` | WEEKLY_ROUTINE |

### 配置
| 文件 | 关键内容 |
|---|---|
| `domain/config/baseRules.ts:24-55` | maxDay / 全局规则 |
| `domain/config/balance.ts:53-113` | opportunities tick |
| `domain/config/balance.ts:114-148` | actions.negotiation |
| `domain/config/balance.ts:201-233` | competition.rivalLoss（27 常量） |
| `domain/scenario-generation/difficultyProfiles.ts:122-356` | 6 档难度 |

### 引擎
| 文件 | 关键内容 |
|---|---|
| `domain/engine.ts:261-485` | resolveOneDay 主流程 |
| `domain/engine.ts:300-310` | 周度补给 |
| `domain/engine/opportunityEngine.ts:51-78` | intent 公式 + stage 阀门 |
| `domain/engine/customerEngine.ts:151-180` | customer interest 公式 + 阶段阈值 |
| `domain/engine/competitionEngine.ts:9-94` | shouldLoseToRival |
| `domain/engine/marketEngine.ts:152-177` | window 续期 |
| `domain/dealClosing.ts:42-47` | negotiationSuccessScore |
| `domain/dealClosing.ts:252-258 / 304-316` | 议价 4 道阻挡条件 |
| `domain/engine/actionResolvers.ts:604-657` | getActionAvailability |
| `domain/engine/actionResolvers.ts:628-630` | 业主接触一日一锁 |

### 派生 / 评分
| 文件 | 关键内容 |
|---|---|
| `domain/scoring.ts:5-158` | competitiveness / D1 / D2 / D3 / urgency |
| `domain/resultEvaluation.ts:92-201` | 结局 resolver |
| `domain/resultEvaluation.ts:484-572` | 三维分 |
| `domain/resultEvaluation.ts:801-861` | evaluateFinalResult |
| `domain/runtimeState.ts:127-165` | updateDerivedState |
| `domain/runtimeState.ts:21-71` | recordDomainEvent / logEvent |

### 应用
| 文件 | 关键内容 |
|---|---|
| `application/gameState.ts:309-391` | createInitialState |
| `application/gameTransitions.ts` | 不可变状态转移 |
| `application/projections/workspaceShellProjection.ts:140-280` | 工作台投影 |
| `application/projections/resultProjection.ts:111-179` | 结算投影 |

---

## 收尾

这份鉴赏不是验收清单，也不是问题列表。它是把这台机器拆下来摆在桌上，让接下来的同行能看见 **它已经做对的部分、它的设计取向、以及它隐含的张力点**。

整套代码留下的最强印象不是任何具体公式，而是 **"它认真把房产经纪当回事"**——业主的耐心衰减、对手的可见滑落、客户对多套房的并行比较、competition group 的价格扩散、市场容量的硬约束，每一处都在拒绝"游戏化的简化"。

这是一份接近"小型 ABM（Agent-Based Model）"的实现，只是恰好长着一张游戏的皮。

> 写于 2026-04-27
> CR 范围：`src/selling-houses/**` 全文，约 12,000 行
> 关联文档：
> - `docs/selling-houses-customer-opportunity-architecture.md`
> - `docs/selling-houses-broker-action-architecture.md`
> - `docs/selling-houses-competition-and-cosale-architecture.md`
> - `artifacts/playtest-10runs/`
