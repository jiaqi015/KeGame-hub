# 平台审计线程 Brief（2026-04-21）

总控文档：

- [平台审计与第一轮改造总控](/Users/jiaqi/Documents/开放日测算/docs/dev-session-platform-audit-2026-04-21.md)

本文件只负责第一轮 3 个并行线程的任务边界。

---

## 统一前置要求

所有线程必须先读：

- `docs/dev-session-platform-audit-2026-04-21.md`
- `docs/platform-account-player-run-score-architecture.md`
- `docs/selling-houses-implementation-contracts.md`
- `docs/open-day-ddd-architecture.md`

统一规则：

- 你不是一个人在代码库里工作，不要回滚别人改动。
- 只改自己 ownership 范围内的文件。
- 如果发现需要越过 ownership，先停下并汇报。
- 不要改 `.env*`、`.vercel/*`。
- 不要顺手做 schema 大迁移。

---

## 线程 A：selling-houses 身份链收口

### 目标

把 selling-houses 当前“平台身份 / storage scope / legacy userId fallback”三层语义拆清楚。

### ownership

- `src/selling-houses/application/playerContext.ts`
- `src/selling-houses/application/cloudState.ts`
- `src/selling-houses/application/useGame.ts`
- `scripts/verify-maintainer-run-identity.ts`
- `scripts/verify-maintainer-cloud-resume.ts`

### 任务要求

1. authenticated 场景优先用 `accountId` 作为 run owner 语义
2. 本地 legacy id 只作为未登录或无 accountId 时的 fallback
3. storage scope 与 run owner 语义分开
4. 不破坏现有 API 兼容性

### 禁止修改

- `lib/auth.ts`
- `src/selling-houses/interfaces/http/*`
- `src/selling-houses/infrastructure/*`
- DB schema

### 验收

- `npm run lint`
- `npm run verify:maintainer-identity`
- `npm run verify:maintainer-cloud-resume`

---

## 线程 B：open-day API 一致性

### 目标

补齐 open-day 本地 server 与 serverless API 的主链能力一致性。

### ownership

- `api/open-day-disambiguate.ts`
- 如有必要，少量修改 `api/_request.ts`
- 如有必要，少量修改 `modules/open-day/interfaces/http/openDayDisambiguationHandler.ts`

### 任务要求

1. 为 `/api/open-day-disambiguate` 提供 serverless 入口
2. 保持本地 `server.ts` 现有行为一致
3. 不改前端调用协议

### 禁止修改

- `src/open-day/OpenDayWorkspace.tsx`
- `src/open-day/openDayClient.ts`
- `server.ts`
- 其他 open-day handler

### 验收

- `npm run lint`
- serverless 入口静态可编译

---

## 线程 C：工程验证与脚本卫生

### 目标

把当前分散的验证入口整理成更易用的工程入口，并降低 SMTP 测试误操作风险。

### ownership

- `package.json`
- `scripts/send-smtp-test.ts`
- 如需要，可新增一个 `scripts/verify-platform-smoke.ts`

### 任务要求

1. 增加一个更清晰的 smoke/verify 入口
2. SMTP 测试脚本不再写死真实收件人
3. 默认行为安全，显式参数才能发真实邮件

### 禁止修改

- `lib/email.ts`
- `.env*`
- Vercel 配置

### 验收

- `npm run lint`
- 新增 smoke 命令可运行
- SMTP 脚本支持显式收件人或 dry-run
