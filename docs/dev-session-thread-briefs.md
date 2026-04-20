# 并行线程任务入口（3 线程版）

最后更新：2026-04-20

总控文档：

- [卖房工作台 4 小时并行开发总控计划](/Users/jiaqi/Documents/开放日测算/docs/dev-session-selling-houses-2026-04-19.md)
- [卖房工作台代码审计与偏差清单](/Users/jiaqi/Documents/开放日测算/docs/dev-session-selling-houses-gap-audit-2026-04-20.md)

这份 brief 是给 3 个子线程直接开工用的。
所有线程先读总控文档，再读自己这一节。不要扩大 scope。

---

## 统一前置阅读

所有线程必须先读：

- [`.impeccable.md`](/Users/jiaqi/Documents/开放日测算/.impeccable.md)
- [`docs/dev-session-selling-houses-2026-04-19.md`](/Users/jiaqi/Documents/开放日测算/docs/dev-session-selling-houses-2026-04-19.md)
- [`docs/dev-session-selling-houses-gap-audit-2026-04-20.md`](/Users/jiaqi/Documents/开放日测算/docs/dev-session-selling-houses-gap-audit-2026-04-20.md)
- [`docs/selling-houses-total-design.md`](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-total-design.md)
- [`docs/selling-houses-information-architecture.md`](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-information-architecture.md)
- [`docs/selling-houses-interface-detail-design.md`](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-interface-detail-design.md)
- [`docs/selling-houses-projection-architecture.md`](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-projection-architecture.md)

---

## 统一执行原则

- 先判断自己在改哪一层，再动手。
- 不要把页面需求顺手写进 `GameState`。
- 不要把 projection 文案写成世界真相。
- 不要把后端契约为了页面方便顺手改掉。
- 不要碰 `.env*`、`.vercel/`、认证主逻辑。
- 不要动别的线程 ownership 文件。
- 页面文案要业务化、真实化、短句化，不要抽象模型味。
- 这轮默认 `useGame.ts` 是高风险区，除非总线程明确批准，否则不要碰。
- 这轮默认 `cloudState.ts`、`cloudClient.ts`、`interfaces/http/*`、`infrastructure/*` 是冻结区。
- 直接跑脚本时优先用 `npm run ...` 或 `npm exec tsx ...`，不要假设 `tsx` 在 PATH。

本轮默认规则：

- L1 前端表现层：可以大改。
- L2 应用投影层：可以补强。
- L3 局运行层：只做小修。
- L4 持久化与接口层：冻结。
- L5 纯后端能力层：只做设计，不做大迁移。

---

## 线程 T1：壳层接缝与 Projection

### 目标

把卖房页面真正需要的“喂数层”收进 projection 和轻量编排里，减少页面内业务判断。

必须回答：

1. 哪些数据是世界真相。
2. 哪些只是页面投影。
3. Dashboard / Opportunities / Market / Review / Result 分别读什么。
4. 壳层和 feature 的接缝怎么更稳定。

### 负责文件

- `src/selling-houses/application/projections/*`
- `src/selling-houses/ui/features/followUpPriority.ts`
- `src/selling-houses/ui/features/marketIntel.ts`
- 如总线程批准，可少量改 `src/selling-houses/SellingHousesWorkspace.tsx`

### 禁止修改

- `src/selling-houses/domain/models.ts`
- `src/selling-houses/interfaces/http/*`
- `src/selling-houses/infrastructure/*`
- `lib/auth.ts`
- `.env*`
- `.vercel/*`

### 设计要求

- projection 只读 `GameState`，不能反写。
- 命名要清楚。
- 不做“大一统巨型 selector”。
- 如果现有数据不够，先返回保守空态，不新增 domain 字段。

### 验收

- 新增或整理的 projection 有明确输入输出。
- 组件中的 raw state 判断减少。
- `npm run lint` 通过。
- 不破坏 `npm run verify:maintainer`。
- 如涉及 projection 结构，补跑：`npm exec tsx scripts/verify-selling-houses-projections.ts`

### 开工提示词

```text
你是线程 T1：壳层接缝与 Projection。先读 docs/dev-session-selling-houses-2026-04-19.md、docs/dev-session-selling-houses-gap-audit-2026-04-20.md、.impeccable.md、selling-houses-projection-architecture.md、selling-houses-game-boundary-and-settlement-design.md。只改 application/projections/*、followUpPriority.ts、marketIntel.ts；如总线程批准再少量改 SellingHousesWorkspace.tsx 接缝。目标是把页面真正要吃的摘要、排序、建议、分组收进 projection，不反写世界真相。不要改 domain/models、interfaces/http、infrastructure、auth、env、Vercel 配置。做完回复：改了哪些文件、实现了什么、没有做什么、怎么验收、已知风险。
```

补充：

- T1 是先发线程，目标是先把接缝立住，再让 T2/T3 开工。
- 如果需要改 `SellingHousesWorkspace.tsx`，只改壳层接缝，不改业务语义。

---

## 线程 T2：经营概览 + 房源 + 客户

### 目标

把玩家最常停留的主战场页面收成“经营判断页面”，不是后台页面。

必须回答：

1. 今天先处理什么。
2. 这套房现在主矛盾是什么。
3. 业主状态如何影响这套房。
4. 客户池厚不厚。
5. 哪些是见面机会，哪些只是潜在人群。

### 负责文件

- `src/selling-houses/ui/features/Dashboard.tsx`
- `src/selling-houses/ui/features/Cases.tsx`
- `src/selling-houses/ui/features/Opportunities.tsx`

### 禁止修改

- `src/selling-houses/domain/models.ts`
- `src/selling-houses/interfaces/http/*`
- `src/selling-houses/infrastructure/*`
- `src/selling-houses/application/useGame.ts`
- `lib/auth.ts`
- `.env*`
- `.vercel/*`

### 设计要求

- Dashboard 要有真实经营台气质。
- Cases 要围绕“房源主线 + 业主 + 准客池 + 事项”。
- Opportunities 要严格区分客户画像、客户状态、机会状态。
- 不做 CRM 大列表。

### 验收

- Dashboard 能回答“今天先做什么”。
- Cases 能回答“这套房怎么打”。
- Opportunities 能分清见面机会和潜在人群。
- `npm run lint` 通过。
- 不新增对 `useGame.ts`、`domain/models.ts` 的依赖耦合。

### 开工提示词

```text
你是线程 T2：经营概览 + 房源 + 客户。先读 docs/dev-session-selling-houses-2026-04-19.md、docs/dev-session-selling-houses-gap-audit-2026-04-20.md、.impeccable.md、selling-houses-information-architecture.md、selling-houses-interface-detail-design.md、selling-houses-customer-opportunity-architecture.md。只改 Dashboard.tsx、Cases.tsx、Opportunities.tsx。目标是把经营概览、房源、客户收成真实经营判断页面。不要改 domain/models、useGame、interfaces/http、infrastructure、auth、env、Vercel 配置。做完回复：改了哪些文件、实现了什么、没有做什么、怎么验收、已知风险。
```

补充：

- T2 在 T1 把 projection 接缝立住后再开工。
- 尽量把判断留在 projection 输入，不要在页面里新发明 selector。

---

## 线程 T3：市场 + 复盘 + 结果 + 排行榜

### 目标

把卖房工作台的“后判断面”收成一个清楚的闭环。

必须回答：

1. 市场怎么从全局看。
2. 复盘怎么讲关键转折。
3. 结果页怎么明确“正式结算”。
4. 排行榜怎么站稳游戏层边界。

### 负责文件

- `src/selling-houses/ui/features/Market.tsx`
- `src/selling-houses/ui/features/Review.tsx`
- `src/selling-houses/ui/features/ResultOverlay.tsx`
- `src/selling-houses/ui/features/LeaderboardOverlay.tsx`

### 禁止修改

- `src/selling-houses/domain/models.ts`
- `src/selling-houses/interfaces/http/*`
- `src/selling-houses/infrastructure/*`
- `src/selling-houses/application/useGame.ts`
- `lib/auth.ts`
- `.env*`
- `.vercel/*`

### 设计要求

- 市场雷达是全局入口，不是小组件。
- 复盘页优先关键转折，不做流水堆叠。
- 结果页只消费正式结算。
- 排行榜必须真实绑定现有榜单数据，空态说人话。

### 验收

- 市场页有全局雷达感。
- 复盘页更像关键转折页。
- 结果 / 排行榜不混淆局内与跨局。
- `npm run lint` 通过。
- 如改动结果或排行榜表达，合并前补看一次正式结算边界文案。

### 开工提示词

```text
你是线程 T3：市场 + 复盘 + 结果 + 排行榜。先读 docs/dev-session-selling-houses-2026-04-19.md、docs/dev-session-selling-houses-gap-audit-2026-04-20.md、.impeccable.md、selling-houses-market-event-matrix.md、selling-houses-game-boundary-and-settlement-design.md、selling-houses-game-layer-goals-leaderboard.md、selling-houses-information-architecture.md。只改 Market.tsx、Review.tsx、ResultOverlay.tsx、LeaderboardOverlay.tsx。目标是把市场、复盘、结果、排行榜收成一个清楚的游戏闭环。不要改 domain/models、useGame、interfaces/http、infrastructure、auth、env、Vercel 配置。做完回复：改了哪些文件、实现了什么、没有做什么、怎么验收、已知风险。
```

补充：

- T3 也在 T1 稳定后再开工。
- 不要把跨局榜单表达写回局内状态。

---

## 总线程收口格式

子线程交付后，总线程按这个格式审：

```text
线程：
收到的改动：
是否越界：
CR 结论：
需要修正：
已跑校验：
是否可合：
```

最终总线程输出：

```text
本轮完成：
没有完成：
校验结果：
本地预演结果：
preview 状态：
下一轮 TODO：
```

---

## 推荐起线程顺序

1. 主线程先锁边界，重跑最小基线。
2. 先开 T1。
3. T1 接缝稳定后，再同时开 T2、T3。
4. 合并顺序固定：T1 -> T2 -> T3。

这样能把互相踩文件和口径漂移降到最低。
