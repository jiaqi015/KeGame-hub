# 平台账号、玩家、局、得分、总分数据架构

最后更新：2026-04-19

这份文档回答 5 个问题：

1. 平台账号是什么。
2. 玩家是什么。
3. 一局是什么。
4. 每日得分、单局总分、生涯总分分别是什么。
5. 账号体系和游戏体系要不要解耦。

---

## 0. 一句话结论

要解耦，而且必须解耦。

最稳的结构是：

```text
账号体系
  负责登录、身份、会话、权限

玩家体系
  负责某个游戏 / workspace 下的生涯身份和长期统计

局体系
  负责某一局的运行态、每日快照、最终结果

榜单体系
  只消费正式结算结果，不直接读运行态
```

换句话说：

> 账号是“你是谁”，玩家是“你在这个游戏里是谁”，局是“你这把打成了什么样”，榜单是“你长期和别人比怎样”。

---

## 1. 先说当前状态：现在算“部分设计好了”

### 1.1 已经有的

现在项目里已经有这些基础：

- 邮箱登录 / 白名单 / 权限
- 用户昵称
- workspace 访问权限
- selling-houses 的 run 存储
- run leaderboard
- final result / score / rankTitle 这类结果字段

从文档上，也已经基本讲清楚了：

- canonical 主名已经收口到
  `Account / PlayerProfile / GameRun / DailyRunSnapshot / RunResult / PlayerCareerStats / LeaderboardEntry`
- 每日预估分和最终分的区别
- 游戏层和局内层的边界

这里要明确：

- 旧 `User*` 只作为历史别名，不再作为主模型名继续扩写

### 1.2 还没真正统一好的

但从“数据架构”角度看，还没有完全收口。

当前代码里有一个明显问题：

1. 账号登录走的是 `lib/auth.ts`
2. selling-houses run 存储用的是浏览器本地生成的 `userId`

也就是说：

```text
认证用户
  email / nickname / allowedWorkspaces

游戏存档用户
  localStorage 里的 maintainer userId
```

这两套身份现在还不是同一个主键体系。

所以我的判断是：

> 方向已经对了，但“账号 -> 玩家 -> 局 -> 结果 -> 榜单”这条数据链，还没有被明确建模成一套统一结构。

---

## 2. 为什么一定要解耦

如果不解耦，后面一定会出 6 个问题。

### 2.1 一个账号玩多个游戏会乱

你现在已经不是单游戏项目了。

后面至少会有：

- `pk`
- `openday`
- `seller`
- 未来还可能有新的 workspace

如果账号和游戏数据绑死：

- 一个游戏改字段，会影响别的游戏
- 权限、昵称、局存档、排行榜会搅在一起

### 2.2 登录方式变化会污染游戏数据

以后你可能会有：

- 邮箱验证码登录
- 白名单免验证码
- 管理员代登
- 企业 SSO

这些都属于账号体系。

如果 run、score、排行榜直接吃登录结构，以后换登录方式就会动游戏表。

### 2.3 权限变化不应该改历史成绩

一个人今天有 `seller` 权限，明天没有。

这不应该影响他之前打过的局、历史成绩和排行榜归档。

所以：

- 权限是账号级、时点性的
- 成绩是游戏级、历史性的

必须分开。

### 2.4 昵称 / 展示名可能变化

用户昵称以后可能允许改。

如果 run 和 leaderboard 只存 display name，不存稳定 accountId，就会出现：

- 历史成绩找不回
- 换昵称后榜单归属混乱

### 2.5 不同游戏的玩家身份可能不同

一个账号在不同游戏里，玩家身份可以不同。

比如：

- 在 `seller` 里是“资产顾问”
- 在 `openday` 里是“开放日操盘手”
- 在未来其他游戏里可能是“商圈经营者”

这说明“账号”不等于“玩家角色”。

### 2.6 排行榜只能吃结算结果

排行榜是游戏层，不是认证层。

如果榜单直接从 session 或登录用户信息派生，会非常脆弱。

---

## 3. 四层数据模型

我建议整个系统固定成四层。

```text
L1 账号身份层
L2 玩家生涯层
L3 局运行层
L4 结果与榜单层
```

---

## 4. L1 账号身份层

账号层只回答：

> 这个人是谁，怎么登录，有什么权限。

建议对象：

### 4.1 Account

平台级主账号。

```ts
type Account = {
  accountId: string;
  primaryEmail: string;
  nickname: string;
  displayName: string;
  status: 'active' | 'disabled';
  createdAt: string;
  lastLoginAt?: string;
};
```

### 4.2 AccountIdentity

登录身份源。

```ts
type AccountIdentity = {
  identityId: string;
  accountId: string;
  identityType: 'email';
  identityValue: string;
  verifiedAt?: string;
  isPrimary: boolean;
};
```

第一版只有邮箱也没关系，先把层次留出来。

### 4.3 AccountSession

会话。

```ts
type AccountSession = {
  sessionId: string;
  accountId: string;
  sessionTokenHash: string;
  source: 'email-code' | 'trusted-bypass' | 'activation-key';
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
};
```

### 4.4 AccountWorkspaceGrant

账号对 workspace 的权限。

```ts
type AccountWorkspaceGrant = {
  grantId: string;
  accountId: string;
  workspaceId: string;
  accessLevel: 'enabled';
  grantSource: 'activation-key' | 'whitelist' | 'admin';
  grantCode: string;
  grantedAt: string;
  revokedAt?: string;
};
```

注意：

> 激活 key / all / 白名单，都应该只落在 grant，不要直接写进 run。

---

## 5. L2 玩家生涯层

玩家层回答：

> 这个账号在某个游戏里，以什么身份玩，长期成绩怎样。

账号和玩家不要一对一写死。

更稳的是：

> 一个账号可以在多个 workspace 下有多个 player profile。

### 5.1 PlayerProfile

```ts
type PlayerProfile = {
  playerProfileId: string;
  accountId: string;
  workspaceId: string;
  roleCode: string;
  displayName: string;
  createdAt: string;
  archivedAt?: string;
};
```

例如：

```text
accountId = A1001
  -> seller / advisor-profile
  -> openday / operator-profile
  -> pk / analyst-profile
```

### 5.2 PlayerCareerStats

这是某个游戏里的长期统计。

```ts
type PlayerCareerStats = {
  statsId: string;
  playerProfileId: string;
  workspaceId: string;
  completedRunCount: number;
  qualifiedRunCount: number;
  bestSingleRunScore: number;
  effectiveCareerTotalScore: number;
  lifetimeSoldCount?: number;
  lifetimeHoldCount?: number;
  lifetimeLostListingCount?: number;
  lifetimeLostCustomerCount?: number;
  averageAbilityScore?: number;
  averageHoldScore?: number;
  averageSatisfactionScore?: number;
  updatedAt: string;
};
```

### 5.3 PlayerAchievement

```ts
type PlayerAchievement = {
  achievementRecordId: string;
  playerProfileId: string;
  workspaceId: string;
  achievementCode: string;
  unlockedAt: string;
};
```

---

## 6. L3 局运行层

局层回答：

> 某个玩家在某个游戏里开的这一局，现在打到哪了。

### 6.1 GameRun

`GameRun` 是运行主对象。

```ts
type GameRun = {
  runId: string;
  workspaceId: string;
  accountId: string;
  playerProfileId: string;
  scenarioId?: string;
  difficultyTierId: string;
  status: 'active' | 'finished' | 'abandoned';
  startedAt: string;
  finishedAt?: string;
  currentDay: number;
  currentEstimatedScore?: number;
  currentSaveVersion: number;
  latestSnapshotDay?: number;
};
```

这里要同时挂：

- `accountId`
- `playerProfileId`

原因：

- 用 `accountId` 方便全平台追人
- 用 `playerProfileId` 方便做 workspace 级统计

### 6.2 GameRunSave

如果你希望 save 和 run 主记录分开：

```ts
type GameRunSave = {
  runId: string;
  saveVersion: number;
  worldState: unknown;
  eventStore: unknown;
  matterState: unknown;
  updatedAt: string;
};
```

### 6.3 DailyRunSnapshot

每日快照已经有方向了，继续保留。

它属于局层，不属于生涯层。

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

最小合同解释：

- 这层存“每日趋势和复盘摘要”
- `offerOpportunityCount` 表示已到机会末段、等待成交评估的机会数
- `closedDealCount` 表示正式成交累计或当日成交数，但不替代最终 `RunResult`

---

## 7. L4 结果与榜单层

结果层回答：

> 这局最后得了多少分，长期总分是多少，榜上排第几。

### 7.1 RunResult

单局正式成绩。

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

最小合同解释：

- 这层才是正式结算结果
- 榜单读取 `RunResult` 或 `PlayerCareerStats`，不读取 `DailyRunSnapshot`

### 7.2 CareerTotalScore

这里必须强调：

> 生涯总分不是所有 daily score 相加，也不是所有 run score 暴力相加。

第一版建议：

```text
生涯有效总分 = 最好 20 局正式成绩之和
```

这样能避免刷局数直接碾压。

### 7.3 LeaderboardEntry

```ts
type LeaderboardEntry = {
  leaderboardEntryId: string;
  workspaceId: string;
  leaderboardType: 'career-total-score' | 'best-single-run' | 'completed-run-count';
  seasonId?: string;
  accountId: string;
  playerProfileId: string;
  displayName: string;
  scoreValue: number;
  rank?: number;
  calculatedAt: string;
};
```

---

## 8. 得分体系怎么拆

你问的“得分”和“总分”，至少要拆成 4 层。

### 8.1 日内 / 每日预估分

回答：

> 现在这局如果按当前局面看，大概打得怎样。

它服务：

- 玩家今日判断
- 每日反馈
- 复盘趋势

它不是正式成绩。

### 8.2 单局最终总分

回答：

> 这一局正式打成了多少分。

这是 `RunResult.totalScore`。

它由：

- `abilityScore`
- `holdScore`
- `satisfactionScore`

构成。

### 8.3 生涯有效总分

回答：

> 这个玩家长期最强的稳定输出有多高。

这是排行榜的“总分榜”基础。

建议取：

- 最佳 20 局
- 或有效局集合

不要直接累加全部 run。

### 8.4 榜单分数

回答：

> 这一张榜上，用哪个数字排。

不同榜不一样：

- 总分榜：`effectiveCareerTotalScore`
- 单局最高榜：`max(RunResult.totalScore)`
- 局数榜：`completedRunCount`

---

## 9. 账号体系和游戏体系到底怎么解耦

答案是：

> 强解耦，弱关联。

### 9.1 账号体系负责什么

只负责：

- 认证
- 会话
- 身份
- 权限
- workspace grant

账号体系不负责：

- 某一局的 world
- 某一局的 score
- 某一局的结果
- 某个榜单排序

### 9.2 游戏体系负责什么

只负责：

- player profile
- game run
- daily snapshot
- run result
- career stats
- leaderboard

游戏体系不负责：

- 发验证码
- session cookie
- 白名单解析
- 激活 key 校验

### 9.3 两者怎么连

只通过稳定外键连接：

```text
Account.accountId
  -> PlayerProfile.accountId
  -> GameRun.accountId
  -> RunResult.accountId
```

以及：

```text
PlayerProfile.playerProfileId
  -> GameRun.playerProfileId
  -> RunResult.playerProfileId
  -> CareerStats.playerProfileId
  -> LeaderboardEntry.playerProfileId
```

### 9.4 不该怎么连

不要这样：

- 用 email 当 run 外键
- 用 nickname 当榜单主键
- 用 activationKey 直接标记 run
- 用 session token 关联存档

这些都不稳定。

---

## 10. 结合当前代码，最该先修什么

现在最明显的问题是：

> selling-houses run 的 `userId` 还是浏览器本地生成的，不是平台账号主键。

这会导致：

- 同一个邮箱换浏览器像新用户
- 账号历史和 run 历史不一定能并起来
- 排行榜用户归并不稳

第一步建议改成：

1. 登录成功后拿到稳定 `accountId`
2. `PlayerProfile` 按 `accountId + workspaceId` 获取或创建
3. `GameRun` 存 `accountId + playerProfileId`
4. 榜单只看 `RunResult`

---

## 11. 第一版建议数据关系

可以先收成下面这条链：

```text
Account
  -> AccountIdentity
  -> AccountWorkspaceGrant

Account
  -> PlayerProfile(workspace)
    -> PlayerCareerStats
    -> PlayerAchievement

PlayerProfile
  -> GameRun
    -> DailyRunSnapshot[]
    -> GameRunSave
    -> RunResult

RunResult
  -> CareerStats Aggregation
  -> LeaderboardEntry
```

---

## 12. 第一版表级建议

如果你现在就要开始落库，第一版建议至少有这些表：

### 平台层

- `accounts`
- `account_identities`
- `account_sessions`
- `account_workspace_grants`

### 游戏层

- `player_profiles`
- `player_career_stats`
- `player_achievements`

### 局层

- `game_runs`
- `game_run_saves`
- `daily_run_snapshots`
- `run_results`

### 榜单层

- `leaderboard_entries`

---

## 13. 开发前最后判断

所以如果你问：

> 玩家、局、得分、总分，数据架构设计好了么？

我的答案是：

> 设计方向已经基本对了，但还没有彻底“库级收口”。

尤其这 4 件事还需要正式定死：

1. 平台 `accountId` 要成为稳定主键。
2. `PlayerProfile` 要从账号层里拆出来。
3. `DailyRunSnapshot`、`RunResult`、`CareerStats` 要彻底分层。
4. 排行榜只能消费 `RunResult` / `CareerStats`，不能碰运行态。

如果你再问：

> 账号体系和游戏体系需要解耦么？

我的答案是：

> 需要，而且这是多游戏平台能不能长期稳住的关键边界。

---

## 14. 最后一句

账号体系解决的是“这个人能不能进来”。

游戏体系解决的是“这个人在游戏里打成了什么样”。

这两件事必须握手，但不能缠死。
