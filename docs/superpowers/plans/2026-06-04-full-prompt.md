# 微信对话模块：决策表重构 + AI 教练 + 脚本工具

## 背景

项目是上海二手房经营模拟器，微信模块模拟经纪人与业主/客户/经理的对话。核心函数 `buildFallbackRecipientReply`（在 LLM 不可用时生成 NPC 回复）有 300 行嵌套 if/else，需要重构为决策表，并在此基础上构建 3 个 AI 工具。

**技术栈：** TypeScript, React 19, Vite 6, Vitest, @google/genai, Tailwind CSS 4
**工作目录：** `/Users/jiaqi/Documents/开放日测算`
**测试命令：** `npx vitest run <测试文件路径>`
**类型检查：** `npx tsc --noEmit`

---

## 重要：已有代码审查发现的问题

上一次重构遗漏了 3 个行为回归，本次必须修复：

### 回归 1：`empty_comfort` 风险丢失 `promisesNotYetFulfilled`

原始代码在 `empty_comfort` 分支中会检查 `scene.caseContext?.promisesNotYetFulfilled`，如果业主有未兑现的承诺，回复会前置 `你上次说的${promises[0]}还没兑现，`。

```typescript
// 原始代码
const promises = scene.caseContext?.promisesNotYetFulfilled || [];
const promiseRef = promises.length > 0 ? `你上次说的${promises[0]}还没兑现，` : '';
// promiseRef 插入到回复开头
```

**修复要求：** `ReplyContext` 中必须包含 `promiseRef` 字段，`empty_comfort` 的 3 条规则的 `buildReply` 必须使用 `ctx.promiseRef`。

### 回归 2：`reassure` 意图丢失 `serviceStrategy`

原始代码在 `reassure` 分支中会检查 `scene.caseContext?.serviceStrategy`，如果有服务策略，回复中会插入 `按${strategy.communicationStyle}`。

```typescript
// 原始代码
const strategy = scene.caseContext?.serviceStrategy;
const strategyRef = strategy ? `按${strategy.communicationStyle}` : '';
// strategyRef 插入到 "你得拿出具体动作" 之前
```

**修复要求：** `ReplyContext` 中必须包含 `strategyRef` 字段，`reassure` 的 3 条规则的 `buildReply` 必须使用 `ctx.strategyRef`。

### 回归 3：`ignores_customer` 风险的 `questionSnippet`

原始代码使用 `sourceContent.slice(0, 20)…` 截取业主问题片段。当前决策表使用 `ctx.sourceSnippet`，逻辑等价但需要确认 `sourceSnippet` 的截取逻辑与原始一致（20 字符 + `…`）。

**修复要求：** 确认 `buildReplyContext` 中 `sourceSnippet` 的计算方式与原始代码一致。

---

## 4 个任务总览

| # | 任务 | 依赖 | 风险 |
|---|------|------|------|
| 1 | 决策表重构（含 3 个回归修复） | 无 | 低（纯重构 + 行为恢复） |
| 2 | 复盘教练 | Task 1 | 零（只读数据） |
| 3 | AI Fallback 扩展脚本 | Task 1 | 零（独立脚本） |
| 4 | AI 测试场景生成脚本 | Task 1 | 零（独立脚本） |

---

## Task 1: 决策表重构

**目标：** 把 `wechatConversation.ts` 中的 `buildFallbackRecipientReply`（约 line 1071-1384）和 `buildHostileRecipientReply`（约 line 936-947）从嵌套 if/else 重构为 `ReplyRule[]` 决策表。

**TDD 要求：** 先写测试，再实现。测试必须覆盖所有分支。

### 1.1 定义类型

在 `buildFallbackRecipientReply` 之前插入：

```typescript
interface ReplyContext {
  readonly senderName: string;
  readonly caseRef: string;
  readonly locRef: string;
  readonly community: string;
  readonly district: string;
  readonly askPrice: number;
  readonly marketPrice: number;
  readonly priceGapPct: number;
  readonly trust: number;
  readonly patience: number;
  readonly urgency: number;
  readonly customerName: string;
  readonly customerIntent: number;
  readonly sourceSnippet: string;
  readonly priceRef: string;
  readonly actionRef: string;
  readonly timeRef: string;
  readonly promiseRef: string;    // 回归修复 1
  readonly strategyRef: string;   // 回归修复 2
}

interface ReplyRule {
  readonly priority: number;
  readonly sceneType?: ConversationSceneType;
  readonly intents?: readonly ConversationIntentKind[];
  readonly risks?: readonly ConversationRiskKind[];
  readonly ownerProfile?: 'assertive' | 'anxious' | 'default';
  readonly flags?: readonly ('lowTrust' | 'highUrgency' | 'lowPatience' | 'highPriceGap' | 'noFirstVisit' | 'isCustomer')[];
  readonly playerDetail?: 'hasPriceRef' | 'noPriceRef' | 'actionData' | 'actionFeedback' | 'actionVisit' | 'actionCustomer' | 'hasTimeRef' | 'noTimeRef' | 'any';
  readonly customerIntentHigh?: boolean;
  readonly hasCustomerName?: boolean;
  readonly buildReply: (ctx: ReplyContext) => string;
}
```

### 1.2 辅助函数

```typescript
function buildReplyContext(scene: ConversationSceneInputPack): ReplyContext {
  const senderName = scene.sourceMessage.senderName;
  const sourceContent = scene.sourceMessage.content;
  const caseTitle = scene.caseContext?.title || '';
  const community = scene.caseContext?.community || '';
  const district = scene.caseContext?.district || '';
  const details = extractPlayerTextDetails(scene.playerText);
  const promises = scene.caseContext?.promisesNotYetFulfilled || [];
  const promiseRef = promises.length > 0 ? `你上次说的${promises[0]}还没兑现，` : '';
  const strategy = scene.caseContext?.serviceStrategy;
  const strategyRef = strategy ? `按${strategy.communicationStyle}` : '';

  return {
    senderName,
    caseRef: caseTitle ? `${caseTitle}这套` : '这套房',
    locRef: community || district,
    community,
    district,
    askPrice: scene.caseContext?.askPrice ?? 0,
    marketPrice: scene.caseContext?.marketPrice ?? 0,
    priceGapPct: scene.caseContext?.priceGapPct ?? 0,
    trust: scene.caseContext?.trust ?? 50,
    patience: scene.caseContext?.patience ?? 50,
    urgency: scene.caseContext?.urgency ?? 50,
    customerName: scene.opportunityContext?.customerName || '',
    customerIntent: scene.opportunityContext?.intent ?? 50,
    sourceSnippet: sourceContent.length > 20 ? `${sourceContent.slice(0, 20)}…` : sourceContent,
    priceRef: details.priceRef,
    actionRef: details.actionRef,
    timeRef: details.timeRef,
    promiseRef,
    strategyRef,
  };
}

function resolveOwnerProfile(scene: ConversationSceneInputPack): 'assertive' | 'anxious' | 'default' {
  const label = scene.caseContext?.ownerProfileLabel || '';
  const urgency = scene.caseContext?.urgency ?? 50;
  if (/强势|硬控|控盘|博弈|自信/.test(label)) return 'assertive';
  if (/焦虑|急/.test(label) || urgency >= 70) return 'anxious';
  return 'default';
}

function resolveFlags(scene: ConversationSceneInputPack): Set<string> {
  const flags = new Set<string>();
  const trust = scene.caseContext?.trust ?? 50;
  const urgency = scene.caseContext?.urgency ?? 50;
  const patience = scene.caseContext?.patience ?? 50;
  const priceGapPct = scene.caseContext?.priceGapPct ?? 0;
  if (trust < 40) flags.add('lowTrust');
  if (urgency >= 70) flags.add('highUrgency');
  if (patience < 30) flags.add('lowPatience');
  if (priceGapPct > 15) flags.add('highPriceGap');
  if (!(scene.caseContext?.hasCompletedFirstVisit ?? false)) flags.add('noFirstVisit');
  if (scene.sceneType === 'customer_wechat') flags.add('isCustomer');
  return flags;
}

function matchRule(rule: ReplyRule, scene: ConversationSceneInputPack, intents: readonly ConversationIntentKind[], risks: readonly ConversationRiskKind[], ctx: ReplyContext): boolean {
  if (rule.sceneType && rule.sceneType !== scene.sceneType) return false;
  if (rule.intents && !rule.intents.some(i => intents.includes(i))) return false;
  if (rule.risks && !rule.risks.some(r => risks.includes(r))) return false;
  if (rule.ownerProfile && rule.ownerProfile !== resolveOwnerProfile(scene)) return false;
  if (rule.flags) {
    const flags = resolveFlags(scene);
    if (!rule.flags.every(f => flags.has(f))) return false;
  }
  if (rule.playerDetail && rule.playerDetail !== 'any') {
    if (rule.playerDetail === 'hasPriceRef' && !ctx.priceRef) return false;
    if (rule.playerDetail === 'noPriceRef' && ctx.priceRef) return false;
    if (rule.playerDetail === 'hasTimeRef' && !ctx.timeRef) return false;
    if (rule.playerDetail === 'noTimeRef' && ctx.timeRef) return false;
    if (rule.playerDetail === 'actionData' && ctx.actionRef !== '数据') return false;
    if (rule.playerDetail === 'actionFeedback' && ctx.actionRef !== '反馈') return false;
    if (rule.playerDetail === 'actionVisit' && ctx.actionRef !== '面访') return false;
    if (rule.playerDetail === 'actionCustomer' && ctx.actionRef !== '客户') return false;
  }
  if (rule.customerIntentHigh !== undefined && rule.customerIntentHigh !== (ctx.customerIntent >= 70)) return false;
  if (rule.hasCustomerName !== undefined && rule.hasCustomerName !== !!ctx.customerName) return false;
  return true;
}
```

### 1.3 决策表

**读取当前 `wechatConversation.ts` 中的原始函数代码，确保每条规则的回复文本与原始完全一致。**

`OWNER_REPLY_TABLE`（priority: 100=hostile, 20=intent, 10=risk, 5=reassure）：

**Priority 100 — hostile/offensive（8 条）：**
- `risks=['offensive_reply'], sceneType='customer_wechat'` → `"你这个态度，我就先不跟你聊这套了。"`
- `risks=['offensive_reply'], sceneType='manager_wechat'` → `"这个态度不行，先把客户和业主稳住。"`
- `risks=['offensive_reply'], sceneType='owner_wechat'` → `"你要是这个态度，那我没法继续信你了。"`
- `risks=['offensive_reply']`（default）→ `"这个态度没法继续配合，先冷静一下。"`
- `intents=['hostile']` × 4 个 sceneType，同上

**Priority 20 — secure_price_adjustment（9 条）：**
- assertive + hasPriceRef → `"${senderName}：${priceRef}这个价格你有依据吗？${caseRef}挂价${askPrice}万，市场才${marketPrice}万，你得告诉我凭什么调。"`
- assertive + highPriceGap → `"${senderName}：调价可以，但${caseRef}挂价${askPrice}万，市场才${marketPrice}万，差了${priceGapPct.toFixed(0)}%。你得告诉我客户到底出到多少，凭什么调。"`
- assertive（default）→ `"${senderName}：调价可以，但你得先告诉我客户到底出到多少，凭什么调，我听依据，不听空判断。"`
- anxious + hasPriceRef → `"${senderName}：你说调到${priceRef}，我现在最怕调了也没用。${caseRef}挂了这么久没成交，你告诉我调多少能成交。"`
- anxious（default）→ `"${senderName}：你说调价，我现在最怕调了也没用。${caseRef}挂了这么久没成交，你告诉我调多少能成交，别让我白折腾。"`
- highPriceGap + hasPriceRef → `"${senderName}：你说${priceRef}，但${caseRef}挂价${askPrice}万比市场高${priceGapPct.toFixed(0)}%，你先告诉我客户真实出价。"`
- highPriceGap（default）→ `"${senderName}：你说调价，但${caseRef}挂价${askPrice}万比市场高${priceGapPct.toFixed(0)}%，你先告诉我客户真实出价，我再判断怎么调。"`
- hasPriceRef（default）→ `"${senderName}：${priceRef}可以，但${caseRef}的情况你得先给我分析清楚，市场价和客户反馈我都需要。"`
- （default）→ `"${senderName}：调价可以，但${caseRef}的情况你得先给我分析清楚，市场价和客户反馈我都需要。"`

**Priority 20 — propose_face_visit（7 条）：**
- assertive + hasTimeRef → `"${senderName}：${timeRef}可以，但你得带${caseRef}的竞品数据和客户反馈来，别只来聊聊。"`
- assertive（default）→ `"${senderName}：行，那你带${caseRef}的竞品数据和客户反馈来，别只来聊聊。"`
- anxious + hasTimeRef → `"${senderName}：${timeRef}就定时间，${caseRef}的事我不能再等了。"`
- anxious（default）→ `"${senderName}：行，那你今天就定时间，${caseRef}的事我不能再等了。"`
- lowPatience → `"${senderName}：可以见面，但你得带方案来，${caseRef}的情况你得说清楚。"`
- hasTimeRef（default）→ `"${senderName}：好，${timeRef}我们当面把${caseRef}的情况理清楚。"`
- （default）→ `"${senderName}：好，那你定个时间，我们当面把${caseRef}的情况理清楚。"`

**Priority 20 — discuss_price（6 条）：**
- assertive + hasPriceRef → `"${senderName}：${priceRef}你有依据吗？${locRef ? \`${locRef}同小区\` : '同小区'}成交数据和客户出价摆出来。"`
- assertive（default）→ `"${senderName}：价格的事你得给我依据，${locRef ? \`${locRef}同小区\` : '同小区'}成交数据和客户出价摆出来，我再判断。"`
- highPriceGap + hasPriceRef → `"${senderName}：${priceRef}可以谈，但${caseRef}挂价${askPrice}万确实偏高，市场价大概${marketPrice}万。"`
- highPriceGap（default）→ `"${senderName}：价格可以谈，但${caseRef}挂价${askPrice}万确实偏高，市场价大概${marketPrice}万，你得告诉我客户的真实出价。"`
- hasPriceRef（default）→ `"${senderName}：${priceRef}可以谈，但你得先告诉我客户的真实出价和${locRef ? \`${locRef}的\` : ''}市场对比。"`
- （default）→ `"${senderName}：价格可以谈，但你得先告诉我客户的真实出价和${locRef ? \`${locRef}的\` : ''}市场对比。"`

**Priority 20 — present_market_evidence（14 条）：**
- noFirstVisit + actionData → `"${senderName}：数据我看了，但${caseRef}你还没面访过，我不确定这些数据是不是针对这套的。你先来一趟。"`
- noFirstVisit（default）→ `"${senderName}：你还没来面访过，${caseRef}的情况我不确定，你先来一趟。"`
- lowTrust + actionData → `"${senderName}：数据是有了，但你之前说的和实际有出入，${caseRef}的情况我需要更多依据才能信你。"`
- lowTrust（default）→ `"${senderName}：你说的我听到了，但${caseRef}之前有出入，我需要看到具体数据才信你。"`
- assertive + hasPriceRef → `"${senderName}：${priceRef}这个数据可以，但${caseRef}的竞品和客户反馈你得整理一下，我们当面过一遍。"`
- assertive + actionData → `"${senderName}：竞品数据我看了，${caseRef}的差异你得摆明白，我们当面过一遍。"`
- assertive + actionCustomer → `"${senderName}：客户反馈我看了，${caseRef}的竞品数据你也得整理一下，我们当面过一遍。"`
- assertive + actionVisit → `"${senderName}：面访完把${caseRef}的竞品数据和客户反馈整理一下，我看依据再做判断。"`
- assertive（default）→ `"${senderName}：好，你把${caseRef}的竞品数据和客户反馈整理一下，我们当面过一遍，我看依据再做判断。"`
- isCustomer + actionData → `"${senderName}：竞品对比我看了，${caseRef}的优缺点你再发我一下。"`
- isCustomer（default）→ `"${senderName}：好，你把${caseRef}的优缺点和竞品对比发我，我看完再决定。"`
- hasPriceRef（default）→ `"${senderName}：${priceRef}这个数据我看到了，${caseRef}的竞品和客户反馈你整理一下，我们当面过一遍。"`
- actionData（default）→ `"${senderName}：竞品数据我看了，${caseRef}的情况你再补充一下客户反馈，我们当面过一遍。"`
- （default）→ `"${senderName}：好，你把${caseRef}的竞品和客户反馈整理一下，我们当面过一遍。"`

**Priority 20 — follow_customer（6 条）：**
- customerIntentHigh + hasCustomerName + hasTimeRef → `"${senderName}：${timeRef}确认，${customerName}这边意向不错，${caseRef}的机会别错过。"`
- customerIntentHigh + hasCustomerName（default）→ `"${senderName}：那你尽快确认，${customerName}这边意向不错，${caseRef}的机会别错过。"`
- hasCustomerName + hasTimeRef → `"${senderName}：${timeRef}确认，${customerName}这边时间不确定，${caseRef}的窗口别错过。"`
- hasCustomerName（default）→ `"${senderName}：那你尽快确认，${customerName}这边时间不确定，${caseRef}的窗口别错过。"`
- hasTimeRef（default）→ `"${senderName}：${timeRef}确认，客户这边时间不确定，${caseRef}的窗口别错过。"`
- （default）→ `"${senderName}：那你尽快确认，客户这边时间不确定，${caseRef}的窗口别错过。"`

**Priority 20 — promise_feedback（4 条）：**
- lowTrust + actionFeedback → `"${senderName}：你说会反馈${caseRef}的情况，但我需要看到具体动作，不只是口头。"`
- lowTrust（default）→ `"${senderName}：你说会反馈，但${caseRef}的情况我需要看到具体动作，不只是口头。"`
- hasTimeRef → `"${senderName}：好，${timeRef}把${caseRef}的结果发我。"`
- （default）→ `"${senderName}：好，那你今天就把${caseRef}的结果发我，我等你。"`

**Priority 20 — align_manager（3 条）：**
- actionFeedback → `"${senderName}：收到，${caseRef}的情况和风险点你整理一下同步我，今天别散。"`
- actionData → 同上
- （default）→ `"${senderName}：收到，你把${caseRef}的情况和风险点同步我，今天别散。"`

**Priority 10 — risk-based（7 条）：**
- overpromise → `"${senderName}：你这么说太绝对了，${caseRef}的情况不确定，你得给我一个更稳妥的方案。"`
- empty_comfort + highUrgency → `"${senderName}：${promiseRef}你这么说太笼统了，${caseRef}现在需要具体方案，不是安慰。"`（**注意：必须用 `ctx.promiseRef`**）
- empty_comfort + assertive → `"${senderName}：${promiseRef}这话太泛了。${caseRef}你得告诉我具体怎么做，别只让我再等等。"`（**注意：必须用 `ctx.promiseRef`**）
- empty_comfort（default）→ `"${senderName}：${promiseRef}我听到了，但${caseRef}的情况不够具体，你得告诉我下一步怎么做。"`（**注意：必须用 `ctx.promiseRef`**）
- ignores_customer → `"${senderName}：你没回答我的问题，我问的是${sourceSnippet}，你得正面回应。"`
- missing_next_step + assertive → `"${senderName}：方向可以，但${caseRef}下一步做什么你没说，我需要明确动作和时间点。"`
- missing_next_step（default）→ `"${senderName}：方向可以，但${caseRef}下一步做什么你没说，我需要明确动作。"`

**Priority 5 — reassure（3 条）：**
- lowTrust → `"${senderName}：我听到了，但${caseRef}的情况光说没用，${strategyRef}你得拿出具体动作让我看到变化。"`（**注意：必须用 `ctx.strategyRef`**）
- anxious → `"${senderName}：我能理解，但${caseRef}我现在最怕一直拖。${strategyRef}你今天要给我一个明确判断。"`（**注意：必须用 `ctx.strategyRef`**）
- （default）→ `"${senderName}：收到，${strategyRef}你把${caseRef}的关键情况确认清楚，再给我一个明确反馈。"`（**注意：必须用 `ctx.strategyRef`**）

**`MANAGER_REPLY_TABLE`（23 条）：** 读取原始 `buildManagerFallbackReply` 函数，逐条转换。manager 表不需要 `promiseRef` 和 `strategyRef`。

### 1.4 替换函数

```typescript
function buildFallbackRecipientReply(
  intents: readonly ConversationIntentKind[],
  risks: readonly ConversationRiskKind[],
  scene: ConversationSceneInputPack,
) {
  const ctx = buildReplyContext(scene);
  const isManager = scene.sceneType === 'manager_wechat';
  const table = isManager ? MANAGER_REPLY_TABLE : OWNER_REPLY_TABLE;
  const sorted = [...table].sort((a, b) => b.priority - a.priority);
  for (const rule of sorted) {
    if (matchRule(rule, scene, intents, risks, ctx)) {
      return rule.buildReply(ctx);
    }
  }
  const variants = buildWechatLocalReplyVariants(scene);
  return variants.neutral;
}
```

删除 `buildHostileRecipientReply` 和 `buildManagerFallbackReply`。

### 1.5 测试（先写后实现）

创建 `src/selling-houses/application/__tests__/fallbackReplyTable.test.ts`，覆盖：

| 场景 | 验证点 |
|------|--------|
| hostile input | recipientReply 包含"态度"，intentKinds 包含 'hostile' |
| offensive_reply + customer_wechat | 回复包含"不跟你聊" |
| offensive_reply + manager_wechat | 回复包含"先把客户和业主稳住" |
| secure_price_adjustment + assertive + hasPriceRef | 回复包含 priceRef 和 "有依据吗" |
| secure_price_adjustment + anxious | 回复包含"最怕调了也没用" |
| propose_face_visit + assertive + hasTimeRef | 回复包含 timeRef 和 "竞品数据" |
| propose_face_visit + anxious | 回复包含"不能再等了" |
| discuss_price + highPriceGap | 回复包含 askPrice 和 "偏高" |
| present_market_evidence + noFirstVisit | 回复包含"还没面访过" |
| present_market_evidence + lowTrust | 回复包含"有出入" |
| present_market_evidence + isCustomer | 回复包含"优缺点" |
| follow_customer + highCustomerIntent + customerName | 回复包含 customerName 和 "意向不错" |
| follow_customer + noCustomerName | 回复包含"客户这边" |
| promise_feedback + lowTrust | 回复包含"具体动作" |
| **empty_comfort + highUrgency + 有承诺** | **回复包含 promiseRef（"你上次说的...还没兑现"）** |
| **empty_comfort + 无承诺** | **回复不包含"还没兑现"** |
| **reassure + lowTrust + 有策略** | **回复包含 strategyRef（"按..."）** |
| **reassure + 无策略** | **回复不包含"按"** |
| ignores_customer | 回复包含 sourceSnippet |
| missing_next_step + assertive | 回复包含"时间点" |
| manager + secure_price_adjustment | 回复包含"先别急" |
| manager + present_market_evidence + noFirstVisit | 回复包含"先把业主关系打牢" |
| 无匹配规则 | 回退到 buildWechatLocalReplyVariants(scene).neutral |

**注意：** 测试中需要 mock `scene.caseContext?.promisesNotYetFulfilled` 和 `scene.caseContext?.serviceStrategy` 来验证回归修复。

### 1.6 验证

```bash
npx vitest run src/selling-houses/application/__tests__/fallbackReplyTable.test.ts
npx vitest run src/selling-houses/application/__tests__/wechatConversation.test.ts
npx tsc --noEmit
```

---

## Task 2: 复盘教练

**目标：** 基于 `ConversationReceipt.traceSnapshot` 中已有的 evaluation 数据，生成自然语言复盘反馈。

**TDD 要求：** 先写测试，再实现。

### 2.1 创建 `src/selling-houses/application/conversationCoach.ts`

```typescript
import type { ConversationReceipt } from '../../core/world-state/conversation/models.js';

export interface CoachFeedback {
  readonly overall: string;
  readonly insights: readonly string[];
  readonly nextStepAdvice: string | null;
}

export function buildCoachFeedback(receipt: ConversationReceipt): CoachFeedback | null {
  const snapshot = receipt.traceSnapshot;
  if (!snapshot?.evaluationVerdict) return null;

  const parts: string[] = [];
  const insights: string[] = [];

  // Overall verdict
  if (snapshot.evaluationVerdict === 'strong') {
    parts.push('这次回复质量不错。');
  } else if (snapshot.evaluationVerdict === 'acceptable') {
    parts.push('这次回复基本到位，但有提升空间。');
  } else {
    parts.push('这次回复需要改进。');
  }

  // Risk analysis
  const intents = receipt.proposal.intentKinds;
  const risks = receipt.proposal.riskKinds;

  if (risks.includes('overpromise')) {
    parts.push('回复过于绝对。');
    insights.push('建议用"如果...可能..."替代"保证"，避免业主期望过高。');
  }
  if (risks.includes('empty_comfort')) {
    parts.push('回复过于笼统。');
    insights.push('业主需要具体方案，不是安慰。下次尝试给出一个可执行的动作。');
  }
  if (risks.includes('ignores_customer')) {
    parts.push('没有回应业主的核心问题。');
    insights.push('业主问了具体问题却被跳过了。先正面回答问题，再补充其他信息。');
  }
  if (risks.includes('missing_next_step')) {
    parts.push('缺少明确的下一步。');
    insights.push('业主不知道接下来该做什么。下次回复时明确说出"下一步是XX"。');
  }
  if (risks.includes('price_pressure_too_fast')) {
    parts.push('调价压力过大。');
    insights.push('业主还没准备好就被催调价。先建立信任和数据支撑，再谈价格。');
  }

  // Intent effectiveness
  if (intents.includes('reassure') && (receipt.settlement.trustDelta ?? 0) <= 0) {
    insights.push('安抚意图未提升信任——业主可能需要看到具体行动而非口头承诺。');
  }
  if (intents.includes('discuss_price') && (receipt.settlement.priceFlexibilityDelta ?? 0) <= 0) {
    insights.push('讨论价格但未提升价格弹性——需要用市场数据支撑论点。');
  }

  // Evaluation signals
  if (snapshot.evaluationSignals) {
    for (const signal of snapshot.evaluationSignals) {
      if (signal.includes('core_question_missed')) {
        insights.push('回复没有抓住业主的核心关切，需要更精准地回应问题。');
      }
      if (signal.includes('no_next_step')) {
        insights.push('缺少可执行的下一步动作。');
      }
    }
  }

  // Next step advice
  const nextStep = receipt.proposal.nextStep;
  let nextStepAdvice: string | null = null;
  if (nextStep && nextStep.kind !== 'none') {
    const kindLabels: Record<string, string> = {
      schedule_face_visit: '安排面访',
      review_price: '复盘价格策略',
      prepare_competition_comparison: '准备竞品对比',
      follow_customer: '跟进客户',
      confirm_price_adjustment: '确认调价',
      open_case: '开展新案件',
    };
    const label = kindLabels[nextStep.kind] ?? nextStep.kind;
    nextStepAdvice = `建议下一步：${label}——${nextStep.reason}`;
  }

  return { overall: parts.join(''), insights, nextStepAdvice };
}
```

### 2.2 创建 `src/selling-houses/application/__tests__/conversationCoach.test.ts`

测试覆盖：
- 无 traceSnapshot → 返回 null
- 无 evaluationVerdict → 返回 null
- verdict=acceptable → overall 包含"基本到位"
- empty_comfort 风险 → insights 包含"具体方案"
- ignores_customer 风险 → overall 包含"核心问题"
- reassure + trustDelta<=0 → insights 包含"安抚"和"信任"
- 有 nextStep → nextStepAdvice 包含"面访"
- 无 nextStep → nextStepAdvice 为 null

### 2.3 创建 `src/selling-houses/ui/features/ConversationCoachCard.tsx`

React 组件，显示：
- 标题 "回复复盘" + 灯泡图标
- overall 文本
- nextStepAdvice（蓝色背景）
- 可展开的 insights 列表（琥珀色背景）
- 使用 lucide-react 图标

### 2.4 集成到 `MyWechatPanel.tsx`

在对话回合的 NPC 回复下方，条件渲染 `ConversationCoachCard`：

```tsx
{(() => {
  const feedback = buildCoachFeedback(receipt);
  return feedback ? <ConversationCoachCard feedback={feedback} /> : null;
})()}
```

### 2.5 验证

```bash
npx vitest run src/selling-houses/application/__tests__/conversationCoach.test.ts
npx tsc --noEmit
```

---

## Task 3: AI Fallback 扩展脚本

**目标：** 创建 `scripts/generate-fallback-rules.ts`，从历史 `ConversationReceipt` 中用 LLM 生成新的 fallback 规则条目。

### 要求

1. 读取 receipts JSON 文件
2. 提取 `(ownerProfile, intent, risk)` 组合
3. 对比已有决策表，找出未覆盖的组合
4. 用 `@google/genai` 的 Gemini 模型为每个未覆盖组合生成回复模板
5. 输出为可审核的 JSON 文件
6. 脚本只生成，不自动合入决策表

### 用法

```bash
npx tsx scripts/generate-fallback-rules.ts --input receipts.json --output new-rules.json
```

### 关键实现

- 使用 `GOOGLE_AI_API_KEY` 环境变量
- 限制每次最多生成 20 条规则
- 输出格式：`{ ownerProfile, intent, risk, flags, replyTemplate, reasoning, confidence }`
- prompt 中要包含同类型业主的历史回复作为参考

---

## Task 4: AI 测试场景生成脚本

**目标：** 创建 `scripts/generate-conversation-tests.ts`，从决策表规则骨架批量生成测试用例。

### 要求

1. 定义规则骨架数组（每条规则的 ownerProfile, intent, risk, flags）
2. 用 LLM 为每个骨架生成一个测试场景（玩家回复文本 + 预期结果）
3. 输出为 JSON 格式，可导入为 vitest 测试用例

### 用法

```bash
npx tsx scripts/generate-conversation-tests.ts --output generated-tests.json
```

### 关键实现

- 使用 `GOOGLE_AI_API_KEY` 环境变量
- 输出格式：`{ name, scene: { sceneType, playerText, ownerProfileLabel, trust, patience, urgency, ... }, expected: { intents, risks, recipientReplyContains, trustDeltaSign } }`
- 覆盖所有主要分支：hostile, price_adjustment, face_visit, discuss_price, market_evidence, follow_customer, feedback, manager, empty_comfort, ignores_customer, missing_next_step, reassure

---

## 全局验证

所有任务完成后运行：

```bash
npx tsc --noEmit
npx vitest run src/selling-houses/application/__tests__/fallbackReplyTable.test.ts
npx vitest run src/selling-houses/application/__tests__/conversationCoach.test.ts
npx vitest run src/selling-houses/application/__tests__/wechatConversation.test.ts
```

全部 PASS 即可。
