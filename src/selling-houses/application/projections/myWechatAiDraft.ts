import type { WechatMessage } from './myWechatTypes.js';

export interface WechatBrokerReplyDraftMessage {
  id: string;
  senderName: string;
  senderRole: WechatMessage['senderRole'];
  content: string;
  timeLabel: string;
  urgency: WechatMessage['urgency'];
  targetCaseTitle?: string;
  primaryCtaLabel?: string;
  sourceTrace?: {
    source: string;
    factType: string;
    reason: string;
  };
}

export interface WechatBrokerReplyDraftRequest {
  conversationKey?: string;
  messages: WechatBrokerReplyDraftMessage[];
}

export interface WechatBrokerReplyDraft {
  messageId: string;
  content: string;
  timeLabel?: string;
}

export interface WechatBrokerReplyDraftPayload {
  replies: WechatBrokerReplyDraft[];
}

const MAX_MESSAGES_PER_DRAFT = 6;
const MAX_REPLY_CHARS = 130;
const MIN_REPLY_CHARS = 18;
const FORBIDDEN_REPLY_PATTERNS = [
  /保证/,
  /一定成交/,
  /肯定成交/,
  /系统/,
  /AI/i,
  /模型/,
  /评分/,
  /D[123]/i,
  /内部压力/,
  /隐私/,
];

export function normalizeWechatBrokerReplyDraftRequest(input: unknown): WechatBrokerReplyDraftRequest {
  const raw = isRecord(input) ? input : {};
  const rawMessages = Array.isArray(raw.messages) ? raw.messages : [];

  return {
    conversationKey: typeof raw.conversationKey === 'string' ? raw.conversationKey.slice(0, 160) : undefined,
    messages: rawMessages
      .map(normalizeDraftMessage)
      .filter((message): message is WechatBrokerReplyDraftMessage => Boolean(message))
      .slice(0, MAX_MESSAGES_PER_DRAFT),
  };
}

export function buildWechatBrokerReplyDraftPrompt(request: WechatBrokerReplyDraftRequest) {
  const messageLines = request.messages.map((message, index) => {
    const sourceTrace = message.sourceTrace
      ? `来源=${message.sourceTrace.source}/${message.sourceTrace.factType}; 触发原因=${message.sourceTrace.reason}`
      : '来源=可见微信消息';
    return [
      `#${index + 1}`,
      `messageId=${message.id}`,
      `发送者=${message.senderName}`,
      `角色=${message.senderRole}`,
      `时间=${message.timeLabel}`,
      `紧急度=${message.urgency}`,
      message.targetCaseTitle ? `关联房源=${message.targetCaseTitle}` : '',
      message.primaryCtaLabel ? `可做动作=${message.primaryCtaLabel}` : '',
      sourceTrace,
      `原消息=${message.content}`,
    ].filter(Boolean).join('\n');
  });

  return [
    '你是上海二手房经纪人的微信回复拟稿器。你只负责写“经纪人已经回过去的微信气泡”。',
    '',
    '硬规则：',
    '1. 只基于输入消息写回复，不补不存在的成交、客户、价格事实。',
    '2. 不说“系统/AI/模型/评分/D1/D2/D3/内部压力”。',
    '3. 不承诺“一定成交/保证结果”。',
    '4. 语气像真实经纪人：短、稳、具体，有下一步动作，不像培训文案。',
    '5. 同一会话里多条回复要按顺序承接，别连续重复同一句式或同一个动作。',
    '6. 每条 45 到 110 个中文字符；不要复读对方原话。',
    '7. 只输出 JSON，不要 Markdown，不要解释。',
    '',
    'JSON 格式：',
    '{"replies":[{"messageId":"原 messageId","content":"经纪人回复"}]}',
    '',
    '需要回复的微信消息：',
    messageLines.join('\n\n'),
  ].join('\n');
}

export function parseWechatBrokerReplyDraftPayload(text: string): WechatBrokerReplyDraftPayload {
  const parsed = JSON.parse(extractJsonObjectText(text)) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.replies)) {
    return { replies: [] };
  }

  return {
    replies: parsed.replies
      .map((item): WechatBrokerReplyDraft | null => {
        if (!isRecord(item)) return null;
        const messageId = typeof item.messageId === 'string' ? item.messageId.trim() : '';
        const content = typeof item.content === 'string' ? item.content.trim() : '';
        const timeLabel = typeof item.timeLabel === 'string' ? item.timeLabel.trim() : undefined;
        if (!messageId || !content) return null;
        return { messageId, content, timeLabel };
      })
      .filter((item): item is WechatBrokerReplyDraft => Boolean(item)),
  };
}

export function validateWechatBrokerReplyDrafts(
  drafts: readonly WechatBrokerReplyDraft[],
  request: WechatBrokerReplyDraftRequest,
): WechatBrokerReplyDraft[] {
  const allowedIds = new Set(request.messages.map((message) => message.id));
  const seen = new Set<string>();
  const nextDrafts: WechatBrokerReplyDraft[] = [];

  drafts.forEach((draft) => {
    if (!allowedIds.has(draft.messageId) || seen.has(draft.messageId)) return;
    const content = sanitizeBrokerReplyDraftContent(draft.content);
    if (!isUsableBrokerReply(content)) return;
    seen.add(draft.messageId);
    nextDrafts.push({
      messageId: draft.messageId,
      content,
      timeLabel: draft.timeLabel || '刚刚',
    });
  });

  return nextDrafts;
}

export function sanitizeBrokerReplyDraftContent(content: string) {
  return content
    .replace(/```(?:json)?/g, '')
    .replace(/^[“"']|[”"']$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_REPLY_CHARS);
}

function normalizeDraftMessage(input: unknown): WechatBrokerReplyDraftMessage | null {
  if (!isRecord(input)) return null;
  const id = typeof input.id === 'string' ? input.id.trim().slice(0, 160) : '';
  const senderName = typeof input.senderName === 'string' ? input.senderName.trim().slice(0, 40) : '';
  const senderRole = normalizeSenderRole(input.senderRole);
  const content = typeof input.content === 'string' ? input.content.trim().slice(0, 420) : '';
  const timeLabel = typeof input.timeLabel === 'string' ? input.timeLabel.trim().slice(0, 20) : '今天';
  const urgency = normalizeUrgency(input.urgency);

  if (!id || !senderName || !senderRole || !content) return null;

  const sourceTrace = isRecord(input.sourceTrace)
    ? {
        source: typeof input.sourceTrace.source === 'string' ? input.sourceTrace.source.slice(0, 80) : '',
        factType: typeof input.sourceTrace.factType === 'string' ? input.sourceTrace.factType.slice(0, 80) : '',
        reason: typeof input.sourceTrace.reason === 'string' ? input.sourceTrace.reason.slice(0, 220) : '',
      }
    : undefined;

  return {
    id,
    senderName,
    senderRole,
    content,
    timeLabel,
    urgency,
    targetCaseTitle: typeof input.targetCaseTitle === 'string' ? input.targetCaseTitle.slice(0, 80) : undefined,
    primaryCtaLabel: typeof input.primaryCtaLabel === 'string' ? input.primaryCtaLabel.slice(0, 30) : undefined,
    sourceTrace,
  };
}

function normalizeSenderRole(value: unknown): WechatMessage['senderRole'] | null {
  if (
    value === 'owner'
    || value === 'customer'
    || value === 'district_manager'
    || value === 'store_manager'
    || value === 'agent'
    || value === 'official_account'
    || value === 'system'
  ) {
    return value;
  }
  return null;
}

function normalizeUrgency(value: unknown): WechatMessage['urgency'] {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'medium';
}

function extractJsonObjectText(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() || trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return candidate.slice(start, end + 1);
  }
  return candidate;
}

function isUsableBrokerReply(content: string) {
  const chineseCharCount = (content.match(/[\u4e00-\u9fff]/g) || []).length;
  return content.length >= MIN_REPLY_CHARS
    && chineseCharCount >= 12
    && !FORBIDDEN_REPLY_PATTERNS.some((pattern) => pattern.test(content));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
