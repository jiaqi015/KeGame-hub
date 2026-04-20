import type { DifficultyProfile, DifficultyScoreBreakdown, GeneratedRoleAssignment, ScenarioBlueprint, ScenarioValidationResult } from './types.js';
import type { ScenarioDefinition, WorldSpec } from '../models.js';
import { average, clamp } from '../utils.js';

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function computeDifficultyBreakdown(scenario: ScenarioDefinition) {
  const shortWindowCount = scenario.cases.filter((entry) => entry.windowDays <= 6).length;
  const avgWindow = average(scenario.cases.map((entry) => entry.windowDays));
  const lowTrustCount = scenario.cases.filter((entry) => entry.initialTrust <= 55).length;
  const lowPatienceCount = scenario.cases.filter((entry) => entry.initialPatience <= 42).length;
  const avgGap = average(scenario.cases.map((entry) => Math.max(0, entry.askPrice - entry.bottomPrice)));
  const negativeEventPressure = scenario.scriptedEvents
    .filter((entry) => entry.tone === 'danger')
    .reduce((sum, entry) => sum + Math.max(1, 16 - entry.day), 0);
  const negativeEventCount = scenario.scriptedEvents.filter((entry) => entry.tone === 'danger').length;
  const coupling = scenario.competitionGroups.reduce(
    (sum, group) => sum + group.members.length * group.customerSpillover * group.priceElasticity * 10,
    0,
  );

  const windowPressureScore = clamp((14 - avgWindow) * 8 + (shortWindowCount / Math.max(1, scenario.cases.length)) * 30, 0, 100);
  const relationshipFragilityScore = clamp(
    (lowTrustCount / Math.max(1, scenario.cases.length)) * 45
      + (lowPatienceCount / Math.max(1, scenario.cases.length)) * 35
      + (60 - average(scenario.cases.map((entry) => entry.initialTrust))) * 0.8,
    0,
    100,
  );
  const competitionCouplingScore = clamp(coupling * 0.8, 0, 100);
  const pricingMisfitScore = clamp((avgGap - 28) * 0.8, 0, 100);
  const eventBurstScore = clamp(negativeEventPressure * 0.8 + negativeEventCount * 6, 0, 100);

  const totalScore = clamp(
    windowPressureScore * 0.22
      + relationshipFragilityScore * 0.2
      + competitionCouplingScore * 0.22
      + pricingMisfitScore * 0.14
      + eventBurstScore * 0.22,
    0,
    100,
  );

  return {
    windowPressureScore: round(windowPressureScore),
    relationshipFragilityScore: round(relationshipFragilityScore),
    competitionCouplingScore: round(competitionCouplingScore),
    pricingMisfitScore: round(pricingMisfitScore),
    eventBurstScore: round(eventBurstScore),
    totalScore: round(totalScore),
  } satisfies DifficultyScoreBreakdown;
}

export function validateGeneratedScenario(
  scenario: ScenarioDefinition,
  blueprint: ScenarioBlueprint,
  profile: DifficultyProfile,
  world: WorldSpec,
  assignments: GeneratedRoleAssignment[],
) {
  const findings: string[] = [];

  if (scenario.cases.length !== profile.caseCount) {
    findings.push(`房源数量不符合难度画像：期望 ${profile.caseCount}，实际 ${scenario.cases.length}`);
  }

  if (scenario.competitionGroups.length < profile.competitionGroupCountRange.min || scenario.competitionGroups.length > profile.competitionGroupCountRange.max) {
    findings.push(`竞争组数量不稳定：期望 ${profile.competitionGroupCountRange.min}-${profile.competitionGroupCountRange.max}，实际 ${scenario.competitionGroups.length}`);
  }

  if (scenario.scriptedEvents.length < profile.scriptedEventCountRange.min || scenario.scriptedEvents.length > profile.scriptedEventCountRange.max) {
    findings.push(`脚本事件数量不稳定：期望 ${profile.scriptedEventCountRange.min}-${profile.scriptedEventCountRange.max}，实际 ${scenario.scriptedEvents.length}`);
  }

  for (const entry of scenario.cases) {
    const prototype = world.housePrototypes.find((candidate) => candidate.id === entry.housePrototypeId);
    const archetype = world.ownerArchetypes.find((candidate) => candidate.id === entry.ownerArchetypeId);
    if (!prototype) {
      findings.push(`房源 ${entry.id} 引用了不存在的 prototype=${entry.housePrototypeId}`);
    }
    if (!archetype) {
      findings.push(`房源 ${entry.id} 引用了不存在的 archetype=${entry.ownerArchetypeId}`);
    }
    if (entry.bottomPrice >= entry.askPrice) {
      findings.push(`房源 ${entry.id} 的底价 ${entry.bottomPrice} 不应高于或等于报价 ${entry.askPrice}`);
    }
    if (entry.windowDays < 4) {
      findings.push(`房源 ${entry.id} 的窗口过短，可能直接不可玩：${entry.windowDays}`);
    }
  }

  for (const event of scenario.scriptedEvents) {
    if (event.targetCaseId && !scenario.cases.some((candidate) => candidate.id === event.targetCaseId)) {
      findings.push(`事件 ${event.id} 指向了不存在的 case=${event.targetCaseId}`);
    }
    if (event.targetMarketCellId && !world.marketCells.some((candidate) => candidate.id === event.targetMarketCellId)) {
      findings.push(`事件 ${event.id} 指向了不存在的 market=${event.targetMarketCellId}`);
    }
  }

  const roles = new Set(assignments.map((assignment) => assignment.role));
  const requiredRoles = [...new Set(
    blueprint.caseRoleSlots
      .filter((slot) => slot.role === 'anchor' || slot.role === 'fragile')
      .map((slot) => slot.role),
  )];
  for (const role of requiredRoles) {
    if (!roles.has(role)) {
      findings.push(`蓝图 ${blueprint.id} 没有成功装配 ${role} 角色`);
    }
  }

  const breakdown = computeDifficultyBreakdown(scenario);
  if (breakdown.totalScore < profile.generationDifficultyBand.min || breakdown.totalScore > profile.generationDifficultyBand.max) {
    findings.push(`难度分漂移到 ${breakdown.totalScore}，超出画像区间 ${profile.generationDifficultyBand.min}-${profile.generationDifficultyBand.max}`);
  }

  return {
    valid: findings.length === 0,
    findings,
    breakdown,
  } satisfies ScenarioValidationResult;
}
