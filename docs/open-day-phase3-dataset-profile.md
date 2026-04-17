# 开放日阶段 3 迁移说明：Dataset 与 Dataset Profile

最后整理：2026-04-17

阶段 3 的目标是把“用户上传/解析出来的数据”从一次请求里的临时 JSON，升级成可追溯的数据资产。

这次先落三件事：

- `dataset`：一次解析后的数据集身份。
- `dataset_profile`：字段映射、质量报告等“这份数据如何被解释”的画像。
- `analysis_run` 绑定 `dataset_id / dataset_profile_id`，让历史测算能追到当时用的是哪份数据、哪套字段解释。

## 为什么要拆 Dataset 和 Profile

同一份 Excel 或 CSV 可能出现不同解释方式：

- 选择了不同 sheet。
- 字段映射被人工调整。
- 数据质量报告随校验逻辑变化。
- 后续可能做字段标准化、清洗规则版本化。

所以阶段 3 不把所有内容塞进 `analysis_run.command_json`，而是拆成：

- 原始解析结果：`open_day_datasets`
- 映射和质量画像：`open_day_dataset_profiles`
- 一次测算事件：`open_day_analysis_runs`

## 本轮新增结构

### Neon 表

- `open_day_datasets`
- `open_day_dataset_profiles`

### 新增字段

以下两张历史表都新增：

- `dataset_id`
- `dataset_profile_id`

适用表：

- `open_day_analysis_runs`
- `open_day_analysis_snapshots`

### 新增索引

新 run 表：

- `idx_open_day_analysis_runs_dataset_id`
- `idx_open_day_analysis_runs_dataset_profile_id`

旧 snapshot 兼容表：

- `idx_open_day_analysis_snapshots_source_upload_id`
- `idx_open_day_analysis_snapshots_dataset_id`
- `idx_open_day_analysis_snapshots_dataset_profile_id`

## 写路径语义

### Workbook 上传解析

当 Excel 上传归档成功时：

1. 解析 workbook。
2. 归档上传 artifact。
3. 尽力持久化 dataset。
4. 返回 `payload.dataset.id` 给前端。

注意：

- dataset 持久化失败不阻断上传。
- artifact 持久化失败时仍返回解析结果和 `uploadWarning`。

### 测算执行

当用户点击“开始测算”时：

1. 前端提交 `datasetId / activeSheet / headers / qualityReport`。
2. 后端尽力持久化 `dataset_profile`。
3. `analysis_run` 和兼容 `analysis_snapshot` 记录 `dataset_id / dataset_profile_id`。
4. 返回 meta 中的 `datasetId / datasetProfileId`，前端回填当前工作台状态。

注意：

- dataset profile 持久化失败不阻断测算。
- 如果没有 `datasetId`，后端会基于 rows/header 生成一个 dataset，再生成 profile。
- 如果 profile 写失败，本次 run 仍然会落库，只是 `dataset_profile_id` 为空。

## 读路径语义

历史列表和详情现在会带回：

- `datasetId`
- `datasetProfileId`

历史回放优先恢复：

- 原始 rows
- headers
- mappings
- sourceUploadId
- datasetId
- datasetProfileId
- activeSheet
- qualityReport
- scenarioTemplateVersionId

旧数据没有这些字段时，仍按空值兼容。

## 当前兼容策略

### API 兼容

没有新增公开 API。

沿用：

- `POST /api/parse-workbook`
- `POST /api/open-day-score`
- `GET /api/open-day-analyses`

### File fallback

本地文件仓储新增：

- `datasets/*.json`
- `dataset-profiles/*.json`

旧 snapshot index 读取时会补默认：

- `datasetId: null`
- `datasetProfileId: null`

## DBA 验收清单

阶段 3 完成后，至少确认：

1. 上传 Excel 后，如果 artifact 归档成功，响应里有 `dataset.id`。
2. 点击测算后，`open_day_analysis_runs.dataset_id` 有值。
3. 如果字段映射和质量报告成功持久化，`open_day_analysis_runs.dataset_profile_id` 有值。
4. 历史列表能返回 `datasetId / datasetProfileId`。
5. 历史回放后，工作台能恢复 headers、字段映射和质量报告。
6. dataset/profile 写入失败时，上传或测算不能整体失败。

## 仍然没做的事

阶段 3 先把写路径和历史关联打通，暂未做：

- dataset 详情 API。
- dataset profile 详情 API。
- dataset 与 upload artifact 的正式外键。
- profile 版本 diff。
- 按 dataset 查询历史的前端入口。
- 显式 migration 文件，目前仍依赖 runtime `ensureSchema`。

## 下一阶段建议

阶段 4 优先补：

1. 显式 migration 体系，替代长期依赖 runtime `ensureSchema`。
2. 给 `source_upload_id / dataset_id / scenario_template_version_id` 补查询参数。
3. 增加 dataset/profile 详情接口，用于审计和回放不再只依赖 `command_json`。
4. 把 `OpenDayWorkspace` 拆成上传、测算、方案库、历史回放几个 hook，降低前端状态继续膨胀的风险。
