# 卖房世界：宪法对账与 AI 系统架构演进规划

> 日期：2026-05-28
> 文档性质：架构设计 + 落地规划
> 基线：[`selling-houses-constitutional-audit-2026-05-22.md`](selling-houses-constitutional-audit-2026-05-22.md)
> 适用读者：架构师 / 工程 Manager / 实施 agent
> 阅读约定：每个 Phase 都包含「问题陈述 → 设计决策 → 实体契约 → 数据流 → 验收判据 → 反例 → 风险」7 块；任何缺失这 7 块的 Goal 都视为未设计完成

---

## 0. 总览

| 部分 | 性质 | 输出 |
|---|---|---|
| Part 1 | 宪法落地状态对账 | 7 条宪法的当前判据 + 剩余 truth debt 的形式化清单 |
| Part 2 | AI 系统 4 阶段架构演进 | A1~A4，每阶段含实体契约、数据流、Gate 设计、反例 |
| Part 3 | 通用治理 | Provenance 词汇表、Gate 命名约定、写入边界规则 |
| Part 4 | 失败模式与回退 | 每个阶段失败时的可逆路径 |

**一句话定位**：宪法是"什么不可破坏"，AI 路线图是"如何在不破坏宪法前提下把系统能力推到下一档"。

---

# Part 1 — 宪法落地状态对账（5/22 → 5/28）

## 1.1 通过率快照

```
完全通过：5/7  (从 1/7)
部分通过：2/7
不通过：0
```

| # | 宪法 | 5/22 | 5/28 | 形式化判据（5/28 满足态） |
|---|---|---|---|---|
| ① | 合同终局 | ⚠️ | ✅ | `Case.status` 写入路径 ≤ 1（`syncLegacyCaseDealMirrorsFromContractFact`），且写入前必有 `ContractFactState` |
| ② | 共识形成合同 | ✅ | ✅ | 创建 `ContractFact` 必须有 non-empty `consensusFormationId` |
| ③ | offer/concession 序列 | ⚠️ | ✅ | `BuyerOffer` / `OwnerConcession` readonly 实体存在；`PriceTrajectory` 持有它们；R45 gate 验证 evidence emission |
| ④ | 四因子合成 | ⚠️ | ⚠️ | 因子齐全但权重 magic number；待 A4 处理 |
| ⑤ | 经纪人通过关系 | ⚠️ | ✅ | `BrokerCustomerRelation` v0 落地 |
| ⑥ | 外部事件走链路 | ⚠️ | ✅ | `caseItem.trust/patience/urgency = ` 直写命中 0；`ownerCaseReadinessWriteHelper` 单一写源 |
| ⑦ | LLM 不成 truth | ✅ | ✅ | simulation 路径无 `Math.random` / `Date.now` / `fetch` / LLM；3 处使用全在非 sim 路径 |
| 第 0 条 | 事实分层 | 隐含 | ✅ 显式 | `canonicalStoreKernel` 区分 11 canonical / 15 mirror store；写入挂 provenance |

## 1.2 第 0 条工程化形态

```17:47:src/selling-houses/core/world-state/canonicalStoreKernel.ts
export type CanonicalStoreName =
  | 'runtimeBrokerOwnerRelations'
  | 'runtimeBrokerCustomerRelations'
  | 'runtimeOwnerCaseReadinessStates'
  | 'runtimeCustomerCaseMatches'
  | 'runtimeBrokeredOpportunities'
  | 'runtimeConsensusFormations'
  | 'runtimeContractFacts'
  | 'runtimeOpportunityClosureSets'
  | 'runtimePriceTrajectories'
  | 'runtimePriceConsensusReadinesses'
  | 'runtimeCaseTerminalOutcomes';
```

**11 个 canonical store 是当前系统的"truth 集合"**。任何不在此列表的字段，都是 derived/mirror，写入必须通过对应 helper + provenance 标注。

## 1.3 5/28 R-Gate 实测

| Gate | 检查项 | 结果 | 性质 |
|---|---|---|---|
| R31 canonical-store-kernel | 78 | ✅ 78/78 | 第 0 条物理形态 |
| R47 actual-settlement-contractfact | 51 | ✅ 51/51 | 宪法 ① 最后一公里 |
| R46 closing-preflight | — | ✅ | 终局事实门禁 |
| R46 full-closing-happy-path | — | ✅ | 端到端 contract path |
| R45 buyer-offer-source-chain | — | ✅ | 宪法 ③ chain |
| R45 canonical-evidence-runtime | — | ✅ | offer/concession emission |
| R34 status-mirror-truth-seal | 20 | ⚠️ 19/20 | fixture 太严（系统在更早一步就拒绝了非 canonical 签合同——这是好事） |

## 1.4 剩余 Truth Debt 的形式化清单

| Debt ID | 描述 | 归属 Phase | 退出判据 |
|---|---|---|---|
| TD-01 | R34 contradiction fixture 命中过严 | A1 | R34 = 20/20 PASS，fixture 设计为"先注入 canonical evidence，再注入矛盾" |
| TD-02 | `legacy_truth_debt` provenance 仍在使用 | A1 | `grep "'legacy_truth_debt'"` 命中数从当前 N 降到 0，每个移除都伴随 evidence migration receipt |
| TD-03 | `closeProbability` 权重 magic number | A4 | 每个 `ContractFact` 上的权重值都有 `WeightExplanation`，可追溯到历史分布或市场环境信号 |
| TD-04 | CaseMesh 仍为 scaffold | A1 | `caseMesh.ts` / `caseMeshHarness.ts` 有真实 runtime 行为，统计字段不为硬编码 0 |
| TD-05 | Customer/Owner/RivalBroker 仍是规则驱动 | A3 | 删掉规则 path 后，self-play 仍能跑出与今天分布一致的成交结果 |

---

# Part 2 — AI 系统架构演进（A1 → A4）

## 2.0 演进的因果链

```
A1 把已有 AI 子系统的"工程债"还清，让 baseline 干净可测
   │
   │ 前置：内存有 provenance、benchmark 可对比、debt 已清
   ↓
A2 让 AI 的每次输出都挂证据链，advice 与 ContractFact 可解释
   │
   │ 前置：grounding 已强制，5-Why 已可回答
   ↓
A3 让 Customer/Owner/RivalBroker 也成为 AI actor，从规则驱动迁到 agent 驱动
   │
   │ 前置：actor 行为可追溯，offer/concession 真由 agent emit
   ↓
A4 让权重、prompt、persona 都从数据学习，系统能自我改进
```

**强依赖**：删除前置阶段任意 Goal 都会让后续阶段失能。

---

## 2.1 Phase A1 — Hardening

**单句目标**：把已有 AI 子系统的工程债还清，让 baseline 干净可测，作为 A2~A4 的地基。

### A1.G1 — R34 Contradiction Fixture 修复

**问题陈述**
R34 测试 fixture 期望验证"矛盾场景能否被检测"。但当前 fixture 输入是 `proofKind='legacy_compatibility_projection'`，系统在更早的 R44 守门处就拒绝了——还没走到比较矛盾的那一步。

**设计决策**
- Fixture 应该模拟"正常路径"：先提供 canonical evidence（`customer_interaction.offer_submitted` + `owner_interview.price_discussed`），让流程走完前置检查
- 然后**在 evidence 内部注入矛盾**（如 offer price < bottomPrice、concession 与 offer 时序倒置）
- Gate 期望系统在"内部检查"阶段抓住矛盾，而不是"输入预检"阶段

**实体契约**
无新实体；只改 fixture。

**数据流**
```
fixture canonical evidence → ContractFactProofBuilder → 应在 invariant 检查时报错
（而不是在 proofKind 检查时报错）
```

**验收判据**
- `R34 status-mirror-truth-seal-gate` 从 19/20 → **20/20 PASS**
- Fixture 中 `proofKind` 必须是 `'canonical'`
- Fixture 注入的矛盾必须是 invariant 级别（如价格逻辑、时序逻辑），不是 schema 级别

**反例**
```ts
// ❌ 当前 fixture（proofKind 不对，前置就挂）
input: { proofKind: 'legacy_compatibility_projection', ... }

// ✅ 修后 fixture（proofKind 正确，但内部矛盾）
input: {
  proofKind: 'canonical',
  buyerOffer: { price: 800, day: 10 },
  ownerConcession: { price: 950, day: 8 },  // ← concession 早于 offer，时序矛盾
}
```

**风险**
- 低。修 fixture 不动产线代码。

---

### A1.G2 — CaseMesh scaffold → v0

**问题陈述**
`caseMesh.ts` / `caseCoordinator.ts` / `caseMeshHarness.ts` 三个文件已存在但是 scaffold——`agent-handoff.md` 反复标注 "scaffold only"。`localAdversarialSelfPlayLab` 中 mesh 统计字段硬编码 0。意味着"多 case 协同 AI"概念在代码里有壳，但没行为。

**设计决策**
- CaseMesh 的职责：在玩家多 case 场景下，按"注意力预算 + 资源约束"分配 AI agent 算力，并维护 case 间的信号传递（如 A 案的价格变化会影响 B 案的客户）
- v0 范围：纯调度 + 信号广播，不引入新 agent 行为
- 不在 v0 范围：跨 case 的复杂博弈（A4 阶段处理）

**实体契约**

```ts
// src/selling-houses/application/agents/caseMesh.ts (升级)

interface CaseMeshConfig {
  readonly maxConcurrentCases: number;          // 同时 active 的 case 数
  readonly attentionBudgetPerTick: number;      // 每 tick 总注意力
  readonly signalPropagationDelay: number;      // 信号跨 case 延迟（tick 数）
}

interface CaseMeshNode {
  readonly caseId: string;
  readonly priority: number;                    // 0~100，由 readiness + opportunity 数推导
  readonly attentionAllocated: number;          // 当 tick 分到的注意力
  readonly lastSignalReceivedTick: number;
}

interface CaseMeshSignal {
  readonly signalId: string;
  readonly emittedCaseId: string;
  readonly targetCaseId: string;
  readonly kind: 'price_shift' | 'customer_reroute' | 'broker_attention';
  readonly emittedTick: number;
  readonly deliveryTick: number;                // = emittedTick + signalPropagationDelay
  readonly payload: unknown;
}

interface CaseMeshRuntimeState {
  readonly nodes: readonly CaseMeshNode[];
  readonly pendingSignals: readonly CaseMeshSignal[];
  readonly deliveredSignals: readonly CaseMeshSignal[];
  readonly stats: {
    readonly totalAttentionTicks: number;       // 不再硬编码 0
    readonly totalSignalsEmitted: number;
    readonly totalSignalsDelivered: number;
    readonly avgPriorityShift: number;
  };
}
```

**数据流**

```
每 tick:
  1. 读取所有 active case，按 readiness + opportunity 数算 priority
  2. 按 priority 分配 attentionBudget（softmax / threshold）
  3. 对 attention < threshold 的 case，跳过 agent 调用（节省 LLM 成本）
  4. 收集本 tick 的 priceShift / customer reroute → emit CaseMeshSignal
  5. 投递 deliveryTick == 当前 tick 的 signal 到目标 case
  6. 更新 stats
```

**验收判据**
- 新 gate `verify-selling-houses-case-mesh-runtime-gate`：
  - `totalAttentionTicks > 0`
  - `totalSignalsEmitted > 0`（在 ≥2 case scenario）
  - `pendingSignals` 在 delay 后必有对应 `deliveredSignals`
  - signal 投递顺序与 `emittedTick + delay` 一致
- `localAdversarialSelfPlayLab` 中 mesh 统计字段从硬编码 0 改为读 `CaseMeshRuntimeState.stats`
- handoff.md 中 "caseMesh — scaffold only" 标记移除

**反例**
```ts
// ❌ 直接 broadcast 无延迟（违反信号传播延迟语义）
mesh.deliverSignalImmediately(signal);

// ❌ 不按 priority 调度（违反注意力预算）
for (const case of cases) { runAgent(case); }
```

**风险**
- 中。引入新的调度层会影响 selfPlay 现有 baseline，需要 selfPlay golden snapshot 对比验证
- 缓解：保留 `caseMeshDisabled` 配置项，默认 enabled，旧路径保留为 fallback

---

### A1.G3 — Agent Memory Provenance

**问题陈述**
`agentMemoryStore` 当前对所有写入一视同仁。如果 LLM 推断的 fact（"业主可能想换学区房"）和真实观察（"业主说过想换学区房"）被同等对待，下游 belief 会消费 LLM 推断，**间接让 LLM 成为 truth**——违反宪法 ⑦。

**设计决策**
- 引入 `AgentMemoryProvenance` 枚举，区分 4 类来源
- 写入边界：每条 memory 必须挂 provenance
- 读取边界：belief 推断只能读 `fact_observed` 与 `player_input` 类 memory；`llm_inference` 类只能用于话术风格、不进推断逻辑

**实体契约**

```ts
// src/selling-houses/core/world-state/agents/memoryStore.ts (升级)

type AgentMemoryProvenance =
  | 'fact_observed'        // 来自 SourceRecord，可追溯
  | 'player_input'         // 玩家显式输入
  | 'llm_inference'        // LLM 推断，不可信
  | 'agent_synthesized';   // agent 内部推理，不可信

interface AgentMemoryFact {
  readonly factId: string;
  readonly agentId: string;
  readonly day: number;
  readonly content: string;
  readonly provenance: AgentMemoryProvenance;       // 新增，required
  readonly sourceRecordIds: readonly string[];      // provenance=fact_observed 时 required
  readonly confidence: number;
  readonly expiresOnDay?: number;
}

// 读取边界
interface AgentMemoryQuery {
  readonly agentId: string;
  readonly day: number;
  readonly allowedProvenances: readonly AgentMemoryProvenance[];  // 新增，required
  readonly minConfidence?: number;
}
```

**数据流**

```
写入侧:
  wechatAgent observe owner reply
    → emit InformationSourceRecord(kind: 'owner_interview', ...)
    → memoryStore.write({ provenance: 'fact_observed', sourceRecordIds: [...] })

  wechatAgent infer "owner might want school district"
    → memoryStore.write({ provenance: 'llm_inference', sourceRecordIds: [] })

读取侧:
  beliefInference.compute()
    → memoryStore.query({ allowedProvenances: ['fact_observed', 'player_input'] })
    → 不读 'llm_inference' 类

  toneSelection.compute()
    → memoryStore.query({ allowedProvenances: ['llm_inference', 'agent_synthesized', ...] })
    → 可读，因为仅影响话术风格
```

**验收判据**
- 新 gate `verify-selling-houses-agent-memory-provenance-gate`：
  - 所有 memory 写入挂 non-empty provenance
  - `provenance='fact_observed'` 必有 non-empty `sourceRecordIds`
  - belief 推断代码路径不读 `llm_inference` 类 memory（grep + AST 检查）
- `memoryStore.write` 函数签名强制 provenance 参数（TypeScript 编译期）

**反例**
```ts
// ❌ 无 provenance
memoryStore.write({ agentId, content, ... });

// ❌ LLM 推断进入 belief
const inferred = await llm.infer(...);
memoryStore.write({ provenance: 'llm_inference', content: inferred });
beliefInference.consume(memoryStore.query({ allowedProvenances: ['llm_inference'] }));
// 💥 违反宪法 ⑦
```

**风险**
- 低。memory 系统改造影响面可控，新增 required 字段会被编译器抓出来全部使用点。

---

### A1.G4 — Shadow Report 持续 CI

**问题陈述**
当前 `shadowReport.ts` 存在，能比较 dual runtime（cloud LLM vs local fallback）的输出差异，但没有自动化 CI 集成。意味着 cloud / local 漂移可能长期不被发现。

**设计决策**
- 每日定时跑 100 个 fixture scenarios，dual runtime 各跑一次，对比输出
- 差异度量：JSON diff + semantic similarity + risk label diff
- 阈值：critical decision（如建议成交/不成交）一致率 ≥ 95%；具体话术一致率不要求

**实体契约**

```ts
// src/selling-houses/core/world-state/agents/shadowReport.ts (扩展)

interface ShadowReportEntry {
  readonly scenarioId: string;
  readonly day: number;
  readonly cloudOutput: AgentProposal;
  readonly localOutput: AgentProposal;
  readonly diff: {
    readonly semantic: 'identical' | 'compatible' | 'divergent';
    readonly criticalDecisionMatch: boolean;       // 关键决策（如 should_close）是否一致
    readonly riskLabelMatch: boolean;
    readonly toneSimilarity: number;               // 0~1
  };
}

interface ShadowReportDailySummary {
  readonly date: string;                            // YYYY-MM-DD
  readonly scenariosRun: number;
  readonly criticalDecisionAgreementRate: number;   // 必须 ≥ 0.95
  readonly riskLabelAgreementRate: number;          // 必须 ≥ 0.90
  readonly toneAvgSimilarity: number;
  readonly divergentScenarios: readonly string[];   // 需要人工审查
}
```

**数据流**

```
CI nightly job:
  loadFixtureScenarios(100)
    → for each scenario:
        runDualRuntime(scenario) → (cloudOutput, localOutput)
        diff = compareDualRuntimeOutput(cloudOutput, localOutput)
        ShadowReportEntry
    → aggregate → ShadowReportDailySummary
    → publish to ci-reports/shadow-report-YYYY-MM-DD.json

  if criticalDecisionAgreementRate < 0.95:
    fail CI + auto open issue
```

**验收判据**
- 新 gate `verify-selling-houses-shadow-report-coverage-gate`：
  - 至少 100 个 fixture scenarios 已注册
  - 每个 scenario 都能跑通 dual runtime
  - report 输出符合 schema
- 新 npm script `npm run report:shadow-daily`
- CI 配置每日 02:00 执行
- 历史 report 在 `ci-reports/` 保留 90 天

**反例**
```ts
// ❌ 只跑 cloud，不跑 local
runCloud(scenario);

// ❌ 只看一致率，不看哪些 scenario 不一致
console.log(`agreement: ${rate}`);  // 不知道是哪条挂的
```

**风险**
- 中。需要稳定的 fixture set 和合理的 similarity 度量
- 缓解：先用 deterministic diff（critical decision、risk label），semantic similarity 后续引入

---

### A1.G5 — Agent Benchmark Gate v0

**问题陈述**
当前没有"这个 prompt 比那个好"的客观度量。`promptCatalog` 注册了多个 prompt 但没有性能 leaderboard。意味着 prompt 改动是"凭手感"。

**设计决策**
- v0 只要求"稳定性"：同输入 5 次跑，输出一致率 ≥ 80%
- v1（A4）才引入"性能"：跑标准任务集打分
- Stability 是 quality 的下界——不稳定的 prompt 谈不上质量

**实体契约**

```ts
// src/selling-houses/core/world-state/agents/benchmarkV0.ts (新增)

interface PromptStabilityTest {
  readonly promptId: string;
  readonly fixtureInput: AgentPerceptionPack;
  readonly runCount: number;                      // 默认 5
  readonly outputs: readonly AgentProposal[];
  readonly stabilityScore: number;                // 0~1
  readonly criticalFieldsStability: {
    readonly suggestedAction: number;             // 5 次中 action 一致的比例
    readonly riskLabel: number;
    readonly urgencyLevel: number;
  };
}

interface BenchmarkV0Summary {
  readonly date: string;
  readonly promptsCovered: readonly string[];
  readonly avgStability: number;
  readonly failures: readonly {
    readonly promptId: string;
    readonly stabilityScore: number;
    readonly reason: string;
  }[];
}
```

**数据流**

```
nightly:
  for each promptId in promptCatalog:
    fixtureInput = standardFixture(promptId)
    outputs = []
    for i in 1..5:
      outputs.push(runAgent(promptId, fixtureInput))
    stability = computeStability(outputs)
    if stability < 0.8: flag failure
```

**验收判据**
- 新 gate `verify-selling-houses-agent-prompt-stability-gate`：
  - 所有 `promptCatalog` 注册的 prompt 都有 stability test
  - 关键字段（suggestedAction, riskLabel）的稳定性 ≥ 0.80
- 新 npm script `npm run benchmark:prompt-stability`

**反例**
```ts
// ❌ 只跑 1 次就说稳定
const output = runAgent(prompt, input);
assert(output);

// ❌ 看 raw string 相等性（不应该要求逐字一致）
assert(outputs[0] === outputs[1]);
```

**风险**
- 低。stability 度量本身是确定性的。

---

### A1.G6 — Conversation Risk Labels v1

**问题陈述**
当前 `conversationRiskLabels.ts` 存在，但只产出"风险等级"。无法回答"为什么这条 advice 高风险"——例如它是否引用了真实 evidence。

**设计决策**
- 风险标签升级为多维：grounding / aggressiveness / pricing-bias / urgency-pressure / promise-breaking
- 每个维度由独立的 detector 函数计算
- 风险标签必须给出 reason（指向具体证据缺失或问题片段）

**实体契约**

```ts
// src/selling-houses/core/world-state/agents/conversationRiskLabels.ts (升级)

type RiskDimension =
  | 'grounding_weak'             // advice 未引用真实 evidence
  | 'aggressiveness_high'        // 话术过激
  | 'pricing_bias_player_side'   // 价格建议偏向玩家利益
  | 'urgency_artificial'         // 制造虚假紧迫感
  | 'promise_breaking'           // 承诺超出能力（如保证成交价）
  | 'tone_mismatch';             // 语气与对方画像不符

interface RiskLabel {
  readonly dimension: RiskDimension;
  readonly severity: 'low' | 'medium' | 'high';
  readonly reason: string;
  readonly evidence: {
    readonly snippet?: string;
    readonly missingSourceRecordIds?: readonly string[];
    readonly conflictingFactIds?: readonly string[];
  };
}

interface ConversationRiskAssessment {
  readonly conversationId: string;
  readonly messageId: string;
  readonly labels: readonly RiskLabel[];
  readonly overallRisk: 'safe' | 'caution' | 'block';
}
```

**数据流**

```
agent emit advice
  → riskDetector.run(advice, context)
  → 各 detector 独立判定
  → 聚合为 ConversationRiskAssessment
  → 'block' → 不下发玩家，要求重生成
  → 'caution' → 下发但 UI 提示
  → 'safe' → 正常下发
```

**验收判据**
- 新 gate `verify-selling-houses-risk-label-v1-gate`：
  - 每个 advice 都有 `ConversationRiskAssessment`
  - `grounding_weak` detector 能识别"无 sourceRecordIds 的事实性论断"
  - `block` 级风险 advice 不能被发到玩家（拦截测试）
- 与 A1.G3 (Memory Provenance) 联动：grounding detector 读 memory provenance 判断

**反例**
```ts
// ❌ 只输出 'high' 不说原因
return { overallRisk: 'high' };

// ❌ block 级风险还下发
if (risk === 'block') logWarn();  // 应该 throw 或 reject
```

**风险**
- 中。detector 可能误报。需要 fixture 反向测试（已知低风险 advice 不应触发 block）。

---

### A1.G7 — `legacy_truth_debt` provenance 清债

**问题陈述**
`canonicalStoreKernel` 上定义了 `'legacy_truth_debt'` provenance——这是工程化诚实，表示"我知道这条链路还没接通"。但它不能永远存在。

**设计决策**
- 第一步：grep 出所有使用 `'legacy_truth_debt'` 的写入点，建立 inventory
- 第二步：每个使用点都要有明确的"消债路径"——它要被替换成哪个 canonical provenance、迁移依赖什么前置
- 第三步：消债顺序按"对 actor knowledge 影响大小"排序
- 完成态：`grep "'legacy_truth_debt'"` 命中 0

**实体契约**

无新实体，但要建立一份**消债 inventory**：

```
docs/selling-houses-legacy-truth-debt-inventory.md

| 使用点 | 当前 provenance | 目标 provenance | 迁移前置 | 消除条件 |
|---|---|---|---|---|
| (具体文件:行) | 'legacy_truth_debt' | 'canonical-delta' | A1.G3 完成 | gate XX 绿 |
```

**数据流**

```
每个使用点的消债：
  identify
    → 该处写的是哪个 canonical store？
    → 当前为什么不能给出更精确的 provenance？
    → 缺失的前置是什么？（evidence migration / dual runtime ready / etc.）
  resolve
    → 完成前置
    → 替换 provenance
    → 加 regression gate
```

**验收判据**
- `docs/selling-houses-legacy-truth-debt-inventory.md` 创建，列出所有使用点（数量 = grep 命中数）
- 每个使用点都标注消债路径
- A1 完成时：`grep "'legacy_truth_debt'" src/` 命中数 = 0
- 新 gate `verify-no-legacy-truth-debt-gate` 防止后续重新引入

**反例**
```ts
// ❌ 偷懒标 legacy_truth_debt 让 gate 过
canonicalStore.write({ ..., provenance: 'legacy_truth_debt' });

// ❌ 隐式消债（删了使用点但没更新 inventory）
```

**风险**
- 中。消债过程可能暴露未发现的链路缺口。
- 缓解：inventory 在动手前先建好；动手时按 inventory 顺序逐项。

---

### A1 完成态判据

- ✅ 7 个 Goal 各自的 gate 全 PASS
- ✅ R34 = 20/20
- ✅ `grep "'legacy_truth_debt'" src/` = 0
- ✅ `caseMesh — scaffold only` 标记从 handoff 移除
- ✅ `npm run gate:ai-hardening` 新 npm script 聚合 A1 全部 gate，PASS

---

## 2.2 Phase A2 — Explainer

**单句目标**：每条 AI 输出都挂证据链，每笔 ContractFact 可生成宪法级因果叙事。

### A2 的形式化目标

A2 完成时，对任意一笔 ContractFact，系统必须能回答 5 个 why（来自 `master.md §3.4`）：

1. 这套房为什么 X 成交而不是 Y？
2. 客户出价从 a 提到 b 经历了哪些信号？
3. 业主紧迫度从 m 升到 n 是哪些 source 引起的？
4. 经纪人 A vs B 谁更影响这个买家？
5. LLM 建议"催促业主"对最终成交价的贡献？

每个 why 的答案必须挂证据 ID 链。

---

### A2.G1 — AdviceProvenance 实体

**问题陈述**
当前 advice 是 string + 一些附加字段，无法追溯它基于哪些 fact / belief。

**设计决策**
- 引入 `AdviceProvenance` 实体，每条 advice 必有
- 设计模仿 `ContractFact` 的可追溯结构：sourceRecordIds + beliefSnapshot + factIds

**实体契约**

```ts
// src/selling-houses/core/world-state/agents/adviceProvenance.ts (新增)

interface AdviceProvenance {
  readonly adviceId: string;
  readonly agentId: string;
  readonly day: number;

  readonly sourceRecordIds: readonly string[];        // 哪些 SourceRecord 支撑此 advice
  readonly factIds: readonly string[];                // 哪些 AgentMemoryFact（provenance='fact_observed'）
  readonly beliefSnapshot: {                          // advice 生成时的 belief 快照
    readonly ownerTrust?: number;
    readonly ownerPatience?: number;
    readonly customerIntent?: number;
    readonly marketHeat?: number;
    readonly snapshotDay: number;
  };
  readonly relevantContractFactIds: readonly string[]; // 引用的历史成交
  readonly promptId: string;
  readonly llmModel: string;
  readonly llmRunSeed?: string;
  readonly stabilityRunIds: readonly string[];        // 与 A1.G5 联动
}
```

**数据流**

```
agent.generateAdvice(context)
  → collect supporting evidence (memory query + recent sources)
  → build AdviceProvenance
  → emit advice (with provenance attached, readonly)
  → store advice + provenance in agentAdviceLedger
```

**验收判据**
- 新 gate `verify-selling-houses-advice-provenance-schema-gate`：
  - 每条 advice 必有 `AdviceProvenance`
  - 事实性论断（"业主很紧迫"）必有 non-empty `sourceRecordIds`
  - `beliefSnapshot.snapshotDay <= advice.day`

**反例**
```ts
// ❌ advice 无 provenance
agent.advise("建议催促业主");

// ❌ 有 provenance 但 sourceRecordIds 空
{ advice: "业主很紧迫", provenance: { sourceRecordIds: [] } }
```

**风险**
- 低。新实体不冲击现有写入。

---

### A2.G2 — Advice Grounding Gate

**问题陈述**
即使有 `AdviceProvenance`，也可能填空数组绕过。需要专门 gate 验证 grounding 真实性。

**设计决策**
- Grounding gate 区分两类论断：
  - **事实性论断**（"业主信任度 70"）：必须挂 sourceRecordIds 或 factIds
  - **风格性输出**（"我们再聊聊"）：不要求挂
- 用语义判定哪类（基于句式模板或 LLM 分类，可降级为关键词清单）

**实体契约**

```ts
type AdviceAssertion =
  | { kind: 'factual'; claim: string; required: ['sourceRecordIds' | 'factIds'] }
  | { kind: 'stylistic'; content: string; required: [] };

interface AdviceGroundingCheck {
  readonly adviceId: string;
  readonly assertions: readonly AdviceAssertion[];
  readonly groundingViolations: readonly {
    readonly assertion: AdviceAssertion;
    readonly reason: string;
  }[];
  readonly grade: 'grounded' | 'partial' | 'ungrounded';
}
```

**数据流**

```
advice → assertionExtractor.split() → factual/stylistic
factual 类:
  → 必有 sourceRecordIds OR factIds 非空
  → sourceRecordIds 必须真实存在于 sourceRegistry
  → factIds 必须真实存在于 memoryStore 且 provenance='fact_observed'
  → 违反 → 加入 groundingViolations
```

**验收判据**
- 新 gate `verify-selling-houses-advice-grounding-gate`：
  - 跑 50 个 fixture scenarios，每个产生若干 advice
  - 所有 factual 类 assertion 必有 grounding
  - `ungrounded` advice 必须被 risk label 标 `grounding_weak`（联动 A1.G6）

**反例**
```ts
// ❌ 事实性论断无 grounding
{
  advice: "业主预期价格 1050 万",  // factual
  provenance: { sourceRecordIds: [] }
}

// ✅ 风格性输出无 grounding 是允许的
{
  advice: "周末再聊聊",  // stylistic
  provenance: { sourceRecordIds: [] }
}
```

**风险**
- 高。assertion 分类困难，可能误判。
- 缓解：分类逻辑独立测试；维护"已知 factual / stylistic"字典；先严后宽。

---

### A2.G3 — ContractFact Storyteller

**问题陈述**
当前 `ContractFact` 包含完整的因果链字段（`evidenceRefs` 等），但没有把这些字段组装成人类可读的"为什么成交"叙事的能力。

**设计决策**
- 新增 `contractFactExplainerAgent`，输入 `ContractFactState`，输出结构化叙事
- 叙事必须分 5 段对应 5 个 why
- 每段都引用具体证据 ID

**实体契约**

```ts
// src/selling-houses/application/agents/contractFactExplainerAgent.ts (新增)

interface ContractFactStory {
  readonly contractId: string;
  readonly generatedDay: number;

  readonly whyPrice: {
    readonly explanation: string;
    readonly priceTrajectoryId: string;
    readonly offerProgression: readonly { day: number; price: number; offerId: string }[];
    readonly concessionProgression: readonly { day: number; price: number; concessionId: string }[];
  };

  readonly whyOfferProgression: {
    readonly explanation: string;
    readonly triggeringSourceRecordIds: readonly string[];
    readonly comparableTransactionIds: readonly string[];
  };

  readonly whyOwnerPressure: {
    readonly explanation: string;
    readonly patienceFromTo: readonly [number, number];
    readonly urgencyFromTo: readonly [number, number];
    readonly contributingSourceRecordIds: readonly string[];
  };

  readonly whyBrokerEffect: {
    readonly explanation: string;
    readonly brokerOwnerRelationFinal: number;
    readonly brokerCustomerRelationFinal: number;
    readonly attributedActionReceiptIds: readonly string[];
  };

  readonly whyLLMContribution: {
    readonly explanation: string;
    readonly llmAdviceIds: readonly string[];
    readonly actionsTakenWithLLM: number;
    readonly actionsTakenWithoutLLM: number;
    readonly inferredContribution: 'none' | 'narrative_only' | 'decision_influencing';
  };
}
```

**数据流**

```
explainerAgent.explain(contractFactId)
  → load ContractFactState + PriceTrajectory + sources + receipts + adviceLedger
  → for each of 5 dimensions:
      gather evidence
      LLM compose narrative (with evidence IDs cited)
      validate citations point to real records
  → assemble ContractFactStory
```

**验收判据**
- 新 gate `verify-selling-houses-contract-fact-storyteller-gate`：
  - 10 个固定 ContractFact scenarios，每个生成 story
  - 每个 story 的 5 个 why 段落都非空
  - 每个 why 段落引用的所有 ID 都真实存在
  - `whyLLMContribution.inferredContribution = 'decision_influencing'` 时必有具体 advice → action 链
- 配套测试：人工标注 5 个"质量优秀"的 story 作为对比 baseline

**反例**
```ts
// ❌ 5 个 why 段落有空
{ whyPrice: {...}, whyOfferProgression: { explanation: "" } }

// ❌ 引用不存在的 ID
{ triggeringSourceRecordIds: ["sr-fake-123"] }  // sr-fake-123 不在 registry
```

**风险**
- 中。LLM 输出可能不严格按结构。
- 缓解：strict JSON schema 输出 + post-validation + retry on schema violation。

---

### A2.G4 — Wechat AI 注入真实 evidence

**问题陈述**
当前 `wechatPromptPresets` 是静态文本模板。对话生成不直接读 `OwnerCaseReadinessState` 或最近的 `InformationSourceRecord`。意味着 AI 话术与"客观状态"脱节。

**设计决策**
- Prompt 模板分两段：static persona + dynamic evidence
- Dynamic evidence 段在生成时注入：最近 3 天的相关 SourceRecord + 当前 readiness snapshot
- 输出强制要求 cite evidence ID

**实体契约**

```ts
// 升级 wechatPromptPresets.ts

interface WechatPromptInput {
  readonly personaId: string;
  readonly caseId: string;
  readonly day: number;
  readonly dynamicEvidence: {
    readonly recentSourceRecords: readonly InformationSourceRecord[];  // 最近 3 天
    readonly readinessSnapshot: OwnerCaseReadinessState;
    readonly trustSnapshot: BrokerOwnerRelationTrustState;
    readonly recentActionReceiptIds: readonly string[];
  };
  readonly playerInstruction?: string;
}

interface WechatPromptOutput {
  readonly content: string;
  readonly citedEvidenceIds: readonly string[];
  readonly tonalDirection: 'gentle' | 'firm' | 'urgent' | 'casual';
  readonly riskAssessment: ConversationRiskAssessment;
}
```

**数据流**

```
玩家发起对话
  → 收集最近 3 天相关 SourceRecord（按 visibility 过滤到经纪人 POV）
  → readinessSnapshot, trustSnapshot 从 canonical store 读
  → 组装 WechatPromptInput
  → LLM 生成（cloud or local fallback）
  → strict schema parse
  → cited evidence 必须真实存在（验证）
```

**验收判据**
- 新 gate `verify-selling-houses-wechat-evidence-injection-gate`：
  - 生成的 prompt 必包含 `dynamicEvidence` 段
  - output 必有 `citedEvidenceIds`（除非话术纯寒暄）
  - cited ID 必须真实存在
- 与 A2.G2 联动：grounding gate 验证 cited evidence 与 advice assertion 匹配

**反例**
```ts
// ❌ prompt 不带 evidence
{ persona: "...", playerInstruction: "..." }  // 缺 dynamicEvidence

// ❌ output 编造 ID
{ content: "...", citedEvidenceIds: ["sr-12345"] }  // sr-12345 不存在
```

**风险**
- 中。Prompt 体积增加可能影响 LLM 速度 / 成本。
- 缓解：evidence 注入有体积上限；超出走 summarization。

---

### A2.G5 — 5-Why Test Suite

**问题陈述**
需要一个标准化的测试套件来验证整个系统的"可解释性"是否达标。

**设计决策**
- 10 个 fixed scenario（不同业主类型 × 不同市场环境 × 不同经纪人风格）
- 每个 scenario 跑完后，对其 ContractFact 调用 storyteller
- 期望答案的"结构形态"（必须含 X 字段、必须引用 Y 类 evidence）由 fixture 标注

**实体契约**

```ts
// scripts/fixtures/five-why-scenarios.ts (新增)

interface FiveWhyScenarioExpectation {
  readonly scenarioId: string;
  readonly description: string;
  readonly setupFixture: () => GameState;

  readonly expectedStory: {
    readonly whyPrice: { mustReferenceFactIds: readonly string[]; mustMentionConcepts: readonly string[] };
    readonly whyOfferProgression: { minProgressionSteps: number; mustReferenceSourceKinds: readonly SourceKind[] };
    readonly whyOwnerPressure: { mustReferenceSourceKinds: readonly SourceKind[] };
    readonly whyBrokerEffect: { brokerTrustMustBeAbove: number };
    readonly whyLLMContribution: { expectedContribution: 'none' | 'narrative_only' | 'decision_influencing' };
  };
}
```

**数据流**

```
for each scenario in 10:
  setup → simulate → contractFact
  story = explainerAgent.explain(contractFact)
  validate story against expectedStory
  fail if missing
```

**验收判据**
- 新 gate `verify-selling-houses-five-why-explainability-gate`：
  - 10/10 scenario 通过 storyteller
  - 每个 scenario 的 5 个 why 都符合 expectedStory 结构
  - 评分：average story completeness ≥ 95%

**反例**
- Scenario "学区房紧迫成交"：whyOwnerPressure 必须引用 `school_district_signal` 类 SourceRecord——如果没引用就算失败

**风险**
- 高。10 个 scenario 设计本身就是工作量大、需要业务深度。
- 缓解：先做 3 个最常见的 scenario；其余 7 个分批补。

---

### A2.G6 — ConversationEvaluation v1

**问题陈述**
当前 `conversationEvaluation.ts` 已存在但维度浅。需要升级到 6 维度评分体系。

**设计决策**
6 维度，每维度独立 detector，独立打分（0~100）：

1. **Grounding**：是否引用真实 evidence（与 A2.G2 联动）
2. **Tone**：语气与对方画像匹配度
3. **Relevance**：内容是否回应对方上一句
4. **Urgency**：紧迫感传达是否合理（不夸大不弱化）
5. **Risk**：是否触发任何 risk label（与 A1.G6 联动）
6. **Closure**：是否推进流程（不空转）

**实体契约**

```ts
// 升级 conversationEvaluation.ts

interface ConversationEvaluationV1 {
  readonly conversationId: string;
  readonly messageId: string;
  readonly day: number;

  readonly scores: {
    readonly grounding: { score: number; details: string };
    readonly tone: { score: number; details: string };
    readonly relevance: { score: number; details: string };
    readonly urgency: { score: number; details: string };
    readonly risk: { score: number; details: string };
    readonly closure: { score: number; details: string };
  };

  readonly overallScore: number;                      // 6 维加权
  readonly recommendations: readonly string[];        // 改进建议
}
```

**数据流**

```
每条 wechat message 生成后:
  for each of 6 dimensions:
    detector.score(message, context) → (score, details)
  aggregate → ConversationEvaluationV1
  store in conversationEvalHistory
```

**验收判据**
- 新 gate `verify-selling-houses-conversation-eval-v1-gate`：
  - 每条 wechat message 都有 V1 评分
  - 每个 detector 独立测试 PASS（用标注好的 fixture set）
  - average overallScore 在 fixture set 上稳定（CI 中漂移 ≤ 5 分）

**反例**
- Detector 输出 score 不带 details：违反"可解释"原则

**风险**
- 中。6 个 detector 设计复杂度高，且彼此影响。
- 缓解：每个 detector 独立 unit test；先做 3 个核心维度（grounding/risk/closure），再补另外 3 个。

---

### A2 完成态判据

- ✅ 6 个 Goal 各自的 gate 全 PASS
- ✅ 任意 ContractFact → Storyteller 产出 5-Why 完整答案
- ✅ 所有 advice 100% 挂 AdviceProvenance
- ✅ 所有 factual assertion 100% grounding
- ✅ 5-Why scenario 套件 10/10 PASS

---

## 2.3 Phase A3 — Multi-Actor AI 化

**单句目标**：Customer / Owner / RivalBroker 从规则驱动迁到 AI agent 驱动，让宪法 ④ 在数据层成立。

### A3 的形式化目标

A3 完成时：
- 删除现有规则代码后，self-play 仍能跑通
- `BuyerOffer` 由 `CustomerAgent` emit，不再由规则推导
- `OwnerConcession` 由 `OwnerAgent` emit
- `RivalListing` 调价由 `RivalBrokerAgent` emit
- 不同 actor 看到的 truth 是不对称的（视角不对称落到数据结构）

---

### A3.G1 — CustomerAgent v0

**问题陈述**
当前客户行为完全由规则推导（`stageIndex` 转换、`fit` 计算）。客户没有"我自己的决策"。

**设计决策**
- CustomerAgent 输入：客户的 `ActorKnowledge`（按 visibility 过滤的世界视图）+ `CustomerDemandEntity` + `BrokerCustomerRelation`
- CustomerAgent 输出：`BuyerOffer`（含价格、条件、信心）+ 行为意图（继续看 / 暂停 / 退出）
- 决策模型：决策树或小型 LLM，必须 deterministic（seed-based）

**实体契约**

```ts
// src/selling-houses/application/agents/customerAgent.ts (新增)

interface CustomerAgentInput {
  readonly customerId: string;
  readonly day: number;
  readonly demand: CustomerDemandEntity;
  readonly knowledge: ActorKnowledge;          // 按 customer POV 过滤后的世界视图
  readonly relations: readonly BrokerCustomerRelation[];
  readonly priceTrajectories: readonly PriceTrajectory[];
  readonly seed: string;
}

interface CustomerAgentOutput {
  readonly customerId: string;
  readonly day: number;
  readonly actions: readonly (
    | { kind: 'submit_offer'; caseId: string; price: number; conditions: readonly string[]; confidence: number }
    | { kind: 'continue_viewing'; caseId: string; reason: string }
    | { kind: 'pause'; reason: string }
    | { kind: 'exit_market'; reason: string }
  )[];
  readonly decisionTrace: {
    readonly consideredCaseIds: readonly string[];
    readonly rejectionReasons: Record<string, string>;
    readonly chosenCaseId?: string;
  };
}
```

**数据流**

```
每 tick:
  for each customer:
    knowledge = projectActorKnowledge(customer)
    input = assembleCustomerAgentInput(customer, knowledge, day)
    output = customerAgent.run(input)
    for each action:
      action.kind === 'submit_offer' → emit BuyerOffer + InformationSourceRecord(kind: 'customer_interaction', ...)
      action.kind === 'continue_viewing' → emit InformationSourceRecord
      etc.
```

**验收判据**
- 新 gate `verify-selling-houses-customer-agent-v0-gate`：
  - 10 个 fixture customer scenarios，每个跑 30 天
  - 必须有至少 1 个 customer 产生至少 1 个 BuyerOffer
  - BuyerOffer 必须挂 sourceRecordIds（对应 customer_interaction）
  - decisionTrace 必须 reproducible（同 seed 同 input → 同 output）

**反例**
```ts
// ❌ agent 直接读 hidden truth（违反 visibility）
const ownerBottomPrice = state.cases.find(c => c.id === caseId).bottomPrice;

// ❌ 非确定性（用 Math.random）
const intent = Math.random() > 0.5 ? 'high' : 'low';
```

**风险**
- 高。Customer 决策模型设计影响游戏可玩性。
- 缓解：v0 仅引入"最简可玩"行为；变化幅度配置项化，便于 A/B 对比。

---

### A3.G2 — OwnerAgent v0

**问题陈述**
当前业主行为由规则计算 `patience/urgency`。业主没有"自主回应"。

**设计决策**
- OwnerAgent 输入：业主的 `ActorKnowledge` + `OwnerProfilePrior` + `OwnerCaseReadinessState`
- OwnerAgent 输出：`OwnerConcession`（让价）+ 业主行为意图（保持 / 提价 / 撤盘）
- 与 CustomerAgent 对称：deterministic + seed-based

**实体契约**

```ts
// src/selling-houses/application/agents/ownerAgent.ts (新增)

interface OwnerAgentInput {
  readonly ownerId: string;
  readonly caseId: string;
  readonly day: number;
  readonly profile: OwnerProfilePrior;
  readonly readiness: OwnerCaseReadinessState;
  readonly knowledge: ActorKnowledge;
  readonly brokerRelations: readonly BrokerOwnerRelation[];
  readonly recentOffers: readonly BuyerOffer[];
  readonly seed: string;
}

interface OwnerAgentOutput {
  readonly ownerId: string;
  readonly caseId: string;
  readonly day: number;
  readonly actions: readonly (
    | { kind: 'concede'; price: number; conditions: readonly string[]; causedByOfferId?: string }
    | { kind: 'hold'; reason: string }
    | { kind: 'raise_ask'; price: number; reason: string }
    | { kind: 'withdraw'; reason: string }
  )[];
  readonly decisionTrace: {
    readonly factorsWeighted: Record<string, number>;     // 价格压力、紧迫度、信任度等的当前权重
    readonly perceivedMarketHeat: number;                 // 业主感知（≠真实）
  };
}
```

**数据流**

```
每 tick:
  for each owner-case pair:
    knowledge = projectActorKnowledge(owner)
    input = assembleOwnerAgentInput(...)
    output = ownerAgent.run(input)
    for each action:
      action.kind === 'concede' → emit OwnerConcession + InformationSourceRecord(kind: 'owner_interview', ...)
```

**验收判据**
- 新 gate `verify-selling-houses-owner-agent-v0-gate`：
  - 10 个 fixture owner scenarios
  - 必须有 owner 在 offer 后产生 concession
  - concession.causedByOfferId 必须真实
  - perceivedMarketHeat 必须基于 owner 的 ActorKnowledge，不能访问 HiddenTruth

**反例**
- OwnerAgent 直接读 `marketShadow` 全局热度——违反视角不对称

**风险**
- 高（同 A3.G1）

---

### A3.G3 — RivalBrokerAgent v0

**问题陈述**
当前同行经纪人由 `rivalListingEngine` 规则驱动。

**设计决策**
- RivalBrokerAgent 输入：经纪人的 `BrokerEntity` + `ACN behavior profile` + 视野内房源
- RivalBrokerAgent 输出：调价 / 推盘 / 收盘 / 协作请求
- v0 不引入复杂 ACN 协同，只做单经纪人决策

**实体契约**

```ts
// src/selling-houses/application/agents/rivalBrokerAgent.ts (新增)

interface RivalBrokerAgentInput {
  readonly brokerId: string;
  readonly day: number;
  readonly broker: BrokerEntity;
  readonly acnProfile: AcnBehaviorProfile;
  readonly listingsManaged: readonly ListingPopulationEntity[];
  readonly knowledge: ActorKnowledge;
  readonly seed: string;
}

interface RivalBrokerAgentOutput {
  readonly brokerId: string;
  readonly day: number;
  readonly actions: readonly (
    | { kind: 'reprice_listing'; listingId: string; newAskPrice: number; reason: string }
    | { kind: 'promote_listing'; listingId: string; channel: string }
    | { kind: 'withdraw_listing'; listingId: string; reason: string }
    | { kind: 'request_co_sale'; listingId: string; targetBrokerId: string }
  )[];
}
```

**验收判据**
- 新 gate `verify-selling-houses-rival-broker-agent-v0-gate`：
  - 10 个 fixture rival scenarios
  - 每个 broker 在 30 天内至少产生 1 个 reprice
  - reprice 方向必须与 acnProfile.directAggression 相关（gate 统计验证）

**风险**
- 中。Rival broker 决策影响外部市场压力。

---

### A3.G4 — Actor 视角不对称

**问题陈述**
当前虽然有 `InformationSourceRecord.visibility`，但 actor 读 trust/patience 等字段仍是全局视图。意味着"经纪人看到的业主"和"客户看到的业主"是同一份。

**设计决策**
- 引入 `ActorKnowledgeSnapshot`：每个 actor 自己的世界视图
- Snapshot 计算时按 visibility + delayDays 过滤 SourceRecord
- Agent 输入只接受 snapshot，禁止访问 GameState 主体

**实体契约**

```ts
// src/selling-houses/application/projections/actorKnowledgeProjection.ts (升级)

interface ActorKnowledgeSnapshot {
  readonly actorId: string;
  readonly actorKind: 'broker' | 'customer' | 'owner' | 'rival_broker';
  readonly day: number;

  readonly visibleSourceRecords: readonly InformationSourceRecord[];
  readonly perceivedFacts: readonly {
    readonly factId: string;
    readonly subject: string;                       // 谁/哪套房
    readonly attribute: string;                     // 哪个字段
    readonly perceivedValue: unknown;
    readonly perceivedConfidence: number;
    readonly perceivedAsOfDay: number;              // actor 认为这是哪天的事实
    readonly sourceRecordIds: readonly string[];
  }[];
  readonly knownEntities: readonly {
    readonly entityId: string;
    readonly entityKind: 'case' | 'customer' | 'owner' | 'broker';
    readonly knowledgeDepth: 'aware' | 'familiar' | 'expert';
  }[];
}
```

**数据流**

```
buildActorKnowledgeSnapshot(actorId, day):
  visibleSourceRecords = filter(allSourceRecords, source =>
    source.visibility.scope === 'all_actors' ||
    source.visibility.actorIds?.includes(actorId)
  ).filter(source => source.day + source.delayDays <= day)

  perceivedFacts = inferFacts(visibleSourceRecords, actorProfile)
  // 不同 actor 对同一 source 有不同信心权重
```

**验收判据**
- 新 gate `verify-selling-houses-actor-asymmetric-knowledge-gate`：
  - 构造 fixture：A 知道某 source（visibility=['A']），B 不知道
  - A 的 snapshot 含此 source，B 的 snapshot 不含
  - 同一 fact 对不同 actor 的 perceivedValue / perceivedConfidence 可不同

**反例**
- Agent 直接读 `state.cases[i].patience`——违反不对称（A 和 B 读到同一数值）

**风险**
- 高。视角不对称是宪法 ④ 的核心，但实现复杂。
- 缓解：先做 2 个 actor kind（broker、customer）；其余分批补。

---

### A3.G5 — Agent-driven Offer/Concession 替换 Rule path

**问题陈述**
A3.G1~G3 让 agent 能 emit Offer/Concession，但旧的 rule path 仍在生成它们。两个 path 并存会冲突。

**设计决策**
- 配置项 `runtimeMode: 'rule' | 'agent' | 'shadow'`
- `shadow` 模式：两个 path 都跑，比较输出（用于过渡）
- A3 完成时默认切到 `agent`
- Rule path 不删，保留 1 个 release 周期作回退

**实体契约**

```ts
// src/selling-houses/runtime/simulation/runtimeModeConfig.ts (新增)

interface RuntimeMode {
  readonly mode: 'rule' | 'agent' | 'shadow';
  readonly shadowComparison?: {
    readonly samplingRate: number;
    readonly divergenceThreshold: number;
  };
}
```

**数据流**

```
mode === 'rule':   走旧 rule path
mode === 'agent':  走新 agent path
mode === 'shadow': 两个都跑，记录差异
```

**验收判据**
- 新 gate `verify-selling-houses-agent-emission-gate`：
  - mode='agent' 时，所有 BuyerOffer / OwnerConcession 必有 `emittedByAgent` 字段
  - shadow 模式 7 天差异统计：critical decision agreement ≥ 95%
- A3 完成时：默认 mode 改为 'agent'

**反例**
- mode='agent' 但 rule path 还在跑：双重 emit → 数据污染

**风险**
- 高。切换风险大。
- 缓解：shadow 模式至少跑 2 周；agree rate 不达标不切。

---

### A3.G6 — Self-play Arena 全 AI

**问题陈述**
现有 `localAdversarialSelfPlayArena` 中玩家是规则 bot。需要让所有 actor 都是 agent。

**设计决策**
- Arena 配置：每个 actor kind 选 agent or rule
- 全 agent 模式：跑 10 局 → 收集成交率 / 价差 / 谈判天数分布
- 与历史 baseline 对比

**实体契约**

```ts
// 升级 localAdversarialSelfPlayArena.ts

interface ArenaConfig {
  readonly brokerActor: 'agent' | 'rule';
  readonly customerActor: 'agent' | 'rule';
  readonly ownerActor: 'agent' | 'rule';
  readonly rivalBrokerActor: 'agent' | 'rule';
  readonly runs: number;
  readonly seed: string;
}

interface ArenaRunStats {
  readonly runId: string;
  readonly soldRate: number;
  readonly avgPriceGap: number;           // (askPrice - soldPrice) / askPrice
  readonly avgNegotiationDays: number;
  readonly customerExitRate: number;
  readonly ownerWithdrawRate: number;
}
```

**验收判据**
- 新 gate `verify-selling-houses-full-agent-arena-gate`：
  - Arena 跑 10 局全 agent 模式
  - 成交率 与 历史 baseline 偏差 ≤ 15%
  - 平均价差 与 baseline 偏差 ≤ 10%

**风险**
- 中。Agent 行为可能让分布漂移。
- 缓解：先校准 agent 行为，再开 arena。

---

### A3.G7 — Persona Variability

**问题陈述**
需要保证不同 persona 的 agent 行为可区分（10 类客户、10 类业主、5 类同行）。

**设计决策**
- 每类 persona 跑 3 局
- 行为指标（offer 频率、concession 速度、风险偏好）必须显著不同
- 用统计检验（Kruskal-Wallis 或类似）验证 persona 间差异

**实体契约**

无新实体，但需要 fixture set：

```
scripts/fixtures/personas/
  customers/  (10 个 customer persona)
  owners/     (10 个 owner persona)
  rivals/     (5 个 rival broker persona)
```

**验收判据**
- 新 gate `verify-selling-houses-persona-variability-gate`：
  - 每类至少 3 局
  - 行为指标的 between-persona variance / within-persona variance ≥ 2.0
  - 任意两个 persona 在至少 1 个核心指标上有显著差异（p < 0.05）

**风险**
- 中。Persona 设计需要业务深度。

---

### A3 完成态判据

- ✅ 7 个 Goal 各自的 gate 全 PASS
- ✅ `runtimeMode` 默认切到 `'agent'`
- ✅ Rule path 在代码中保留但被 `@deprecated` 标记
- ✅ self-play arena 全 agent 模式跑通且分布与 baseline 接近

---

## 2.4 Phase A4 — 学习化 / 自主进化

**单句目标**：权重、prompt、persona 都从数据学习；系统能产出可观测的自我改进。

### A4 的形式化目标

A4 完成时：
- `closeProbability` 权重不再 magic number，每个权重值挂 `WeightExplanation`
- AI Prompt 经过 benchmark 评分排序，最优 prompt 自动选用
- 玩家高分回放被打标为 training data
- 跑 50 局自我对弈后，至少 1 项系统能力指标显著提升

---

### A4.G1 — WeightExplanation 实体

**问题陈述**
当前 `closeProbability` 权重是 dev 拍的。违反宪法 ④ 的"可解释"精神（5/22 审计 §4.2 二阶陷阱）。

**设计决策**
- 每个权重值挂 `WeightExplanation`，标注它来自何方
- 4 类来源：archetype default / historical distribution / market signal / dev configured（最后一类视为 truth debt，需要消除）

**实体契约**

```ts
// src/selling-houses/core/world-state/consensus/weightExplanation.ts (新增)

type WeightSource =
  | 'archetype_default'
  | 'historical_distribution'
  | 'market_signal'
  | 'dev_configured';          // truth debt

interface WeightExplanation {
  readonly factorName: string;                    // 'ownerTrust', 'priceGap', etc.
  readonly weightValue: number;
  readonly source: WeightSource;
  readonly derivedFrom: {
    readonly archetypeId?: string;
    readonly historicalContractIds?: readonly string[];
    readonly marketSignalSourceIds?: readonly string[];
    readonly devReasoning?: string;
  };
  readonly computedOnDay: number;
}

interface ContractFactState {
  // ... 原有字段
  readonly weightExplanations: readonly WeightExplanation[];   // 新增
}
```

**验收判据**
- 新 gate `verify-selling-houses-weight-explanation-gate`：
  - 每个 ContractFact 必有 ≥1 `WeightExplanation`
  - `source='dev_configured'` 命中率需逐步下降（CI 监控趋势）
- A4 完成时：`dev_configured` 命中率 ≤ 20%

**风险**
- 中。需要积累足够历史成交数据才能算出 `historical_distribution` 权重。

---

### A4.G2 — PriorEngine

**问题陈述**
需要从历史 ContractFact 学习成交价分布，作为权重 prior。

**设计决策**
- PriorEngine 输入：最近 N 笔 ContractFact + market environment
- PriorEngine 输出：权重 prior（按业主类型、市场状态、价位段分桶）
- 算法：先用简单 Bayesian update，后续可升级到更复杂模型

**实体契约**

```ts
// src/selling-houses/core/world-state/consensus/priorEngine.ts (新增)

interface PriorEngineInput {
  readonly historicalContracts: readonly ContractFactState[];
  readonly currentMarketHeat: number;
  readonly contextSegment: {                      // 用于分桶
    readonly ownerArchetypeId: string;
    readonly priceTier: 'budget' | 'mid' | 'premium';
    readonly marketCellHeatBand: 'cold' | 'warm' | 'hot';
  };
}

interface PriorEngineOutput {
  readonly factorWeights: Record<string, number>;
  readonly confidenceScore: number;                // 基于历史样本量
  readonly contributingContractIds: readonly string[];
  readonly explanation: WeightExplanation[];
}
```

**验收判据**
- 新 gate `verify-selling-houses-prior-engine-gate`：
  - 给定 100 个历史 contract fixture，prior engine 输出权重在合理范围
  - 同一 contextSegment 的 prior 是 deterministic
  - sample 数 < 10 时 confidenceScore < 0.5，提示降级到 archetype_default

**风险**
- 高。需要算法设计与历史数据。
- 缓解：先做最简 weighted average；prior 不足时降级到 archetype default。

---

### A4.G3 — AgentBenchmarkGate v1

**问题陈述**
A1.G5 的 v0 只测稳定性。v1 要测"性能"——哪个 prompt 在哪个场景下分数高。

**设计决策**
- 评分基于 ConversationEvaluation v1 的 6 维度（A2.G6）
- Benchmark 基准任务集：50 个 fixture，覆盖典型场景
- 输出 leaderboard：每个 prompt 在每个任务上的得分

**实体契约**

```ts
// src/selling-houses/core/world-state/agents/benchmarkV1.ts (新增)

interface BenchmarkTask {
  readonly taskId: string;
  readonly category: 'urgent_owner' | 'price_haggle' | 'cold_customer' | ...;
  readonly fixtureInput: AgentPerceptionPack;
  readonly evaluationCriteria: readonly ('grounding' | 'tone' | 'relevance' | 'urgency' | 'risk' | 'closure')[];
}

interface BenchmarkResult {
  readonly promptId: string;
  readonly taskId: string;
  readonly score: number;
  readonly dimensionScores: Record<string, number>;
  readonly stabilityRunIds: readonly string[];
}

interface BenchmarkLeaderboard {
  readonly date: string;
  readonly entries: readonly {
    readonly promptId: string;
    readonly avgScore: number;
    readonly bestCategories: readonly string[];
    readonly worstCategories: readonly string[];
  }[];
}
```

**验收判据**
- 新 gate `verify-selling-houses-agent-benchmark-v1-gate`：
  - 50 个 benchmark task 全部能跑
  - 每个 prompt 在每个 task 上都有 ≥1 result
  - leaderboard 每日更新

**风险**
- 中。Benchmark 任务设计影响公平性。

---

### A4.G4 — Prompt Evolution

**问题陈述**
有了 benchmark，需要机制让 prompt 自动改进。

**设计决策**
- 流程：识别低分 prompt → AI 提议改动 → shadow 模式跑 → benchmark 对比 → 显著提升才合并
- 改动单元：单个 prompt 单次修改
- 强约束：任何改动必须保持 schema 输出格式不变

**实体契约**

```ts
// src/selling-houses/runtime/simulation/promptEvolution.ts (新增)

interface PromptEvolutionProposal {
  readonly proposalId: string;
  readonly basePromptId: string;
  readonly proposedContent: string;
  readonly rationale: string;
  readonly targetWeakness: string;                // 改动针对哪个低分维度
}

interface PromptEvolutionResult {
  readonly proposalId: string;
  readonly shadowBenchmarkBefore: BenchmarkResult;
  readonly shadowBenchmarkAfter: BenchmarkResult;
  readonly improvement: number;                   // 必须 > threshold 才合并
  readonly mergedToProduction: boolean;
}
```

**数据流**

```
identify low-scoring prompt
  → llm.proposeImprovement(prompt, weakDimensions, benchmark history)
  → shadow run with new prompt
  → compare benchmark before/after
  → if improvement > 10% AND schema preserved → merge
  → else → log + retry next cycle
```

**验收判据**
- 新 gate `verify-selling-houses-prompt-evolution-gate`：
  - 改动 proposal 必须 deterministic（同输入同 output）
  - merged proposal 在 production 上的 benchmark 必须确实提升
  - rollback 机制可用：merged 后若 7 天 production 数据下降 → 自动回滚

**风险**
- 高。Prompt evolution 是"自动改自己"，必须有强 safeguard。
- 缓解：严格的 shadow 验证 + rollback。

---

### A4.G5 — Training Data Curation

**问题陈述**
玩家精彩回放（高分通关）应该反哺 agent prior。

**设计决策**
- 高分玩家轨迹（top 10%）打标
- 提取：玩家动作序列 + 同时的 ActorKnowledge + 当时的成交结果
- 作为 customerAgent / ownerAgent 行为 prior 的 supervised signal

**实体契约**

```ts
// src/selling-houses/runtime/simulation/trainingDataCuration.ts (新增)

interface TrainingDataPoint {
  readonly pointId: string;
  readonly playerRunId: string;
  readonly playerScore: number;
  readonly day: number;
  readonly actorContext: ActorKnowledgeSnapshot;
  readonly playerAction: ActionReceipt;
  readonly resultingFact?: {
    readonly buyerOfferId?: string;
    readonly ownerConcessionId?: string;
    readonly contractFactId?: string;
  };
  readonly anonymizedPlayerId: string;           // 隐私
}

interface TrainingDataset {
  readonly datasetId: string;
  readonly version: string;
  readonly points: readonly TrainingDataPoint[];
  readonly statisticsSummary: {
    readonly totalPoints: number;
    readonly playerScoreRange: readonly [number, number];
    readonly actorContextDistribution: Record<string, number>;
  };
}
```

**验收判据**
- 新 gate `verify-selling-houses-training-data-curation-gate`：
  - 数据点必去标识化（无原始 playerId）
  - 至少 1000 个高分数据点入库
  - dataset 可重放（同 version → 同点集）

**风险**
- 中。隐私 + 数据质量。
- 缓解：先用模拟 self-play 数据；玩家数据严格匿名化。

---

### A4.G6 — CoachAgent

**问题陈述**
有了 ConversationEvaluation 和 ActionReceipt，可以反向给玩家做教练。

**设计决策**
- CoachAgent 输入：玩家最近 N 天的 ActionReceipt + ConversationEvaluation
- CoachAgent 输出：3 条最针对性的改进建议（含具体场景引用）
- 不强制玩家接受；只在玩家请求时展示

**实体契约**

```ts
// src/selling-houses/application/agents/coachAgent.ts (新增)

interface CoachAgentInput {
  readonly playerId: string;
  readonly currentDay: number;
  readonly lookbackDays: number;
  readonly recentActionReceipts: readonly ActionReceipt[];
  readonly recentConversationEvals: readonly ConversationEvaluationV1[];
  readonly recentContractFacts: readonly ContractFactState[];
}

interface CoachingAdvice {
  readonly playerId: string;
  readonly generatedDay: number;
  readonly recommendations: readonly {
    readonly dimension: 'pricing' | 'communication' | 'timing' | 'relationship';
    readonly title: string;
    readonly explanation: string;
    readonly referencedReceiptIds: readonly string[];
    readonly referencedConversationIds: readonly string[];
    readonly suggestedAction: string;
  }[];
  readonly overallTrend: 'improving' | 'stable' | 'declining';
}
```

**验收判据**
- 新 gate `verify-selling-houses-coach-agent-gate`：
  - 推荐数必须 ≤ 3（避免信息过载）
  - 每条推荐都引用具体 receipt / conversation ID
  - 推荐与玩家近期实际弱点相关（fixture 验证）

**风险**
- 中。教练建议可能不精准。
- 缓解：限制推荐数；强制引用证据。

---

### A4.G7 — Self-Improvement Loop

**问题陈述**
A4 整体目标是"系统能自我改进"。需要一个端到端验证 loop。

**设计决策**
- 跑 50 局自我对弈
- 度量 3 个系统指标：成交质量（价格接近合理估值）/ AI advice 质量（benchmark score）/ 玩家满意度 proxy（conversation closure rate）
- 50 局后任意 1 项指标显著提升即视为 self-improvement loop 工作

**实体契约**

```ts
// src/selling-houses/runtime/simulation/selfImprovementLoop.ts (新增)

interface SystemCapabilityMetrics {
  readonly cycle: number;                         // 第几局
  readonly dealQualityScore: number;
  readonly aiAdviceBenchmarkScore: number;
  readonly conversationClosureRate: number;
}

interface SelfImprovementLoopReport {
  readonly startDate: string;
  readonly endDate: string;
  readonly totalCycles: number;
  readonly metricsBeforeFirst10: SystemCapabilityMetrics;
  readonly metricsAfterLast10: SystemCapabilityMetrics;
  readonly significantImprovements: readonly string[];     // 至少 1 项
  readonly degradations: readonly string[];                // 必须为空
}
```

**验收判据**
- 新 gate `verify-selling-houses-self-improvement-loop-gate`：
  - 50 局后至少 1 个指标提升 ≥ 5%（统计显著）
  - 无任何指标降低 ≥ 5%
  - report 可重现（同 seed 同 prior → 同结果）

**风险**
- 高。Self-improvement 是 A4 最难的目标。
- 缓解：先证明 1 局到 50 局指标稳定；再追求提升。

---

### A4 完成态判据

- ✅ 7 个 Goal 各自的 gate 全 PASS
- ✅ `dev_configured` WeightExplanation 命中率 ≤ 20%
- ✅ Prompt evolution 已合并 ≥ 1 个改进
- ✅ self-improvement loop 跑通且至少 1 项指标显著提升

---

# Part 3 — 通用治理规则

## 3.1 Provenance 词汇表

### Canonical Store Write Provenance（来自 `canonicalStoreKernel.ts`）

| Provenance | 含义 | 允许范围 |
|---|---|---|
| `canonical-bootstrap` | 初始化 | game setup |
| `canonical-delta` | 运行时状态变更 | 主链所有 helper |
| `contract-fact` | 合同形成路径 | dealClosing |
| `terminal-outcome` | 终局结算路径 | settlement |
| `old_save_compatibility` | 从 legacy 字段恢复 | save loading |
| `fixture-only` | 测试 fixture | tests only |
| `legacy_truth_debt` | 已知未完成链路 | **A1 内消除到 0** |

### Agent Memory Provenance（A1.G3 引入）

| Provenance | 含义 | 可被 belief 推断消费？ |
|---|---|---|
| `fact_observed` | 来自 SourceRecord | ✅ |
| `player_input` | 玩家显式输入 | ✅ |
| `llm_inference` | LLM 推断 | ❌ |
| `agent_synthesized` | agent 内部推理 | ❌ |

### Weight Source（A4.G1 引入）

| Source | 含义 | 视为 truth debt？ |
|---|---|---|
| `archetype_default` | 原型默认 | 否 |
| `historical_distribution` | 历史成交学习 | 否 |
| `market_signal` | 市场信号推导 | 否 |
| `dev_configured` | 开发者拍数 | **是，A4 监控趋势降低** |

## 3.2 Gate 命名约定

```
verify-selling-houses-<scope>-<assertion>-gate.ts

scope:
  r{NN}                    具体 round
  agent-{type}             agent kind
  consensus / contract     宪法核心
  evidence / grounding     A2 主题
  weight / prior           A4 主题
  full-{path}              端到端

assertion:
  {feature}-gate           检查 feature 存在/正确
  -truth-seal              结构封印
  -coverage                覆盖率
  -happy-path              快乐路径
  -contradiction           矛盾检测
```

每个 Phase 完成时必须有对应的"phase-completion gate"：

- `verify-selling-houses-phase-a1-completion-gate`
- `verify-selling-houses-phase-a2-completion-gate`
- `verify-selling-houses-phase-a3-completion-gate`
- `verify-selling-houses-phase-a4-completion-gate`

## 3.3 写入边界规则

| 字段类型 | 写入约束 |
|---|---|
| Canonical store 字段 | 必须通过 `asWritable*` + provenance；只允许 boundary helper 调用 |
| Mirror 字段（如 Case.status） | 只能从 canonical 派生，通过 `syncLegacyXxxFromYyy` 单一函数 |
| AI 输出（advice / story） | 必须挂 `AdviceProvenance` 或对应 provenance 实体 |
| 评估输出（evaluation / risk） | 必须 deterministic（同输入同输出） |
| Magic number | A4 完成前允许但需挂 `WeightExplanation(source='dev_configured')`；A4 完成后逐步消除 |

## 3.4 文档归属

每个 Phase 完成时必须产出：

1. `selling-houses-phase-{a1|a2|a3|a4}-completion-report-YYYY-MM-DD.md` — 完成报告
2. 对应 Gate 文件
3. `selling-houses-agent-handoff.md` 翻新（记录该 Phase）
4. `selling-houses-master.md` §6 入口同步

---

# Part 4 — 失败模式与回退

## 4.1 每阶段的失败可逆性

| 阶段 | 主要失败模式 | 回退路径 |
|---|---|---|
| A1 | Memory provenance 改动破坏现有 agent | 保留旧 schema 一个 release；agent 可选用新/旧 store |
| A2 | Storyteller LLM 输出不稳定 | 退回到 deterministic 模板叙事 |
| A3 | Agent 行为分布偏移 baseline | shadow 模式停留更久；不切 mode='agent' |
| A4 | Prompt evolution 合并后 production 退化 | 自动 rollback 机制 + 7 天观察 |

## 4.2 跨阶段失败传染

```
A1 失败 → A2 grounding 无可信 memory → 整个 A2 受影响
A2 失败 → A3 agent 无法做出可解释决策 → A3 dangerous
A3 失败 → A4 无足够 actor 行为数据 → prior engine 不可信
A4 失败 → 系统仍能跑，但无自我改进 → 仅延期，无连锁
```

**最危险的是 A1 失败传染**——所以 A1 的 7 个 Goal 必须 100% 完成才能进 A2。

## 4.3 全局回退按钮

任何阶段失败后：

1. 关闭该阶段所有新 gate
2. 设置 `runtimeMode` 为前一阶段稳定态
3. 保留 A1~A4 引入的所有新实体（不删，但不强制使用）
4. handoff.md 记录失败原因 + 何时重试

---

# 附录 A：所有计划新增 Gate 清单

| Phase | Gate | 验收 |
|---|---|---|
| A1 | `verify-selling-houses-case-mesh-runtime-gate` | CaseMesh v0 |
| A1 | `verify-selling-houses-agent-memory-provenance-gate` | Memory provenance |
| A1 | `verify-selling-houses-shadow-report-coverage-gate` | Shadow report |
| A1 | `verify-selling-houses-agent-prompt-stability-gate` | Benchmark v0 |
| A1 | `verify-selling-houses-risk-label-v1-gate` | Risk label v1 |
| A1 | `verify-no-legacy-truth-debt-gate` | Debt 清零 |
| A1 | `verify-selling-houses-phase-a1-completion-gate` | Phase 闭合 |
| A2 | `verify-selling-houses-advice-provenance-schema-gate` | AdviceProvenance |
| A2 | `verify-selling-houses-advice-grounding-gate` | Grounding |
| A2 | `verify-selling-houses-contract-fact-storyteller-gate` | Storyteller |
| A2 | `verify-selling-houses-wechat-evidence-injection-gate` | Wechat evidence |
| A2 | `verify-selling-houses-five-why-explainability-gate` | 5-Why |
| A2 | `verify-selling-houses-conversation-eval-v1-gate` | Eval v1 |
| A2 | `verify-selling-houses-phase-a2-completion-gate` | Phase 闭合 |
| A3 | `verify-selling-houses-customer-agent-v0-gate` | CustomerAgent |
| A3 | `verify-selling-houses-owner-agent-v0-gate` | OwnerAgent |
| A3 | `verify-selling-houses-rival-broker-agent-v0-gate` | RivalBrokerAgent |
| A3 | `verify-selling-houses-actor-asymmetric-knowledge-gate` | 视角不对称 |
| A3 | `verify-selling-houses-agent-emission-gate` | Agent emit |
| A3 | `verify-selling-houses-full-agent-arena-gate` | Arena |
| A3 | `verify-selling-houses-persona-variability-gate` | Persona |
| A3 | `verify-selling-houses-phase-a3-completion-gate` | Phase 闭合 |
| A4 | `verify-selling-houses-weight-explanation-gate` | WeightExplanation |
| A4 | `verify-selling-houses-prior-engine-gate` | PriorEngine |
| A4 | `verify-selling-houses-agent-benchmark-v1-gate` | Benchmark v1 |
| A4 | `verify-selling-houses-prompt-evolution-gate` | Prompt evo |
| A4 | `verify-selling-houses-training-data-curation-gate` | Training data |
| A4 | `verify-selling-houses-coach-agent-gate` | Coach |
| A4 | `verify-selling-houses-self-improvement-loop-gate` | Self-improve |
| A4 | `verify-selling-houses-phase-a4-completion-gate` | Phase 闭合 |

**新增 gate 总数：29 个**（7 + 7 + 8 + 9 - 重复 phase-completion 2）。

---

# 附录 B：所有计划新增实体清单

| 实体 | Phase | 文件 |
|---|---|---|
| `CaseMeshNode` / `CaseMeshSignal` / `CaseMeshRuntimeState` | A1 | `application/agents/caseMesh.ts` |
| `AgentMemoryProvenance` enum + 升级的 `AgentMemoryFact` | A1 | `core/world-state/agents/memoryStore.ts` |
| `ShadowReportEntry` / `ShadowReportDailySummary` | A1 | `core/world-state/agents/shadowReport.ts` |
| `PromptStabilityTest` / `BenchmarkV0Summary` | A1 | `core/world-state/agents/benchmarkV0.ts` |
| `RiskDimension` + `RiskLabel` + `ConversationRiskAssessment` | A1 | `core/world-state/agents/conversationRiskLabels.ts` |
| `AdviceProvenance` | A2 | `core/world-state/agents/adviceProvenance.ts` |
| `AdviceAssertion` / `AdviceGroundingCheck` | A2 | `core/world-state/agents/adviceGrounding.ts` |
| `ContractFactStory` | A2 | `application/agents/contractFactExplainerAgent.ts` |
| `WechatPromptInput` / `WechatPromptOutput` | A2 | 升级 `wechatPromptPresets.ts` |
| `FiveWhyScenarioExpectation` | A2 | `scripts/fixtures/five-why-scenarios.ts` |
| `ConversationEvaluationV1` | A2 | `core/world-state/agents/conversationEvaluation.ts` |
| `CustomerAgentInput` / `CustomerAgentOutput` | A3 | `application/agents/customerAgent.ts` |
| `OwnerAgentInput` / `OwnerAgentOutput` | A3 | `application/agents/ownerAgent.ts` |
| `RivalBrokerAgentInput` / `RivalBrokerAgentOutput` | A3 | `application/agents/rivalBrokerAgent.ts` |
| `ActorKnowledgeSnapshot` | A3 | `application/projections/actorKnowledgeProjection.ts` |
| `RuntimeMode` | A3 | `runtime/simulation/runtimeModeConfig.ts` |
| `ArenaConfig` / `ArenaRunStats` | A3 | 升级 `localAdversarialSelfPlayArena.ts` |
| `WeightSource` + `WeightExplanation` | A4 | `core/world-state/consensus/weightExplanation.ts` |
| `PriorEngineInput` / `PriorEngineOutput` | A4 | `core/world-state/consensus/priorEngine.ts` |
| `BenchmarkTask` / `BenchmarkResult` / `BenchmarkLeaderboard` | A4 | `core/world-state/agents/benchmarkV1.ts` |
| `PromptEvolutionProposal` / `PromptEvolutionResult` | A4 | `runtime/simulation/promptEvolution.ts` |
| `TrainingDataPoint` / `TrainingDataset` | A4 | `runtime/simulation/trainingDataCuration.ts` |
| `CoachAgentInput` / `CoachingAdvice` | A4 | `application/agents/coachAgent.ts` |
| `SystemCapabilityMetrics` / `SelfImprovementLoopReport` | A4 | `runtime/simulation/selfImprovementLoop.ts` |

**新增实体总数：约 50 个 interface**。

---

# 附录 C：相关文档

| 文档 | 关系 |
|---|---|
| `selling-houses-master.md` | 本文是 §3 第一性原理的下一阶段路线图 |
| `selling-houses-constitutional-audit-2026-05-22.md` | 本文 Part 1 是它的回归测试 |
| `selling-houses-entity-canonical-map.md` | 本文 Part 3.3 写入边界规则的实体侧投影 |
| `selling-houses-field-ownership-matrix.md` | 本文 A1.G7 truth debt 清债使用的字段级路径图 |
| `selling-houses-mother-model-agent-workplan.md` | 本文是其下一阶段工作板 |
| `selling-houses-agent-handoff.md` | 本文 Part 3.4 定义其翻新规则 |
