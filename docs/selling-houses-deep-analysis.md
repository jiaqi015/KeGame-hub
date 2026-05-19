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

---

## 第4章 数据流全景

### 4.1 resolveOneDay：25步时序引擎

`resolveOneDay` 是系统的"心脏"——它定义了每一天发生的所有事情的顺序。顺序不是随意的：每一步都依赖前一步的输出，或者必须在前一步之前执行。

```
时间轴 ─────────────────────────────────────────────────────────────────────────▸

阶段1：市场设定          阶段2：竞对与客户            阶段3：结算与收尾
┌─────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│ 1. releaseSlots  │    │ 6. tickRivalStores    │    │ 18. settleNegotiation│
│ 2. updateMarkets │    │ 7. tickRivalListings  │    │ 19. tryClaimOpenMarket│
│ 3. tickSeasonality│   │ 8. applyRivalPressure │    │ 20. tickCases        │
│ 4. rollDailyEvent│    │ 9. tickCompanyPressure│    │ 21. spawnPassiveLeads│
│ 5. applyDailyEvent│   │10. applyCompanyPressure│   │ 22. triggerRandomEvent│
│                  │    │11. updateCustomers     │    │ 23. settleMarketSignals│
│                  │    │12. progressCustomerDemand│  │ 24. weeklyReview    │
│                  │    │13. applyRivalPullOnCust │   │ 25. tickBigWorld    │
│                  │    │14. tickOpportunities    │    │ 26. updateDerivedState│
│                  │    │15. applyCustomerFeedback│    │                      │
│                  │    │16. tickCompetition      │    │                      │
│                  │    │17. fireScheduledEvents  │    │                      │
└─────────────────┘    └──────────────────────┘    └──────────────────────┘
```

**为什么是这个顺序？**

1. **市场先行**（步骤1-5）：先确定当天的市场环境（需求热度、供给压力、季节性、随机事件），所有后续计算都基于当天的市场状态
2. **竞对次之**（步骤6-10）：竞对环境决定了玩家面对的外部压力，必须在客户计算之前
3. **客户演化**（步骤11-13）：客户在市场+竞对环境下独立演化
4. **机会联动**（步骤14-17）：机会引擎基于市场+客户+竞对信号演化，脚本事件可能改变状态
5. **谈判结算**（步骤18）：所有信号到位后，执行待处理的谈判回合
6. **案例收尾**（步骤20）：窗口期判断、信任衰减、核销——必须在结算之后，因为成交可能改变案例状态
7. **被动生成**（步骤21）：基于当天的最终热度/D1值生成新线索
8. **派生状态**（步骤26）：最后一步，基于所有变更重新计算竞争力、风险标记、故事线状态

### 4.2 动作执行管线

玩家执行一个动作时，经过的完整路径：

```
玩家点击动作
    │
    ▼
addTodayPlanItem(state, draft)          ← 验证：可用性、容量、精力、重复
    │  通过
    ▼
executeTodayPlanItem(state, itemId)     ← 执行入口
    │
    ▼
executeGameAction(state, actionId, caseId, optionId)
    │  1. 克隆状态（安全回滚）
    │  2. getActionAvailability() → 检查约束
    │     - 游戏是否结束
    │     - 案例是否活跃
    │     - 精力是否足够
    │     - 推广预算是否足够
    │     - 今天是否已触碰业主（对需要业主互动的动作）
    │     - 首次面访是否已完成（对不可重复动作）
    │     - 阶段是否匹配
    │     - 连续重复动作限制
    │     - 开放日冷却
    │     - 焦点会议：必须是周四
    │     - 谈判：必须有活跃机会在3-6阶段
    │  3. 如果被阻止 → 发出 blocked receipt，返回 false
    ▼
executeActionTransaction(state, action, caseItem)
    │  1. spendResources() → 扣除精力和推广预算
    │  2. executor({ state, action, caseItem, optionId })
    │     → 各动作执行器的具体逻辑
    │  3. applyActionStageRelation() → 推进机会阶段
    ▼
recordDomainEvent({ kind: 'action_executed', ... })
    │
    ▼
updateDerivedState(state)               ← 重算竞争力、风险标记等
    │
    ▼
buildPlayerActionReceiptSourceRecord()  ← 构建 Receipt
    │  - sourceId: isr-par-{day}-{actionId}-{caseId}
    │  - fieldDeltas: trust, patience, urgency 的变化量
    │  - confidence: 1.0（成功）或 0.9（被阻止）
    ▼
变异证明对账                             ← 比较 before/after snapshot
```

### 4.3 15个动作分类

| 类别 | 动作 | 核心效果 | 需要业主互动 |
|------|------|----------|-------------|
| **业主沟通** | first-visit | 首次面访，解锁画像 | ✓ |
| | weekly-feedback | 周反馈，续窗口 | ✓ |
| | deep-diagnosis | 深度诊断，揭示影子机会 | ✗ |
| **价格策略** | pricing-advice | 价格沟通，+trust/urgency | ✓ |
| | ask-psychological-price | 心理价试探，降低ownerPsychPrice | ✓ |
| | adjust-listing-price | 调价（守价/小幅/明显），+competitivenessBonus | ✓ |
| **营销推广** | story | 卖点重构，+competitivenessBonus/heat | ✗ |
| | xiaohongshu-boost | 小红书推广，+heat，可能生成机会 | ✗ |
| | broker-broadcast | 经纪人网络分发，+competitivenessBonus | ✗ |
| | private-referral | 私域转介绍，条件生成高质量机会 | ✗ |
| | focus-meeting-submit | 周四焦点会议，选中案例大幅加成 | ✓ |
| **看房与成交** | showing | 带看，推进机会阶段 | ✗ |
| | open-day | 开放日，大量生成机会 | ✗ |
| | sincerity-sale | 诚意金，锁定客户 | ✗ |
| | invite-customer-negotiation | 邀约谈判，进入成交判定 | ✗ |

**动作效果量化表**（competitivenessBonus 贡献）：

| 动作 | 策略 | competitivenessBonus | 热度 | 信任 |
|------|------|---------------------|------|------|
| pricing-advice | client-view | +2 | -- | +5 |
| pricing-advice | compete-view | +2 | -- | +3 |
| adjust-listing-price | hold-story | +6 | +3 | 画像依赖 |
| adjust-listing-price | small-cut | +9 | +6 | 画像依赖 |
| adjust-listing-price | deep-cut | +14 | +10 | 画像依赖 |
| story | certainty-angle | +7 | +4 | +2 |
| story | value-angle | +8 | +5 | +2 |
| xiaohongshu-boost | traffic-push | -- | +11 | -- |
| xiaohongshu-boost | precise-push | -- | +8 | -- |
| broker-broadcast | wide-network | +3 | +6 | -- |
| broker-broadcast | core-network | +4 | +4 | -- |
| deep-diagnosis | -- | +4 | +2 | +3~5 |
| focus-meeting-submit | 选中案例 | +6 | +12 | +5 |

### 4.4 Receipt 管道

Receipt 管道是"让系统说得清"的核心机制。它记录了每一次状态变化的完整因果链。

**SourceRecord → CausalEvent → Receipt 三阶段**：

1. **SourceRecord**：原始记录，记录"谁在什么时候做了什么"
   - `player_action_receipt`：玩家动作的完整记录
   - 包含：sourceId, replayKey, fieldDeltas, confidence, visibility

2. **CausalEvent**：因果事件，从 SourceRecord 中提取的"这件事导致了什么"
   - 存储在 `worldCausalEvents` 中
   - 可被投影系统消费

3. **Receipt**：最终收据，经过验证和格式化的记录
   - `applyReceiptToGameState` 写入 `actionReceiptHistory`
   - 包含：mutationProof（变异证明），证明预期变化和实际变化一致

**当前覆盖率**：只有玩家动作有完整 Receipt。市场事件、竞对压力、客户反馈、竞争损失等都没有 Receipt。这意味着这些事件虽然改变了状态，但无法追溯"为什么变了"。

### 4.5 每日数据流汇总

把所有引擎的数据流画在一起：

```
                    ┌──────────────┐
                    │   市场(Market) │
                    │ demandHeat    │
                    │ supplyPressure│
                    └──────┬───────┘
                           │ 影响
                    ┌──────▼───────┐
           ┌────────│  案例状态(Case)│────────┐
           │        │ trust/patience│         │
           │        │ urgency/heat  │         │
           │        │ windowDays    │         │
           │        │ competitiveness│        │
           │        └──────┬───────┘         │
           │               │                  │
    信任/耐心/紧迫     D1/D2/D3评分          价格链
    canonical写入      competitivenessBonus    marketPrice→bottomPrice
           │               │                  →ownerPsychPrice→askPrice
           │               │                  │
           ▼               ▼                  ▼
    ┌──────────┐   ┌──────────────┐   ┌──────────────┐
    │竞对引擎   │   │客户引擎       │   │机会引擎       │
    │rivalPressure│ │interest/conf │   │intent/conf   │
    │组效应     │   │fatigue/churn │   │stageIndex    │
    └─────┬────┘   └──────┬───────┘   └──────┬───────┘
          │               │                  │
          │         sync桥接(推→拉)           │
          │               │                  │
          └───────────────┼──────────────────┘
                          │
                   ┌──────▼───────┐
                   │  谈判/成交    │
                   │  dealClosing │
                   │  确定性公式    │
                   └──────┬───────┘
                          │
                   ┌──────▼───────┐
                   │  派生状态     │
                   │  DerivedMetrics│
                   │  RiskFlags    │
                   │  StorylineState│
                   └──────────────┘
```

关键洞察：**Case 是所有数据流的汇合点**。市场影响 Case，竞对影响 Case，客户反馈到 Case，动作修改 Case。Case 既是"被影响的客体"也是"影响其他实体的主体"——D1/D2/D3 从 Case 状态中计算，然后影响客户和机会的行为。

这种"中心辐射"模式意味着 Case 的状态一致性至关重要——任何一个字段的不一致都会沿辐射路径扩散。

---

## 第5章 参数空间详解

### 5.1 参数地图

balance.ts 的 247 行配置不是随机数字——它们构成了一个有结构的参数空间。按功能分组：

```
balance
├── scoring                          ← 竞争力评分
│   ├── competitivenessWeights       ← D1/D2/D3 权重
│   ├── d1SignalWeights              ← D1 五信号权重
│   ├── d1Normalization              ← D1 归一化参数
│   ├── d2AxisWeights                ← D2 七轴权重
│   ├── d3SignalWeights              ← D3 五信号权重
│   ├── d3Normalization              ← D3 归一化
│   ├── competitivenessBonusDecayRate ← Bonus 衰减率
│   ├── portalUrgencyWeights         ← 门户紧迫度权重
│   └── portalUrgencyNormalization   ← 门户紧迫度归一化
│
├── opportunities                    ← 机会/客户线索
│   ├── maxActivePerCase             ← 每案例最大活跃机会
│   ├── leadIntel                    ← 线索发现概率
│   ├── tick                         ← 机会每日演化参数
│   ├── passiveLead                  ← 被动线索生成
│   ├── create                       ← 新机会初始值
│   └── fit                          ← 客户契合度计算
│
├── actions                          ← 动作效果
│   ├── negotiation                  ← 谈判策略参数
│   └── sale                         ← 成交参数
│
├── market                           ← 市场引擎
│   ├── marketPulse                  ← 市场脉搏（4参数组）
│   ├── customerPulse                ← 客户脉搏（4参数组）
│   └── caseTick                     ← 案例日度参数（22个参数）
│
└── competition                      ← 竞对系统
    ├── rivalLoss                    ← 竞对损失参数（25个参数）
    └── groupEffects                 ← 组效应参数
```

### 5.2 敏感参数分析

以下参数对游戏节奏影响最大，调参时需要最小心：

**Tier 1：全局节奏控制器**

| 参数 | 当前值 | 影响 | 调参方向 |
|------|--------|------|---------|
| competitivenessWeights.d1 | 0.50 | D1 占竞争力一半——客户获取是核心 | 降低→房源品质更重要 |
| caseTick.urgentGrowthFixed | 固定值 | 紧迫业主每天紧迫度增长多少 | 增大→紧迫业主更快到红线 |
| caseTick.renewalTrustThreshold | 阈值 | 窗口续期需要多少信任 | 降低→更容易续期（宽容） |
| negotiation.closeThreshold | 50 | 成交概率50%才能成交 | 降低→更容易成交 |
| marketDealCapacity21d | 3-5 | 每21天市场最多成交几套 | 增大→市场更宽松 |

**Tier 2：反馈回路增益**

| 参数 | 当前值 | 影响 |
|------|--------|------|
| competitivenessBonusDecayRate | 0.6 | 动作效果3天后剩22%——决定"操作感"的持续性 |
| caseTick.ownerUntouchedTrustLoss | 数值 | 每天不碰业主损失多少信任——决定"维护压力" |
| caseTick.overpricedAskRate | 1.05+ | 挂牌价超市场价5%触发惩罚——价格纪律 |
| rivalLoss.rivalLossBaseProbability | 0.03 | 每天3%基础损失概率——竞对威胁的"底噪" |

**Tier 3：细节调节器**

| 参数 | 当前值 | 影响 |
|------|--------|------|
| d1SignalWeights.lateStageThickness | 0.30 | 后段客户厚度占D1的30%——"漏斗质量"的权重 |
| fit.layoutMatch | 18 | 户型匹配加分——客户匹配的粒度 |
| actions.negotiation.strategies.hold.shift | -6 | 守价策略降低6点成交概率——风险-收益权衡 |
| caseTick.emotionalLowHeatThreshold | 阈值 | 情绪型业主低热度触发信任损失的阈值 |

### 5.3 参数之间的隐性依赖

参数不是独立的——改变一个可能影响另一个的效果。

**依赖1：D1权重 ↔ 客户引擎**

D1 权重 = 0.50 意味着竞争力一半来自市场活力。但市场活力（D1）依赖客户引擎的输出——有客户才有 poolSize、activeContacts、funnelWeight。如果客户引擎的参数导致客户太少（stagnationScale 过大），D1 就会系统性偏低，所有案例的竞争力都会偏低。

**依赖2：信任衰减 ↔ 窗口续期**

信任衰减越快 → 信任越低 → 低于 renewalTrustThreshold → 无法续期 → 核销。这两个参数共同决定了"你能承受多少天不维护业主"。如果衰减快但续期阈值低，还可以续期；如果衰减快且续期阈值高，就是"必须每天维护"。

**依赖3：竞对压力 ↔ 价格策略**

竞对压力会降低 trust 和 opportunity.confidence。如果你选择守价（hold strategy），信任进一步下降。但如果你选择大幅调价（deep-cut），competitivenessBonus 增加但信任也下降（deepCutTrustDelta 是负的）。竞对压力 + 价格策略的组合决定了"要不要跟竞对打价格战"。

**依赖4：市场容量 ↔ 玩家成交预期**

`playerBaseDealExpectation21d`（warmup=2, extreme=0.66）和 `marketDealCapacity21d`（warmup=5, extreme=3）的比例决定了玩家的"市场占有率"预期。warmup 下玩家预期占 40%（2/5），extreme 下预期占 22%（0.66/3）。这个比例和竞对份额（rivalDealShareScale）必须协调——否则可能出现"市场容量3，玩家预期0.66，竞对预期3×1.45=4.35"的不合理情况。

---

## 第6章 问题与已修复

### 6.1 已修复：Competitiveness 死写

**问题**：9 个动作执行器直接写 `caseItem.competitiveness += N`，但 `updateCompetitiveness` 每日完全重算——从 D1/D2/D3 派生。动作的写入被覆盖。

**测量**：用 competitiveness-derivation-audit 测试，发现只有 1.2% 的预期加成实际流过派生路径。98.8% 的加成被重算覆盖。

**修复**：
1. 在 Case 接口增加 `competitivenessBonus` 字段
2. 9 处直接写入改为 `competitivenessBonus += N`
3. `updateCompetitiveness` 公式改为 `d1×0.5 + d2×0.25 + d3×0.25 + competitivenessBonus`
4. `tickCases` 中加入 `competitivenessBonus *= 0.6`（每日衰减）
5. 初始化时 `competitivenessBonus = 0`

**验证**：5 个 TDD 测试 + balance regression gate + five-x performance gate。

**根因**：competitiveness 被设计为"派生值"（从 D1/D2/D3 计算），但动作系统把它当作"可累加值"。两个设计意图冲突——派生值不该被直接写入。

### 6.2 已修复：MarketPrice 中间态不变量违反

**问题**：`updateMarkets` 更新 `caseItem.marketPrice` 后，没有调用 `normalizeOwnerPriceAnchors`。这导致价格不变量链可能断裂：marketPrice 变了，但 bottomPrice、ownerPsychPrice、askPrice 还没调整。

**影响窗口**：从 updateMarkets（步骤2）到 updateDerivedState（步骤26）之间的 24 个步骤中，价格链处于不一致状态。任何在这期间读取 bottomPrice < marketPrice 的逻辑都会看到异常值。

**修复**：在 updateMarkets 中 marketPrice 写入后立即调用 `normalizeOwnerPriceAnchors`。

**验证**：3 个 TDD 测试 + price-invariant gate。

### 6.3 已识别未修复：Heat 无 Canonical 追踪

**问题**：heat 有 20+ 处直接写入 `caseItem.heat`，没有 canonical 追踪。与 trust/patience/urgency/windowDays 的 canonical-mirror 模式不一致。

**影响**：
- 无法回答"热度为什么变了"
- 无法构建 heat 变化的 Receipt
- 投影系统遇到 heat 变化时只能降级为 legacyFallback

**20+ 处写入位点**：

| 来源 | 写入方式 | 语义 |
|------|---------|------|
| marketEngine.tickCases | `caseItem.heat -= loss`（3处） | 未触达/溢价/情绪型热度衰减 |
| pricingActionExecutors | `caseItem.heat = clamp(heat+N, 0, 100)` | 调价策略热度变化 |
| marketingActionExecutors | `caseItem.heat += N` | 营销动作热度提升 |
| ownerActionExecutors | `caseItem.heat += N` | 业主动作热度提升 |
| actionResolvers | `caseItem.heat += soldHeatBonus` | 成交热度奖励 |
| competitionEngine | `heat -= pressure` | 竞对压力热度损失 |
| applyCustomerFeedbackToCases | `heat += delta` | 客户反馈热度变化 |
| adjustCaseOpportunities | 间接影响 | 机会调整影响热度 |

**建议修复**：新建 `heatWriteHelper.ts`，参照 `trustWriteHelper.ts` 的 canonical-mirror 模式。

### 6.4 已识别未修复：双引擎公式不一致

**问题**：客户引擎和机会引擎用不同公式计算兴趣/意图和置信度。

**客户引擎**：
```
interestDelta = caseHeatBoost + trustBoost - fatiguePenalty - comparePenalty
             + interactionBoost - rivalryPenalty + priceAdvantage + random
```

**机会引擎**：
```
intentDelta = (heat-55)/10 + (d1-50)/16 + random - pricePenalty
```

**差异点**：
- 客户引擎有 fatigue/compare/interaction/rivalry，机会引擎没有
- 两个引擎都用 heat 但权重不同
- 客户引擎用 advisorTrust，机会引擎用 d1
- 同一个客户-案例对可能得到矛盾的信号

**影响**：sync 桥接时以客户引擎为准覆盖机会引擎，但在每日 tick 中两个引擎独立演化，产生时间差。

### 6.5 已识别未修复：Receipt 覆盖率不足

**当前覆盖率**：

| 事件类型 | 有 SourceRecord | 有 Receipt | 有 CausalEvent |
|----------|----------------|-----------|---------------|
| 玩家动作 | ✓ | ✓ | ✓ |
| 市场事件 | ✗ | ✗ | ✗ |
| 竞对压力 | ✗ | ✗ | ✗ |
| 客户反馈 | ✗ | ✗ | ✗ |
| 竞争损失 | ✗ | ✗ | ✗ |
| 窗口续期 | ✗ | ✗ | ✗ |
| 窗口核销 | ✗ | ✗ | ✗ |

只有玩家动作有完整的溯源链。其他事件虽然改变了状态（trust, heat, patience, urgency），但无法追溯"为什么变了"。

**影响范围**：投影系统在处理非动作事件时只能降级为 legacyFallback——直接读 Case 字段变化，无法给出归因。

---

## 第7章 迭代指导

### 7.1 优先级矩阵

按"影响面 × 实施风险"排序，形成清晰的依赖图：

```
P0: Heat 规范写入路径
 ├──▸ P1: 双引擎对齐审计
 │    └──▸ P2: 竞争力权重迁移
 └──▸ P6: Receipt 覆盖率补全

P3: 动作效果量化验证（无依赖，可并行）
 ├──▸ P4: 客户疲劳/流失模型校准
 └──▸ P5: 场景难度曲线验证
```

| 优先级 | 任务 | 影响面 | 风险 | 预计工时 |
|--------|------|--------|------|---------|
| P0 | Heat canonical 写入 | 高（20+位点） | 中（模板成熟） | 2-3天 |
| P1 | 双引擎对齐审计 | 高（核心一致性） | 高（可能发现根本冲突） | 3-5天 |
| P2 | 竞争力权重迁移 | 高（游戏节奏） | 中（需数据支撑） | 2天 |
| P3 | 动作效果矩阵 | 中（15个动作） | 低（纯测量） | 1-2天 |
| P4 | 疲劳/流失校准 | 中 | 中 | 2天 |
| P5 | 难度曲线验证 | 中 | 低 | 1天 |
| P6 | Receipt 覆盖补全 | 中 | 低 | 3-5天 |

### 7.2 P0：Heat Canonical 写入路径

**为什么是 P0**：heat 是唯一缺失 canonical 追踪的核心维度。20+ 处直接写入意味着投影系统无法解释热度变化。所有依赖 heat 的下游逻辑（客户兴趣、被动线索生成、风险标记）都缺乏归因。

**实施步骤**：

1. **新建 `heatWriteHelper.ts`**，结构对齐 `trustWriteHelper.ts`：
   ```typescript
   // Core 纯函数
   function heatWriteSource(currentHeat: number, delta: number, clampMin: number, clampMax: number)
     → { newHeat: number, record: HeatWriteRecord }

   // Domain Helper
   function applyCaseHeatDelta(state, caseItem, delta, reason, clampMin, clampMax, tags, evidence)
     → HeatWriteResult
   function setCaseHeat(state, caseItem, newHeat, reason, clampMin, clampMax, tags, evidence)
     → HeatWriteResult
   function clampCaseHeat(state, caseItem, reason, clampMin, clampMax)
     → HeatWriteResult
   ```

2. **扩展 GameState**：新增 `runtimeCaseHeatStates: Record<string, CaseHeatState>`

3. **逐个替换写入位点**（按调用频率排序）：
   - `marketEngine.tickCases`：3处 `-loss` → `applyCaseHeatDelta(state, caseItem, -loss, ...)`
   - `pricingActionExecutors`：3处 `= clamp(heat+N, 0, 100)` → `applyCaseHeatDelta(state, caseItem, N, ...)`
   - `marketingActionExecutors`：5处 `+= N` → `applyCaseHeatDelta`
   - `ownerActionExecutors`：2处 `+= N` → `applyCaseHeatDelta`
   - `actionResolvers`：1处 `+= soldHeatBonus` → `applyCaseHeatDelta`
   - `competitionEngine`：1处 `-= pressure` → `applyCaseHeatDelta`
   - `applyCustomerFeedbackToCases`：1处 `+= delta` → `applyCaseHeatDelta`

4. **在 updateDerivedState 中加一致性断言**：
   ```typescript
   for (const c of world.cases) {
     const canonical = world.runtimeCaseHeatStates[c.id];
     if (canonical && Math.abs(canonical.heatValue - c.heat) > 0.5) {
       console.error(`Heat mirror drift: case=${c.id}, canonical=${canonical.heatValue}, mirror=${c.heat}`);
     }
   }
   ```

5. **TDD 测试**：6个测试覆盖所有替换位点

**风险**：遗漏某处直接写入 → canonical 和 mirror 不一致。缓解：步骤4的一致性断言在开发期作为硬断言，上线后降级为日志。

### 7.3 P1：双引擎对齐审计

**为什么依赖 P0**：heat 的 canonical 追踪完成后，才能精确测量客户引擎中 caseHeatBoost 的实际值，从而与机会引擎的 (heat-55)/10 做公平比较。

**实施步骤**：

1. **写审计测试** `dual-engine-alignment.test.ts`：
   ```typescript
   // 对同一个客户-案例对，分别运行两个引擎
   const customerResult = tickCustomerInterest(customer, caseItem, world);
   const opportunityResult = tickOpportunityIntent(opportunity, caseItem, world);

   // 比较结果
   const intentDiff = customerResult.interestDelta - opportunityResult.intentDelta;
   const confDiff = customerResult.confidenceDelta - opportunityResult.confidenceDelta;

   // 记录差异场景
   if (Math.abs(intentDiff) > 10) {
     console.log(`Intent drift: customer=${customerResult.interestDelta}, opp=${opportunityResult.intentDelta}`);
   }
   ```

2. **明确桥接优先级规则**（当前代码以客户引擎为准，但这是隐式的，需要显式化）

3. **识别并记录矛盾场景**：什么条件下两个引擎给出方向相反的信号

### 7.4 P2：竞争力权重迁移

**前置条件**：P1 完成后才能做，因为双引擎对齐会影响 D1 的实际分布。

**迁移路径**：

```
当前:  D1=0.50, D2=0.25, D3=0.25
第一步: D1=0.45, D2=0.30, D3=0.25  ← 微调
第二步: D1=0.40, D2=0.35, D3=0.25  ← 目标
```

**每步验证**：
1. balance regression gate 通过
2. 归因覆盖率 >= 80%
3. 竞争力分布中位数仍在 [20, 80]
4. closeRate 变化不超过 ±10%

**决策依据**：先用 P1 的审计数据确认 D2 的方差是否足够（标准差 > 15），如果不够，不迁移——提高 D2 权重没有意义，因为房源品质差异不够大。

### 7.5 P3：动作效果量化验证

**为什么可以并行**：不依赖 P0/P1，只需要测量现有行为。

**实施步骤**：

1. 新建 `action-effect-matrix.test.ts`
2. 对每个动作，构造 6 种业主画像组合（3 personality × 2 price_anchor）
3. 执行动作，捕获所有 fieldDeltas
4. 输出矩阵：行=动作×策略，列=trust/patience/urgency/heat/competitivenessBonus

**预期产出**：一个数据表，可以直接用来验证"业主画像是否真的影响了动作效果"。如果某个动作在所有画像下效果相同，说明该动作没有利用画像信息——这是游戏深度缺失的信号。

### 7.6 P4-P6 概要

**P4：客户疲劳/流失校准**
- 跑30天模拟，统计客户决策时间分布
- 目标：50%的客户在10-14天内做出决策
- 调整 stagnationScale 和 churn 阈值

**P5：场景难度曲线验证**
- 对6个难度等级各跑3个场景
- 断言：相邻等级的关键指标（成交率、信任、竞争力）有统计显著差异
- 如果差异不显著，调整难度参数

**P6：Receipt 覆盖率补全**
- 优先覆盖市场事件和竞对压力（这两个改变 trust 和 heat，影响最大）
- 新建 `market_event_receipt` 和 `rival_pressure_receipt` SourceRecord 类型
- 在 updateMarkets 和 applyRivalPressure 中发出 source record

---

## 第8章 建设性建议

### 8.1 引入"信号强度"替代硬阈值

**问题**：系统大量使用硬阈值——trust<58 产生风险标记，urgency>=76 为果断型，poolSize>=7 产生正面 driver。58 和 57 的案例在行为上可能没有本质区别，但系统把它们分为两个类别。

**建议**：用 sigmoid 函数生成信号强度，替代 boolean 判断：

```typescript
function signalStrength(value: number, center: number, width: number): number {
  return 1 / (1 + Math.exp((value - center) / width));
}
// signalStrength(58, 58, 5) = 0.5
// signalStrength(53, 58, 5) ≈ 0.73（风险较高）
// signalStrength(63, 58, 5) ≈ 0.27（风险较低）
```

**适用场景**：风险标记、业主画像的布尔标志、driver 生成阈值。

**为什么暂不做**：硬阈值实现简单，性能确定。软阈值引入更多不确定性，需要更多的平衡验证。当 UI 需要更细腻的展示时再做。

### 8.2 客户引擎和机会引擎公式统一

**问题**：两个引擎用不同公式计算同一概念（兴趣/意图、置信度），通过 sync 桥接。

**建议**：不合并引擎（视角差异有价值），但统一核心公式。

**具体方案**：提取共享的"兴趣计算函数"：

```typescript
function calculateInterestSignal(params: {
  heat: number; d1: number; trust: number;
  fatigue: number; comparePenalty: number;
  pricePenalty: number; randomRange: [number, number];
}): number
```

客户引擎传入 fatigue/compare 等客户特有参数，机会引擎传入 d1 等案例特有参数。核心计算逻辑共享，输入不同。

**收益**：消除公式不一致的风险，减少约200行重复逻辑。

### 8.3 引入"日度态势摘要"

**问题**：25步 tick 流程执行后，玩家只知道最终状态变化，无法理解"今天发生了什么"。

**建议**：在 resolveOneDay 结束后，从 eventStore/snapshots/riskFlags 中提取态势摘要：

```typescript
interface DailySituationSummary {
  headline: string;           // "3号房源窗口仅剩2天"
  keyEvents: {                // 今日关键事件
    source: string;           // "市场引擎"
    effect: string;           // "需求热度上升12点"
    impactedCases: string[];  // 受影响的案例
  }[];
  alerts: {                   // 预警
    caseId: string;
    level: 'warning' | 'critical';
    message: string;
  }[];
  trend: {                    // 趋势（基于最近3天snapshots）
    competitiveness: 'improving' | 'stable' | 'declining';
    trust: 'improving' | 'stable' | 'declining';
  };
}
```

**数据来源**：已基本就位。eventStore 有事件，snapshots 有竞争力变化，riskFlags 有风险。只需要聚合和格式化。

**为什么做**：这是"让系统说得清"的关键一步——从数据到叙事。

### 8.4 竞争力时序分析

**问题**：CompetitivenessSnapshot 保留最近10个快照，但没有时序分析。无法回答"过去5天竞争力趋势如何"。

**建议**：

```typescript
function analyzeCompetitivenessTrend(snapshots: CompetitivenessSnapshot[]): {
  trend: 'improving' | 'stable' | 'declining';
  rate: number;           // 每天变化量
  keyDriver: string;      // "D3 业主配合持续下降"
  forecast: number;       // 3天后预测值
}
```

**价值**："竞争力在下降"比"竞争力=62"更有决策意义。时序趋势帮助玩家判断"应该继续投入还是应该止损核销"。

### 8.5 参数敏感度分析工具

**问题**：247行配置参数是"黑箱"。调参者无法直观看到参数变化的影响。

**建议**：构建敏感度分析脚本 `scripts/analyze-balance-sensitivity.ts`：

- 对每个参数，独立变化 ±10%
- 固定种子跑30天，比较 closeRate/averageTrust/competitivenessDistribution
- 输出敏感度矩阵：哪个参数变化10%会导致closeRate变化超过5%

**为什么做**：没有敏感度分析，调参是盲目的。有了敏感度分析，调参者可以知道"改哪个参数最有效"和"改哪个参数风险最大"。

### 8.6 动作策略博弈论分析

**问题**：15个动作×多种策略，玩家面临复杂选择空间。没有机制验证是否存在"占优策略"。

**建议**：用蒙特卡洛搜索验证策略空间：

1. 定义策略空间：每天选择哪些动作（受精力约束）
2. 随机搜索/进化算法搜索策略空间
3. 比较不同策略的成交率分布
4. 如果存在占优策略（显著优于其他），需要调整参数打破

**为什么做**：如果存在占优策略，游戏就变成"找到最优解"而不是"根据情况做判断"——失去重玩价值。

### 8.7 业主画像与动作效果交互验证

**问题**：16型画像的行为维度影响动作效果，但效果差异幅度未经系统验证。

**建议**：构建"画像×动作"交互矩阵：

1. 对16种画像极端组合 × 15种动作，计算预期效果差异
2. 识别"无差异"组合：某动作在所有画像下效果相同 → 该动作没利用画像信息
3. 识别"极端差异"组合：某动作在不同画像下效果差异>50% → 可能需要调校

**为什么做**：业主画像是游戏深度的主要来源。如果动作不利用画像信息，画像就是"装饰"。

### 8.8 成交硬约束改软约束

**问题**：信任<60（trustGate）直接阻断成交。60和59的案例体验差异天壤之别。

**建议**：将信任和证据约束改为软惩罚：

```typescript
// 替代 if (trust < trustGate) → block
if (trust < trustGate) {
  closeProbability *= (trust / trustGate);
  // 信任60→无惩罚，信任30→概率减半
}
```

保留价格预算和市场容量的硬约束（物理限制），改软的只是心理状态类约束。

**折中理由**：硬阈值更易理解和调试。但硬阈值导致"刚好够"和"刚好不够"的体验差异太大。软约束让边际改善更平滑——信任从50提升到55是"有意义的进步"，而不是"离门槛还差5点所以没区别"。

### 8.9 窗口续期机制丰富化

**问题**：窗口续期只有二选一——满足条件续期（-trust），不满足核销。

**建议**：引入"部分续期"：

```typescript
if (trust >= renewalThreshold) {
  // 全额续期
  setOwnerCaseWindowDays(world, caseItem, renewalWindowDays, ...);
  applyBrokerOwnerTrustDelta(world, caseItem, -renewalTrustLoss, ...);
} else if (trust >= renewalThreshold * 0.7) {
  // 部分续期：少给几天，更多信任损失
  setOwnerCaseWindowDays(world, caseItem, Math.ceil(renewalWindowDays * 0.6), ...);
  applyBrokerOwnerTrustDelta(world, caseItem, -renewalTrustLoss * 1.5, ...);
  recordDomainEvent(world, { kind: 'window_extended_partial', ... });
} else {
  withdrawCase(world, caseItem, ...);
}
```

**为什么做**：当前机制下信任59和信任30的案例都会核销。但信任59"差一点就能续期"，应该有挽回空间。部分续期给了玩家"用更多信任换取更多时间"的权衡。

### 8.10 复盘回放功能

**问题**：游戏结束后，玩家无法回顾"哪些决策导致了最终结果"。

**建议**：利用已有数据构建回放视图：

```typescript
interface GameReplay {
  dailySummaries: DailySituationSummary[];
  keyDecisions: {               // 决策点
    day: number;
    action: string;
    availableAlternatives: string[];  // 当时还有哪些动作可用
    outcome: 'success' | 'blocked' | 'failed';
    fieldDeltas: Record<string, number>;
  }[];
  competitivenessCurve: { day: number; value: number; delta: number; keyDriver: string }[];
  endingAnalysis: {
    closedDeals: number;
    withdrawnCases: number;
    lostToRival: number;
    criticalMoments: { day: number; description: string }[];
  };
}
```

**数据来源**：eventStore + competitivenessSnapshots + actionReceiptHistory + closedDeals。都已就位，只需要聚合和格式化。

**为什么做**：复盘是学习闭环的关键。没有复盘，玩家无法从失败中学习——只知道"输了"，不知道"为什么输"。

---

## 附录：术语表

| 术语 | 英文 | 含义 |
|------|------|------|
| 案例房源 | Case | 玩家管理的一个待售房源 |
| 机会线索 | Opportunity | 一个正在接触的客户 |
| 客户 | Customer | 市场中的一个潜在买家 |
| 竞对房源 | RivalListing | 竞争对手的房源 |
| 竞对门店 | RivalStore | 竞争对手的门店 |
| 市场单元 | Market | 一个地理区域的市场 |
| 竞争力 | Competitiveness | 综合成交可能性评分 |
| 市场活力 | D1 | 竞争力之客户漏斗维度 |
| 产品力 | D2 | 竞争力之房源品质维度 |
| 业主配合度 | D3 | 竞争力之业主端维度 |
| Canonical State | -- | 权威状态源，存在专用容器中 |
| Mirror | -- | Case 上的兼容性镜像字段 |
| Receipt | -- | 状态变化的不可变收据 |
| SourceRecord | -- | 原始事件记录 |
| CausalEvent | -- | 因果事件，从 SourceRecord 提取 |
| 不变量链 | Price Invariant Chain | marketPrice < bottomPrice < ownerPsychPrice < askPrice |
| 业主画像 | Owner Decision Profile | 16型业主行为模型 |
| 行为维度 | Behavior Dimensions | 从画像派生的10个连续变量 |
| 窗口期 | Window Days | 业主给的剩余操作天数 |
| 核销 | Withdraw | 案例因窗口期耗尽而终止 |
| 续期 | Renewal | 窗口期用完后业主同意延长 |
| 焦点会议 | Focus Meeting | 周四的案例聚焦机制 |
| 被动线索 | Passive Lead | 自动生成的客户线索 |
| 影子机会 | Shadow Opportunity | 隐藏的客户线索，需要揭示 |
| 确定性成交 | Deterministic Closing | 无随机性的成交判定 |
| 硬约束 | Hard Block | 阻断成交的必要条件 |
| 软惩罚 | Soft Penalty | 降低成交概率但不阻断 |
| 组效应 | Group Effect | 同区域房源间的溢出影响 |
| 威胁模型 | Threat Model | 四层竞对威胁评估 |
| Balance | -- | 247行游戏参数配置 |
| Gate | -- | 验证脚本，断言系统行为在合理范围内 |
