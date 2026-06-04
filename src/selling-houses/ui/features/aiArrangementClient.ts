import type { AiArrangementProposal } from './aiArrangement.js';

export interface AiArrangementClientResult {
  proposal: AiArrangementProposal;
  source: 'ai' | 'fallback';
  error?: string;
}

export async function fetchAiArrangementProposal(
  day: number,
  currentSlot: 'am' | 'pm',
): Promise<AiArrangementClientResult> {
  try {
    const response = await fetch('/api/ai-arrangement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day, currentSlot }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      proposal: data.proposal,
      source: data.source || 'fallback',
      error: data.error,
    };
  } catch (error) {
    return {
      proposal: {
        proposalId: `fallback-${day}`,
        day,
        source: 'frontend-framework',
        confidence: 0.42,
        headline: '今天暂时不用再加安排',
        summary: '当前余量或候选动作不足，先处理已有安排。',
        evidenceLabels: [],
        drafts: [],
      },
      source: 'fallback',
      error: error instanceof Error ? error.message : 'unknown_error',
    };
  }
}
