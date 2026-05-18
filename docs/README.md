# 文档总索引

最后整理：2026-05-15

这个目录只保留当前仍有维护价值的产品、架构、实现合同和专题文档。历史线程 brief、一次性审计稿、playtest 逐日记录、旧校准快照已经清理，避免形成第二真相源。

## 先读这 6 份

1. [接手清单](project-memory/handoff-checklist.md)
2. [模块地图](project-memory/module-map.md)
3. [稳定决策](project-memory/durable-decisions.md)
4. [卖房总设计](selling-houses-total-design.md)
5. [卖房架构总纲](selling-houses-master.md)
6. [母模型迁移工作板](selling-houses-mother-model-agent-workplan.md)

## 当前主文

### 项目入口

- [接手清单](project-memory/handoff-checklist.md)
- [模块地图](project-memory/module-map.md)
- [稳定决策](project-memory/durable-decisions.md)

### 卖房世界模型

- [卖房总设计](selling-houses-total-design.md)
- [卖房架构总纲](selling-houses-master.md)
- [母模型迁移工作板](selling-houses-mother-model-agent-workplan.md)
- [卖房实现合同](selling-houses-implementation-contracts.md)
- [卖房信息架构设计](selling-houses-information-architecture.md)
- [卖房领域架构合同](selling-houses-domain-architecture-v1.md)
- [卖房业务事实总表](selling-houses-business-facts.md)
- [字段归属表](selling-houses-field-ownership-matrix.md)

### 卖房核心专题

- [客户与机会架构](selling-houses-customer-opportunity-architecture.md)
- [业主沟通架构](selling-houses-owner-conversation-architecture.md)
- [经纪人动作架构](selling-houses-broker-action-architecture.md)
- [成交事实与成交引擎设计](selling-houses-deal-fact-and-closing-model.md)
- [竞品与联卖关系合同](selling-houses-competition-relation-model.md)
- [经纪公司、品牌与 ACN 架构](selling-houses-organization-acn-model.md)
- [Matter 模板架构](selling-houses-matter-template-architecture.md)
- [时间架构设计](selling-houses-time-architecture.md)
- [日结与每日计算设计](selling-houses-daily-tick-design.md)
- [Projection 投影架构](selling-houses-projection-architecture.md)
- [市场事件目录](selling-houses-market-event-matrix.md)
- [生成式剧本架构](selling-houses-generated-scenario-architecture.md)
- [交互、活动、事件架构](selling-houses-interaction-campaign-event-architecture.md)

### 卖房产品与体验

- [卖房设计系统](selling-houses-design-system.md)
- [卖房首页视觉与文案风格规范](selling-houses-home-style-guide.md)
- [业务语言指南](selling-houses-business-language-guide.md)
- [玩法说明](selling-houses-how-to-play.md)
- [游戏定位](selling-houses-game-positioning.md)
- [游戏边界与结算机制设计](selling-houses-game-boundary-and-settlement-design.md)
- [游戏层目标、沉淀与排行榜架构](selling-houses-game-layer-goals-leaderboard.md)
- [评分系统设计](selling-houses-scoring-system.md)

### 卖房数据、平台与图示

- [平台账号、玩家、局、得分、总分数据架构](platform-account-player-run-score-architecture.md)
- [卖房平台层到世界层物理表设计](selling-houses-physical-schema-design.md)
- [房源生命周期设计](selling-houses-listing-lifecycle-design.md)
- [好房模型设计](selling-houses-good-house-model.md)
- [价格模型设计](selling-houses-price-model.md)
- [业主与客户类型体系](selling-houses-archetype-architecture.md)
- [楼盘/小区/房源评分系统](selling-houses-scoring-system.md)

### 开放日选址

- [开放日 DDD Architecture](open-day-ddd-architecture.md)
- [开放日数据结构与持久化演进方案](open-day-persistence-evolution-plan.md)
- [开放日模块 DBA 工作 SOP](open-day-dba-sop.md)

### 全局平台

- [全局持久化与 DBA 统一设计](global-persistence-dba-unified-design.md)
- [全局持久化与 DBA 实施计划](global-persistence-dba-implementation-plan.md)
- [AI 能力架构](ai-capability-architecture.md)

## 清理边界

已删除：

- `artifacts/playtest-10runs/`：一次性 10 局 playtest 逐日记录、截图、event ledger，体量约 192MB。
- `artifacts/decision-moment-emission/`：一次性 emission 验证输出，可由脚本重新生成。
- `artifacts/auth-cr-*.png`、`artifacts/no-cache-login-*.png`：旧登录/截图证据。
- `docs/dev-session-*.md`：旧线程 brief 和阶段总控稿。
- `docs/selling-houses-design-appreciation.md`、`docs/selling-houses-architecture-diagnosis.md`、`docs/selling-houses-iteration-plan.md`：历史诊断/鉴赏/计划稿。
- `docs/selling-houses-browser-regression-checklist.md`：旧手工回归清单。
- `docs/selling-houses-outcome-calibration-*`：旧 500-run 校准快照。
- `docs/decision-moment-emission-activation.md`：一次性 activation 验证说明，事实已由脚本和代码承接。
- `docs/selling-houses-backend-next-steps.md`：过期 next-step 备忘，后端边界已并入主文档和物理表设计。
- `docs/selling-houses-mother-model-agent-workplan.md` 旧版 Round 流水账：已压缩成当前权威工作板。
- `docs/selling-houses-world-viewport-architecture.md`：旧 14-16 周长论证，核心原则已并入当前总纲。
- `docs/selling-houses-architecture-diagrams.md` 和 `docs/assets/*2026-04-21*`：旧 4K 图与图入口，已不匹配 Five-X / causal chain 当前口径。
- `docs/open-day-phase1/2/3-*.md`：开放日阶段迁移记录，当前只保留 DDD、持久化演进和 DBA SOP。
- `docs/selling-houses-interface-detail-design.md`、`docs/selling-houses-page-responsibility-matrix.md`：旧界面细稿和职责短表，当前边界已并入信息架构合同。
- `docs/selling-houses-competition-and-cosale-architecture.md`：旧竞争/联卖长文，当前已并入竞品与联卖关系合同。

保留原则：

- 保留当前 canonical 主文。
- 保留仍被实现或 gate 使用的架构合同。
- 删除一次性测试输出、旧线程协作稿、重复诊断稿。
- 新的历史性输出默认放 `artifacts/`，不要纳入 git 和长期文档索引。

## 旧镜像文档

这些目录不再保留重复 md，避免出现第二真相源：

- `selling-houses-workspace/docs/`
- `core-workspaces/open-day/docs/`
