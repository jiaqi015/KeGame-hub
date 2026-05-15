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
    dealConversionRate: string;
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
  const conversion = describeDealConversionRate(
    control.playerBaseDealExpectation21d,
    control.marketDealCapacity21d,
  );
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
    summary: buildSummary(days, market.summaryPhrase, conversion.summaryPhrase, rival.summaryPhrase, customer.summaryPhrase),
    details: [conversion.detail, customer.detail, bonus.detail, rival.detail],
    chips: [
      { label: `${days} 天`, tone: 'normal' },
      { label: market.chip, tone: market.tone },
      { label: conversion.chip, tone: conversion.tone },
      { label: rival.chip, tone: rival.tone },
    ],
    metrics: {
      days,
      marketCapacity: market.metric,
      dealConversionRate: conversion.metric,
      rivalStrength: rival.metric,
      customerProgression: customer.metric,
      bonusPotential: bonus.metric,
    },
  };
}

function buildSummary(
  days: number,
  marketPhrase: string,
  conversionPhrase: string,
  rivalPhrase: string,
  customerPhrase: string,
) {
  if (marketPhrase.includes('很紧')) {
    return `${days} 天，${marketPhrase}，${rivalPhrase}。要保住关键客户，争取少量高质量成交。`;
  }
  if (marketPhrase.includes('偏紧')) {
    return `${days} 天，${marketPhrase}，${rivalPhrase}。需要集中资源推进关键客户。`;
  }
  if (conversionPhrase.includes('较高')) {
    return `${days} 天，${marketPhrase}，${rivalPhrase}。${conversionPhrase}，适合熟悉经营节奏。`;
  }
  if (rivalPhrase.includes('更积极') || customerPhrase.includes('更容易卡')) {
    return `${days} 天，${marketPhrase}，${rivalPhrase}。要更早识别关键客户和高风险业主。`;
  }
  return `${days} 天，${marketPhrase}，${conversionPhrase}。经营得好可再争取 1 套。`;
}

function describeMarketCapacity(capacity: number): {
  summaryPhrase: string;
  chip: string;
  metric: string;
  tone: DifficultyPresentationTone;
} {
  if (capacity >= 5) {
    return {
      summaryPhrase: `同类市场约 ${capacity} 套会成交，机会较多`,
      chip: `同类成交 ${capacity} 套`,
      metric: `21 天内同类市场预计成交约 ${capacity} 套`,
      tone: 'easy',
    };
  }
  if (capacity === 4) {
    return {
      summaryPhrase: `同类市场约 ${capacity} 套会成交`,
      chip: `同类成交 ${capacity} 套`,
      metric: `21 天内同类市场预计成交约 ${capacity} 套`,
      tone: 'normal',
    };
  }
  if (capacity === 3) {
    return {
      summaryPhrase: `同类市场约 ${capacity} 套会成交，机会偏紧`,
      chip: `同类成交 ${capacity} 套`,
      metric: `21 天内同类市场预计成交约 ${capacity} 套`,
      tone: 'warning',
    };
  }
  return {
    summaryPhrase: `同类市场约 ${capacity} 套会成交，机会很紧`,
    chip: `同类成交 ${capacity} 套`,
    metric: `21 天内同类市场预计成交约 ${capacity} 套`,
    tone: 'hard',
  };
}

function describeDealConversionRate(expectation: number, marketCapacity: number): {
  summaryPhrase: string;
  chip: string;
  metric: string;
  detail: string;
  tone: DifficultyPresentationTone;
} {
  const rate = marketCapacity > 0 ? expectation / marketCapacity : 0;
  const percent = formatPercent(rate);

  if (rate >= 0.35) {
    return {
      summaryPhrase: `成交转化率约 ${percent}，机会较高`,
      chip: `转化率 ${percent}`,
      metric: `约 ${percent}`,
      detail: `成交转化率约 ${percent}`,
      tone: 'easy',
    };
  }
  if (rate >= 0.25) {
    return {
      summaryPhrase: `成交转化率约 ${percent}`,
      chip: `转化率 ${percent}`,
      metric: `约 ${percent}`,
      detail: `成交转化率约 ${percent}`,
      tone: 'normal',
    };
  }
  if (rate >= 0.2) {
    return {
      summaryPhrase: `成交转化率约 ${percent}，需要盯紧关键客户`,
      chip: `转化率 ${percent}`,
      metric: `约 ${percent}`,
      detail: `成交转化率约 ${percent}`,
      tone: 'warning',
    };
  }
  return {
    summaryPhrase: `成交转化率约 ${percent}，机会偏少`,
    chip: `转化率 ${percent}`,
    metric: `约 ${percent}`,
    detail: `成交转化率约 ${percent}`,
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

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
