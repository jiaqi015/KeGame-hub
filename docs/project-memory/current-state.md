# 当前状态

最后整理：2026-04-17

## 仓库定位

当前仓库是一个统一产品入口，而不是只做单一开放日工具。

- 前端：`Vite + React + TypeScript`
- 本地服务：`server.ts`
- 接口目录：`api/`
- 领域/历史模块：`src/open-day/`
- 资产顾问玩法模块：`src/selling-houses/`

## 现有业务线

### 1. 多模型 PK

- 入口在统一工作台中。
- 负责激活、模型列表、模型对比与流式对比。
- 仍是整站的验证入口之一。

### 2. 开放日选址

- 当前是完成度最高、可直接跑通的一条业务线。
- 用户主流程已经收敛为“两步”：
  - 第一步：上传文件、预览数据、进入下一步。
  - 第二步：进入测算工作台，配置公式、参数包、策略、分析结果和历史。
- 代码仍保留 `open-day` 前缀，属于刻意保留的内部命名，不等于产品文案。
- 服务端负责 Excel 解析、默认参数目录、评分计算、历史快照、方案模板。

### 3. 我是王牌资产顾问

- 已从单机玩法逐步转向“可云存档、可同步、可排行榜”的结构。
- 代码主目录在 `src/selling-houses/`。
- 已经有云端 schema、Neon 连接层、云同步状态与相关 API 雏形。
- 当前还在快速迭代期，重点是玩法结构和云端数据模型打通。

## 已确认的工程状态

- 项目外部 Codex memory 已于 2026-04-17 重新执行一次 `init` 同步。
- 该项目线程摘要已从 5 份补齐到 10 份，历史 continuity 已恢复。
- 外部自动产物存在轻微噪声：
  - `resume pack` 引用了不存在的话题文件。
  - `thread-derived-signals.generated.md` 混入了低质量文本片段。
- 因此，仓库内这套人工整理版记忆应视为更可靠的入口。

## 当前目录上的现实情况

- 工作区目前不是干净树，存在一批业务开发中的未提交改动。
- 主要增量集中在：
  - `src/selling-houses/`
  - `api/maintainer-*`
  - `docs/selling-houses-*`
  - `server.ts`
  - `src/App.tsx`
- 这说明当前主战场已经明显从“只做开放日”扩展到了“统一入口 + 资产顾问玩法云化”。

## 推荐阅读顺序

如果要继续做开放日：

1. `README.md`
2. `docs/open-day-ddd-architecture.md`
3. `src/open-day/OpenDayWorkspace.tsx`

如果要继续做资产顾问：

1. `docs/selling-houses-game-architecture.md`
2. `docs/selling-houses-cloud-data-model.md`
3. `src/selling-houses/`
4. `api/maintainer-*.ts`
