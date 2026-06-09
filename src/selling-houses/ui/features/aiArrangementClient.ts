import type { ArrangementProjection } from '../../application/projections/operatingProjection.js';
import type { GameState, TodayArrangementSlot } from '../../domain/models.js';
import {
  buildAiArrangementProposal,
  type AiArrangementProposal,
  type AiArrangementProposalSource,
} from './aiArrangement.js';

const ACTIVATION_STORAGE_KEY = 'sabrina-activation-key';
const ACTIVATION_HEADER_NAME = 'x-activation-key';

export interface AiArrangementClientResult {
  proposal: AiArrangementProposal;
  source: 'ai' | 'fallback';
  error?: string;
}

interface AiArrangementServerResponse {
  ok?: boolean;
  proposal?: Partial<AiArrangementProposal>;
  source?: 'ai' | 'fallback';
  error?: string;
}

function normalizeProposalSource(
  value: AiArrangementProposal['source'] | AiArrangementServerResponse['source'] | undefined,
): AiArrangementProposalSource {
  if (value === 'ai' || value === 'fallback' || value === 'frontend-framework') {
    return value;
  }
  return 'fallback';
}

function buildLocalFallback(
  state: GameState,
  arrangement: ArrangementProjection,
  currentSlot: TodayArrangementSlot,
  error: string,
): AiArrangementClientResult {
  const proposal = buildAiArrangementProposal({
    arrangement,
    day: state.day,
    activeSlot: currentSlot,
  });

  return {
    proposal: {
      ...proposal,
      source: 'fallback',
    },
    source: 'fallback',
    error,
  };
}

export async function fetchAiArrangementProposal(
  state: GameState,
  arrangement: ArrangementProjection,
  currentSlot: TodayArrangementSlot,
): Promise<AiArrangementClientResult> {
  try {
    const response = await fetch('/api/ai-arrangement', {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        day: state.day,
        currentSlot,
        state,
        arrangement,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as AiArrangementServerResponse;
    if (!data.ok || !data.proposal) {
      throw new Error(data.error || 'ai_arrangement_handler_failed');
    }

    const source = data.source || (data.proposal.source === 'ai' ? 'ai' : 'fallback');
    return {
      proposal: {
        ...data.proposal,
        proposalId: data.proposal.proposalId || `fallback-${state.day}`,
        day: data.proposal.day ?? state.day,
        source: normalizeProposalSource(data.proposal.source || source),
        confidence: data.proposal.confidence ?? 0.42,
        headline: data.proposal.headline || '今天暂时不用再加安排',
        summary: data.proposal.summary || '当前余量或候选动作不足，先处理已有安排。',
        evidenceLabels: data.proposal.evidenceLabels || [],
        drafts: data.proposal.drafts || [],
      },
      source,
      error: data.error,
    };
  } catch (error) {
    return buildLocalFallback(
      state,
      arrangement,
      currentSlot,
      error instanceof Error ? error.message : 'unknown_error',
    );
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
