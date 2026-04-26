# selling-houses outcome calibration snapshot

## 基本信息

| 项 | 值 |
|---|---|
| 日期 | 2026-04-25 |
| 当前提交 | `6cb2006` |
| 运行命令 | `npm run selfplay:outcome-lab -- --runs 500` |
| JSON 快照 | `docs/selling-houses-outcome-calibration-500run.json` |
| runs | 500 |
| seed | 20260424 |
| 范围 | RC 校准冻结 |

## 500-run 核心结果

| 难度 | averageDeals | medianDeals | pAtLeastOne | averageRivalDeals | delayedDeals | targetStatus |
|---|---:|---:|---:|---:|---:|---|
| warmup | 1.86 | 2 | 99.8% | 0.02 | 0 | PASS |
| easy | 2.40 | 2 | 100% | 0.08 | 0 | PASS |
| standard | 1.23 | 1 | 100% | 0.81 | 0 | WATCH |
| advanced | 1.14 | 1 | 66.6% | 1.64 | 0 | PASS |
| hard | 0.58 | 1 | 51.6% | 2.02 | 0 | PASS |
| extreme | 0.27 | 0 | 26.8% | 2.49 | 0 | PASS |

## RC Gate

| 难度 | 指标 | 实际 | 目标区间 | 状态 |
|---|---|---:|---|---|
| warmup | averageDeals | 1.86 | 1.6-2.2 | PASS |
| warmup | pAtLeastOne | 99.8% | 95%-100% | PASS |
| warmup | averageRivalDeals | 0.02 | 0-0.8 | PASS |
| easy | averageDeals | 2.40 | 2.0-2.7 | PASS |
| easy | pAtLeastOne | 100% | 95%-100% | PASS |
| easy | averageRivalDeals | 0.08 | 0-0.9 | PASS |
| standard | averageDeals | 1.23 | 1.05-1.45 | PASS |
| standard | pAtLeastOne | 100% | 85%-100% | WATCH |
| standard | averageRivalDeals | 0.81 | 0.8-2.6 | PASS |
| advanced | averageDeals | 1.14 | 0.85-1.25 | PASS |
| advanced | pAtLeastOne | 66.6% | 55%-85% | PASS |
| advanced | averageRivalDeals | 1.64 | 1.2-3.0 | PASS |
| hard | averageDeals | 0.58 | 0.45-0.85 | PASS |
| hard | pAtLeastOne | 51.6% | 40%-70% | PASS |
| hard | averageRivalDeals | 2.02 | 1.8-3.5 | PASS |
| extreme | averageDeals | 0.27 | 0.25-0.50 | PASS |
| extreme | pAtLeastOne | 26.8% | 20%-45% | PASS |
| extreme | averageRivalDeals | 2.49 | 2.0-3.8 | PASS |

## Rival Slot Flow

| 难度 | noSlotAttempts | failedRolls | claimSuccessRate | availableSlotsAtEnd | avgMaxDailyRivalClaims | maxDailyRivalClaimsObserved |
|---|---:|---:|---:|---:|---:|---:|
| standard | 0.34 | 0.76 | 42.57% | 1.96 | 0.69 | 1 |
| advanced | 1.93 | 1.01 | 35.74% | 1.22 | 0.97 | 2 |
| hard | 9.80 | 1.57 | 15.08% | 0.38 | 0.99 | 2 |
| extreme | 13.75 | 0.97 | 14.46% | 0.15 | 1.01 | 2 |

## Open-slot Claim 检查

| 项 | 结论 |
|---|---|
| 集中爆发 | hard / extreme 单日最大对手 claim 观测值为 2，未出现异常集中 |
| 玩家优先级 | daily tick 中 `settlePendingDealClosings` 先于 `tryClaimOpenMarketDealForRivals` |
| no-slot attempts | hard / extreme 偏高，但 delayedDeals 为 0，且对手成交在目标内 |
| 后段机会 | hard / extreme 玩家 averageDeals 仍在目标区间 |
| 本轮改动 | 不调参，不改 claim flow |

## 本轮调参

| 难度 | 字段 | 修改前 | 修改后 | 原因 |
|---|---|---:|---:|---|
| 无 | 无 | - | - | 500-run 未触发调参条件 |

## 结论

| 项 | 结论 |
|---|---|
| 玩家曲线 | 随难度整体下降，目标内 |
| 对手曲线 | hard / extreme 稳定回到目标区间 |
| standard | pAtLeastOne 为 100%，保留 WATCH |
| 成交池 | 仍为 21 天共享成交池 |
| 结构 | `marketOutcome` 结构不变 |
| 文案 | 未扩展结算复盘，未新增解释文案 |

## 下一轮关注

| 优先级 | 事项 |
|---|---|
| P1 | standard 至少一单率持续 100%，上线前继续观察 |
| P1 | hard / extreme open-slot claim 在手玩长局中继续抽检 |
| P2 | warmup / easy 对手存在感低但目标内，暂不压低玩家体验 |
