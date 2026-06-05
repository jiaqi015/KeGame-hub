# Mimo Prompt: AI Arrangement Harness

你要在 `/Users/jiaqi/Documents/开放日测算` 的 selling-houses 项目里实现“AI 安排”真实 harness/agent 后端。前端框架已经先落好：

- `src/selling-houses/ui/features/AiArrangementPanel.tsx`
- `src/selling-houses/ui/features/aiArrangement.ts`
- `src/selling-houses/ui/features/__tests__/aiArrangement.test.ts`

当前前端只做本地 proposal，占位 source 是 `frontend-framework`。你的目标是把它替换为真实 agent/harness，同时保持 UI 交互不变：用户点击 `AI 安排`，小窗显示推演中，然后返回一个可取消/可采纳的方案；采纳后仍然通过已有 today plan 路径加入安排，AI 不允许直接改 `GameState`。

## 目标

实现一个 AI arrangement harness：

1. 从当前 `GameState` / `ArrangementProjection` / 微信信号 / 市场信号构建小型 context pack。
2. 生成今日安排 proposal，只能从现有 candidate actions 中选择。
3. LLM 只能输出 JSON proposal，不能声明已经修改状态。
4. normalize/arbiter 必须拒绝未知 action、未知 case、重复 draft、超精力、超时段容量、disabled candidate。
5. handler 返回 observation / trace / shadowReport / evaluationReport 风格要贴近现有 `actionDecisionAdvice` 和 `myWechatConversation` harness。
6. 前端仍然只显示用户语言，不展示 `fallback`、`LLM 置信度`、`规则置信度`、trace 这类系统噪音。

## 建议文件拆分

优先按这个拆：

```text
src/selling-houses/application/aiArrangement/contextPack.ts
src/selling-houses/application/aiArrangement/proposal.ts
src/selling-houses/application/aiArrangement/fallbackPlanner.ts
src/selling-houses/application/agents/aiArrangementAgentAdapter.ts
src/selling-houses/application/agents/aiArrangementDualRuntime.ts
src/selling-houses/interfaces/http/aiArrangementHandlers.ts
src/selling-houses/interfaces/http/__tests__/aiArrangementHandlers.test.ts
src/selling-houses/application/__tests__/aiArrangementAgentHarness.test.ts
```

前端可再新增一个 client：

```text
src/selling-houses/ui/features/aiArrangementClient.ts
```

但不要让 client 直接写状态。client 只返回 proposal，采纳仍走 `AiArrangementPanel` 里的 `onAddToToday(item, slot)`。

## Context Pack 契约

context pack 只放可见和可解释的内容：

```ts
interface AiArrangementContextPack {
  packId: string;
  day: number;
  currentSlot: 'am' | 'pm';
  energy: {
    remaining: number;
    planned: number;
    fixedReserve: number;
  };
  slots: {
    am: { remainingCapacity: number; fixedCount: number; plannedCount: number };
    pm: { remainingCapacity: number; fixedCount: number; plannedCount: number };
  };
  plannedItems: VisibleArrangementItem[];
  fixedItems: VisibleArrangementItem[];
  candidateItems: VisibleArrangementItem[];
  wechatSignals: VisibleWechatSignal[];
  marketSignals: VisibleMarketSignal[];
  constraints: string[];
}
```

`candidateItems` 最多 8 条，必须带稳定 id：

```ts
interface VisibleArrangementItem {
  itemId: string;
  actionId: string;
  caseId?: string;
  customerId?: string;
  opportunityId?: string;
  slot?: 'am' | 'pm';
  title: string;
  detail: string;
  energyCost: number;
  durationHours: number;
  rank?: number;
  disabledReason?: string;
}
```

## Proposal 契约

```ts
interface AiArrangementProposal {
  proposalId: string;
  source: 'ai' | 'fallback';
  confidence: number;
  headline: string;
  summary: string;
  evidenceLabels: string[];
  drafts: Array<{
    itemId: string;
    slot: 'am' | 'pm';
    title: string;
    reason: string;
    energyCost: number;
    durationHours: number;
  }>;
}
```

注意：draft 只能引用 `contextPack.candidateItems[].itemId`，不能凭空生成新任务。

## Agent 编排

第一版不要做多个网络 sub-agent。先做内部信号器：

1. `CapacityAgent`：计算剩余精力、时段容量、固定事项和已排事项。
2. `CasePriorityAgent`：基于 candidate rank、业主压力、客户机会、市场信号排序。
3. `WechatPressureAgent`：把待回复/强催促消息压缩成 3 条以内信号。
4. `PlannerAgent`：LLM 只消费 compact context，输出 JSON proposal。
5. `Arbiter`：校验 LLM proposal。合法则接受 AI；非法则回退 deterministic fallback。

沿用现有 harness 习惯：

- 参考 `src/selling-houses/application/agents/actionDecisionAgentAdapter.ts`
- 参考 `src/selling-houses/application/agents/actionDecisionDualRuntime.ts`
- 参考 `src/selling-houses/interfaces/http/actionDecisionAdviceHandlers.ts`
- 参考 `src/selling-houses/interfaces/http/myWechatConversationHandlers.ts`
- 参考 observation 类型：`src/selling-houses/core/world-state/agents/observation.ts`

## Prompt 要求

LLM prompt 必须要求：

- 只输出 JSON。
- 只能选择给定 candidate itemId。
- 不要输出思维链。
- 不要声称已经修改状态。
- 不要加入不存在的任务。
- 优先少而准，最多 3 个 draft。
- 如果没有可排动作，返回空 drafts，并说明今天先处理已有安排。

示例系统约束：

```text
你是卖房经营游戏里的今日安排代理。你只能根据输入的 candidateItems 做选择。
你不能创建新 action，不能修改游戏状态，不能声称已经安排成功。
输出必须是 JSON，字段为 headline、summary、evidenceLabels、drafts。
drafts 中每一项只能引用 candidateItems 里存在且未 disabled 的 itemId。
总 energyCost 不能超过 energy.remaining，单个 slot 不能超过 slots[slot].remainingCapacity。
不要输出推理链，只输出可解释摘要。
```

## TDD 必做

先写失败测试，再实现：

1. context pack 只暴露最多 8 个 candidate，不包含 hidden/global truth。
2. fallback planner 不超总精力、不超 slot 容量、不选 disabled、去重。
3. normalizer 拒绝未知 itemId、重复 itemId、超精力、超 slot、空 title。
4. dual runtime 在 LLM 合法时 source 为 `ai`，在 LLM 非法/不可用时 source 为 `fallback`。
5. HTTP handler 在缺模型时返回 fallback proposal，且 body 有 observation / shadowReport / evaluationReport。
6. 前端 client 接 handler 后仍然只把 proposal 交给 UI，采纳仍然走 `onAddToToday`。

## 验收

至少跑：

```bash
npx vitest run src/selling-houses/ui/features/__tests__/aiArrangement.test.ts
npx vitest run src/selling-houses/application/__tests__/aiArrangementAgentHarness.test.ts
npx vitest run src/selling-houses/interfaces/http/__tests__/aiArrangementHandlers.test.ts
npm run lint
```

最后打开 `/seller` 验证：

1. `AI 安排` 按钮在今日安排区域，不在微信历史消息里。
2. 点击后只展开一个小窗。
3. 推演文案没有 fallback / LLM / 规则置信度等系统噪音。
4. `取消` 不改变安排。
5. `采纳` 后下面“我排的动作”立即出现新增事项。
