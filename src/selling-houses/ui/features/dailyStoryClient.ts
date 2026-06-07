import type { DailyCityStoryResult } from '../../application/dailyStory/storyContract.js';
import type { DailyCityStoryContextPack } from '../../application/dailyStory/contextPack.js';
import type { DailyStoryPlayerProfile } from '../../application/dailyStory/contextPackBuilder.js';
import { buildFallbackDailyStory } from '../../application/dailyStory/fallbackStoryWriter.js';

export interface DailyStoryClientResult {
  story: DailyCityStoryResult;
  source: 'ai' | 'fallback';
  error?: string;
}

export async function fetchDailyStory(
  pack: DailyCityStoryContextPack,
  playerProfile?: DailyStoryPlayerProfile | null,
  options?: { signal?: AbortSignal },
): Promise<DailyStoryClientResult> {
  try {
    const response = await fetch('/api/daily-story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pack, playerProfile }),
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data?.story) {
      throw new Error(data?.error || 'empty_story');
    }

    return {
      story: data.story,
      source: data.source || 'fallback',
      error: data.error,
    };
  } catch (error) {
    return {
      story: buildFallbackDailyStory(pack),
      source: 'fallback',
      error: error instanceof Error ? error.message : 'unknown_error',
    };
  }
}
