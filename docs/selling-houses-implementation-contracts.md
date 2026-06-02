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

补充边界：

```ts
type OpportunityLifecycleStatus =
  | 'active'
  | 'stagnated'
  | 'lost'
  | 'closed_by_deal'
  | 'closed_by_case';
```

实现口径：

- `stage` 只讲推进主线，只到 `offer`。
- `lifecycleStatus` 讲这条关系是否仍在推进、是否停滞、是否因为成交或房源结束而关闭。
- legacy `status = 'won' | 'closed'` 只允许存在于兼容层，新的 domain 口径应映射为：
  - `won -> closed_by_deal`
  - `closed -> closed_by_case`

---

## 1.5 Matter canonical

`Matter` 第一版至少要固定下面三个字段维度：

```ts
type MatterScene =
  | 'showing'
  | 'open_house'
  | 'valuation'
  | 'listing_prep'
  | 'client_call'
  | 'negotiation'
  | 'report_to_owner'
  | 'closing_prep'
  | 'diagnose'
  | 'co_selling'
  | 'risk_followup';
```

实现口径：

- `scene` 说明“这是什么业务事”。
- `template` 说明“用什么交互方式处理”。
- `presentation` 说明“显示成卡片、详情页还是专屏”。
- `report / diagnose / execute / negotiate` 是 Matter 专题文档里的生命周期分类，不是当前 `template` 字段枚举。
- `ClosedDealRecord` 不是 Matter；Matter 最多推进到成交前准备或收口动作。

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

## 4.5 当前已落地的成交事实最小字段

当前代码里，`ClosedDealRecord` 已经至少固定到下面这组字段：

当前实现口径要强调的是：`ClosedDealRecord` 不是签约真因，而是签约后的事实镜像与结算载体。真正决定能否签约的是 canonical evidence 经过 `PriceConsensusProof` 汇聚后是否成立，然后才写入 `ContractFact`。

```ts
type ClosedDealRecord = {
  dealId: string;
  caseId: string;
  customerId: string;
  sourceRelationId: string;
  opportunityId: string; // legacy alias
  dayIndex: number;
  day: number; // legacy alias
  closedAt: string;
  dealType: 'self_closed' | 'internal_cosale_closed' | 'external_competitor_closed' | 'platform_matched_closed';
  dealPrice: number;
  price: number; // legacy alias
  closeReadiness: number;
  closeProbability: number;
  blockingReasons: string[];
  supportingReasons: string[];
};
```

实现口径：

- `sourceRelationId` 是 canonical，表示成交来自哪条客户-房源关系。
- `opportunityId`、`day`、`price` 只是兼容旧运行态和旧存档的 bridge 字段。
- `closedDeals / ClosedDealRecord[]` 才是正式成交事实的 canonical 来源。
- `auxiliaryStats.soldCount`、顶层 `soldCount` 只作为 legacy compatibility mirror 存在，允许桥接读取和回填，但不再作为主事实来源。
- 结果页、正式结算、仓储持久化、排行榜摘要都应优先读 `closedDeals`，不能再只信 `auxiliaryStats.soldCount`。
- 和当前实现对照时还要记住：正式签约是否成立，不再由 `closedDeals` 里的数值本身决定，而是由 canonical evidence 汇聚出的 `PriceConsensusProof` 和 `ContractFact` 决定；`ClosedDealRecord` 是结果镜像，不是签约真因。

---

## 5. 物理表与 legacy 桥接

第一版物理落库可以保留历史 `maintainer_*` / 本地 `userId` 作为迁移桥，但必须显式标成 legacy：

- 只能用于旧数据兼容、回填映射、灰度迁移
- 不能继续充当 canonical 主键
- authenticated session 链路中，客户端不应再把 `userId` 当必填 owner 传入；服务端应从 session `accountId` 推导兼容 owner
- activation-key 旧链路可以继续要求 legacy `userId`，但它只代表内部工具/旧存档兼容边界
- 类型边界必须拆开：
  - `MaintainerCreateRunRequest / MaintainerSaveRunRequest` 面向客户端请求，允许 session 省略 `userId`
  - `MaintainerCreateRunCommand / MaintainerSaveRunCommand` 面向仓储命令，必须已经有明确 `userId` 兼容 owner
- 新主链一律归到：
  - `account_id`
  - `player_profile_id`
  - `run_id`

如果某处文档需要提旧名，推荐写法：

```text
legacy maintainer_user_id -> bridge to account_id / player_profile_id
```

不要再写成新的正式模型字段。
