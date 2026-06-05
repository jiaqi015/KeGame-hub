import type { DailyCityStoryContextPack } from './contextPack.js';
import type { DailyCityStoryResult } from './storyContract.js';
import {
  FORBIDDEN_WORDS,
  MIN_PARAGRAPHS, MAX_PARAGRAPHS,
  MIN_WORD_COUNT, MAX_WORD_COUNT,
  MAX_HEADLINE_LENGTH, MAX_DECK_LENGTH,
  MAX_ACTION_CUE_LENGTH,
  MAX_EVIDENCE_LABEL_LENGTH, MIN_EVIDENCE_LABELS, MAX_EVIDENCE_LABELS,
} from './storyContract.js';

export interface NormalizedStoryResult {
  readonly result: DailyCityStoryResult;
  readonly validationNotes: readonly string[];
}

export function normalizeDailyCityStory(
  raw: unknown,
  pack: DailyCityStoryContextPack,
): NormalizedStoryResult {
  const validationNotes: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return {
      result: buildFallbackStory(pack, 'invalid_input'),
      validationNotes: ['invalid_input'],
    };
  }

  const input = raw as Record<string, unknown>;

  const validEventIds = new Set(pack.visibleEvents.map(e => e.eventId));
  const validCaseIds = new Set(pack.visibleCases.map(c => c.caseId));
  const validCustomerIds = new Set(pack.visibleCustomers.map(c => c.customerId));
  const validOwnerIds = new Set(pack.visibleOwners.map(o => o.ownerId));

  const citedEventIds = filterValidIds(input.citedEventIds, validEventIds, 'event', validationNotes);
  const citedCaseIds = filterValidIds(input.citedCaseIds, validCaseIds, 'case', validationNotes);
  const citedCustomerIds = filterValidIds(input.citedCustomerIds, validCustomerIds, 'customer', validationNotes);
  const citedOwnerIds = filterValidIds(input.citedOwnerIds, validOwnerIds, 'owner', validationNotes);

  const headline = typeof input.headline === 'string' ? input.headline.slice(0, MAX_HEADLINE_LENGTH) : pack.reportTitle;
  const deck = typeof input.deck === 'string' ? input.deck.slice(0, MAX_DECK_LENGTH) : '';

  const rawParagraphs = Array.isArray((input.cityStory as Record<string, unknown>)?.paragraphs)
    ? ((input.cityStory as Record<string, unknown>).paragraphs as unknown[]).filter((p): p is string => typeof p === 'string')
    : [];

  if (rawParagraphs.length < MIN_PARAGRAPHS) {
    validationNotes.push(`too_few_paragraphs:${rawParagraphs.length}`);
  }
  if (rawParagraphs.length > MAX_PARAGRAPHS) {
    validationNotes.push(`too_many_paragraphs:${rawParagraphs.length}`);
  }

  const paragraphs = rawParagraphs.slice(0, MAX_PARAGRAPHS);
  const wordCount = paragraphs.reduce((sum, p) => sum + countChineseChars(p), 0);

  if (wordCount < MIN_WORD_COUNT) {
    validationNotes.push(`too_short:${wordCount}`);
  }
  if (wordCount > MAX_WORD_COUNT) {
    validationNotes.push(`too_long:${wordCount}`);
  }

  const forbiddenFound = findForbiddenWords(paragraphs.join(''));
  if (forbiddenFound.length > 0) {
    validationNotes.push(`forbidden_words:${forbiddenFound.join(',')}`);
  }

  const todayBridge = normalizeTodayBridge(input.todayBridge);
  const evidenceLabels = normalizeEvidenceLabels(input.evidenceLabels);

  const safety = {
    hiddenTruthUsed: false as const,
    inventedFacts: false as const,
    needsFallback: validationNotes.length > 0,
    fallbackReason: validationNotes.length > 0 ? validationNotes[0] : undefined,
  };

  return {
    result: {
      storyId: `daily-story-${pack.day}-${Date.now()}`,
      source: validationNotes.length > 0 ? 'fallback' : 'ai',
      headline,
      deck,
      cityStory: { paragraphs, wordCount },
      todayBridge,
      evidenceLabels,
      citedEventIds,
      citedCaseIds,
      citedCustomerIds,
      citedOwnerIds,
      safety,
    },
    validationNotes,
  };
}

function filterValidIds(
  raw: unknown,
  validIds: Set<string>,
  label: string,
  notes: string[],
): string[] {
  if (!Array.isArray(raw)) return [];
  const valid: string[] = [];
  for (const id of raw) {
    if (typeof id === 'string' && validIds.has(id)) {
      valid.push(id);
    } else if (typeof id === 'string') {
      notes.push(`invalid_${label}_id:${id}`);
    }
  }
  return valid;
}

function findForbiddenWords(text: string): string[] {
  return FORBIDDEN_WORDS.filter(word => text.includes(word));
}

function countChineseChars(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) || []).length;
}

function normalizeTodayBridge(raw: unknown): DailyCityStoryResult['todayBridge'] {
  if (!raw || typeof raw !== 'object') {
    return { label: '今天怎么接', value: '先处理已有安排', actionCue: '查看今日安排' };
  }
  const input = raw as Record<string, unknown>;
  return {
    label: typeof input.label === 'string' ? input.label.slice(0, 20) : '今天怎么接',
    value: typeof input.value === 'string' ? input.value.slice(0, 40) : '先处理已有安排',
    actionCue: typeof input.actionCue === 'string' ? input.actionCue.slice(0, MAX_ACTION_CUE_LENGTH) : '查看今日安排',
  };
}

function normalizeEvidenceLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter((e): e is string => typeof e === 'string')
    .map(e => e.slice(0, MAX_EVIDENCE_LABEL_LENGTH))
    .slice(0, MAX_EVIDENCE_LABELS);
}

function buildFallbackStory(pack: DailyCityStoryContextPack, reason: string): DailyCityStoryResult {
  const events = pack.visibleEvents.slice(0, 3);
  const cases = pack.visibleCases.slice(0, 2);
  const owners = pack.visibleOwners.slice(0, 2);

  const paragraphs: string[] = [];

  paragraphs.push(`${pack.cityFrame.dayLabel}，${pack.cityFrame.districts.join('、')}商圈${pack.cityFrame.marketMood}。门店节奏${pack.todayPlan.theme}，今日精力${pack.todayPlan.energy}小时。`);

  if (pack.scoreboard.sharpestDeltas.length > 0) {
    const delta = pack.scoreboard.sharpestDeltas[0];
    paragraphs.push(`${delta.label}变化${delta.direction === 'up' ? '上升' : delta.direction === 'down' ? '下降' : '持平'}${delta.value}${delta.unit}。${pack.scoreboard.riskCount ? `当前${pack.scoreboard.riskCount}个风险点。` : ''}`);
  } else {
    paragraphs.push('今天没有特别突出的指标变化。');
  }

  if (events.length > 0) {
    const evt = events[0];
    paragraphs.push(`昨夜关键事件：${evt.title}。${evt.detail}${evt.relatedOwnerName ? `涉及${evt.relatedOwnerName}。` : ''}`);
  } else {
    paragraphs.push('昨夜没有特别关键的经营事件。');
  }

  if (cases.length > 0) {
    paragraphs.push(`今日重点关注${cases.map(c => c.title).join('、')}。${owners.length > 0 ? `涉及业主：${owners.map(o => o.displayName).join('、')}。` : ''}`);
  } else {
    paragraphs.push('今日没有特别需要关注的房源。');
  }

  const wordCount = paragraphs.reduce((sum, p) => sum + countChineseChars(p), 0);

  return {
    storyId: `daily-story-${pack.day}-fallback`,
    source: 'fallback',
    headline: pack.reportTitle,
    deck: `${pack.cityFrame.dayLabel}经营快报`,
    cityStory: { paragraphs, wordCount },
    todayBridge: {
      label: '今天怎么接',
      value: pack.todayPlan.priorities[0] || '先处理已有安排',
      actionCue: pack.todayPlan.focusCases[0] ? `优先处理${pack.todayPlan.focusCases[0]}` : '查看今日安排',
    },
    evidenceLabels: events.slice(0, 3).map(e => e.title.slice(0, MAX_EVIDENCE_LABEL_LENGTH)),
    citedEventIds: events.map(e => e.eventId),
    citedCaseIds: cases.map(c => c.caseId),
    citedCustomerIds: [],
    citedOwnerIds: owners.map(o => o.ownerId),
    safety: {
      hiddenTruthUsed: false,
      inventedFacts: false,
      needsFallback: true,
      fallbackReason: reason,
    },
  };
}
