# 卖房世界宪法：深度推理与代码审计

> 生成日期：2026-05-22
> 立场：基于 `src/selling-houses/` 当前代码与 `docs/selling-houses-master.md` 第 3 节"第一性原理"
> 适用范围：用作系统的"宪法层"参考——任何与下面 7 条+1 条冲突的代码改动需要先解释

---

## 引言：用户问的 7 条宪法

用户提出了 7 条核心世界观：

1. **合同是终局事实。**
2. **合同由价格共识形成。**
3. **价格共识由 buyer offer 和 owner concession 逐步靠近。**
4. **buyer offer / owner concession 由主体心智、关系、信息、外部事件共同影响。**
5. **经纪人不能直接决定成交，只能通过关系和沟通影响买家/业主。**
6. **外部事件不能直接改结果，只能通过传播、感知、关系、心智、行为链路进入模型。**
7. **大模型只能解释和生成表达，不能成为 simulation truth。**

**判断：7 条全对**，与 `master.md §3` 第一性原理同构。

**但代码现状只有约 4 条真守住，3 条有破口。**

下面是深度推理。

---

## 第 0 条：所有 7 条共享的隐含前提

> **第 0 条：事实是分层的，每一层只能从下一层派生，不能跨层突变。**

这条不在用户列出的 7 条里，但所有 7 条都建立在它之上。没有第 0 条，7 条都无法自洽。

### 0.1 系统的事实分层

```
┌──────────────────────────────────────────────────────────┐
│  Layer 7  ProjectionEnvelope (UI 渲染)                   │  可消费表达
│  Layer 6  ContractFact / Outcome                         │  终局 fact
│  Layer 5  Receipt                                        │  动作回执
│  Layer 4  Command / Action                               │  行动意图
│  Layer 3  Belief / Pressure                              │  认知与压力
│  Layer 2  ActorKnowledge                                 │  actor POV 视角
│  Layer 1  WorldCausalEvent                               │  因果事实（账本）
│  Layer 0  SourceRecord + HiddenTruth                     │  原始信息+客观状态
└──────────────────────────────────────────────────────────┘
```

### 0.2 第 0 条等价于 7 条的"公因子"

| 宪法 | 等价的层级约束 |
|---|---|
| ① 合同终局 | Layer 6 只能从 Layer 5 派生 |
| ② 合同来自共识 | Layer 6 必须经过共识中介 |
| ③ 共识来自 offer/concession 序列 | Layer 5/6 之间存在双方交互序列 |
| ④ 四因子共同影响 | Layer 3 来自 Layer 0~2 的合成 |
| ⑤ 经纪人通过关系 | 经纪人属于 Layer 4，只能 emit Command，不能写 Layer 6 |
| ⑥ 外部事件走链路 | 外部事件先入 Layer 0，再经 Layer 1~5 |
| ⑦ LLM 只能解释 | LLM 属于 Layer 7 消费者，**不能写**任何更底层 |

**所有 7 条都是"禁止跨层突变"的具体体现**。

### 0.3 这条隐含宪法在代码里的工程形态

```
src/selling-houses/domain/world-model/runtime/clock.ts:20
   //   - No case.status mutation
   //   - No closedDeals mutation
   //   - No owner trust/patience/urgency raw field mutation
   //   - No customer final purchase commitment without process evidence
   //   - No UI projection fields as canonical facts

src/selling-houses/domain/world-model/runtime/sourceIngestionAdapter.ts:7
   * (no case.status, no opportunity.status, no trust/patience/urgency).

src/selling-houses/domain/world-model/runtime/marketFormationRuntime.ts:20
   //   - No case.status mutation
```

大世界轨道的代码顶部全写着同一句宪法——**这就是第 0 条的工程化形态**。

但是这些约束**只在大世界轨道生效**，legacy 轨道（`engine.ts → advanceOneDay`）没有这些守门约束。

---

## 一、7 条宪法的结构：1 条主链 + 3 条边界

7 条不是平级的：

### 主链（事实如何被合法生成）

```
①  Contract  (终局事实)
       ↑ 派生
②  Consensus  (价格共识)
       ↑ 派生
③  Offer / Concession 序列  (双方逐步靠近)
       ↑ 派生
④  心智 × 关系 × 信息 × 事件  (四因子合成)
```

### 边界（谁不能伪造事实）

```
⑤  经纪人 — 不能直接成 fact
⑥  外部事件 — 不能直接改 fact
⑦  LLM — 不能成 truth
```

### 1.1 主链与边界的对偶关系

```
主链  = "强制构造"        →  truth 必须沿链生成
边界  = "禁止破坏"        →  谁都不能跳过链

两组互为镜像：
    ① 终局必须来自共识  =  没有共识的 contract 是伪造
    ② 共识必须来自序列  =  没有序列的共识是伪造
    ③ 序列必须来自因子  =  没有因子的序列是伪造
    ④ 因子必须来自 layer 0~2  =  跨层因子是伪造
```

**这是用 P 律 + Q 律两面定义同一件事**。

---

## 二、宪法的代码现状对账

### 2.1 一表概览

| # | 宪法 | 评判 | 关键代码证据 |
|---|---|---|---|
| ① | 合同是终局事实 | ⚠️ **仪式性合规** | `dealClosing.ts:136` 创建 ContractFact + 同函数 `:173` 直接改 `caseItem.status='sold'` |
| ② | 合同由价格共识形成 | ✅ **强制** | `dealClosing.ts:130-153` 链路强制 `markConsensusSigned → createContractFact` |
| ③ | 共识由 offer/concession 逐步靠近 | ⚠️ **隐式编码** | 无 `BuyerOffer` / `OwnerConcession` 类型，用 `Opportunity.stageIndex >= 4 → 'formal_offer'` 反推 |
| ④ | 四因子共同影响 | ✅/⚠️ **因子齐全，权重 magic number** | `OwnerProfilePrior` + `BrokerOwnerRelation` + `InformationSourceRecord×15` + `WorldCausalEvent` 都入参；但加权系数 dev 拍 |
| ⑤ | 经纪人通过关系 | ⚠️ **业主侧守、客户侧缺** | `BrokerOwnerRelation` 完整；**没有** `BrokerCustomerRelation` |
| ⑥ | 外部事件走链路 | ⚠️ **legacy 抄近道** | 大世界轨道严守（注释 "No case.status mutation"）；`engine.ts → advanceOneDay` 直接突变 |
| ⑦ | LLM 不能成 truth | ✅ **守得最干净** | 20+ 文件注释 "No LLM, no Math.random, no Date.now"，且 LLM 输出只产 advice/narrative |

### 2.2 真实通过率：仅 1/7 完全通过

如果用"**可解释性**"作为单元测试（来自 `master.md §3.4`：

> 谁，在第几天，因为看到哪条 source，以什么可信度形成什么 belief，承受什么 pressure，所以建议什么 command，执行后留下什么 receipt
），那 7 条的真实通过率：

| 宪法 | 系统能解释吗 | 通过 |
|---|---|---|
| ① 这套房为什么 950 成交而不是 980？ | 大世界**能近似**；legacy **只能说"evaluation.expectedPrice 算出来的"** | ⚠️ 部分 |
| ② 共识为什么在第 12 天达成？ | **不能** — stageIndex 跃迁瞬间无显式触发证据 | ❌ |
| ③ 客户出价从 880 → 940 是因为什么？ | **不能** — 无 offer 序列实体 | ❌ |
| ④ 业主紧迫度从 60 升到 85 是哪几条 source 引起的？ | 大世界**能**；legacy 直接拍**不能** | ⚠️ 部分 |
| ⑤ 经纪人 A vs B 谁更影响这个买家？ | **不能** — 无 BrokerCustomer 关系 | ❌ |
| ⑥ 台风事件怎么传到业主紧迫度？ | 大世界**能**；legacy 走 Case.urgencyDelta**不能** | ⚠️ 部分 |
| ⑦ LLM 输出对最终成交价的贡献？ | **可解释为零**（LLM 不进 truth） | ✅ |

**完全通过：1/7**
**部分通过：3/7**
**不通过：3/7**

---

## 三、真实病灶：不是 3 个破口，是 1 个病

### 3.1 破口的因果链——⑥ 是根

```
破口 ⑥（legacy engine 直接改 Case.trust/patience/urgency）
        │
        │ 因为 actor knowledge 本来就被直接拍，下游全失去意义
        ↓
破口 ④ 的隐性弱化
   （虽然代码上四因子齐全，但 actor 知识被拍掉的瞬间，
     四因子的"共同影响"也只是计算游戏）
        │
        ├─ 破口 ①
        │   既然 Case.trust 能拍，Case.status 当然也能拍
        │   → dealClosing 直接改 status
        │
        ├─ 破口 ③
        │   既然 trust/intent 都是拍的数字，
        │   offer/concession 也不需要真实序列
        │   → stageIndex 一个整数代替
        │
        └─ 破口 ⑤
            既然客户也是拍出来的数字，
            BrokerCustomerRelation 没必要存在
```

**修 ①③⑤ 是表象**——它们都是因为 ⑥ 没修而出现的"次优解"。

### 3.2 双轨架构未并轨

```
理想链路：HiddenTruth → SourceRecord → CausalEvent → ActorKnowledge
        → Belief → Command → Receipt → ContractFact → Projection

大世界轨道：  ✅          ✅           ✅          ✅
            └─ 但 command/receipt 没真正接回主链
                （tickBigWorldRuntime 写 bigWorldRuntime，不动 Case）

legacy 轨道：  ❌          ❌           ❌          ❌（直接拍）
            └─ advanceOneDay 直接突变
              → 直接生成 ContractFact + 改 Case.status
```

**系统的两端（底层 truth 和顶层 fact）都建好了，中间链路只有大世界轨道接通，玩家体验主链（legacy）没接通**。

这是**演进式重构的典型未完成状态**——画了新蓝图、盖了新房梁，但**承重墙没换**。

### 3.3 病灶等价于"母模型迁移未完成"

[`docs/selling-houses-mother-model-agent-workplan.md`](selling-houses-mother-model-agent-workplan.md) 自己就承认这一点。母模型的目标就是**让 legacy 轨道彻底接进链路**。

宪法 ① ③ ⑤ ⑥ 的所有破口，本质上都是这一未完成迁移的**当前快照**。

---

## 四、深层陷阱

### 4.1 仪式性合规 vs 结构性合规

**仪式性合规**：代码调用了合规 API（如 `createContractFactOnState`），但同时也保留了不合规路径（如 `caseItem.status='sold'`）。

**结构性合规**：合规 API 是**唯一可写路径**——任何不合规的字段在 TypeScript 层就是 `readonly`，编译器物理拒绝。

**第 0 条的物理形态 = `readonly` + gate**。

| 宪法 | 结构性合规的最小要求 |
|---|---|
| ① | `Case.status` `readonly`，只从 `ContractFact` 派生 |
| ⑥ | `Case.trust/patience/urgency` `readonly`，只从 `OwnerCaseReadinessState` 派生 |
| ③ | `Opportunity.stageIndex` `readonly`，只从 `BuyerOffer[]` 派生 |
| ⑤ | `Customer` 关系字段 `readonly`，只从 `BrokerCustomerRelation` 派生 |

当前系统几乎所有这些字段都是**可写的**。

### 4.2 宪法 ④ 的二阶陷阱：加权系数本身是不是 truth？

宪法 ④ 说 offer/concession 由"心智×关系×信息×事件"**共同影响**——代码里 `closeProbability` 是这四类因素加权计算的。

但**权重从哪来**？

`grep computeCloseProbability` 在代码里**没有命中**。说明 `closeProbability` 不是一个独立的纯函数——它**内联在多处计算逻辑里**，权重作为 magic number / formula 散落在：

- `dealClosing.ts`
- `consensus/runtimeReceiptBuilder.ts`
- `consensusFormationHelper.ts`
- `core/business-rules/metrics/evaluationMetrics.ts`

这意味着：
- **第一层 truth**（业主信任 70、客户预算 1000 万）是从 SourceRecord 推导的 ✅
- **第二层 truth**（"信任对 closeProbability 的权重是 0.25"）是开发者拍的 ❌

这是**隐性的 ⑦ 违反**——LLM 没成为 truth，但 **dev 自己成了 truth**。

**宪法 ⑦ 的本质不是"防 LLM"，是"防一切看不见的拍脑袋成为 truth"**。

修法：把权重也变成可解释的（来自市场学到的、来自历史成交分布、来自业主类型），且记录到 `ContractFact` 的解释链里：

```ts
interface WeightExplanation {
  factor: 'trust' | 'patience' | 'urgency' | 'marketHeat' | ...;
  weight: number;
  derivedFrom: {
    sourceKind: 'historical_distribution' | 'market_signal' | 'archetype_default';
    sourceIds: string[];
  };
}
ContractFact.weightExplanation: readonly WeightExplanation[];
```

### 4.3 宪法 ③ 严格说**实际未实现**

宪法 ③ 说"价格共识由 buyer offer 和 owner concession **逐步靠近**"。

当前系统的"逐步"是：

```
Opportunity.stageIndex:  0 → 1 → 2 → 3 → 4 → 成交
NegotiationReplayPhase:  "首访" → "复访" → "出价" → "签约"
```

**这是"阶段晋升"，不是"价格序列"**。

代码里没有任何一处记录：
- "客户 X 第 5 天出价 880"
- "业主 Y 第 7 天还价 970"
- "客户 X 第 10 天提到 920"
- "业主 Y 第 12 天让到 950"

最终成交价从 `evaluation.expectedPrice` 一次性算出：

```text
src/selling-houses/domain/dealClosing.ts → soldPrice 是一次性计算的数字
```

**严格语义上，宪法 ③ 没实现**——当前是"阶段计数 + 一次性结算"，不是"双方逐步逼近"。

### 4.4 状态机的不一致

```
Case.status:           'active' | 'sold' | 'withdrawn' | 'lost_to_rival'    （4 态）
RivalListing.status:   'active' | 'sold' | 'withdrawn'                       （3 态）
Opportunity.status:    'active' | 'won' | 'lost' | 'closed'                  （4 态，不同语义）
```

这三个状态枚举**不一致**：
- Case 有 `'lost_to_rival'`，RivalListing 没有
- Opportunity 用 `'won' / 'lost' / 'closed'`，Case/RivalListing 用 `'sold' / 'withdrawn'`

**这本身就是宪法 ① 的微观违反**——同一概念（成交/未成交）在不同实体上用不同 token 表达，意味着 "终局事实"在系统里有多个不互译的版本。

### 4.5 时间维度问题：tick 粒度 vs 谈判节奏

当前系统每天一个 tick。但宪法 ③ "逐步靠近"暗含**多次出价/还价的时间序列**——现实中买家可能一天还价多次，业主可能隔几天才回应。

**当前系统对"同一天内的多轮博弈"是怎么处理的？**

答：**几乎不处理**——同一天内的所有动作都在 `advanceOneDay` 一次性处理，没有"上午客户出价 → 下午业主回应 → 晚上客户提价"的时间序列。

这又是宪法 ③ 未实现的一种表现——**时间分辨率不足以承载"逐步"**。

### 4.6 跨 actor 一致性

**思考实验**：经纪人 A 知道业主紧迫度 = 70；客户 B 看到同一业主紧迫度 = 80（因为信息延迟+渠道偏差）。当前系统支持这种差异化感知吗？

部分支持：
- `InformationSourceRecord.visibility` 控制谁能看到 ✅
- `delayDays` 控制信息延迟 ✅
- `ActorKnowledgeProjection` 按 actor 过滤 ✅

**但实际代码里**：
- `Case.trust` / `Case.patience` 是**全局可见**的（不是 per-actor view）
- 经纪人和客户读这些字段时看到同一数值
- 没有"客户的 belief about 业主 trust" 这种层次

这意味着宪法 ④ 的"心智"实际上是**全局心智**，不是 actor-specific belief。**这又是 legacy 主导的后果**——legacy 路径上没有 belief 这一层。

### 4.7 因果完备性 vs 因果近似性

宪法 ⑥ 说"外部事件不能直接改结果，只能通过链路"。但**剧本注入的事件**（`ScheduledEvent`）算什么？

```
src/selling-houses/domain/scenarios/builtinScenarios.ts
src/selling-houses/domain/scenario-generation/scenarioAssembler.ts
```

剧本事件是**没有 cause 的事件**——它从天而降，进入系统。它满足宪法 ⑥ 吗？

答：**形式上满足**（它经过 SourceRecord → CausalEvent 链路），**实质上是 simulator-as-truth**——剧本作者就是 truth 来源。

这与宪法 ⑦ 类似——**"防止隐性 truth"才是宪法的灵魂**：LLM、dev 常数、剧本注入都是同类。

### 4.8 第 8 条候选：投影合法形态

现在的 7 条覆盖了"事实如何被生成"和"哪些不能伪造"。但还缺：**事实如何被消费**。

> **第 8 条候选：UI / Projection 不能展示超过 truth 精度的信息。**

具体表现：
- 如果 truth 里业主紧迫度是"高/中/低"3 档，UI 不能显示 "73%"
- 如果 truth 里只有"客户已表达兴趣"，UI 不能虚构出"客户出价 880"
- 如果 truth 里 buyer offer 没记录，UI 显示的"出价历史"必须标注为推断

这条没有写进 master.md，但它是第 0 条"层级派生"的自然推论。

---

## 五、可重放性审计：宪法 ⑦ 的非显性形态

`master.md §5` 明确拒绝 `Date.now` / `Math.random` / `fetch` / LLM 作为核心模拟真相。

### 5.1 全代码扫描结果

**20+ 个文件在顶部注释里明确写 "No Math.random / Date.now"**——这是宪法 ⑦ 的工程化形态。

代表性文件：

```
src/selling-houses/runtime/simulation/managerInterventionAdapter.ts:12
   * 2. No Date.now, no Math.random, no fetch, no LLM.

src/selling-houses/runtime/simulation/strategyForkAdapter.ts:14
   * 3. No Date.now, no Math.random, no fetch, no LLM.

src/selling-houses/core/world-state/ownerCaseReadinessWriteSource.ts:13
   * 2. No Date.now, no Math.random, no crypto, no global state.

src/selling-houses/domain/world-model/runtime/marketEconomyRuntime.ts:16
   *   - No Date.now / Math.random / fetch / LLM provider
```

simulation 主链路全部宣示"无随机、无时钟、无 LLM"。

### 5.2 实际违反点

| 文件 | 违反方式 | 评判 |
|---|---|---|
| `application/cloudState.ts:75` | `Date.now()` 作 fallback ID | ✅ 不违 — 不在 simulation 路径 |
| `application/saveConsistency.ts:97` | `Date.now() + Math.random()` 作 save ID | ✅ 不违 — 存档命名，不进 truth |
| `ui/features/ScenarioSetup.tsx:145` | `Date.now()` 作随机剧本 seed | ✅ 不违 — 用户行为入口，seed 之后整链确定性 |

**结论**：宪法 ⑦ 的工程实现非常干净——所有 simulation 路径都是确定性的。

**这是 7 条宪法里目前实现得最好的一条**。

### 5.3 但还有未发现的非确定性

`closeProbability` 的权重虽然不是 `Math.random()`，但它来自不可追溯的 dev 拍数——**等价于在编译期固化的非确定性**。

要让宪法 ⑦ 真正满足"可重放性"，**所有 magic number 都应能追溯到 SourceRecord**——否则就是"build-time truth"。

---

## 六、反例库：仪式合规但本质违宪的代码

下面这些代码片段会通过任何 lint / typecheck / gate，但都违反宪法。

### 反例 1：完美仪式 + 完美违宪（dealClosing 当前状态）

```ts
// dealClosing.ts:130~217
markConsensusSignedOnState(state, brokeredId, day, '...');     // ✅ 写共识
createContractFactOnState(state, consensusId, ...);            // ✅ 写合同
caseItem.status = 'sold';                                       // ❌ 但同时改 projection
caseItem.soldPrice = soldPrice;                                 // ❌
state.closedDeals.unshift(closedDeal);                          // ❌
```

**违宪点**：合同事实有 3 份。
**正确写法**：`Case.status` `readonly`，从 `ContractFact` 派生；`closedDeals` 也是 projection。

### 反例 2：穿越层级的合规 API 调用

```ts
// 伪代码（不存在但容易写出）
function manuallyForceDeal(caseId: string, price: number) {
  const consensus = createSyntheticConsensus(caseId, price);
  const contract = createContractFactOnState(state, consensus.id, ...);
  return contract;
}
```

**违宪点**：调用合规 API，但 consensus 是凭空捏造的（没有对应 offer/concession 序列）。
**修复**：要求 `ConsensusFormation` 必须引用至少 1 个 `BuyerOffer` 和 1 个 `OwnerConcession`。

### 反例 3：LLM 间接成 truth

```ts
// 伪代码
const advice = await llmAdvise(broker, owner);
agentMemoryStore.write(broker.id, { fact: advice.text });
// 后续 belief 读 memory，间接消费 LLM 输出
```

**违宪点**：LLM 输出经过 memory 层成为 belief 来源。
**修复**：memory 必须区分"LLM 生成"和"事实学习"两类，前者不进 belief 推断。

### 反例 4：BigWorld 自己拍 delta

```ts
// 伪代码
function tickEnvironmentPhase(state) {
  const heatDelta = -3;  // ← magic number
  return [{ kind: 'MarketHeatShifted', payload: { delta: heatDelta } }];
}
```

**违宪点**：CausalEvent 经过链路了，但 delta=-3 没有 SourceRecord 来源。
**修复**：每个 CausalEvent 必须引用至少 1 个 `sourceRecordId`，或显式标注 `synthetic: true` + 原因。

### 反例 5：成交价违反价格约束

```ts
const soldPrice = computePrice(...);  // 某种推导
if (soldPrice < caseItem.bottomPrice) {
  // 无检查直接成交
  createContractFactOnState(state, consensusId, soldPrice, ...);
}
```

**违宪点**：违反业主底价隐含约束 `soldPrice ∈ [bottomPrice, ∞)`。
**修复**：`ContractFact` 创建时硬校验，违反 invariant 抛 `InvariantViolationError`。

### 反例 6：UI 编造超过 truth 精度的展示

```tsx
// truth 层只有 "高/中/低" 3 档紧迫度
<div>业主紧迫度: 73%</div>  // ❌ 编造精度
```

**违宪点**：违反候选第 8 条。
**修复**：projection 显式声明"基于阶段映射"，或加 `precisionTier` 字段。

---

## 七、并轨路线：5 步把宪法从"仪式"做成"结构"

按宪法因果链（不按 ROI）：

### Step 1 — 修宪法 ⑥（根症）

**目标**：让 `advanceOneDay` 不再直接突变 `Case.trust/patience/urgency`。

**具体动作**：
1. 业主侧任何变化先写一条 `SourceRecord(OwnerInterview / MarketSignal)`
2. 该 source 经 `WorldCausalEvent` 进入 `OwnerCaseReadinessState`
3. `Case.trust/patience` 变成 **projection mirror**，由 `relationReadProjection` 派生
4. 加 gate `verify-no-direct-trust-patience-mutation`

**风险**：高 — 会改变玩家体验主链；可能破坏现有 selfplay 重放
**收益**：宪法 ④ ⑥ 同时真正生效

### Step 2 — 修宪法 ③（建 truth 层最后一块）

**目标**：把 `stageIndex` 从主语变成派生量。

**具体动作**：

```ts
// 新增到 core/world-state/consensus/
interface BuyerOffer {
  readonly offerId: string;
  readonly day: number;
  readonly customerId: string;
  readonly caseId: string;
  readonly price: number;
  readonly conditions: readonly string[];
  readonly sourceRecordIds: readonly string[];   // 哪些 source 触发了这次出价
  readonly causedByConcessionId?: string;
}

interface OwnerConcession {
  readonly concessionId: string;
  readonly day: number;
  readonly ownerId: string;
  readonly caseId: string;
  readonly price: number;
  readonly conditions: readonly string[];
  readonly causedByOfferId?: string;
  readonly sourceRecordIds: readonly string[];
}

interface PriceTrajectory {
  readonly caseId: string;
  readonly customerId: string;
  readonly offers: readonly BuyerOffer[];
  readonly concessions: readonly OwnerConcession[];
  readonly convergenceCurve: readonly { day: number; gap: number }[];
}
```

让 `Opportunity.stageIndex` `readonly`，从这些序列**派生**：
- 有 1 次 formal offer → stage ≥ 4
- 有 3 次 offer + 2 次 concession → stage 5

**风险**：中 — 新实体面，但与现有 NegotiationReplay 同形态
**收益**：宪法 ① ② ③ 真正闭合

### Step 3 — 修宪法 ①（fact 层闭合）

**目标**：让 `Case.status` 从 `ContractFact` 派生。

**具体动作**：
1. `Case.status` 改为 `readonly`
2. 在 GameState 上加 `closedDealsProjection: ReadonlyArray<ClosedDealProjection>`，由 `ContractFact[]` 派生
3. `dealClosing.ts` 删掉 `caseItem.status = 'sold'` / `state.closedDeals.unshift`
4. 加 gate `verify-no-direct-case-status-mutation`：grep 出 `caseItem.status = ` / `case.status = ` 任何直写为 error

**风险**：低 — 改动可控
**收益**：宪法 ① 真正生效

### Step 4 — 修宪法 ⑤

**目标**：补 `BrokerCustomerRelation`。

```ts
interface BrokerCustomerRelation {
  readonly brokerId: string;
  readonly customerId: string;
  readonly trust: number;
  readonly familiarity: number;
  readonly influence: number;
  readonly firstContactDay: number;
  readonly lastInteractionDay: number;
  readonly interactionHistory: readonly string[];   // action receipt ids
}
```

并让 `closeProbability` 把 `brokerCustomerRelation.influence` 也作为输入因子。

**风险**：低 — 新增实体不破坏现有
**收益**：宪法 ⑤ 真正闭合

### Step 5 — 修宪法 ④ 的隐性问题（最难）

**目标**：让 closeProbability 的权重也变成 **learned truth**。

**具体动作**：
1. 提取 `closeProbability` 计算为一个纯函数 `computeCloseProbability(inputs, weights)`
2. 引入 `WeightExplanation` 实体
3. 权重来自：历史成交分布 + 当前市场环境 + 业主类型 + 经纪人记忆
4. 每个 `ContractFact` 上加 `weightExplanation: readonly WeightExplanation[]`

**风险**：高 — 涉及核心算法重构
**收益**：宪法 ④ ⑦ 真正闭合，整个系统达到"可解释"

---

## 八、验收准则：宪法满足的客观判据

每条宪法的"是否真满足"用下面的判据测：

| # | 判据（必须全部 true） |
|---|---|
| ① | (a) `Case.status` `readonly` (b) `closedDeals` 是 projection (c) 唯一可生成 ContractFact 的路径是 `createContractFactOnState` (d) gate 阻止任何 `caseItem.status = ` 直写 |
| ② | (a) `ContractFact` 必须有 `consensusId` (b) `ConsensusFormation` 必须先 `signed` (c) gate 阻止 contract 跳过 consensus |
| ③ | (a) 存在 `BuyerOffer[]` / `OwnerConcession[]` (b) `Opportunity.stageIndex` `readonly`，从序列派生 (c) `ConsensusFormation` 必须引用 ≥1 offer + ≥1 concession |
| ④ | (a) `closeProbability` 是显式纯函数 (b) 权重有 `WeightExplanation` (c) ContractFact 上挂 weightExplanation |
| ⑤ | (a) `BrokerCustomerRelation` 存在 (b) `closeProbability` 把它作为因子 (c) 客户决策不能跳过此关系 |
| ⑥ | (a) `Case.trust/patience/urgency` `readonly`，从 readiness state 派生 (b) 所有 readiness 变化必须先经过 SourceRecord (c) gate 阻止任何 `caseItem.trust = ` 直写 |
| ⑦ | (a) simulation 路径无 `Math.random` / `Date.now` / `fetch` / LLM (b) LLM 输出不进 belief 推断 (c) magic number 可追溯（高级要求） |

**第 0 条 = ① + ② + ③ + ⑥ 全部满足时自动满足。**

---

## 九、终极判据：可解释性

宪法的灵魂是 `master.md §3.4`：

> 谁，在第几天，因为看到哪条 source，以什么可信度形成什么 belief，承受什么 pressure，所以建议什么 command，执行后留下什么 receipt，并如何反馈 runtime。

把这句话当成 **CI 单元测试**：对每一笔 ContractFact，系统必须能回答：

| 问题 | 当前能否回答 | 修复后 |
|---|---|---|
| 这套房为什么 950 成交而不是 980？ | ⚠️ 部分 | ✅ 全部 |
| 客户出价从 880 → 940 经历了哪些信号？ | ❌ | ✅ |
| 业主紧迫度从 60 升到 85 的所有 source？ | ⚠️ 部分 | ✅ |
| 经纪人小李 vs 小王，谁更影响这个买家？ | ❌ | ✅ |
| LLM 建议"催促业主"对成交价的贡献？ | ✅（为零） | ✅（为零） |

**这是宪法的最终单元测试。当前接近不及格，修完五步后才能及格。**

---

## 十、一句话结论

> **当前系统对宪法的合规是"仪式性的"，不是"结构性的"——它调用了合规 API（`createContractFactOnState`），但同时也直接拍了状态（`caseItem.status = 'sold'`）。**
>
> **合规的判断不应该看"是否调用了合规 API"，应该看"这条 fact 不经过链路就无法被生成"。**
>
> **`readonly` + gate 是宪法的物理形态。当所有 4 类 truth 字段（`Case.status` / `Case.trust/patience/urgency` / `Opportunity.stageIndex` / `closeProbability` 权重）都做到 `readonly` + 派生，宪法才真正生效。**

---

## 附录 A：本审计引用的关键代码位置

| 文件 | 行 | 引用原因 |
|---|---|---|
| `src/selling-houses/domain/dealClosing.ts` | 130-217 | dealClosing 三身分并存 |
| `src/selling-houses/domain/caseLifecycle.ts` | 17 | 第二处直写 `caseItem.status='lost_to_rival'` |
| `src/selling-houses/domain/models.ts` | 684/912/1187 | 三个实体的 status 枚举不一致 |
| `src/selling-houses/domain/world-model/runtime/clock.ts` | 20 | 大世界轨道宪法注释 |
| `src/selling-houses/domain/world-model/runtime/sourceIngestionAdapter.ts` | 7 | 大世界轨道 "no case.status mutation" |
| `src/selling-houses/core/world-state/consensus/legacyAdapter.ts` | 80 | `stageIndex >= 4 → 'formal_offer'` 反推 |
| `src/selling-houses/application/cloudState.ts` | 75 | `Date.now()` 用法（不违宪） |
| `src/selling-houses/application/saveConsistency.ts` | 97 | `Date.now() + Math.random()` 用法（不违宪） |
| `src/selling-houses/ui/features/ScenarioSetup.tsx` | 145 | `Date.now()` 作 seed 入口（不违宪） |

## 附录 B：与其他文档的关系

| 文档 | 关系 |
|---|---|
| `selling-houses-master.md` | 本文是 §3 第一性原理的形式化与审计 |
| `selling-houses-mother-model-agent-workplan.md` | 本文 §三 "病灶诊断"对应母模型迁移未完成 |
| `selling-houses-entity-canonical-map.md` | 本文 §四 "结构性合规"对应 canonical/derived/shadow 三分 |
| `selling-houses-field-ownership-matrix.md` | 本文 §七 "并轨路线"的字段级路径图 |
| `selling-houses-entity-relation-map-2026-05-21.md` | 本文 §0.1 "事实分层"的实体侧投影 |
| `selling-houses-deal-fact-and-closing-model.md` | 本文 §二 "宪法 ①②" 的实施细节 |
| `selling-houses-price-model.md` | 本文 §四.2 "宪法 ④ 二阶陷阱"对应"权重不可追溯"问题 |
