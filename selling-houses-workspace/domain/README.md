# Selling Houses Domain

这个模块现在明确分成四层：

- `worlds/`
  存 World 规格。这里放所有局共享、随版本迭代的稳定内容，比如板块、房源原型、客户库、业主原型、事件模板。

- `scenarios/`
  存 Scenario 剧本。这里决定这一局用哪些房、从哪天开始、有哪些脚本事件、竞争关系和规则覆写。

- `config/`
  存系统规则和难度配置。这里是数值调参层，不承载具体内容世界观。

- `engine/`
  存 Run 期间的推进逻辑。这里按市场、线索、竞争、事件、动作执行拆分，`engine.ts` 只负责编排一天的顺序。

运行时边界：

- `World`
  回答“这个游戏世界里可能发生什么”。

- `Scenario`
  回答“这一局如何开、教什么、怎么结束”。

- `Run`
  回答“玩家这一把当前打到了哪里”。它来自 `createInitialState(snapshot, seed)`，并把 `scenarioSnapshot` 固化进 `runContext`。

- `GameRules`
  是系统旋钮，不是内容。调难度优先改这里，做特定局面微调再由 Scenario 局部覆写。
