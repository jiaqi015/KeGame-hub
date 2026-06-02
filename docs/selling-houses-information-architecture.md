# 卖房 Big World 信息架构合同

最后整理：2026-05-15

这份文档定义当前产品面怎么消费 Big World。旧版页面细稿、页面职责矩阵和“第一版界面建议”已经清理；当前重点不是画更多页面，而是保证每个 UI 判断都接在 source → causal → actor knowledge → decision → receipt → replay 主链上。

当前实现的更强约束是：页面只能消费 evidence-backed world state 的解释结果，不能把 display fallback、legacy compatibility 或局部聚合误当成事实本身。

## 1. 信息架构原则

1. 页面按玩家判断组织，不按数据库表组织。
2. 底层世界可以很大，但 UI 只展示 actor-visible 的有限窗口。
3. 所有推荐、排序、风险、机会、总结都必须有 explanation envelope。
4. 任何产品面都不能偷读 hidden GlobalTruth。
5. 任何 UI fallback 都必须标明只是展示兜底，不能冒充 evidence-backed judgment。

## 2. 当前产品面

| 产品面 | 负责回答 | 必须读什么 |
| --- | --- | --- |
| `workspace shell` | 今天的全局主语和跨页提醒 | live causal refs、actor knowledge、receipt-backed cues |
| `workbench / dashboard` | 今天先处理什么 | belief、pressure、available command、bounded matter window |
| `listing detail` | 这套房怎么打 | owner belief、customer pool pressure、competition pressure、receipt history |
| `customer view` | 哪些客户值得推进 | customer knowledge、relation stage、intent / confidence pressure |
| `market radar` | 外部市场怎么变 | actor-visible market sources、market causal events、cell-level pressure |
| `person / chat detail` | 这个人为什么找我、下一步怎么处理 | person-aggregated sources、message causal refs、related listing links |
| `matter flow` | 这件事怎么推进 | available command、command preconditions、receipt result |
| `review / replay` | 为什么走成这样 | causal chain、commands、receipts、runtime feedback |
| `result` | 这一局最终表现如何 | closed deals、run result、score explanation、receipt-backed outcomes |
| `leaderboard / career` | 长期表现如何 | run result / career stats，不反写局内 world |

## 3. 页面主线

推荐阅读和使用顺序：

```text
Workbench
  → Listing / Customer / Market bounded window
  → Matter / Chat / Detail
  → Command
  → Receipt
  → Review / Result
```

玩家每天不应该面对全城表格，而应该看到“今天这个 broker POV 下最需要处理的一小片世界”。

## 4. Explanation Envelope

所有 UI 判断至少能回答：

```text
actorId
day
sourceRecordIds
causalEventIds
knowledgeRefs
belief
pressure
availableCommand
recommendedCommand
receiptRefs
confidence
```

没有这些字段的判断，只能是临时展示，不得作为架构完成证据。

## 5. 有界窗口

Five-X 世界规模很大，产品面必须有界：

- 房源页展示当前重点房源和 actor-visible candidate，不展示 4000+ listings。
- 客户页展示活跃关系和高价值潜客，不展示 21000+ demand units。
- 市场页展示与玩家房源有关的 hot / cold / pressure cells，不展示全城所有 micro cells。
- 竞品页展示当前房源相关的竞争关系，不展示全部 rival listings。
- 聊天详情按人聚合，再从人进入相关房源，不从消息直接跳全局房源详情。

## 6. 不同产品面的边界

### Workbench

负责分诊，不负责解释完整因果。

输出：

- 今日主线
- 紧急事项
- 可执行 command
- 风险和机会入口

### Listing Detail

负责单房决策，不负责全市场浏览。

输出：

- owner expectation
- customer pool
- competitive pressure
- market reasonable price
- available matters / commands
- receipt-backed timeline

### Customer View

负责关系推进，不负责替房源页做房源经营判断。

输出：

- customer intent
- confidence
- matching listings
- next command
- loss risk

### Market Radar

负责外因解释，不负责今日排程。

输出：

- market cell movement
- rival repricing
- demand shift
- supporting info
- affected listings

### Review / Result

负责因果和沉淀，不负责当前动作。

输出：

- source → causal → action → receipt timeline
- deal / lost / withdrawn outcomes
- score explanation
- replay anchor

## 7. UI 禁止事项

- 不从 UI 组件直接计算业务真相。
- 不把推荐文案写回 `GameState`。
- 不在页面里全量遍历 Five-X 世界。
- 不用“暂无竞品 / 暂无客户”掩盖底层世界没接入。
- 不用漂亮卡片掩盖 source / causal / receipt 缺失。
- 不把 hidden truth 的字段作为 broker POV 展示证据。

## 8. 验收口径

一个产品面算接好，必须满足：

1. 有明确 actor POV。
2. 有 bounded window。
3. 有 source / causal refs。
4. 有 belief / pressure。
5. 推荐动作来自 available command。
6. command 执行后有 receipt。
7. receipt 能反馈 runtime。
8. review / replay 能复现判断链。
