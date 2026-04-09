# Sabrina Workspace

这是一个合并后的统一入口项目，验证通过后可以进入两个工作台：

- `AI Model Sabrina II`：多模型对比与核心差异总结
- `开放日选址`：开放日候选小区测算与排名分析

## 当前结构

- 前端：`Vite + React + TypeScript`
- 后端：
  - Sabrina 相关接口：`/api/activate`、`/api/models`、`/api/compare`、`/api/compare-stream`
  - 开放日 Excel 解析：`/api/parse-workbook`
- 开放日原始静态页面已保存在 `src/open-day/legacy/`

## 使用方式

```bash
npm install
npm run dev
```

本地默认启动地址：

```bash
http://localhost:3000
```

## 环境变量

参考 `.env.example`，至少需要：

- `ACTIVATION_KEYS`

如果要使用 Sabrina 的模型对比能力，还需要按实际 provider 配置：

- `ARK_API_KEY`
- `IKUN_API_KEY`
- `HUNYUAN_API_KEY`
- `DASHSCOPE_API_KEY`

## 合并说明

- 验证页沿用 Sabrina 的激活机制
- 验证通过后先进入功能选择页
- `开放日选址` 作为内嵌工作台接入，同样受激活校验保护
- Excel 上传会通过 `/api/parse-workbook` 在服务端解析 sheet 和数据
