# Fallback 决策表重构 + AI 教练 + Fallback 扩展 + 测试生成

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `buildFallbackRecipientReply` 的 300 行嵌套 if/else 重构为决策表，并基于此构建 AI 复盘教练、Fallback 自动扩展脚本和测试生成脚本。

**Architecture:** 四个任务顺序执行，每个任务产出独立可验证。Task 1 是纯重构（行为不变），Task 2-4 依赖 Task 1 的决策表结构。

**Tech Stack:** TypeScript, Vitest, Vite, React 19, @google/genai

---

## 文件清单

| 操作 | 文件路径 | 职责 |
|------|----------|------|
| 修改 | `src/selling-houses/application/wechatConversation.ts` | 决策表替代 if/else |
| 新建 | `src/selling-houses/application/conversationCoach.ts` | 复盘教练反馈生成 |
| 新建 | `src/selling-houses/ui/features/ConversationCoachCard.tsx` | 教练 UI 卡片 |
| 修改 | `src/selling-houses/ui/features/MyWechatPanel.tsx` | 集成教练卡片 |
| 新建 | `scripts/generate-fallback-rules.ts` | AI Fallback 扩展脚本 |
| 新建 | `scripts/generate-conversation-tests.ts` | AI 测试场景生成 |
| 新建 | `src/selling-houses/application/__tests__/fallbackReplyTable.test.ts` | 决策表回归测试 |
| 新建 | `src/selling-houses/application/__tests__/conversationCoach.test.ts` | 教练功能测试 |

---

## Task 1: 决策表重构

**Files:**
- Modify: `src/selling-houses/application/wechatConversation.ts:1071-1384`
- Create: `src/selling-houses/application/__tests__/fallbackReplyTable.test.ts`

**核心思路：** 把 14 个顶层分支 + 子条件拍平为 `ReplyRule[]` 表，用模板字符串处理变量插值。

### Step 1: 定义 ReplyRule 类型和决策表

在 `wechatConversation.ts` 中，在 `buildFallbackRecipientReply` 函数之前插入：

```typescript
// ===== Decision Table =====

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
}

function buildReplyContext(scene: ConversationSceneInputPack): ReplyContext {
  const senderName = scene.sourceMessage.senderName;
  const sourceContent = scene.sourceMessage.content;
  const caseTitle = scene.caseContext?.title || '';
  const community = scene.caseContext?.community || '';
  const district = scene.caseContext?.district || '';
  const details = extractPlayerTextDetails(scene.playerText);
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
  if (rule.customerIntentHigh !== undefined) {
    if (rule.customerIntentHigh !== (ctx.customerIntent >= 70)) return false;
  }
  if (rule.hasCustomerName !== undefined) {
    if (rule.hasCustomerName !== !!ctx.customerName) return false;
  }
  return true;
}
```

### Step 2: 定义 OWNER_REPLY_TABLE

```typescript
const OWNER_REPLY_TABLE: readonly ReplyRule[] = [
  // === BRANCH 0: hostile/offensive ===
  { priority: 100, risks: ['offensive_reply'], sceneType: 'customer_wechat', buildReply: (ctx) => `你这个态度，我就先不跟你聊这套了。` },
  { priority: 100, risks: ['offensive_reply'], sceneType: 'manager_wechat', buildReply: (ctx) => `这个态度不行，先把客户和业主稳住。` },
  { priority: 100, risks: ['offensive_reply'], sceneType: 'owner_wechat', buildReply: (ctx) => `你要是这个态度，那我没法继续信你了。` },
  { priority: 100, risks: ['offensive_reply'], buildReply: (ctx) => `这个态度没法继续配合，先冷静一下。` },
  { priority: 100, intents: ['hostile'], sceneType: 'customer_wechat', buildReply: (ctx) => `你这个态度，我就先不跟你聊这套了。` },
  { priority: 100, intents: ['hostile'], sceneType: 'manager_wechat', buildReply: (ctx) => `这个态度不行，先把客户和业主稳住。` },
  { priority: 100, intents: ['hostile'], sceneType: 'owner_wechat', buildReply: (ctx) => `你要是这个态度，那我没法继续信你了。` },
  { priority: 100, intents: ['hostile'], buildReply: (ctx) => `这个态度没法继续配合，先冷静一下。` },

  // === BRANCH 2: secure_price_adjustment ===
  { priority: 20, intents: ['secure_price_adjustment'], ownerProfile: 'assertive', playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.priceRef}这个价格你有依据吗？${ctx.caseRef}挂价${ctx.askPrice}万，市场才${ctx.marketPrice}万，你得告诉我凭什么调。` },
  { priority: 20, intents: ['secure_price_adjustment'], ownerProfile: 'assertive', flags: ['highPriceGap'], buildReply: (ctx) => `${ctx.senderName}：调价可以，但${ctx.caseRef}挂价${ctx.askPrice}万，市场才${ctx.marketPrice}万，差了${ctx.priceGapPct.toFixed(0)}%。你得告诉我客户到底出到多少，凭什么调。` },
  { priority: 20, intents: ['secure_price_adjustment'], ownerProfile: 'assertive', buildReply: (ctx) => `${ctx.senderName}：调价可以，但你得先告诉我客户到底出到多少，凭什么调，我听依据，不听空判断。` },
  { priority: 20, intents: ['secure_price_adjustment'], ownerProfile: 'anxious', playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：你说调到${ctx.priceRef}，我现在最怕调了也没用。${ctx.caseRef}挂了这么久没成交，你告诉我调多少能成交。` },
  { priority: 20, intents: ['secure_price_adjustment'], ownerProfile: 'anxious', buildReply: (ctx) => `${ctx.senderName}：你说调价，我现在最怕调了也没用。${ctx.caseRef}挂了这么久没成交，你告诉我调多少能成交，别让我白折腾。` },
  { priority: 20, intents: ['secure_price_adjustment'], flags: ['highPriceGap'], playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：你说${ctx.priceRef}，但${ctx.caseRef}挂价${ctx.askPrice}万比市场高${ctx.priceGapPct.toFixed(0)}%，你先告诉我客户真实出价。` },
  { priority: 20, intents: ['secure_price_adjustment'], flags: ['highPriceGap'], buildReply: (ctx) => `${ctx.senderName}：你说调价，但${ctx.caseRef}挂价${ctx.askPrice}万比市场高${ctx.priceGapPct.toFixed(0)}%，你先告诉我客户真实出价，我再判断怎么调。` },
  { priority: 20, intents: ['secure_price_adjustment'], playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.priceRef}可以，但${ctx.caseRef}的情况你得先给我分析清楚，市场价和客户反馈我都需要。` },
  { priority: 20, intents: ['secure_price_adjustment'], buildReply: (ctx) => `${ctx.senderName}：调价可以，但${ctx.caseRef}的情况你得先给我分析清楚，市场价和客户反馈我都需要。` },

  // === BRANCH 3: propose_face_visit ===
  { priority: 20, intents: ['propose_face_visit'], ownerProfile: 'assertive', playerDetail: 'hasTimeRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.timeRef}可以，但你得带${ctx.caseRef}的竞品数据和客户反馈来，别只来聊聊。` },
  { priority: 20, intents: ['propose_face_visit'], ownerProfile: 'assertive', buildReply: (ctx) => `${ctx.senderName}：行，那你带${ctx.caseRef}的竞品数据和客户反馈来，别只来聊聊。` },
  { priority: 20, intents: ['propose_face_visit'], ownerProfile: 'anxious', playerDetail: 'hasTimeRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.timeRef}就定时间，${ctx.caseRef}的事我不能再等了。` },
  { priority: 20, intents: ['propose_face_visit'], ownerProfile: 'anxious', buildReply: (ctx) => `${ctx.senderName}：行，那你今天就定时间，${ctx.caseRef}的事我不能再等了。` },
  { priority: 20, intents: ['propose_face_visit'], flags: ['lowPatience'], buildReply: (ctx) => `${ctx.senderName}：可以见面，但你得带方案来，${ctx.caseRef}的情况你得说清楚。` },
  { priority: 20, intents: ['propose_face_visit'], playerDetail: 'hasTimeRef', buildReply: (ctx) => `${ctx.senderName}：好，${ctx.timeRef}我们当面把${ctx.caseRef}的情况理清楚。` },
  { priority: 20, intents: ['propose_face_visit'], buildReply: (ctx) => `${ctx.senderName}：好，那你定个时间，我们当面把${ctx.caseRef}的情况理清楚。` },

  // === BRANCH 4: discuss_price ===
  { priority: 20, intents: ['discuss_price'], ownerProfile: 'assertive', playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.priceRef}你有依据吗？${ctx.locRef ? `${ctx.locRef}同小区` : '同小区'}成交数据和客户出价摆出来。` },
  { priority: 20, intents: ['discuss_price'], ownerProfile: 'assertive', buildReply: (ctx) => `${ctx.senderName}：价格的事你得给我依据，${ctx.locRef ? `${ctx.locRef}同小区` : '同小区'}成交数据和客户出价摆出来，我再判断。` },
  { priority: 20, intents: ['discuss_price'], flags: ['highPriceGap'], playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.priceRef}可以谈，但${ctx.caseRef}挂价${ctx.askPrice}万确实偏高，市场价大概${ctx.marketPrice}万。` },
  { priority: 20, intents: ['discuss_price'], flags: ['highPriceGap'], buildReply: (ctx) => `${ctx.senderName}：价格可以谈，但${ctx.caseRef}挂价${ctx.askPrice}万确实偏高，市场价大概${ctx.marketPrice}万，你得告诉我客户的真实出价。` },
  { priority: 20, intents: ['discuss_price'], playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.priceRef}可以谈，但你得先告诉我客户的真实出价和${ctx.locRef ? `${ctx.locRef}的` : ''}市场对比。` },
  { priority: 20, intents: ['discuss_price'], buildReply: (ctx) => `${ctx.senderName}：价格可以谈，但你得先告诉我客户的真实出价和${ctx.locRef ? `${ctx.locRef}的` : ''}市场对比。` },

  // === BRANCH 5: present_market_evidence ===
  { priority: 20, intents: ['present_market_evidence'], flags: ['noFirstVisit'], playerDetail: 'actionData', buildReply: (ctx) => `${ctx.senderName}：数据我看了，但${ctx.caseRef}你还没面访过，我不确定这些数据是不是针对这套的。你先来一趟。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['noFirstVisit'], buildReply: (ctx) => `${ctx.senderName}：你还没来面访过，${ctx.caseRef}的情况我不确定，你先来一趟。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['lowTrust'], playerDetail: 'actionData', buildReply: (ctx) => `${ctx.senderName}：数据是有了，但你之前说的和实际有出入，${ctx.caseRef}的情况我需要更多依据才能信你。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['lowTrust'], buildReply: (ctx) => `${ctx.senderName}：你说的我听到了，但${ctx.caseRef}之前有出入，我需要看到具体数据才信你。` },
  { priority: 20, intents: ['present_market_evidence'], ownerProfile: 'assertive', playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.priceRef}这个数据可以，但${ctx.caseRef}的竞品和客户反馈你得整理一下，我们当面过一遍。` },
  { priority: 20, intents: ['present_market_evidence'], ownerProfile: 'assertive', playerDetail: 'actionData', buildReply: (ctx) => `${ctx.senderName}：竞品数据我看了，${ctx.caseRef}的差异你得摆明白，我们当面过一遍。` },
  { priority: 20, intents: ['present_market_evidence'], ownerProfile: 'assertive', playerDetail: 'actionCustomer', buildReply: (ctx) => `${ctx.senderName}：客户反馈我看了，${ctx.caseRef}的竞品数据你也得整理一下，我们当面过一遍。` },
  { priority: 20, intents: ['present_market_evidence'], ownerProfile: 'assertive', playerDetail: 'actionVisit', buildReply: (ctx) => `${ctx.senderName}：面访完把${ctx.caseRef}的竞品数据和客户反馈整理一下，我看依据再做判断。` },
  { priority: 20, intents: ['present_market_evidence'], ownerProfile: 'assertive', buildReply: (ctx) => `${ctx.senderName}：好，你把${ctx.caseRef}的竞品数据和客户反馈整理一下，我们当面过一遍，我看依据再做判断。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['isCustomer'], playerDetail: 'actionData', buildReply: (ctx) => `${ctx.senderName}：竞品对比我看了，${ctx.caseRef}的优缺点你再发我一下。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['isCustomer'], buildReply: (ctx) => `${ctx.senderName}：好，你把${ctx.caseRef}的优缺点和竞品对比发我，我看完再决定。` },
  { priority: 20, intents: ['present_market_evidence'], playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.priceRef}这个数据我看到了，${ctx.caseRef}的竞品和客户反馈你整理一下，我们当面过一遍。` },
  { priority: 20, intents: ['present_market_evidence'], playerDetail: 'actionData', buildReply: (ctx) => `${ctx.senderName}：竞品数据我看了，${ctx.caseRef}的情况你再补充一下客户反馈，我们当面过一遍。` },
  { priority: 20, intents: ['present_market_evidence'], buildReply: (ctx) => `${ctx.senderName}：好，你把${ctx.caseRef}的竞品和客户反馈整理一下，我们当面过一遍。` },

  // === BRANCH 6: follow_customer ===
  { priority: 20, intents: ['follow_customer'], customerIntentHigh: true, hasCustomerName: true, playerDetail: 'hasTimeRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.timeRef}确认，${ctx.customerName}这边意向不错，${ctx.caseRef}的机会别错过。` },
  { priority: 20, intents: ['follow_customer'], customerIntentHigh: true, hasCustomerName: true, buildReply: (ctx) => `${ctx.senderName}：那你尽快确认，${ctx.customerName}这边意向不错，${ctx.caseRef}的机会别错过。` },
  { priority: 20, intents: ['follow_customer'], hasCustomerName: true, playerDetail: 'hasTimeRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.timeRef}确认，${ctx.customerName}这边时间不确定，${ctx.caseRef}的窗口别错过。` },
  { priority: 20, intents: ['follow_customer'], hasCustomerName: true, buildReply: (ctx) => `${ctx.senderName}：那你尽快确认，${ctx.customerName}这边时间不确定，${ctx.caseRef}的窗口别错过。` },
  { priority: 20, intents: ['follow_customer'], playerDetail: 'hasTimeRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.timeRef}确认，客户这边时间不确定，${ctx.caseRef}的窗口别错过。` },
  { priority: 20, intents: ['follow_customer'], buildReply: (ctx) => `${ctx.senderName}：那你尽快确认，客户这边时间不确定，${ctx.caseRef}的窗口别错过。` },

  // === BRANCH 7: promise_feedback ===
  { priority: 20, intents: ['promise_feedback'], flags: ['lowTrust'], playerDetail: 'actionFeedback', buildReply: (ctx) => `${ctx.senderName}：你说会反馈${ctx.caseRef}的情况，但我需要看到具体动作，不只是口头。` },
  { priority: 20, intents: ['promise_feedback'], flags: ['lowTrust'], buildReply: (ctx) => `${ctx.senderName}：你说会反馈，但${ctx.caseRef}的情况我需要看到具体动作，不只是口头。` },
  { priority: 20, intents: ['promise_feedback'], playerDetail: 'hasTimeRef', buildReply: (ctx) => `${ctx.senderName}：好，${ctx.timeRef}把${ctx.caseRef}的结果发我。` },
  { priority: 20, intents: ['promise_feedback'], buildReply: (ctx) => `${ctx.senderName}：好，那你今天就把${ctx.caseRef}的结果发我，我等你。` },

  // === BRANCH 8: align_manager ===
  { priority: 20, intents: ['align_manager'], playerDetail: 'actionFeedback', buildReply: (ctx) => `${ctx.senderName}：收到，${ctx.caseRef}的情况和风险点你整理一下同步我，今天别散。` },
  { priority: 20, intents: ['align_manager'], playerDetail: 'actionData', buildReply: (ctx) => `${ctx.senderName}：收到，${ctx.caseRef}的情况和风险点你整理一下同步我，今天别散。` },
  { priority: 20, intents: ['align_manager'], buildReply: (ctx) => `${ctx.senderName}：收到，你把${ctx.caseRef}的情况和风险点同步我，今天别散。` },

  // === BRANCH 9: risk=overpromise ===
  { priority: 10, risks: ['overpromise'], buildReply: (ctx) => `${ctx.senderName}：你这么说太绝对了，${ctx.caseRef}的情况不确定，你得给我一个更稳妥的方案。` },

  // === BRANCH 10: risk=empty_comfort ===
  { priority: 10, risks: ['empty_comfort'], flags: ['highUrgency'], buildReply: (ctx) => `${ctx.senderName}：你这么说太笼统了，${ctx.caseRef}现在需要具体方案，不是安慰。` },
  { priority: 10, risks: ['empty_comfort'], ownerProfile: 'assertive', buildReply: (ctx) => `${ctx.senderName}：这话太泛了。${ctx.caseRef}你得告诉我具体怎么做，别只让我再等等。` },
  { priority: 10, risks: ['empty_comfort'], buildReply: (ctx) => `${ctx.senderName}：我听到了，但${ctx.caseRef}的情况不够具体，你得告诉我下一步怎么做。` },

  // === BRANCH 11: risk=ignores_customer ===
  { priority: 10, risks: ['ignores_customer'], buildReply: (ctx) => `${ctx.senderName}：你没回答我的问题，我问的是${ctx.sourceSnippet}，你得正面回应。` },

  // === BRANCH 12: risk=missing_next_step ===
  { priority: 10, risks: ['missing_next_step'], ownerProfile: 'assertive', buildReply: (ctx) => `${ctx.senderName}：方向可以，但${ctx.caseRef}下一步做什么你没说，我需要明确动作和时间点。` },
  { priority: 10, risks: ['missing_next_step'], buildReply: (ctx) => `${ctx.senderName}：方向可以，但${ctx.caseRef}下一步做什么你没说，我需要明确动作。` },

  // === BRANCH 13: intent=reassure ===
  { priority: 5, intents: ['reassure'], flags: ['lowTrust'], buildReply: (ctx) => `${ctx.senderName}：我听到了，但${ctx.caseRef}的情况光说没用，你得拿出具体动作让我看到变化。` },
  { priority: 5, intents: ['reassure'], ownerProfile: 'anxious', buildReply: (ctx) => `${ctx.senderName}：我能理解，但${ctx.caseRef}我现在最怕一直拖。你今天要给我一个明确判断。` },
  { priority: 5, intents: ['reassure'], buildReply: (ctx) => `${ctx.senderName}：收到，你把${ctx.caseRef}的关键情况确认清楚，再给我一个明确反馈。` },
];
```

### Step 3: 定义 MANAGER_REPLY_TABLE

```typescript
const MANAGER_REPLY_TABLE: readonly ReplyRule[] = [
  { priority: 20, intents: ['secure_price_adjustment'], buildReply: (ctx) => `${ctx.senderName}：调价的事你先别急，把${ctx.caseRef}的市场数据和客户反馈拿来，我帮你判断。` },
  { priority: 20, intents: ['propose_face_visit'], playerDetail: 'hasTimeRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.timeRef}面访完把${ctx.caseRef}的结果和风险点同步我。` },
  { priority: 20, intents: ['propose_face_visit'], playerDetail: 'actionData', buildReply: (ctx) => `${ctx.senderName}：好，面访时把${ctx.caseRef}的竞品数据和客户反馈带齐，结果同步我。` },
  { priority: 20, intents: ['propose_face_visit'], playerDetail: 'actionFeedback', buildReply: (ctx) => `${ctx.senderName}：好，面访时把${ctx.caseRef}的竞品数据和客户反馈带齐，结果同步我。` },
  { priority: 20, intents: ['propose_face_visit'], buildReply: (ctx) => `${ctx.senderName}：好，面访完把${ctx.caseRef}的结果和风险点同步我。` },
  { priority: 20, intents: ['discuss_price'], buildReply: (ctx) => `${ctx.senderName}：价格的事你得有依据，${ctx.caseRef}的竞品数据和客户出价你清楚吗？` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['noFirstVisit'], playerDetail: 'actionData', buildReply: (ctx) => `${ctx.senderName}：竞品数据先放一边，${ctx.caseRef}你还没面访过，先把业主关系打牢。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['noFirstVisit'], playerDetail: 'actionCustomer', buildReply: (ctx) => `${ctx.senderName}：客户反馈先放一边，${ctx.caseRef}你还没面访过，先把业主关系打牢。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['noFirstVisit'], playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.priceRef}的数据先放一边，${ctx.caseRef}你还没面访过，先把业主关系打牢。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['noFirstVisit'], playerDetail: 'actionVisit', buildReply: (ctx) => `${ctx.senderName}：面访是好事，但${ctx.caseRef}你得先把业主关系打牢，再谈数据。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['noFirstVisit'], buildReply: (ctx) => `${ctx.senderName}：数据先放一边，${ctx.caseRef}你还没面访过，先把业主关系打牢。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['lowTrust'], playerDetail: 'actionCustomer', buildReply: (ctx) => `${ctx.senderName}：客户反馈我看了，但${ctx.caseRef}的信任基础还不够，你得先稳住业主。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['lowTrust'], buildReply: (ctx) => `${ctx.senderName}：数据有了，但${ctx.caseRef}的信任基础还不够，你得先稳住业主。` },
  { priority: 20, intents: ['present_market_evidence'], playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.priceRef}的数据我看了，${ctx.caseRef}的竞品和客户情况你整理一下，我看看有没有风险。` },
  { priority: 20, intents: ['present_market_evidence'], playerDetail: 'actionData', buildReply: (ctx) => `${ctx.senderName}：竞品数据我看了，${ctx.caseRef}的客户情况你补充一下，我看看有没有风险。` },
  { priority: 20, intents: ['present_market_evidence'], buildReply: (ctx) => `${ctx.senderName}：好，${ctx.caseRef}的竞品和客户情况你整理一下，我看看有没有风险。` },
  { priority: 20, intents: ['follow_customer'], buildReply: (ctx) => `${ctx.senderName}：客户跟进别停，${ctx.caseRef}的窗口随时会变。` },
  { priority: 20, intents: ['promise_feedback'], buildReply: (ctx) => `${ctx.senderName}：好，今天把${ctx.caseRef}的结果发我，别拖。` },
  { priority: 20, intents: ['align_manager'], buildReply: (ctx) => `${ctx.senderName}：收到，${ctx.caseRef}的情况和风险点你同步我，今天别散。` },
  { priority: 10, risks: ['overpromise'], buildReply: (ctx) => `${ctx.senderName}：别说绝对话，${ctx.caseRef}的情况你给我一个稳妥方案。` },
  { priority: 10, risks: ['empty_comfort'], flags: ['highUrgency'], buildReply: (ctx) => `${ctx.senderName}：别给我空话，${ctx.caseRef}今天到底抓哪件事，你给我说清楚。` },
  { priority: 10, risks: ['empty_comfort'], buildReply: (ctx) => `${ctx.senderName}：方向可以，但${ctx.caseRef}的具体动作你没说，我需要明确。` },
  { priority: 10, risks: ['ignores_customer'], buildReply: (ctx) => `${ctx.senderName}：你没回答我的问题，${ctx.caseRef}的情况你得正面回应。` },
  { priority: 10, risks: ['missing_next_step'], buildReply: (ctx) => `${ctx.senderName}：${ctx.caseRef}下一步做什么你没说，今天先落到一件事。` },
  { priority: 5, intents: ['reassure'], buildReply: (ctx) => `${ctx.senderName}：收到，${ctx.caseRef}的关键情况你确认清楚再给我反馈。` },
];
```

### Step 4: 重写 `buildFallbackRecipientReply`

替换原有函数（保留函数签名不变）：

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

### Step 5: 删除旧函数

删除 `buildHostileRecipientReply`（lines 936-947）和 `buildManagerFallbackReply`（lines 1293-1384），因为逻辑已合并入决策表。

### Step 6: 写决策表回归测试

创建 `src/selling-houses/application/__tests__/fallbackReplyTable.test.ts`：

```typescript
import { describe, expect, it } from 'vitest';
import { buildFallbackConversationEffectProposal } from '../wechatConversation.js';
import type { ConversationSceneInputPack } from '../../core/world-state/conversation/models.js';

function buildScene(overrides: Partial<ConversationSceneInputPack> = {}): ConversationSceneInputPack {
  return {
    sceneId: 'scene-1',
    runId: 'run-1',
    day: 7,
    conversationKey: 'owner:shaonvshi',
    sourceMessageId: 'msg-1',
    sceneType: 'owner_wechat',
    playerText: '',
    sourceMessage: {
      messageId: 'msg-1',
      senderName: '邵女士',
      senderRole: 'owner',
      content: '我这边时间真的不多了。',
      timeLabel: 'DAY 7',
      urgency: 'urgent',
    },
    caseContext: {
      caseId: 'case-1',
      title: '万航小区 63㎡ 一房',
      ownerName: '邵女士',
      district: '静安',
      community: '万航小区',
      askPrice: 612,
      marketPrice: 606,
      priceGapPct: 1,
      trust: 52,
      patience: 36,
      urgency: 72,
      heat: 68,
      competitiveness: 61,
      hasCompletedFirstVisit: true,
      ownerProfileLabel: '强势急售型业主',
    },
    recentTurns: [],
    ...overrides,
  };
}

describe('fallback reply decision table', () => {
  it('produces hostile reply for abusive input', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene({ playerText: '傻逼' }));
    expect(proposal.recipientReply).toContain('态度');
    expect(proposal.intentKinds).toContain('hostile');
  });

  it('produces price adjustment reply for assertive owner', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene({
      playerText: '调价到580万吧',
    }));
    expect(proposal.recipientReply).toContain('调价');
  });

  it('produces face visit reply with time ref', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene({
      playerText: '明天面访一下',
    }));
    expect(proposal.recipientReply).toContain('明天');
    expect(proposal.recipientReply).toContain('面访');
  });

  it('produces empty comfort risk reply', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene({
      playerText: '收到，先这样。',
    }));
    expect(proposal.riskKinds).toContain('empty_comfort');
    expect(proposal.recipientReply).toContain('具体');
  });

  it('produces ignores customer risk reply', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene({
      sceneType: 'customer_wechat',
      playerText: '我晚点联系您。',
      sourceMessage: {
        messageId: 'msg-2',
        senderName: '罗投资客',
        senderRole: 'customer',
        content: '价格没空间，我还得再想想。',
        timeLabel: 'DAY 7',
        urgency: 'medium',
      },
      opportunityContext: {
        opportunityId: 'opp-1',
        customerName: '罗投资客',
        stage: '同类比较',
        intent: 61,
        confidence: 52,
      },
    }));
    expect(proposal.riskKinds).toContain('ignores_customer');
  });

  it('produces manager reply for manager scene', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene({
      sceneType: 'manager_wechat',
      playerText: '收到',
      sourceMessage: {
        messageId: 'msg-3',
        senderName: '王经理',
        senderRole: 'district_manager',
        content: '今天进度怎么样？',
        timeLabel: 'DAY 7',
        urgency: 'medium',
      },
    }));
    expect(proposal.recipientReply).toContain('王经理');
  });

  it('falls back to neutral variant when no rule matches', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene({
      playerText: '嗯嗯好的',
    }));
    expect(proposal.recipientReply).toBeTruthy();
    expect(proposal.recipientReply.length).toBeGreaterThan(10);
  });
});
```

### Step 7: 运行测试验证

```bash
cd /Users/jiaqi/Documents/开放日测算
npx vitest run src/selling-houses/application/__tests__/fallbackReplyTable.test.ts
npx vitest run src/selling-houses/application/__tests__/wechatConversation.test.ts
npx tsc --noEmit
```

Expected: 全部 PASS，行为与重构前完全一致。

### Step 8: Commit

```bash
git add src/selling-houses/application/wechatConversation.ts src/selling-houses/application/__tests__/fallbackReplyTable.test.ts
git commit -m "refactor: convert buildFallbackRecipientReply from nested if/else to decision table"
```

---

## Task 2: 复盘教练

**Files:**
- Create: `src/selling-houses/application/conversationCoach.ts`
- Create: `src/selling-houses/application/__tests__/conversationCoach.test.ts`
- Create: `src/selling-houses/ui/features/ConversationCoachCard.tsx`
- Modify: `src/selling-houses/ui/features/MyWechatPanel.tsx`

**核心思路：** 读取 `ConversationReceipt` 中已有的 evaluation report 数据，生成自然语言复盘反馈。零状态改动。

### Step 1: 创建 conversationCoach.ts

**重要：** `ConversationReceipt.traceSnapshot` 中的 evaluation 数据是扁平化的（score, verdict, signals, summary），不包含完整的 4 维度评估报告。教练功能基于这些扁平化数据 + proposal 数据构建。

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

  // Risk analysis from proposal
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

  // Intent effectiveness analysis
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
  const nextStepAdvice = buildNextStepAdvice(receipt);

  return { overall: parts.join(''), insights, nextStepAdvice };
}

function buildNextStepAdvice(receipt: ConversationReceipt): string | null {
  const nextStep = receipt.proposal.nextStep;
  if (!nextStep || nextStep.kind === 'none') return null;

  const kindLabels: Record<string, string> = {
    schedule_face_visit: '安排面访',
    review_price: '复盘价格策略',
    prepare_competition_comparison: '准备竞品对比',
    follow_customer: '跟进客户',
    confirm_price_adjustment: '确认调价',
    open_case: '开展新案件',
  };

  const label = kindLabels[nextStep.kind] ?? nextStep.kind;
  return `建议下一步：${label}——${nextStep.reason}`;
}
```

### Step 2: 写教练测试

创建 `src/selling-houses/application/__tests__/conversationCoach.test.ts`：

```typescript
import { describe, expect, it } from 'vitest';
import { buildCoachFeedback } from '../conversationCoach.js';
import type { ConversationReceipt } from '../../core/world-state/conversation/models.js';

function buildMockReceipt(overrides: Partial<ConversationReceipt> = {}): ConversationReceipt {
  return {
    receiptId: 'r-1',
    conversationKey: 'owner:test',
    sourceMessageId: 'msg-1',
    day: 7,
    turnIndex: 0,
    sceneType: 'owner_wechat',
    actorName: '邵女士',
    actorRole: 'owner',
    playerText: '放心，我帮你搞定',
    recipientReply: '好的，你把情况确认清楚。',
    summary: '基础安抚。',
    proposal: {
      summary: '基础安抚。',
      recipientReply: '好的，你把情况确认清楚。',
      intentKinds: ['reassure'],
      riskKinds: ['none'],
      evidenceUse: 'none',
      trustDelta: 1,
      patienceDelta: 0,
      urgencyDelta: 0,
      priceFlexibilityDelta: 0,
      customerIntentDelta: 0,
      customerConfidenceDelta: 0,
      confidence: 0.7,
    },
    settlement: {
      trustDelta: 1,
      patienceDelta: 0,
      urgencyDelta: 0,
      priceFlexibilityDelta: 0,
      customerIntentDelta: 0,
      customerConfidenceDelta: 0,
      effectLabels: [],
    },
    nextSteps: [],
    source: 'fallback',
    traceSnapshot: {
      acceptedSource: 'fallback',
      ruleConfidence: 0.7,
      llmConfidence: null,
      pressure: [],
      uncertainty: [],
      memoryFactCount: 0,
      contextSignalCount: 0,
      arbiterDecision: 'fallback',
      validationNotes: [],
      rejectedReasons: [],
      evaluationScore: 65,
      evaluationVerdict: 'acceptable',
      evaluationSignals: [],
      evaluationSummary: '微信回合：基础安抚。',
    },
    ...overrides,
  };
}

describe('conversationCoach', () => {
  it('returns null when no traceSnapshot', () => {
    const receipt = buildMockReceipt({ traceSnapshot: undefined });
    const result = buildCoachFeedback(receipt);
    expect(result).toBeNull();
  });

  it('returns null when no evaluation verdict', () => {
    const receipt = buildMockReceipt({
      traceSnapshot: {
        acceptedSource: 'fallback',
        ruleConfidence: 0.7,
        llmConfidence: null,
        pressure: [],
        uncertainty: [],
        memoryFactCount: 0,
        contextSignalCount: 0,
        arbiterDecision: 'fallback',
        validationNotes: [],
        rejectedReasons: [],
      },
    });
    const result = buildCoachFeedback(receipt);
    expect(result).toBeNull();
  });

  it('generates overall feedback based on verdict', () => {
    const result = buildCoachFeedback(buildMockReceipt());
    expect(result?.overall).toContain('基本到位');
  });

  it('flags empty comfort risk', () => {
    const receipt = buildMockReceipt({
      proposal: {
        summary: '空泛安抚。',
        recipientReply: '收到。',
        intentKinds: ['reassure'],
        riskKinds: ['empty_comfort'],
        evidenceUse: 'none',
        trustDelta: 0,
        patienceDelta: 0,
        urgencyDelta: 0,
        priceFlexibilityDelta: 0,
        customerIntentDelta: 0,
        customerConfidenceDelta: 0,
        confidence: 0.5,
      },
    });
    const result = buildCoachFeedback(receipt);
    expect(result?.overall).toContain('笼统');
    expect(result?.insights.some(i => i.includes('具体方案'))).toBe(true);
  });

  it('flags ignores customer risk', () => {
    const receipt = buildMockReceipt({
      proposal: {
        summary: '跳过了问题。',
        recipientReply: '好的。',
        intentKinds: ['reassure'],
        riskKinds: ['ignores_customer'],
        evidenceUse: 'none',
        trustDelta: 0,
        patienceDelta: 0,
        urgencyDelta: 0,
        priceFlexibilityDelta: 0,
        customerIntentDelta: 0,
        customerConfidenceDelta: 0,
        confidence: 0.5,
      },
    });
    const result = buildCoachFeedback(receipt);
    expect(result?.overall).toContain('核心问题');
  });

  it('generates next step advice when next step exists', () => {
    const receipt = buildMockReceipt({
      proposal: {
        summary: '建议面访。',
        recipientReply: '好的，面访。',
        intentKinds: ['propose_face_visit'],
        riskKinds: ['none'],
        evidenceUse: 'none',
        trustDelta: 1,
        patienceDelta: 0,
        urgencyDelta: 0,
        priceFlexibilityDelta: 0,
        customerIntentDelta: 0,
        customerConfidenceDelta: 0,
        nextStep: {
          kind: 'schedule_face_visit',
          label: '安排面访',
          reason: '需要当面确认。',
          priority: 'high',
        },
        confidence: 0.85,
      },
    });
    const result = buildCoachFeedback(receipt);
    expect(result?.nextStepAdvice).toContain('面访');
    expect(result?.nextStepAdvice).toContain('当面确认');
  });

  it('detects ineffective reassure when trust not increased', () => {
    const receipt = buildMockReceipt({
      proposal: {
        summary: '安抚。',
        recipientReply: '放心。',
        intentKinds: ['reassure'],
        riskKinds: ['none'],
        evidenceUse: 'none',
        trustDelta: -1,
        patienceDelta: 0,
        urgencyDelta: 0,
        priceFlexibilityDelta: 0,
        customerIntentDelta: 0,
        customerConfidenceDelta: 0,
        confidence: 0.6,
      },
      settlement: {
        trustDelta: -1,
        patienceDelta: 0,
        urgencyDelta: 0,
        priceFlexibilityDelta: 0,
        customerIntentDelta: 0,
        customerConfidenceDelta: 0,
        effectLabels: [],
      },
    });
    const result = buildCoachFeedback(receipt);
    expect(result?.insights.some(i => i.includes('安抚') && i.includes('信任'))).toBe(true);
  });
});
```

### Step 3: 运行教练测试

```bash
npx vitest run src/selling-houses/application/__tests__/conversationCoach.test.ts
```

Expected: PASS

### Step 4: 创建 ConversationCoachCard.tsx

```tsx
import { useState } from 'react';
import { ChevronDown, ChevronUp, Lightbulb, AlertTriangle, CheckCircle, Target } from 'lucide-react';
import type { CoachFeedback } from '../../application/conversationCoach.js';

interface ConversationCoachCardProps {
  feedback: CoachFeedback;
}

export function ConversationCoachCard({ feedback }: ConversationCoachCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium text-gray-700">
          <Lightbulb size={16} className="text-amber-500" />
          <span>回复复盘</span>
        </div>
        {feedback.insights.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-400 hover:text-gray-600"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>

      <p className="mt-2 text-gray-600 leading-relaxed">{feedback.overall}</p>

      {feedback.nextStepAdvice && (
        <p className="mt-1 text-blue-700 bg-blue-50 rounded px-2 py-1 text-xs">
          {feedback.nextStepAdvice}
        </p>
      )}

      {expanded && feedback.insights.length > 0 && (
        <div className="mt-2 space-y-1">
          {feedback.insights.map((insight, i) => (
            <p key={i} className="text-amber-700 bg-amber-50 rounded px-2 py-1 text-xs leading-relaxed">
              {insight}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Step 5: 集成到 MyWechatPanel.tsx

在 `MyWechatPanel.tsx` 的对话详情视图中，找到渲染对话回合的位置（`ConversationTurnThread` 附近），在每条 NPC 回复下方添加教练卡片：

1. 在文件顶部添加 import：
```typescript
import { buildCoachFeedback } from '../../application/conversationCoach.js';
import { ConversationCoachCard } from './ConversationCoachCard.js';
```

2. 在 `ConversationTurnThread` 或等价组件中，找到渲染 `recipientReply` 的位置，在其下方条件渲染教练卡片：

```tsx
{(() => {
  const feedback = buildCoachFeedback(receipt);
  return feedback ? <ConversationCoachCard feedback={feedback} /> : null;
})()}
```

**注意：** 教练功能基于 `traceSnapshot` 中已有的扁平化 evaluation 数据（score, verdict, signals, summary）+ proposal 数据，不需要额外存储完整评估报告。

### Step 6: 运行类型检查和测试

```bash
npx tsc --noEmit
npx vitest run src/selling-houses/application/__tests__/conversationCoach.test.ts
```

### Step 7: Commit

```bash
git add src/selling-houses/application/conversationCoach.ts src/selling-houses/application/__tests__/conversationCoach.test.ts src/selling-houses/ui/features/ConversationCoachCard.tsx src/selling-houses/ui/features/MyWechatPanel.tsx
git commit -m "feat: add conversation coach feedback based on evaluation reports"
```

---

## Task 3: AI Fallback 自动扩展脚本

**Files:**
- Create: `scripts/generate-fallback-rules.ts`

**核心思路：** 读取历史 `ConversationReceipt`，用 LLM 生成新的 `(ownerProfile × intent × risk)` 组合的回复条目，输出为可审核的 JSON。

### Step 1: 创建脚本

```typescript
/**
 * generate-fallback-rules.ts
 *
 * 用法: npx tsx scripts/generate-fallback-rules.ts [--input receipts.json] [--output new-rules.json]
 *
 * 从历史 ConversationReceipt 中提取 (ownerProfile, intent, risk) 组合的回复模式，
 * 用 LLM 生成新的 fallback reply 规则条目，输出为可审核的 JSON。
 *
 * 生成的条目需要人工审核后手动合入 OWNER_REPLY_TABLE。
 */

import { GoogleGenerativeAI } from '@google/genai';

interface ExistingRule {
  ownerProfile: string;
  intent: string;
  risk: string;
  flags: string[];
  replyTemplate: string;
}

interface GeneratedRule {
  ownerProfile: string;
  intent: string;
  risk: string;
  flags: string[];
  replyTemplate: string;
  reasoning: string;
  confidence: number;
}

// 从决策表中提取已有规则的骨架（用于去重）
const EXISTING_RULES_SKELETON: ExistingRule[] = [
  { ownerProfile: 'assertive', intent: 'secure_price_adjustment', risk: 'none', flags: [], replyTemplate: '${senderName}：${priceRef}这个价格你有依据吗？...' },
  { ownerProfile: 'anxious', intent: 'secure_price_adjustment', risk: 'none', flags: [], replyTemplate: '...' },
  // ... 从 OWNER_REPLY_TABLE 提取所有规则骨架
];

async function generateFallbackRules(receipts: any[]): Promise<GeneratedRule[]> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not set');

  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // 1. 从 receipts 中提取 (ownerProfile, intent, risk) 组合
  const combos = extractCombos(receipts);

  // 2. 找出已有规则未覆盖的组合
  const uncovered = combos.filter(c => !isCovered(c));

  // 3. 对每个未覆盖的组合，用 LLM 生成回复
  const generated: GeneratedRule[] = [];
  for (const combo of uncovered.slice(0, 20)) { // 限制每次最多 20 个
    const prompt = buildGenerationPrompt(combo, receipts);
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = parseGeneratedRule(text, combo);
    if (parsed) generated.push(parsed);
  }

  return generated;
}

function extractCombos(receipts: any[]): Array<{ ownerProfile: string; intent: string; risk: string; flags: string[] }> {
  const combos = new Map<string, { ownerProfile: string; intent: string; risk: string; flags: string[] }>();
  for (const receipt of receipts) {
    const profile = receipt.traceSnapshot?.ownerProfileLabel || 'default';
    for (const intent of receipt.proposal.intentKinds) {
      for (const risk of receipt.proposal.riskKinds) {
        const key = `${profile}|${intent}|${risk}`;
        if (!combos.has(key)) {
          combos.set(key, {
            ownerProfile: categorizeProfile(profile),
            intent,
            risk,
            flags: [],
          });
        }
      }
    }
  }
  return [...combos.values()];
}

function categorizeProfile(label: string): string {
  if (/强势|硬控|控盘|博弈|自信/.test(label)) return 'assertive';
  if (/焦虑|急/.test(label)) return 'anxious';
  return 'default';
}

function isCovered(combo: { ownerProfile: string; intent: string; risk: string }): boolean {
  return EXISTING_RULES_SKELETON.some(r =>
    r.ownerProfile === combo.ownerProfile &&
    r.intent === combo.intent &&
    r.risk === combo.risk
  );
}

function buildGenerationPrompt(combo: { ownerProfile: string; intent: string; risk: string }, receipts: any[]): string {
  const examples = receipts
    .filter(r => categorizeProfile(r.traceSnapshot?.ownerProfileLabel || '') === combo.ownerProfile)
    .slice(0, 3)
    .map(r => `玩家回复: ${r.playerText}\n业主回复: ${r.recipientReply}`)
    .join('\n---\n');

  return `你是上海二手房经营模拟的微信对话回复生成器。

任务：为以下组合生成一条业主微信回复模板：
- 业主类型: ${combo.ownerProfile}
- 玩家意图: ${combo.intent}
- 风险类型: ${combo.risk}

参考同类型业主的历史回复风格：
${examples}

要求：
1. 回复以 "\${senderName}：" 开头
2. 使用 \${caseRef}、\${askPrice}、\${marketPrice}、\${priceGapPct}、\${priceRef}、\${locRef} 等变量
3. 回复要符合该业主类型的说话风格
4. 回复要体现对玩家意图的回应和风险的识别
5. 回复长度 20-50 字

输出 JSON 格式：
{
  "replyTemplate": "回复模板",
  "reasoning": "为什么这样回复"
}`;
}

function parseGeneratedRule(text: string, combo: { ownerProfile: string; intent: string; risk: string; flags: string[] }): GeneratedRule | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      ownerProfile: combo.ownerProfile,
      intent: combo.intent,
      risk: combo.risk,
      flags: combo.flags,
      replyTemplate: parsed.replyTemplate,
      reasoning: parsed.reasoning,
      confidence: 0.7,
    };
  } catch {
    return null;
  }
}

// Main
async function main() {
  const fs = await import('fs');
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf('--input');
  const outputIdx = args.indexOf('--output');

  const inputPath = inputIdx >= 0 ? args[inputIdx + 1] : 'receipts.json';
  const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : 'new-fallback-rules.json';

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    console.error('Export conversation receipts to JSON first.');
    process.exit(1);
  }

  const receipts = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  console.log(`Loaded ${receipts.length} receipts`);

  const rules = await generateFallbackRules(receipts);
  fs.writeFileSync(outputPath, JSON.stringify(rules, null, 2));
  console.log(`Generated ${rules.length} new rules → ${outputPath}`);
  console.log('Review the rules and manually add them to OWNER_REPLY_TABLE in wechatConversation.ts');
}

main().catch(console.error);
```

### Step 2: 验证脚本可运行

```bash
npx tsx scripts/generate-fallback-rules.ts --help
```

Expected: 脚本可运行（会因缺少 receipts.json 而退出，但不报类型错误）。

### Step 3: Commit

```bash
git add scripts/generate-fallback-rules.ts
git commit -m "feat: add AI fallback rule generation script"
```

---

## Task 4: AI 测试场景生成

**Files:**
- Create: `scripts/generate-conversation-tests.ts`

**核心思路：** 从决策表的规则骨架批量生成 `(scene, expectedProposal)` 测试用例。

### Step 1: 创建脚本

```typescript
/**
 * generate-conversation-tests.ts
 *
 * 用法: npx tsx scripts/generate-conversation-tests.ts [--output generated-tests.json]
 *
 * 从决策表规则骨架生成测试场景，覆盖每条规则的关键路径。
 * 输出为 JSON 格式，可直接导入为 vitest 测试用例。
 */

import { GoogleGenerativeAI } from '@google/genai';

interface TestCase {
  name: string;
  scene: {
    sceneType: string;
    playerText: string;
    ownerProfileLabel: string;
    trust: number;
    patience: number;
    urgency: number;
    priceGapPct: number;
    hasCompletedFirstVisit: boolean;
    senderName: string;
    senderRole: string;
    content: string;
  };
  expected: {
    intents: string[];
    risks: string[];
    recipientReplyContains: string[];
    trustDeltaSign: 'positive' | 'negative' | 'zero' | 'any';
  };
}

// 决策表规则骨架（从 OWNER_REPLY_TABLE 提取）
const RULE_SKELETONS = [
  { ownerProfile: 'assertive', intent: 'secure_price_adjustment', flags: ['hasPriceRef'] },
  { ownerProfile: 'assertive', intent: 'secure_price_adjustment', flags: ['highPriceGap'] },
  { ownerProfile: 'anxious', intent: 'secure_price_adjustment', flags: [] },
  { ownerProfile: 'assertive', intent: 'propose_face_visit', flags: ['hasTimeRef'] },
  { ownerProfile: 'anxious', intent: 'propose_face_visit', flags: [] },
  { ownerProfile: 'default', intent: 'discuss_price', flags: ['highPriceGap'] },
  { ownerProfile: 'assertive', intent: 'present_market_evidence', flags: ['noFirstVisit'] },
  { ownerProfile: 'default', intent: 'present_market_evidence', flags: ['lowTrust'] },
  { ownerProfile: 'default', intent: 'follow_customer', flags: ['hasCustomerName', 'highCustomerIntent'] },
  { ownerProfile: 'default', intent: 'promise_feedback', flags: ['lowTrust'] },
  { ownerProfile: 'default', intent: 'reassure', flags: [] },
  { ownerProfile: 'default', intent: 'reassure', flags: ['lowTrust'] },
  { ownerProfile: 'anxious', intent: 'reassure', flags: [] },
  { sceneType: 'customer_wechat', intent: 'hostile', flags: [] },
  { sceneType: 'manager_wechat', intent: 'present_market_evidence', flags: ['noFirstVisit'] },
  { intent: 'empty_comfort', flags: ['highUrgency'] },
  { intent: 'ignores_customer', flags: [] },
  { intent: 'missing_next_step', flags: [] },
  { intent: 'overpromise', flags: [] },
];

async function generateTestCases(): Promise<TestCase[]> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not set');

  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const testCases: TestCase[] = [];

  for (const skeleton of RULE_SKELETONS) {
    const prompt = buildTestPrompt(skeleton);
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = parseTestCase(text, skeleton);
    if (parsed) testCases.push(parsed);
  }

  return testCases;
}

function buildTestPrompt(skeleton: typeof RULE_SKELETONS[0]): string {
  return `你是上海二手房经营模拟的测试场景生成器。

任务：为以下规则生成一个测试场景：
- 业主类型: ${skeleton.ownerProfile || 'default'}
- 玩家意图: ${skeleton.intent}
- 条件标记: ${skeleton.flags.join(', ') || '无'}
- 场景类型: ${skeleton.sceneType || 'owner_wechat'}

生成一个玩家的微信回复文本（10-30字），以及该回复应该触发的预期结果。

要求：
1. 玩家回复要自然，符合上海二手房经纪人的说话方式
2. 回复要能触发指定的意图检测
3. 如果标记包含 hasPriceRef，回复中要包含 "XX万" 格式的价格
4. 如果标记包含 hasTimeRef，回复中要包含 "明天/今天/下午" 等时间词
5. 如果标记包含 highUrgency，场景的 urgency 要 >= 70
6. 如果标记包含 lowTrust，场景的 trust 要 < 40

输出 JSON 格式：
{
  "playerText": "玩家的微信回复",
  "ownerProfileLabel": "对应的业主标签",
  "trust": 50,
  "patience": 50,
  "urgency": 50,
  "priceGapPct": 10,
  "hasCompletedFirstVisit": true,
  "expectedIntents": ["预期的意图"],
  "expectedRisks": ["预期的风险"],
  "replyShouldContain": ["回复应包含的关键词"],
  "senderName": "邵女士",
  "content": "业主之前发的消息内容"
}`;
}

function parseTestCase(text: string, skeleton: typeof RULE_SKELETONS[0]): TestCase | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      name: `${skeleton.sceneType || 'owner'}_${skeleton.intent}_${skeleton.ownerProfile || 'default'}_${skeleton.flags.join('-') || 'base'}`,
      scene: {
        sceneType: skeleton.sceneType || 'owner_wechat',
        playerText: parsed.playerText,
        ownerProfileLabel: parsed.ownerProfileLabel || '普通业主',
        trust: parsed.trust ?? 50,
        patience: parsed.patience ?? 50,
        urgency: parsed.urgency ?? 50,
        priceGapPct: parsed.priceGapPct ?? 10,
        hasCompletedFirstVisit: parsed.hasCompletedFirstVisit ?? true,
        senderName: parsed.senderName || '邵女士',
        senderRole: skeleton.sceneType === 'customer_wechat' ? 'customer' : skeleton.sceneType === 'manager_wechat' ? 'district_manager' : 'owner',
        content: parsed.content || '我这边情况怎么样了？',
      },
      expected: {
        intents: parsed.expectedIntents || [skeleton.intent],
        risks: parsed.expectedRisks || ['none'],
        recipientReplyContains: parsed.replyShouldContain || [],
        trustDeltaSign: 'any',
      },
    };
  } catch {
    return null;
  }
}

// Main
async function main() {
  const fs = await import('fs');
  const args = process.argv.slice(2);
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : 'generated-conversation-tests.json';

  console.log('Generating test cases from rule skeletons...');
  const testCases = await generateTestCases();

  fs.writeFileSync(outputPath, JSON.stringify(testCases, null, 2));
  console.log(`Generated ${testCases.length} test cases → ${outputPath}`);
  console.log('Import into vitest or review manually.');
}

main().catch(console.error);
```

### Step 2: 验证脚本可运行

```bash
npx tsx scripts/generate-conversation-tests.ts --help
```

### Step 3: Commit

```bash
git add scripts/generate-conversation-tests.ts
git commit -m "feat: add AI conversation test scenario generation script"
```

---

## 最终验证

```bash
# 类型检查
npx tsc --noEmit

# 运行所有相关测试
npx vitest run src/selling-houses/application/__tests__/fallbackReplyTable.test.ts
npx vitest run src/selling-houses/application/__tests__/conversationCoach.test.ts
npx vitest run src/selling-houses/application/__tests__/wechatConversation.test.ts

# 确认没有回归
npx vitest run src/selling-houses/
```

全部 PASS 后最终 commit：
```bash
git add -A
git commit -m "feat: fallback decision table refactor + conversation coach + AI scripts"
```
