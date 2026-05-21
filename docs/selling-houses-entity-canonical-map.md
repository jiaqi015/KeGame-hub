# 卖房实体 Canonical Map

最后更新：2026-05-21

这份文档回答的是：

> 同一个业务概念在 legacy（玩家）、母模型视图、大世界种群中有不同表达，哪个是 canonical / 哪个是 derived / 哪个是 shadow？

---

## 0. 规则

1. **canonical**：唯一真相来源，其他表达都是它的派生或镜像
2. **derived**：从 canonical 计算或转换而来，可以丢弃重建
3. **shadow**：平行存在的影子表达，用于特定用途（如大世界种群），不与 canonical 冲突

---

## 1. 实体对照表

| 业务概念 | legacy（玩家） | 母模型视图 | 大世界种群 | canonical | 说明 |
| -------- | -------------- | ---------- | ---------- | --------- | ---- |
| 房 | `Case` | `AssetCase` | `ListingPopulationEntity` | **Case**（当前）→ `AssetCase`（目标） | legacy Case 仍是玩家体验主链，AssetCase 是母模型目标 |
| 业主 | `Case.ownerName` / `Case.trust` / `Case.patience` | `Owner` + `OwnerCaseRelation` | `OwnerProfilePrior` | **OwnerCaseRelation**（关系层） | 业主属性应挂关系，Case 上的是兼容镜像 |
| 客户 | `CustomerProfile` + `CustomerRuntimeState` | `Customer` + `CustomerCaseOpportunity` | `CustomerDemandEntity` | **Customer**（当前）→ 母模型目标 | 客户是独立实体，不挂 Case |
| 经纪人 | `Case.maintainerName`（字符串） | `Broker` | `BrokerEntity` | **BrokerOwnerRelation**（关系层） | 经纪人是关系引用，不是资产字段 |
| 板块 | `MarketCell` | `Region` | `MarketCellSnapshot` + `MicroCell` | **MarketCell**（当前）→ `Region`（目标） | 板块是空间定位实体 |

---

## 2. 价格实体对照

| 语义 | legacy Case 字段 | 母模型视图 | 文档命名 | canonical | 说明 |
| ---- | ---------------- | ---------- | -------- | --------- | ---- |
| 挂牌价 | `askPrice` | `OwnerCaseRelation.askPrice` | `listingPrice` | **OwnerCaseRelation** | 当前对外挂价 |
| 市场估价 | `marketPrice` | `PriceModelOutput.marketEstimatedPrice` | `marketEstimatedPrice` | **PriceModelOutput** | 模型输出，非资产内在属性 |
| 底价 | `bottomPrice` | `OwnerCaseRelation.bottomPrice` | — | **OwnerCaseRelation** | 业主能接受的最低成交价 |
| 业主心理价 | — | `PriceModelOutput.ownerPsychPrice` | `ownerPsychPrice` | **PriceModelOutput**（未实现） | 业主认为合理的价格 |
| 价差 | `priceGapPct` | `PriceModelOutput.priceGapToMarket` | `priceGapToMarket` | **PriceModelOutput** | 挂牌价与市场价的差距 |

---

## 3. 关系实体对照

| 关系 | legacy 表达 | 母模型视图 | canonical | 说明 |
| ---- | ----------- | ---------- | --------- | ---- |
| 业主-房源 | `Case.trust` / `Case.patience` / `Case.urgency` | `OwnerCaseRelation` | **OwnerCaseRelation** | 关系层是 canonical，Case 上是兼容镜像 |
| 经纪人-业主 | `Case.maintainerName` | `BrokerOwnerRelation` | **BrokerOwnerRelation** | 经纪人是关系引用 |
| 客户-房源 | `CustomerCaseOpportunity` | `CustomerCaseOpportunity` | **CustomerCaseOpportunity** | 机会是独立实体 |

---

## 4. 状态实体对照

| 状态 | legacy 表达 | 母模型视图 | canonical | 说明 |
| ---- | ----------- | ---------- | --------- | ---- |
| 房源生命周期 | `Case.status` / `Case.stageIndex` | `ListingLifecycle` | **ListingLifecycle**（目标） | 当前仍在 Case 上 |
| 市场状态 | `marketShadow` | `MarketState` | **marketShadow**（当前） | 市场状态是运行时状态 |
| 经纪人记忆 | `agentMemoryStore` | `AgentMemoryStore` | **agentMemoryStore** | 记忆是独立存储 |

---

## 5. 读路径指引

| 需求 | 推荐读路径 | 避免 |
| ---- | ---------- | ---- |
| 信任值 | `relationReadProjection.readRelationTrust()` 或 `readCaseRelationBundle()` | 直接读 `caseItem.trust` |
| 耐心/催促 | `relationReadProjection.readRelationReadiness()` 或 `readCaseRelationBundle()` | 直接读 `caseItem.patience` / `caseItem.urgency` |
| 业主画像 | `readOwnerProfile()` | 直接读 `caseItem.personality` |
| 挂牌价 | `caseItem.askPrice`（当前）→ `OwnerCaseRelation.askPrice`（目标） | — |
| 市场价 | `caseItem.marketPrice`（当前）→ `PriceModelOutput.marketEstimatedPrice`（目标） | — |

---

## 6. 迁移优先级

| 优先级 | 实体 | 当前状态 | 目标状态 | 收益 |
| ------ | ---- | -------- | -------- | ---- |
| P0 | 信任/耐心/催促 | Case 字段 + 关系层双写 | 关系层 canonical，Case 只读镜像 | 已完成（relationReadProjection） |
| P1 | 挂牌价 | Case.askPrice | OwnerCaseRelation.askPrice | 价格归属清晰 |
| P1 | 市场估价 | Case.marketPrice | PriceModelOutput.marketEstimatedPrice | 模型输出不污染资产 |
| P2 | 业主 | Case.ownerName 等 | Owner 独立实体 | 业主属性独立 |
| P2 | 经纪人 | Case.maintainerName | BrokerOwnerRelation.brokerId | 关系引用清晰 |
