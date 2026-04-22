# 卖房（资产顾问）Projection 投影架构

最后更新：2026-04-21

这份文档回答的是：

> 底层世界算完以后，给玩家看的经营概览、房源详情、市场、复盘、结果、排行榜，到底怎么从世界事实投影出来。

这份文档不回答：

- 页面具体长什么样
- 文案最终怎么写
- 组件怎么拆

它只回答：

1. 哪些东西是世界真相
2. 哪些东西是投影
3. 各类投影读什么、输出什么、绝不能写回什么

---

## 0. 一句话结论

Projection 是：

> 把世界真相翻译成人能判断的说法。

它不是数据库真相。
它不是局内状态。
它不是跨局成绩。

一句话：

> 页面负责讲人话，底层负责存真相。

---

## 1. 为什么 Projection 必须独立

如果 Projection 不独立，后面会出现 4 个问题：

1. “建议先谈价”会被误存成世界事实。
2. “客户池偏薄”会被误存成房源字段。
3. 排行榜展示行会反过来污染局内结果。
4. 复盘文案会和事件链脱节。

所以要定死：

> Projection 可以读世界，但不能反写世界。

---

## 2. Projection 家族

建议先固定 8 类：

1. `DashboardProjection`
2. `CaseDetailProjection`
3. `CustomerDetailProjection`
4. `MarketProjection`
5. `ActionReadinessProjection`
6. `ReviewProjection`
7. `ResultProjection`
8. `LeaderboardProjection`

---

## 3. DashboardProjection

回答：

> 今天先看什么，先处理谁。

### 主要读什么

- `TimeContext`
- `Matter[]`
- `WorldEvent[]`
- `OwnerCaseRelation[]`
- `CustomerCaseRelation[]`
- `BrokerRuntimeState`
- `MarketProjection`

### 主要输出什么

```ts
type DashboardProjection = {
  todayHeadline: string;
  weekCalendarItems: CalendarItemProjection[];
  urgentMatters: MatterBriefProjection[];
  riskReminders: ReminderProjection[];
  resourceSnapshot: ResourceSnapshotProjection;
  topPriorities: PriorityProjection[];
};
```

### 典型展示

- 今日新闻
- 今日事项
- 今日提醒
- 本周重点节点
- 哪套房今天最该处理

---

## 4. CaseDetailProjection

回答：

> 这套房现在到底怎么打。

### 主要读什么

- `CaseProfile`
- `CaseRuntime`
- `OwnerCaseRelation`
- `OwnerRuntimeState`
- `CustomerCaseRelation[]`
- `GoodHouseModelOutput`
- `PriceModelOutput`
- `CompetitionContext`
- `Matter[]`
- `EventStore`

### 主要输出什么

```ts
type CaseDetailProjection = {
  caseId: string;
  headline: string;
  mainProblem:
    | 'owner'
    | 'customer-pool'
    | 'price'
    | 'competition'
    | 'execution'
    | 'market';
  currentRiskTags: string[];
  actionSuggestions: ActionSuggestionProjection[];
  ownerSummary: OwnerSummaryProjection;
  customerPoolSummary: CustomerPoolSummaryProjection;
  priceSummary: PriceSummaryProjection;
  timeline: TimelineItemProjection[];
};
```

### 典型展示

- 当前主矛盾
- 值不值得继续押
- 客户池厚不厚
- 是否到了谈价窗口
- 最近为什么变好或变差

---

## 5. CustomerDetailProjection

回答：

> 这个客户现在值得推哪套房、怎么推。

### 主要读什么

- `CustomerProfile`
- `CustomerRuntimeState`
- `BrokerCustomerRelation`
- `CustomerCaseRelation[]`
- `CaseRuntime[]`
- `PriceModelOutput[]`
- `CompetitionContext[]`

### 主要输出什么

```ts
type CustomerDetailProjection = {
  customerId: string;
  nickname: string;
  currentStateSummary: string;
  bestMatchedCases: CustomerCaseMatchProjection[];
  followupRisk: string[];
  nextBestAction?: ActionSuggestionProjection;
};
```

### 注意

客户页是推进辅助，不要变成 CRM 大后台。

---

## 6. MarketProjection

回答：

> 外部环境哪里变了，对我手里的房有什么影响。

### 主要读什么

- `MarketState`
- `WorldEvent[]`
- `TimeContext`
- `BizAreaTimeState`
- `CompetitionContext[]`
- `OrganizationProjection`
- `CaseRuntime[]`

### 主要输出什么

```ts
type MarketProjection = {
  yesterdayNews: MarketNewsProjection[];
  radarAxes: {
    demandHeat: number;
    supplyPressure: number;
    rivalActivity: number;
    customerActivity: number;
    coSaleOpportunity: number;
  };
  drilldowns: MarketDrilldownProjection[];
  affectedCases: AffectedCaseProjection[];
};
```

### 注意

市场页必须从全局到局部：

- 城市
- 区域
- 商圈
- 小区 / 小区群
- segment

不要退回只看商圈。

---

## 7. ActionReadinessProjection

回答：

> 现在做哪个动作合适，为什么。

### 主要读什么

- `Matter[]`
- `BrokerRuntimeState`
- `OwnerCaseRelation`
- `CustomerCaseRelation`
- `BrokerOwnerRelation`
- `BrokerCustomerRelation`
- `PriceModelOutput`
- `GoodHouseModelOutput`
- `TimeContext`

### 主要输出什么

```ts
type ActionReadinessProjection = {
  actionId: string;
  targetIds: string[];
  readiness: number;
  canDo: boolean;
  reasonTags: string[];
  expectedImpactSummary: string;
  blockingReasons?: string[];
};
```

### 注意

这不是世界真相。

它只是把当前世界状态翻译成“现在适不适合做”。

---

## 8. ReviewProjection

回答：

> 这一局为什么赢、为什么输、哪一步最关键。

### 主要读什么

- `RunResult`
- `EventStore`
- `Matter[]`
- `CaseEndingProjection[]`
- `BudgetLedger`
- `ActionHistory`

### 主要输出什么

```ts
type ReviewProjection = {
  turningPoints: TurningPointProjection[];
  successReasons: string[];
  failureReasons: string[];
  actionEffectiveness: ActionEffectivenessProjection[];
  resourceUsageSummary: string;
  missedWindows: MissedWindowProjection[];
};
```

### 注意

复盘必须基于事件链。

不能先写一句“输在太贪”，再倒推证据。

---

## 9. ResultProjection

回答：

> 这一局最后值不值、强在哪、弱在哪。

### 主要读什么

- `RunResult`
- `CaseEndingProjection[]`
- `DifficultyTier`
- `RunDifficultyConfig`
- `ReviewProjection`

### 主要输出什么

```ts
type ResultProjection = {
  totalScore: number;
  scoreBreakdown: {
    ability: number;
    hold: number;
    satisfaction: number;
  };
  resultHeadline: string;
  caseEndingCards: CaseEndingProjection[];
  difficultyContext: string;
  careerImpactSummary?: string;
};
```

---

## 10. LeaderboardProjection

回答：

> 榜单上怎么给人看。

### 主要读什么

- `LeaderboardEntry`
- `Account`
- `PlayerProfile`
- `PlayerCareerStats`

### 主要输出什么

```ts
type LeaderboardProjection = {
  leaderboardType:
    | 'career-total-score'
    | 'best-single-run'
    | 'completed-run-count';
  rows: {
    rank: number;
    nickname: string;
    value: number;
  }[];
  currentUserRank?: number;
};
```

### 注意

排行榜投影可以排序和格式化。

但榜单 entry 本身属于游戏层，不属于投影层。

---

## 11. Projection 的硬边界

Projection 不能：

1. 改 `World`
2. 改 `RunResult`
3. 改 `PlayerCareerStats`
4. 改 `LeaderboardEntry`
5. 生成新的世界事件

Projection 只能：

1. 读
2. 聚合
3. 排序
4. 解释
5. 生成展示结构

---

## 12. 脏范围和重算

为了性能和清晰度，日结后应该给出 `dirtyScopes`。

例如：

```ts
type DirtyScopeSet = {
  cases: string[];
  opportunities: string[];
  customers: string[];
  owners: string[];
  districts: string[];
  marketCells: string[];
  matters: string[];
  market: boolean;
  dashboard: boolean;
  result: boolean;
};
```

这样 UI 不需要全量重算。

说明：

- 当前实现先用 `cases / opportunities / matters` 保持兼容。
- `customers / owners / districts / marketCells` 是给后续客户页、业主页、商圈雷达和回放系统准备的稳定脏范围。
- `owners` 现阶段是 owner ref，不是正式 ownerId；等 Owner 实体独立后再迁移。

---

## 13. 最后一句

Projection 的价值不是“包装文案”。

它的价值是：

> 在不污染世界真相的前提下，把复杂市场翻译成玩家能做判断的信息。
