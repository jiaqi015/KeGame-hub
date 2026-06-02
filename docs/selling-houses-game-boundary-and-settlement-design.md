# 卖房（资产顾问）游戏边界与结算机制设计

最后更新：2026-04-21

这份文档回答两个开发前必须讲清楚的问题：

1. 哪些属于“局内剧情 / 局内世界”，哪些属于“游戏层 / 跨局系统”。
2. 玩家能不能每天看到得分，每日怎么存，最后怎么正式结算。

当前实现层 canonical 命名，以 [selling-houses-implementation-contracts.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-implementation-contracts.md) 和 [platform-account-player-run-score-architecture.md](/Users/jiaqi/Documents/开放日测算/docs/platform-account-player-run-score-architecture.md) 为准：

- 平台账号主名是 `Account`
- workspace 内玩家身份主名是 `PlayerProfile`
- 跨局统计主名是 `PlayerCareerStats`
- `userId / UserStats` 只作为历史口径或兼容描述出现

---

## 0. 一句话结论

游戏要分成三套东西：

当前实现对这三套东西的要求比早期文档更严格：局内事实必须先进入 runtime / causal / receipt，再由结算层生成 `RunResult`、`LeaderboardEntry` 和其他跨局沉淀；页面只消费这些结果，不反写它们。

```text
游戏层
  账号、权限、开局、历史成绩、个人统计、排行榜

局内层
  当前这一局的世界、事件、剧情、人物关系、房源、客户、业主、市场变化

结算层
  每日预估分只服务局内判断和复盘
  局终 RunResult 才是正式成绩和排行榜依据
```

玩家可以每天看到自己的“当前预估分”和“三维趋势”。

但每天看到的分数不是最终成绩，不进入排行榜。

每天要存一份 `DailyRunSnapshot`，最后玩完后生成正式 `RunResult`。

---

## 1. 怎么分清“游戏层”和“局内剧情”

最简单的判断方法：

> 这个东西如果换一局还应该保留，就是游戏层；如果只属于当前这局，就是局内层。

再补一句：

> 会被日结推动变化的，基本都是局内层；只消费结算结果的，基本都是游戏层。

---

## 2. 游戏层是什么

游戏层回答的是：

> 这个账号是谁，它在某个 workspace 下对应哪个玩家身份，历史表现怎样，和别人比在哪。

游戏层包括：

- 平台账号 `Account`
- 邮箱身份
- 昵称
- 权限
- 白名单
- 可玩的 workspace
- 玩家身份 `PlayerProfile`
- 开局入口
- 难度选择
- 历史局列表
- 每局最终结果归档
- 生涯统计 `PlayerCareerStats`
- 个人最好成绩
- 成就
- 排行榜
- 赛季

这些东西不参与局内日结。

例如：

```text
yangjiaqi015 打过 12 局
最高单局 86 分
生涯有效总分 1420
排行榜第 18 名
```

这是游戏层。

它不会直接改变某一局里李女士要不要复看，也不会改变王先生愿不愿意降价。

---

## 3. 局内层是什么

局内层回答的是：

> 当前这一局里，真实世界发生了什么。

局内层包括：

- `GameRun`
- `World`
- 当前天数
- 当前难度配置
- 当前剧本
- 房源
- 业主
- 客户
- 经纪人
- 品牌 / ACN / 门店
- 商圈经理
- 竞品
- 市场状态
- 房源和业主关系
- 客户和房源机会
- 经纪人和客户关系
- 经纪人和业主关系
- Matter
- Event
- 新闻
- 昨日情报
- 日结摘要

局内层会被玩家动作和日结推动。

例如：

```text
第 7 天，李女士第二次看 A 房，并带了家人。
A 房机会从“看房后”推进到“二看后认真比较”。
王先生听完带看反馈后，价格松动度上升。
同小区 B 房降价，A 房竞品压力上升。
```

这是局内剧情。

它只属于这一局。

---

## 4. 局内剧情到底是什么

这里的“剧情”不是提前写死的一段故事。

它是世界运行后产生的事件链。

局内剧情来自：

- 玩家做了 Matter
- 客户推进或停滞
- 业主态度变化
- 房源热度变化
- 竞品上新、降价、成交
- 市场事件发生
- 同 ACN 联卖带来机会或丢盘风险
- 日结推动自然变化

所以局内剧情应该存成事件和事实，不要只存成一段文案。

推荐理解：

```text
Event 是剧情事实。
Projection 是剧情解释。
News / 昨日情报 是剧情摘要。
Log 是剧情流水。
```

再补一个：

```text
ClosedDealRecord 是正式成交事实。
CaseEnding 是局终总结解释。
```

### 4.1 属于局内剧情的例子

- 李女士参加开放日
- 王先生拒绝降价
- A 房新增 1 条后段机会
- B 房降价抢走客户
- 商圈周末到访上升
- 同 ACN 经纪人带客户看了你的房
- 业主同意周末开放日
- 客户出价低于业主心理价

### 4.2 不属于局内剧情的例子

- 用户首次登录
- 白名单授权
- 昵称生成
- 进入排行榜
- 生涯总局数加一
- 单局最高分刷新
- 解锁某个成就
- 历史局归档

这些属于游戏层。

---

## 5. 边界表

| 问题 | 属于哪里 | 原因 |
| ---- | ---- | ---- |
| 当前第几天 | 局内层 | 每局不同，只服务当前世界 |
| 今日精力 | 局内层 | 会被玩家动作消耗 |
| 推广金 | 局内层 | 是当前局资源 |
| A 房热度 | 局内层 | 当前局内房源状态 |
| 李女士是否复看 | 局内层 | 当前局机会状态 |
| 王先生是否愿意开放日 | 局内层 | 当前局业主关系 |
| 今日新闻 | 局内层投影 | 来自当前局事件 |
| 昨日情报 | 局内层投影 | 来自昨天日结和事件 |
| 当前预估分 | 局内层投影 | 只是当前局表现估计 |
| 每日快照 | 局内运行归档 | 用于复盘，不进排行榜 |
| 成交记录 | 局内事实 | 记录谁和谁成交、哪个组织成交 |
| 最终总分 | 结算层 | 局终正式结果 |
| RunResult | 游戏层沉淀 | 正式历史成绩 |
| 账号昵称 / 玩家展示名 | 游戏层 | 跨局身份与 workspace 内玩家身份 |
| 白名单权限 | 游戏层 | 账号级能力 |
| 生涯总分 | 游戏层 | 跨局统计 |
| 排行榜 | 游戏层 | 只看正式结算结果 |

---

## 6. 玩家每天能不能看到自己的得分

可以。

但要明确名字：

> 每天看到的是“当前预估分”，不是“最终得分”。

页面可以显示：

```text
当前预估：72
能力：28
守盘：24
满意：20
趋势：比昨日 +4
主要贡献：A 房二看推进、王先生价格松动
主要扣分风险：B 房降价导致客户流失风险上升
```

这会让玩家每天知道自己打得怎么样。

但它不能直接入榜。

原因：

1. 一局没结束，很多结果还没落地。
2. 今天高分，明天可能因为丢盘掉下来。
3. 提前入榜会让排行榜被未完成局污染。
4. 玩家需要的是经营方向感，不是每天正式排名。

---

## 7. 每日要存什么

每天日结后，建议存一份 `DailyRunSnapshot`。

它属于当前 `GameRun` 的过程记录，不属于正式历史成绩。

同时建议每天累积：

- `ClosedDealRecord[]`
- `DailyDealStatsProjection`

这样局内可以讲清楚：

- 今天成了几单
- 是自成交还是联卖
- 有没有丢盘丢客

```ts
type DailyRunSnapshot = {
  runId: string;
  dayIndex: number;
  dateLabel: string;
  estimatedTotalScore: number;
  estimatedAbilityScore: number;
  estimatedHoldScore: number;
  estimatedSatisfactionScore: number;
  scoreDeltaFromYesterday: number;
  scoreReasons: DailyScoreReason[];
  keyEvents: string[];
  progressedOpportunityCount: number;
  stagnatedOpportunityCount: number;
  improvedCaseCount: number;
  riskyCaseCount: number;
  ownerTrustChanges: DailyRelationChange[];
  customerOpportunityChanges: DailyRelationChange[];
  resourceUsage: {
    energySpent: number;
    marketingBudgetSpent: number;
    matterCompletedCount: number;
  };
  createdAt: string;
};

type DailyScoreReason = {
  direction: 'up' | 'down' | 'neutral';
  scoreArea: 'ability' | 'hold' | 'satisfaction';
  objectType: 'case' | 'owner' | 'customer' | 'market' | 'matter';
  objectId?: string;
  reason: string;
  relatedEventIds: string[];
};

type DailyRelationChange = {
  relationId: string;
  beforeLabel: string;
  afterLabel: string;
  relatedEventIds: string[];
};
```

每日快照解决三件事：

1. 让玩家每天知道“今天打得怎么样”。
2. 让复盘能回看“哪天开始变好 / 变坏”。
3. 让最终结算能解释“分数为什么是这样”。

---

## 8. 每日预估分怎么算

每日预估分不是重新发明一套评分。

它应该和最终结算共用同一套 `ScoreEvaluator`。

区别是：

- 每日预估：基于当前局面估算“如果现在收盘，大概表现怎样”。
- 最终结算：基于最终结局锁定“这局真实结果怎样”。

建议结构：

```text
World
  -> ScoreEvaluator
  -> DailyScoreEstimate
  -> DailyRunSnapshot
```

每日分数建议由三部分组成：

1. 能力预估
   看客户推进、Matter 质量、资源使用、机会承接。
2. 守盘预估
   看核心盘是否仍在主控、丢盘风险、竞品压力处理。
3. 满意预估
   看业主信任、沟通质量、价格预期管理、过程透明度。

注意：

> 每日分数要给方向感，不要制造假确定性。

所以页面上可以写：

```text
当前预估分 72，比昨日上升 4 分。
主要因为 A 房新增二看，王先生开始接受价格反馈。
但 B 房降价后，李女士仍有被拉走风险。
```

不要写：

```text
今日正式得分 72。
```

---

## 9. 最终结算机制是什么

最终结算只在一局结束时发生。

实现上要特别注意：正式结算不能只看页面上的“看起来像成交”，而要看真实的局内事实、event/casual chain、成交记录和 canonical proof。也就是说，结算层是对事实做归档，不是对界面做截图。

触发方式可以有三类：

1. 到达局内天数上限。
2. 所有核心房源都进入终局。
3. 玩家主动结束，但标记为提前收局。

正式结算链路：

```text
World
  -> SettlementEngine
  -> RunResult
  -> RunResultArchive
  -> PlayerCareerStats
  -> PersonalBest
  -> LeaderboardAggregation
  -> LeaderboardEntry
```

正式结算只消费：

- 最终 `World`
- 全量 `EventStore`
- 全量 `Matter` 结果
- 每日 `DailyRunSnapshot`
- 难度配置
- 剧本配置

正式结算不直接消费页面状态。

---

## 10. RunResult 应该包含什么

`RunResult` 是正式成绩。

它建议显式带上：

- `dealStats`
- `closedDeals`
- `lostListingCount`
- `lostCustomerCount`

这些字段都应该来自正式成交记录，不从机会阶段临时倒推。

建议字段：

```ts
type RunResult = {
  runId: string;
  accountId: string;
  playerProfileId: string;
  workspace: 'selling-houses';
  scenarioId?: string;
  difficultyTierId: string;
  startedAt: string;
  finishedAt: string;
  completedDayCount: number;
  finishReason: 'day-limit' | 'all-cases-ended' | 'manual-finish';
  isQualifiedForLeaderboard: boolean;

  totalScore: number;
  abilityScore: number;
  holdScore: number;
  satisfactionScore: number;

  soldCount: number;
  holdCount: number;
  dealStats: DealStatsProjection;
  closedDeals: ClosedDealRecord[];
  lostListingCount: number;
  lostCustomerCount: number;

  caseResults: CaseRunResult[];
  keyTurningPoints: string[];
  scoreReasons: FinalScoreReason[];
  dailyScoreTrend: {
    dayIndex: number;
    estimatedTotalScore: number;
  }[];

  resultTitle: string;
  resultSummary: string;
  highlightTags: string[];
};
```

### 10.1 是否有资格进榜

不是所有结束都应该进榜。

建议第一版规则：

- 正常打满局内天数：可入榜。
- 所有核心房源自然终局：可入榜。
- 玩家主动提前结束：可以归档，但默认不入榜。
- 调试局 / 测试局：不入榜。
- 缺少正式难度配置：不入榜。

---

## 11. 最终总分怎么组成

总分仍然坚持三维：

```text
总分 = 能力分 + 守盘分 + 满意分
```

### 11.1 能力分

看玩家有没有把局面推进好。

主要来自：

- 成交结果
- 后段机会推进
- 客户承接质量
- Matter 完成质量
- 资源使用效率
- 市场窗口把握
- 关键风险处理

### 11.2 守盘分

看玩家有没有守住自己的核心盘。

主要来自：

- 核心房源是否保住
- 是否被跨品牌成交
- 是否被同 ACN 其他人主导
- 丢盘次数
- 丢盘前是否已有预警但未处理
- 竞品压力处理质量

### 11.3 满意分

看业主过程体验和结果满意度。

主要来自：

- 业主信任变化
- 业主对市场理解是否提升
- 价格预期管理
- 沟通频率和质量
- 是否透明反馈
- 成交或未成交后的业主感受

---

## 12. 每日分和最终分的关系

每日分是过程仪表。

最终分是正式成绩。

两者关系类似：

```text
每日预估分
  看趋势、看风险、帮助玩家调整打法

最终结算分
  锁定结果、进入历史、刷新榜单
```

每日分可以被最终结算引用，用于解释：

- 哪一天开始变好
- 哪一天风险扩大
- 哪个 Matter 最值
- 哪个选择导致后面丢盘

但最终分不能简单等于每日分平均。

原因：

1. 卖房是结果型业务，最后有没有成交、守盘、满意非常重要。
2. 过程表现要算，但不能盖过结果。
3. 每日预估本来就可能随着局面变化而修正。

建议最终结算公式理解成：

```text
最终分 =
  终局结果分
  + 过程质量分
  + 风险处理分
  + 难度修正
  - 重大失误扣分
```

三维只是展示和归因维度，不必把公式暴露给玩家。

---

## 13. 信息架构应该怎么放

### 13.1 顶部状态条

显示当前预估，不显示正式成绩。

```text
第 7 天 / 剩余 8 天
精力 4 / 推广金 1200
当前预估 72 / 昨日 +4
```

### 13.2 经营概览

显示今日分数变化原因。

```text
昨日情报
  预估分 +4
  A 房二看推进 +3
  B 房降价带来风险 -1
  王先生价格松动 +2
```

### 13.3 复盘

显示每日趋势。

```text
分数趋势
Day 1 58
Day 2 61
Day 3 59
Day 4 66
Day 5 72
```

复盘要解释：

- 哪天是转折点
- 哪天开始掉分
- 哪个动作改变了走势

### 13.4 结果页

显示正式成绩。

```text
最终总分 84
能力 31 / 守盘 28 / 满意 25
个人最佳 +6
单局最高榜上升 12 名
```

### 13.5 排行榜

只显示正式结算后的成绩。

排行榜不展示每日预估分。

---

## 14. 开发前文档还需要检查什么

现在文档体系已经足够开始迭代，但开发前建议做 6 个检查。

### 14.1 字段归属检查

确认每个字段属于：

- 游戏层
- 局内层
- 投影层
- 结算层

不能出现一个字段既被日结写，又被排行榜写。

### 14.2 事件目录检查

确认第一版要支持哪些事件。

建议先收敛到：

- 客户看房
- 客户复看
- 客户出价
- 客户流失
- 业主反馈
- 业主松价
- 业主拒绝
- 房源曝光变化
- 竞品上新
- 竞品降价
- 竞品成交
- 开放日到访
- 同 ACN 带看
- 丢盘

不要第一版就做全量事件。

### 14.3 Matter 模板检查

确认第一版 Matter 不超过 8-12 个。

每个 Matter 要写清：

- 谁发起
- 作用对象
- 消耗什么
- 成功条件
- 失败条件
- 产生哪些事件
- 影响哪些关系
- 对每日分可能有什么影响

### 14.4 日结顺序检查

确认每日计算顺序已经能支持：

- 白天动作即时反馈
- 晚上统一日结
- 每日预估分
- 每日快照
- 次日提醒

### 14.5 结算口径检查

确认 `SettlementEngine` 和 `ScoreEvaluator` 不分裂。

每日预估和最终结算应该共用评分语义。

不能出现：

- 每日分说打得很好
- 最终分却完全解释不了为什么不好

### 14.6 页面闭环检查

确认页面能回答 5 个问题：

1. 今天先做什么？
2. 这套房怎么打？
3. 哪个客户机会值得推？
4. 外部市场哪里变了？
5. 这局为什么得这个分？

如果页面回答不了第 5 个问题，说明事件、快照和结算还没闭环。

---

## 15. 第一版建议怎么落地

第一版不要追求所有榜单和所有细节都完美。

建议按这个顺序：

1. 先实现 `GameRun` 和 `World` 边界。
2. 实现少量 Matter 和事件。
3. 实现 `advanceDay()`。
4. 日结后生成 `DailyRunSnapshot`。
5. 页面顶部显示当前预估分。
6. 复盘页显示每日趋势和关键事件。
7. 局终生成 `RunResult`。
8. 用 `RunResult` 更新三张榜。

这条线跑通后，游戏就有完整闭环：

```text
开局
  -> 经营
  -> 日结
  -> 每日预估
  -> 复盘
  -> 最终结算
  -> 排行榜
```

---

## 16. 最后一句

每日分是玩家的仪表盘。

最终分才是玩家的成绩单。

局内剧情是这一局发生的事。

游戏层是玩家玩过以后留下的成绩和身份。

这四个边界守住，开发时就不容易把世界、页面、结算、排行榜搅在一起。
