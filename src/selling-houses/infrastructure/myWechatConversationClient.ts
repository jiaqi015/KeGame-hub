import type {
  ConversationEffectProposal,
  ConversationSceneInputPack,
} from '../core/world-state/conversation/models.js';
import type {
  AgentArbiterResult,
  AgentRunTrace,
} from '../core/world-state/agents/proposal.js';
import type { AgentHarnessObservation } from '../core/world-state/agents/observation.js';
import type { AgentEvaluationReport } from '../core/world-state/agents/evaluationReport.js';
import type { AgentShadowReport } from '../core/world-state/agents/shadowReport.js';
import type { CaseAgentMeshHarnessReport } from '../application/agents/caseMeshHarness.js';

const ACTIVATION_STORAGE_KEY = 'sabrina-activation-key';
const ACTIVATION_HEADER_NAME = 'x-activation-key';

export interface WechatConversationEffectProposalResult {
  proposal: ConversationEffectProposal;
  source: 'ai' | 'fallback';
  error?: string;
  trace?: AgentRunTrace;
  arbiterResult?: AgentArbiterResult;
  observation?: AgentHarnessObservation;
  shadowReport?: AgentShadowReport;
  evaluationReport?: AgentEvaluationReport;
  meshReport?: CaseAgentMeshHarnessReport | null;
}

export async function fetchMyWechatConversationEffectProposal(
  scene: ConversationSceneInputPack,
  signal?: AbortSignal,
): Promise<WechatConversationEffectProposalResult | null> {
  const response = await fetch('/api/selling-houses-wechat-turns', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ scene }),
    signal,
  });

  const payload = await response.json().catch(() => ({})) as {
    proposal?: unknown;
    source?: unknown;
    error?: unknown;
    trace?: unknown;
    arbiterResult?: unknown;
    observation?: unknown;
    shadowReport?: unknown;
    evaluationReport?: unknown;
    meshReport?: unknown;
  };

  // Even on non-OK responses (e.g. 400 invalid input), the handler may return
  // a fallback proposal with trace. Extract trace/arbiterResult regardless of status.
  const trace = payload.trace as AgentRunTrace | undefined;
  const arbiterResult = payload.arbiterResult as AgentArbiterResult | undefined;
  const observation = payload.observation as AgentHarnessObservation | undefined;
  const shadowReport = payload.shadowReport as AgentShadowReport | undefined;
  const evaluationReport = payload.evaluationReport as AgentEvaluationReport | undefined;
  const meshReport = payload.meshReport as CaseAgentMeshHarnessReport | null | undefined;

  if (!response.ok || !payload.proposal || typeof payload.proposal !== 'object') {
    // Return trace even when proposal is unavailable, so the caller can
    // attach observability data to the fallback receipt.
    if (trace || arbiterResult) {
      return {
        proposal: null as unknown as ConversationEffectProposal,
        source: 'fallback',
        error: typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`,
        trace,
        arbiterResult,
        observation,
        shadowReport,
        evaluationReport,
        meshReport,
      };
    }
    return null;
  }

  return {
    proposal: payload.proposal as ConversationEffectProposal,
    source: payload.source === 'ai' ? 'ai' : 'fallback',
    error: typeof payload.error === 'string' ? payload.error : undefined,
    trace,
    arbiterResult,
    observation,
    shadowReport,
    evaluationReport,
    meshReport,
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
