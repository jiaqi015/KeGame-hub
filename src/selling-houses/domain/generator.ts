import { MAINTAINER_NAMES, OWNER_NAMES } from './constants';
import type { Case, OwnerArchetype, ScenarioCase, ScenarioSnapshot } from './models';
import { pickRandom, randomFloat, randomInt, type RandomSource } from './utils';

function resolvePersonality(archetype: OwnerArchetype): Case['personality'] {
  if (archetype.id === 'anxious') {
    return 'urgent';
  }

  if (archetype.id === 'fair-value') {
    return 'pragmatic';
  }

  return 'emotional';
}

function buildCaseId(definition: ScenarioCase) {
  return definition.id || definition.housePrototypeId;
}

export function instantiateScenarioCases(snapshot: ScenarioSnapshot, source?: RandomSource): Case[] {
  return snapshot.scenario.cases.map((definition) => {
    const prototype = snapshot.world.housePrototypes.find((entry) => entry.id === definition.housePrototypeId);
    const ownerArchetype = snapshot.world.ownerArchetypes.find((entry) => entry.id === definition.ownerArchetypeId);

    if (!prototype || !ownerArchetype) {
      throw new Error(`Scenario case ${definition.id} 引用了不存在的 prototype / archetype。`);
    }

    const askPrice = definition.askPrice;
    const marketPrice = Math.round(prototype.marketPrice * (1 + randomFloat(-0.015, 0.015, source)));
    const bottomPrice = Math.min(definition.bottomPrice, askPrice - 8);
    const competitionGroupIds = snapshot.scenario.competitionGroups
      .filter((group) => group.members.includes(buildCaseId(definition)))
      .map((group) => group.id);

    return {
      id: buildCaseId(definition),
      housePrototypeId: prototype.id,
      ownerArchetypeId: ownerArchetype.id,
      title: prototype.title,
      community: prototype.community,
      district: prototype.district,
      layout: prototype.layout,
      area: prototype.area,
      askPrice,
      marketPrice,
      bottomPrice,
      patience: definition.initialPatience + ownerArchetype.patienceDelta,
      trust: definition.initialTrust,
      heat: definition.initialHeat,
      competitiveness: 0,
      urgency: definition.initialUrgency + ownerArchetype.urgencyGrowthBonus,
      windowDays: definition.windowDays,
      ownerName: definition.ownerName || pickRandom(OWNER_NAMES, source),
      ownerMood: definition.ownerMood,
      maintainerName: definition.maintainerName || pickRandom(MAINTAINER_NAMES, source),
      marketCellId: prototype.marketCellId,
      story: prototype.story,
      tags: [...prototype.tags],
      defects: [...prototype.defects],
      axisScores: { ...prototype.axisScores },
      competitivenessSnapshots: [],
      stageIndex: 0,
      stageLabel: '获客启动',
      status: 'active',
      riskFlags: [],
      actionsToday: 0,
      touchedToday: true,
      touchedOwnerToday: true,
      lastTouchedDay: 0,
      lastOwnerTouchedDay: 0,
      hasCompletedFirstVisit: false,
      lastAction: 'init',
      lastPriceActionDay: 0,
      openDayCooldown: 0,
      qualityStory: 0,
      negotiationBonus: 0,
      viewings: 0,
      offers: 0,
      soldPrice: null,
      priceGapPct: 0,
      competitionGroupIds,
      lastAskPrice: askPrice,
      lastRivalThreatDay: undefined,
      goalTier: definition.goalTier || 'normal',
      storylineState: 'healthy',
      isFocused: false,
      personality: resolvePersonality(ownerArchetype),
      d1: 50 + randomInt(-3, 4, source),
      d2: 50 + randomInt(-2, 3, source),
      d3: 50 + randomInt(-2, 4, source),
    };
  });
}
