import type { ScenarioOpeningBriefing, ScenarioOpeningStory } from '../../application/scenarioOpening';

const ACTIVATION_STORAGE_KEY = 'sabrina-activation-key';
const ACTIVATION_HEADER_NAME = 'x-activation-key';

export interface ScenarioOpeningStoryClientResult {
  story: ScenarioOpeningStory;
  source: 'ai' | 'fallback';
  error?: string;
}

export async function fetchScenarioOpeningStory(
  briefing: ScenarioOpeningBriefing,
): Promise<ScenarioOpeningStoryClientResult> {
  try {
    const response = await fetch('/api/scenario-opening-story', {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ briefing }),
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
      story: briefing.openingStory,
      source: 'fallback',
      error: error instanceof Error ? error.message : 'unknown_error',
    };
  }
}

function buildHeaders() {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (typeof window !== 'undefined') {
    const activationKey = window.localStorage.getItem(ACTIVATION_STORAGE_KEY)?.trim();
    if (activationKey) {
      headers.set(ACTIVATION_HEADER_NAME, activationKey);
    }
  }
  return headers;
}
