# 开放日阶段 2 迁移说明：Scenario Template Versioning

最后整理：2026-04-17

阶段 2 的目标是把方案从“每次保存生成一个新对象”升级成：

- `scenario_template`：稳定身份
- `scenario_template_version`：每次保存生成的版本快照

## 本轮语义

### 新建方案

当当前工作台没有绑定 `activeScenarioTemplateId` 时：

- 生成新的 `templateId`
- 创建版本 `versionNo = 1`

### 更新方案

当当前工作台已经绑定 `activeScenarioTemplateId` 时：

- 复用现有 `templateId`
- 递增 `currentVersionNo`
- 生成新的 `latestVersionId`

## 当前兼容策略

前端接口仍然使用：

- `POST /api/open-day-scenarios`

只是请求体现在允许附带：

- `templateId`

如果传了 `templateId`，后端按“更新当前方案”处理。
如果没传，后端按“新建方案”处理。

## 阶段 2 完成后得到什么

- 方案拥有稳定主键
- 每次保存都有版本快照
- 未来可以继续扩展：
  - 方案版本历史
  - 方案回滚
  - 另存为
  - 测算绑定具体版本

## 仍然没做的事

阶段 2 这次先只落持久化底座，还没有补：

- `GET /api/open-day-scenarios/:id/versions`
- 方案 diff
- 回滚到指定版本
- `analysis_run` 绑定 `scenario_template_version_id`

这些建议放在阶段 2.5 或阶段 3 再接。
