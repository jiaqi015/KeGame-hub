# 卖房平台层到世界层物理表设计

最后更新：2026-04-21

这份文档只回答一件事：

> 如果现在要把“平台账号层 -> 玩家层 -> 局层 -> 卖房世界层 -> 结果榜单层”正式落库，第一版物理表应该怎么收。

---

## 0. 一句话结论

第一版不要试图把所有世界细节都拆成几十张强关系表。

更稳的做法是：

```text
平台层
  先把 account / player / grant / session 定死

局层
  先把 game_run / save / snapshot / result / leaderboard 定死

世界层
  恢复真相优先用 run save
  结构化查询优先补 event / matter / deal / evaluation 四类事实表
```

也就是说：

> 第一版先把“能稳定恢复、能稳定归人、能稳定结算、能稳定查榜”做扎实；不要一上来把所有运行时对象都硬拆成最终范式。

兼容说明：

- 旧 `maintainer_*` 字段或本地 `maintainer userId` 只允许作为 legacy 迁移桥存在
- 新主链一律使用 `account_id / player_profile_id / run_id`

---

## 1. 设计目标

这版物理表要同时满足 6 个目标：

1. 同一个平台账号，在不同设备、不同浏览器里是同一个人。
2. 同一个账号，在不同 workspace 下可以有不同玩家身份。
3. 一局可以完整恢复。
4. 每日快照、最终结果、排行榜口径彼此分层。
5. 卖房世界里的关键结构化事实可以查询、审计、复盘。
6. 后面要把 `selling-houses` 从本地 / file / fallback 接到正式 Neon 时，不需要推翻这条主链。

---

## 2. 分层原则

按物理层看，建议固定成 5 层：

### 2.1 平台身份层

回答：

- 你是谁
- 你怎么登录
- 你当前有哪些 workspace 权限

### 2.2 玩家生涯层

回答：

- 你在某个游戏里是谁
- 你的长期身份、昵称、生涯统计是什么

### 2.3 局运行层

回答：

- 这一局是谁开的
- 当前跑到哪天
- 如何恢复
- 每日快照和正式结果是什么

### 2.4 世界结构化事实层

回答：

- 这局里发生了哪些关键事实
- 哪些事实要支持查询、审计、归因、复盘

### 2.5 榜单与聚合层

回答：

- 单局怎么上榜
- 生涯怎么累计
- 哪些榜单吃什么口径

---

## 3. 主键链

第一版一定要把主键链定死：

```text
accounts.account_id
  -> player_profiles.account_id
  -> game_runs.account_id
  -> run_results.account_id
  -> leaderboard_entries.account_id

player_profiles.player_profile_id
  -> game_runs.player_profile_id
  -> player_career_stats.player_profile_id
  -> player_achievements.player_profile_id

game_runs.run_id
  -> game_run_saves.run_id
  -> daily_run_snapshots.run_id
  -> run_events.run_id
  -> run_matters.run_id
  -> run_deals.run_id
  -> run_good_house_evaluations.run_id
  -> run_results.run_id
```

硬规则：

- 平台稳定主键只能是 `account_id`
- 玩家稳定主键只能是 `player_profile_id`
- 一局稳定主键只能是 `run_id`
- 世界层事实必须挂在 `run_id` 下
- 榜单不能直接读 `game_run_saves`

---

## 4. 表清单总览

### 4.1 平台层

- `accounts`
- `account_identities`
- `account_sessions`
- `account_workspace_grants`

### 4.2 玩家层

- `player_profiles`
- `player_career_stats`
- `player_achievements`

### 4.3 局层

- `game_runs`
- `game_run_saves`
- `daily_run_snapshots`
- `run_results`

### 4.4 世界结构化事实层

- `run_events`
- `run_matters`
- `run_deals`
- `run_good_house_evaluations`

### 4.5 榜单层

- `leaderboard_entries`

---

## 5. 平台层表设计

### 5.1 `accounts`

作用：

- 平台账号主表
- 一个自然人一个稳定账号

建议字段：

- `account_id` PK
- `primary_email`
- `email_domain`
- `display_name`
- `nickname`
- `status`
- `created_at`
- `updated_at`
- `last_login_at`

建议约束：

- `unique(primary_email)`
- `index(email_domain, status)`

说明：

- `nickname` 可以变
- `primary_email` 可以作为业务唯一键，但系统内部仍以 `account_id` 为准

### 5.2 `account_identities`

作用：

- 记录账号有哪些登录身份
- 支持免验证码白名单、正式邮箱验证码、后续别的身份源

建议字段：

- `account_identity_id` PK
- `account_id` FK
- `identity_type`
- `identity_value`
- `is_primary`
- `verified_at`
- `meta_json`
- `created_at`

建议约束：

- `unique(identity_type, identity_value)`
- `index(account_id, is_primary)`

### 5.3 `account_sessions`

作用：

- 记录登录会话
- 做审计和风控，不承载业务真相

建议字段：

- `account_session_id` PK
- `account_id` FK
- `session_token_hash`
- `login_method`
- `ip_hash`
- `user_agent`
- `expires_at`
- `revoked_at`
- `created_at`

建议约束：

- `unique(session_token_hash)`
- `index(account_id, created_at desc)`

### 5.4 `account_workspace_grants`

作用：

- 记录账号对各 workspace 的访问权

建议字段：

- `account_workspace_grant_id` PK
- `account_id` FK
- `workspace_id`
- `grant_code`
- `grant_scope`
- `source_type`
- `granted_by`
- `granted_at`
- `expires_at`
- `status`

建议约束：

- `unique(account_id, workspace_id, grant_code)`
- `index(workspace_id, status)`

说明：

- `grant_code` 可以是 `all`、`seller`、`open-day` 这类
- `all` 是授权语义，不是 UI 页面名

---

## 6. 玩家层表设计

### 6.1 `player_profiles`

作用：

- 账号在某个 workspace 下的玩家身份

建议字段：

- `player_profile_id` PK
- `account_id` FK
- `workspace_id`
- `role_code`
- `display_name`
- `avatar_seed`
- `status`
- `created_at`
- `updated_at`

建议约束：

- `unique(account_id, workspace_id)`
- `index(workspace_id, role_code)`

说明：

- 同一个账号进不同游戏，可以生成不同 `player_profile`
- 排行榜展示名优先取这里，不直接吃 `accounts.nickname`

### 6.2 `player_career_stats`

作用：

- 某个玩家在某个 workspace 下的长期累计结果

建议字段：

- `player_career_stats_id` PK
- `player_profile_id` FK
- `workspace_id`
- `total_runs`
- `finished_runs`
- `best_run_score`
- `career_total_score`
- `total_deals`
- `total_days_played`
- `last_finished_run_id`
- `updated_at`

建议约束：

- `unique(player_profile_id)`

### 6.3 `player_achievements`

作用：

- 成就、段位、解锁记录

建议字段：

- `player_achievement_id` PK
- `player_profile_id` FK
- `achievement_code`
- `workspace_id`
- `source_run_id`
- `unlocked_at`
- `meta_json`

建议约束：

- `unique(player_profile_id, achievement_code)`
- `index(workspace_id, unlocked_at desc)`

---

## 7. 局层表设计

### 7.1 `game_runs`

作用：

- 一局的主表

建议字段：

- `run_id` PK
- `workspace_id`
- `scenario_id`
- `difficulty_tier_id`
- `account_id` FK
- `player_profile_id` FK
- `status`
- `current_day`
- `current_phase`
- `started_at`
- `finished_at`
- `seed`
- `sync_version`
- `created_at`
- `updated_at`

建议约束：

- `index(account_id, created_at desc)`
- `index(player_profile_id, status, updated_at desc)`
- `index(workspace_id, scenario_id, created_at desc)`

### 7.2 `game_run_saves`

作用：

- 一局的恢复真相
- 第一版以完整世界快照为主

建议字段：

- `game_run_save_id` PK
- `run_id` FK
- `save_version`
- `save_format_version`
- `save_data_json`
- `checksum_sha256`
- `created_at`

建议约束：

- `unique(run_id, save_version)`
- `index(run_id, created_at desc)`

硬规则：

- `save_data_json` 是恢复真相，不是榜单数据源
- 页面投影不能反向写回这里当结构化事实

### 7.3 `daily_run_snapshots`

作用：

- 每日结算后的摘要快照
- 用于复盘、趋势、对账，不作为主恢复来源

建议字段：

- `daily_run_snapshot_id` PK
- `run_id` FK
- `day_index`
- `estimated_total_score`
- `estimated_ability_score`
- `estimated_hold_score`
- `estimated_satisfaction_score`
- `score_delta_from_yesterday`
- `active_opportunity_count`
- `offer_opportunity_count`
- `closed_deal_count`
- `summary_json`
- `key_event_ids_json`
- `core_case_count`
- `risk_count`
- `created_at`

建议约束：

- `unique(run_id, day_index)`
- `index(run_id, day_index desc)`

说明：

- `daily_run_snapshots` 只存每日趋势、摘要、复盘锚点
- `offer_opportunity_count` 表示已到机会末段、等待成交评估的数量
- `closed_deal_count` 记录正式成交数量，但这层仍不是最终榜单成绩源

### 7.4 `run_results`

作用：

- 一局正式结算结果
- 榜单和生涯聚合只认它

建议字段：

- `run_result_id` PK
- `run_id` FK
- `account_id` FK
- `player_profile_id` FK
- `workspace_id`
- `scenario_id`
- `difficulty_tier_id`
- `is_qualified_for_leaderboard`
- `total_score`
- `ability_score`
- `hold_score`
- `satisfaction_score`
- `rank_title`
- `ending_code`
- `days_played`
- `sold_count`
- `hold_count`
- `lost_listing_count`
- `lost_customer_count`
- `result_summary`
- `highlight_tags_json`
- `settlement_json`
- `settled_at`

建议约束：

- `unique(run_id)`
- `index(workspace_id, total_score desc)`
- `index(player_profile_id, settled_at desc)`

说明：

- `run_results` 才是正式结算来源
- `leaderboard_entries` 只能消费 `run_results` 和 `player_career_stats`

---

## 8. 世界结构化事实层

这一层的原则很重要：

- 不是把整个世界全拆平
- 而是只把真正要查、要审计、要做榜单解释、要做复盘归因的事实拆出来

### 8.1 `run_events`

作用：

- 一局里的统一事件流水

建议字段：

- `run_event_id` PK
- `run_id` FK
- `day_index`
- `sequence_in_day`
- `event_type`
- `scope_type`
- `subject_type`
- `subject_id`
- `actor_type`
- `actor_id`
- `payload_json`
- `created_at`

建议约束：

- `unique(run_id, day_index, sequence_in_day)`
- `index(run_id, created_at)`
- `index(run_id, subject_type, subject_id)`

说明：

- 这是统一流水，不要求一开始把所有 event payload 强拆字段
- 但必须保证对象定位字段和时序字段稳定

### 8.2 `run_matters`

作用：

- 记录需要玩家处理或系统推动的事项

建议字段：

- `run_matter_id` PK
- `run_id` FK
- `matter_id`
- `matter_scene`
- `template_type`
- `presentation_type`
- `lifecycle_category`
- `priority`
- `status`
- `case_id`
- `customer_id`
- `owner_id`
- `opened_at_day`
- `due_at_day`
- `scheduled_at_json`
- `summary_text`
- `payload_json`
- `resolved_at`
- `created_at`

建议约束：

- `unique(run_id, matter_id)`
- `index(run_id, status, priority)`
- `index(run_id, case_id, status)`

### 8.3 `run_deals`

作用：

- 正式成交事实
- 把成交从机会状态里独立出来

建议字段：

- `run_deal_id` PK
- `run_id` FK
- `deal_id`
- `case_id`
- `owner_id`
- `customer_id`
- `customer_case_relation_id`
- `listing_broker_id`
- `buyer_broker_id`
- `brand_id`
- `store_id`
- `acn_id`
- `deal_type`
- `deal_price`
- `deal_day_index`
- `source_channel`
- `meta_json`
- `created_at`

建议约束：

- `unique(run_id, deal_id)`
- `index(run_id, deal_day_index desc)`
- `index(run_id, case_id)`
- `index(run_id, acn_id, deal_day_index desc)`

说明：

- 这张表记录“谁和谁成交了、由哪个组织成交、房经纪人和客经纪人是谁”
- 成交不应该只是 `CustomerCaseRelation.stage = 'closed'`
- 旧 `maintainer_*` 人员标识如果还存在，只能做 legacy 映射桥，不能替代 `account_id` / `player_profile_id`

### 8.4 `run_good_house_evaluations`

作用：

- 存每套房在某一天的好房模型输出

建议字段：

- `run_good_house_evaluation_id` PK
- `run_id` FK
- `case_id`
- `day_index`
- `model_version`
- `d1_customer_pool`
- `d2_attractiveness`
- `d3_owner_readiness`
- `good_house_score`
- `good_house_level`
- `reason_tags_json`
- `created_at`

建议约束：

- `unique(run_id, case_id, day_index, model_version)`
- `index(run_id, day_index desc, good_house_score desc)`
- `index(run_id, case_id, day_index desc)`

说明：

- 这张表就是 `GoodHouseModelOutput / GoodHouseEvaluation` 的物理落点
- 它不是 `cases.good_house_score`

---

## 9. 榜单层设计

### 9.1 `leaderboard_entries`

作用：

- 各类榜单的可查询条目

建议字段：

- `leaderboard_entry_id` PK
- `workspace_id`
- `leaderboard_code`
- `bucket_code`
- `account_id` FK
- `player_profile_id` FK
- `run_result_id` FK
- `score_value`
- `display_name`
- `rank_value`
- `meta_json`
- `created_at`

建议约束：

- `index(workspace_id, leaderboard_code, score_value desc)`
- `index(workspace_id, leaderboard_code, rank_value asc)`
- `index(player_profile_id, leaderboard_code, created_at desc)`

说明：

- `leaderboard_code` 可以是 `total-score`、`best-run`、`run-count`
- 这张表只吃 `run_results` 和 `player_career_stats`

---

## 10. 哪些事实先不要拆表

第一版不建议把这些都硬拆成独立主表：

- 每个 `Case` 的完整画像
- 每个 `Owner` 的完整画像
- 每个 `Customer` 的完整画像
- 每个 `CustomerCaseRelation` 的全量运行态
- 每个竞品关系、联卖关系的全量中间过程

原因不是它们不重要，而是：

1. 第一版恢复真相已经在 `game_run_saves`
2. 这些对象的字段还在持续演化
3. 现在最急的是稳定主键链、恢复链、结算链、榜单链

更稳的做法是：

- 先在 `save_data_json` 里保真
- 先把关键查询需求抽成 `run_events / run_matters / run_deals / run_good_house_evaluations`
- 等领域对象字段稳定后，再考虑把 `case / customer / owner / relation` 做成正式宽表或历史表

---

## 11. 第一版索引与唯一键重点

如果只挑最关键的一批，必须先有这些：

### 11.1 唯一键

- `accounts.primary_email`
- `account_identities(identity_type, identity_value)`
- `player_profiles(account_id, workspace_id)`
- `game_run_saves(run_id, save_version)`
- `daily_run_snapshots(run_id, day_index)`
- `run_results.run_id`
- `run_events(run_id, day_index, sequence_in_day)`
- `run_matters(run_id, matter_id)`
- `run_deals(run_id, deal_id)`
- `run_good_house_evaluations(run_id, case_id, day_index, model_version)`

### 11.2 高价值索引

- `game_runs(player_profile_id, status, updated_at desc)`
- `run_results(workspace_id, total_score desc)`
- `leaderboard_entries(workspace_id, leaderboard_code, score_value desc)`
- `run_events(run_id, subject_type, subject_id)`
- `run_matters(run_id, status, priority)`
- `run_deals(run_id, case_id)`
- `run_good_house_evaluations(run_id, day_index desc, good_house_score desc)`

---

## 12. 和现有文档的关系

这份物理表设计是对 3 条线的下沉：

1. [平台账号、玩家、局、得分、总分数据架构](./platform-account-player-run-score-architecture.md)
   定义账号层、玩家层、局层、结果层、榜单层的逻辑边界。
2. [卖房领域架构 v1](./selling-houses-domain-architecture-v1.md)
   定义世界里的对象边界、模型边界和持久化边界。
3. [卖房后端与持久化下一步](./selling-houses-backend-next-steps.md)
   定义哪部分适合下一轮单独开题。

它不替代领域模型文档，也不替代实现计划。

它只负责一件事：

> 把“该怎么正式落库”收成第一版稳定口径。

---

## 13. 最后一句

第一版正式落库，不求一步到位把世界拆完。

先稳住：

- `account_id`
- `player_profile_id`
- `run_id`
- `run_result`
- `leaderboard`
- `run_events`
- `run_matters`
- `run_deals`
- `run_good_house_evaluations`

这几根梁先立住，后面世界层再长细节，系统都不会歪。
