# 卖房后端与持久化下一步

最后更新：2026-04-21

这份文档只回答一件事：

> 在本轮 UI 冲刺之后，后端、持久化、账号、局、得分这几层，哪些可以继续小修，哪些必须下一轮单独开题。

---

## 1. 本轮确认过的事实

- `run` 的保存与恢复主线还能跑通。
- `verify:maintainer` 通过，说明当前保存、读取、验证、排行榜基础链路没有被这轮 UI 改动打坏。
- `selfplay:golden` 维持 `90` 分、`5/5` 成交，没有把卖房主循环跑坏。
- 这轮新增的是 `application/projections/*` 与 UI 表达层，不涉及 schema 迁移。

---

## 2. 这轮可以继续做的小修

- 继续补 `projection` 层，把 UI 判断从页面里抽出去。
- 继续补 leaderboard、result、profile 的只读投影。
- 继续做本地 file / cloud fallback 的只读校验。
- 继续补浏览器回归和脚本验证。

这些都不应该改：

- `GameState` 存储结构
- leaderboard HTTP 契约
- run save/load 基础契约
- auth 主流程

---

## 3. 这轮不要碰的东西

以下内容必须下一轮单独开题，不要夹在 UI 线程里顺手做：

- `account / player / run / score / career` 的正式拆模
- Neon schema 扩表或迁移
- 每日快照表、事件审计表、长期生涯表
- leaderboard 维度扩展成总分榜 / 单局最高榜 / 局数榜的后端聚合重构
- 账号体系和游戏体系的彻底解耦

原因很简单：

- 这几个改动会穿透接口、仓储、云同步、历史数据兼容
- 一旦和 UI 线程并行，很容易互相踩
- 现在文档方向已经清楚，但代码契约还没到可以随手升级的阶段

---

## 4. 下一轮推荐顺序

建议顺序：

1. `player-run-score` 数据边界定稿
2. leaderboard 数据口径定稿
3. repository / handler 增量扩展
4. shadow / rebuild / verify 脚本补齐
5. UI 再接正式后端能力

一句话：

> 先把后端真相定清楚，再让前端去消费，不要反过来。
