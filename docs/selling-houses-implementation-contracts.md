# 卖房实现合同（最小收口版）

最后更新：2026-04-20

这份文档只做一件事：

> 把当前最阻塞开发的 canonical 命名和最小字段合同收成一份可以直接照着实现的锚点。

如果其他文档和这里冲突，以这份为准，并回到专题文档补解释，不要在实现层各自发明新主名。

---

## 1. 机会阶段 canonical

`CustomerCaseRelation.stage` / `OpportunityStage` 的 canonical 主线只到 `offer`：

```ts
type OpportunityStage =
  | 'online-inquiry'
  | 'interested'
  | 'first-showing-booked'
  | 'shown'
  | 'second-showing'
  | 'owner-meeting'
  | 'offer'
  | 'stagnated'
  | 'lost';
```

硬规则：

- `closed` 不是机会阶段。
- “成交线索”“成交结果”可以作为业务文案出现，但不能回写成 `CustomerCaseRelation.stage = 'closed'`。
- 正式成交必须落在独立产物：
  - `DealClosingEvaluation`
  - `ClosedDealRecord`

---

## 2. 账号体系 canonical

当前实现与文档统一使用下列主名：

```text
Account
PlayerProfile
GameRun
DailyRunSnapshot
RunResult
PlayerCareerStats
LeaderboardEntry
```

硬规则：

- 旧 `User*` 只作为历史别名或迁移说明出现，不能继续作为主模型名。
- 账号主键是 `Account.accountId`。
- 游戏内长期身份主键是 `PlayerProfile.playerProfileId`。
- 一局主键是 `GameRun.runId`。

---

## 3. DailyRunSnapshot 最小字段合同

`DailyRunSnapshot` 只表达“某一局某一天结算后的日摘要”，最小字段如下：

```ts
type DailyRunSnapshot = {
  runId: string;
  dayIndex: number;
  estimatedTotalScore: number;
  estimatedAbilityScore: number;
  estimatedHoldScore: number;
  estimatedSatisfactionScore: number;
  scoreDeltaFromYesterday: number;
  activeOpportunityCount: number;
  offerOpportunityCount: number;
  closedDealCount: number;
  keyEventIds: string[];
  summary: string;
  createdAt: string;
};
```

实现口径：

- 每日要存的是“趋势判断和复盘摘要”，不是最终榜单成绩。
- `offerOpportunityCount` 表示已到机会主线末段、等待成交评估的机会数。
- `closedDealCount` 是当天或截至当日的正式成交数，具体口径在同一实现里必须固定，但不能拿它替代 `RunResult`。

---

## 4. RunResult 与排行榜最小字段合同

`RunResult` 只表达“这局正式结算后的结果”，最小字段如下：

```ts
type RunResult = {
  runId: string;
  workspaceId: string;
  accountId: string;
  playerProfileId: string;
  difficultyTierId: string;
  finishedAt: string;
  isQualifiedForLeaderboard: boolean;
  totalScore: number;
  abilityScore: number;
  holdScore: number;
  satisfactionScore: number;
  soldCount: number;
  holdCount: number;
  lostListingCount: number;
  lostCustomerCount: number;
  resultTitle: string;
  resultSummary: string;
  highlightTags: string[];
};
```

`LeaderboardEntry` 只读正式结果或生涯聚合：

- 总分榜读 `PlayerCareerStats.effectiveCareerTotalScore`
- 单局最高榜读 `RunResult.totalScore`
- 局数榜读 `PlayerCareerStats.completedRunCount`

硬规则：

- 排行榜不能直接读 `DailyRunSnapshot`
- 排行榜不能直接读 `GameRunSave`
- 每日估分只能用于过程反馈、趋势图、日复盘

---

## 5. 物理表与 legacy 桥接

第一版物理落库可以保留历史 `maintainer_*` / 本地 `userId` 作为迁移桥，但必须显式标成 legacy：

- 只能用于旧数据兼容、回填映射、灰度迁移
- 不能继续充当 canonical 主键
- 新主链一律归到：
  - `account_id`
  - `player_profile_id`
  - `run_id`

如果某处文档需要提旧名，推荐写法：

```text
legacy maintainer_user_id -> bridge to account_id / player_profile_id
```

不要再写成新的正式模型字段。
