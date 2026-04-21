# 平台深一层对齐审计（2026-04-21）

这份文档承接：

- [平台审计与第一轮改造总控](/Users/jiaqi/Documents/开放日测算/docs/dev-session-platform-audit-2026-04-21.md)

目标不是重复 Phase 0/1，而是把第一轮改造后的“当前实现到底已经收到哪、还差哪”再写细一层。

---

## 1. 当前已收口的点

### 1.1 workspace 注册已基本契合设计

当前代码：

- `src/workspaces/workspaceRegistry.tsx`
- `lib/workspaces.ts`

结论：

- workspace slug、标题、描述、排序、权限码已经从 registry 驱动
- 入口不再是最初三块写死状态

### 1.2 selling-houses 身份链已完成第二轮收口

当前代码：

- `src/selling-houses/application/playerContext.ts`
- `src/selling-houses/application/cloudState.ts`
- `src/selling-houses/application/useGame.ts`
- `src/selling-houses/interfaces/http/maintainerRunHandlers.ts`
- `src/selling-houses/infrastructure/fileMaintainerRunRepository.ts`
- `src/selling-houses/infrastructure/neonGameRunRepository.ts`
- `src/selling-houses/infrastructure/neonGameDatabase.ts`

当前口径：

- `storageScopeKey`：本地存档和 local/cloud meta 的作用域
- `accountId`：已登录场景下的优先 run owner
- `playerProfileId`：selling-houses workspace 内的长期玩家身份
- legacy `userId`：仍是兼容字段名；session 场景可以由服务端用 `accountId` 推导，客户端不再必须传；activation-key 旧链路下保留客户端 legacy owner

建议记忆口径直接固定成下面这张速查表：

```text
storageScopeKey
  只负责浏览器侧 localStorage / cloud meta 作用域

accountId
  平台账号主键；已登录场景下的 canonical run owner

playerProfileId
  selling-houses workspace 内的长期玩家身份主键

legacy userId
  兼容桥字段名；只用于旧 activation-key / 旧存档 / 旧仓储条件
```

这意味着：

- 当前实现已经不再把“storage 作用域”和“正式运行 owner”混成一件事
- session 客户端 create/save/get/list 已可省略兼容 `userId`，由 handler 统一按 session `accountId` 收口
- 请求类型与仓储命令类型已拆分：客户端 request 可省略 `userId`，repo command 仍必须有明确 owner
- `playerProfileId` 已进入 create/save command、HTTP normalize、文件仓库、Neon run 表和 leaderboard 表
- 排行榜聚合 owner 已优先按 `accountId -> playerProfileId -> legacy userId` 收口
- 但 `maintainer_*` 表与 repo contract 仍保留 `userId` 作为兼容字段名，还没有完成最终物理命名迁移

### 1.3 open-day server/serverless 主链已补齐一处关键缺口

当前代码：

- `api/open-day-disambiguate.ts`

结论：

- `/api/open-day-disambiguate` 已补成 serverless 入口
- open-day 本地 server 与 serverless 主链一致性往前走了一步

### 1.4 工程 smoke 入口已形成

当前代码：

- `package.json`
- `scripts/verify-platform-smoke.ts`
- `scripts/send-smtp-test.ts`

结论：

- 现在已经有统一的 `verify:platform-smoke`
- SMTP 默认不再真实发信

---

## 2. 当前仍然明确存在的差距

### 2.1 `PlayerProfile` 已进入主链，但仍未完成最终表级命名迁移

设计要求：

- `Account -> PlayerProfile -> GameRun -> RunResult`

当前实现：

- authenticated 场景优先用 `accountId`
- `playerProfileId` 已经进入命令层、仓储记录、Neon `maintainer_game_runs` 和 `maintainer_leaderboard_entries`
- 排行榜明细返回也会携带 `accountId/playerProfileId`
- 文件仓库与 Neon 排行榜聚合都已优先按 canonical owner 归并，不再只按 legacy `userId`

这意味着：

- 第二轮解决了“workspace 内长期身份不落库”的 P0 缺口
- 下一步不是继续补字段，而是决定是否把 legacy `user_id` 物理命名迁移成 `account_id` 主外键，或保留为兼容桥

### 2.2 仓储层仍以 legacy `userId` 字段命名为主

相关代码：

- `src/selling-houses/interfaces/http/maintainerRunHandlers.ts`
- `src/selling-houses/infrastructure/neonGameRunRepository.ts`
- `src/selling-houses/infrastructure/fileMaintainerRunRepository.ts`

结论：

- 当前 HTTP/Repo 层的兼容口仍然是 `userId`
- authenticated 场景由 handler 用 session `accountId` 覆盖，并且客户端请求可以不再携带 `userId`
- Neon 已新增 `account_id/player_profile_id` 列，但 `maintainer_game_runs.user_id` 仍保留为兼容 owner 条件

下一轮如果继续推进：

- 需要明确 `runOwnerAccountId` / `legacyUserId` / `playerProfileId` 的字段迁移策略
- 需要给 activation-key 旧链路定边界：它可以继续兼容内部工具，但不应作为长期用户授权模型

### 2.3 文档旧口径仍未全清

本轮已清理一批主文，但还未全量覆盖所有卖房旧文档。

因此当前状态是：

- canonical 主文基本已统一
- 旧专题文档仍可能残留 `User / userId` 说法

### 2.4 双入口结构仍是长期架构风险

当前代码：

- `server.ts`
- `api/*.ts`

结论：

- 这轮只补了能力缺口
- 还没有解决“本地 Express 路由和 Vercel serverless 路由长期双维护”的根问题

---

## 3. 第二轮建议切口

### 切口 A：平台身份正式三层化

目标：

- `Account`
- `PlayerProfile`
- `GameRun/RunResult`

要做到：

- 接口层显式区分 `accountId` 与 `playerProfileId`
- 仓储层不再继续扩大 `userId` 语义

### 切口 B：卖房仓储字段语义整理

目标：

- 把当前 repo 里的 owner 字段命名从“历史兼容名”整理成“可长期维护名”

前提：

- 需要先出迁移桥设计
- 不能直接粗暴重命名数据库字段

### 切口 C：server/api 路由能力清单化

目标：

- 列出本地 server 和 serverless 全部接口矩阵
- 标清哪些已经对齐，哪些还没对齐

---

## 4. 当前可以放心复用的结论

1. workspace registry 化这条已经可以当稳定基础设施继续往上搭。
2. selling-houses 身份链不应该再新增任何直接依赖本地随机 `userId` 的新逻辑。
3. open-day 新增 API 时必须同时检查 `server.ts` 与 `api/*.ts` 两侧。
4. 所有真实发信脚本默认必须安全，显式参数才允许外发。
