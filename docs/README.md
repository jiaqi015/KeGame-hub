# 文档总索引

最后整理：2026-04-19

这份索引只解决一个问题：进入 `docs/` 后先读什么，哪些文档是主干，哪些是细节，哪些已经被删除。

## 先读这 4 份

1. [接手清单](project-memory/handoff-checklist.md)
   重新接手项目时先看，决定本轮该读哪条线。
2. [模块地图](project-memory/module-map.md)
   要改代码时先看，快速定位代码入口和对应文档。
3. [稳定决策](project-memory/durable-decisions.md)
   看跨线程不能随便推翻的产品、架构、基础设施约束。
4. [卖房总设计](selling-houses-total-design.md)
   如果本轮和资产顾问有关，先读这份。

## 卖房（资产顾问）canonical 主文

新人先按下面顺序读，避免把历史讨论稿当成当前合同：

1. [卖房总设计](selling-houses-total-design.md)
   当前业务与世界模型主文。
2. [卖房实现合同（最小收口版）](selling-houses-implementation-contracts.md)
   当前开发必须遵守的 canonical 命名、阶段边界和最小字段合同。
3. [卖房架构总纲](selling-houses-master.md)
   架构决策、不可违反约束、6 周路径和旧文档处置锚点。

## 卖房（资产顾问）主干细化

主干细化阅读顺序：

1. [卖房总设计](selling-houses-total-design.md)
   从业务、玩法、世界模型、页面和结算完整理解一遍。
2. [业务事实总表](selling-houses-business-facts.md)
   后续所有设计的真实业务事实来源。
3. [领域架构 v1](selling-houses-domain-architecture-v1.md)
   代码建模应该围绕哪些对象拆。
4. [信息架构设计](selling-houses-information-architecture.md)
   玩家界面如何从一层钻到详情。
5. [界面信息架构详细设计](selling-houses-interface-detail-design.md)
   页面层级、详情页、新闻、事件、流水日志的详细设计。

## 卖房（资产顾问）专题

- [卖房实现合同（最小收口版）](selling-houses-implementation-contracts.md)
- [平台账号、玩家、局、得分、总分数据架构](platform-account-player-run-score-architecture.md)
- [卖房平台层到世界层物理表设计](selling-houses-physical-schema-design.md)
- [游戏边界与结算机制设计](selling-houses-game-boundary-and-settlement-design.md)
- [游戏层目标、沉淀与排行榜架构](selling-houses-game-layer-goals-leaderboard.md)
- [客户与机会架构](selling-houses-customer-opportunity-architecture.md)
- [成交事实与成交引擎设计](selling-houses-deal-fact-and-closing-model.md)
- [竞争与联卖架构](selling-houses-competition-and-cosale-architecture.md)
- [竞品关系数据模型](selling-houses-competition-relation-model.md)
- [经纪公司、品牌与 ACN 架构](selling-houses-organization-acn-model.md)
- [经纪人动作架构](selling-houses-broker-action-architecture.md)
- [业主沟通架构](selling-houses-owner-conversation-architecture.md)
- [交互、活动、事件架构](selling-houses-interaction-campaign-event-architecture.md)
- [Matter 模板架构](selling-houses-matter-template-architecture.md)
- [日结与每日计算设计](selling-houses-daily-tick-design.md)
- [时间架构设计](selling-houses-time-architecture.md)
- [市场事件目录](selling-houses-market-event-matrix.md)
- [好房模型设计](selling-houses-good-house-model.md)
- [价格模型设计](selling-houses-price-model.md)
- [业主与客户类型体系](selling-houses-archetype-architecture.md)
- [字段归属表](selling-houses-field-ownership-matrix.md)
- [Projection 投影架构](selling-houses-projection-architecture.md)
- [业务语言指南](selling-houses-business-language-guide.md)
- [架构图与 ER 图](selling-houses-architecture-diagrams.md)

## 卖房（资产顾问）玩法与执行

- [玩法说明](selling-houses-how-to-play.md)
- [游戏定位](selling-houses-game-positioning.md)
- [生成式剧本架构](selling-houses-generated-scenario-architecture.md)
- [房源生命周期设计](selling-houses-listing-lifecycle-design.md)
- [评分系统设计](selling-houses-scoring-system.md)
- [6 周执行手册](selling-houses-iteration-plan.md)
- [架构与模拟深度诊断](selling-houses-architecture-diagnosis.md)
- [世界-视口架构详细论证](selling-houses-world-viewport-architecture.md)

## 开放日选址

- [开放日 DDD Architecture](open-day-ddd-architecture.md)
- [开放日数据结构与持久化演进方案](open-day-persistence-evolution-plan.md)
- [阶段 1：Analysis Run 迁移](open-day-phase1-analysis-run-migration.md)
- [阶段 2：Scenario Template Versioning](open-day-phase2-scenario-versioning.md)
- [阶段 3：Dataset 与 Dataset Profile](open-day-phase3-dataset-profile.md)
- [开放日模块 DBA 工作 SOP](open-day-dba-sop.md)

## 全局持久化与 DBA

- [全局持久化与 DBA 统一设计](global-persistence-dba-unified-design.md)
- [全局持久化与 DBA 实施计划](global-persistence-dba-implementation-plan.md)

## 并行开发材料

- [卖房工作台 4 小时并行开发总控计划](dev-session-selling-houses-2026-04-19.md)
- [并行线程任务入口](dev-session-thread-briefs.md)

## 历史 / 诊断附录

这些文档可以帮助追溯或诊断，但默认不作为当前 canonical 合同：

- [架构与模拟深度诊断](selling-houses-architecture-diagnosis.md)
- [卖房工作台 4 小时并行开发总控计划](dev-session-selling-houses-2026-04-19.md)
- [并行线程任务入口](dev-session-thread-briefs.md)
- [卖房架构图与 ER 图](selling-houses-architecture-diagrams.md)

## 已删除的旧文档

这些文档已经被新主干吸收或明确推翻，不再保留：

- `selling-houses-cloud-data-model.md`
- `selling-houses-complete-framework-plan.md`
- `selling-houses-game-architecture.md`
- `selling-houses-maintainer-market-architecture.md`
- `selling-houses-unified-game-architecture.md`
- `project-memory/current-focus.md`
- `project-memory/current-state.md`

如果需要追溯原因，读 [卖房架构总纲](selling-houses-master.md) 的“旧 md 清单”。
