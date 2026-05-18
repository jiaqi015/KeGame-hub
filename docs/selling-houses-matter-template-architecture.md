# 卖房 Matter / Command 合同

最后整理：2026-05-18

Matter 是玩家正在处理的一件业务事；Command 是系统允许执行的动作；Receipt 是动作后的世界回执。Matter 不能绕过 command / receipt / causal 主链直接改结果。

## 1. 主链

```text
Matter
  → available command
  → command execution
  → receipt
  → causal event
  → relation / runtime feedback
  → projection update
```

## 2. Matter 放什么

| 字段 | 含义 |
| --- | --- |
| `matterId` | 稳定事项 ID |
| `scene` | 业务场景，如面访、带看、议价、反馈、推广、联卖 |
| `subjectRefs` | 相关 listing / owner / customer / broker / organization |
| `status` | pending / active / completed / abandoned |
| `availableCommands` | 当前可执行命令 |
| `receiptRefs` | 已执行动作留下的回执 |
| `causalRefs` | Matter 相关因果事件 |

## 3. Command 要求

Command 必须明确：

- 谁执行。
- 对谁执行。
- 前置条件。
- 资源消耗。
- 可能产生的 receipt。
- 失败原因。

Command 不能只是按钮文案。

## 4. Matter 场景

核心场景：

- 首次面访
- 业主反馈
- 竞品反馈
- 带看安排
- 客户回访
- 价格沟通
- 推广投放
- 联卖协作
- 聚焦会提报
- 成交收口

## 5. Receipt 要求

Matter 内任何动作完成后都要留下 receipt：

- action receipt
- process receipt
- organization receipt
- resource receipt
- outcome receipt

receipt 必须反馈 runtime，影响下一天的 actor knowledge、belief、pressure 和 available commands。

## 6. UI 边界

Matter UI 可以是卡片、详情页或专屏，但必须：

- 显示为什么现在做这件事。
- 显示 command preconditions。
- 执行后写 receipt。
- 在 review 中可回放。

## 7. 反模式

- Matter 只是 action list 的包装。
- 执行 Matter 只改 UI 状态。
- Matter 完成后没有 receipt。
- Matter 推荐直接读 legacy field。
- Matter 详情页看不到 source / causal / command / receipt。
