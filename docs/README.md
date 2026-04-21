# 文档总索引

最后整理：2026-04-21

这份索引只解决一个问题：

> 进入 `docs/` 后，当前应该先读什么，哪些是主文，哪些是辅助说明，哪些只是阶段工作单或历史附录。

默认原则：

- 先读当前 canonical 主文，再读专题细化。
- 阶段审计、线程 brief、诊断稿默认不作为长期合同。
- 图示、物理表、执行手册默认是辅助材料，不替代主文和实现合同。

## 先读这 5 份

1. [接手清单](project-memory/handoff-checklist.md)
   重新接手项目时先看，决定本轮该读哪条线。
2. [模块地图](project-memory/module-map.md)
   要改代码时先看，快速定位代码入口和对应文档。
3. [稳定决策](project-memory/durable-decisions.md)
   看跨线程不能随便推翻的产品、架构、基础设施约束。
4. [文档总索引](README.md)
   先分清哪些是主文、哪些是辅助文、哪些只是过程稿。
5. [卖房总设计](selling-houses-total-design.md)
   如果本轮和资产顾问有关，先读这份。

## 当前 canonical 主文

这些文档是当前阶段默认持续维护的主干。

### 项目入口

1. [接手清单](project-memory/handoff-checklist.md)
2. [模块地图](project-memory/module-map.md)
3. [稳定决策](project-memory/durable-decisions.md)

### 卖房（资产顾问）

1. [卖房总设计](selling-houses-total-design.md)
   当前业务、世界模型、页面主线与结算主文。
2. [卖房实现合同（最小收口版）](selling-houses-implementation-contracts.md)
   当前开发必须遵守的 canonical 命名、阶段边界和最小字段合同。
3. [卖房信息架构设计](selling-houses-information-architecture.md)
   当前页面层级、页面职责与底层对象映射主文。
4. [卖房设计系统](selling-houses-design-system.md)
   当前稳定下来的视觉 token、组件规则、页面骨架与文案约束。
5. [平台账号、玩家、局、得分、总分数据架构](platform-account-player-run-score-architecture.md)
   当前平台身份链、局层主键链、结果与榜单主文。
6. [卖房架构总纲](selling-houses-master.md)
   架构决策、不可违反约束、旧文档处置锚点。

### 开放日选址

1. [开放日 DDD Architecture](open-day-ddd-architecture.md)
2. [阶段 1：Analysis Run 迁移](open-day-phase1-analysis-run-migration.md)
3. [阶段 2：Scenario Template Versioning](open-day-phase2-scenario-versioning.md)
4. [阶段 3：Dataset 与 Dataset Profile](open-day-phase3-dataset-profile.md)

### 全局持久化

1. [全局持久化与 DBA 统一设计](global-persistence-dba-unified-design.md)

## 卖房（资产顾问）核心辅助文

这些文档默认作为主文的专题展开，仍然有效，但不单独充当总合同。

- [业务事实总表](selling-houses-business-facts.md)
- [领域架构 v1](selling-houses-domain-architecture-v1.md)
- [字段归属表](selling-houses-field-ownership-matrix.md)
- [客户与机会架构](selling-houses-customer-opportunity-architecture.md)
- [成交事实与成交引擎设计](selling-houses-deal-fact-and-closing-model.md)
- [Matter 模板架构](selling-houses-matter-template-architecture.md)
- [经纪公司、品牌与 ACN 架构](selling-houses-organization-acn-model.md)
- [竞争与联卖架构](selling-houses-competition-and-cosale-architecture.md)
- [竞品关系数据模型](selling-houses-competition-relation-model.md)
- [好房模型设计](selling-houses-good-house-model.md)
- [价格模型设计](selling-houses-price-model.md)
- [Projection 投影架构](selling-houses-projection-architecture.md)
- [业主与客户类型体系](selling-houses-archetype-architecture.md)
- [经纪人动作架构](selling-houses-broker-action-architecture.md)
- [业主沟通架构](selling-houses-owner-conversation-architecture.md)
- [交互、活动、事件架构](selling-houses-interaction-campaign-event-architecture.md)
- [时间架构设计](selling-houses-time-architecture.md)
- [日结与每日计算设计](selling-houses-daily-tick-design.md)
- [业务语言指南](selling-houses-business-language-guide.md)

## 设计系统与页面规则

这几篇和最近两天页面、壳层、首页/市场页推进关系最密切。

- [卖房设计系统](selling-houses-design-system.md)
  当前设计系统总入口。
- [卖房首页视觉与文案风格规范](selling-houses-home-style-guide.md)
  首页专项细节参考；稳定规则已经收进设计系统主文。
- [卖房页面职责矩阵](selling-houses-page-responsibility-matrix.md)
  页面边界短版检查表；主线已经收进信息架构主文。
- [界面信息架构详细设计](selling-houses-interface-detail-design.md)
  当前更细的页面层级和详情说明，默认作为补充细节，不替代主文。

## 卖房（资产顾问）结果、平台与落库专题

这些文档仍然有效，但默认用于专题深入，不作为每天开发的第一入口。

- [游戏边界与结算机制设计](selling-houses-game-boundary-and-settlement-design.md)
- [游戏层目标、沉淀与排行榜架构](selling-houses-game-layer-goals-leaderboard.md)
- [卖房平台层到世界层物理表设计](selling-houses-physical-schema-design.md)
- [架构图与 ER 图](selling-houses-architecture-diagrams.md)

## 卖房（资产顾问）体验、玩法与系统专题

- [玩法说明](selling-houses-how-to-play.md)
- [游戏定位](selling-houses-game-positioning.md)
- [生成式剧本架构](selling-houses-generated-scenario-architecture.md)
- [房源生命周期设计](selling-houses-listing-lifecycle-design.md)
- [评分系统设计](selling-houses-scoring-system.md)
- [市场事件目录](selling-houses-market-event-matrix.md)

## 开放日选址专题

- [开放日数据结构与持久化演进方案](open-day-persistence-evolution-plan.md)
- [开放日模块 DBA 工作 SOP](open-day-dba-sop.md)

## 当前阶段工作单

这些文档对当前推进有效，但它们是阶段主控或线程 brief，不是长期 canonical 合同。

- [平台审计与第一轮改造总控](dev-session-platform-audit-2026-04-21.md)
- [平台审计线程 Brief（2026-04-21）](dev-session-platform-thread-briefs-2026-04-21.md)

## 历史 / 诊断 / 图示附录

这些文档可以帮助追溯、诊断或评审，但默认不作为当前主要依据：

- [架构与模拟深度诊断](selling-houses-architecture-diagnosis.md)
- [世界-视口架构详细论证](selling-houses-world-viewport-architecture.md)
- [6 周执行手册](selling-houses-iteration-plan.md)
- [卖房工作台 4 小时并行开发总控计划](dev-session-selling-houses-2026-04-19.md)
- [并行线程任务入口](dev-session-thread-briefs.md)
- [卖房架构图与 ER 图](selling-houses-architecture-diagrams.md)
- [卖房平台层到世界层物理表设计](selling-houses-physical-schema-design.md)

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
