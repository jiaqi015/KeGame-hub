# Decision Moment Emission Activation

## 改了什么、为什么改

本次改动将 5 个 DecisionMoment 和 4 个 BusinessFlow 从"装饰常量"激活为运行时事件层。

**核心改动**：
- 新增 `decisionMomentEmission.ts` helper，包含 `emitDecisionMomentTriggers` 和 `advanceFlowProgress` 两个公共函数
- 在 `executeAction`（actionResolvers.ts）和 `executeScenarioAction`（gameTransitions.ts）两个执行路径的末尾各追加一次 emit 调用
- `DomainEventKind` 新增 `decision_moment_triggered` 和 `business_flow_step_advanced`
- `GameState` 新增 `flowProgress` 字段，随存档持久化

**为什么**：之前 DecisionMoment 和 BusinessFlow 只在 legacyAdapter 中做只读映射，从未在运行时被记录。这让下游决策支持系统无法感知玩家处于哪个决策时刻、业务流程走到哪一步。

## Phase 1 验证核心证据

| 假设 | 结果 | 关键证据 |
|---|---|---|
| A: DECISION_MOMENTS 从未被触发 | ✅ 成立 | `momentId` 仅出现在 definitions.ts 常量赋值和 legacyAdapter 只读映射 |
| B: BUSINESS_FLOWS 从未被推进 | ✅ 成立 | `flowProgress` / `flowStepAdvanced` 关键词零匹配 |
| C: EngineRuntimeContract 零使用 | ✅ 成立 | actions.ts 引用类型但从未赋值 contract |
| D: legacyAdapter 只读 | ✅ 成立 | 255 行全文无写操作 |
| E: 双执行路径 | ⚠️ 部分成立 | executeScenarioAction 是独立路径，open-day/showing 在玩家 UI 中绕过 executeAction |

## Phase 3 演练关键数据

### Phase 3 强制跑（含 forceUnlockAction）

20 run 全部通过，5/5 momentId 覆盖。但 forceUnlockAction 让数据失去诊断价值。

### Phase 3.5 自然跑（无 forceUnlock，纯 recommendationEngine top-1）

| momentId | 自然触发次数 | 强制触发次数 | 差距 |
|---|---|---|---|
| first-visit-owner-discovery | 91 | 20 | +71（自然更高） |
| pricing-strategy-adjustment | 0 | 60 | -60（完全无法自然触发） |
| open-day-participation | 0 | 20 | -20（完全无法自然触发） |
| sincerity-sale-entry | 0 | 20 | -20（完全无法自然触发） |
| offer-acceptance-negotiation | 38 | 66 | -28（自然可触发但频率低） |

**自然覆盖率：2/5**

## 已知风险

1. **自然覆盖率仅 2/5**：`pricing-strategy-adjustment`、`open-day-participation`、`sincerity-sale-entry` 在 recommendationEngine 启发式推荐 + 自然 enable 条件下无法触发。这不是 emit 机制 bug，是推荐策略与 DecisionMoment 设计的接合缺口。
2. **signalsSnapshot.intent 实际映射 case.d1**，与 Opportunity.intent 是不同概念，下次 PR 应改名为 `d1` 或 `customerSignal`。
3. **typed payload 妥协**：数据塞进 `payload: Record<string, unknown>`，下游消费方读 `payload.momentId` 需要 cast。下次有 PR 改 decision-support 消费时加 typed payload helper。

## 下一步建议（不执行）

1. **补推荐策略**：在 recommendationEngine 中为 `ask-psychological-price`、`open-day`、`sincerity-sale` 增加推荐路径，使 5/5 momentId 可自然触发
2. **调 enable 条件**：如果这些 action 的 enable 条件确实太严，考虑降低门控（如 open-day 的 energy 要求、sincerity-sale 的 offers 前置）
3. **consumption layer**：在 decision-support 消费端读取 `decision_moment_triggered` 事件，真正驱动推荐面板和诊断面板
4. **typed payload helper**：为 `DecisionMomentTriggerPayload` 和 `FlowStepAdvancedPayload` 提供 typed accessor，消除 `as any` cast
