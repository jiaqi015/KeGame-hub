# 项目记忆

最后整理：2026-04-17

这份记忆放在项目内，作为这个仓库的人类可读入口。它不是原始对话转储，而是把已经稳定下来的项目背景、约束、架构方向和当前焦点整理成可持续维护的文档。

它和 Codex 私有记忆的分工如下：

- 仓库内记忆：
  - 给人看，作为协作入口和权威整理版。
  - 只保留项目级、跨线程仍然成立的事实和判断。
- Codex 私有记忆：
  - 放在 `~/.codex/memories/projects/users-jiaqi-documents-开放日测算/`。
  - 负责恢复连续性、沉淀主题索引、承接 thread summary。
  - 如果私有自动产物和本文件冲突，以本文件和 `docs/project-memory/` 为准。

## 先看什么

1. 先读本文件，了解项目是什么、现在到哪了。
2. 再读 [当前状态](docs/project-memory/current-state.md)。
3. 需要做架构或产品延续时，读 [稳定决策](docs/project-memory/durable-decisions.md)。
4. 需要快速接着做时，读 [当前焦点](docs/project-memory/current-focus.md)。
5. 需要知道代码落点时，读 [模块地图](docs/project-memory/module-map.md)。
6. 需要交接或断点恢复时，读 [接手清单](docs/project-memory/handoff-checklist.md)。

## 项目是什么

这是一个统一入口项目，当前整合了三个方向：

- `多模型PK`：模型对比与总结。
- `开放日选址`：上传 Excel，做小区开放日候选测算、策略配置、历史分析。
- `我是王牌资产顾问`：房源经营/推进模拟，正在往云端数据与状态同步方向演进。

## 这份项目记忆覆盖什么

- 产品定位和用户目标。
- 已经稳定的架构与命名约束。
- 当前仓库中各条业务线的落点。
- 最近一轮检查后确认的健康状态与后续焦点。
- 继续协作时应该默认遵守的工程习惯。

## 这个项目应该长期记住什么

以下几类信息值得长期沉淀：

- 产品边界：
  - 这是统一入口项目，不是单一“开放日工具”仓库。
  - 当前包含 `多模型PK`、`开放日选址`、`我是王牌资产顾问` 三条业务线。
- 命名与边界约束：
  - 对外文案可以变，但内部 `open-day` 命名先不大规模重命名。
  - 开放日逻辑继续收敛在领域服务和后端接口，不回塞页面脚本。
- 关键用户流：
  - 开放日工作台保持“两步式”主流程。
  - 统一入口、验证页、Hub 和三条业务线之间的切换关系要保持清楚。
- 架构与基础设施选择：
  - 前端是 `Vite + React + TypeScript`，本地服务入口是 `server.ts`。
  - `Neon Postgres`、`Vercel Runtime Cache`、`Vercel Blob` 是明确的演进方向，但允许本地文件/内存回退。
- 当前主战场：
  - 项目重点已经扩展到“资产顾问玩法云化 + 统一入口整合”。
  - 开放日模块是当前完成度最高、最稳的一条业务线。
- 协作约定：
  - 关键背景优先沉淀在仓库内文档。
  - 自动生成记忆只能作线索，不能直接当权威事实。

## 不放什么

- 原始线程记录。
- 临时调试日志。
- 一次性的命令输出。
- 尚未确认的猜测或试验结论。
- 秘钥、令牌、账号等敏感信息。

## 项目索引

- [当前状态](docs/project-memory/current-state.md)
- [稳定决策](docs/project-memory/durable-decisions.md)
- [当前焦点](docs/project-memory/current-focus.md)
- [模块地图](docs/project-memory/module-map.md)
- [接手清单](docs/project-memory/handoff-checklist.md)

## 私有记忆映射

Codex 私有项目记忆建议至少维护这些主题：

- `project-scope.md`
  - 项目定位、业务线边界、命名约束。
- `sabrina-product-direction.md`
  - 统一入口、三条业务线、当前主战场与演进方向。
- `engineering-guardrails.md`
  - 架构约束、存储/缓存回退策略、协作规则。
- `resume/RESUME_PACK.md`
  - 用于账号切换、线程丢失、重装后的快速恢复。

如果后续项目继续演进，这些主题应优先更新，而不是仅追加 thread summary。

## 维护约定

- 只沉淀可复用、跨线程仍然成立的信息。
- 明显已经过时的内容直接改，不保留“对话式追加”痕迹。
- 如果外部 Codex memory 与本文件冲突，以项目内人工整理版为准，再回头刷新外部记忆。
