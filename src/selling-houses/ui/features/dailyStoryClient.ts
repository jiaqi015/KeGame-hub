import type { DailyCityStoryResult } from '../../application/dailyStory/storyContract.js';
import type { DailyCityStoryContextPack } from '../../application/dailyStory/contextPack.js';

export interface DailyStoryClientResult {
  story: DailyCityStoryResult;
  source: 'ai' | 'fallback';
  error?: string;
}

export async function fetchDailyStory(pack: DailyCityStoryContextPack): Promise<DailyStoryClientResult> {
  try {
    const response = await fetch('/api/daily-story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pack),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      story: data.story,
      source: data.source || 'fallback',
      error: data.error,
    };
  } catch (error) {
    return {
      story: buildFallbackStory(pack),
      source: 'fallback',
      error: error instanceof Error ? error.message : 'unknown_error',
    };
  }
}

function buildFallbackStory(pack: DailyCityStoryContextPack): DailyCityStoryResult {
  const events = pack.visibleEvents.slice(0, 3);
  const cases = pack.visibleCases.slice(0, 2);
  const owners = pack.visibleOwners.slice(0, 2);
  const customers = pack.visibleCustomers.slice(0, 2);

  const paragraphs: string[] = [];
  paragraphs.push(`${pack.cityFrame.dayLabel}，${pack.cityFrame.districts.join('、')}商圈${pack.cityFrame.marketMood}。门店节奏${pack.todayPlan.theme}，今日精力${pack.todayPlan.energy}小时。`);
  paragraphs.push('今天没有特别突出的指标变化。');
  if (events.length > 0) {
    paragraphs.push(`昨夜关键事件：${events[0].title}。${events[0].detail}`);
  } else {
    paragraphs.push('昨夜没有特别关键的经营事件。');
  }
  if (cases.length > 0) {
    paragraphs.push(`今日重点关注${cases.map(c => c.title).join('、')}。${owners.length > 0 ? `涉及业主：${owners.map(o => o.displayName).join('、')}。` : ''}`);
  } else {
    paragraphs.push('今日没有特别需要关注的房源。');
  }

  const wordCount = paragraphs.reduce((sum, p) => sum + (p.match(/[\u4e00-\u9fff]/g) || []).length, 0);

  return {
    storyId: `daily-story-${pack.day}-client-fallback`,
    source: 'fallback',
    headline: pack.reportTitle,
    deck: `${pack.cityFrame.dayLabel}经营快报`,
    cityStory: { paragraphs, wordCount },
    todayBridge: {
      label: '今天怎么接',
      value: pack.todayPlan.priorities[0] || '先处理已有安排',
      actionCue: pack.todayPlan.focusCases[0] ? `优先处理${pack.todayPlan.focusCases[0]}` : '查看今日安排',
    },
    evidenceLabels: events.slice(0, 3).map(e => e.title.slice(0, 12)),
    citedEventIds: events.map(e => e.eventId),
    citedCaseIds: cases.map(c => c.caseId),
    citedCustomerIds: customers.map(c => c.customerId),
    citedOwnerIds: owners.map(o => o.ownerId),
    safety: {
      hiddenTruthUsed: false,
      inventedFacts: false,
      needsFallback: true,
      fallbackReason: 'client_fallback',
    },
  };
}
