# 卖房（资产顾问）业主与客户类型体系

最后更新：2026-04-21

这份文档回答的是：

> 业主和客户不能都长一个样。架构上怎么定义类型，既能让局面有差异，又不把系统做死。

这份文档不回答：

- 每个类型最终展示文案
- 每个类型的具体数值调参
- 剧本生成时每类出现概率

它只回答：

1. 业主类型怎么拆
2. 客户类型怎么拆
3. 类型如何影响动作、概率和日结

---

## 0. 一句话结论

类型体系不能只有一个标签。

最稳的是：

```text
Owner = 出售动机 + 性格 + 价格态度 + 配合倾向
Customer = 需求类型 + 决策风格 + 价格敏感 + 比较习惯
```

一句话：

> 类型不是为了贴标签，而是为了让同一个动作对不同人产生不同效果。

---

## 1. 业主类型由什么组成

建议不要只做一个 `ownerType`。

拆成 4 组。

## 1.1 出售动机

```ts
type OwnerSellingMotivation =
  | 'urgent-cash'
  | 'replacement'
  | 'asset-rebalance'
  | 'test-market'
  | 'family-decision';
```

含义：

- `urgent-cash`
  急需现金，更容易谈速度
- `replacement`
  置换型，关注时间衔接
- `asset-rebalance`
  资产配置型，更理性但可能慢
- `test-market`
  试探市场型，价格更容易虚高
- `family-decision`
  家庭决策型，决策链更长

## 1.2 性格

```ts
type OwnerPersonality =
  | 'trusting'
  | 'defensive'
  | 'dominant'
  | 'anxious'
  | 'face-saving'
  | 'data-driven';
```

含义：

- `trusting`
  容易建立信任，但也怕被辜负
- `defensive`
  防御强，需要更多事实
- `dominant`
  强势，谈判难度高
- `anxious`
  情绪波动大
- `face-saving`
  需要给台阶
- `data-driven`
  更吃数据和对比

## 1.3 价格态度

```ts
type OwnerPriceAttitude =
  | 'market-oriented'
  | 'anchored-high'
  | 'slow-softening'
  | 'bottom-line-clear'
  | 'emotionally-attached';
```

## 1.4 配合倾向

```ts
type OwnerCooperationStyle =
  | 'high-cooperation'
  | 'selective-cooperation'
  | 'low-cooperation'
  | 'needs-convincing';
```

---

## 2. 业主类型影响什么

业主类型主要影响：

- 沟通话题效果
- 价格松动速度
- 开放日接受度
- 反馈敏感度
- 耐心衰减速度
- 面访和数据沟通的收益

### 例子

同样是讲“成交数据”：

- `data-driven` 业主更容易接受
- `face-saving` 业主要注意表达方式
- `dominant` 业主可能先反驳

所以效果不能只看动作本身。

---

## 3. 客户类型由什么组成

客户建议拆成 4 组。

## 3.1 需求类型

```ts
type CustomerDemandType =
  | 'rigid'
  | 'family-upgrade'
  | 'school-district'
  | 'asset-allocation'
  | 'urgent-replacement';
```

## 3.2 决策风格

```ts
type CustomerDecisionStyle =
  | 'fast'
  | 'steady'
  | 'hesitant'
  | 'comparison-heavy'
  | 'family-consensus';
```

## 3.3 价格敏感

```ts
type CustomerPriceSensitivity =
  | 'low'
  | 'medium'
  | 'high'
  | 'budget-edge';
```

## 3.4 比较习惯

```ts
type CustomerComparisonHabit =
  | 'focused'
  | 'broad-scanning'
  | 'rival-prone'
  | 'needs-proof';
```

---

## 4. 客户类型影响什么

客户类型主要影响：

- 是否容易预约看房
- 是否容易二看
- 是否容易被竞品带走
- 价格变化对他的影响
- 开放日对他的吸引力
- 需要什么话题推动

### 例子

同样一套高性价比房：

- `rigid + fast` 客户可能推进很快
- `comparison-heavy` 客户可能继续看很多竞品
- `budget-edge` 客户可能卡在价格接受度

---

## 5. 类型怎么进入概率

类型不要直接决定结果。

它应该影响中间量。

例如：

```text
OwnerPersonality
  -> topicEffectiveness
  -> trustChange / priceFlexibility

CustomerDecisionStyle
  -> advanceReadiness / stagnationRisk

CustomerPriceSensitivity
  -> affordabilityScore / offerLikelihood
```

不要写成：

- `dominant owner = 50% 拒绝`
- `fast customer = 80% 成交`

这会很假。

---

## 6. 类型怎么进入动作

动作解析器应该读类型。

例如：

- `OwnerConversationResolver`
  读业主性格、出售动机、价格态度
- `CustomerConversationResolver`
  读客户需求类型、决策风格、比较习惯
- `EncounterResolver`
  读客户需求和房源匹配、业主配合倾向

---

## 7. 类型怎么进入日结

日结里主要影响：

- 耐心衰减
- 焦虑增长
- 活跃度变化
- 疲劳积累
- 停滞风险
- 流失风险

例如：

- `family-decision` 业主价格松动慢
- `test-market` 业主容易长期不降价
- `comparison-heavy` 客户停滞更常见
- `urgent-replacement` 客户更容易进入出价

---

## 8. 类型和画像的边界

类型是画像的一部分，但不是全部画像。

画像还包括：

- 预算
- 板块
- 户型
- 家庭结构
- 持有周期
- 出售原因细节

类型只是让规则更稳定的归纳。

---

## 9. 最后一句

类型体系的目的不是把人贴死。

它的目的，是让系统能解释：

> 为什么同样的动作、同样的市场、同样的房子，对不同的人效果完全不一样。
