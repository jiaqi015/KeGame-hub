# 卖房（资产顾问）价格模型设计

这份文档回答的是：

> 房子的价格到底该怎么拆，哪些价是客观的，哪些价是业主心里的，哪些价会直接卡住成交。

价格模型要独立出来。
因为价格既不是房子的天然属性，也不是业主的单一字段。

---

## 0. 一句话结论

我建议价格模型至少同时维护 5 个核心值：

1. `listingPrice`
2. `ownerPsychPrice`
3. `marketEstimatedPrice`
4. `priceGapToMarket`
5. `dealFeasibility`

再补两个辅助值：

6. `priceFlexibility`
7. `pricePressure`

---

## 1. 先分清 3 种价

## 1.1 挂牌价 `listingPrice`

定义：

> 现在市场上真实挂出去给客户看到的价格。

特点：

1. 客户直接感知。
2. 会影响带看、咨询、出价。
3. 是房源当前对外价格。

归属建议：

- 存在 `CaseRuntime`
- 但调整它通常来自 `OwnerCaseRelation` 的动作结果

## 1.2 业主心理价 `ownerPsychPrice`

定义：

> 业主心里真正想卖到的价格，不一定对外公开。

特点：

1. 可能高于挂牌价。
2. 也可能低于挂牌价但嘴上不认。
3. 决定谈判到底能不能落地。

归属建议：

- 作为 `PriceModelOutput`
- 由 `OwnerProfile + OwnerRuntimeState + OwnerCaseRelation` 推导

## 1.3 市场估价 `marketEstimatedPrice`

定义：

> 站在今天的市场环境里，这套房比较合理的成交区间中心值。

特点：

1. 不是业主说了算。
2. 不是客户想砍多少就是多少。
3. 受板块、总价带、房型、市场事件影响。

归属建议：

- 作为 `PriceModelOutput`
- 主要由 `CaseProfile + MarketModel` 推导

---

## 2. 价格模型的输出

| 输出 | 含义 | 用途 |
| ---- | ---- | ---- |
| `listingPrice` | 当前挂牌价 | 客户看到的价格 |
| `ownerPsychPrice` | 业主心理预期 | 谈判判断 |
| `marketEstimatedPrice` | 当前市场估值 | 判断高挂还是低挂 |
| `priceGapToMarket` | 挂牌价相对市场估值偏离多少 | 决定客户进入率 |
| `priceGapToOwnerPsych` | 挂牌价和业主心理价偏离多少 | 决定调价难度 |
| `priceFlexibility` | 业主有多大松动空间 | 决定谈价空间 |
| `dealFeasibility` | 这个价格体系下成交可行度 | 影响推进概率 |
| `pricePressure` | 价格是否正在积累压力 | 影响日结变化 |

---

## 3. 输入来自哪里

| 输入组 | 主要字段 | 作用 |
| ------ | -------- | ---- |
| `CaseProfile` | 板块、面积、户型、楼层、装修、标签、缺点 | 决定市场估价基底 |
| `CaseRuntime` | 当前挂牌价、热度、曝光、到访反馈 | 决定价格是否被市场接受 |
| `OwnerProfile` | 性格、动机、风险偏好 | 决定业主心理价的固执程度 |
| `OwnerRuntimeState` | 情绪、焦虑、市场理解 | 决定当天松动程度 |
| `OwnerCaseRelation` | trust、urgency、patience、是否接受调价 | 决定这套房能不能谈下来 |
| `MarketModel` | 板块热度、总价带流动性、节奏事件 | 决定市场估值和压力 |
| `CustomerCaseRelation[]` | 咨询量、带看反馈、出价反馈 | 校验这个价格是否被市场认可 |

---

## 4. 各输出怎么理解

## 4.1 marketEstimatedPrice

这是价格模型最基础的值。

建议拆成：

```text
marketEstimatedPrice =
  areaBasePrice
+ productAdjustment
+ floorAdjustment
+ decorationAdjustment
+ scarcityAdjustment
+ marketCycleAdjustment
```

### 各项含义

| 子项 | 说明 |
| ---- | ---- |
| `areaBasePrice` | 该板块该总价带的基础价格带 |
| `productAdjustment` | 户型、面积、朝向等产品差异 |
| `floorAdjustment` | 楼层、视野、噪音等差异 |
| `decorationAdjustment` | 装修条件是否拉高或拉低 |
| `scarcityAdjustment` | 稀缺标签加成 |
| `marketCycleAdjustment` | 当前周期性市场偏移 |

---

## 4.2 ownerPsychPrice

它不是一个固定常量。

建议理解成：

```text
ownerPsychPrice =
  ownerAnchorPrice
- urgencyDiscount
- anxietyDiscount
- trustDiscount
- marketEducationDiscount
+ faceSavingPremium
```

### 各项含义

| 子项 | 说明 |
| ---- | ---- |
| `ownerAnchorPrice` | 业主最初锚定的心理预期 |
| `urgencyDiscount` | 越着急，越容易下调 |
| `anxietyDiscount` | 越焦虑，越可能松口 |
| `trustDiscount` | 越信任你，越愿意听劝 |
| `marketEducationDiscount` | 越理解市场，越接近现实 |
| `faceSavingPremium` | 某些强势业主会保留面子溢价 |

---

## 4.3 priceGapToMarket

定义：

```text
priceGapToMarket = listingPrice - marketEstimatedPrice
```

解释：

| 结果 | 含义 |
| ---- | ---- |
| 明显大于 0 | 高于市场，进客会变慢 |
| 接近 0 | 价格比较站得住 |
| 小于 0 | 低于市场，容易有流量，但不一定最好 |

建议同时保留百分比口径：

```text
priceGapRate = (listingPrice - marketEstimatedPrice) / marketEstimatedPrice
```

因为不同总价带里，绝对价差和相对价差的意义不一样。

---

## 4.4 priceFlexibility

一句话：

> 现在这位业主在这套房上，还能谈动多少。

建议输入：

| 输入 | 影响方向 |
| ---- | -------- |
| trust 高 | 更容易谈 |
| urgency 高 | 更容易谈 |
| patience 低 | 更容易谈，但可能也更容易爆 |
| marketUnderstanding 高 | 更容易谈 |
| personality 强势 | 更难谈 |
| 已经有不错反馈 | 反而可能更不愿降 |

建议输出范围 0-100。

---

## 4.5 dealFeasibility

这是最重要的结果值之一。

它回答的是：

> 在当前挂牌价、业主心理价、市场估值和客户反馈共同作用下，这套房有没有现实成交路径。

建议公式：

```text
dealFeasibility =
  0.35 * priceFitToMarket
+ 0.25 * ownerFlexibility
+ 0.20 * customerAffordability
+ 0.10 * recentOfferAlignment
+ 0.10 * marketLiquidity
```

### 各项含义

| 子项 | 说明 |
| ---- | ---- |
| `priceFitToMarket` | 挂牌价离市场有多远 |
| `ownerFlexibility` | 业主能不能被谈动 |
| `customerAffordability` | 当前有效客户买不买得起 |
| `recentOfferAlignment` | 最近客户出价是不是接近可成交区 |
| `marketLiquidity` | 当前这类房子整体好不好成交 |

---

## 5. 价格对哪些东西有影响

## 5.1 对客户关系

价格直接影响：

1. 新咨询进入率。
2. 看房后的继续推进率。
3. 出价发生率。
4. 出价后谈崩率。

也就是说：

- 价格不会直接决定“客户喜不喜欢”
- 但会强烈决定“客户愿不愿意继续推进”

## 5.2 对好房分

价格不是好房模型本身。
但会通过两个地方影响好房分：

1. 拖低 `D1`
2. 拖低 `D3`

解释：

- 挂太高，准客池变薄，D1 会掉。
- 业主不愿回到成交区，D3 会掉。

## 5.3 对市场反馈

价格过高时，常见现象是：

1. 咨询有，复看少。
2. 带看有，出价少。
3. 反馈都是“喜欢，但再看看”。

这些应该通过事件和 relation 反馈回模型。

---

## 6. 日结时怎么更新

价格模型不需要全天每秒重算。

建议：

### 白天即时更新

以下情况局部重算：

1. 调价。
2. 业主明确松口或收紧。
3. 出现新的有效报价。
4. 出现强烈负反馈。

### 日结统一更新

每天统一更新：

1. `marketEstimatedPrice`
2. `ownerPsychPrice`
3. `pricePressure`
4. `dealFeasibility`

---

## 7. 价格压力怎么积累

建议增加一个 `pricePressure`。

它不是价格本身。
是价格有没有“越挂越难受”的压力。

### 什么时候涨

1. 连续多天没有效推进。
2. 咨询下降。
3. 看房转化差。
4. 同类盘在成交。
5. 市场事件转弱。

### 什么时候降

1. 出现有效报价。
2. 业主明确调价。
3. 活跃关系增加。
4. 市场对该类房变好。

### 它影响什么

1. 提高调价 Matter 触发率。
2. 提高业主松口概率。
3. 提高玩家在详情页看到的风险提示等级。

---

## 8. 一个完整例子

假设：

- `marketEstimatedPrice = 980`
- `listingPrice = 1080`
- `ownerPsychPrice = 1030`

那说明：

1. 对市场来说，这套房挂高了。
2. 对业主来说，当前挂牌价也高于他真正想要的价。
3. 这时客户会觉得贵，业主自己也未必真守得住。

如果再叠加：

- 最近 7 天有看房但没有出价
- 同板块同类房刚成交两套
- 业主信任高、紧迫度升高

那么合理的变化是：

1. `pricePressure` 上升
2. `priceFlexibility` 上升
3. `ownerPsychPrice` 下调一点
4. `dealFeasibility` 回升

这时价格模型会给出一个很清楚的业务信号：

> 不是房子没人要，是价格站不住，且现在到了可以推动调整的窗口。

---

## 9. 已收口与后续校准

这份文档已经能支撑第一轮建模。
和类型、谈判、机会推进相关的结构已经分别收口到：

- [selling-houses-archetype-architecture.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-archetype-architecture.md)
- [selling-houses-matter-template-architecture.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-matter-template-architecture.md)
- [selling-houses-customer-opportunity-architecture.md](/Users/jiaqi/Documents/开放日测算/docs/selling-houses-customer-opportunity-architecture.md)

剩下主要是实现期校准：

1. 不同总价带的价格弹性基线。
2. 不同业主类型的 `faceSavingPremium` 默认参数。
3. 报价谈判时的成交区间算法。

---

## 10. 一句话结论

价格模型最重要的，不是算出一个“标准价”，
而是把下面 3 件事同时分开看：

1. 市场觉得值多少。
2. 业主心里想卖多少。
3. 当前挂牌到底会不会把客户挡在门外。
