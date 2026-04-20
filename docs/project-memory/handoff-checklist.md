# 接手清单

最后整理：2026-04-19

这份清单只讲“重新接手时先做什么”，不重复解释长期规则和项目背景。

## 15 分钟接手流程

1. 读 [MEMORY.md](/Users/jiaqi/Documents/开放日测算/MEMORY.md)
2. 看 `git status --short`
3. 读 [模块地图](module-map.md)
4. 如果本轮是卖房架构，先读 [卖房总设计](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-total-design.md)、[卖房总纲](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-master.md) 和 [业务事实总表](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-business-facts.md)
5. 根据任务类型再补看对应业务文档

## 第一步要确认什么

先确认三件现实问题：

- 当前改动主要落在哪条业务线
- 这轮任务是“统一入口 / 开放日 / 资产顾问”里的哪一类
- 当前任务更像“补功能、接后端、修交互、还是整理文档”

## 按任务类型走

### 如果要继续做开放日

先确认这几个点没被破坏：

- 两步式主流程仍然成立
- 解析、测算、历史、方案、版本相关接口仍然闭环
- 前端状态没有重新吞回页面脚本式实现

建议阅读顺序：

1. `docs/open-day-ddd-architecture.md`
2. `docs/open-day-persistence-evolution-plan.md`
3. `docs/open-day-phase1-analysis-run-migration.md`
4. `docs/open-day-phase2-scenario-versioning.md`
5. `docs/open-day-phase3-dataset-profile.md`
6. `modules/open-day/`
7. `src/open-day/`

### 如果要继续做资产顾问

先确认当前目标更偏哪一侧：

- 玩法结构
- 剧本生成
- 云同步
- Neon 数据模型
- 前端工作台体验

建议阅读顺序：

1. `docs/selling-houses-master.md`
2. `docs/selling-houses-total-design.md`
3. `docs/selling-houses-business-facts.md`
4. `docs/selling-houses-business-language-guide.md`
5. `docs/platform-account-player-run-score-architecture.md`
6. `docs/selling-houses-domain-architecture-v1.md`
7. `docs/selling-houses-customer-opportunity-architecture.md`
8. `docs/selling-houses-deal-fact-and-closing-model.md`
9. `docs/selling-houses-competition-and-cosale-architecture.md`
10. `docs/selling-houses-matter-template-architecture.md`
11. `docs/selling-houses-projection-architecture.md`
12. `docs/selling-houses-interface-detail-design.md`
13. `docs/selling-houses-organization-acn-model.md`
14. `docs/selling-houses-daily-tick-design.md`
15. `docs/selling-houses-architecture-diagrams.md`
16. `src/selling-houses/domain/`
17. `src/selling-houses/ui/features/`

### 如果要继续做统一入口

建议先看：

1. `src/App.tsx`
2. `src/components/Hub/WorkspaceHub.tsx`
3. `src/components/Auth/AuthOverlay.tsx`
4. `README.md`

重点确认：

- 激活逻辑是否清楚
- Hub 是否仍然表达当前 workspace registry
- 入口文案和代码现状是否一致

## 开工前的快速检查

开始改代码前，至少看一眼：

- `git status --short`
- 相关目录最近有哪些未提交改动
- 是否已经有对应文档说明这块在迁移中

## 常见误区

- 不要把自动生成的 thread memory 当最终真相。
- 不要因为产品名变化就急着大规模重命名 `open-day` 路径。
- 不要在没有确认改动范围前直接 `git add .`。
- 不要只看 UI 就断言项目重点仍然只是开放日页面美化。
- 不要只改前端表现层就以为已经完成开放日或资产顾问的核心工作。
