# AI Model Sabrina II

这是一个合并后的统一入口项目，验证通过后可以进入两个功能：

- `多模型PK`：多模型对比与核心差异总结
- `小区开放日选址`：开放日候选小区测算与排名分析

## 当前结构

- 前端：`Vite + React + TypeScript`
- 后端：
  - Sabrina 相关接口：`/api/activate`、`/api/models`、`/api/compare`、`/api/compare-stream`
  - 小区开放日选址接口：`/api/parse-workbook`、`/api/open-day-catalog`、`/api/open-day-score`、`/api/open-day-analyses`、`/api/open-day-scenarios`
- 小区开放日选址原始静态页面已保存在 `src/open-day/legacy/`
- 小区开放日选址 DDD 设计说明见 [docs/open-day-ddd-architecture.md](/Users/jiaqi/Documents/开放日测算/docs/open-day-ddd-architecture.md)

## 使用方式

```bash
npm install
npm run dev
```

本地默认启动地址：

```bash
http://localhost:3000
```

如果 `3000` 已被占用，服务会自动 fallback 到后续可用端口，并在终端打印实际地址。

## 环境变量

参考 `.env.example`，至少需要：

- `ACTIVATION_KEYS`

开发环境可选：

- `PORT`
- `VITE_HMR_PORT`
- `OPEN_DAY_STORAGE_BACKEND`
- `OPEN_DAY_CACHE_BACKEND`
- `OPEN_DAY_UPLOAD_BACKEND`

如果要使用 Sabrina 的模型对比能力，还需要按实际 provider 配置：

- `ARK_API_KEY`
- `IKUN_API_KEY`
- `HUNYUAN_API_KEY`
- `DASHSCOPE_API_KEY`

## 合并说明

- 验证页沿用 Sabrina 的激活机制
- 验证通过后先进入功能选择页
- `小区开放日选址` 作为内嵌工作台接入，同样受激活校验保护
- 代码内部仍沿用 `open-day` 作为模块与接口前缀，避免为了改产品名而引入路径和引用风险
- Excel 上传会通过 `/api/parse-workbook` 在服务端解析 sheet 和数据
- 默认参数和策略包目录会通过 `/api/open-day-catalog` 从后端下发
- 开放日测算会通过 `/api/open-day-score` 进入后端领域服务，并使用缓存加速重复计算
- 测算快照会通过 `/api/open-day-analyses` 查询
- 业务方案模板会通过 `/api/open-day-scenarios` 查询和保存
- 当存在 `DATABASE_URL / POSTGRES_URL` 时，开放日模块会自动切到 `Neon` 持久化；否则回退为本地文件仓储
- 当运行在 Vercel 上时，开放日测算缓存会优先使用 `Runtime Cache`，本地开发默认回退为内存缓存
- 当存在 `BLOB_READ_WRITE_TOKEN` 且结构化存储走 `Neon` 时，Excel 上传会在解析后自动归档到 `Vercel Blob`；否则回退为本地临时文件仓储
