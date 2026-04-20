# selling-houses · 架构与模拟深度一体化诊断（v3.1）

> **角色**：本文档现为 `selling-houses-master.md` 的**附录 A（证据层）**。
> 总纲 §1 的"一页现状诊断"由本文证据支撑。如果总纲结论与本文有冲突，以总纲为准。
>
> v3 改动：把"架构诊断"和"模拟质量"合并成同一篇诊断。过去两版把它们当两件事写，这是错的。它们是同一种病的两张皮。

---

## 0. 一句话结论

**这个项目的病不是架构乱，也不是模拟浅，而是"每个好想法都走到 60% 就停了"。**

- 有 seeded RNG，但 UI 入口用 `Date.now()` 和 `Math.random()`。
- 有事件溯源模板（`CompetitivenessSnapshot` + drivers），只给 competitiveness 用，trust/patience/heat 没用。
- 有 7 个 discriminated union，没有一个用来 narrow Case 的行为分支。
- 有 CaseRole（anchor / traffic / fragile / grind / spoiler / sacrifice）在剧本生成期（2080 行）精心打上，运行期（所有 engine tick + 所有 action resolver + 所有 scoring）读取次数 = **0**。
- 有 OwnerArchetype 在世界构建期赋值，却在 marketEngine 里再用旧的 `personality: 'pragmatic'|'emotional'|'urgent'` 系统判一次逻辑 —— **两套并行，谁也不完整**。
- 有 514 行的自对弈 Arena，能当 golden master 用，没人用。
- 有 `competitionGroups` + 8 信号 + 6 项加权的 `shouldLoseToRival` —— 整个项目**唯一一块真正有深度的模拟逻辑**，但旁边 `tickCases` 里业主仍然只会衰减。

这种 **"做一半"** 在架构层面叫 half-adopted patterns，在模拟层面叫 shallow actor model。**同一种投资习惯 —— 做到能跑就停，没有把能力兑现成行为。**

> 因此，v3 的建议只有一个方向：**把所有半成品推到完成**。不追新东西。已经存在的模板（Snapshot、Arena、Role、Archetype、CompetitionGroup）本身已经够好。它们的"利用率"才是关键指标。

---

## 1. 事实清单（只留会改变决策的）

### 1.1 架构层面

| # | 观察 | 证据 |
|---|---|---|
| A1 | 17 步 tick 流程是过程脚本而非可组合管线 | `engine.ts:86–102` 的 `resolveOneDay()` 硬编码 17 个顺序调用 |
| A2 | domain 层反向 import application 层 | `engine.ts:6` `import { logEvent, saveGameState, updateDerivedState } from '../application/gameState'`；`marketEngine.ts:1`、`eventEngine.ts:1`、`competitionEngine.ts:1`、`opportunityEngine.ts` 同样 |
| A3 | GameState 是一个 ~30 字段的 mutable 超大对象，所有 engine 都直接改写 | `models.ts:686–721`；`logEvent` 里 `world.eventLog.unshift(...)` 直接改 props |
| A4 | useGame 伪不可变 setState，潜在 memo 时限炸弹 | `useGame.ts:301–307` 用 `const next = { ...prev }` 再原地改 `next.cases[...]`，`cases` 引用未变 |
| A5 | RNG 有 xorshift32 可复现实现（`utils.ts:22-23`），但 UI 入口用 `Date.now() % 2147483647`（`useGame.ts:34,287`）和 `Math.random()`（`useGame.ts:87`），同时 `nextRandom` 在 source 缺失时静默 fallback 到 `Math.random()` | 确定性边界漏气 |
| A6 | 7 个 discriminated union 存在但没驱动行为分支 | `models.ts:67–83` 定义了 `storylineState / goalTier / defenseOutcome / ownerSatisfaction / endingType / endingBucket / relativeOutcome`，`Case.status` 是 string union 不 narrow |
| A7 | 云同步逻辑不在 `cloudSync.ts`（那里只有 153 行类型）而在 `useGame.ts:166–257`（90 行 hook 逻辑，900ms debounce，乐观并发 `expectedSyncVersion`） | 分层错位 |
| A8 | `runContext.scenarioSnapshot` 被 embed 进存档，通过 `world.runContext.scenarioSnapshot.world.ownerArchetypes.find(...)` 这种 4 级深度访问（`marketEngine.ts:60`）在运行期读取 | 存档膨胀 + 内容/状态未分离 |
| A9 | 事件溯源模板只覆盖 competitiveness，其它三大状态（trust / patience / heat）无 snapshot / drivers / delta 归因 | `scoring.ts:29–48` 对照 `marketEngine.tickCases` 里对 trust 的 7 处直接 `caseItem.trust -= ...` |
| A10 | `ACTION_EXECUTORS` 里以 `strategyCfg[...].priceFactor === 1` 作为 "hold" 分支的魔法代理 | `actionResolvers.ts:386–390`，改数字会默默改逻辑 |
| A11 | **`any` 逃逸率 ≈ 100%**：核心运行期函数参数全是 `caseItem: any / customer: any / opportunity: any`，丢掉了 `Case / Customer / Opportunity` 的类型信息 | `actionResolvers.ts:41,61,97,192,227,241,255,294,315,356,400,432,446`；`opportunityEngine.ts:97,159,169,214,222,228` —— TypeScript 开了，但实现侧 opt-out |
| A12 | **"公式即代码"**：关键 balance 以硬编码 TS 表达式散落在 6+ 处，没有单一 balance config 层 | `resolveNegotiation:368–373`（6 项加权 + 魔法 0.46/0.24/0.18/0.16/0.6）；`computeCustomerFit:159–167`（layoutScore 18:4 / districtScore 18:0 / 24-priceGap/10）；`competitionEngine.shouldLoseToRival:92-99`（6 项加权）；`scoring.ts:80-84` d1 公式；`tickCases:64-99` 衰减系数；`sellCase:408` 佣金 `soldPrice × 0.01 × 0.25 × 10 / 10` 四乘四除 + 零注释 |
| A13 | **每个 action 自己落档**：`executeAction:351-352` 每次 `updateDerivedState(state); saveGameState(state);`。自对弈时每 tick 多次落 localStorage | 存档节奏由 action 决定，不是由 run loop 决定，无法批量事务 |
| A14 | **state 改写的全息性**：任何 action 可写 `state.energy / cash / reputation / commission / soldCount / withdrawnCount / opportunities[] / cases[]`，不受层次约束 | `actionResolvers.sellCase:400-429` 一个函数改 8 个顶层字段 + 遍改 opportunities；`withdrawCase:432-443` 同样 |
| A15 | `logEvent` 把 `eventLog` cap 在 **120 条**，多出自动 pop —— "历史"其实是滚动文字流，不是事件流 | `gameState.ts:287-289` |
| A16 | **第二个神函数**：`updateDerivedState` 每次 setState 全量重算所有 cases 的 stageLabel / competitiveness / riskFlags / storylineState + schedule + priorities + metrics，复杂度 O(cases × opportunities) | `gameState.ts:519–550` |
| A17 | **UI 展示字段污染 domain state**：`deriveSchedule / derivePriorities` 直接把带文案（`title / badge / note / detail`）的 UI 条目写进 `state.schedule` / `state.priorities` | `gameState.ts:574-645`。存档里永久驻留中文文案；P2 时要剥离 |
| A18 | **legacy adapter 常驻**：`buildLegacySnapshot` 90 行把旧存档重建成 ScenarioSnapshot，`normalizeCase` 再把兼容字段 fallback 上 —— 每次读档都走这条路径 | `gameState.ts:292-417`。迁移不是一次性的，是系统永久运行的一部分 |

### 1.2 模拟层面

| # | 观察 | 证据 |
|---|---|---|
| S1 | 业主完全被动：只有衰减和对玩家动作的响应 | `marketEngine.tickCases:50–119` 只做减法：trust 衰减、heat 衰减、patience 衰减、窗口 −1；唯一的"主动"动作是 windowDays ≤ 0 时的撤盘检查 |
| S2 | personality 三元系统和 OwnerArchetype 系统并存。personality 在 `generator.ts:89` 由 `resolvePersonality(ownerArchetype)` 派生一次；运行期（`marketEngine` 3 处、`actionResolvers` 5 处、`arena` 1 处）仍在分 `isPragmatic / isEmotional / isUrgent` | 派生场不回流，两套判定逻辑无法共享 |
| S3 | 客户也完全被动：`updateCustomers:43–48` 对 customers 只做 `activity` 和 `urgency` 的小范围随机抖动。客户不在多个 Case 之间流动，不比较价格，不带家人复访 | 客户 ≈ 一堆浮点标量 |
| S4 | 事件是"数字增量袋"：`fireScheduledEvents:60–100` 对 event 应用 `trustDelta / heatDelta / urgencyDelta / askPriceDelta / windowDaysDelta / sentimentDelta / demandHeatDelta / competitionPressureDelta / confidenceDelta` —— 9 种标量增量，无叙事因果 | 事件 = +X 的糖衣 |
| S5 | 随机事件只有 3 条硬编码分支（policy-shift / school-boom / default-competitor），虽然 `randomEventPool` 是数据驱动的内容，但 engine 的 dispatch 是 switch on templateId | 内容数据化了，分发仍然硬编码 |
| S6 | 竞品不是角色。`competitionEngine` 非常聪明：`shouldLoseToRival` 用 8 个信号（pressureOverLine / brokerShadowLeads / priceGapRatio / relationshipGap / trustCollapse / windowDays / urgentOpening / pipelineOpening）+ 6 项加权算概率 —— 但这一切计算的是**玩家暴露**，不是竞品在打什么牌 | 整个项目唯一真正有模拟质量的地方，仍然只写了一半 |
| S7 | CaseRole 在运行期死透。脚本生成（`scenario-generation/` 2080 行 × 6 文件）每个 Case 都标了 role，`scenarioValidators`、`scenarioAssembler` 都在用。运行期（所有 engine/tick/score/action 路径）里 `.role` 读取次数 = 0 | 语义投资 3x 于运行时利用 |
| S8 | 没有时间粒度。一天就是 17 步 tick，没有"早晨/下午/晚上"，没有"早 9 点市场新闻 → 下午 3 点业主来电 → 晚上 7 点客户看完其它房源后回访"这种可见因果链 | 时间维度 = 1 |
| S9 | 内容库很小：2 个 market 原型、6-8 个 customer 模板、9 个剧本 blueprint、~6 个 event template。但**剧本生成器的装配代码比内容多 3 倍** | 容器比内容重 |
| S10 | Arena（514 行）用固定 seed 20260417 跑完整对局，有 `SelfPlayReport`、`decisions`、`findings`、`evaluation` —— 拿来当 golden master 只差把 report 做 diff | 已有的 QA 资产没人用 |
| S11 | **客户 1:1 锁定是显式硬编码的**：`createOpportunity:101-104` 的 filter 主动排除"已为同 case 生成过 opportunity 的客户"；再配合 `activeCount >= 4` 上限，每个 case 最多 4 个客户，每个客户最多对 1 个 case。v3 提的"客户漂浮"需要明确**移除这个限制** | 不是不做，是做反了 |
| S12 | **漏斗推进靠 `chance(0.35)` 抛硬币**：`opportunityEngine:61` 的 `stageIndex < 6 && intent >= 82 && chance(0.35, world)` —— 客户心动到 82 仍只有 35% 概率推进。这是策划用概率掩盖缺乏深度建模的典型标志 | 客户为什么"心动但犹豫"？没有故事，只有 35% |
| S13 | **议价结果 = 一个 6 项加权公式**：`resolveNegotiation:368-373` 用 `intent×0.46 + confidence×0.24 + trust×(urgent?0.25:0.18) + competitiveness×0.16 − (askPrice−marketPrice)×0.6 + strategy.shift` 算 score，`randomInt(0,100) < score` 就成交 —— 一整套交易心理全压在一个 score 里 | 买方是一个函数，不是一个角色 |
| S14 | **结局评估是从静态快照反推，不是从事件流聚合**：`resultEvaluation.evaluateFinalResult:483-538` 从 cases 最终字段反推 endingType/satisfaction/defenseOutcome。玩家看到"能力分 28"却无法追溯"哪几个动作贡献了这 28 分"。即使 snapshot 模板泛化了，这里也不会自动受益 | 归因必须从事件流来，不能从 "最终态" 来 |

---

## 2. 合一的诊断：一种病，两层皮

每一行都是**同一种"做到 60% 就停了"**在两个层面上的投射。

| 半成品 | 架构层面的样子 | 模拟层面的样子 | 共同根因 |
|---|---|---|---|
| **CaseRole** | 7 个 union 之一，定义了类型不用来 narrow 行为 | 在剧本生成期精心标注，运行期 0 次读取 | 语义的"命名"有了，"驱动"没有 |
| **OwnerArchetype / personality 并存** | 双系统：新系统 (archetype) 部分替代旧系统 (personality)，双双保留 | 业主行为判定散落在两套 key 上，`tickCases` 里同时查询两套 | 迁移只做了一半就放弃了，新的没接管旧的 |
| **CompetitivenessSnapshot drivers 模板** | 只给 competitiveness 用的归因模板 | trust/patience/heat 的波动没有 drivers，玩家看不懂"为什么掉了 8 点" | 好模式被发明但没泛化 |
| **Arena 自对弈** | 存在的基础设施 | 没作为行为变更的回归门槛 | 工具造好了，流程没嵌入 |
| **Seeded RNG** | xorshift32 可复现 | UI 入口 `Date.now()` + `Math.random()` | 边界失守，确定性变口号 |
| **Event 通用模板** | scheduled event 是 9 种数字增量 + 硬编码 dispatch | 事件无法触发事件（没有 A→B 因果链） | 事件是"结果"不是"行为"，缺事件总线 |
| **Discriminated unions** | 7 个 union 定义但不 narrow Case | Case 不同状态下的行为一样（active 里的 sold 前兆 vs withdrawn 前兆无结构区分） | 类型是文档，不是执行 |
| **competitionGroups + shouldLoseToRival** | 分组结构 + 深度概率模型存在 | 只算玩家暴露，竞品本身无行动 | 有被动检测，无主动模拟 |
| **scenario-generation 管线** | 2080 行装配代码，生成丰富世界 | 运行期把 80% 的丰富度忽略 | 生成 >> 使用 |
| **budgetLedger** | append-only 的小型事件流（**带 id/day/kind/amount/balanceAfter/title/detail**） | 整个系统其它地方不这么写 | 一处 done，没扩散 |
| **"公式即代码"** | balance 散落在 TS 表达式里 | 策划改一个权重要 PR；模拟没有独立可调层 | 没有 rules.balance.* 命名字典 |
| **类型 opt-out** | 7 个 union + Case / Customer / Opportunity 类型齐全 | 运行期所有核心函数 `caseItem: any` 丢掉所有约束 | 编译器保护范围 = 30%，不是 100% |
| **legacy adapter** | 读档永久走 buildLegacySnapshot + normalizeCase | 存档结构不敢演进，新字段都要 fallback | 迁移无"关门时刻"，背得越久越重 |

**结论**：与其做架构重构或模拟深化，不如把清单里每一项推到 100%。**完成比新建更划算。**

---

## 3. 建议的方向：把"架构投资"当成"模拟投资"的杠杆

架构和模拟不是两件事，架构是模拟深度的**释放器**。

| 架构动作 | 直接释放的模拟能力 |
|---|---|
| 事件总线（把 17 步 tick 的每步 emit domain event） | A→B 因果链成为可能。业主看到降价事件 → 情绪变化事件 → 下家比价事件 —— 可见、可归因 |
| Actor 类型拆分（Owner / Customer / Rival 各自是 reducer） | 业主/客户/竞品可以各自有 personality × archetype × role 复合行为。Case 不再是神对象 |
| 数据驱动 dispatch（event template → handler via JSON table） | 内容库可以 5-10 倍扩容而不改代码；运营可以单独调 event |
| Snapshot 模板泛化（trust/patience/heat/urgency/reputation 都带 drivers） | 玩家每次看到一个数字变化都能点开"为什么"。模拟不是一堆浮点，是一堆故事 |
| RNG 边界修复 + Arena 做 golden master | 任何模拟改动都能跑自对弈 diff，敢大改不回滚 |
| CaseRole 在运行期接通 | 业主的耐心衰减、AI 的出价策略、报表的突出项、事件池的加权，全部随 role 变化 |

**反过来看**，如果只做架构不做模拟深度，最后得到的是"一个很干净的浅模拟"，没意义。如果只做模拟不做架构，事件会变成更大一团 if-else，最后崩塌。**必须一起做。**

---

## 4. 让"每天"生动、有规模、有质量

这是用户的第二个具体问题。答案也嵌在同一个改造路径里 —— 不需要新系统，只需要把既有结构推满。

### 4.1 生动（vivid）—— 让每个 actor 有自己的一天

当前 tick 里所有行为都是被动衰减。要生动，首先是 **actor 要醒过来，而不是等玩家敲门**。

**Owner（业主）的一天**（替换 `tickCases` 里的纯衰减）：
- 每天早晨根据 `ownerMood × role × trust × windowDays × marketNews` 做一次"**今日心态**"判定：
  - `anxious` → 有 20% 概率主动打电话催进度，消耗玩家精力但不推进
  - `game-player` → 看到 `marketPrice` 上涨时有概率试探性加价 1-2%
  - `fair-value` → 看到多个同类房源降价时自己也会主动挂低
  - `trial-balloon` → 热度低于阈值时威胁撤盘（不是系统强制撤）
- `role` 决定基线性格：`fragile` 的业主更容易被单次事件冲到撤盘边缘；`anchor` 的业主价格坚挺但给足曝光窗口
- 心态变化通过事件总线广播，玩家的报表看得到 "业主今天转入焦虑"

**Customer（客户）的一天**：
- 当前客户被 1:1 绑定在 Opportunity 上。改成**客户在客池里漂浮**，每天概率性进入 1-3 个 Case 的漏斗
- 客户有隐藏 `trueBudget` 和 `trueTopCriteria`，通过接触逐步显现（信息不对称）
- 客户会横向比较：如果玩家的 Case A 挂价 580、对面的 Case B 挂 550，客户在看房后可能自己切到 B
- 家庭决策：第 2 次看房带家人，家人的 `preferred layout` 如果和房源不匹配，置信度下滑

**Rival（竞品）的一天**：
- 当前 `competitionEngine` 已有非常好的判定骨架，只需要**给竞品装个行动循环**：
  - 每个 `competitionGroup` 每天选一个 policy：`price-war` / `listing-poach` / `open-house-war` / `staff-poach` / `idle`
  - 不同 policy 触发不同的 ambient event（"隔壁门店在做开放日" / "隔壁挂牌降价 3%" / "隔壁撬走了两个broker shadow lead"）
  - 玩家能"感受到"一条街的竞争在动，而不是一个静态压力值

**机制上只需要**：
1. 现有 `tickCases` → 改为 `tickOwners` + `tickCustomers` + `tickRivals` 三个 reducer
2. 每个 actor tick 产生 domain events（不是直接改 state），由一个 dispatcher 消费
3. actor 的行为由 `role × archetype × mood × signals` 查表决定（数据驱动）

### 4.2 规模（scale）—— 让城市在后台运转

**当前规模**：玩家看到 4-8 个 Case、~10 个 opportunities、~6-8 个 customers、3 个 rival stores。城市 = 这些可见对象的总和。

**改成：可见对象 = 冰山尖；不可见对象 = 冰山身**。
- `shadowListings`：30-50 个由竞品持有的 ambient 房源，跑一个简化版 tick（每天衰减 + 概率成交 + 概率撤盘），产生市场新闻事件
- `shadowCustomers`：80-120 个 ambient 客户，随机流入玩家客池或流向 rival；只展示进入玩家可见层的那部分
- `marketTickerEvents`：每天 1-3 条"城市动态"（不影响玩家但塑造氛围）："东区某 620 万房源 3 天成交，业主主动让 12 万"
- `rivalKPIBoard`：竞品门店每周结算一次"成交 X 套、营销预算变化、战略倾向变化"，作为玩家可读情报

**收益**：
- 氛围：玩家感觉在一个真实流动的城市里，不是在 8 个房源的沙盘上
- 张力：看到隔壁门店本周卖了 3 套、自己还没出货，会产生真实焦虑
- 教育：新手通过 ticker 学什么叫"市场热"

**机制**：
- `shadowListings` 是简化 Case，只有 `{ marketCellId, askPrice, bottomPrice, daysOnMarket, status }`，跑一个轻量 reducer
- 内存开销：150 个简化对象 × 每个 ~10 field ≈ 可忽略
- 存档：存 shadow 对象的种子和 day，回放生成即可（这是为什么 RNG 边界先要修好）

### 4.3 质量（quality）—— 每个数字变化都有出处

**当前**：trust 从 72 掉到 64，玩家看到个 `-8` 和一条可能的 log 文本。为什么掉？哪条动作的代价？多长时间回来？全都是黑盒。

**改成**：Snapshot 模板泛化。每个关键状态都像 competitiveness 那样带 drivers。
- Trust 变动有 `source`（action / ownerMood / rivalEvent / marketShock）和 `reason`（"第 3 天未接触 + 业主焦虑人格 + 价格偏离市场 7%"）
- UI 上玩家点开 trust 数值能看到"最近 5 次变化 + 驱动因素"
- 这直接改变玩家体验：**玩家从"看仪表盘打分数"变成"读一个正在发生的故事"**

这个也不是新发明，就是把 `CompetitivenessSnapshot` 的结构复制到 trust / patience / heat / urgency / reputation 上。代码重复 5 次，收益是**整个游戏从数值游戏变成叙事游戏**。

### 4.4 三者的关系

- 生动（actor 醒过来）要靠 actor 拆分 + 事件总线 —— **架构 P2/P1 的副产品**
- 规模（城市后台运转）要靠 RNG 边界干净 + shadow actor 简化 reducer —— **架构 P0/P2 的副产品**
- 质量（变化可追溯）要靠 Snapshot 模板泛化 —— **架构 P1 的副产品**

**三个用户诉求，全部是同一条架构演进路径的附赠。**

---

## 5. 隐藏资产清单（翻译：这些已经做了，别扔）

| # | 资产 | 位置 | 未兑现的价值 |
|---|---|---|---|
| H1 | `LocalAdversarialSelfPlayArena` | `application/localAdversarialSelfPlayArena.ts` 514 行 | Golden master：任何改动跑一次，diff 超阈值报警 |
| H2 | `CompetitivenessSnapshot` + drivers 模板 | `domain/scoring.ts:29–48` | 泛化到 trust/patience/heat/urgency/reputation 就能支撑叙事 UI |
| H3 | 7 个 discriminated union | `models.ts:67–83` | 真正用来 narrow 行为后，Case 自然分裂成 Active / Won / Lost / Withdrawn 四种 |
| H4 | CaseRole 语义层 | `scenario-generation/*` + `models.ts:Case.role` | 接通运行期即拿到 actor 分层行为 |
| H5 | `competitionGroups` + `shouldLoseToRival` 8 信号 6 加权 | `competitionEngine.ts:30–103` | 给竞品装上 policy 循环就成了真正的 AI 对手 |
| H6 | `budgetLedger` append-only + 完整 schema (`id/day/kind/amount/balanceAfter/title/detail`) | `domain/budget.ts:1–82` | **直接可复制到 trust/patience/heat/reputation 的事件溯源模板** |
| H7 | `scenario-generation` 管线 | 2080 行 × 6 文件 | 运行期接通后，剧本差异性直接 3 倍以上 |
| H8 | Neon 持久化 + 乐观并发 | `useGame.ts:166–257` + `infrastructure/cloudClient.ts` | 同人可在多端接续同局 —— 支持长周期"赛季" |
| H9 | 随机池的数据化 | `randomEventPool` 已按权重采样 | 把 dispatch 从 switch 换成 table，content 管理立刻解锁 |
| H10 | xorshift32 | `utils.ts:22-23` | 修好边界就是真正的种子决定论 |

---

## 6. 目标架构（每个模块解释它服务的模拟能力）

```
src/selling-houses/
├── domain/                       [无副作用、无 I/O、无 React]
│   ├── world/                    World = 内容 (不可变输入)
│   │   ├── blueprints/           剧本、市场、客户、业主原型
│   │   └── rules/                balance knobs, action definitions
│   ├── state/                    GameState = 只读 POJO，所有字段 readonly
│   │   ├── case.ts               Case discriminated union (active/won/lost/withdrawn)
│   │   ├── owner.ts              Owner actor 独立出来 (mood + archetype + role)
│   │   ├── customer.ts           Customer actor (hidden budget + criteria)
│   │   ├── rival.ts              Rival actor (policy + kpi + shadowListings)
│   │   ├── market.ts             Market cells + shadowEvents ticker
│   │   └── index.ts              GameState = { day, player, cases, owners, customers, rivals, markets, events, ... }
│   ├── events/                   所有 domain event 的 discriminated union
│   │   ├── types.ts              事件类型的单一真相
│   │   └── reducers/             每类事件 -> 状态转换的小函数
│   ├── simulation/               reducer + pipeline
│   │   ├── phases/               每一个是一个 (state, events) -> events[]
│   │   │   ├── markets.ts
│   │   │   ├── owners.ts         (替代旧 tickCases 的 owner 部分)
│   │   │   ├── customers.ts      (客户漂浮 + 横向比较)
│   │   │   ├── rivals.ts         (竞品 policy 循环)
│   │   │   ├── opportunities.ts
│   │   │   ├── scheduled.ts
│   │   │   └── shadow.ts         (ambient 城市后台)
│   │   ├── pipeline.ts           按 DAG 组合 phases
│   │   └── rng.ts                纯种子 RNG，禁止 Math.random
│   ├── actions/                  玩家操作
│   │   ├── definitions/          ACTION_EXECUTORS 解耦成 table + handlers
│   │   ├── effects.ts            执行返回 events[]，不再原地改
│   │   └── availability.ts       谓词表替代 if-else 链
│   └── scoring/                  归因
│       ├── snapshot.ts           泛化 CompetitivenessSnapshot 模板
│       ├── drivers/              每个 signal 的 contribution 计算
│       └── attribution.ts        状态变化反查最近事件
│
├── application/                  [React hooks + persistence，允许副作用]
│   ├── gameStore.ts              用 reducer(state, event)，禁止原地改
│   ├── runManager.ts             局次管理：startRun / reset / resume / abandon
│   ├── cloudSync.ts              真正把 useGame 里的同步逻辑搬进来
│   └── selectors/                UI 派生数据，memoized
│
├── infrastructure/               [外部依赖]
│   ├── cloudClient.ts
│   └── neonRepo.ts
│
├── testing/
│   ├── golden/                   self-play arena 产出的 baseline report
│   ├── arena.ts                  回归门槛
│   └── scenarios/                固定 seed 的黄金对局
│
└── ui/                           [React components，纯展示]
```

---

## 7. 迁移计划（同一条路径，既修架构又补模拟）

**总周期 8-10 周，单人全职；可分两阶段交付（前 5 周完成 P0-P3 就能看到根本性改观）。**

### P0 — 地基（1 周）
**目的**：让 "golden master + deterministic RNG + balance config" 成为基线护栏。  
**做什么**：
- RNG 全入口修正：`useGame.ts:34,287` 的 `Date.now() % 2147483647` 和 `useGame.ts:87` 的 `Math.random()` 都改成从 scenario seed 派生。`utils.ts:22-23` 的 fallback 改成抛错。
- Arena 加 `saveGoldenReport(report, label)` 和 `diffAgainstGolden(newReport, label)`，把 `decisions / findings / finalResult.score / 关键state checkpoint` 存成 JSON。
- CI（或手动）跑 arena vs golden，差异超 1% 报警。
- **提取 balance config 层**：把 `resolveNegotiation` / `computeCustomerFit` / `shouldLoseToRival` / `sellCase` / `tickCases` 里的硬编码系数挪到 `rules/balance.ts`，每个数字给命名 + 中文注释 + 取值范围。这是"balance as data"的第一步，不动逻辑也能先把钥匙交给策划。
- 把 v3 md 这份诊断贴在 README 的"贡献前必读"。

**验收**：同 seed 跑两次 self-play，结果 byte-identical；改 balance.ts 一个命名系数，arena diff 能看到哪个数字漂了；策划自己改一行常数不需要问工程。  
**回滚成本**：0（纯增量，balance 提取是单纯 rename）。

### P1 — 事件总线 + Snapshot 泛化 + 归因重构（2 周）
**目的**：让状态变化可归因，并把 resultEvaluation 从"快照反推"改为"事件流聚合"。  
**做什么**：
- 定义 `DomainEvent` discriminated union（`CaseTrustChanged / OwnerMoodShifted / CustomerEntered / RivalPriceCut / ScheduledEventFired ...`）
- 17 步 tick **不改顺序**，但每步不再直接改 state，而是返回 `events[]`，由一个中央 `applyEvents` 函数消费后落到 state。
- 把 `CompetitivenessSnapshot` 的 drivers 模板复制给 trust / patience / heat / urgency / reputation。**直接抄 `budget.ts` 的 `id/day/kind/amount/balanceAfter/title/detail` schema**，不要重新设计。
- `logEvent` 从 `application/gameState` 里搬到 `domain/events/`，切断 domain → application 反向依赖（A2 已修）。
- **`eventLog` cap 120 保留（UI 层展示用），但新增 `eventStore` 不截断（归因用）**。两者分离：一个是 UI 流，一个是真历史。
- **`resultEvaluation` 改造**：从 `evaluateFinalResult(world, reason)` 反推变成 `evaluateFromEventStream(events, world)` 聚合。玩家回看结算报告时能看到"能力分 28 分 = 带看 8 分 + 讲故事 6 分 + 议价 6 分 + 小红书推广 4 分 + 深度诊断 4 分"。

**验收**：UI 上点 trust 数值能看到最近 5 条 driver（reason + contribution）；arena diff 为 0；结局报告能展开每维得分的事件贡献清单。  
**回滚成本**：小（events[] 只是包装层，removed 就回到直接改）。

### P2 — Actor 拆分 + 杀双系统 + 清理 any + 拆神函数（2.5 周）
**目的**：让业主、客户、竞品各自成为 actor；回收类型安全红利。  
**做什么**：
- Case 拆成 `Case`（交易客体）+ `Owner`（actor）+ `Customer`（actor）+ 现有的 rival。
- OwnerArchetype 成为唯一真相，`personality` 字段和 5 处 `isPragmatic/isEmotional/isUrgent` 全部删掉（向前迁移：archetype id 派生一个 display 用的 tag，逻辑路径合一）。同时修 `normalizeCase:394` 的 `personality || 'pragmatic'` fallback。
- `tickCases` 拆成 `tickOwners` + `tickCustomers` + `tickCases`（case 只管窗口、报价、derived 汇总）。
- Owner 每天早晨做 `mood judgment`，产生 `OwnerMoodShifted` 事件。
- **移除 `opportunityEngine.createOpportunity:101-104` 的客户 1:1 锁定**，进入漂浮客池（N:M Opportunity 关联 + 客户在多 case 间比较）。
- **消灭核心运行期的 `any`**：`actionResolvers` / `opportunityEngine` 的 `caseItem: any` 全部换成真类型；编译期捕捉的错误就地修。
- **拆分 `updateDerivedState` 神函数**：`deriveSchedule / derivePriorities / deriveMetrics` 挪到 `application/selectors/`（React memo 化），不再每次 setState 全量重算写进 state。
- **从 state 里剥离 UI 文案字段**（`schedule[].title/badge/note`、`priorities[].title/detail`）：state 只存原子事实，文案留给 selector。

**验收**：arena diff 只在 owner 行为引入主动动作的日子出现（可接受）；UI 上业主卡片能看到"今日心态"；`any` 在 domain 层零引用；存档体积下降 ≥20%（因为剥离了文案 + schedule/priorities）。  
**回滚成本**：中（Case 字段结构变了，存档有一次性 migration）。

### P3 — Data-driven content & dispatch（1.5 周）
**目的**：解锁内容扩容。  
**做什么**：
- `eventEngine.triggerRandomEvent` 的 3 条硬编码 case 改成 `eventHandlers: Record<templateId, (world, event) => DomainEvent[]>`，template 从 JSON/TS 常量表里来。
- `randomEventTemplates` 从 6 条起步，先扩到 20 条（不写代码，写内容）。
- `ACTION_EXECUTORS` 的 magic proxy（`priceFactor === 1` 当 hold）修掉，option id 作为一等公民传入。
- Customer / Owner 的 archetype 从 8 个扩到 15-20 个（纯数据，不改代码）。

**验收**：新增一个 event template 只改数据文件不改代码；arena 跑 10 局，事件出现分布合理。  
**回滚成本**：极小。

### P4 — CaseRole 运行期接通（1 周）
**目的**：把死了的语义层救活。  
**做什么**：
- Owner 行为 profile 按 `role` 查表：anchor → 耐心长、价格硬；fragile → 事件敏感度 ×1.5；spoiler → 概率性制造 shadow lead 骚扰玩家。
- Scoring 权重按 role 调整：`sacrifice` 房源的低 competitiveness 不扣大局分。
- Arena AI policy 读 role：优先保 `anchor`、放弃 `sacrifice`。
- 报表把 role-based 总结写进 weekly review。

**验收**：两份剧本（全 anchor vs 全 fragile）arena 跑出完全不同的节奏。  
**回滚成本**：小。

### P5 — 城市后台（2 周）
**目的**：规模感。  
**做什么**：
- `shadowListings`、`shadowCustomers`、`marketTickerEvents`、`rivalKPIBoard` 四类 ambient actor。
- 每类有独立的 lightweight tick（不产生 UI-facing event，但被 report / weekly review 汇总）。
- 存档只存 seed + day（回放生成）。

**验收**：玩家能在周复盘看到"本周市场成交 4 套、竞品降价 2 次、新增 9 个客户观望"。  
**回滚成本**：小（append-only，可直接 disable）。

### P6 — 内容扩容 + 调优（持续）
**目的**：让"质量"真正变现。  
**做什么**：
- Event template 从 20 条扩到 50+
- Customer archetype 从 15 扩到 30
- 3-5 个新剧本 blueprint
- Balance 通过 arena 批量对比微调

**验收**：任何 balance 改动必须提交 arena diff 报告；内容提交免代码审查。  
**回滚成本**：每项独立可回滚。

---

## 8. 决策门（每个阶段的"如果 XX 不成立就停"）

| 阶段 | 门槛（不满足就不进下一阶段） |
|---|---|
| P0 结束 | 同 seed 双跑结果字节一致；arena golden report 可 diff |
| P1 结束 | 事件总线不引起 arena 结果漂移；UI 归因 reason 真的有人看（做一次 dogfooding） |
| P2 结束 | personality 字段彻底删除；archetype 是唯一业主人格入口；owner 主动行为已上线 |
| P3 结束 | 新 event 不改代码；ACTION_EXECUTORS 里 magic number 消失 |
| P4 结束 | 两份 role 构成不同的剧本，arena 跑出可识别的不同节奏；role 在至少 3 处（owner 行为 / scoring / AI policy）读 |
| P5 结束 | 周复盘里能看到 ambient 事件；存档大小未膨胀（因为只存 seed） |

---

## 9. 不建议做的事（省错的事情就是省时间）

- **不要**重写 Arena。现在的 Arena AI 很粗糙（greedy、无 look-ahead），但作为回归门槛已经够用。升级 Arena 的 AI 是 P7+ 的事。
- **不要**引入新 framework（Redux / Zustand / MobX）。当前自建 reducer 已经够用，React setState 的问题是"伪不可变"，修法是教团队写真不可变 reducer，不是引库。
- **不要**做 ECS。actor 拆分不等于 ECS，POJO + reducer 就够。
- **不要**先做 UI。v2 曾经考虑让 UI 先上 react-query，错的。先把 state shape 稳定了 UI 再重构 selector。
- **不要**一次性扩容内容。先把 dispatch 数据化（P3），再扩。否则 50 条 event 全是 switch case，改一个 bug 改 50 处。
- **不要**保留 `runContext.scenarioSnapshot` 在存档里。它是内容，不是状态。P2 的时候按 id 引用外部常量表即可。

---

## 10. 一张图：病、药、收益

```
Half-adopted patterns
    │
    ├── [架构表现] 事件溯源只做一半 ──→ snapshot 泛化 ──→ 每个数值变化可追溯 (质量)
    ├── [架构表现] 类型 union 不驱动分支 ──→ Case 按状态拆 + actor 拆 ──→ owner/customer/rival 各自有一天 (生动)
    ├── [架构表现] RNG 边界漏 ──→ 修边界 + arena golden ──→ 放心引入 shadow city (规模)
    ├── [架构表现] 数据内容硬编码分发 ──→ table-driven dispatch ──→ 内容 5-10 倍扩容 (规模+质量)
    └── [架构表现] domain 反向依赖 application ──→ 事件模块移位 ──→ 可独立测试 simulation (质量)

Same disease.  One cure path.  Three visible wins.
```

---

## 11. v3.1 深度补充 — 上一轮 CR 没看清的四件事

v3 主线已经成立，但再啃一遍运行期代码后，有四个观察**直接影响 P0/P1/P2 的具体内容**，单独拉出来讲。

### 11.1 "公式即代码" 是比"dispatch 硬编码"更深的病

v3 主线说的是 event dispatch 硬编码。再看一层，**balance 本身也硬编码**。

- `resolveNegotiation` 里的 `0.46 / 0.24 / 0.18 / 0.16 / 0.6` —— 这是 5 个买方心理权重，藏在函数体里
- `computeCustomerFit` 里的 `layoutScore 18:4` / `districtScore 18:0` / `budgetScore 24` / `preferenceScore × 6` —— 这是 4 个客户匹配维度的权重
- `shouldLoseToRival` 的 8 信号 6 加权
- `scoring.d1/d2/d3` 三套公式
- `sellCase` 的佣金 `× 0.01 × 0.25 × 10 / 10` 四乘四除零注释
- `tickCases` 里 `trust -= isEmotional ? 4 : 2` 等 7 处人格系数

**这些不是"代码细节"，是整个游戏的 balance 核心。策划想调"议价时 confidence 权重从 0.24 降到 0.20"得提 PR**。

P0 不做 balance 抽离，后面所有"arena 自对弈调参"的承诺都是空的 —— 你连"调一个参"的接口都没有。

**第一步：命名**。把 6-8 个关键公式里的所有系数提取到 `rules/balance.ts`，每个常量一个命名 + 中文注释 + 合理取值范围。逻辑不变，arena diff = 0。这一步就能让策划接管 balance。

**第二步（P3）：外化**。balance.ts 可以变成 JSON 常量 + 难度等级覆盖层。不同难度不同 balance，不需要 9 个 scenario blueprint 各写一份。

### 11.2 类型的 opt-out 比没有类型更糟

`Case / Customer / Opportunity` 类型都定义得很详细（models.ts 721 行）。但运行期函数参数全是 `caseItem: any / customer: any / opportunity: any`。

更糟的是 **这些 `any` 装的其实是完整对象**，所以：
- IDE 补全一片空白
- 重命名字段（比如 `trust → ownerTrust`）静默断裂 —— TS 不报错
- 打字错（`caseItem.competetiveness`）编译通过
- 重构风险高到不敢动

这等于**团队为了图省事，把类型系统 30% 停在 DTO 边界**。P2 清理 `any` 一步，可能暴露出编译期的结构性 bug —— 这本身就是价值。

### 11.3 neither 事件溯源 也不是 最终态，而是"滚动文字流"

当前 `logEvent` 写 `world.eventLog`，cap 120 条，pop 尾部。看起来像事件流，其实是**最近事件的中文文案流**，不是归因用的结构化事件。

`resultEvaluation` 不读 eventLog（读不了，会丢），而是遍历 cases 最终字段反推 `endingType / satisfaction / defenseOutcome`。所以玩家看到"满意分 12/25"这种结论，**无法回答"是哪些动作做成了这个满意分"**。

P1 需要把 **"UI 展示流" 和 "归因事件流" 彻底分开**：
- `eventLog`（UI）：cap 120，带中文文案，用于右侧列表展示
- `eventStore`（domain）：不截断、带结构化 payload、drivers、签名，用于 `evaluateFromEventStream` 聚合和 UI 点击数值时查最近 5 条 driver

**同一份数据两个用途，必然撕裂。** 现在是 UI 流占位，归因死。

### 11.4 `updateDerivedState` 是第二个神函数 —— 也是 React 的第二颗炸弹

每次 setState 都会触发 `updateDerivedState`（经 `executeAction:351` 或 `advanceDays` 路径），它会：
1. 遍历所有 cases，重算 stageLabel / competitiveness + snapshot / riskFlags / storylineState
2. 重新生成 `schedule`（带文案的 UI 条目，最多 10 条）
3. 重新生成 `priorities`（带文案的 UI 条目，最多 5 条）
4. 重新生成 `metrics`（全局汇总）
5. 重新排序 `opportunities`

复杂度 O(cases × opportunities) × 5 种派生，每次 React 更新都跑。叠上 useGame 的伪不可变 setState（A4），**每次 state 更新等于一次全量 UI 重渲染 + 一次全量派生重算**。

小局（4-8 cases）感觉不出来。Arena 跑 100 局自动回归时，每局几百次 setState，每次全量重算 —— 是 `.ts` 层面的性能地雷。

P2 把 `deriveSchedule / derivePriorities / deriveMetrics` 挪到 React selector（memoized on cases/opportunities refs）是双赢：**性能 + 存档瘦身 + state 纯化**。同时 P0 修掉 A4 的伪不可变才能让 memo 生效。

---

## 12. 关门问题 — 开工前必须回答

以下三个问题不回答就不动键盘，因为每一个都决定了 P0-P6 的形状。

**Q1. 目标玩家是谁？**
- 如果是"重度 FM-style 拟真玩家" → P4/P5 的 actor 深度是主菜
- 如果是"中度休闲策略玩家" → 把 P1 + P3 做到位就够，P5 可以先搁
- 如果"两者都要" → 难度维度要分两档，balance.ts 要可切档

**Q2. 未来 12 个月内容产出的节奏？**
- 每月发 1 剧本 → P3 (data-driven) 必做，不然内容团队会堵在 engineering 上
- 每季度 1 剧本 → 现状的 scenario-generation 管线足以，P3 可以延后
- 内容几乎不动，重点打磨 core loop → P3 可以全部跳过，集中做 P1/P2/P4

**Q3. 存档的语义到底是什么？**
- 如果是"完整恢复玩家上次的视觉 + 状态" → 现在的 snapshot 是合理的
- 如果是"恢复 game state 的最小充要描述" → 现在存的 `runContext.scenarioSnapshot` / `schedule` / `priorities` 全是赘肉，应该只存 `seed + day + actions[]`（回放生成）
- 如果"二者都要" → 分成 `snapshot.json`（UI 恢复）+ `replay.json`（可验证回放），**这直接决定 P5 能不能做 shadowListings**

**Q1 → Q2 → Q3 这个次序也不是随便排的**：目标玩家决定内容节奏，内容节奏决定存档语义。反过来都是错的。

---

## 附录 A · 最重要的 25 处代码引用

**架构 / 核心骨架**
1. `engine.ts:86–102` — 17 步 tick 硬编码顺序
2. `engine.ts:6` — domain → application 反向依赖起点
3. `useGame.ts:302–307` — 伪不可变 setState（潜在 memo 炸弹）
4. `useGame.ts:34,87,287` + `utils.ts:22-23` — RNG 边界漏 + 静默 fallback
5. `gameState.ts:519-550` — `updateDerivedState` 第二神函数
6. `gameState.ts:574-645` — `deriveSchedule/derivePriorities` UI 文案写进 state
7. `gameState.ts:292-417` — 90 行 legacy adapter 常驻

**模拟 / actor 被动**
8. `marketEngine.tickCases:50–119` — 业主被动衰减，无主动行为
9. `marketEngine.ts:43-48` — 客户只做随机抖动
10. `opportunityEngine.ts:101-104` — 客户 1:1 锁定（显式 filter）
11. `opportunityEngine.ts:61` — 漏斗推进靠 `chance(0.35)`
12. `marketEngine.ts:57–59, 80–92` — personality 三元判定（老系统）
13. `marketEngine.ts:60` — `scenarioSnapshot.world.ownerArchetypes` 四级访问（新系统）

**事件与公式**
14. `eventEngine.triggerRandomEvent:6–58` — 3 条硬编码事件分支
15. `eventEngine.fireScheduledEvents:60–100` — 9 种标量增量袋
16. `competitionEngine.shouldLoseToRival:30–103` — 整个项目唯一深度逻辑，只用来算"被抢"
17. `scoring.ts:29–48` — `CompetitivenessSnapshot` drivers 模板（泛化锚点）
18. `actionResolvers.ts:356–398` — `resolveNegotiation` 6 项加权 + 魔法系数
19. `opportunityEngine.computeCustomerFit:159–167` — 匹配度公式
20. `actionResolvers.ts:386–390` — `priceFactor === 1` magic proxy
21. `actionResolvers.sellCase:408` — 佣金 `× 0.01 × 0.25 × 10 / 10` 四乘四除
22. `actionResolvers.ts:41,61,97` 等 13 处 — `caseItem: any` opt-out

**资产**
23. `localAdversarialSelfPlayArena.ts` — 未利用的 golden master 资产
24. `budget.ts:1-82` — 事件溯源模板（`id/day/kind/amount/balanceAfter/title/detail`）
25. `scenario-generation/*` 2080 行 — 运行期忽略 80% 投入
26. `resultEvaluation.ts:201-538` — 结局叙事与三维评分的好范例（但基于最终快照反推）

---

## 附录 B · 如果只做一件事……

**只做 P0。**

> 因为 P0 做完，你就能用自对弈 diff 来验证后面任何一步改不改。没有 golden master 的架构改造是赌博。

---

## 附录 C · 为什么 v2 的诊断不够

v2 把"架构"和"模拟"分成两章写，用户追问"怎么让每天的模拟更生动/有规模/有质量"时，v2 答不了。因为它没意识到：

- "生动" 的根本障碍是 actor 没拆 —— 这是**架构问题**
- "规模" 的根本障碍是 RNG 不干净，不敢在后台跑 shadow —— 这是**架构问题**
- "质量" 的根本障碍是变化不归因 —— 这是**架构问题**

**模拟深度不是美术/策划问题，是架构问题。** v3 的核心贡献就是把这一层戳破。
