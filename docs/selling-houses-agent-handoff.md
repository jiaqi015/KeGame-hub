# Selling Houses Agent Handoff

本文件用于 A/B/C/D 与 S 之间交接，不放一次性长报告，不替代代码和 gate。

## 使用规则

- A/B/C/D 完成任务后，把结果写到本文件对应小节。
- S 直接读取本文件、`git diff` 和 gate 结果做总检查。
- 不要求用户复制粘贴 agent 汇报。
- 每次交接只保留当前轮有效内容；旧内容完成后可覆盖。
- 不在这里写秘钥、账号、原始大段日志。

## 当前轮：从可视化/投影 → 运行时稳定证据 (2026-05-21 R4)

### A：WorldGraphSummary 进入 runtime 主链 — 消除重复计算

- **状态**：done
- **改动文件**：
  - `src/selling-houses/application/useGame.ts` — worldGraphSummary 从每次 render 重新 buildWorldGraph 改为读 `state.bigWorldRuntime?.worldGraphSummary` 缓存
  - `src/selling-houses/ui/features/WorldGraphSummaryPanel.tsx` — prop 类型从 `PlayerVisibleWorldGraph` 改为 `WorldGraphSummary | null`，读 `summary.marketCellSummaries`
  - `src/selling-houses/ui/features/Dashboard.tsx` — prop 类型对齐 WorldGraphSummary
- **消除的重复计算**：UI 不再每次 render 调用 buildWorldGraph + buildPlayerVisibleWorldGraph，改为读 tick 后缓存值
- **导入变更**：移除 buildWorldGrid / buildPlayerVisibleWorldGraph / PlayerVisibleWorldGraph，新增 WorldGraphSummary from runtime/types

### B：报告共用同一套世界态 — 消除重复 builder

- **状态**：done
- **改动文件**：
  - `src/selling-houses/application/localAdversarialSelfPlayArena.ts` — 结束时不再重新 buildWorldGraph，改为读 `state.bigWorldRuntime?.worldGraphSummary`
  - `src/selling-houses/application/projections/worldGraphBuilder.ts` — pressure 计算从手写 edge-count 公式改为调用 `attributePressure()` 统一三通道
- **一致性保证**：UI / self-play / worldGraphBuilder 全部使用同一套 attributePressure 三通道逻辑
- **attributePressure 签名**：`attributePressure(rivalStores, rivalListings, cellId, playerAcnId?, playerBrandId?)` → `{ coSalePressure, internalPressure, rivalPressure }`
- **playerAcnId 来源**：`state.bigWorldRuntime?.playerBrokerAcnId`，playerBrandId 从 acnId 推导

### C：规模门禁真验证 — gate 从真实 bootstrap 读数

- **状态**：done
- **改动文件**：
  - `scripts/verify-selling-houses-r4-scale-gate.ts`（新增）— 22 个检查项，全部 PASS
- **验证内容**：
  - 从 `createBigWorldBootstrap(FIVE_X_SCALE_POLICY, seed=42)` 构建真实数据
  - 读取实际 entity counts: ACN=32, marketCells=100, microCells=300, brokers=768, listings=4500, ownerPriors=4500, demandUnits=21000, supportingInfo=800
  - 与 ScaleManifest 交叉验证
  - WorldGraph builder 产出非零计数
  - 确定性验证（同 seed 同 ID）
  - 自审：无 `|| true` / `assert(true)` / `check(true)` / worktree imports
- **难度 ID**：使用合法 `DifficultyId` 值 `'hard'`（非 fiveXScale，后者不是合法 union member）
- **运行结果**：22/22 PASS

### D：Handoff 真实 + Gate 真跑

- **状态**：done
- **修复的 lint 错误**：`difficultyId: 'fiveXScale'` → `'hard'`（3 处），因为 `'fiveXScale'` 不是合法 DifficultyId
- **验证结果**：
  - `npm run lint`（= tsc --noEmit）：PASS
  - `npm run build`：PASS
  - `vitest run`（selling-houses 相关）：24/24 PASS
  - `npx tsx scripts/verify-selling-houses-r4-scale-gate.ts`：22/22 PASS
  - `git diff --check`：clean

## S 总检查 (运行时稳定证据轮，2026-05-21 R4)

- **本轮真正收敛了什么**：
  1. WorldGraph 不再被重复计算 — UI 读 tick 后缓存，self-play 读 tick 后缓存，builder 内部用 attributePressure 统一
  2. Pressure 口径统一 — worldGraphBuilder / acnAttribution / UI 面板 三通道一致
  3. 规模门禁从真实 bootstrap 读数 — 不再靠硬编码字符串，22/22 检查通过
  4. lint 干净 — 五XScale 难度 ID 修复合法值
- **文件变更范围**：
  - 修改：useGame.ts / WorldGraphSummaryPanel.tsx / Dashboard.tsx / localAdversarialSelfPlayArena.ts / worldGraphBuilder.ts
  - 新增：scripts/verify-selling-houses-r4-scale-gate.ts
- **哪些仍然是 scaffold / 未完成**：
  - caseCoordinator / caseMesh / caseMeshHarness — scaffold only
  - localAdversarialSelfPlayLab mesh 统计 — 硬编码 0
  - brandId 真正来源 — 目前从 acnId 推导，未从 ACN 网络结构读
- **运行命令和结果**：
  - `npm run lint` → PASS
  - `npm run build` → PASS
  - `npx vitest run src/selling-houses/` → 24/24 PASS
  - `npx tsx scripts/verify-selling-houses-r4-scale-gate.ts` → 22/22 PASS
  - `git diff --check` → clean
- **下一轮候选**：
  - brandId 真正来源 — 从 ACN 网络结构推导，而非 acnId 硬推导
  - WorldGraph summary UI 打磨 — 板块切换、时间趋势
  - self-play golden snapshot 实际对跑验证
  - marketEconomyRuntime / marketFormationRuntime 中残余的 acn-${store.type} → store.acnId
