import type { OpenDaySkillDefinition, OpenDaySkillId, OpenDayWeights } from './openDay.types.js';

export interface OpenDaySkillInput {
  scaleScore: number;
  trafficScore: number;
  productScore: number;
  interactionScore: number;
  weights: OpenDayWeights;
}

export interface OpenDaySkillResult {
  rawScore: number;
  catalystScore: number;
  volumeScore: number;
}

interface OpenDaySkillRuntimeDefinition extends OpenDaySkillDefinition {
  evaluate: (input: OpenDaySkillInput) => OpenDaySkillResult;
}

const skillRegistry: Record<OpenDaySkillId, OpenDaySkillRuntimeDefinition> = {
  weighted_catalyst_v1: {
    id: 'weighted_catalyst_v1',
    label: '规模放大模式（流量效果优先）',
    description: '规模与流量直接乘积，商品和互动按权重线性合成催化项。',
    evaluate: ({ scaleScore, trafficScore, productScore, interactionScore, weights }) => {
      const volumeScore = scaleScore * trafficScore;
      const catalystScore = weights.product * productScore + weights.interaction * interactionScore;
      return {
        rawScore: volumeScore * catalystScore * 100,
        catalystScore,
        volumeScore,
      };
    },
  },
  geometric_catalyst_v2: {
    id: 'geometric_catalyst_v2',
    label: '规模平均+好房放大（活动质量优先）',
    description: '规模与流量走几何平均，商品分做硬乘子，互动分只作为加成项。',
    evaluate: ({ scaleScore, trafficScore, productScore, interactionScore, weights }) => {
      const volumeScore = Math.sqrt(scaleScore * trafficScore);
      const catalystScore = productScore * (weights.product + weights.interaction * interactionScore);
      return {
        rawScore: volumeScore * catalystScore * 100,
        catalystScore,
        volumeScore,
      };
    },
  },
};

export function evaluateOpenDaySkill(
  skillId: OpenDaySkillId,
  input: OpenDaySkillInput,
): OpenDaySkillResult {
  const skill = skillRegistry[skillId] || skillRegistry.geometric_catalyst_v2;
  return skill.evaluate(input);
}

export function getOpenDaySkillDefinition(skillId: OpenDaySkillId) {
  return skillRegistry[skillId] || skillRegistry.geometric_catalyst_v2;
}

export function listOpenDaySkillDefinitions(): OpenDaySkillDefinition[] {
  return Object.values(skillRegistry).map(({ id, label, description }) => ({
    id,
    label,
    description,
  }));
}

export function evaluateOpenDayFormula(
  formulaId: OpenDaySkillId,
  input: OpenDaySkillInput,
): OpenDaySkillResult {
  return evaluateOpenDaySkill(formulaId, input);
}

export function getOpenDayFormulaDefinition(formulaId: OpenDaySkillId) {
  return getOpenDaySkillDefinition(formulaId);
}

export function listOpenDayFormulaDefinitions(): OpenDaySkillDefinition[] {
  return listOpenDaySkillDefinitions();
}
