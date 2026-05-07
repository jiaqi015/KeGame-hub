/**
 * Difficulty Presentation — domain-layer pure presentation builder.
 *
 * Moved from application/ to domain/ to fix domain→application reverse dependency.
 * This function only depends on domain types and domain config functions.
 *
 * Hard constraints:
 * 1. Only imports from domain/models, domain/config, domain/scenario-generation.
 * 2. Pure function — no side effects, no Date.now, no Math.random.
 * 3. Deterministic: same input → same output.
 */

import type { DifficultyId, GameRules } from '../models.js';
import { mergeRules } from './baseRules.js';
import { getDifficultyProfile } from '../scenario-generation/difficultyProfiles.js';

export type DifficultyPresentationTone = 'easy' | 'normal' | 'warning' | 'hard';

export interface DifficultyPresentationChip {
  label: string;
  tone: DifficultyPresentationTone;
}

export interface DifficultyPresentation {
  id: DifficultyId;
  label: string;
  shortLabel: string;
  summary: string;
  details: string[];
  chips: DifficultyPresentationChip[];
  metrics: {
    days: number;
    marketCapacity: string;
    selfDealExpectation: string;
    rivalStrength: string;
    customerProgression: string;
    bonusPotential: string;
  };
}

const DIFFICULTY_LABELS: Record<DifficultyId, { label: string; shortLabel: string }> = {
  warmup: { label: '热身局', shortLabel: '热身' },
  easy: { label: '入门局', shortLabel: '入门' },
  standard: { label: '标准局', shortLabel: '标准' },
  advanced: { label: '进阶局', shortLabel: '进阶' },
  hard: { label: '困难局', shortLabel: '困难' },
  extreme: { label: '极难局', shortLabel: '极难' },
};

export function buildDifficultyPresentation(input: {
  difficultyId: DifficultyId;
  label?: string;
  rules?: GameRules;
}): DifficultyPresentation {
  const profile = input.rules ? null : getDifficultyProfile(input.difficultyId);
  const rules = input.rules ?? mergeRules(profile?.ruleAdjustments);
  const labels = DIFFICULTY_LABELS[input.difficultyId] ?? {
    label: input.label ?? '标准局',
    shortLabel: input.label ?? '标准',
  };
  return buildDifficultyPresentationFromRules(input.difficultyId, labels.label, labels.shortLabel, rules);
}

export function buildDifficultyPresentationFromRules(
  id: DifficultyId,
  label: string,
  shortLabel: string,
  rules: GameRules,
): DifficultyPresentation {
  const control = rules.outcomeControl;
  const days = control.simulationDays || rules.maxDay;
  const market = describeMarketCapacity(control.marketDealCapacity21d);
  const selfDeal = describeSelfDealExpectation(control.playerBaseDealExpectation21d);
  const rival = describeRivalStrength(control.rivalStoreCapabilityScale, control.rivalDealShareScale);
  const customer = describeCustomerProgression(
    control.playerFunnelProgressionScale,
    control.customerStagnationScale,
  );
  const bonus = describeBonusPotential(control.playerBonusDealCapacity21d, control.playerBonusDealUnlockScore);

  return {
    id,
    label,
    shortLabel,
    summary: buildSummary(days, market.summaryPhrase, selfDeal.summaryPhrase, rival.summaryPhrase, customer.summaryPhrase),
    details: [selfDeal.detail, customer.detail, bonus.detail, rival.detail],
    chips: [
      { label: `${days} 天`, tone: 'normal' },
      { label: market.chip, tone: market.tone },
      { label: selfDeal.chip, tone: selfDeal.tone },
      { label: rival.chip, tone: rival.tone },
    ],
    metrics: {
      days,
      marketCapacity: `${control.marketDealCapacity21d} 套 · ${market.metric}`,
      selfDealExpectation: selfDeal.metric,
      rivalStrength: rival.metric,
      customerProgression: customer.metric,
      bonusPotential: bonus.metric,
    },
  };
}

function buildSummary(
  days: number,
  marketPhrase: string,
  selfDealPhrase: string,
  rivalPhrase: string,
  customerPhrase: string,
) {
  if (marketPhrase.includes('很紧')) {
    return `${days} 天，${marketPhrase}，${rivalPhrase}。要保住关键客户，争取少量高质量成交。`;
  }
  if (marketPhrase.includes('偏紧')) {
    return `${days} 天，${marketPhrase}，${rivalPhrase}。需要集中资源推进关键客户。`;
  }
  if (selfDealPhrase.includes('较充足')) {
    return `${days} 天，${marketPhrase}，${rivalPhrase}。${selfDealPhrase}，适合熟悉经营节奏。`;
  }
  if (rivalPhrase.includes('更积极') || customerPhrase.includes('更容易卡')) {
    return `${days} 天，成交空间开始变紧，${rivalPhrase}。要更早识别关键客户和高风险业主。`;
  }
  return `${days} 天，${marketPhrase}，${selfDealPhrase}。经营得好可再争取 1 套。`;
}

function describeMarketCapacity(capacity: number): {
  summaryPhrase: string;
  chip: string;
  metric: string;
  tone: DifficultyPresentationTone;
} {
  if (capacity >= 5) {
    return { summaryPhrase: '市场容量较宽', chip: '容量较宽', metric: '市场容量较宽', tone: 'easy' };
  }
  if (capacity === 4) {
    return { summaryPhrase: '市场容量正常', chip: '容量正常', metric: '市场容量正常', tone: 'normal' };
  }
  if (capacity === 3) {
    return { summaryPhrase: '市场容量偏紧', chip: '容量偏紧', metric: '市场容量偏紧', tone: 'warning' };
  }
  return { summaryPhrase: '市场容量很紧', chip: '容量很紧', metric: '市场容量很紧', tone: 'hard' };
}

function describeSelfDealExpectation(expectation: number): {
  summaryPhrase: string;
  chip: string;
  metric: string;
  detail: string;
  tone: DifficultyPresentationTone;
} {
  if (expectation >= 2) {
    return {
      summaryPhrase: '默认成交空间较充足',
      chip: '默认约 2 套',
      metric: '默认成交空间较充足',
      detail: '默认成交空间较充足',
      tone: 'easy',
    };
  }
  if (expectation >= 1) {
    return {
      summaryPhrase: '默认约 1 套成交空间',
      chip: '默认约 1 套',
      metric: `默认约 ${formatDealNumber(expectation)} 套成交空间`,
      detail: '默认约 1 套成交空间',
      tone: 'normal',
    };
  }
  if (expectation >= 0.8) {
    return {
      summaryPhrase: '需要把关键客户推进到底',
      chip: `默认约 ${formatDealNumber(expectation)} 套`,
      metric: `默认约 ${formatDealNumber(expectation)} 套成交空间`,
      detail: '默认成交空间略低于标准',
      tone: 'warning',
    };
  }
  if (expectation >= 0.7) {
    return {
      summaryPhrase: '默认成交空间有限',
      chip: `默认约 ${formatDealNumber(expectation)} 套`,
      metric: `默认约 ${formatDealNumber(expectation)} 套成交空间`,
      detail: '默认成交空间有限',
      tone: 'warning',
    };
  }
  return {
    summaryPhrase: '成交名额很紧',
    chip: `默认约 ${formatDealNumber(expectation)} 套`,
    metric: `默认约 ${formatDealNumber(expectation)} 套成交空间`,
    detail: '默认成交空间很少',
    tone: 'hard',
  };
}

function describeRivalStrength(storeScale: number, dealShareScale: number): {
  summaryPhrase: string;
  chip: string;
  metric: string;
  detail: string;
  tone: DifficultyPresentationTone;
} {
  const scale = (storeScale + dealShareScale) / 2;
  if (scale < 0.85) {
    return {
      summaryPhrase: '对手压力较弱',
      chip: '对手较弱',
      metric: '对手压力较弱',
      detail: '对手门店压力较弱',
      tone: 'easy',
    };
  }
  if (scale <= 1.1) {
    return {
      summaryPhrase: '对手正常竞争',
      chip: '对手正常',
      metric: '对手正常竞争',
      detail: '对手门店正常竞争',
      tone: 'normal',
    };
  }
  if (scale <= 1.3) {
    return {
      summaryPhrase: '对手门店更积极',
      chip: '对手积极',
      metric: '对手门店更积极',
      detail: '对手会明显分流客户',
      tone: 'warning',
    };
  }
  return {
    summaryPhrase: '对手门店强势',
    chip: '对手强势',
    metric: '对手抢客和成交能力强',
    detail: '对手更容易拿走市场成交',
    tone: 'hard',
  };
}

function describeCustomerProgression(progressionScale: number, stagnationScale: number): {
  summaryPhrase: string;
  metric: string;
  detail: string;
} {
  if (progressionScale > 1 && stagnationScale < 1) {
    return {
      summaryPhrase: '客户推进较顺',
      metric: '客户推进较顺',
      detail: '客户推进较顺',
    };
  }
  if (progressionScale < 0.8 || stagnationScale > 1.3) {
    return {
      summaryPhrase: '客户流失和停滞压力明显',
      metric: '客户流失和停滞压力明显',
      detail: '客户流失和竞品压力明显',
    };
  }
  if (progressionScale < 0.9 || stagnationScale > 1.15) {
    return {
      summaryPhrase: '客户更容易卡在二看前',
      metric: '客户更容易卡在二看/见面前',
      detail: '客户更容易卡在二看前',
    };
  }
  return {
    summaryPhrase: '客户推进正常',
    metric: '客户推进节奏正常',
    detail: '客户推进节奏正常',
  };
}

function describeBonusPotential(capacity: number, unlockScore: number): {
  metric: string;
  detail: string;
} {
  if (capacity <= 0) {
    return { metric: '无额外成交空间', detail: '无额外成交空间' };
  }
  if (capacity === 1) {
    return {
      metric: `表现好可多争取 1 套（约 ${unlockScore} 分解锁）`,
      detail: '表现好可多争取 1 套',
    };
  }
  return {
    metric: `高表现可多争取 ${capacity} 套`,
    detail: `高表现可争取 ${capacity} 套`,
  };
}

function formatDealNumber(value: number) {
  if (Number.isInteger(value)) return `${value}`;
  return value.toFixed(1).replace(/\.0$/, '');
}
