import type {
  ActionAdviceProposal,
  ActionAdviceRequest,
} from '../application/actionDecisionAdvice.js';
import type {
  AgentArbiterResult,
  AgentRunTrace,
} from '../core/world-state/agents/proposal.js';

const ACTIVATION_STORAGE_KEY = 'sabrina-activation-key';
const ACTIVATION_HEADER_NAME = 'x-activation-key';

export interface ActionDecisionAdviceResult {
  readonly advice: ActionAdviceProposal;
  readonly source: 'ai' | 'fallback';
  readonly error?: string;
  readonly trace?: AgentRunTrace;
  readonly arbiterResult?: AgentArbiterResult<ActionAdviceProposal>;
}

export async function fetchActionDecisionAdvice(
  request: ActionAdviceRequest,
  signal?: AbortSignal,
): Promise<ActionDecisionAdviceResult | null> {
  const response = await fetch('/api/selling-houses-action-advice', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ request }),
    signal,
  });

  const payload = await response.json().catch(() => ({})) as {
    advice?: unknown;
    source?: unknown;
    error?: unknown;
    trace?: unknown;
    arbiterResult?: unknown;
  };

  if (!response.ok || !payload.advice || typeof payload.advice !== 'object') {
    return null;
  }

  return {
    advice: payload.advice as ActionAdviceProposal,
    source: payload.source === 'ai' ? 'ai' : 'fallback',
    error: typeof payload.error === 'string' ? payload.error : undefined,
    trace: payload.trace as AgentRunTrace | undefined,
    arbiterResult: payload.arbiterResult as AgentArbiterResult<ActionAdviceProposal> | undefined,
  };
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
