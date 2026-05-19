import type {
  ConversationEffectProposal,
  ConversationSceneInputPack,
} from '../core/world-state/conversation/models.js';

const ACTIVATION_STORAGE_KEY = 'sabrina-activation-key';
const ACTIVATION_HEADER_NAME = 'x-activation-key';

export interface WechatConversationEffectProposalResult {
  proposal: ConversationEffectProposal;
  source: 'ai' | 'fallback';
  error?: string;
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
  };

  if (!response.ok || !payload.proposal || typeof payload.proposal !== 'object') {
    return null;
  }

  return {
    proposal: payload.proposal as ConversationEffectProposal,
    source: payload.source === 'ai' ? 'ai' : 'fallback',
    error: typeof payload.error === 'string' ? payload.error : undefined,
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
