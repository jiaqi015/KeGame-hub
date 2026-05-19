import type { WechatMessage } from '../application/projections/myWechatTypes.js';
import type { WechatBrokerReplyDraft } from '../application/projections/myWechatAiDraft.js';

const ACTIVATION_STORAGE_KEY = 'sabrina-activation-key';
const ACTIVATION_HEADER_NAME = 'x-activation-key';

export async function fetchMyWechatBrokerReplyDrafts(
  conversationKey: string,
  messages: readonly WechatMessage[],
  signal?: AbortSignal,
): Promise<WechatBrokerReplyDraft[]> {
  if (messages.length === 0) return [];

  const response = await fetch('/api/selling-houses-wechat-replies', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      conversationKey,
      messages: messages.map(toDraftMessage),
    }),
    signal,
  });

  const payload = await response.json().catch(() => ({})) as { replies?: unknown };
  if (!response.ok || !Array.isArray(payload.replies)) {
    return [];
  }

  return payload.replies
    .map((reply): WechatBrokerReplyDraft | null => {
      if (!reply || typeof reply !== 'object') return null;
      const candidate = reply as Record<string, unknown>;
      const messageId = typeof candidate.messageId === 'string' ? candidate.messageId.trim() : '';
      const content = typeof candidate.content === 'string' ? candidate.content.trim() : '';
      const timeLabel = typeof candidate.timeLabel === 'string' ? candidate.timeLabel.trim() : undefined;
      return messageId && content ? { messageId, content, timeLabel } : null;
    })
    .filter((reply): reply is WechatBrokerReplyDraft => Boolean(reply));
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

function toDraftMessage(message: WechatMessage) {
  return {
    id: message.id,
    senderName: message.senderName,
    senderRole: message.senderRole,
    content: message.content,
    timeLabel: message.timeLabel,
    urgency: message.urgency,
    targetCaseTitle: message.targetCaseTitle,
    primaryCtaLabel: message.primaryCtaLabel,
    sourceTrace: {
      source: message.sourceTrace.source,
      factType: message.sourceTrace.factType,
      reason: message.sourceTrace.reason,
    },
  };
}
