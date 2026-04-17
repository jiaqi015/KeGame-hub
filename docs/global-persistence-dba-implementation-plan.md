# 全局持久化与 DBA 实施计划

最后整理：2026-04-18

这份文档是 [全局持久化与 DBA 统一设计](./global-persistence-dba-unified-design.md) 的落地版。

目标不是“再讲一次原则”，而是把原则拆成可执行任务。

## 实施目标

在不影响当前版本运行的前提下，分阶段完成：

1. 全局真相层定义统一
2. 持久化 contract 统一
3. fallback 语义统一
4. schema 演进流程统一
5. verify / rebuild / 巡检机制统一

## 总体策略

只做两类改动：

- `P0`: 统一规范，不切读路径
- `P1`: 起骨架，不改业务行为

只有当：

- contract 稳定
- fallback 边界清楚
- verify 足够

才进入：

- `P2`: 平台切换

## P0：统一规则

### 目标

让所有后续持久化改动都按统一框架进行。

### 任务

1. 固化全局设计文档
2. 在模块地图中挂入全局总纲
3. 新增本实施计划文档
4. 后续所有持久化改动必须先做“真相分型”

### 验收标准

- 团队可以明确回答：
  - 谁是真相层
  - 谁是影子层
  - 谁是缓存层
- 新需求不再直接跳到“加字段/加表”

## P1：平台骨架统一

### 目标

先统一抽象，再谈实现切换。

### `open-day`

状态：

- 已经基本完成 platform/repository 抽象

本阶段动作：

1. 保持现有 platform 模式不回退
2. 按全局标准补文档和巡检清单
3. 明确 legacy snapshot 表的下线条件

### `selling-houses`

状态：

- 业务结构化已成型
- 但 repository / platform 抽象还未统一

本阶段动作：

1. 新增 `application` repository contract
2. 新增 `infrastructure` platform resolver
3. handler 改为依赖 platform，而不是直接 new `Neon` repo
4. 现阶段仍只挂 `Neon` / built-in fallback，不做行为切换

### 验收标准

- handler 层不再直接依赖具体 repo 类
- repository contract 可被替换
- 当前 API 行为不变

## P2：fallback 统一

### 目标

让 fallback 从“凑合能跑”变成“语义一致”。

### 任务

1. 为 `selling-houses` 设计 file fallback contract
2. 明确 `selling-houses` 哪些表需要 fallback，哪些只需 `save_data`
3. 对齐 `open-day` file fallback 与 Neon 的版本语义
4. 明确哪些对象永远不允许只存在 cache

### 验收标准

- fallback 不会改变实体含义
- fallback 不会引入不同 ID/版本语义
- fallback 下最小功能完整

## P3：migration 统一

### 目标

把两个业务线从 runtime ensure 逐步带到统一 migration 体系。

### 任务

1. 设计项目级 migration 目录规范
2. 设计 migration 命名规范
3. 设计 rollout / rollback 模板
4. 为 `open-day` 和 `selling-houses` 共用

### 验收标准

- schema 变更有显式记录
- 回滚路径可读
- runtime ensure 只保兜底，不再承担全部治理责任

## P4：verify / rebuild / 巡检统一

### 目标

让 DBA 工作从一次性推进，变成可重复巡检。

### 任务

1. 给每条业务线定义真相层巡检项
2. 给每个影子层定义 verify 规则
3. 有条件的影子层提供 rebuild
4. 形成项目级巡检清单

### 验收标准

- `open-day` 有数据一致性巡检项
- `selling-houses` 影子表 verify/rebuild 覆盖稳定
- 可以做固定频率巡检

## 任务拆分表

## 任务组 A：文档与治理

1. 维护全局设计文档
2. 维护实施计划文档
3. 更新模块地图
4. 后续补全巡检清单模板

## 任务组 B：`selling-houses` 平台化

1. 增加 `MaintainerRunRepository` contract
2. 增加 `SellingHousesScenarioRepository` contract
3. 增加 `sellingHousesPlatform.ts`
4. handler 改为通过 platform 获取 repo
5. 保持现有行为不变

## 任务组 C：`open-day` 治理收口

1. 盘点 legacy snapshot 表读写依赖
2. 明确 template/version/run/snapshot 各自角色
3. 明确 file fallback 与 Neon 的最小一致性边界

## 任务组 D：迁移体系

1. 设计 migration 目录
2. 设计 migration review 模板
3. 设计 rollout / rollback 模板

## 任务组 E：巡检体系

1. `selling-houses` 真相层巡检清单
2. `selling-houses` 影子层巡检清单
3. `open-day` dataset/scenario/run 巡检清单
4. fallback 一致性巡检清单

## 当前建议执行顺序

### 第一批

1. 全局文档定稿
2. `selling-houses` 起 platform 骨架

### 第二批

1. `selling-houses` fallback 设计
2. `open-day` legacy 边界清理
3. `selling-houses` file fallback shadow summary verify / rebuild

### 第三批

1. migration 统一
2. 巡检自动化

## 这份计划的使用方式

如果要做需求评审：

- 先看它属于哪一个 P 阶段

如果要安排开发：

- 按任务组拆给不同人

如果要做 DBA 巡检：

- 直接从任务组 E 衍生固定 SOP

## 当前进展补记

截至 2026-04-18：

- `selling-houses` 已补 run 级 file fallback
- file fallback 已补最小一致语义：
  - `createRun / getRun / listRuns / saveRun / listLeaderboard`
  - `syncVersion` CAS
- file fallback 已补 sidecar shadow summary
- 已具备 file 模式下的 verify / rebuild 脚本：
  - `verify:maintainer-file-shadow`
  - `rebuild:maintainer-file-shadow`

这一步仍属于：

- 不切业务主读路径
- 只增强 fallback 可运行性与 DBA 可巡检性
