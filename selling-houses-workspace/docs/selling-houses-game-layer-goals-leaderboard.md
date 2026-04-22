# 卖房（资产顾问）游戏层目标、沉淀与排行榜架构

最后更新：2026-04-21

这份文档回答的是：

> 站在游戏层，玩家玩这个游戏的目标到底是什么；每打一局最后留下些什么；这些东西最后怎么汇总成排行榜。

这份文档不回答：

- 单局里某个客户怎么推进
- 某套房为什么热度上升
- 某个榜单页面长什么样

它只回答：

1. 玩家为什么持续玩
2. 跨局到底沉淀什么
3. 排行榜应该拿什么比

当前实现层 canonical 命名，以 [selling-houses-implementation-contracts.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-implementation-contracts.md) 和 [platform-account-player-run-score-architecture.md](/Users/jiaqi/Documents/开放日测算/docs/platform-account-player-run-score-architecture.md) 为准。

---

## 0. 一句话结论

这个游戏在游戏层最稳的闭环是：

```text
开一局
  -> 在指定难度和盘面里打出一局好结果
  -> 结算成 RunResult
  -> 沉淀到生涯档案
  -> 刷新个人纪录 / 生涯统计 / 排行榜
  -> 继续挑战更高质量的局
```

一句话理解：

- 局内追的是这一局打得好不好
- 游戏层追的是你是不是一个稳定的强顾问

所以游戏层不该沉淀“当前状态”，只该沉淀“历史结果”。

---

## 1. 玩家在游戏层的目标是什么

我建议拆成 3 层目标。

## 1.1 第一层：把这一局打好

这是最直接的目标。

玩家开一局，最关心的是：

- 这局最后总分高不高
- 三维打分好不好
- 核心盘有没有守住
- 业主最后满不满意
- 自己有没有打出一局体面的结果

这层目标由 `RunResult` 回答。

## 1.2 第二层：刷新自己的生涯纪录

玩家不只想“过这一局”，还会自然想：

- 我这把是不是个人最好
- 我有没有打出更高的单局分
- 我是不是第一次把某个高难度打明白
- 我在稳定性上是不是变强了

这层目标由：

- `PlayerCareerStats`
- `PlayerProgression`
- `PersonalBest`

来回答。

## 1.3 第三层：在同类玩家里证明自己

玩家长期会自然进入比较：

- 我的最好一局能排第几
- 我的持续发挥能排第几
- 我的投入强度有多高

这层目标由排行榜回答。

所以游戏层真正的长期目标不是“攒钱”或者“练级”，而是：

> 形成一个可比较、可复盘、可累计的顾问生涯成绩。

---

## 2. 游戏层最终沉淀什么

我建议把跨局沉淀固定成 5 类。

## 2.1 身份沉淀

回答：

> 这个人是谁。

建议放：

- `Account`
- `AccountIdentity`
- `AccountWorkspaceGrant`
- `PlayerProfile`

例如：

- 邮箱
- 昵称
- 白名单身份
- 可玩的项目

这类是账号事实，不是成绩。

## 2.2 结果沉淀

回答：

> 他打过哪些局，每局最后怎样。

建议放：

- `RunResultArchive`

每局至少沉淀这些摘要：

```ts
type RunResultArchive = {
  runId: string;
  accountId: string;
  playerProfileId: string;
  finishedAt: string;
  workspace: 'selling-houses';
  scenarioId?: string;
  difficultyTierId: string;
  totalScore: number;
  abilityScore: number;
  holdScore: number;
  satisfactionScore: number;
  soldCount: number;
  holdCount: number;
  lostListingCount: number;
  lostCustomerCount: number;
  caseEndingSummary: string[];
  highlightTags: string[];
};
```

这里沉淀的是结果摘要，不是整局 world。

## 2.3 统计沉淀

回答：

> 这个人长期打下来，整体表现怎么样。

建议放：

- `PlayerCareerStats`

建议长期统计这些：

- 总局数
- 完成局数
- 生涯有效总分
- 单局最高分
- 总成交数
- 总守盘数
- 总丢盘数
- 总丢客数
- 平均满意分
- 平均守盘分
- 高难度完成次数

这类字段都是跨局累计值。

## 2.4 荣誉沉淀

回答：

> 这个人有过哪些关键里程碑。

建议放：

- `PlayerProgression`
- `PlayerAchievement`

例如：

- 首次完成标准局
- 首次打进进阶局高分线
- 单局总分首次破 80
- 连续 5 局都守住核心盘
- 首次进入总榜前 100

这类沉淀的作用，是让玩家感觉“我在生涯上有前进”。

## 2.5 风格沉淀

回答：

> 这个人长期更像哪种顾问。

这类不要反过来驱动局内，只做档案和展示。

建议放：

- `CareerStyleProfile`

例如：

- 更擅长守盘
- 更擅长客户推进
- 更擅长高压局稳盘
- 更偏运营投放
- 更偏关系经营

这类可以由历史 `RunResult` 定期重算，不要手写死。

---

## 3. 什么绝不能沉淀到游戏层

下面这些只能留在局内层，局终最多做摘要：

- 当前精力
- 当前预算
- 当前某套房热度
- 当前业主信任
- 当前客户推进阶段
- 当前事项阶段
- 当前市场温度

原因很简单：

> 这些是“这局现在怎样”，不是“这个玩家长期怎样”。

如果把这些直接沉淀到游戏层，后面排行榜和局内世界会混层。

---

## 4. 游戏层的长期循环

从玩家体验上，我建议游戏层闭环固定成下面这条线：

```text
选难度 / 选局
  -> 打出一局结果
  -> 看结算
  -> 看自己有没有刷新纪录
  -> 看自己在榜上的位置
  -> 决定下一局要冲什么
```

也就是说，玩家下一局的动力主要来自 4 个东西：

1. 刷新单局最好成绩
2. 抬高自己的有效总分
3. 累积局数和资历
4. 解锁新的荣誉或更高难度信心

---

## 5. 排行榜应该比什么

你前面定过三个榜单，我建议保留，而且底层关系这样设计最稳：

1. `总分榜`
2. `单局最高榜`
3. `局数榜`

但要注意：

> 这三个榜单不能算成同一件事。

---

## 5.1 总分榜

### 页面上怎么理解

谁的生涯总成绩最强。

### 底层不建议直接用“所有局相加”

因为那样会有两个问题：

1. 纯刷局的人会天然碾压别人
2. 它会和局数榜高度重合

所以更稳的做法是：

> 总分榜 = 生涯有效总分榜

建议口径：

- 取玩家历史里最好的 `N` 局
- 或者取符合条件的有效局
- 再做累计

我更推荐先用：

> `生涯有效总分 = 个人最佳 20 局总分之和`

这样它表达的是：

- 你不只是偶尔打一把高分
- 你是真的能持续打出高质量局

### 建议字段

```ts
type CareerScoreSummary = {
  playerProfileId: string;
  qualifiedRunCount: number;
  effectiveTotalScore: number;
  countedRunIds: string[];
};
```

---

## 5.2 单局最高榜

### 页面上怎么理解

谁打出过最猛的一局。

### 底层口径

直接取：

> `bestSingleRunScore = max(RunResult.totalScore)`

这张榜单表达的是：

- 爆发力
- 上限
- 代表作

它和总分榜不同。

总分榜看稳定输出。
单局最高榜看个人峰值。

---

## 5.3 局数榜

### 页面上怎么理解

谁打得最多。

### 底层口径

建议只统计：

> `已完成局数`

不要把中途退出、未结算局算进去。

这样这张榜单表达的是：

- 参与深度
- 持续投入
- 生涯资历

它不是实力榜，但它有价值。

---

## 6. 三张榜单各自回答什么

这张表最关键。

| 榜单 | 回答的问题 | 本质看什么 | 适合沉淀什么感受 |
| ---- | ---- | ---- | ---- |
| 总分榜 | 谁长期最强 | 稳定高质量输出 | “我是稳定强者” |
| 单局最高榜 | 谁打出过神局 | 上限和爆发 | “我有代表作” |
| 局数榜 | 谁投入最多 | 持续参与和资历 | “我是老玩家” |

这样三张榜单就不会互相打架。

---

## 7. 排行榜 entry 应该怎么存

建议底层不要把三张榜写成一个通用数字字段。

而是明确区分榜单类型。

```ts
type LeaderboardType =
  | 'career-total-score'
  | 'best-single-run'
  | 'completed-run-count';

type LeaderboardEntry = {
  id: string;
  leaderboardType: LeaderboardType;
  accountId: string;
  playerProfileId: string;
  displayName: string;
  scoreValue: number;
  secondaryValue?: number;
  rank?: number;
  updatedAt: string;
  seasonId?: string;
  difficultyScope?: 'global' | string;
};
```

这样后面要扩榜也方便：

- 按难度分榜
- 按赛季分榜
- 按模式分榜

但现在页面上仍然只展示简单的：

- 昵称
- 数字

---

## 8. 结算后怎么汇总到榜单

建议链路固定成下面这样：

```text
World
  -> SettlementEngine
  -> RunResult
  -> RunResultArchive
  -> PlayerCareerStats / PlayerProgression
  -> LeaderboardAggregation
  -> LeaderboardEntry
```

这里要守住一条原则：

> 榜单只消费结算结果，不直接读局内运行态。

这样它才不会反过来污染世界模型。

---

## 9. 我建议给玩家最终展示的沉淀

如果从产品视角看，玩家每次打完，最值得给他看到的沉淀是 4 样：

1. `本局成绩`
   这局打得怎么样。
2. `生涯变化`
   哪些纪录被刷新了。
3. `榜单变化`
   哪张榜上升了多少。
4. `生涯标签`
   你越来越像哪类顾问。

这四样加起来，玩家会很清楚：

- 我这局值不值
- 我长期有没有变强
- 我在别人里面处于什么位置

---

## 10. 最后一句

游戏层最重要的，不是再造一套局内资源，而是把每一局的结果沉淀成一个越来越清晰的顾问生涯。

只有这样，排行榜才不是一个孤零零的页面，而是整个游戏长期动力的一部分。
