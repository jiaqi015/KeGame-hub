import { Case, Opportunity, GameState, CompetitivenessSnapshot } from './models.js';
import { BALANCE } from './config/balance.js';
import { clamp } from './utils.js';

export function updateCompetitiveness(world: GameState, caseItem: Case) {
  const scoringBalance = BALANCE.scoring;
  const prevTotal = caseItem.competitiveness;
  const prevD1 = caseItem.d1;
  const prevD2 = caseItem.d2;
  const prevD3 = caseItem.d3;

  const d1Result = calculateD1(world, caseItem);
  const d2Result = calculateD2(caseItem);
  const d3Result = calculateD3(caseItem);

  caseItem.d1 = d1Result.score;
  caseItem.d2 = d2Result.score;
  caseItem.d3 = d3Result.score;

  caseItem.competitiveness = clamp(
    caseItem.d1 * scoringBalance.competitivenessWeights.d1 +
    caseItem.d2 * scoringBalance.competitivenessWeights.d2 +
    caseItem.d3 * scoringBalance.competitivenessWeights.d3,
    0, 100
  );

  // Snapshot for attribution
  const snapshot: CompetitivenessSnapshot = {
    day: world.day,
    total: caseItem.competitiveness,
    d1: caseItem.d1,
    d2: caseItem.d2,
    d3: caseItem.d3,
    delta: caseItem.competitiveness - prevTotal,
    breakdown: {
      d1_delta: caseItem.d1 - prevD1,
      d1_drivers: d1Result.drivers,
      d2_delta: caseItem.d2 - prevD2,
      d3_delta: caseItem.d3 - prevD3,
      d3_drivers: d3Result.drivers,
    }
  };

  caseItem.competitivenessSnapshots.unshift(snapshot);
  if (caseItem.competitivenessSnapshots.length > 10) {
    caseItem.competitivenessSnapshots.pop();
  }
}

function calculateD1(world: GameState, caseItem: Case) {
  const scoringBalance = BALANCE.scoring;
  const d1Normalization = scoringBalance.d1Normalization;
  const opps = world.opportunities.filter(o => o.caseId === caseItem.id && o.status === 'active');
  const allOppsForCase = world.opportunities.filter(o => o.caseId === caseItem.id);
  
  // 1. 客群池大小 (Pool size): 过去 7 天内进入了解阶段的客户数
  const poolSize = allOppsForCase.filter(o => world.day - (o.createdDay || 0) <= 7).length;
  
  // 2. 接触中客户数
  const activeContacts = opps.length;

  // 3. 漏斗后段厚度：按照当前 canonical 机会阶段递增加权
  // Stage Map:
  // 0:线上咨询 1:有意向 2:预约首次看房 3:已看房 4:再次看房 5:见面沟通 6:出价
  const funnelWeight = opps.reduce((sum, o) => {
    if (o.stageIndex === 6) return sum + 5; // 出价
    if (o.stageIndex === 5) return sum + 4; // 见面沟通
    if (o.stageIndex === 4) return sum + 2; // 再次看房
    if (o.stageIndex === 3) return sum + 1.5; // 已看房
    return sum;
  }, 0);
  const baselineFunnel = d1Normalization.lateStageBaseline;

  // 4. 漏斗推进速度: 过去 7 天内 stage 升格次数
  const advanceCount = opps.reduce((sum, o) => sum + o.history.filter(h => world.day - h.day <= 7).length, 0);
  const baselineSpeed = d1Normalization.advanceSpeedBaseline;

  // 5. 停滞风险
  const stagnationCount = opps.filter(o => o.stagnationTicks > 3).length;

  const d1_raw = 
    scoringBalance.d1SignalWeights.poolSize * Math.log2(poolSize + 1) * d1Normalization.poolSizeLogScale +
    scoringBalance.d1SignalWeights.activeContacts * Math.log2(activeContacts + 1) * d1Normalization.activeContactsLogScale +
    scoringBalance.d1SignalWeights.lateStageThickness * (funnelWeight / baselineFunnel) * d1Normalization.lateStageScale +
    scoringBalance.d1SignalWeights.advanceSpeed * (advanceCount / baselineSpeed) * d1Normalization.advanceSpeedScale -
    scoringBalance.d1SignalWeights.stagnationRisk * stagnationCount * d1Normalization.stagnationPenaltyPerOpportunity;

  const score = clamp(d1_raw, 0, 100);

  const drivers = [];
  if (activeContacts < 2) drivers.push({ signal: "接触中客户数", contribution: -5, reason: "活跃漏斗过窄" });
  if (stagnationCount > 0) drivers.push({ signal: "停滞风险", contribution: -stagnationCount * 2, reason: `${stagnationCount} 个客户长时间未推进` });
  
  return { score, drivers };
}

function calculateD2(caseItem: Case) {
  const scoringBalance = BALANCE.scoring;
  let score = 0;
  Object.entries(scoringBalance.d2AxisWeights).forEach(([axis, weight]) => {
    const axisScore = caseItem.axisScores[axis] || 50;
    score += axisScore * weight;
  });

  return { score, drivers: [] };
}

function calculateD3(caseItem: Case) {
  const scoringBalance = BALANCE.scoring;
  const d3Normalization = scoringBalance.d3Normalization;
  // 1. 价格灵活度: (askPrice - bottomPrice) / askPrice
  const priceFlex = (caseItem.askPrice - caseItem.bottomPrice) / caseItem.askPrice;
  const flexScore = clamp(priceFlex * d3Normalization.priceFlexFullScale * 100, 0, 100);

  // 2. 耐心水位
  const patienceScore = caseItem.patience;

  // 3. 紧迫度 (Owner Intent/Urgency)
  const urgencyScore = caseItem.urgency;

  // 4. 近期配合度 (Assumed based on touchedOwnerToday and trust)
  const cooperationScore = caseItem.trust;

  const d3_raw = 
    scoringBalance.d3SignalWeights.priceFlex * flexScore +
    scoringBalance.d3SignalWeights.patience * patienceScore +
    scoringBalance.d3SignalWeights.urgency * urgencyScore +
    scoringBalance.d3SignalWeights.recentCooperation * cooperationScore +
    scoringBalance.d3SignalWeights.consistency * d3Normalization.consistencyBaseline;

  const score = clamp(d3_raw, 0, 100);
  
  const drivers = [];
  if (priceFlex < 0.02) drivers.push({ signal: "价格灵活度", contribution: -10, reason: "报价已接近底价，议价空间极小" });
  if (patienceScore < 40) drivers.push({ signal: "耐心水位", contribution: -15, reason: "业主耐心处于红线，面临撤盘风险" });

  return { score, drivers };
}

export function calculateUrgency(caseItem: Case) {
  const scoringBalance = BALANCE.scoring;
  const urgencyNormalization = scoringBalance.portalUrgencyNormalization;
  const latestSnapshot = caseItem.competitivenessSnapshots[0];
  const delta = Math.abs(latestSnapshot?.delta || 0);
  const level = 1 - caseItem.competitiveness / 100;

  const hasCriticalEvent = (caseItem.windowDays <= 3 || caseItem.trust < 40) ? 1 : 0;
  const windowPressure = clamp((15 - caseItem.windowDays) / 15, 0, 1);

  const urgency = 
    scoringBalance.portalUrgencyWeights.deltaWeight * delta * urgencyNormalization.deltaScale +
    scoringBalance.portalUrgencyWeights.levelWeight * level * urgencyNormalization.levelScale +
    scoringBalance.portalUrgencyWeights.criticalEventWeight * hasCriticalEvent * urgencyNormalization.criticalEventScale +
    scoringBalance.portalUrgencyWeights.timeWindowWeight * windowPressure * urgencyNormalization.timeWindowScale;

  return urgency;
}
