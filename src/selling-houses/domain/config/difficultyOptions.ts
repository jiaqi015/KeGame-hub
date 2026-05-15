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
      { label: '大世界规模', value: '生成后展示整体市场体量' },
      { label: '同类市场预计成交', value: presentation.metrics.marketCapacity },
      { label: '成交转化率', value: presentation.metrics.dealConversionRate },
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
