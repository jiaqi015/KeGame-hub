# 卖房 Big World Projection 合同

最后整理：2026-05-15

Projection 不是“把状态格式化给页面”，而是把 actor 可见的世界翻译成可解释、可执行、可重放的产品判断。

当前实现下，projection 必须严格服从 evidence-backed world state：它可以解释事实、组织事实、推荐动作，但不能替代事实来源本身，也不能把 legacy compatibility 结果包装成主真相。

## 1. Projection 的输入

Projection 只能读取：

- live causal refs
- actor knowledge
- belief
- pressure
- available commands
- receipts
- bounded runtime summaries
- run result / career stats（仅结果和榜单面）

当前实现口径下，Projection 更像是“世界事实的解释层”，不是事实源头；任何不能回指到 source / causal / receipt 的内容，只能算 display-only。

Projection 禁止读取：

- hidden GlobalTruth
- shadow demand 全量真相
- rival broker 内部策略
- 未进入 causal ledger 的 pending source
- 页面组件临时状态作为业务真相

## 2. ProjectionEnvelope

每个重要 UI 判断都要带 envelope：

```ts
type ProjectionEnvelope = {
  actorId: string;
  day: number;
  sourceRecordIds: string[];
  causalEventIds: string[];
  knowledgeRefs: string[];
  beliefRefs: string[];
  pressureRefs: string[];
  commandRefs: string[];
  receiptRefs: string[];
  confidence: number;
  fallback?: 'display-only' | 'legacy-compat';
};
```

没有 envelope 的内容，只能是辅助展示，不能作为产品决策。

## 3. 产品面输出

| Projection | 输出 | 必须证明 |
| --- | --- | --- |
| Workbench | 今日主线、紧急事项、推荐 command | 来自 belief / pressure / command |
| Listing detail | 单房 owner / customer / competition / market 判断 | refs 只来自 actor-visible chain |
| Customer view | 关系推进、流失风险、匹配房源 | 不偷看全量客户真相 |
| Market radar | hot / cold cells、价格/竞争变化 | source → causal 可追溯 |
| Person / chat | 按人聚合消息与下一步 | 可从人进入相关房源，不反过来乱跳 |
| Matter flow | command precondition、执行结果 | receipt 回灌 runtime |
| Review | 因果时间线 | source / command / receipt 串得起来 |
| Result | 成交、丢盘、分数 | outcome receipt / ClosedDealRecord 支撑 |
| Leaderboard | 跨局排名 | 只读 run result / career stats，不污染局内 world |

## 4. Bounded Window

Five-X 世界下 projection 必须有界：

- 房源：只展示玩家当前管辖、被 source 影响、或 actor-visible candidate。
- 客户：只展示活跃关系、高意向、将流失、或刚被 source 影响的客户。
- 市场：只展示相关 market cells 和 pressure ranking。
- 竞品：只展示与当前 listing / customer overlap 有关的竞争关系。
- 复盘：按 causal chain 展开，不按全量日志倒序堆砌。

## 5. Decision Projection

推荐动作必须满足：

```text
actor knowledge
  → belief
  → pressure
  → available command
  → ranked recommendation
  → explanation envelope
```

禁止：

- `if case.trust < 50 then recommend`
- `if heat > 80 then badge`
- `if legacy score high then top action`
- 无 command precondition 的推荐

## 6. Fallback 规则

允许 fallback，但必须诚实：

- `display-only`：只为界面不断裂，不作为成熟度证据。
- `legacy-compat`：旧字段兼容读取，必须有迁移计划或 gate 覆盖。

fallback 不能算 connected surface。

## 7. Cross-surface Reuse

同一 causal ref 应被多个产品面复用，例如：

- market pressure 同时影响 market radar、listing detail、workbench action。
- owner feedback 同时影响 listing detail、chat detail、review。
- action receipt 同时影响 matter flow、resource ledger、next-day recommendation。

如果每个页面各算各的，就不是 Big World projection。

## 8. Gate 要防什么

- projection null 被误判为成功。
- case inactive 导致跳过检查。
- envelope 只有空数组。
- causal refs 来自 synthetic fixture，不来自 live runtime。
- fallback 被算作 connected。
- product surface 只显示数据，没有 command / receipt / replay 链。

## 9. Definition of Done

一个 projection 面完成，必须满足：

1. actor POV 明确。
2. bounded window 明确。
3. source / causal refs 非空。
4. belief / pressure 非空。
5. 推荐动作有 command refs。
6. command 后有 receipt refs。
7. 至少一个 causal ref 能跨 surface 复用。
8. gate 能证明不是 hidden truth、legacy shortcut、UI fallback。
