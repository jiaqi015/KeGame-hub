# 当前焦点

最后整理：2026-04-17

这份文件只记录“最近一段时间最值得继续推进什么”。长期不变的规则放到 [稳定决策](durable-decisions.md)。

## 当前主轴

从未提交改动和文档增量看，这一轮最明显的推进方向是：

1. `我是王牌资产顾问` 的云端化与玩法结构继续收口
2. `开放日选址` 的后端数据结构、版本化和持久化继续加固
3. 统一入口在产品叙述和代码入口上继续收口

## 现在最值得续做的 3 件事

### 1. 资产顾问玩法打通云端闭环

重点不是再加一点散的 UI，而是把已经存在的几层真正串起来：

- `Neon` schema
- repository
- HTTP handlers
- 前端云同步状态
- scenario / run / leaderboard 相关接口

当前最可能继续动的区域：

- `src/selling-houses/infrastructure/`
- `src/selling-houses/interfaces/http/`
- `api/maintainer-*.ts`
- `api/selling-houses-scenarios.ts`
- `docs/selling-houses-cloud-data-model.md`

### 2. 开放日模块继续补强后端闭环

重点不是重新做一版页面，而是守住和扩展这些后端能力：

- workbook 解析
- dataset / snapshot / scenario 的结构化持久化
- scenario versioning
- dataset profile / disambiguation
- 缓存与上传归档

当前最值得先看的区域：

- `modules/open-day/`
- `api/open-day-*.ts`
- `docs/open-day-phase1-analysis-run-migration.md`
- `docs/open-day-phase2-scenario-versioning.md`
- `docs/open-day-phase3-dataset-profile.md`

### 3. 统一入口表达继续清晰化

统一入口这部分不只是文案，它直接关系到：

- 激活流程
- Hub 结构
- 三条业务线的切换关系
- README 与项目叙述是否跟代码现状一致

当前入口相关文件：

- `src/App.tsx`
- `src/components/Hub/WorkspaceHub.tsx`
- `src/components/Auth/AuthOverlay.tsx`
- `README.md`

## 当前风险

- 工作区是脏树，改动范围跨多个模块，接手时不能假设影响面很小。
- 资产顾问玩法仍在快速变形，前端状态、领域结构、数据库 schema 可能一起变。
- 自动生成记忆仍有噪声，恢复上下文时不要直接依赖它做判断。

## 如果现在要继续推进

按任务类型走：

1. 做资产顾问：
   先看 `docs/selling-houses-cloud-data-model.md`，再进 `src/selling-houses/infrastructure/` 和 `interfaces/http/`
2. 做开放日：
   先看 `modules/open-day/` 与阶段迁移文档，再检查 `api/open-day-*.ts`
3. 做统一入口：
   先看 `src/App.tsx`、Hub、Auth，再回头校准 README 和项目记忆
