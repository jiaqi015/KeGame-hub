# 修复 CR 发现的 3 个严重问题

## Context

代码审查发现当前未提交的变更中有 3 个严重问题导致 4 个测试失败：
- `missing_next_step` 风险检测回归（2 个测试失败）
- `strategyRef` 测试使用了错误的 sceneType（2 个测试失败）
- `soul.test.ts` 删除了 `participantId` 断言

## 修复计划

### 1. 修复 `missing_next_step` 回归

**文件**: `src/selling-houses/application/wechatConversation.ts` L316

**问题**: 新增的 `!intents.has('reassure')` 条件会阻断所有 fallback 到 reassure 的场景的 missing_next_step 检测，因为意图检测的 fallback 机制（L309-311）在无匹配时默认添加 `'reassure'`。

**修复**: 引入 `isExplicitReassure` 标志位区分显式安慰和回退默认。

### 2. 修复 `strategyRef` 测试的 sceneType

**文件**: `src/selling-houses/application/__tests__/fallbackReplyTable.test.ts` L857-L938

**修复**: 将两个测试的 `sceneType` 改为 `'owner_wechat'`，`senderRole` 改为 `'owner'`。

### 3. 恢复 `participantId` 断言

**文件**: `src/selling-houses/application/__tests__/soul.test.ts` L27

**修复**: 恢复 `expect(soul.participantId).toBe('owner:case-1:王姐')`。

## 验证

```bash
npx tsc --noEmit
npx vitest run src/selling-houses/application/__tests__/fallbackReplyTable.test.ts src/selling-houses/application/__tests__/soul.test.ts
```
