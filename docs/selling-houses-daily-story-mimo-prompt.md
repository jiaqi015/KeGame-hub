# Mimo Prompt: Daily City Story Harness

你要在 `/Users/jiaqi/Documents/开放日测算` 的 selling-houses 项目里实现“日结算城市故事”AI harness。前端框架已经有雏形：

- `src/selling-houses/ui/features/DailySummaryOverlay.tsx`
- 顶部已经有 `昨夜故事` / `今天怎么接`
- 下面已经有 `关键证据` / `昨夜证据线`

现在要补的不是 UI 皮肤，而是让故事真的像一段城市经营夜报：有城市、有房子、有业主、有客户、有商圈压力、有昨天到今天的因果。不要再像数据表，也不要像教学系统。

## 目标

实现一个 Daily City Story harness：

1. 从当前 `DailyReport`、`DailyTickResult`、actor-visible causal events、case/customer/owner/market projection 构建 story context pack。
2. 用 Mimo 生成一段 500-900 字中文城市故事，拆成 4-6 段。
3. 故事必须基于可见事实和证据，不能偷看 hidden GlobalTruth，不能凭空编成交、降价、客户身份或业主态度。
4. 输出必须是结构化 JSON，UI 只消费 JSON，不展示 `fallback`、`LLM`、`规则置信度`、trace、system prompt 等系统噪音。
5. 如果模型不可用，回退 deterministic story builder，但仍然输出同一 JSON schema。
6. AI 只写“昨夜发生了什么”和“今天怎么接”，不能修改 `GameState`。

## 用户体验口径

玩家打开日结算时，不想看一张冷冰冰的指标表。他要在 20 秒内知道：

- 昨天这座城市里，哪条经营线真的动了。
- 哪套房、哪个业主、哪个客户或哪个商圈压力在改变今天的优先级。
- 分数为什么变，不是公式，而是可以理解的业务故事。
- 今天第一手应该接哪条线。

故事语气要像“资深门店店长夜里写给自己第二天看的经营手记”，不是小说家，不是教练，不是 SaaS 报表，不是 AI 总结。

## 建议文件拆分

优先按这个拆：

```text
src/selling-houses/application/dailyStory/contextPack.ts
src/selling-houses/application/dailyStory/storyContract.ts
src/selling-houses/application/dailyStory/fallbackStoryWriter.ts
src/selling-houses/application/agents/dailyStoryAgentAdapter.ts
src/selling-houses/application/agents/dailyStoryDualRuntime.ts
src/selling-houses/interfaces/http/dailyStoryHandlers.ts
src/selling-houses/application/__tests__/dailyStoryContextPack.test.ts
src/selling-houses/application/__tests__/dailyStoryAgentHarness.test.ts
src/selling-houses/interfaces/http/__tests__/dailyStoryHandlers.test.ts
```

前端可以再加：

```text
src/selling-houses/ui/features/dailyStoryClient.ts
```

但第一版也可以先让 `DailySummaryOverlay` 消费本地 `story` projection，HTTP harness 后接。

## Context Pack 契约

context pack 只放玩家视角可见的信息，禁止塞内部真相、完整概率表、hidden tags。

```ts
interface DailyCityStoryContextPack {
  packId: string;
  day: number;
  reportTitle: string;
  cityFrame: {
    dayLabel: string;
    currentPeriod: 'morning' | 'afternoon' | 'evening' | 'night' | 'unknown';
    districts: string[];
    weatherOrExternalNotes: string[];
    marketMood: string;
  };
  scoreboard: {
    totalScore?: { value: number; unit: string };
    sharpestDeltas: Array<{ label: string; value: number; unit: string; direction: 'up' | 'down' | 'flat' }>;
    riskCount?: number;
  };
  visibleEvents: DailyStoryVisibleEvent[];
  visibleCases: DailyStoryVisibleCase[];
  visibleOwners: DailyStoryVisibleOwner[];
  visibleCustomers: DailyStoryVisibleCustomer[];
  todayPlan: {
    label: string;
    theme: string;
    energy: number;
    focusCases: string[];
    priorities: string[];
  };
  constraints: string[];
}

interface DailyStoryVisibleEvent {
  eventId: string;
  actor: string;
  title: string;
  detail: string;
  tone: 'success' | 'danger' | 'accent' | 'neutral';
  evidenceRef?: string;
  relatedCaseTitle?: string;
  relatedCustomerName?: string;
  relatedOwnerName?: string;
  relatedDistrict?: string;
}

interface DailyStoryVisibleCase {
  caseId: string;
  title: string;
  district?: string;
  layout?: string;
  areaSqm?: number;
  visibleStatus: string;
  pressureLabels: string[];
}

interface DailyStoryVisibleOwner {
  ownerId: string;
  displayName: string;
  relatedCaseTitle?: string;
  visibleMood: string;
  pressureLabels: string[];
}

interface DailyStoryVisibleCustomer {
  customerId: string;
  displayName: string;
  intentLabel: string;
  relatedCaseTitles: string[];
  latestVisibleSignal?: string;
}
```

### context pack 取数原则

- `visibleEvents` 最多 10 条，优先 yesterday/tick 真实事件。
- `visibleCases` 最多 6 套，优先 dirty scope、today focus、risk line。
- `visibleOwners` 最多 5 个，优先 trust/patience 变化或今日需要沟通的人。
- `visibleCustomers` 最多 5 个，优先进线、掉线、改约、竞品比较。
- `weatherOrExternalNotes` 不需要接外部互联网，先用游戏内 market/news/source record。
- 所有字段都必须来自 actor-visible projection 或已有 DailyReport / DailyTickResult。

## Output 契约

Mimo 只能输出 JSON，不输出 markdown，不输出解释，不输出思维链：

```ts
interface DailyCityStoryResult {
  storyId: string;
  source: 'ai' | 'fallback';
  headline: string;
  deck: string;
  cityStory: {
    paragraphs: string[];
    wordCount: number;
  };
  todayBridge: {
    label: string;
    value: string;
    actionCue: string;
  };
  evidenceLabels: string[];
  citedEventIds: string[];
  citedCaseIds: string[];
  citedCustomerIds: string[];
  citedOwnerIds: string[];
  safety: {
    hiddenTruthUsed: false;
    inventedFacts: false;
    needsFallback: boolean;
    fallbackReason?: string;
  };
}
```

## 多工具 / 多 Agent Flow

第一版可以是单进程 harness，但内部要按 agent flow 编排。后续如果要真的拆多 agent，也可以沿用这个结构。

```text
DailyStoryRequest
  -> ContextPackBuilder
  -> EvidenceCuratorAgent
  -> CityFrameAgent
  -> RelationshipPressureAgent
  -> BusinessConsequenceAgent
  -> StoryWriterAgent (Mimo)
  -> FactGuardAgent
  -> UXCopyEditorAgent
  -> Arbiter
  -> DailyCityStoryResult
```

### 1. ContextPackBuilder

职责：

- 收集 `DailyReport`、`DailyTickResult`、visible projection。
- 提炼 story pack。
- 给每条事实稳定 id。
- 标记约束：不能编事实、不能泄露 hidden truth、不能修改状态。

### 2. EvidenceCuratorAgent

职责：

- 从事件里选 3-6 条最能解释昨夜变化的证据。
- 判断主线：成交、流失、业主信任、客户进线、竞品压力、市场变化、资源变化。
- 输出 `evidenceBeats`，每条必须带 `eventId` 或可追溯字段。

### 3. CityFrameAgent

职责：

- 把城市背景写实化：浦东前滩、商圈、雨天、周几、门店节奏、夜里客户微信等。
- 不查外网，不编真实新闻。
- 只能根据游戏内 district / market / day / weatherOrExternalNotes 做氛围。

### 4. RelationshipPressureAgent

职责：

- 解释业主/客户关系变化。
- 把 “业主信任 -6.2” 翻译成真实业务语言：等待反馈、竞品比较、价格预期、耐心下降、沟通窗口变窄。

### 5. BusinessConsequenceAgent

职责：

- 把昨夜变化接到今天行动。
- 输出一个清晰 `todayBridge`：今天先接哪条线，为什么。

### 6. StoryWriterAgent

职责：

- 调 Mimo 写 500-900 字中文故事，4-6 段。
- 保持城市经营夜报语气。
- 不输出思维链。

### 7. FactGuardAgent

职责：

- 检查所有实体、事件、数字都来自 context pack。
- 拒绝不存在的成交、客户、房源、商圈、天气、降价、竞品。
- 检查 `citedEventIds/citedCaseIds/...` 与正文一致。

### 8. UXCopyEditorAgent

职责：

- 去掉系统味：不要“模型认为”“置信度”“算法”“LLM”“fallback”“规则”。
- 去掉教学味：不要“你应该学习”“训练”“任务引导”。
- 保留业务味：谁、哪套房、什么变化、影响什么、今天怎么接。

### 9. Arbiter

职责：

- JSON schema 校验。
- 长度校验。
- 事实引用校验。
- 失败则 deterministic fallback。

## Mimo 系统提示词

复制给 Mimo 的 system prompt：

```text
你是“我是王牌资产顾问”卖房经营游戏里的日结城市故事代理。

你的任务不是写报表，而是把昨天一天的经营事实写成一段真实、可信、可追溯的城市经营夜报。读者是一个第二天早上要继续处理业主、客户、房源和商圈压力的经纪人/资产顾问。

你只能使用输入 JSON 里的可见事实。你不能发明不存在的成交、降价、客户、业主情绪、商圈新闻、天气或外部事件。你不能偷看 hidden truth。你不能修改游戏状态。你不能声称已经安排成功。你不能输出思维链。

文风要求：
- 中文。
- 500-900 字。
- 4-6 段，每段 70-180 字。
- 像资深门店店长的夜间经营手记，不像小说，不像教学，不像 SaaS 报表，不像 AI 总结。
- 必须有城市感：商圈、街区、时间、门店节奏、客户/业主微信、竞品压力、天气或市场氛围。城市感只能来自输入信息，不允许凭空编真实新闻。
- 必须有人：至少提到 1 个业主或客户；如果输入里没有具体人名，用“这位业主/这组客户”等泛称，不要编姓名。
- 必须有房子：至少提到 1 套房源或房源线索；如果输入里没有具体房源，说明“没有新的重点房源浮出水面”。
- 必须解释数字背后的业务原因，而不是堆指标。
- 必须把昨天接到今天：最后要说明今天先接哪条线，为什么。

禁止词和禁止口吻：
- 不要出现：LLM、fallback、规则置信度、模型、算法、系统判断、训练、教学、任务、打卡。
- 不要写“主矛盾”“画像”“锚点”“盘面”“闭环”“抓手”这类抽象口号。
- 不要空泛说“需要关注客户体验”“提升服务质量”。
- 不要写未被输入支持的具体地名、天气、价格、人数、成交结果。

输出必须是 JSON。不要 markdown。不要额外解释。字段必须完整：
{
  "headline": string,
  "deck": string,
  "cityStory": {
    "paragraphs": string[],
    "wordCount": number
  },
  "todayBridge": {
    "label": string,
    "value": string,
    "actionCue": string
  },
  "evidenceLabels": string[],
  "citedEventIds": string[],
  "citedCaseIds": string[],
  "citedCustomerIds": string[],
  "citedOwnerIds": string[],
  "safety": {
    "hiddenTruthUsed": false,
    "inventedFacts": false,
    "needsFallback": boolean,
    "fallbackReason": string | null
  }
}
```

## Mimo 用户提示词模板

```text
请基于下面的 DailyCityStoryContextPack 写“昨夜城市故事”。

硬约束：
1. 只能引用 context 里的事实、实体、数字和事件。
2. 如果事实不足，也要写成经营夜报，但必须明确“没有新的明确信号”，不能编。
3. cityStory.paragraphs 必须 4-6 段，总字数 500-900 字。
4. headline 不超过 24 个中文字符。
5. deck 不超过 70 个中文字符。
6. todayBridge.actionCue 不超过 60 个中文字符。
7. evidenceLabels 3-5 条，每条不超过 12 个中文字符。
8. 引用过的事件/房源/客户/业主 id 必须填入 cited* 字段。

DailyCityStoryContextPack:
{{CONTEXT_PACK_JSON}}
```

## fallback writer 要求

没有模型或模型失败时，fallback 不能再退回数据表文案。至少输出：

- 1 个 headline
- 1 个 deck
- 4 段 paragraphs
- 1 个 todayBridge
- 3-5 个 evidenceLabels

fallback 写法：

1. 第一段：城市/商圈/今日标题。
2. 第二段：最大变化指标背后的业务含义。
3. 第三段：最重要事件。
4. 第四段：今天先接哪条线。

## 前端接入建议

`DailySummaryOverlay` 顶部故事区可以消费：

```ts
story.headline -> h3
story.deck -> kicker
story.cityStory.paragraphs -> 正文
story.todayBridge -> 右侧“今天怎么接”
story.evidenceLabels -> chip
```

如果正文变长：

- 顶部故事块可以保持大，但正文区域最大高度约 300-360px，内部滚动。
- 右侧“今天怎么接”保持固定，避免行动线被长故事挤没。
- 下方 `关键证据` 仍保留，作为故事的证据链。

## TDD 必做

先写失败测试，再实现：

1. context pack 不包含 hidden/global truth 字段。
2. context pack 至少包含 `day/reportTitle/todayPlan/scoreboard/visibleEvents`。
3. Mimo 合法 JSON 被 normalizer 接受，非法 JSON 触发 fallback。
4. normalizer 拒绝不存在的 `citedEventIds/citedCaseIds/citedCustomerIds/citedOwnerIds`。
5. normalizer 拒绝包含禁止词：`LLM/fallback/规则置信度/模型/算法/训练/教学`。
6. normalizer 拒绝少于 4 段或超过 6 段的 story。
7. normalizer 拒绝少于 450 中文字或超过 1000 中文字的 story。
8. fallback 在无模型时也输出 4 段以上，并且不展示系统噪音。
9. `DailySummaryOverlay` 渲染长故事时不挤掉 `今天怎么接`。
10. `npm run lint` 通过。

建议验证命令：

```bash
npx vitest run src/selling-houses/application/__tests__/dailyStoryContextPack.test.ts
npx vitest run src/selling-houses/application/__tests__/dailyStoryAgentHarness.test.ts
npx vitest run src/selling-houses/interfaces/http/__tests__/dailyStoryHandlers.test.ts
npm run lint
npm run build
```

## 验收口径

打开 `/seller`，推进到日结算弹窗后确认：

1. 顶部不再是指标大表，而是一段真实城市经营故事。
2. 故事至少 4 段，有城市、有房子、有人、有业务后果。
3. 指标只作为证据，不抢故事主位。
4. 右侧仍能一眼看到今天先接哪条线。
5. 页面没有 `fallback`、`LLM`、`规则置信度`、`模型未启用` 等字样。
6. 即使模型不可用，也不是空故事或短模板。
