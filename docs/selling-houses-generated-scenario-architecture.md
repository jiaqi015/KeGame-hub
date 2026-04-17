# 我是王牌资产顾问 · 生成式剧本架构设计

最后更新：2026-04-17

这份文档定义“按难度动态生成一局”时的目标架构。重点不是做一个会随机拼字段的脚本，而是做一个“约束驱动、可复现、可校验”的剧本编译器。

## 目标

- 保留现有运行时对 `ScenarioDefinition` 的依赖，不推翻 UI、存档、云端表结构。
- 让每次开局都能生成新内容，而不是只从预制池里抽。
- 让“入门 / 标准 / 高压”三档难度仍然稳定可感知，而不是随机后难度漂移。
- 让生成结果可解释、可复现、可验证，便于调试和后续做云端发布。

## 非目标

- 不做完全自由生成的叙事系统。
- 不让大模型直接生成可执行剧本 JSON。
- 不在第一期引入新的运行时状态机。
- 不把玩法难度交给单一分数函数拍脑袋控制。

## 当前系统现状

当前卖房模拟已经有三层可复用能力：

- `WorldSpec`
  固定世界数据，包含商圈、房源原型、业主原型、客户池、渠道池、随机事件模板。
- `ScenarioDefinition`
  一局游戏的完整剧本定义，包含难度、案例、竞争组、脚本事件、随机事件池、规则覆盖。
- 运行时引擎
  读取 `ScenarioDefinition` 后构造 `GameState`，并在局内继续产生随机波动。

这意味着最稳的生成式方案不是“改引擎去支持另一套格式”，而是：

- 新增一条“生成 -> 校验 -> 编译成 `ScenarioDefinition`”的流水线。
- 运行时仍然只吃现有 `ScenarioDefinition`。

## 设计原则

- 先定结构，再填内容。
- 先定难度目标，再做随机。
- 先保可玩，再追求多样。
- 先保可复现，再追求惊喜。
- 先保约束一致，再做文案包装。

## 核心思路

不要直接“随机 6 套盘 + 随机 2 个事件”。

应该采用四层结构：

1. `WorldSpec`
   固定世界素材库。
2. `DifficultyProfile`
   该难度允许出现的强度范围。
3. `ScenarioBlueprint`
   这一局想制造的局面结构。
4. `ScenarioDefinition`
   最终编译产物，继续供现有游戏运行。

一句话概括：

- 世界提供素材。
- 难度定义边界。
- 蓝图定义戏剧结构。
- 生成器负责装配。
- 校验器负责兜底。

## 为什么不能直接纯随机

如果只做字段级随机，很快会出现这些问题：

- 难度失真：`easy` 也可能抽到多个短窗口 + 高敏感业主 + 高竞争。
- 玩法失真：6 套房互不关联，没有竞争组，玩家感觉不到“经营局势”。
- 叙事失真：事件打在不相关的房源上，像系统噪音，不像真实经营。
- 校验困难：失败时不知道是数值坏了、组合坏了，还是节奏坏了。

所以生成必须从“局面结构”开始，而不是从“字段随机”开始。

## 新增领域层

建议在 `src/selling-houses/domain/` 下新增 `scenario-generation/` 目录，第一期只做编排，不改现有引擎。

建议模块拆分：

- `difficultyProfiles.ts`
  各难度的强度边界与采样范围。
- `scenarioBlueprints.ts`
  剧本蓝图库，定义“这局是什么矛盾结构”。
- `caseRoleLibrary.ts`
  单盘角色模板，例如引流盘、脆弱盘、博弈盘、收口盘。
- `eventArcLibrary.ts`
  事件弧模板，例如前期施压、中期利好、后期竞品跳价。
- `scenarioAssembler.ts`
  负责把素材和蓝图装配成完整剧本。
- `scenarioValidators.ts`
  结构校验、数值校验、难度校验、重复度校验。
- `scenarioNamer.ts`
  根据蓝图和局面生成名字、主题、简介。
- `scenarioFactory.ts`
  对外入口，输入请求，输出编译后的 `ScenarioDefinition`。

## 建议新增类型

下面这些类型是生成期专用类型，不直接给运行时消费。

### `ScenarioGenerationRequest`

- `difficultyId`
- `worldId`
- `seed`
- `generationVersion`

### `DifficultyProfile`

定义该难度的目标边界，而不是只定义文案。

建议字段：

- `caseCountRange`
- `maxDayRange`
- `scriptedEventCountRange`
- `windowDaysRange`
- `ownerTrustRange`
- `ownerPatienceRange`
- `ownerUrgencyRange`
- `marketPressureRange`
- `competitionGroupCountRange`
- `randomEventWeightBias`
- `difficultyScoreTarget`

### `ScenarioBlueprint`

定义一类局面的结构。

建议字段：

- `id`
- `difficultyId`
- `label`
- `caseRoleSlots`
- `marketMixRule`
- `competitionTopology`
- `eventArc`
- `ruleAdjustments`
- `namingTokens`

### `CaseRoleSlot`

定义单个盘在整局里的戏剧职责。

建议字段：

- `role`
- `allowedMarketCells`
- `allowedLayouts`
- `allowedOwnerArchetypes`
- `pricePosition`
- `windowPressure`
- `trustBias`
- `heatBias`
- `urgencyBias`
- `mustJoinCompetitionGroup`

### `GeneratedScenarioMeta`

这是可选字段，最终可以挂回 `ScenarioDefinition`，用于调试和回放。

- `origin`
- `seed`
- `blueprintId`
- `generationVersion`
- `difficultyScore`
- `validationSummary`

## 蓝图而不是模板

这里的蓝图不是“写死一张剧本”，而是“写死一类结构”。

举例：

- `easy-relationship-recovery`
  一张更友好的起手局，重点是先稳关系、再做热度。
- `standard-cross-pressure`
  两个商圈同时承压，要求玩家做资源排序。
- `hard-window-squeeze`
  多个短窗口盘并存，但其中必须存在 1 个还能救、1 个该放弃、1 个最值得押注的盘。

蓝图规定的是：

- 应该有哪些角色。
- 这些角色之间应如何关联。
- 事件应该打在哪类角色上。
- 规则偏置该往哪边压。

蓝图不规定具体是“瑞和里还是江悦府”，那一步交给装配器。

## 单盘角色体系

生成式剧本不能把每套房当成平等条目。每套房需要先被赋予角色。

建议至少保留这几类角色：

- `anchor`
  这局最值得押注的高价值盘。
- `fragile`
  窗口短、关系脆，容易撤盘。
- `traffic`
  更适合拉带看或制造热度的盘。
- `grind`
  推进慢，但稳定。
- `spoiler`
  会被竞品或消息强烈扰动的盘。
- `sacrifice`
  高压局里允许存在的“理论上可放弃盘”。

这样做的好处：

- 玩家能感受到局面差异。
- 事件能找到自然落点。
- 难度能通过角色组合控制，而不是只靠数值整体抬高。

## 生成流水线

建议按七步走。

### 1. 选择难度画像

输入 `difficultyId` 后，先读取对应的 `DifficultyProfile`。

输出：

- 目标房源数
- 目标天数
- 目标压力区间
- 目标事件密度
- 目标竞争关系密度

### 2. 选择蓝图

在该难度下，从若干 `ScenarioBlueprint` 中按权重抽取一个。

这一步决定的是局面结构，例如：

- 关系回温局
- 双区拉扯局
- 竞品踩踏局
- 窗口赛跑局

### 3. 装配房源角色

按蓝图的 `caseRoleSlots` 逐个装配。

装配顺序建议是：

1. 先决定市场格局。
2. 再挑房源原型。
3. 再挑业主原型。
4. 再根据角色偏置生成初始数值。

装配时必须满足这些约束：

- 不允许重复选到同一 `housePrototype`。
- 同一局内的房源必须能解释竞争关系。
- 高压局里短窗口盘数量有上限，不可全员都极端。
- `askPrice`、`bottomPrice`、`marketPrice` 必须保持可谈判区间。
- 业主原型与角色要兼容，例如 `fragile` 更适合 `trial-balloon` 或 `anxious`。

### 4. 组装竞争网络

竞争组不应该随机分组，而应该根据房源相似性图来生成。

建议使用：

- 同商圈优先
- 同户型优先
- 价格带接近优先
- 高替代性优先

最后再按蓝图要求编译成 1 到 N 个 `CompetitionGroup`。

### 5. 生成事件弧

脚本事件不直接随机抽，而是按 `eventArc` 生成。

推荐把事件弧分成三段：

- 前期定调
  玩家一开局就知道这局在考什么。
- 中期拐点
  局面从“可经营”转向“要做取舍”。
- 后期收口
  强迫玩家兑现前面决策。

事件生成要满足：

- 必须打在有角色意义的目标上。
- 不要连续三天都打同一套房。
- 不能让同一盘在同一阶段同时承受互相冲突的事件。
- 高压局可以有负面密集事件，但至少要保留一个可操作窗口。

### 6. 生成文案包装

名字、主题、简介最后生成，不要先生成。

建议根据这些信息拼装：

- 蓝图类型
- 主矛盾
- 市场结构
- 节奏特征

这样文案会更稳定，例如：

- `窗口赛跑局`
- `双区拉扯局`
- `竞价错位局`

### 7. 校验并编译

通过所有校验后，产出标准 `ScenarioDefinition`。

如果校验失败：

- 换一套候选房源重新装配。
- 或换一条蓝图重试。
- 不能把失败结果直接放行到前端。

## 校验体系

生成合理与否，核心在校验器，不在生成器本身。

建议至少做四层校验。

### A. 结构校验

- 房源数符合难度要求。
- 所有引用都能在 `WorldSpec` 中找到。
- 竞争组成员存在且不为空。
- 事件目标存在且时序合法。

### B. 数值校验

- `bottomPrice < askPrice`
- `windowDays > 0`
- `initialTrust`、`initialPatience`、`initialHeat`、`initialUrgency` 在合法区间
- 同一难度下整体均值落在目标区间

### C. 玩法校验

- 至少存在 1 个可优先推进盘。
- 至少存在 1 个需要保关系的脆弱盘。
- 至少存在 1 组玩家能感知到的竞争关系。
- 不能出现“所有盘都同质化”的局面。

### D. 难度校验

建议把难度拆成多个子分，而不是只算总分。

例如：

- `windowPressureScore`
- `relationshipFragilityScore`
- `competitionCouplingScore`
- `pricingMisfitScore`
- `eventBurstScore`

最后得到一个综合 `difficultyScore`，要求落在该难度目标区间内。

## 自玩校验

仅靠静态规则还不够，最好复用已有自玩能力做二次校验。

项目里已经有：

- `LocalAdversarialSelfPlayArena`
- `scripts/verify-selling-houses.ts`

建议让生成器在开发模式下做抽样验证：

- 每个蓝图抽固定数量种子。
- 自玩若干局。
- 观察成交数、撤盘数、剩余活跃线索、评分分布。

校验目标不是“AI 必须打赢”，而是：

- `easy` 不该大面积秒崩。
- `hard` 不该大面积白给。
- 不同蓝图之间应该有显著体感差异。

## 难度应该如何控制

难度不应该通过“全字段一起上调”控制。

建议分成五个旋钮：

1. 房源数量
   直接影响注意力分配压力。
2. 窗口紧迫度
   直接影响保盘难度。
3. 竞争耦合度
   直接影响错误动作外溢。
4. 关系脆弱度
   直接影响沟通容错率。
5. 事件密度
   直接影响中后期节奏波动。

一个合理的例子：

- `easy`
  房源少，窗口宽，竞争组少，负面事件稀，更多顺风事件。
- `standard`
  房源中等，局势开始联动，要求开始做取舍。
- `hard`
  房源更多，短窗口比例更高，强竞争组更多，脚本事件更早更密。

## 随机的边界

建议明确把随机拆成两类：

### 生成期随机

决定这局“长什么样”。

- 选蓝图
- 选房源
- 选业主
- 选事件目标
- 生成标题

这部分必须使用固定 `scenarioSeed`，保证可复现。

### 运行期随机

决定这局“跑成什么样”。

- 日常随机事件
- 线索波动
- 局内轻微数值抖动

这部分继续使用当前 `rngSeed` 机制。

这两个随机源不要混用，否则难以复盘。

## 命名与可解释性

动态生成后，玩家仍然需要感知“这局是什么”。

建议所有生成剧本都能回填一段可解释摘要：

- 这局主矛盾是什么。
- 哪几套盘最值得关注。
- 为什么它属于这个难度。

这段解释可以用于：

- 开局页展示
- 调试日志
- 自玩分析
- 云端剧本审核

## 与现有系统的兼容方式

第一期不要修改 UI 契约。

推荐兼容策略：

- 生成器最终仍输出 `ScenarioDefinition`
- `ScenarioSummary` 继续从结果里裁剪
- `useGame` 仍通过 `scenarioId` 和 `ScenarioSnapshot` 启动
- 存档继续保存 `scenarioSnapshot`

也就是说：

- 生成器是“剧本来源”的新分支
- 不是“运行时协议”的新分支

## 云端与本地策略

建议先本地生成，后端缓存，最后再考虑预发布。

### 阶段一

- 本地根据 `difficultyId + seed` 生成。
- 只在本地运行，不入库。

### 阶段二

- 服务端生成并缓存 `ScenarioDefinition`。
- `scenarioId` 采用 `generated:<difficulty>:<seed>:<version>`。

### 阶段三

- 把表现好的生成结果持久化为“精选生成剧本”。
- 云端可以同时混合“手工剧本”和“生成剧本”。

## 最小可行版本

建议 MVP 不要试图一次性覆盖所有自由度。

MVP 只做这些：

- 保留现有 `WorldSpec`
- 只支持 3 到 5 个 `ScenarioBlueprint`
- 只支持 4 到 6 个单盘角色
- 只支持 2 到 3 类事件弧
- 只支持本地生成
- 只输出标准 `ScenarioDefinition`

这样能最快验证两件事：

- 体感上是否比预制池更耐玩
- 难度是否能稳定落在预期区间

## 推荐落地顺序

1. 先抽离 `DifficultyProfile`
2. 再定义 `ScenarioBlueprint`
3. 再做 `scenarioAssembler`
4. 再补 `scenarioValidators`
5. 再接开局入口
6. 最后再做云端缓存和自玩校准

## 第一批蓝图建议

- `easy-relationship-recovery`
  重点学保关系和稳节奏。
- `easy-open-day-burst`
  重点学热度拉升和开放日。
- `standard-double-market-balance`
  重点学双区取舍。
- `standard-cross-pressure`
  重点学联动伤害。
- `hard-window-squeeze`
  重点学先救谁、放谁。
- `hard-competition-collapse`
  重点学竞品踩踏下的资源排序。

## 结论

合理生成的关键，不是让系统更会“随机”，而是让系统更会“编排”。

真正可落地的方案应该是：

- 固定世界素材
- 难度画像定边界
- 蓝图定义局势结构
- 装配器生成完整剧本
- 校验器和自玩回归兜底
- 最终继续编译成现有 `ScenarioDefinition`

这样我们既能得到“每次开局都新鲜”，也不会丢掉当前这套玩法最重要的可控性。
