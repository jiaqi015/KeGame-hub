import { buildDifficultyPresentation } from './difficultyPresentation.js';
import type { DifficultyId, DifficultyOption } from '../models.js';

interface DifficultyOptionMeta {
  id: DifficultyId;
  scenarioCount: number;
  featuredSeed: number;
}

const DIFFICULTY_OPTION_META: DifficultyOptionMeta[] = [
  { id: 'warmup', scenarioCount: 1, featuredSeed: 1101 },
  { id: 'easy', scenarioCount: 1, featuredSeed: 2202 },
  { id: 'standard', scenarioCount: 1, featuredSeed: 3303 },
  { id: 'advanced', scenarioCount: 1, featuredSeed: 4404 },
  { id: 'hard', scenarioCount: 1, featuredSeed: 5505 },
  { id: 'extreme', scenarioCount: 1, featuredSeed: 6606 },
];

function buildDifficultyOption(meta: DifficultyOptionMeta): DifficultyOption {
  const presentation = buildDifficultyPresentation({ difficultyId: meta.id });

  return {
    id: meta.id,
    label: presentation.label,
    summary: presentation.summary,
    detail: presentation.details.join('；'),
    scenarioCount: meta.scenarioCount,
    featuredSeed: meta.featuredSeed,
    preview: [
      { label: '模拟周期', value: `${presentation.metrics.days} 天` },
      { label: '市场容量', value: presentation.metrics.marketCapacity },
      { label: '成交预期', value: presentation.metrics.selfDealExpectation },
      { label: '对手压力', value: presentation.metrics.rivalStrength },
      { label: '客户推进', value: presentation.metrics.customerProgression },
      { label: '额外空间', value: presentation.metrics.bonusPotential },
    ],
  };
}

export const DIFFICULTY_OPTIONS: DifficultyOption[] = DIFFICULTY_OPTION_META.map(buildDifficultyOption);

export function getDifficultyOptions() {
  return structuredClone(DIFFICULTY_OPTIONS);
}
