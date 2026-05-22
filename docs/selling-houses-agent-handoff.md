# Selling Houses Agent Handoff

本文件用于 A/B/C/D 与 S 之间交接，不放一次性长报告，不替代代码和 gate。

## 使用规则

- A/B/C/D 完成任务后，把结果写到本文件对应小节。
- S 直接读取本文件、`git diff` 和 gate 结果做总检查。
- 不要求用户复制粘贴 agent 汇报。
- 每次交接只保留当前轮有效内容；旧内容完成后可覆盖。
- 不在这里写秘钥、账号、原始大段日志。

## 当前轮：Constitutional Migration R10 — Final Core→Domain Bridge Reduction + Exact Gate Hygiene

### 总目标
1. DeepReadonly compile-time type + deepFreeze 返回值强化
2. 派生业务原型定义 runtime frozen + readonly typed
3. 消除 evaluation 层全部 domain imports（Case/GameState/Opportunity）
4. 消除 world-state adapter/test 全部 domain imports
5. 消除最后测试债务（legacyCaseOwnedReadModels.test.ts + legacy-case-field-ownership.ts）
6. 修复 gate hygiene scanner 内联块注释假阴性
7. **core→domain allowlist 6 → 0**

### A：P0 DeepReadonly + Derived Canonical Definition Immutability

- 状态：done
- 改动文件：
  - `src/selling-houses/core/util/deepFreeze.ts` — 新增 `DeepReadonly<T>` 递归 readonly 类型，`deepFreeze` 返回 `DeepReadonly<T>`
  - `src/selling-houses/core/business-rules/action-specs/actionDefinitions.ts` — `metricFocus` 改 `readonly ActionMetricKey[]`
  - `src/selling-houses/core/business-rules/archetypes/archetypeTaxonomy.ts` — `CustomerProfile.layouts/preferences`、`RivalStoreArchetype.districtFocus` 改 `readonly string[]`
  - `src/selling-houses/core/business-rules/archetypes/definitions.ts` — 全部派生定义改为 `deepFreeze()` + readonly 类型
  - **新增** `src/selling-houses/core/business-rules/archetypes/__tests__/archetypeDefinitions.test.ts` — 9 个 immutability 测试
  - `src/selling-houses/domain/worlds/builtinWorld.ts` — 新增 `mutableClone<T>()` helper，5 个 seed 数组改用 `mutableClone`
  - `src/selling-houses/core/business-rules/action-specs/legacyAdapter.ts` — `metricFocus` 边界 spread `[...action.metricFocus]`
  - `src/selling-houses/domain/scenario-generation/scenarioAssembler.ts` — `districtFocus` 边界 spread
  - `src/selling-houses/domain/engine/customerEngine.ts`、`opportunityEngine.ts` — `customer.preferences` 边界 spread

#### RED
- 新增 archetypeDefinitions.test.ts 9 个测试，验证 push/覆盖/嵌套修改均抛出 TypeError
- `npx vitest run archetypeDefinitions` — 9 failed（定义未冻结）

#### GREEN
- 实现 `DeepReadonly<T>` 递归 readonly 类型
- `deepFreeze()` 返回 `DeepReadonly<T>`
- 派生定义全部 `deepFreeze()` 包装
- domain 边界用 `mutableClone()` 解冻 readonly → mutable

#### Spec CR
- 没有改任何数值 ✅
- 所有派生定义 runtime TypeError on mutation ✅
- domain 边界 mutableClone 保持 WorldSpec 可变数组 ✅

### B：P0 Remove Evaluation Core→Domain Imports With Minimal Contracts

- 状态：done
- 改动文件：
  - **新增** `src/selling-houses/core/evaluation/legacyEvaluationContracts.ts` — LegacyEvaluationCaseLike, LegacyEvaluationOpportunityLike, LegacyEvaluationStateLike, LegacyScoreSeparationCaseLike, LegacyScoreSeparationStateLike, LegacyScoreSeparationOpportunityLike
  - `src/selling-houses/core/evaluation/legacyAdapters.ts` — Case/GameState/Opportunity → LegacyEvaluation* 契约类型
  - `src/selling-houses/core/evaluation/score-separation/legacyAdapter.ts` — 同上
  - `scripts/verify-selling-houses-layer-imports.ts` — allowlist 6→4，新增 2 个 deleted-key guard

#### RED
- 先更新 allowlist count 期待 6→4

#### GREEN
- 定义 LegacyEvaluation* 契约（mutable arrays 使 domain 类型无需 casting 即满足）
- Optional fields 对齐 domain optionality
- legacyAdapters.ts 和 score-separation/legacyAdapter.ts 改用契约类型

#### Spec CR
- evaluation 层不再 import domain Case/GameState/Opportunity ✅
- 契约类型 mutable arrays 匹配 domain 类型 ✅
- Optional fields 对齐 ✅

### C：P0 Remove World-State Adapter/Test Domain Imports With LegacyWorldStateLike

- 状态：done
- 改动文件：
  - **新增** `src/selling-houses/core/world-state/legacyWorldAdapterContracts.ts` — LegacyWorldCaseLike, LegacyWorldOpportunityLike, LegacyWorldGameStateLike, LegacyWorldMarketCellLike, LegacyWorldCustomerLike, LegacyWorldCompetitionGroupLike, LegacyWorldProductRunLike, LegacyWorldDomainEventLike
  - `src/selling-houses/core/world-state/adapters.ts` — Case/GameState/Opportunity → LegacyWorld* 契约类型，union type fields 加 type assertion
  - `src/selling-houses/core/world-state/__tests__/legacyAdapter.test.ts` — 同上
  - `scripts/verify-selling-houses-layer-imports.ts` — allowlist 4→2，新增 2 个 deleted-key guard

#### GREEN
- 定义 LegacyWorld* 契约（覆盖 Case/GameState/Opportunity/MarketCell/Customer/CompetitionGroup/ProductRun/DomainEvent）
- adapters.ts 改用契约类型 + type assertion（string → union type narrowing）
- LegacyWorldCustomerLike.layouts/preferences 用 `readonly string[]` 匹配 CustomerProfile

#### Spec CR
- adapters.ts 不再 import domain Case/GameState/Opportunity ✅
- legacyAdapter.test.ts 不再 import domain ✅
- 契约类型 readonly arrays 匹配 CustomerProfile ✅

### D：P1 Remove Remaining Test Debt + Exact Gate Hygiene + Handoff

- 状态：done
- 改动文件：
  - `src/selling-houses/core/world-state/__tests__/legacyCaseOwnedReadModels.test.ts` — `Case` → `LegacyWorldCaseLike`
  - `src/selling-houses/core/world-state/legacy-case-field-ownership.ts` — `keyof Case` → `keyof LegacyWorldCaseLike`
  - `scripts/selling-houses-gate-hygiene.ts` — 修复 inline block comment 假阴性（不再 blank 整行，只跳过注释字符）
  - `scripts/verify-selling-houses-gate-hygiene.ts` — 新增 2 个 inline block comment self-test（25/25 PASS）
  - `scripts/verify-selling-houses-layer-imports.ts` — allowlist 2→0，新增 2 个 deleted-key guard

#### RED
- 手动构造 `/* comment */ check(true, "bad")` 单行代码，当前 scanner 不检测

#### GREEN
- `stripNonCodeRegions` 不再 blank 整行 — 只跳过 block comment 字符，保留同行前后代码
- legacyCaseOwnedReadModels.test.ts 改用 LegacyWorldCaseLike 契约
- legacy-case-field-ownership.ts 改用 `keyof LegacyWorldCaseLike` 替代 `keyof Case`
  - 语义等价：LegacyWorldCaseLike 与 Case 有相同字段集合
  - 新增字段须同步更新契约，编译器自动报错 missing ownership entry

#### Spec CR
- core→domain allowlist = 0（全部清零）✅
- gate hygiene 检测 inline block comment 后的代码 ✅
- gate hygiene 检测 inline block comment 前的代码 ✅
- 25/25 hygiene checks PASS ✅

---

### 全量命令真实结果

| 命令 | 结果 |
|------|------|
| `git diff --check` | **PASS** |
| `npm run lint -- --pretty false` | **PASS（0 errors）** |
| `npm run build` | **PASS** |
| `npx vitest run src/selling-houses/` | **PASS（417/417）** |
| `npx tsx scripts/verify-selling-houses-layer-imports.ts` | **PASS（0 allowlist entries, freeze gate + deleted-key guard active）** |
| `npx tsx scripts/verify-selling-houses-architecture-boundaries.ts` | **PASS（48/48）** |
| `npx tsx scripts/verify-selling-houses-constitutional-migration-gate.ts` | **PASS（24/24）** |
| `npx tsx scripts/verify-selling-houses-contract-terminal-fact-gate.ts` | **PASS（56/56）** |
| `npx tsx scripts/verify-selling-houses-price-trajectory-v0-gate.ts` | **PASS（70/70）** |
| `npx tsx scripts/verify-selling-houses-broker-customer-relation-v0-gate.ts` | **PASS（27/27）** |
| `npx tsx scripts/verify-selling-houses-r4-scale-gate.ts` | **PASS（32/32）** |
| `npx tsx scripts/verify-selling-houses-gate-hygiene.ts` | **PASS（25/25）** |

### Allowlist 变迁

| 轮 | count | 变化 |
|----|-------|------|
| R5 | 16 | ProductType 迁出 |
| R6 | 14 | ActionCategoryId/ActionMetricKey 迁出 (-2) |
| R7 | 11 | Archetype 7 types 迁出 (-1), BALANCE.scoring 迁出 (-2) |
| R8 | 9 | ACTIONS 迁出 (-1), BUILT_IN_WORLD 迁出 (-1) |
| R9 | 6 | models.ts 迁出 (-1), legacy-case-segments 迁出 (-1), legacy-case-owned-read-models 迁出 (-1) |
| R10 | 0 | evaluation 契约 (-2), world-state 契约 (-2), 测试/field-ownership 契约 (-2) |

### Core→Domain Allowlist Debt Summary (0 entries)

**全部清零。** Core 层不再有任何 domain import。15 个 deleted-key regression guards 持续监控。

### Core→Domain Canonical Types 已迁出（R10 新增）

| Type | Canonical File | 替换目标 |
|------|---------------|---------|
| `DeepReadonly<T>` | `core/util/deepFreeze.ts` | `Readonly<T>` |
| `LegacyEvaluationCaseLike` | `core/evaluation/legacyEvaluationContracts.ts` | domain Case |
| `LegacyEvaluationOpportunityLike` | `core/evaluation/legacyEvaluationContracts.ts` | domain Opportunity |
| `LegacyEvaluationStateLike` | `core/evaluation/legacyEvaluationContracts.ts` | domain GameState |
| `LegacyScoreSeparationCaseLike` | `core/evaluation/legacyEvaluationContracts.ts` | domain Case |
| `LegacyScoreSeparationStateLike` | `core/evaluation/legacyEvaluationContracts.ts` | domain GameState |
| `LegacyWorldCaseLike` | `core/world-state/legacyWorldAdapterContracts.ts` | domain Case |
| `LegacyWorldOpportunityLike` | `core/world-state/legacyWorldAdapterContracts.ts` | domain Opportunity |
| `LegacyWorldGameStateLike` | `core/world-state/legacyWorldAdapterContracts.ts` | domain GameState |
| `LegacyWorldMarketCellLike` | `core/world-state/legacyWorldAdapterContracts.ts` | domain MarketCell |
| `LegacyWorldCustomerLike` | `core/world-state/legacyWorldAdapterContracts.ts` | domain CustomerProfile |
| `LegacyWorldCompetitionGroupLike` | `core/world-state/legacyWorldAdapterContracts.ts` | domain CompetitionGroup |
| `LegacyWorldProductRunLike` | `core/world-state/legacyWorldAdapterContracts.ts` | domain ProductRun |
| `LegacyWorldDomainEventLike` | `core/world-state/legacyWorldAdapterContracts.ts` | domain DomainEventEntry |

### 下一轮建议

1. **Author canonical Case/GameState/Opportunity interfaces in core** — 契约类型是过渡方案，最终应在 core 定义完整的 canonical 接口替代 domain 里的 Case/GameState/Opportunity
2. **Merge evaluation + world-state contracts** — LegacyEvaluationCaseLike 和 LegacyWorldCaseLike 有大量重叠，可统一为单一 canonical Case 接口
3. **Type-safe adapter narrowing** — 当前 string→union type assertion 可改为 runtime validation（isStorylineState、isGoalTier 等）
4. **DeepReadonly on WorldStateSnapshot** — 快照应是 immutable，可应用 DeepReadonly
