# 卖房 Broker Action 合同

最后整理：2026-05-18

经纪人动作不是按钮集合，而是 broker POV 下可执行的 command。动作必须由 belief / pressure / available command 生成，并在执行后留下 receipt。

## 1. Action 主链

```text
actor knowledge
  → belief
  → pressure
  → available command
  → broker action
  → receipt
  → causal event
  → runtime feedback
```

## 2. 动作来源

动作只能来自：

- 当前 Matter 的 available commands。
- listing / customer / owner / market projection 提供的 command refs。
- organization source 形成的 manager command。

不能来自页面 if/else 或 legacy score shortcut。

## 3. 动作类型

| 类型 | 示例 |
| --- | --- |
| owner | 首次面访、价格沟通、业主反馈 |
| customer | 回访、邀约、带看、二看、谈判 |
| listing | 补卖点、调价建议、推广投放 |
| market | 竞品反馈、市场解释、聚焦会提报 |
| organization | 联卖协作、资源申请、经理反馈 |
| outcome | 成交收口、撤盘挽回、流失复盘 |

## 4. Command 必须包含

- `actorId`
- `targetRefs`
- `matterId`
- `sourceRecordIds`
- `causalEventIds`
- `preconditions`
- `resourceCost`
- `expectedReceipts`
- `failureReason`

## 5. 执行结果

动作执行后至少产生：

- receipt
- causal event
- resource delta 或 relation delta
- replay anchor

否则不能算进入 Big World。

## 6. 推荐排序

推荐动作排序必须基于：

- actor-visible urgency
- owner / customer / market pressure
- command feasibility
- expected receipt impact
- resource availability

## 7. 反模式

- “建议动作”存进 world。
- 按 `trust < x` 直接推荐。
- 按 UI tab 写死按钮。
- 动作完成只弹 toast。
- 动作没有 receipt，不能回放。
