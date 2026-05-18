# 卖房 Organization / ACN 合同

最后整理：2026-05-18

组织层不是页面标签，也不是“公司压力”单字段。它负责把品牌、ACN、门店、商圈经理、经纪人、联卖和组织干预接入 Big World 主链。

## 1. 组织层级

```text
BrokerageCompany
  → Brand
  → ACN
  → Store
  → BizAreaManager
  → Broker
```

## 2. 业务事实

- 同 ACN 内房源公开协作，客户关系不公开共享。
- 联卖要区分房源端和客源端。
- 同 ACN 成交不是“被竞品打败”，必须先做房源端 / 客源端归因。
- 跨品牌才是明确竞品关系。
- 商圈经理可以形成组织干预 source，并留下 receipt。
- 品牌、ACN、门店会影响客户信任、业主信任、流通效率和资源分配。

## 3. Big World 接入

组织信息必须进入：

```text
organization source
  → causal event
  → actor knowledge
  → organization pressure / belief
  → available command
  → organization receipt
  → runtime feedback
```

不能只在 UI 上显示“商圈经理提醒”。

## 4. 关键对象

| 对象 | 放什么 |
| --- | --- |
| `Brand` | 品牌信任、市场占有率、跨品牌竞争关系 |
| `ACN` | 协作网络、公开房源池、联卖规则 |
| `Store` | 门店经营单元、经纪人集合 |
| `BizAreaManager` | 组织动作、提醒、资源调度 |
| `Broker` | 玩家或 NPC 经纪人 actor |
| `BrokerListingRelation` | 房源端维护权和归因 |
| `BrokerCustomerRelation` | 客源端维护权和归因 |
| `CoSaleRelation` | 联卖合作事实 |

## 5. 组织 source kinds

- `manager_message`
- `organization_intervention`
- `co_sale_signal`
- `brand_market_share_shift`
- `store_resource_allocation`
- `broker_performance_feedback`

这些 source 进入 causal 后，才可以影响推荐和 UI。

## 6. 组织 receipt

组织动作必须有 receipt：

- 分配推广资源
- 要求面访或反馈业主
- 提报聚焦会
- 发起联卖协作
- 调整门店优先级
- 对经纪人表现做反馈

receipt 必须反馈 runtime，影响后续 resource ledger、manager pressure、broker knowledge 和 available commands。

## 7. POV 边界

broker POV 可以看到：

- 管辖范围内的组织消息
- 与自己房源 / 客户有关的联卖信息
- actor-visible 的品牌和门店竞争信号
- 组织资源分配结果

broker POV 不能看到：

- 全品牌内部策略
- 其他经纪人的私有客户池
- hidden GlobalTruth 中的完整组织真相

## 8. Projection 要求

组织相关 UI 必须说明：

> 谁在第几天发起组织动作，因为哪条 source，对哪个 listing / broker / customer 形成什么 pressure，建议什么 command，执行后留下什么 receipt。

## 9. 反模式

- `companyPressure: number` 直接驱动推荐。
- 商圈经理消息只作为聊天文案，不进入 source / causal。
- 联卖成交不做房源端 / 客源端归因。
- 把 ACN 公共房源池和客户私有关系混成同一个列表。
- 组织干预没有 receipt，也不影响 runtime。
