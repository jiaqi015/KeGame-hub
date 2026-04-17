# 接手清单

最后整理：2026-04-17

这份清单给下次接手的人或 agent 用，目标是用最短时间恢复上下文，不把时间浪费在重新摸路上。

## 先做的 5 件事

1. 读 [MEMORY.md](/Users/jiaqi/Documents/开放日测算/MEMORY.md)。
2. 看 `git status --short`，确认当前工作区是不是有未提交中的大改。
3. 读 [当前焦点](current-focus.md)，判断这轮主要是在推哪条业务线。
4. 读 [模块地图](module-map.md)，找到对应代码入口。
5. 再决定是否需要补看业务文档：
   - 开放日：`docs/open-day-ddd-architecture.md`
   - 维护人：`docs/selling-houses-cloud-data-model.md`、`docs/selling-houses-game-architecture.md`

## 如果要继续做开放日

- 先确认两步式主流程还在：
  - 上传/预览
  - 工作台测算
- 再确认 5 个后端能力没有断：
  - workbook 解析
  - 参数目录
  - 测算打分
  - 历史快照
  - 方案模板
- 优先看：
  - `src/open-day/OpenDayWorkspace.tsx`
  - `src/open-day/openDayReducer.ts`
  - `src/open-day/openDayClient.ts`
  - `api/open-day-*.ts`

## 如果要继续做维护人

- 先确认当前目标是：
  - 玩法设计
  - 前端交互
  - 云同步
  - Neon 数据模型
- 优先看：
  - `src/selling-houses/application/`
  - `src/selling-houses/domain/`
  - `src/selling-houses/infrastructure/`
  - `api/maintainer-*.ts`
- 如果涉及数据库或同步，先对照：
  - `docs/selling-houses-cloud-data-model.md`
  - `src/selling-houses/infrastructure/neonGameDatabase.ts`

## 如果要继续做统一入口

- 先看：
  - `src/App.tsx`
  - `src/components/Hub/WorkspaceHub.tsx`
  - `src/components/Auth/AuthOverlay.tsx`
- 重点确认：
  - 激活流程
  - Hub 选择流程
  - 三条业务线切换是否仍然清晰

## 常见误区

- 不要把外部自动生成的 thread memory 当最终真相。
- 不要因为产品名变化就急着大规模重命名 `open-day` 代码路径。
- 不要在未确认当前改动范围前直接 `git add .`。
- 不要只看 UI，就误判项目重心仍然停在开放日页面美化。
