# 开放日阶段 1 迁移说明：从 Snapshot 走向 Analysis Run

最后整理：2026-04-17

这份说明只覆盖阶段 1：

- 纠正“历史测算记录”的语义
- 引入 `analysis_run`
- 保持现有接口和前端兼容

## 阶段目标

阶段 1 不解决所有持久化问题，只解决一个最关键的问题：

当前“历史快照”实际上混合了两种含义：

- 用户显式发起的一次测算动作
- 某个缓存/计算结果的存储载体

在新模型里，这两者要拆开：

- `analysis_run` 代表一次业务动作
- cache 只负责加速

## 本轮变更

### 新增表

- `open_day_analysis_runs`
- `open_day_analysis_run_rows`

### 保留旧表

- `open_day_analysis_snapshots`
- `open_day_analysis_snapshot_rows`

### 写路径策略

当前阶段采用双写：

1. 新 run 表继续写
2. 旧 snapshot 表继续写

这样可以保证：

- 新语义开始生效
- 旧前端和旧查询不立即失效
- 后续读路径可以渐进切换

## 读路径策略

当前阶段采用“新表优先，旧表兜底”：

1. 历史列表优先读 `analysis_runs`
2. 如果记录只存在旧表，则从 `analysis_snapshots` 补齐
3. 历史详情优先按 `runId`/`id` 查 `analysis_runs`
4. 查不到再回退旧 `analysis_snapshots`

## 接口兼容策略

### 仍然保留的接口

- `POST /api/open-day-score`
- `GET /api/open-day-analyses`

### 新的兼容语义

- `/api/open-day-analyses?id=...` 继续可用
- `/api/open-day-analyses?runId=...` 也可用

### 返回兼容策略

当前仍保留：

- `snapshotId`
- `snapshotCreatedAt`

同时新增：

- `runId`
- `runCreatedAt`

所以现有前端可以不改，后续新代码可以逐步切到 `runId`

## 上线顺序建议

### 第一步：先发 schema + 写路径

- 先让新表开始接数据
- 先不要改前端字段名

### 第二步：观测一段时间

重点看：

- 新表是否持续增长
- 是否每次显式测算都产生一条 run
- cache hit 时是否也有 run
- 是否出现“有 run 无 run_rows”

### 第三步：新代码逐步改名

等 run 表稳定后，前端和应用层再逐步从：

- `snapshot`

迁移到：

- `analysis run`

## 回滚策略

如果阶段 1 出现问题：

1. 先把读路径切回旧 snapshot 表
2. 保留新 run 表数据，不删除
3. 停止新表写入
4. 定位问题后再决定是否重放或补写

原则：

- 回滚读路径优先
- 不要第一时间删新表数据

## 阶段 1 完成标准

满足下面这些条件，就算阶段 1 完成：

- 用户连续两次点击测算，会看到两条独立历史记录
- 第二次即使命中缓存，也会产生新的 `analysis_run`
- 历史详情能正常回放
- 旧前端不用大改
- 新旧表可并存

## 阶段 1 之后再做什么

阶段 1 完成后，优先进入阶段 2：

- `scenario_template`
- `scenario_template_version`

因为只有把方案版本语义补上，`analysis_run` 绑定的方案身份才真正稳定。
