# Selling-Houses 深度架构分析

> 基于对全部源码的逐行阅读，本文档试图回答三个问题：
> 1. 这个系统的每一个齿轮如何咬合？
> 2. 当前架构的真实问题在哪里？
> 3. 下一步应该往哪里走？

---

## 第1章 系统总览

### 1.1 一句话定义

Selling-Houses 是一个**房产经纪业务模拟引擎**——玩家扮演经纪人，在有限天数内管理多个房源，通过业主关系维护、客户开发、价格策略、竞争应对等操作，将房源推进到成交。

这不是一个"点击就成交"的放置游戏。系统的核心设计意图是：**每一个成交都是多重因果链汇聚的结果，玩家必须同时管理多条因果链，而任何一条链的断裂都可能导致失败。**

### 1.2 核心实体

系统有 7 个核心实体，它们的交互构成了整个游戏：

| 实体 | 数量 | 核心状态 | 生命周期 |
|------|------|----------|----------|
| **Case（房源）** | 3-6 个 | trust/patience/urgency/heat/competitiveness/windowDays | active → sold/withdrawn/lost_to_rival |
| **Opportunity（机会/客户线索）** | 动态，最多4个/房源 | intent/confidence/stageIndex/daysLeft | active → won/lost/closed |
| **Customer（客户）** | 30-60 个 | interest/confidence/fatigue/churnRisk/activity | 浏览→接触→比较→决策 |
| **Market（市场单元）** | 3-6 个 | demandHeat/supplyPressure/competitivePressure/sentiment | 持续波动 |
| **RivalListing（竞对房源）** | 2-36 个 | heat/freshness/leadSiphonPower/ownerAnchorPower | 创建→售出/撤回 |
| **RivalStore（竞对门店）** | 1-3 个 | leadCapturePower/storeType | 持续存在 |
| **ClosedDeal（已成交记录）** | 动态 | soldPrice/strategyId/evidenceChain | 不可变 |

### 1.3 三层架构

```
┌─────────────────────────────────────────────┐
│  Application Layer (gameTransitions.ts)      │
│  - executeGameAction：克隆→执行→Receipt→对账  │
│  - executeScenarioAction：验证→扣费→Delta写入  │
│  - Receipt 管道：SourceRecord → CausalEvent   │
├─────────────────────────────────────────────┤
│  Domain Layer (domain/)                      │
│  - 引擎：engine.ts 编排 25 步 tick            │
│  - 评分：scoring.ts D1/D2/D3 竞争力           │
│  - 成交：dealClosing.ts 确定性成交公式         │
│  - 竞对：rivalListingEngine.ts + competitionEngine.ts │
│  - 配置：balance.ts 247 行参数空间             │
├─────────────────────────────────────────────┤
│  Core Layer (core/)                          │
│  - world-state：canonical 写入、Receipt、对账  │
│  - evaluation：评分边界、模型分离              │
│  - consensus：成交共识、证据链                 │
└─────────────────────────────────────────────┘
```

关键约束：**Core 层不知道 Domain 层的存在**。Core 层的纯函数只接收原始值（number, string），不接收 GameState 或 Case。Domain 层的 helper 函数负责将 Core 层的纯函数结果写回 GameState，同时维护 canonical-mirror 一致性。

### 1.4 双轨架构

系统同时运行两条数据轨道：

**Legacy 轨道**：直接修改 `Case.*` 字段。这是原始路径，大量代码仍然走这条路。

**New 轨道**：通过 `SourceRecord → CausalEvent → Receipt` 管道。这是正在建设中的路径，目标是让每一次状态变化都有完整的溯源链。

两条轨道不是"要么走这条要么走那条"——同一个字段可能同时被两条轨道写入。canonical-mirror 模式就是用来协调这个冲突的。

### 1.5 游戏节奏

一轮游戏的核心节奏：

1. **开局**（Day 1-3）：建立业主关系，完成首次面访，摸底价格
2. **蓄水**（Day 4-14）：开发客户，推进漏斗，调整价格策略
3. **攻坚**（Day 15-25）：聚焦高潜力房源，谈判推进，处理竞对压力
4. **收官**（Day 25+）：剩余窗口期的房源做最后冲刺，核销失败的盘

这个节奏不是硬编码的，而是由 `windowDays`（业主给的窗口期）、`trust`（信任度衰减）、`urgency`（紧迫度增长）三个维度自然涌现的。系统的设计目标不是让玩家"按照这个节奏玩"，而是让玩家"必须主动管理节奏"——如果你不主动推进，窗口期会自然耗尽，业主会核销房源。

---

## 第2章 架构解剖

### 2.1 Canonical-Mirror 模式

这是整个系统最重要的架构模式，也是理解后续所有数据流的关键。

**问题**：trust、patience、urgency、windowDays 这四个字段，既存在于 `Case` 接口上（供 UI 和老代码读取），又需要 canonical 追踪（供 Receipt 管道溯源）。如果两个写入路径不同步，就会产生"幽灵数据"——UI 显示的值和 canonical 状态不一致。

**解决方案**：每次写入 canonical 状态后，同步更新 Case 上的 mirror 字段。

```
写入请求
    │
    ▼
Core 纯函数（trustWriteSource / readinessWriteSource）
    │  输入：currentValue, delta, clampMin, clampMax
    │  输出：{ newValue, record }
    ▼
Domain Helper（applyBrokerOwnerTrustDelta / applyOwnerCasePatienceDelta / ...）
    │  1. 读取 canonical state（或从 Case mirror 中懒初始化）
    │  2. 调用 Core 纯函数
    │  3. 写入 canonical state（GameState.runtimeBrokerOwnerRelations）
    │  4. 同步 mirror（caseItem.trust = canonicalState.trustValue）
    │  5. 发出 SourceRecord
    ▼
Application Layer（gameTransitions.executeGameAction）
    │  1. 执行动作（触发 Domain Helper）
    │  2. 构建 ActionReceipt（包含 fieldDeltas）
    │  3. 变异证明对账（before/after snapshot）
```

**Canonical State 存储**：

| 字段 | Canonical 容器 | Mirror 字段 | 初始化函数 |
|------|---------------|-------------|-----------|
| trust | `runtimeBrokerOwnerRelations` | `Case.trust` | `initializeTrustRelations` |
| patience | `runtimeOwnerCaseReadinessStates` | `Case.patience` | `initializeReadinessStates` |
| urgency | `runtimeOwnerCaseReadinessStates` | `Case.urgency` | `initializeReadinessStates` |
| windowDays | `runtimeOwnerCaseReadinessStates` | `Case.windowDays` | `initializeReadinessStates` |

**缺失的 canonical 追踪**：heat。当前有 20+ 处直接写入 `caseItem.heat`，没有 canonical 追踪。这意味着无法回答"热度为什么变了"——这是当前架构最大的缺口。

### 2.2 三层写入架构

每个核心维度的写入都经过三层：

**第一层：Core 纯函数**

```typescript
// trustWriteSource(currentTrust, delta, clampMin, clampMax) → { newTrust, record }
// 输入是原始数值，输出是新值 + 不可变记录
// 无副作用，可单元测试，可重放
```

**第二层：Domain Helper**

```typescript
// applyBrokerOwnerTrustDelta(state, caseItem, delta, reason, clampMin, clampMax, tags, evidence)
// 1. ensureBrokerOwnerTrustState(state, caseItem) — 懒初始化 canonical state
// 2. 调用 trustWriteSource
// 3. 写入 canonical state
// 4. 同步 mirror: caseItem.trust = canonicalState.trustValue
// 5. 返回 TrustWriteResult（包含 record）
```

**第三层：Application Layer**

```typescript
// executeGameAction(state, actionId, caseId, optionId, ...)
// 1. 克隆状态（安全回滚）
// 2. executeAction → 触发 Domain Helper
// 3. 构建 ActionReceipt（从 pendingReceiptSnapshots 中提取）
// 4. applyReceiptToGameState → 写入 Receipt 管道
// 5. 变异证明对账：比较 before/after snapshot，确保预期变化和实际变化一致
```

这个三层架构的设计意图是：**每一层只做一件事**。Core 层只计算，Domain 层只写状态，Application 层只管事务。

### 2.4 价格不变量链

四个价格字段构成严格的不变量链：

```
marketPrice ──(+5)──▸ bottomPrice ──(+0)──▸ ownerPsychPrice ──(+1)──▸ askPrice
```

**不变量规则**（由 `normalizeOwnerPriceAnchors` 强制执行）：

1. `bottomPrice >= marketPrice + 5`：底价至少比市场价高 5（最低保护）
2. `ownerPsychPrice >= bottomPrice`：心理价不低于底价
3. `askPrice >= ownerPsychPrice + 1`：挂牌价至少比心理价高 1

**为什么是 +5 和 +1**：

- `OWNER_BOTTOM_ABOVE_MARKET_SPREAD = 5`：底价与市场价的最低差值，防止"底价等于市场价"导致业主完全没有议价空间
- `ASK_ABOVE_BOTTOM_SPREAD = 1`：挂牌价与心理价的最低差值，确保挂牌价总是严格高于业主心理底线

这个不变量链在三个地方被强制执行：

1. **updateMarkets**：市场引擎更新 marketPrice 后，立即调用 `normalizeOwnerPriceAnchors`
2. **动作执行器**：价格调整动作（ask-psychological-price, adjust-listing-price）修改价格后，立即调用 `normalizeOwnerPriceAnchors`
3. **updateDerivedState**：每日结算后，对每个 case 重新执行 `normalizeOwnerPriceAnchors`

如果在任何一处遗漏了 `normalizeOwnerPriceAnchors` 调用，价格链可能断裂——比如 askPrice 变得低于 ownerPsychPrice，导致价格语义混乱。

### 2.5 16型业主画像系统

业主画像系统是游戏深度的核心来源。它决定了每个业主对不同操作的反应差异。

**四个维度**：

| 维度 | 取值 | 分数 | 语义 |
|------|------|------|------|
| price_anchor | strong/weak/unknown | 78/30/50 | 价格锚定强度 |
| time_window | short/long/unknown | 82/28/50 | 时间窗口紧迫性 |
| transaction_experience | high/low/unknown | 25/72/50 | 交易经验 |
| decision_style | self_decide/guided_or_joint/unknown | 32/75/50 | 决策风格 |

**10 个行为维度**（从四个原始分数派生）：

| 行为维度 | 公式 | 范围 | 影响的逻辑 |
|----------|------|------|-----------|
| priceSensitivity | = priceScore | 30-78 | 价格策略信任损失、溢价惩罚 |
| heatSensitivity | = exp*0.6 + price*0.4 | 30-60 | 低热度信任损失触发 |
| timePressure | = timeScore | 28-82 | 日度紧迫度增长 |
| urgencyBias | = time*0.6 + exp*0.25 + dec*0.15 | 28-63 | 紧迫度偏向 |
| trustDecayMultiplier | = 0.5 + (time*0.4+price*0.35+exp*0.25)/100 | 0.5-1.5 | 未触达信任衰减倍率 |
| holdStoryTrustDelta | = -(2 + price/100*2 + exp/100*1) | -2 to -5 | 守价策略信任损失 |
| smallCutTrustDelta | = -(1 + price/100*1.5) | -1 to -2 | 小幅调价信任损失 |
| deepCutTrustDelta | = -(3 + price/100*3 + exp/100*2) | -3 to -7 | 明显调价信任损失 |
| preferredPricingBias | = price*0.6 + exp*0.25 + (100-dec)*0.15 | 30-70 | 价格策略偏好 |
| communicationNeed | = dec*0.6 + exp*0.4 | 32-72 | 沟通需求强度 |

**三个布尔标志**：

- `isUrgent = time_window === 'short'` → 影响日度紧迫增长、窗口续期、谈判信任权重
- `isPragmatic = price_anchor === 'weak'` → 影响价格紧密度信任增益、溢价惩罚倍率
- `isEmotional = price_anchor==='strong' AND time_window==='short' AND transaction_experience==='low'` → 影响低热度信任损失、未触达热度衰减

**遗留人格回退**：在首次面访完成之前，画像维度未建立，系统使用 `personality` 字段（pragmatic/emotional/urgent）作为回退。回退值是硬编码的固定分数。首次面访完成后，`ownerProfilingMemory` 开始积累实际画像数据，逐步替换回退值。

### 2.6 Competitiveness 评分体系

竞争力（competitiveness）是系统的"体温计"——它综合反映了一个房源的成交可能性。

**三维度结构**：

```
competitiveness = d1 × 0.50 + d2 × 0.25 + d3 × 0.25 + competitivenessBonus
```

**D1：市场活力**（Market Vitality，权重 0.50）

D1 衡量"客户漏斗的质量"——有没有客户、客户在哪个阶段、推进速度如何。

| 信号 | 权重 | 计算方式 | 归一化 |
|------|------|----------|--------|
| poolSize | 0.15 | log₂(poolSize+1) × 20 | 过去7天新客户数的对数 |
| activeContacts | 0.20 | log₂(activeContacts+1) × 20 | 活跃客户数的对数 |
| lateStageThickness | 0.30 | (funnelWeight/baseline) × 40 | 后段客户的加权厚度 |
| advanceSpeed | 0.20 | (advanceCount/baseline) × 30 | 7天内阶段推进次数 |
| stagnationRisk | 0.15 | stagnationCount × 10 | 停滞3天以上的客户数 |

funnelWeight 的阶段加权：出价×5, 见面沟通×4, 再次看房×2, 已看房×1.5。这个加权反映了"越接近成交的客户越有价值"的业务直觉。

**D2：产品力**（Product Quality，权重 0.25）

D2 衡量房源的客观品质。7 个轴的加权评分：

| 轴 | 权重 | 语义 |
|-----|------|------|
| layout | 0.20 | 户型 |
| neighborhood | 0.20 | 区位 |
| decor | 0.15 | 装修 |
| amenity | 0.15 | 配套 |
| light | 0.10 | 采光 |
| floor | 0.10 | 楼层 |
| structure | 0.10 | 结构 |

D2 是三个维度中最"稳定"的——axisScores 在游戏过程中几乎不变（只有 qualityStory 会间接影响）。这意味着 D2 的方差主要来自房源的初始品质差异。

**D3：业主配合度**（Owner Cooperation，权重 0.25）

D3 衡量业主端的谈判空间和配合意愿。

| 信号 | 权重 | 计算方式 |
|------|------|----------|
| priceFlex | 0.25 | (askPrice - ownerPsychPrice) / askPrice × 10 × 100 |
| patience | 0.25 | 直接取 patience 值 |
| urgency | 0.20 | 直接取 urgency 值 |
| recentCooperation | 0.20 | 直接取 trust 值 |
| consistency | 0.10 | 固定基线 80 |

priceFlex（价格灵活度）的计算揭示了三价分离的关键作用：`(askPrice - ownerPsychPrice) / askPrice` 表示挂牌价和心理价之间的"议价空间"。如果 ownerPsychPrice 接近 askPrice，议价空间就极小，D3 的 priceFlex 信号就会很低。

**competitivenessBonus 机制**：

动作执行器不直接写 `competitiveness`，而是写 `competitivenessBonus`。Bonus 在每日 tick 中衰减（乘以 0.6），然后加到 D1×0.5 + D2×0.25 + D3×0.25 的结果上。

为什么用 Bonus 而不是直接写？因为 `updateCompetitiveness` 每日完全重算——如果动作直接写了 competitiveness，重算时会被覆盖。Bonus 是"动作的短期效果"，D1/D2/D3 是"系统的基础面"，两者叠加才是完整的竞争力。

衰减率 0.6 意味着：bonus 在 3 天后约剩 22%，5 天后约剩 8%。这确保了动作的效果是"有即时感但不持久"——你需要持续操作来维持竞争力。

---

## 第3章 核心机制深度解析

### 3.1 确定性成交系统

成交是整个系统的终极事件。它的设计哲学是：**成交是因果链汇聚的结果，不是掷骰子。**

#### 3.1.1 成交概率公式

```typescript
successScore = intent × 0.46 + confidence × 0.24 + trust × weight + competitiveness × 0.16
             - max(0, askPrice - marketPrice) × 0.6 + strategy.shift

closeProbability = clamp(round(successScore × playerDealClosingScale), 0, 95)
```

其中 `trust × weight` 的 weight 取决于业主是否紧迫：紧迫业主 trust×0.25，否则 trust×0.18。这个差异反映了紧迫业主对信任更敏感——如果你没有建立起足够的信任，紧迫业主不会把房子交给你。

`strategy.shift` 来自谈判策略：hold=-6, balanced=+4, close=+9。策略选择直接调整成交概率的起点——守价策略把概率拉低，逼定策略把概率推高。

`playerDealClosingScale` 是难度调节旋钮：warmup=1.0, easy=1.0, standard=0.84, advanced=0.72, hard=0.78, extreme=0.76。注意 hard 比 advanced 高——hard 难度的挑战不在成交本身，而在客户开发和竞对压力。

#### 3.1.2 五个硬约束

即使 closeProbability >= 50，如果有任何一个硬约束触发，成交仍然被阻断：

| 约束 | 条件 | 阻断码 | 语义 |
|------|------|--------|------|
| price_budget | soldPrice > budgetMax | 价格预算不足 | 客户买不起 |
| relation_trust | trust < 60 (trustGate) | 关系信任不足 | 客户不信任经纪人 |
| market_capacity | availableMarketDealSlots <= 0 | 市场容量耗尽 | 本期市场已满 |
| player_capacity | playerClaimedDeals >= playerAllowedDeals | 玩家名额已满 | 你已经成交太多了 |
| evidence_weak | 无前4个block但raw < 50 | 证据不够充分 | 概率太低 |

硬约束的优先级（最弱链归因）：price_fit > relation_trust > capacity > opportunity_evidence > case_heat > competition_pressure。

**市场容量机制**：`marketDealCapacity21d` 控制每21天市场上最多成交多少套。warmup/easy=5, standard/advanced=4, hard/extreme=3。这不是"限制玩家"，而是模拟真实市场的存量——市场上只有这么多买家有预算且愿意成交。

#### 3.1.3 证据链

每次成交尝试都记录证据链，追踪8个维度的当前值：

```typescript
evidenceChain: {
  competitionPressure, caseHeat, caseCompetitiveness,
  opportunityIntent, opportunityConfidence,
  relationTrust, trustFromRelation, ownerUrgency
}
```

证据链的价值不在于成交本身——而在于**失败归因**。当一个客户在谈判中崩溃，系统通过证据链告诉玩家"最弱的环节在哪里"：是信任不够？是竞对压力太大？还是价格差距？

#### 3.1.4 失败后果

谈判失败不是"回到原点"——它有不可逆的后果：

- intent -= strategy.loss（hold=14, balanced=8, close=5）
- confidence -= 8
- daysLeft = 2（只剩2天挽回）
- trust -= trustHit（按策略×业主画像组合，范围1-8）
- 如果 intent < 35 → 机会直接流失

守价策略失败损失最大（-14 intent），但守价成功的价格保护最好（priceFactor=1.0）。这是一个风险-收益权衡。

### 3.2 客户引擎：推模型

客户引擎独立模拟每个客户的内心状态，然后通过 `syncOpportunityFromCustomer` 桥接到机会引擎。

#### 3.2.1 客户决策风格

根据 urgency 和 activity 划分三种决策风格：

| 风格 | 条件 | 阶段推进阈值 |
|------|------|-------------|
| decisive | urgency>=76 AND activity>=72 | 64 |
| balanced | 默认 | 70 |
| hesitant | priceSensitivity>=72 OR activity<=54 | 78 |

果断型客户更容易推进（阈值64），犹豫型客户需要更多信心（阈值78）。这意味着同样的 intent=72，果断型客户已经推进到下一阶段，犹豫型客户还在犹豫。

#### 3.2.2 每日兴趣增量

```
interestDelta = caseHeatBoost + trustBoost - fatiguePenalty - comparePenalty
             + interactionBoost - rivalryPenalty + priceAdvantage + random[-4,4]
```

| 因子 | 公式 | 语义 |
|------|------|------|
| caseHeatBoost | (heat-55)/10 | 房源热度>55推高兴趣，<55拉低 |
| trustBoost | (advisorTrust-50)/12 | 经纪人信任>50推高，<50拉低 |
| fatiguePenalty | (fatigue/14) × stagnationScale | 疲劳越高，兴趣越低 |
| comparePenalty | 2.5 × stagnationScale（如果比较中且非选中） | 比较中的客户兴趣流失 |
| interactionBoost | min(8, interactions×1.5) | 互动越多，兴趣越高（上限8） |
| rivalryPenalty | competingCaseIds.length × 1.2 | 竞对房源越多，兴趣越分散 |
| priceAdvantage | 2.8（如果fit>=70 且 askPrice<=marketPrice×1.01） | 价格优势奖励 |

#### 3.2.3 每日置信度增量

```
confidenceDelta = (trust-55)/14 + (d3-50)/16
               - (priceSensitivity/80) × stagnationScale
               - rivalryPenalty × 0.7 + random[-3,3]
```

置信度比兴趣更依赖信任和 D3——这反映了"客户对经纪人能力的信心"和"客户对业主配合度的信心"。

#### 3.2.4 疲劳与流失

**疲劳**：
- 参与/谈判中：+4 × stagnationScale
- 其他状态：+1 × stagnationScale
- 当天被触及：-3
- 钳制 [0, 100]

**流失风险**：
- 空闲：+4 × stagnationScale
- 比较中：+3 × stagnationScale
- 疲劳>70：+4 × stagnationScale
- 当天被触及：-5
- 钳制 [0, 100]

`stagnationScale` 是难度调节旋钮：warmup/easy=0.85, standard/advanced=1.08/1.25, hard/extreme=1.25/1.40。高难度下，疲劳和流失累积更快——不是客户变少了，而是客户更不耐烦。

#### 3.2.5 客户反馈到房源

客户状态不是孤立的——它反馈到房源的热度和信任：

- 无活跃客户 → heat-3, trust-1.5
- 有活跃客户 → heat += (avgInterest-52)/10 + selected×1.2 + active×0.5 - comparing×1.1
- 信任增量 → (avgConfidence-50)/14 + negotiating×0.7 + selected×0.5 - comparing×0.45

这个反馈环确保了"客户对房源的态度会影响房源本身的状态"——如果客户都在流失，房源热度和业主信任也会下降。

### 3.3 机会引擎：拉模型

机会引擎独立演化每个机会的状态，基于案例级信号（heat, d1, 价格）而非客户属性。

#### 3.3.1 每日意图增量

```
intentDelta = (heat-55)/10 + (d1-50)/16 + random[-4,4] - pricePenalty
```

pricePenalty = max(0, askPrice-budgetMax)/9。价格每超出预算9万，意图减1。

#### 3.3.2 每日置信度增量

```
confidenceDelta = (d3-50)/14 + random[-3,3]
```

置信度只依赖 D3（业主配合度）——不依赖信任。这是一个重要的设计选择：机会引擎的"置信度"衡量的是"这个房源的业主是否好打交道"，而不是"经纪人是否可信"。

#### 3.3.3 阶段推进

条件：stageIndex < 6 且 intent >= 82 且 chance(0.35 × funnelProgressionScale)

`stageAdvanceIntentThreshold = 82` 是一个硬阈值——意图必须达到82才有推进资格。但达到阈值后还需要概率检查：0.35 × funnelProgressionScale。`funnelProgressionScale` 按难度调整。

推进成功后：stagnationTicks 重置为 0，daysLeft 重置为 5。这给了5天窗口来继续推进到下一阶段。

#### 3.3.4 被动线索生成

```
baseChance = (heat/240 + d1/600) × passiveLeadBaseMultiplier × leadSupplyScale
```

高热度（heat/240）和高市场活力（d1/600）增加自动生成线索的概率。如果房源被焦点选中，概率额外乘以 `passiveLeadFocusedMultiplier`。

渠道选择：focused → 小红书，否则随机。这模拟了"被推到首页的房源更容易在社交媒体上获得曝光"。

#### 3.3.5 机会创建

新机会的初始值：

```
intent = clamp(46 + bonus + fit×0.24 + heat×0.14 + activity×0.12 + channelQuality×10 - pricePenalty, 35, 89)
confidence = clamp(48 + fit×0.25 + trust×0.16, 30, 92)
```

fit（契合度）对 intent 和 confidence 都有贡献，但方式不同：
- intent: fit×0.24（直接的契合度兴趣）
- confidence: fit×0.25（契合度带来信心）

如果 bonus >= 14（高质量渠道），机会直接从 stageIndex=1 开始（跳过线上咨询阶段），并且 daysLeft=4（比默认5天更紧迫）。

### 3.4 双引擎桥接

客户引擎和机会引擎通过 `syncOpportunityFromCustomer` 桥接。这是一个"推→拉"的单向同步：客户引擎的状态推送到机会引擎。

**桥接时机**：每当 `touchCustomersForCase` 被调用时（动作执行器中），客户引擎计算完新的兴趣/置信度后，调用同步函数将结果写入对应机会的 intent/confidence。

**关键问题**：两个引擎的公式不同——客户引擎考虑了 fatigue/compare/interaction/rivalry，机会引擎考虑了 d1/pricePenalty。当两者对同一个客户-案例对给出矛盾信号时，桥接的行为是以客户引擎为准（覆盖机会引擎的值）。

这意味着：**客户引擎是真相来源，机会引擎是辅助视图。** 但在每日 tick 中，机会引擎独立演化（不受客户引擎影响），只有在动作触发时才同步。这导致了一个时间差：tick 期间两个引擎可能不一致，直到下一个动作触发同步。

### 3.5 竞对引擎

#### 3.5.1 竞对房源创建

72% 的几率目标活跃案例的 marketCellId（同区域竞争），28% 随机市场。每个竞对房源有：

- `leadSiphonPower`：抢客能力，范围 [0, 100]
- `ownerAnchorPower`：业主锚定力，范围 [0, 100]
- `freshness`：新鲜度，初始约 62±8
- `heat`：热度，初始约 56±8

创建前通过 `shouldMaterializeRivalListing` 门控，概率由 `rivalListingSpawnScale` 控制。

#### 3.5.2 竞对房源生命周期

每日：freshness -= random[4,8]（新鲜度每日衰减4-8点），heat += random[-3,4] + freshness/80。

当 daysLeft<=0 或 freshness<=8 时，竞对房源尝试"认领"（售出）：
- 基础认领概率 55% × 缩放系数
- 认领成功 → 标记为 'sold'，尝试标记关联案例为 lost_to_rival
- 认领失败 → 标记为 'withdrawn'

#### 3.5.3 竞对压力应用

对每个活跃案例，找到最近的竞对房源，计算价格重叠度：

```
priceOverlap = clamp(1 - priceGap × 6, 0, 1)
nearestPressure = avg(overlap × (leadSiphonPower + ownerAnchorPower + heat) / 3)
adjustedPressure = nearestPressure × rivalOwnerPressureScale
```

如果 adjustedPressure < 34 → 跳过（压力太小不影响）

影响：
- heat -= (adjustedPressure/100) × rivalPressureHeatImpact
- trust -= (adjustedPressure/100) × rivalPressureTrustImpact
- opportunity.intent -= adjustedPressure/85
- opportunity.confidence -= adjustedPressure/110
- 高压力(>=58)有18%几率记录到事件日志

### 3.6 四层竞争威胁模型

竞争引擎 (`competitionEngine.ts`) 定义了四层威胁模型，用于判断"竞对是否可能抢走客户"：

**第一层：漏斗开放（pipelineOpening）**
条件：无活跃线索 + (热度<=34 或 压力>=16 或 溢价比>=0.075 或 价格差比>=0.085)

含义：如果你没有客户在接触，而且市场压力或价格差距够大，竞对就有可乘之机。

**第二层：价格与压力陷阱（priceAndPressureTrap）**
条件：(压力>=18 或 溢价比>=0.085 或 价格差比>=0.09) + (trust<=48 或 关系空白>=3天 或 windowDays<=2)

含义：价格偏高 + 关系脆弱 = 竞对可以直接用价格抢走客户。

**第三层：关系开放（relationshipOpening）**
条件：关系空白>=4天 且 trust<=58

含义：如果你4天没联系业主，信任又不高，业主可能被竞对说服换经纪人。

**第四层：信任崩溃（trustCollapse）**
条件：trust<=36

含义：信任已经崩了，业主随时可能走。

**防护机制**：如果 recentlyMaintained（关系空白<=2天 且 trust>=58），损失概率乘以 0.6。这意味着"定期维护业主关系"是最有效的竞对防御策略。

**原始概率公式**：

```
rawProb = 0.03 + pressureOverLine×0.008 + max(0, groupPremiumRatio-0.04)×1.8
        + max(0, priceGapRatio-0.055)×1.5 + brokerShadowLeads×0.035
        + (windowDays<=1 ? 0.05 : 0)
```

钳制 [0.005, 0.18]——每天最多18%的损失概率。这个上限确保了竞对威胁是"持续的侵蚀"而不是"突然的灾难"。

**组效应**（GroupEffects）：

当同一区域有多套房源时，会产生溢出效应：

- 溢价惩罚：premiumRatio × 100 × priceElasticity × 0.22
- 降价者拖累：最近降价的房源导致其他房源 heat -= priceElasticity×1.4, trust -= priceElasticity×0.35
- 售出溢出：同组房源售出后，其他房源 heat -= customerSpillover×6, urgency += customerSpillover×8

售出溢出尤其有趣——一套房成交后，剩余房源的热度反而下降（买家被吸走了），紧迫度上升（业主看到别人成交，焦虑增加）。

### 3.7 场景生成管线

场景生成是一个 5 步管线，从难度定义到可玩的游戏状态：

```
DifficultyProfile → pickBlueprint → buildSlotSelections → buildScenarioCase → assemble
```

#### 3.7.1 六个难度等级

| 等级 | 案例数 | 窗口期 | 信任 | 客户stagnation | 竞对份额 | 市场容量 |
|------|--------|--------|------|---------------|----------|---------|
| warmup | 3 | 10-16 | 高 | 0.85 | 0.75 | 5 |
| easy | 4 | 8-14 | 高 | 0.85 | 0.75 | 5 |
| standard | 5 | 7-12 | 中 | 1.08 | 1.15 | 4 |
| advanced | 5 | 6-10 | 中低 | 1.25 | 1.33 | 4 |
| hard | 6 | 5-8 | 低 | 1.25 | 1.46 | 3 |
| extreme | 6 | 4-7 | 极低 | 1.40 | 1.45 | 3 |

难度提升的方式不是"让数字更大"，而是**同时收紧多个维度**——窗口期更短、信任更难建立、客户更不耐烦、竞对更凶狠、市场容量更小。这确保了高难度下没有单一策略可以应对所有压力。

#### 3.7.2 八个场景蓝图

| 蓝图 | 核心挑战 | 角色配置 |
|------|---------|---------|
| warmup-clean-handoff | 基础流程 | anchor+2fragile |
| easy-relationship-recovery | 信任修复 | anchor+fragile+grind |
| easy-open-day-burst | 开放日冲刺 | anchor+2traffic+fragile |
| standard-double-market | 双市场平衡 | anchor+fragile+traffic+grind |
| standard-cross-pressure | 跨市场压力 | anchor+2fragile+grind+spoiler |
| advanced-window-crossfire | 窗口期交叉 | anchor+2fragile+grind+spoiler |
| hard-window-squeeze | 窗口期挤压 | anchor+2fragile+2grind |
| extreme-last-stand | 最后抵抗 | anchor+fragile+2grind+2sacrifice |

每个角色有不同属性偏向：
- **anchor**（锚点）：高信任、宽窗口——你的安全牌
- **fragile**（脆弱）：低信任、窄窗口——需要优先维护
- **traffic**（流量）：高热度、多客户——靠量取胜
- **grind**（苦战）：低竞争力、高竞对——需要持续投入
- **spoiler**（搅局）：高竞对压力、差价格——可能拖累同组
- **sacrifice**（牺牲品）：极端条件——几乎不可能成交

#### 3.7.3 难度评分五轴

```typescript
difficultyScore = windowPressure×0.22 + relationshipFragility×0.20
               + competitionCoupling×0.22 + pricingMisfit×0.14 + eventBurst×0.22
```

五轴等权分配（最重三轴各0.22），确保没有单一维度主导难度评分。生成的场景必须通过验证：案例数、竞争组、脚本事件、原型引用、价格不变量、窗口天数>=4、难度分数在目标区间内。

工厂最多尝试6次，每次种子递增9973（一个大质数），确保每次尝试产生不同的场景。
