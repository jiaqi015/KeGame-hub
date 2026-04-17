import type { DifficultyId, ScenarioDefinition, ScenarioSnapshot, ScenarioSummary } from '../models';
import { mergeRules } from '../config/baseRules';
import { BUILT_IN_WORLD, getBuiltInWorld } from '../worlds/builtinWorld';

function inferGoalContext(scenario: ScenarioDefinition) {
  if (scenario.goalContext) {
    return scenario.goalContext;
  }
  const urgentCount = scenario.cases.filter((entry) => entry.windowDays <= 8 || entry.initialUrgency >= 76).length;
  const fragileCount = scenario.cases.filter((entry) => entry.initialTrust <= 58 || entry.initialPatience <= 45).length;
  if (fragileCount >= Math.ceil(scenario.cases.length / 2)) {
    return 'satisfaction' as const;
  }
  if (urgentCount >= Math.ceil(scenario.cases.length / 2)) {
    return 'defense' as const;
  }
  return 'ability' as const;
}

function inferTargetScore(difficultyId: DifficultyId) {
  if (difficultyId === 'warmup') return 58;
  if (difficultyId === 'easy') return 64;
  if (difficultyId === 'standard') return 72;
  if (difficultyId === 'advanced') return 78;
  if (difficultyId === 'hard') return 84;
  return 88;
}

function inferScoreThresholds(targetScore: number) {
  return {
    pass: Math.max(42, targetScore - 12),
    strong: Math.min(94, targetScore + 12),
    ace: Math.min(98, targetScore + 20),
  };
}

function inferBoardPressureProfile(scenario: ScenarioDefinition) {
  const abilityPressure = Math.min(92, 44 + scenario.cases.length * 4);
  const defensePressure = Math.min(92, 40 + scenario.competitionGroups.length * 10);
  const satisfactionPressure = Math.min(
    92,
    38 + scenario.cases.filter((entry) => entry.initialTrust <= 60 || entry.initialPatience <= 48).length * 8,
  );
  return {
    abilityPressure,
    defensePressure,
    satisfactionPressure,
  };
}

function enrichScenarioDefinition(scenario: ScenarioDefinition): ScenarioDefinition {
  const goalContext = inferGoalContext(scenario);
  const targetScore = scenario.targetScore || inferTargetScore(scenario.difficultyId);
  return {
    ...scenario,
    goalContext,
    targetScore,
    scoreThresholds: scenario.scoreThresholds || inferScoreThresholds(targetScore),
    boardPressureProfile: scenario.boardPressureProfile || inferBoardPressureProfile(scenario),
    cases: scenario.cases.map((entry) => ({
      ...entry,
      goalTier: entry.goalTier
        || (entry.windowDays <= 8 || entry.initialUrgency >= 76 ? 'core'
          : entry.initialTrust <= 58 || entry.initialPatience <= 45 ? 'important'
            : 'normal'),
    })),
  };
}

function buildScenarioSummary(scenario: ScenarioDefinition): ScenarioSummary {
  const enriched = enrichScenarioDefinition(scenario);
  return {
    id: enriched.id,
    difficultyId: enriched.difficultyId,
    name: enriched.name,
    theme: enriched.theme,
    description: enriched.description,
    caseCount: enriched.cases.length,
    maxDay: enriched.maxDay,
  };
}

const BUILT_IN_SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'easy-fresh-start',
    worldId: BUILT_IN_WORLD.id,
    worldVersion: BUILT_IN_WORLD.version,
    difficultyId: 'easy',
    name: '前滩热身局',
    theme: '先学会稳关系，再感受季节热度',
    description: '4 套盘，窗口宽，脚本事件更友好，适合第一局开场。',
    startMonth: 9,
    startDay: 6,
    maxDay: 24,
    rules: mergeRules({ maxDay: 24, initialCash: 22, initialReputation: 60, passiveLeadBaseMultiplier: 1.08, randomEventProbability: 0.1 }),
    randomEventPool: [
      { templateId: 'school-boom', weight: 5 },
      { templateId: 'policy-shift', weight: 2 },
      { templateId: 'competitor-cut', weight: 2 },
    ],
    cases: [
      { id: 'case-ruiheli', housePrototypeId: 'proto-ruiheli-89', ownerArchetypeId: 'anxious', ownerName: '周女士', ownerMood: '担心拖久错过换房窗口', maintainerName: '林序', askPrice: 828, bottomPrice: 785, initialTrust: 66, initialPatience: 72, initialHeat: 61, initialUrgency: 62, windowDays: 12 },
      { id: 'case-xinghuyuan', housePrototypeId: 'proto-xinghuyuan-92', ownerArchetypeId: 'fair-value', ownerName: '秦先生', ownerMood: '希望卖得稳，不想乱谈价', maintainerName: '沈岚', askPrice: 858, bottomPrice: 815, initialTrust: 68, initialPatience: 70, initialHeat: 57, initialUrgency: 54, windowDays: 14 },
      { id: 'case-jiayue', housePrototypeId: 'proto-jiayue-71', ownerArchetypeId: 'trial-balloon', ownerName: '梁先生', ownerMood: '想看看市场有没有惊喜', maintainerName: '韩起', askPrice: 632, bottomPrice: 594, initialTrust: 58, initialPatience: 46, initialHeat: 68, initialUrgency: 71, windowDays: 8 },
      { id: 'case-wanhang', housePrototypeId: 'proto-wanhang-63', ownerArchetypeId: 'fair-value', ownerName: '张阿姨', ownerMood: '更在意总价和安全感', maintainerName: '苏景', askPrice: 612, bottomPrice: 566, initialTrust: 64, initialPatience: 65, initialHeat: 60, initialUrgency: 55, windowDays: 11 },
    ],
    competitionGroups: [
      { id: 'group-qiantan-two-room', name: '前滩两房对打', members: ['case-ruiheli', 'case-xinghuyuan'], priceElasticity: 1.05, customerSpillover: 0.5 },
      { id: 'group-jingan-small', name: '静安小面积对打', members: ['case-jiayue', 'case-wanhang'], priceElasticity: 0.88, customerSpillover: 0.42 },
    ],
    scriptedEvents: [
      { id: 'event-easy-1', day: 4, actor: '业主朋友圈', title: '同小区成交传闻', message: '周女士听说同小区有盘准备成交，心态稳了一点。', tone: 'success', targetCaseId: 'case-ruiheli', trustDelta: 5, urgencyDelta: -3 },
      { id: 'event-easy-2', day: 8, actor: '市场', title: '九月学区热', message: '前滩学区盘来访上升，相关房源热度被带起来。', tone: 'success', targetMarketCellId: 'mc-qiantan', demandHeatDelta: 8, sentimentDelta: 6 },
    ],
    published: true,
  },
  {
    id: 'easy-weekend-burst',
    worldId: BUILT_IN_WORLD.id,
    worldVersion: BUILT_IN_WORLD.version,
    difficultyId: 'easy',
    name: '周末冲带看',
    theme: '学会用开放日把热度打出来',
    description: '4 套盘，重点感受开放日和带看推进的节奏。',
    startMonth: 10,
    startDay: 10,
    maxDay: 24,
    rules: mergeRules({ maxDay: 24, initialCash: 24, initialReputation: 58, passiveLeadFocusedMultiplier: 3.8, randomEventProbability: 0.12 }),
    randomEventPool: [
      { templateId: 'school-boom', weight: 4 },
      { templateId: 'policy-shift', weight: 2 },
      { templateId: 'competitor-cut', weight: 2 },
    ],
    cases: [
      { id: 'case-ruiheli-2', housePrototypeId: 'proto-ruiheli-89', ownerArchetypeId: 'fair-value', ownerName: '林老伯', ownerMood: '想稳一点，不急着乱动价', maintainerName: '陆遥', askPrice: 820, bottomPrice: 790, initialTrust: 70, initialPatience: 74, initialHeat: 56, initialUrgency: 52, windowDays: 13 },
      { id: 'case-jiangyue-2', housePrototypeId: 'proto-jiangyuefu-128', ownerArchetypeId: 'anxious', ownerName: '邵女士', ownerMood: '年底前必须换房', maintainerName: '何薇', askPrice: 1288, bottomPrice: 1215, initialTrust: 60, initialPatience: 58, initialHeat: 62, initialUrgency: 77, windowDays: 10 },
      { id: 'case-jiayue-2', housePrototypeId: 'proto-jiayue-71', ownerArchetypeId: 'trial-balloon', ownerName: '王经理', ownerMood: '先挂着试试看', maintainerName: '林序', askPrice: 636, bottomPrice: 596, initialTrust: 57, initialPatience: 42, initialHeat: 69, initialUrgency: 68, windowDays: 7 },
      { id: 'case-jiali-2', housePrototypeId: 'proto-jiali-east-118', ownerArchetypeId: 'game-player', ownerName: '陈小姐', ownerMood: '天天盯竞品，容易受消息影响', maintainerName: '苏景', askPrice: 1128, bottomPrice: 1052, initialTrust: 63, initialPatience: 61, initialHeat: 58, initialUrgency: 60, windowDays: 11 },
    ],
    competitionGroups: [
      { id: 'group-easy-weekend-main', name: '改善盘对打', members: ['case-ruiheli-2', 'case-jiangyue-2'], priceElasticity: 1.02, customerSpillover: 0.48 },
      { id: 'group-easy-weekend-jingan', name: '静安资产盘对打', members: ['case-jiayue-2', 'case-jiali-2'], priceElasticity: 0.9, customerSpillover: 0.36 },
    ],
    scriptedEvents: [
      { id: 'event-easy-3', day: 5, actor: '活动预热', title: '圈层邀约成功', message: '周末活动前，一批改善客开始主动问盘。', tone: 'success', targetMarketCellId: 'mc-qiantan', demandHeatDelta: 6, sentimentDelta: 4 },
      { id: 'event-easy-4', day: 9, actor: '业主家庭', title: '换房节奏确认', message: '邵女士家里敲定换房时间，愿意多给你一点操作窗口。', tone: 'success', targetCaseId: 'case-jiangyue-2', trustDelta: 4, windowDaysDelta: 2 },
    ],
    published: true,
  },
  {
    id: 'easy-calm-balance',
    worldId: BUILT_IN_WORLD.id,
    worldVersion: BUILT_IN_WORLD.version,
    difficultyId: 'easy',
    name: '双区平衡局',
    theme: '练优先级，不让任何一盘被拖死',
    description: '4 套盘分布两区，难度不高，但要学会取舍。',
    startMonth: 5,
    startDay: 8,
    maxDay: 23,
    rules: mergeRules({ maxDay: 23, initialCash: 20, initialReputation: 59, randomEventProbability: 0.11 }),
    randomEventPool: [
      { templateId: 'school-boom', weight: 4 },
      { templateId: 'policy-shift', weight: 2 },
      { templateId: 'competitor-cut', weight: 3 },
    ],
    cases: [
      { id: 'case-xinghu-3', housePrototypeId: 'proto-xinghuyuan-92', ownerArchetypeId: 'anxious', ownerName: '高先生', ownerMood: '想趁市场热卖掉', maintainerName: '沈岚', askPrice: 848, bottomPrice: 812, initialTrust: 62, initialPatience: 60, initialHeat: 63, initialUrgency: 71, windowDays: 10 },
      { id: 'case-wanhang-3', housePrototypeId: 'proto-wanhang-63', ownerArchetypeId: 'fair-value', ownerName: '顾阿姨', ownerMood: '重视节奏稳定', maintainerName: '韩起', askPrice: 606, bottomPrice: 565, initialTrust: 66, initialPatience: 68, initialHeat: 55, initialUrgency: 49, windowDays: 12 },
      { id: 'case-jiayue-3', housePrototypeId: 'proto-jiayue-71', ownerArchetypeId: 'game-player', ownerName: '葛先生', ownerMood: '很在意竞品数据', maintainerName: '许靖', askPrice: 640, bottomPrice: 595, initialTrust: 60, initialPatience: 52, initialHeat: 65, initialUrgency: 59, windowDays: 10 },
      { id: 'case-jiali-3', housePrototypeId: 'proto-jiali-east-118', ownerArchetypeId: 'trial-balloon', ownerName: '薛女士', ownerMood: '先挂着看看市场', maintainerName: '林序', askPrice: 1135, bottomPrice: 1060, initialTrust: 59, initialPatience: 44, initialHeat: 61, initialUrgency: 63, windowDays: 8 },
    ],
    competitionGroups: [
      { id: 'group-easy-balance-1', name: '静安双盘联动', members: ['case-wanhang-3', 'case-jiayue-3'], priceElasticity: 0.86, customerSpillover: 0.38 },
    ],
    scriptedEvents: [
      { id: 'event-easy-5', day: 7, actor: '竞品成交', title: '同类盘成交', message: '静安同类型盘被快速消化，你手里的资产盘跟着受益。', tone: 'success', targetMarketCellId: 'mc-jingan', demandHeatDelta: 5, sentimentDelta: 5 },
    ],
    published: true,
  },
  {
    id: 'standard-window-chain',
    worldId: BUILT_IN_WORLD.id,
    worldVersion: BUILT_IN_WORLD.version,
    difficultyId: 'standard',
    name: '换房窗口链',
    theme: '开始处理一套盘动作影响另一套盘',
    description: '5 套盘，两个竞争组，开始显著感受联动伤害。',
    startMonth: 9,
    startDay: 20,
    maxDay: 21,
    rules: mergeRules({ maxDay: 21, initialCash: 18, initialReputation: 56, randomEventProbability: 0.15 }),
    randomEventPool: [
      { templateId: 'school-boom', weight: 3 },
      { templateId: 'policy-shift', weight: 3 },
      { templateId: 'competitor-cut', weight: 4 },
    ],
    cases: [
      { id: 'case-ruiheli-std', housePrototypeId: 'proto-ruiheli-89', ownerArchetypeId: 'anxious', ownerName: '周女士', ownerMood: '换房链条催得很紧', maintainerName: '林序', askPrice: 828, bottomPrice: 785, initialTrust: 61, initialPatience: 65, initialHeat: 58, initialUrgency: 72, windowDays: 11 },
      { id: 'case-xinghu-std', housePrototypeId: 'proto-xinghuyuan-92', ownerArchetypeId: 'fair-value', ownerName: '姜先生', ownerMood: '觉得盘不错，不愿轻易让价', maintainerName: '沈岚', askPrice: 852, bottomPrice: 813, initialTrust: 63, initialPatience: 69, initialHeat: 54, initialUrgency: 58, windowDays: 12 },
      { id: 'case-jiangyue-std', housePrototypeId: 'proto-jiangyuefu-128', ownerArchetypeId: 'game-player', ownerName: '宋女士', ownerMood: '盯着竞品动作想抬价', maintainerName: '陆遥', askPrice: 1298, bottomPrice: 1210, initialTrust: 58, initialPatience: 57, initialHeat: 60, initialUrgency: 69, windowDays: 9 },
      { id: 'case-jiayue-std', housePrototypeId: 'proto-jiayue-71', ownerArchetypeId: 'trial-balloon', ownerName: '梁先生', ownerMood: '耐心不足但嘴上很硬', maintainerName: '韩起', askPrice: 628, bottomPrice: 590, initialTrust: 54, initialPatience: 40, initialHeat: 67, initialUrgency: 85, windowDays: 7 },
      { id: 'case-jiali-std', housePrototypeId: 'proto-jiali-east-118', ownerArchetypeId: 'game-player', ownerName: '陈小姐', ownerMood: '一听消息就摇摆', maintainerName: '苏景', askPrice: 1120, bottomPrice: 1050, initialTrust: 57, initialPatience: 52, initialHeat: 59, initialUrgency: 64, windowDays: 10 },
    ],
    competitionGroups: [
      { id: 'group-std-qiantan', name: '前滩改善组', members: ['case-ruiheli-std', 'case-xinghu-std', 'case-jiangyue-std'], priceElasticity: 1.18, customerSpillover: 0.56 },
      { id: 'group-std-jingan', name: '静安资产组', members: ['case-jiayue-std', 'case-jiali-std'], priceElasticity: 0.95, customerSpillover: 0.4 },
    ],
    scriptedEvents: [
      { id: 'event-std-1', day: 5, actor: '业主家庭', title: '信任危机', message: '梁先生被家里人催，开始怀疑你是不是推进太慢。', tone: 'danger', targetCaseId: 'case-jiayue-std', trustDelta: -8, urgencyDelta: 5 },
      { id: 'event-std-2', day: 8, actor: '宏观', title: '利率小幅下调', message: '市场对改善盘的看房热度突然抬头。', tone: 'success', targetMarketCellId: 'mc-qiantan', demandHeatDelta: 10, sentimentDelta: 6 },
      { id: 'event-std-3', day: 12, actor: '竞品', title: '同组盘突然跳价', message: '静安同类盘主动跳价，资产型买家的心态开始波动。', tone: 'danger', targetMarketCellId: 'mc-jingan', competitionPressureDelta: 10, sentimentDelta: -4 },
    ],
    published: true,
  },
  {
    id: 'standard-cross-fire',
    worldId: BUILT_IN_WORLD.id,
    worldVersion: BUILT_IN_WORLD.version,
    difficultyId: 'standard',
    name: '双区交火局',
    theme: '市场热度和脚本风险同时存在',
    description: '5 套盘，前半程机会多，后半程更考验选择。',
    startMonth: 11,
    startDay: 3,
    maxDay: 20,
    rules: mergeRules({ maxDay: 20, initialCash: 17, initialReputation: 55, randomEventProbability: 0.17 }),
    randomEventPool: [
      { templateId: 'school-boom', weight: 2 },
      { templateId: 'policy-shift', weight: 4 },
      { templateId: 'competitor-cut', weight: 4 },
    ],
    cases: [
      { id: 'case-ruiheli-cross', housePrototypeId: 'proto-ruiheli-89', ownerArchetypeId: 'fair-value', ownerName: '钱女士', ownerMood: '更重视策略解释是否充分', maintainerName: '许靖', askPrice: 822, bottomPrice: 788, initialTrust: 64, initialPatience: 67, initialHeat: 56, initialUrgency: 61, windowDays: 10 },
      { id: 'case-jiangyue-cross', housePrototypeId: 'proto-jiangyuefu-128', ownerArchetypeId: 'anxious', ownerName: '童先生', ownerMood: '急着锁定下一套房', maintainerName: '沈岚', askPrice: 1286, bottomPrice: 1205, initialTrust: 59, initialPatience: 54, initialHeat: 63, initialUrgency: 80, windowDays: 8 },
      { id: 'case-jiayue-cross', housePrototypeId: 'proto-jiayue-71', ownerArchetypeId: 'game-player', ownerName: '蒋先生', ownerMood: '天天看数据面板', maintainerName: '林序', askPrice: 634, bottomPrice: 592, initialTrust: 55, initialPatience: 45, initialHeat: 66, initialUrgency: 74, windowDays: 7 },
      { id: 'case-jiali-cross', housePrototypeId: 'proto-jiali-east-118', ownerArchetypeId: 'trial-balloon', ownerName: '顾女士', ownerMood: '说要卖，但随时可能撤', maintainerName: '苏景', askPrice: 1138, bottomPrice: 1058, initialTrust: 56, initialPatience: 43, initialHeat: 60, initialUrgency: 63, windowDays: 8 },
      { id: 'case-wanhang-cross', housePrototypeId: 'proto-wanhang-63', ownerArchetypeId: 'fair-value', ownerName: '章阿姨', ownerMood: '更看重成交安全感', maintainerName: '韩起', askPrice: 608, bottomPrice: 566, initialTrust: 67, initialPatience: 70, initialHeat: 52, initialUrgency: 48, windowDays: 12 },
    ],
    competitionGroups: [
      { id: 'group-cross-1', name: '改善盘对冲', members: ['case-ruiheli-cross', 'case-jiangyue-cross'], priceElasticity: 1.1, customerSpillover: 0.54 },
      { id: 'group-cross-2', name: '静安资产盘对冲', members: ['case-jiayue-cross', 'case-jiali-cross', 'case-wanhang-cross'], priceElasticity: 0.92, customerSpillover: 0.46 },
    ],
    scriptedEvents: [
      { id: 'event-cross-1', day: 6, actor: '业主家庭', title: '撤盘暗示', message: '顾女士家里人建议先撤盘观望，你得及时稳住。', tone: 'danger', targetCaseId: 'case-jiali-cross', trustDelta: -6, windowDaysDelta: -2 },
      { id: 'event-cross-2', day: 10, actor: '市场', title: '年末资产盘回暖', message: '静安资产型房源的带看需求突然回升。', tone: 'success', targetMarketCellId: 'mc-jingan', demandHeatDelta: 7, sentimentDelta: 5 },
    ],
    published: true,
  },
  {
    id: 'standard-pressure-grid',
    worldId: BUILT_IN_WORLD.id,
    worldVersion: BUILT_IN_WORLD.version,
    difficultyId: 'standard',
    name: '压力网格局',
    theme: '每个动作都会牵动其他盘',
    description: '5 套盘，两个价格带纠缠在一起，练真正的资源排序。',
    startMonth: 3,
    startDay: 15,
    maxDay: 20,
    rules: mergeRules({ maxDay: 20, initialCash: 18, initialReputation: 54, randomEventProbability: 0.18 }),
    randomEventPool: [
      { templateId: 'school-boom', weight: 2 },
      { templateId: 'policy-shift', weight: 3 },
      { templateId: 'competitor-cut', weight: 5 },
    ],
    cases: [
      { id: 'case-xinghu-grid', housePrototypeId: 'proto-xinghuyuan-92', ownerArchetypeId: 'game-player', ownerName: '马先生', ownerMood: '盯得很细，容易被别人带节奏', maintainerName: '陆遥', askPrice: 855, bottomPrice: 812, initialTrust: 58, initialPatience: 55, initialHeat: 57, initialUrgency: 67, windowDays: 9 },
      { id: 'case-ruiheli-grid', housePrototypeId: 'proto-ruiheli-89', ownerArchetypeId: 'anxious', ownerName: '周女士', ownerMood: '换房期限逼近', maintainerName: '林序', askPrice: 826, bottomPrice: 786, initialTrust: 60, initialPatience: 58, initialHeat: 59, initialUrgency: 73, windowDays: 9 },
      { id: 'case-jiayue-grid', housePrototypeId: 'proto-jiayue-71', ownerArchetypeId: 'trial-balloon', ownerName: '梁先生', ownerMood: '试水失败就想撤', maintainerName: '韩起', askPrice: 632, bottomPrice: 592, initialTrust: 53, initialPatience: 39, initialHeat: 68, initialUrgency: 82, windowDays: 7 },
      { id: 'case-wanhang-grid', housePrototypeId: 'proto-wanhang-63', ownerArchetypeId: 'fair-value', ownerName: '赵阿姨', ownerMood: '只接受有依据的动作', maintainerName: '苏景', askPrice: 607, bottomPrice: 566, initialTrust: 65, initialPatience: 66, initialHeat: 53, initialUrgency: 52, windowDays: 11 },
      { id: 'case-jiali-grid', housePrototypeId: 'proto-jiali-east-118', ownerArchetypeId: 'game-player', ownerName: '李女士', ownerMood: '随时可能被竞品刺激', maintainerName: '许靖', askPrice: 1130, bottomPrice: 1050, initialTrust: 57, initialPatience: 50, initialHeat: 60, initialUrgency: 62, windowDays: 9 },
    ],
    competitionGroups: [
      { id: 'group-grid-1', name: '前滩两房硬碰硬', members: ['case-xinghu-grid', 'case-ruiheli-grid'], priceElasticity: 1.16, customerSpillover: 0.55 },
      { id: 'group-grid-2', name: '静安小面积踩踏', members: ['case-jiayue-grid', 'case-wanhang-grid'], priceElasticity: 0.98, customerSpillover: 0.5 },
      { id: 'group-grid-3', name: '静安改善承压', members: ['case-jiali-grid', 'case-jiayue-grid'], priceElasticity: 0.82, customerSpillover: 0.32 },
    ],
    scriptedEvents: [
      { id: 'event-grid-1', day: 4, actor: '朋友电话', title: '业主情绪波动', message: '梁先生接到朋友劝退电话，开始怀疑是不是卖贵了。', tone: 'danger', targetCaseId: 'case-jiayue-grid', trustDelta: -7, urgencyDelta: 4 },
      { id: 'event-grid-2', day: 11, actor: '市场', title: '购房资格放松传闻', message: '改善型房源关注度突然抬头，但持续时间不长。', tone: 'success', targetMarketCellId: 'mc-qiantan', demandHeatDelta: 7, sentimentDelta: 4 },
    ],
    published: true,
  },
  {
    id: 'hard-market-shock',
    worldId: BUILT_IN_WORLD.id,
    worldVersion: BUILT_IN_WORLD.version,
    difficultyId: 'hard',
    name: '市场冲击局',
    theme: '高压环境下不要被迫跟着竞品乱动',
    description: '6 套盘，窗口紧，负向事件更多，适合练抗压决策。',
    startMonth: 12,
    startDay: 2,
    maxDay: 18,
    rules: mergeRules({ maxDay: 18, initialCash: 16, initialReputation: 53, randomEventProbability: 0.22, competitionPressureThreshold: 68, competitionHeatPenaltyMin: 3, competitionHeatPenaltyMax: 6 }),
    randomEventPool: [
      { templateId: 'school-boom', weight: 1 },
      { templateId: 'policy-shift', weight: 4 },
      { templateId: 'competitor-cut', weight: 6 },
    ],
    cases: [
      { id: 'case-ruiheli-hard', housePrototypeId: 'proto-ruiheli-89', ownerArchetypeId: 'anxious', ownerName: '周女士', ownerMood: '窗口非常紧', maintainerName: '林序', askPrice: 830, bottomPrice: 784, initialTrust: 57, initialPatience: 52, initialHeat: 54, initialUrgency: 81, windowDays: 8 },
      { id: 'case-xinghu-hard', housePrototypeId: 'proto-xinghuyuan-92', ownerArchetypeId: 'game-player', ownerName: '周先生', ownerMood: '盯竞品盯得很凶', maintainerName: '陆遥', askPrice: 858, bottomPrice: 810, initialTrust: 56, initialPatience: 51, initialHeat: 56, initialUrgency: 70, windowDays: 8 },
      { id: 'case-jiangyue-hard', housePrototypeId: 'proto-jiangyuefu-128', ownerArchetypeId: 'trial-balloon', ownerName: '何女士', ownerMood: '随时准备撤盘', maintainerName: '沈岚', askPrice: 1305, bottomPrice: 1200, initialTrust: 52, initialPatience: 36, initialHeat: 62, initialUrgency: 78, windowDays: 6 },
      { id: 'case-jiayue-hard', housePrototypeId: 'proto-jiayue-71', ownerArchetypeId: 'trial-balloon', ownerName: '梁先生', ownerMood: '一旦没动作就要撤', maintainerName: '韩起', askPrice: 635, bottomPrice: 588, initialTrust: 51, initialPatience: 34, initialHeat: 66, initialUrgency: 86, windowDays: 6 },
      { id: 'case-jiali-hard', housePrototypeId: 'proto-jiali-east-118', ownerArchetypeId: 'game-player', ownerName: '陈小姐', ownerMood: '情绪被市场消息牵着走', maintainerName: '苏景', askPrice: 1138, bottomPrice: 1046, initialTrust: 54, initialPatience: 46, initialHeat: 57, initialUrgency: 68, windowDays: 7 },
      { id: 'case-wanhang-hard', housePrototypeId: 'proto-wanhang-63', ownerArchetypeId: 'fair-value', ownerName: '范阿姨', ownerMood: '很克制，但也不会无限等', maintainerName: '许靖', askPrice: 610, bottomPrice: 564, initialTrust: 61, initialPatience: 58, initialHeat: 49, initialUrgency: 57, windowDays: 8 },
    ],
    competitionGroups: [
      { id: 'group-hard-1', name: '前滩三盘踩踏', members: ['case-ruiheli-hard', 'case-xinghu-hard', 'case-jiangyue-hard'], priceElasticity: 1.25, customerSpillover: 0.64 },
      { id: 'group-hard-2', name: '静安三盘承压', members: ['case-jiayue-hard', 'case-jiali-hard', 'case-wanhang-hard'], priceElasticity: 1.05, customerSpillover: 0.58 },
    ],
    scriptedEvents: [
      { id: 'event-hard-1', day: 3, actor: '业主亲友', title: '催卖升级', message: '何女士被家里强压，希望你马上拿出明确方案。', tone: 'danger', targetCaseId: 'case-jiangyue-hard', trustDelta: -6, urgencyDelta: 8, windowDaysDelta: -1 },
      { id: 'event-hard-2', day: 7, actor: '宏观', title: '融资成本上行', message: '买家观望情绪加重，整体信心被打下来。', tone: 'danger', confidenceDelta: -8 },
      { id: 'event-hard-3', day: 11, actor: '竞品', title: '区域跳价', message: '前滩竞品大幅跳价，价格锚被重新钉住。', tone: 'danger', targetMarketCellId: 'mc-qiantan', competitionPressureDelta: 12, sentimentDelta: -6 },
    ],
    published: true,
  },
  {
    id: 'hard-tight-deadline',
    worldId: BUILT_IN_WORLD.id,
    worldVersion: BUILT_IN_WORLD.version,
    difficultyId: 'hard',
    name: '窗口赛跑局',
    theme: '窗口很紧，要更早分清主次',
    description: '6 套盘，关键节点来得更密，更考验节奏安排。',
    startMonth: 2,
    startDay: 18,
    maxDay: 17,
    rules: mergeRules({ maxDay: 17, initialCash: 15, initialReputation: 52, randomEventProbability: 0.2, ownerUntouchedTrustLoss: 2, urgentOwnerUntouchedTrustLoss: 4 }),
    randomEventPool: [
      { templateId: 'school-boom', weight: 1 },
      { templateId: 'policy-shift', weight: 4 },
      { templateId: 'competitor-cut', weight: 5 },
    ],
    cases: [
      { id: 'case-ruiheli-dead', housePrototypeId: 'proto-ruiheli-89', ownerArchetypeId: 'game-player', ownerName: '朱女士', ownerMood: '特别在意市场动作', maintainerName: '林序', askPrice: 828, bottomPrice: 784, initialTrust: 56, initialPatience: 48, initialHeat: 55, initialUrgency: 74, windowDays: 7 },
      { id: 'case-xinghu-dead', housePrototypeId: 'proto-xinghuyuan-92', ownerArchetypeId: 'anxious', ownerName: '常先生', ownerMood: '换房链断不得', maintainerName: '沈岚', askPrice: 856, bottomPrice: 809, initialTrust: 55, initialPatience: 47, initialHeat: 57, initialUrgency: 79, windowDays: 7 },
      { id: 'case-jiangyue-dead', housePrototypeId: 'proto-jiangyuefu-128', ownerArchetypeId: 'trial-balloon', ownerName: '葛女士', ownerMood: '拖久了就要撤', maintainerName: '陆遥', askPrice: 1296, bottomPrice: 1198, initialTrust: 50, initialPatience: 35, initialHeat: 61, initialUrgency: 84, windowDays: 5 },
      { id: 'case-jiayue-dead', housePrototypeId: 'proto-jiayue-71', ownerArchetypeId: 'trial-balloon', ownerName: '梁先生', ownerMood: '再慢一步就想收回', maintainerName: '韩起', askPrice: 634, bottomPrice: 589, initialTrust: 50, initialPatience: 33, initialHeat: 67, initialUrgency: 87, windowDays: 5 },
      { id: 'case-jiali-dead', housePrototypeId: 'proto-jiali-east-118', ownerArchetypeId: 'game-player', ownerName: '史女士', ownerMood: '随时被消息扰动', maintainerName: '苏景', askPrice: 1133, bottomPrice: 1048, initialTrust: 53, initialPatience: 44, initialHeat: 56, initialUrgency: 70, windowDays: 6 },
      { id: 'case-wanhang-dead', housePrototypeId: 'proto-wanhang-63', ownerArchetypeId: 'fair-value', ownerName: '何阿姨', ownerMood: '愿意等，但也有底线', maintainerName: '许靖', askPrice: 608, bottomPrice: 564, initialTrust: 60, initialPatience: 54, initialHeat: 50, initialUrgency: 56, windowDays: 7 },
    ],
    competitionGroups: [
      { id: 'group-dead-1', name: '前滩紧绷组', members: ['case-ruiheli-dead', 'case-xinghu-dead', 'case-jiangyue-dead'], priceElasticity: 1.22, customerSpillover: 0.63 },
      { id: 'group-dead-2', name: '静安紧绷组', members: ['case-jiayue-dead', 'case-jiali-dead', 'case-wanhang-dead'], priceElasticity: 1.08, customerSpillover: 0.6 },
    ],
    scriptedEvents: [
      { id: 'event-dead-1', day: 4, actor: '家里催促', title: '窗口收紧', message: '葛女士突然把卖房期限往前提了一周。', tone: 'danger', targetCaseId: 'case-jiangyue-dead', urgencyDelta: 7, windowDaysDelta: -2 },
      { id: 'event-dead-2', day: 9, actor: '宏观', title: '买方观望', message: '整批客户开始等更明确的价格信号。', tone: 'danger', confidenceDelta: -10 },
    ],
    published: true,
  },
  {
    id: 'hard-chain-collapse',
    worldId: BUILT_IN_WORLD.id,
    worldVersion: BUILT_IN_WORLD.version,
    difficultyId: 'hard',
    name: '链条坍塌局',
    theme: '一套盘的价格动作会把整组盘都带偏',
    description: '6 套盘，两组强竞争图，最适合验证你的取舍能力。',
    startMonth: 8,
    startDay: 14,
    maxDay: 18,
    rules: mergeRules({ maxDay: 18, initialCash: 16, initialReputation: 52, randomEventProbability: 0.21, competitionPressureThreshold: 66, competitionTrustLossChance: 0.46 }),
    randomEventPool: [
      { templateId: 'school-boom', weight: 1 },
      { templateId: 'policy-shift', weight: 3 },
      { templateId: 'competitor-cut', weight: 6 },
    ],
    cases: [
      { id: 'case-ruiheli-chain', housePrototypeId: 'proto-ruiheli-89', ownerArchetypeId: 'anxious', ownerName: '周女士', ownerMood: '链条压得她很焦虑', maintainerName: '林序', askPrice: 830, bottomPrice: 784, initialTrust: 56, initialPatience: 49, initialHeat: 57, initialUrgency: 79, windowDays: 7 },
      { id: 'case-xinghu-chain', housePrototypeId: 'proto-xinghuyuan-92', ownerArchetypeId: 'game-player', ownerName: '陶先生', ownerMood: '喜欢拿竞品压你', maintainerName: '沈岚', askPrice: 860, bottomPrice: 810, initialTrust: 55, initialPatience: 48, initialHeat: 55, initialUrgency: 71, windowDays: 7 },
      { id: 'case-jiangyue-chain', housePrototypeId: 'proto-jiangyuefu-128', ownerArchetypeId: 'game-player', ownerName: '吴女士', ownerMood: '一听风吹草动就改主意', maintainerName: '陆遥', askPrice: 1302, bottomPrice: 1202, initialTrust: 53, initialPatience: 42, initialHeat: 59, initialUrgency: 73, windowDays: 6 },
      { id: 'case-jiayue-chain', housePrototypeId: 'proto-jiayue-71', ownerArchetypeId: 'trial-balloon', ownerName: '梁先生', ownerMood: '再试两天就撤', maintainerName: '韩起', askPrice: 636, bottomPrice: 588, initialTrust: 49, initialPatience: 31, initialHeat: 68, initialUrgency: 88, windowDays: 5 },
      { id: 'case-jiali-chain', housePrototypeId: 'proto-jiali-east-118', ownerArchetypeId: 'anxious', ownerName: '顾女士', ownerMood: '担心年底卖不掉', maintainerName: '苏景', askPrice: 1136, bottomPrice: 1046, initialTrust: 54, initialPatience: 43, initialHeat: 58, initialUrgency: 75, windowDays: 6 },
      { id: 'case-wanhang-chain', housePrototypeId: 'proto-wanhang-63', ownerArchetypeId: 'fair-value', ownerName: '徐阿姨', ownerMood: '不接受无依据降价', maintainerName: '许靖', askPrice: 609, bottomPrice: 565, initialTrust: 59, initialPatience: 52, initialHeat: 49, initialUrgency: 55, windowDays: 7 },
    ],
    competitionGroups: [
      { id: 'group-chain-1', name: '前滩强耦合组', members: ['case-ruiheli-chain', 'case-xinghu-chain', 'case-jiangyue-chain'], priceElasticity: 1.3, customerSpillover: 0.68 },
      { id: 'group-chain-2', name: '静安强耦合组', members: ['case-jiayue-chain', 'case-jiali-chain', 'case-wanhang-chain'], priceElasticity: 1.1, customerSpillover: 0.62 },
    ],
    scriptedEvents: [
      { id: 'event-chain-1', day: 5, actor: '竞品', title: '极限跳价', message: '前滩同组竞品大幅降价，把整个板块的价格预期往下拽。', tone: 'danger', targetMarketCellId: 'mc-qiantan', competitionPressureDelta: 15, sentimentDelta: -8 },
      { id: 'event-chain-2', day: 9, actor: '业主家庭', title: '关系危机', message: '梁先生质疑你是不是没把盘真正当重点。', tone: 'danger', targetCaseId: 'case-jiayue-chain', trustDelta: -9, urgencyDelta: 5 },
      { id: 'event-chain-3', day: 13, actor: '市场', title: '暑期尾声', message: '静安小户型的热度开始退潮，拖延的成本变高了。', tone: 'danger', targetMarketCellId: 'mc-jingan', demandHeatDelta: -6, sentimentDelta: -5 },
    ],
    published: true,
  },
];

export function getBuiltInScenarios() {
  return structuredClone(BUILT_IN_SCENARIOS);
}

export function listBuiltInScenarioSummaries(difficultyId?: DifficultyId) {
  return BUILT_IN_SCENARIOS
    .filter((scenario) => scenario.published && (!difficultyId || scenario.difficultyId === difficultyId))
    .map(buildScenarioSummary);
}

export function getBuiltInScenario(id: string) {
  const scenario = BUILT_IN_SCENARIOS.find((entry) => entry.id === id && entry.published);
  return scenario ? structuredClone(scenario) : null;
}

export function buildScenarioSnapshot(scenario: ScenarioDefinition, source: 'builtin' | 'cloud' = 'builtin'): ScenarioSnapshot {
  const enriched = enrichScenarioDefinition(structuredClone(scenario));
  return {
    world: getBuiltInWorld(),
    scenario: {
      ...enriched,
      rules: mergeRules(enriched.rules),
    },
    source,
  };
}

export function getScenarioSnapshotById(id: string, source: 'builtin' | 'cloud' = 'builtin') {
  const scenario = getBuiltInScenario(id);
  return scenario ? buildScenarioSnapshot(scenario, source) : null;
}
