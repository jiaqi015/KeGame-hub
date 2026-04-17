# 模块地图

最后整理：2026-04-17

这份文件回答一个很实际的问题：代码现在分别落在哪，继续做某块功能时先去哪里看。

## 仓库骨架

- `server.ts`
  - 本地开发服务入口。
  - 承担前端开发服务和本地 API 承接。
- `api/`
  - 站点 API 路由文件。
  - 既包含 Sabrina 能力，也包含开放日和维护人相关接口。
- `src/`
  - 前端应用主体。
- `docs/`
  - 业务架构、数据模型和项目记忆。

## 前端主入口

- `src/App.tsx`
  - 整站级入口与业务线切换中枢。
- `src/components/Hub/WorkspaceHub.tsx`
  - 统一入口 Hub。
- `src/components/Auth/AuthOverlay.tsx`
  - 激活/鉴权覆盖层。
- `src/hooks/useAppSession.ts`
  - 会话态与使用态协调。

## 多模型 PK

- `src/components/Comparison/ComparisonWorkspace.tsx`
  - 模型对比工作区。
- `api/activate.ts`
  - 激活验证。
- `api/models.ts`
  - 模型列表。
- `api/compare.ts`
  - 非流式对比。
- `api/compare-stream.ts`
  - 流式对比。

## 开放日选址

### 前端

- `src/open-day/OpenDayWorkspace.tsx`
  - 开放日主工作台。
- `src/open-day/components/UploadStage.tsx`
  - 第一步上传与预览。
- `src/open-day/components/FormulaBar.tsx`
  - 公式与参数表达入口。
- `src/open-day/components/SidebarConfig.tsx`
  - 侧栏配置区。
- `src/open-day/components/ScenarioDashboard.tsx`
  - 结果面板与分析视图。
- `src/open-day/components/HistoryPanel.tsx`
  - 历史快照与回放。
- `src/open-day/openDayReducer.ts`
  - 开放日工作台状态收口。
- `src/open-day/openDayClient.ts`
  - 前端对开放日接口的调用封装。

### 服务端

- `api/parse-workbook.ts`
  - Excel 解析入口。
- `api/open-day-catalog.ts`
  - 默认策略包和参数目录。
- `api/open-day-score.ts`
  - 测算打分。
- `api/open-day-analyses.ts`
  - 历史快照查询。
- `api/open-day-scenarios.ts`
  - 方案模板读取与保存。

### 相关文档

- `docs/open-day-ddd-architecture.md`
  - 开放日领域设计说明。

## 我是王牌维护人

### 前端

- `src/selling-houses/SellingHousesWorkspace.tsx`
  - 维护人主工作台。
- `src/selling-houses/application/gameState.ts`
  - 本地运行态核心定义。
- `src/selling-houses/application/useGame.ts`
  - 玩法主 hooks。
- `src/selling-houses/application/cloudState.ts`
  - 云端状态协同。
- `src/selling-houses/application/cloudSync.ts`
  - 云同步流程。

### 领域

- `src/selling-houses/domain/models.ts`
  - 核心模型。
- `src/selling-houses/domain/engine.ts`
  - 规则推进引擎。
- `src/selling-houses/domain/generator.ts`
  - 局面/内容生成。
- `src/selling-houses/domain/scoring.ts`
  - 评分逻辑。
- `src/selling-houses/domain/constants.ts`
  - 玩法常量。
- `src/selling-houses/domain/utils.ts`
  - 领域辅助函数。

### 基础设施与接口

- `src/selling-houses/infrastructure/cloudClient.ts`
  - 云端请求封装。
- `src/selling-houses/infrastructure/neonGameDatabase.ts`
  - Neon schema / database 初始化方向。
- `src/selling-houses/infrastructure/neonGameRunRepository.ts`
  - run 级 repository。
- `api/maintainer-runs.ts`
  - 维护人 run 相关接口。
- `api/maintainer-leaderboard.ts`
  - 排行榜接口。

### 相关文档

- `docs/selling-houses-cloud-data-model.md`
  - 云端数据模型。
- `docs/selling-houses-game-architecture.md`
  - 玩法结构草图。

## 运行与验证

- `package.json`
  - `npm run dev`：本地开发
  - `npm run build`：构建
  - `npm run lint`：TypeScript 检查
  - `npm run verify:maintainer`：维护人相关验证脚本
- `scripts/verify-selling-houses.ts`
  - 维护人专项验证入口。
