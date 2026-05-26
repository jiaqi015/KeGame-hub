import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Loader2, Maximize2, MessageCircle, Minimize2, Newspaper, Send } from 'lucide-react';
import type {
  ConversationNextStepDraft,
  ConversationReceipt,
  ConversationTraceSnapshot,
} from '../../core/world-state/conversation/models.js';
import type { AgentMemoryFact } from '../../core/world-state/agents/models.js';
import { selectAgentMemoryFacts } from '../../core/world-state/agents/memoryStore.js';
import { OWNER_URGENCY_HIGH, PRICE_GAP_SIGNIFICANT } from '../../core/world-state/agents/thresholds.js';
import type { GameState } from '../../domain/models.js';
import type {
  MyWechatProjection,
  OfficialAccountArticle,
  WechatMessage,
  WechatMessageUrgency,
} from '../../application/projections/myWechatTypes.js';
import { fetchMyWechatBrokerReplyDrafts } from '../../infrastructure/myWechatAiClient.js';
import type { IntelLayerTab } from './marketIntel.js';
import { isOpportunityActiveByCanonicalState } from '../../domain/opportunityLifecycleStatusRead';

interface MyWechatPanelProps {
  state: GameState;
  projection: MyWechatProjection;
  readIds?: Set<string>;
  onMarkRead?: (id: string) => void;
  onSelectCase: (caseId: string) => void;
  onScheduleMessageAction?: (message: WechatMessage) => boolean;
  onSendConversationReply?: (
    conversationKey: string,
    message: WechatMessage,
    playerText: string,
  ) => Promise<{
    success: boolean;
    reason: string;
    receipt: unknown | null;
    trace?: unknown;
    arbiterResult?: unknown;
  }>;
  onOpenMarket?: (layer?: IntelLayerTab) => void;
}

type WechatTab = 'messages' | 'official';
type WechatConversation = {
  key: string;
  senderName: string;
  senderRole: WechatMessage['senderRole'];
  avatarLabel: string;
  messages: WechatMessage[];
  unreadCount: number;
  caseIds: string[];
  primaryMessage: WechatMessage | null;
};
type ConversationWorldContext = {
  title: string;
  primaryLine: string;
  signals: string[];
  replyAngles: string[];
  memoryFacts: AgentMemoryFact[];
};
type BrokerReplyMap = Record<string, NonNullable<WechatMessage['brokerReply']>>;
type WechatMessageRowProps = {
  conversation: WechatConversation;
  state: GameState;
  read: boolean;
  lead: boolean;
  onClick: () => void;
  onPrimaryAction?: () => void;
};
type OfficialArticleRowProps = {
  article: OfficialAccountArticle;
  read: boolean;
  onClick: () => void;
};
type OfficialArticleDetailProps = {
  article: OfficialAccountArticle;
  onBack: () => void;
  onSelectCase: (caseId: string) => void;
  onOpenMarket?: (layer?: IntelLayerTab) => void;
};
type WechatAvatarProps = {
  senderName: string;
  senderRole: WechatMessage['senderRole'];
  label: string;
  className: string;
};

const OFFICIAL_ACCOUNT_AVATAR_BY_NAME: Record<string, string> = {
  贝壳市场观察: '/selling-houses/official-avatars/official-market-observer.png',
  小区雷达: '/selling-houses/official-avatars/official-community-radar.png',
  竞品快讯: '/selling-houses/official-avatars/official-rival-brief.png',
  平台经营建议: '/selling-houses/official-avatars/official-platform-advice.png',
};

const OFFICIAL_ACCOUNT_AVATAR_FALLBACKS = Object.values(OFFICIAL_ACCOUNT_AVATAR_BY_NAME);

export function MyWechatPanel({
  state,
  projection,
  readIds,
  onMarkRead,
  onSelectCase,
  onScheduleMessageAction,
  onSendConversationReply,
  onOpenMarket,
}: MyWechatPanelProps) {
  const [activeTab, setActiveTab] = useState<WechatTab>('messages');
  const [selectedConversationKey, setSelectedConversationKey] = useState<string | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [localReadIds, setLocalReadIds] = useState<Set<string>>(() => new Set());
  const [aiBrokerReplies, setAiBrokerReplies] = useState<BrokerReplyMap>({});
  const aiReplyRequestKeysRef = useRef<Set<string>>(new Set());
  const effectiveReadIds = readIds || localReadIds;
  const visibleIds = useMemo(
    () => new Set([
      ...projection.messages.map((message) => message.id),
      ...projection.officialAccounts.map((article) => article.id),
    ]),
    [projection.messages, projection.officialAccounts],
  );

  useEffect(() => {
    if (readIds) return;
    setLocalReadIds((current) => new Set([...current].filter((id) => visibleIds.has(id))));
  }, [readIds, visibleIds]);

  const sortedMessages = useMemo(
    () => sortUnreadFirst(projection.messages, effectiveReadIds),
    [projection.messages, effectiveReadIds],
  );
  const conversations = useMemo(
    () => groupMessagesBySender(sortedMessages, effectiveReadIds),
    [effectiveReadIds, sortedMessages],
  );
  const sortedOfficialAccounts = useMemo(
    () => sortUnreadFirst(projection.officialAccounts, effectiveReadIds),
    [projection.officialAccounts, effectiveReadIds],
  );
  const unreadCount = projection.messages.filter((message) => !effectiveReadIds.has(message.id)).length;
  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.key === selectedConversationKey) || null,
    [conversations, selectedConversationKey],
  );
  const selectedArticle = useMemo(
    () => sortedOfficialAccounts.find((article) => article.id === selectedArticleId) || null,
    [selectedArticleId, sortedOfficialAccounts],
  );

  useEffect(() => {
    if (activeTab !== 'messages' || !selectedConversationKey) {
      return;
    }
    if (!conversations.some((conversation) => conversation.key === selectedConversationKey)) {
      setSelectedConversationKey(null);
    }
  }, [activeTab, conversations, selectedConversationKey]);

  useEffect(() => {
    if (activeTab !== 'official' || !selectedArticleId) {
      return;
    }
    if (!sortedOfficialAccounts.some((article) => article.id === selectedArticleId)) {
      setSelectedArticleId(null);
    }
  }, [activeTab, selectedArticleId, sortedOfficialAccounts]);

  useEffect(() => {
    if (activeTab !== 'messages' || !selectedConversation) {
      return;
    }

    const messagesToDraft = selectedConversation.messages.filter((message) =>
      !message.conversationTurns?.length && !aiBrokerReplies[message.id]);
    if (messagesToDraft.length === 0) {
      return;
    }

    const requestKey = `${selectedConversation.key}:${messagesToDraft.map((message) => message.id).join(',')}`;
    if (aiReplyRequestKeysRef.current.has(requestKey)) {
      return;
    }

    aiReplyRequestKeysRef.current.add(requestKey);
    const controller = new AbortController();

    fetchMyWechatBrokerReplyDrafts(selectedConversation.key, messagesToDraft, controller.signal)
      .then((replies) => {
        if (controller.signal.aborted || replies.length === 0) {
          return;
        }
        setAiBrokerReplies((current) => {
          const next = { ...current };
          replies.forEach((reply) => {
            next[reply.messageId] = {
              content: reply.content,
              timeLabel: reply.timeLabel || '刚刚',
            };
          });
          return next;
        });
      })
      .catch(() => {
        // Deterministic projection copy stays visible when AI is unavailable.
      })
      .finally(() => {
        if (controller.signal.aborted) {
          aiReplyRequestKeysRef.current.delete(requestKey);
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeTab, aiBrokerReplies, selectedConversation]);

  const switchTab = (tab: WechatTab) => {
    setActiveTab(tab);
    if (tab === 'messages') {
      setSelectedArticleId(null);
      return;
    }
    setSelectedConversationKey(null);
  };

  const markRead = (id: string) => {
    if (onMarkRead) {
      onMarkRead(id);
      return;
    }
    setLocalReadIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  };

  const openConversation = (conversation: WechatConversation) => {
    conversation.messages.forEach((message) => markRead(message.id));
    setSelectedConversationKey(conversation.key);
  };

  const triggerMessageAction = (message: WechatMessage) => {
    markRead(message.id);
    if (message.primaryActionId && onScheduleMessageAction) {
      const scheduled = onScheduleMessageAction(message);
      if (scheduled) return true;
    }
    setSelectedConversationKey(conversationKeyForMessage(message));
    return false;
  };

  const openArticle = (article: OfficialAccountArticle) => {
    markRead(article.id);
    setSelectedArticleId(article.id);
  };

  return (
    <section className="seller-panel overflow-hidden" data-my-wechat-panel="true">
      <div className="border-b border-[var(--seller-border)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="seller-label flex items-center gap-2">
              <WechatLogoIcon />
              我的微信
            </div>
          </div>
          {unreadCount > 0 && (
            <span className="rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
              {unreadCount}
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1 rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] p-1">
          <WechatTabButton
            active={activeTab === 'messages'}
            icon={<MessageCircle size={12} />}
            label="消息"
            count={projection.messages.length}
            onClick={() => switchTab('messages')}
          />
          <WechatTabButton
            active={activeTab === 'official'}
            icon={<Newspaper size={12} />}
            label="公众号"
            count={projection.officialAccounts.length}
            onClick={() => switchTab('official')}
          />
        </div>
      </div>

      <div className="space-y-2 px-3 py-3">
        {activeTab === 'messages' ? (
          selectedConversation ? (
            <WechatConversationDetail
              conversation={selectedConversation}
              state={state}
              brokerReplies={aiBrokerReplies}
              onBack={() => setSelectedConversationKey(null)}
              onSelectCase={onSelectCase}
              onOpenMessageAction={triggerMessageAction}
              onSendConversationReply={onSendConversationReply}
            />
          ) : conversations.length > 0 ? (
            conversations.map((conversation) => (
              <WechatMessageRow
                key={conversation.key}
                conversation={conversation}
                state={state}
                read={conversation.unreadCount === 0}
                lead={conversation.messages.some((message) => message.id === projection.leadCaseMessageId)}
                onClick={() => openConversation(conversation)}
                onPrimaryAction={conversation.primaryMessage?.primaryActionId ? () => triggerMessageAction(conversation.primaryMessage!) : undefined}
              />
            ))
          ) : (
            <WechatEmptyState title={projection.emptyState?.title || '今天没有新的微信消息'} description={projection.emptyState?.description || '先按今日安排推进。'} />
          )
        ) : selectedArticle ? (
          <OfficialArticleDetail
            article={selectedArticle}
            onBack={() => setSelectedArticleId(null)}
            onSelectCase={onSelectCase}
            onOpenMarket={onOpenMarket}
          />
        ) : sortedOfficialAccounts.length > 0 ? (
          sortedOfficialAccounts.map((article) => (
            <OfficialArticleRow key={article.id} article={article} read={effectiveReadIds.has(article.id)} onClick={() => openArticle(article)} />
          ))
        ) : (
          <WechatEmptyState title="今天没有新的公众号情报" description="市场暂时没有打到手里房源的新增变化。" />
        )}
      </div>
    </section>
  );
}

function sortUnreadFirst<T extends { id: string }>(items: T[], readIds: Set<string>) {
  return items
    .map((item, index) => ({ item, index, read: readIds.has(item.id) }))
    .sort((left, right) => {
      if (left.read !== right.read) return left.read ? 1 : -1;
      return left.index - right.index;
    })
    .map(({ item }) => item);
}

function groupMessagesBySender(messages: WechatMessage[], readIds: Set<string>) {
  const grouped = new Map<string, WechatConversation>();

  messages.forEach((message) => {
    const key = conversationKeyForMessage(message);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        key,
        senderName: message.senderName,
        senderRole: message.senderRole,
        avatarLabel: message.avatarLabel,
        messages: [message],
        unreadCount: readIds.has(message.id) ? 0 : 1,
        caseIds: message.targetCaseId ? [message.targetCaseId] : [],
        primaryMessage: message.primaryActionId ? message : null,
      });
      return;
    }

    existing.messages.push(message);
    existing.unreadCount += readIds.has(message.id) ? 0 : 1;
    if (message.targetCaseId && !existing.caseIds.includes(message.targetCaseId)) {
      existing.caseIds.push(message.targetCaseId);
    }
    if (!existing.primaryMessage && message.primaryActionId) {
      existing.primaryMessage = message;
    }
  });

  return [...grouped.values()];
}

function conversationKeyForMessage(message: WechatMessage) {
  return `${message.senderRole}:${message.senderName}`;
}

function getWechatSenderDisplayName(senderName: string, senderRole: WechatMessage['senderRole']) {
  const raw = senderName.replace(/\s+/g, ' ').trim();
  const suffix = senderRoleLabel(senderRole);
  return raw.replace(new RegExp(`\\s*${suffix}$`), '').trim() || raw;
}

function stripWechatSpeakerPrefix(text: string, senderName: string, senderRole: WechatMessage['senderRole']) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const displayName = getWechatSenderDisplayName(senderName, senderRole);
  const candidates = [
    `${senderName}：`,
    `${senderName}:`,
    `${displayName}：`,
    `${displayName}:`,
  ];
  for (const prefix of candidates) {
    if (normalized.startsWith(prefix)) {
      return normalized.slice(prefix.length).trim();
    }
  }
  return normalized;
}

function resolveReplyTargetMessage(conversation: WechatConversation) {
  const bottomFirstMessages = [...conversation.messages].reverse();
  return bottomFirstMessages.find((message) =>
    (message.primaryActionId || message.urgency === 'high') && !(message.conversationTurns?.length))
    || bottomFirstMessages.find((message) => !(message.conversationTurns?.length))
    || bottomFirstMessages[0]
    || conversation.primaryMessage
    || null;
}

function getLatestConversationReceipt(conversation: WechatConversation) {
  return conversation.messages
    .flatMap((message) => message.conversationTurns || [])
    .sort((left, right) => right.turnIndex - left.turnIndex)[0] || null;
}

function hasConversationHandledMessage(message: WechatMessage) {
  return Boolean(message.conversationTurns?.length);
}

function isMessageActionScheduled(state: GameState, message: WechatMessage) {
  if (!message.primaryActionId || !message.targetCaseId) {
    return false;
  }

  return Boolean(state.todayPlan?.playerItems?.some((item) => (
    item.day === state.day
    && (item.status === 'planned' || item.status === 'completed')
    && item.linkedActionId === message.primaryActionId
    && item.linkedCaseId === message.targetCaseId
    && (!message.targetCustomerId || item.linkedCustomerId === message.targetCustomerId)
    && (!message.targetOpportunityId || item.linkedOpportunityId === message.targetOpportunityId)
  )));
}

function buildConversationListImpactText(turn: ConversationReceipt) {
  const labels = getConversationEffectLabels(turn);
  const nextStep = getConversationNextSteps(turn)[0] || null;
  if (labels.length > 0 && nextStep) {
    return `已回复 · ${labels.slice(0, 2).join(' · ')} · 下一步 ${nextStep.label}`;
  }
  if (labels.length > 0) {
    return `已回复 · ${labels.slice(0, 3).join(' · ')}`;
  }
  if (nextStep) {
    return `已回复 · 下一步 ${nextStep.label}`;
  }
  return turn.summary ? `已回复 · ${turn.summary}` : '已回复';
}

function buildConversationWorldContext(
  conversation: WechatConversation,
  state: GameState,
): ConversationWorldContext | null {
  const anchorMessage = resolveReplyTargetMessage(conversation) || conversation.messages[0] || null;
  const caseId = anchorMessage?.targetCaseId || conversation.caseIds[0] || '';
  const caseItem = caseId ? state.cases.find((entry) => entry.id === caseId) || null : null;
  const opportunity = anchorMessage?.targetOpportunityId
    ? state.opportunities.find((entry) => entry.id === anchorMessage.targetOpportunityId) || null
    : caseItem
      ? state.opportunities.find((entry) => entry.caseId === caseItem.id && isOpportunityActiveByCanonicalState(state, entry)) || null
      : null;

  if (!caseItem && !opportunity && !anchorMessage) {
    return null;
  }

  const signals: string[] = [];
  const replyAngles: string[] = [];
  const memoryFacts = selectAgentMemoryFacts(state.agentMemoryStore, {
    conversationKey: conversation.key,
    caseId: caseItem?.id,
    opportunityId: opportunity?.id,
    channel: 'wechat',
    day: state.day,
    limit: 4,
  });

  if (caseItem) {
    signals.push(describeListingPricePositionShort(caseItem));
    signals.push(`${caseItem.ownerName} · ${describeOwnerStateShort(caseItem)}`);
    signals.push(caseItem.hasCompletedFirstVisit ? '已做过面访' : '待首次面访');
    if (caseItem.viewings > 0 || caseItem.offers > 0) {
      signals.push(`带看 ${caseItem.viewings} 次 · 报价 ${caseItem.offers} 次`);
    }
    replyAngles.push(buildOwnerReplyAngle(caseItem));
    replyAngles.push(buildMarketEvidenceReplyAngle(caseItem));
    if (caseItem.priceGapPct > PRICE_GAP_SIGNIFICANT || caseItem.urgency >= OWNER_URGENCY_HIGH) {
      replyAngles.push(buildPriceReplyAngle(caseItem));
    }
  }

  if (opportunity) {
    signals.push(describeOpportunityIntentShort(opportunity));
    replyAngles.push(`我先把${opportunity.customerName}的顾虑和可接受价格问清，再回来给您一个实在判断。`);
  }

  return {
    title: caseItem?.title || opportunity?.customerName || getWechatSenderDisplayName(conversation.senderName, conversation.senderRole),
    primaryLine: caseItem
      ? `${caseItem.community} · ${caseItem.district} · 这条微信会影响今天的跟进节奏`
      : '这条微信会影响今天的跟进节奏',
    signals: dedupeStrings(signals).slice(0, 4),
    replyAngles: dedupeStrings(replyAngles).slice(0, 3),
    memoryFacts,
  };
}

function describeListingPricePositionShort(caseItem: GameState['cases'][number]) {
  const gap = Number.isFinite(caseItem.priceGapPct) ? caseItem.priceGapPct : 0;
  if (gap >= 3) return `挂价高于市场 ${Math.round(gap)}%`;
  if (gap >= 1) return `挂价略高 ${Math.round(gap)}%`;
  if (gap <= -1) return `挂价低于市场 ${Math.abs(Math.round(gap))}%`;
  return '价格接近市场';
}

function describeOwnerStateShort(caseItem: GameState['cases'][number]) {
  const trust = describeLevel(caseItem.trust);
  const patience = describeLevel(caseItem.patience);
  const urgency = describeLevel(caseItem.urgency);
  return `信任${trust} · 耐心${patience} · 催促${urgency}`;
}

function describeOpportunityIntentShort(opportunity: NonNullable<GameState['opportunities'][number]>) {
  if (opportunity.intent >= 72) {
    return `${opportunity.customerName} 准备出价`;
  }
  if (opportunity.intent >= 45) {
    return `${opportunity.customerName} 在对比`;
  }
  return `${opportunity.customerName} 意向偏薄`;
}

function describeLevel(value: number) {
  if (value >= 72) return '高';
  if (value >= 45) return '中';
  return '低';
}

function buildOwnerReplyAngle(caseItem: GameState['cases'][number]) {
  if (!caseItem.hasCompletedFirstVisit) {
    return `${caseItem.ownerName}，我今天先不让您只听一句再等等，下午当面把客户反馈、竞品价格和可选方案摊开说清楚。`;
  }
  return `${caseItem.ownerName}，我今天把近两天反馈和同类竞品放在一起复盘，给您一个能执行的判断。`;
}

function buildMarketEvidenceReplyAngle(caseItem: GameState['cases'][number]) {
  return `我会拿${caseItem.community}同类房、最近客户反馈和我们这套的差异一起讲，不让您凭感觉做决定。`;
}

function buildPriceReplyAngle(caseItem: GameState['cases'][number]) {
  return `价格我不空口劝您动，先用客户反馈和同类成交判断：是守住、微调，还是先换展示打法。`;
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

const WechatDraftReplySuggestion: React.FC<{
  reply: NonNullable<WechatMessage['brokerReply']>;
  onUse: () => void;
}> = ({ reply, onUse }) => {
  return (
    <div className="flex justify-end gap-2.5">
      <div className="min-w-0 max-w-[80%]">
        <div className="mb-1 flex items-center justify-end gap-2 text-[10px] text-[var(--seller-subtle)]">
          <span>{reply.timeLabel}</span>
        </div>
        <div className="rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.06)] px-3 py-2.5 shadow-[0_10px_24px_rgba(0,0,0,0.06)]">
          <p className="whitespace-pre-wrap text-[12px] leading-5 text-[var(--seller-ink)]">{reply.content}</p>
          <button
            type="button"
            onClick={onUse}
            className="mt-2 inline-flex items-center gap-1 rounded-full border border-[color:var(--seller-accent)]/24 bg-[color:var(--seller-accent)]/10 px-2 py-0.5 text-[9px] font-semibold text-[var(--seller-accent)] transition hover:bg-[color:var(--seller-accent)]/16"
          >
            填入
          </button>
        </div>
      </div>
    </div>
  );
};

const ConversationWorldContextCard: React.FC<{
  context: ConversationWorldContext;
  latestReceipt: ConversationReceipt | null;
  onUseAngle: (text: string) => void;
  onUseNextStep: (receipt: ConversationReceipt, step: ConversationNextStepDraft) => void;
  isNextStepHandled?: (receipt: ConversationReceipt, step: ConversationNextStepDraft) => boolean;
}> = ({ context, latestReceipt, onUseAngle, onUseNextStep, isNextStepHandled }) => {
  const [selectedAngleIndex, setSelectedAngleIndex] = useState(0);
  const [memoryExpanded, setMemoryExpanded] = useState(false);
  const latestNextSteps = latestReceipt ? getConversationNextSteps(latestReceipt) : [];
  const primaryNextStep = latestNextSteps[0] || null;
  const primaryNextStepHandled = Boolean(latestReceipt && primaryNextStep && isNextStepHandled?.(latestReceipt, primaryNextStep));
  const replyAngleKey = context.replyAngles.join('\u0001');
  const selectedAngle = context.replyAngles[selectedAngleIndex] || context.replyAngles[0];

  useEffect(() => {
    setSelectedAngleIndex(0);
    setMemoryExpanded(false);
  }, [context.title, context.primaryLine, replyAngleKey]);

  return (
    <div className="border-b border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="seller-label text-[9px]">会话背景</div>
          <div className="mt-1 truncate text-[12px] font-semibold text-[var(--seller-ink)]">{context.title}</div>
          <div className="mt-0.5 truncate text-[10px] text-[var(--seller-subtle)]">{context.primaryLine}</div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <span className={`seller-chip ${latestReceipt ? 'seller-chip-accent' : ''}`}>
            {latestReceipt ? '已回复' : '待回复'}
          </span>
          {primaryNextStep && latestReceipt && primaryNextStepHandled ? (
            <span className="seller-chip seller-chip-chance">
              已接入今日安排
            </span>
          ) : primaryNextStep && latestReceipt ? (
            <button
              type="button"
              onClick={() => onUseNextStep(latestReceipt, primaryNextStep)}
              className="seller-chip seller-chip-chance"
              title={primaryNextStep.reason}
            >
              下一步：{primaryNextStep.label}
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {context.signals.map((signal) => (
          <span
            key={signal}
            className="rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.05)] px-2 py-0.5 text-[9px] font-semibold text-[var(--seller-muted)]"
          >
            {signal}
          </span>
        ))}
      </div>
      {context.replyAngles.length > 0 && (
        <div className="mt-2 rounded-[10px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.045)] px-2.5 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[9px] font-semibold text-[var(--seller-subtle)]">回复参考</span>
            <p className="min-w-0 flex-1 truncate text-[11px] leading-5 text-[var(--seller-ink)]" title={selectedAngle}>
              {selectedAngle}
            </p>
            <button
              type="button"
              onClick={() => onUseAngle(selectedAngle)}
              className="shrink-0 rounded-full border border-[color:var(--seller-accent)]/20 bg-[color:var(--seller-accent)]/8 px-1.5 py-0 text-[8px] font-semibold leading-4 text-[var(--seller-accent)] transition hover:bg-[color:var(--seller-accent)]/14"
              title={selectedAngle}
            >
              填入
            </button>
            {context.replyAngles.length > 1 && (
              <div className="flex shrink-0 gap-0.5">
                {context.replyAngles.slice(1, 3).map((angle, index) => (
                  <button
                    key={angle}
                    type="button"
                    onClick={() => setSelectedAngleIndex(index + 1)}
                    aria-pressed={selectedAngleIndex === index + 1}
                    className={`rounded-full border px-1.5 py-0 text-[8px] font-semibold leading-4 transition ${
                      selectedAngleIndex === index + 1
                        ? 'border-[color:var(--seller-accent)]/35 bg-[color:var(--seller-accent)]/10 text-[var(--seller-accent)]'
                        : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] text-[var(--seller-subtle)] hover:border-[color:var(--seller-accent)]/24 hover:text-[var(--seller-accent)]'
                    }`}
                    title={`查看：${angle}`}
                  >
                    备{index + 2}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {context.memoryFacts.length > 0 && (
        <div className="mt-1.5 grid gap-1">
          <button
            type="button"
            onClick={() => setMemoryExpanded((expanded) => !expanded)}
            aria-expanded={memoryExpanded}
            className="inline-flex h-6 w-fit items-center gap-1.5 rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] px-2 text-left text-[9px] font-semibold text-[var(--seller-subtle)] transition hover:border-[color:var(--seller-accent)]/24 hover:text-[var(--seller-ink)]"
          >
            <span>记忆线索 {context.memoryFacts.length} 条</span>
            <ChevronRight size={10} className={`transition-transform ${memoryExpanded ? 'rotate-90' : ''}`} />
          </button>
          {memoryExpanded && context.memoryFacts.slice(0, 3).map((fact) => (
            <div
              key={fact.factId}
              className="rounded-[10px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.035)] px-2.5 py-1.5 text-[9px] leading-4 text-[var(--seller-muted)]"
              title={fact.kind}
            >
              {fact.summary}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function senderRoleLabel(role: WechatMessage['senderRole']) {
  if (role === 'owner') return '业主';
  if (role === 'customer') return '客户';
  if (role === 'district_manager') return '区域经理';
  if (role === 'store_manager') return '商圈经理';
  if (role === 'agent') return '经纪人';
  if (role === 'official_account') return '公众号';
  return '系统';
}

function WechatLogoIcon() {
  return (
    <span className="flex h-4 w-4 items-center justify-center rounded-[5px] bg-[#07c160]" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white" fill="currentColor">
        <path d="M9.4 5.3c-3.7 0-6.7 2.3-6.7 5.2 0 1.6.9 3 2.4 3.9l-.5 1.8 2.2-1.1c.8.2 1.6.4 2.6.4 3.7 0 6.7-2.3 6.7-5.1S13.1 5.3 9.4 5.3Zm-2.2 4a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Zm4.3 0a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Z" />
        <path d="M21.4 13.8c0-2.4-2.5-4.4-5.5-4.4h-.2c.1.3.1.6.1.9 0 3.2-3.1 5.8-7 5.9 1 1.3 2.8 2.1 4.9 2.1.8 0 1.4-.1 2.1-.3l1.8.9-.4-1.5c2.5-.8 4.2-2.1 4.2-3.6Zm-7.3-.8a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4Zm3.6 0a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4Z" />
      </svg>
    </span>
  );
}

function WechatTabButton({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-my-wechat-tab={label}
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-[9px] px-2 py-1.5 text-[11px] font-semibold transition-all ${
        active
          ? 'bg-[var(--seller-ink)] text-[var(--seller-bg)] shadow-[0_10px_24px_rgba(0,0,0,0.18)]'
          : 'text-[var(--seller-muted)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--seller-ink)]'
      }`}
    >
      {icon}
      {label}
      <span className={active ? 'text-[var(--seller-bg)]/70' : 'text-[var(--seller-subtle)]'}>{count}</span>
    </button>
  );
}

const WechatMessageRow: React.FC<WechatMessageRowProps> = ({
  conversation,
  state,
  read,
  lead,
  onClick,
  onPrimaryAction,
}) => {
  const latestMessage = conversation.messages[0];
  const displayName = getWechatSenderDisplayName(conversation.senderName, conversation.senderRole);
  const latestReceipt = getLatestConversationReceipt(conversation);
  const latestImpact = latestReceipt ? buildConversationListImpactText(latestReceipt) : '';
  const primaryActionHandled = hasConversationHandledMessage(latestMessage) || isMessageActionScheduled(state, latestMessage);
  return (
    <div
      data-my-wechat-message-row="true"
      data-my-wechat-read={read ? 'true' : 'false'}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      className="group flex w-full cursor-pointer gap-2.5 rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] px-3 py-2.5 text-left transition-all hover:border-[color:var(--seller-accent)]/45 hover:bg-[rgba(255,255,255,0.05)]"
    >
      <span
        aria-hidden="true"
        className={`mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full ${read ? 'bg-transparent' : 'bg-rose-500 shadow-[0_0_0_2px_var(--seller-panel)]'}`}
      />
      <WechatAvatar
        senderName={conversation.senderName}
        senderRole={conversation.senderRole}
        label={conversation.avatarLabel}
        className="h-9 w-9 rounded-full"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0 truncate text-[13px] font-semibold text-[var(--seller-ink)]">{displayName}</div>
          <span className="shrink-0 text-[10px] font-medium text-[var(--seller-subtle)]">{latestMessage.timeLabel}</span>
        </div>
        <p className={`mt-1 line-clamp-2 text-[11px] leading-5 ${latestImpact ? 'font-medium text-[var(--seller-ink)]' : 'text-[var(--seller-muted)]'}`}>
          {latestImpact || stripWechatSpeakerPrefix(latestMessage.preview, conversation.senderName, conversation.senderRole)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${urgencyClassName(latestMessage.urgency)}`}>
            {urgencyLabel(latestMessage.urgency)}
          </span>
          {lead && <span className="seller-chip seller-chip-accent">今日重点</span>}
          {latestReceipt && <span className="seller-chip">已回复</span>}
          {latestReceipt && getConversationEffectLabels(latestReceipt).slice(0, 2).map((label) => (
            <span key={label} className="seller-chip seller-chip-accent">{label}</span>
          ))}
          {latestMessage.primaryCtaLabel && primaryActionHandled ? (
            <span className="seller-chip">已承接</span>
          ) : latestMessage.primaryCtaLabel && onPrimaryAction ? (
            <button
              type="button"
              data-my-wechat-message-action="true"
              onClick={(event) => {
                event.stopPropagation();
                onPrimaryAction();
              }}
              className="rounded-full border border-[color:var(--seller-accent)]/24 bg-[color:var(--seller-accent)]/8 px-1.5 py-0 text-[9px] font-semibold leading-[17px] text-[var(--seller-accent)] transition hover:bg-[color:var(--seller-accent)]/14"
              title="点击直接安排事项"
            >
              {latestMessage.primaryCtaLabel}
            </button>
          ) : latestMessage.primaryCtaLabel ? (
            <span className="text-[10px] font-semibold text-[var(--seller-accent)]">{latestMessage.primaryCtaLabel}</span>
          ) : null}
        </div>
      </div>
      <ChevronRight size={14} className="mt-3 shrink-0 text-[var(--seller-subtle)] transition-transform group-hover:translate-x-0.5" />
    </div>
  );
};

const WechatConversationDetail: React.FC<{
  conversation: WechatConversation;
  state: GameState;
  brokerReplies: BrokerReplyMap;
  onBack: () => void;
  onSelectCase: (caseId: string) => void;
  onOpenMessageAction: (message: WechatMessage) => boolean;
  onSendConversationReply?: (
    conversationKey: string,
    message: WechatMessage,
    playerText: string,
  ) => Promise<{ success: boolean; reason: string; receipt: unknown | null }>;
}> = ({
  conversation,
  state,
  brokerReplies,
  onBack,
  onSelectCase,
  onOpenMessageAction,
  onSendConversationReply,
}) => {
  const replyTarget = resolveReplyTargetMessage(conversation);
  const displayName = getWechatSenderDisplayName(conversation.senderName, conversation.senderRole);
  const worldContext = buildConversationWorldContext(conversation, state);
  const latestReceipt = getLatestConversationReceipt(conversation);
  const [draftText, setDraftText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [fallbackHint, setFallbackHint] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const prevScrollKey = useRef({ key: '', turns: 0, brokers: 0 });
  const conversationTurnCount = conversation.messages.reduce((total, message) => total + (message.conversationTurns?.length || 0), 0);
  const brokerReplyCount = conversation.messages.reduce((total, message) => total + (brokerReplies[message.id] ? 1 : 0), 0);

  useEffect(() => {
    setDraftText('');
    setSendError(null);
    setSending(false);
    setExpanded(true);
  }, [conversation.key]);

  useEffect(() => {
    const node = chatScrollRef.current;
    if (!node) return;

    const prev = prevScrollKey.current;
    const isKeyChange = prev.key !== conversation.key;
    const hasNewContent = !isKeyChange && (
      conversationTurnCount > prev.turns || brokerReplyCount > prev.brokers
    );

    prevScrollKey.current = { key: conversation.key, turns: conversationTurnCount, brokers: brokerReplyCount };

    if (!isKeyChange && !hasNewContent) return;

    const frame = window.requestAnimationFrame(() => {
      if (!chatScrollRef.current) return;
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: isKeyChange ? 'instant' as ScrollBehavior : 'smooth' as ScrollBehavior,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversation.key, conversationTurnCount, brokerReplyCount]);

  const submitReply = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draftText.replace(/\s+/g, ' ').trim();
    if (!text || !replyTarget || !onSendConversationReply || sending) {
      return;
    }

    setSending(true);
    setSendError(null);
    setFallbackHint(false);
    const fallbackTimer = setTimeout(() => setFallbackHint(true), 1200);
    try {
      const result = await onSendConversationReply(conversation.key, replyTarget, text);
      clearTimeout(fallbackTimer);
      setFallbackHint(false);
      if (result.success) {
        setDraftText('');
        return;
      }
      setSendError(result.reason || '这条回复暂时没有发出去。');
    } catch (error) {
      clearTimeout(fallbackTimer);
      setFallbackHint(false);
      setSendError(error instanceof Error ? error.message : '这条回复暂时没有发出去。');
    } finally {
      setSending(false);
    }
  };

  const useNextStep = (receipt: ConversationReceipt, step: ConversationNextStepDraft) => {
    const actionMessage = buildNextStepActionMessage(conversation, state, replyTarget, receipt, step);

    if (actionMessage) {
      const scheduled = onOpenMessageAction(actionMessage);
      if (scheduled) return;
    }

    const targetCaseId = receipt.targetCaseId || actionMessage?.targetCaseId;
    if (targetCaseId) {
      onSelectCase(targetCaseId);
    }
  };

  const detailPanel = (
    <div
      className={`seller-wechat-detail flex flex-col overflow-hidden rounded-[18px] border border-[var(--seller-border)] shadow-[0_20px_50px_rgba(0,0,0,0.14)] transition-all duration-200 ${
        expanded
          ? 'fixed bottom-3 left-3 right-3 top-[88px] z-[95] h-auto min-h-0 md:left-auto md:right-4 md:w-[min(620px,calc(100vw-24px))] xl:w-[min(700px,calc(100vw-24px))] xl:top-[96px] xl:right-5 xl:bottom-5'
          : 'h-[min(820px,calc(100vh-110px))] min-h-[660px]'
      }`}
    >
      <div className="seller-wechat-topbar flex shrink-0 items-center gap-2 border-b border-[var(--seller-border)] px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[16px] text-[var(--seller-muted)] transition hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--seller-ink)]"
          aria-label="返回消息列表"
        >
          ←
        </button>
        <WechatAvatar
          senderName={conversation.senderName}
          senderRole={conversation.senderRole}
          label={conversation.avatarLabel}
          className="h-8 w-8 rounded-full"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-[var(--seller-ink)]">{displayName}</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] text-[var(--seller-subtle)]">
            <span>{senderRoleLabel(conversation.senderRole)}</span>
            <span className="h-0.5 w-0.5 rounded-full bg-current opacity-50" />
            <span>DAY {state.day}</span>
          </div>
        </div>
        <span className="seller-chip shrink-0">{conversation.messages.length} 条</span>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.05)] text-[var(--seller-muted)] transition hover:border-[color:var(--seller-accent)]/35 hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--seller-ink)]"
          title={expanded ? '回到右栏会话卡片' : '展开为会话焦点'}
          aria-label={expanded ? '回到右栏会话卡片' : '展开为会话焦点'}
        >
          {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>

      {worldContext && (
        <ConversationWorldContextCard
          context={worldContext}
          latestReceipt={latestReceipt}
          onUseNextStep={useNextStep}
          isNextStepHandled={(receipt, step) => {
            const actionMessage = buildNextStepActionMessage(conversation, state, replyTarget, receipt, step);
            return actionMessage ? isMessageActionScheduled(state, actionMessage) : false;
          }}
          onUseAngle={(text) => setDraftText((current) => current.trim() ? current : text)}
        />
      )}

      <div ref={chatScrollRef} className="seller-wechat-chat flex-1 space-y-3 overflow-y-auto px-3 py-4">
        <div className="flex justify-center">
          <span className="seller-wechat-date-pill rounded-full px-2 py-0.5 text-[9px] font-semibold text-[var(--seller-subtle)]">
            DAY {state.day}
          </span>
        </div>
        {conversation.messages.map((message) => {
          const turnHistory = message.conversationTurns || [];
          const brokerReply = turnHistory.length > 0 ? null : brokerReplies[message.id] || message.brokerReply;
          return (
            <div key={message.id} className="space-y-2">
              <div className="flex items-start gap-2.5">
                <WechatAvatar
                  senderName={message.senderName}
                  senderRole={message.senderRole}
                  label={message.avatarLabel}
                  className="mt-4 h-7 w-7 rounded-full"
                />
                <div className="min-w-0 max-w-[78%]">
                  <div className="mb-1 flex items-center gap-2 text-[10px] text-[var(--seller-subtle)]">
                    <span>{message.timeLabel}</span>
                    {message.urgency !== 'low' ? <span>{urgencyLabel(message.urgency)}</span> : null}
                  </div>
                  <div className="seller-wechat-bubble-in rounded-[16px] rounded-tl-[5px] px-3 py-2.5 shadow-[0_8px_18px_rgba(0,0,0,0.08)]">
                    <p className="whitespace-pre-wrap text-[12px] leading-5 text-[var(--seller-ink)]">
                      {stripWechatSpeakerPrefix(message.content, message.senderName, message.senderRole)}
                    </p>
                    {renderMessageActionSlot(state, message, onOpenMessageAction)}
                  </div>
                </div>
              </div>

              {brokerReply && (
                <WechatDraftReplySuggestion
                  reply={brokerReply}
                  onUse={() => setDraftText(brokerReply.content)}
                />
              )}

              {turnHistory.map((turn) => (
                <ConversationTurnThread key={turn.receiptId} turn={turn} message={message} />
              ))}
            </div>
          );
        })}
      </div>

      <div className="seller-wechat-composer shrink-0 border-t border-[var(--seller-border)] px-3 py-2.5">
        <div className="space-y-2">
          <form onSubmit={submitReply} className="flex items-end gap-2">
            <textarea
              value={draftText}
              onChange={(event) => {
                setDraftText(event.target.value);
                if (sendError) setSendError(null);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
                  return;
                }
                event.preventDefault();
                const trimmed = draftText.trim();
                if (trimmed.length > 0 && trimmed.length < 2) {
                  setSendError('请至少输入 2 个字。');
                  return;
                }
                if (trimmed && replyTarget && onSendConversationReply && !sending) {
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              disabled={!replyTarget || !onSendConversationReply || sending}
              maxLength={220}
              rows={1}
              placeholder={replyTarget ? `回复 ${displayName}` : '暂无可回复消息'}
              title="回车发送，Shift+Enter 换行"
              className="seller-wechat-input h-9 max-h-[76px] flex-1 resize-none rounded-full border border-[var(--seller-border)] px-3 py-2 text-[12px] leading-5 text-[var(--seller-ink)] outline-none transition placeholder:text-[var(--seller-subtle)] focus:border-[color:var(--seller-accent)]/50 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!draftText.trim() || !replyTarget || !onSendConversationReply || sending}
              title="发送（回车可发送）"
              className="seller-button-primary inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-55"
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </form>

          {sendError && (
            <div className="rounded-[10px] border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-[10px] leading-4 text-rose-200">
              {sendError}
            </div>
          )}

          {fallbackHint && !sendError && (
            <div className="text-[10px] text-[var(--seller-subtle)] px-3 pb-1">
              回复较慢，正在用本地判断生成回复...
            </div>
          )}

        </div>
      </div>
    </div>
  );

  if (expanded && typeof document !== 'undefined') {
    return createPortal(
      <>
        <button
          type="button"
          aria-label="回到右栏会话卡片"
          onClick={() => setExpanded(false)}
          className="fixed inset-0 z-[94] cursor-default bg-[rgba(5,8,12,0.16)] backdrop-blur-[1px]"
        />
        {detailPanel}
      </>,
      document.body,
    );
  }

  return detailPanel;
};

const ConversationTurnThread: React.FC<{
  turn: ConversationReceipt;
  message: WechatMessage;
}> = ({ turn, message }) => {
  const displayName = getWechatSenderDisplayName(message.senderName, message.senderRole);
  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2.5">
        <div className="min-w-0 max-w-[78%]">
          <div className="mb-1 flex justify-end gap-2 text-[10px] text-[var(--seller-subtle)]">
            <span>DAY {turn.day}</span>
            <span>我</span>
          </div>
          <div className="seller-wechat-reply-bubble rounded-[16px] rounded-tr-[5px] px-3 py-2.5 shadow-[0_8px_18px_rgba(0,0,0,0.08)]">
            <p className="seller-wechat-reply-text whitespace-pre-wrap text-[12px] leading-5">{turn.playerText}</p>
          </div>
        </div>
        <WechatAvatar
          senderName="我"
          senderRole="agent"
          label="我"
          className="mt-4 h-7 w-7 rounded-full"
        />
      </div>

      <div className="flex items-start gap-2.5">
        <WechatAvatar
          senderName={message.senderName}
          senderRole={message.senderRole}
          label={message.avatarLabel}
          className="mt-4 h-7 w-7 rounded-full"
        />
        <div className="min-w-0 max-w-[78%]">
          <div className="mb-1 flex items-center gap-2 text-[10px] text-[var(--seller-subtle)]">
            <span>{displayName}</span>
          </div>
          <div className="seller-wechat-bubble-in rounded-[16px] rounded-tl-[5px] px-3 py-2.5 shadow-[0_8px_18px_rgba(0,0,0,0.08)]">
            <p className="whitespace-pre-wrap text-[12px] leading-5 text-[var(--seller-ink)]">
              {stripWechatSpeakerPrefix(turn.recipientReply, message.senderName, message.senderRole)}
            </p>
          </div>
          <ConversationEffectStrip turn={turn} />
        </div>
      </div>
    </div>
  );
};

function buildNextStepActionMessage(
  conversation: WechatConversation,
  state: GameState,
  replyTarget: WechatMessage | null,
  receipt: ConversationReceipt,
  step: ConversationNextStepDraft,
): WechatMessage | null {
  const sourceMessage = conversation.messages.find((message) => message.id === receipt.sourceMessageId)
    || replyTarget
    || conversation.primaryMessage
    || conversation.messages[0]
    || null;
  const targetCaseId = receipt.targetCaseId || sourceMessage?.targetCaseId;
  if (!sourceMessage || !targetCaseId) {
    return null;
  }

  const caseItem = state.cases.find((entry) => entry.id === targetCaseId) || null;
  const resolvedActionId = step.actionId || (step.kind === 'open_case'
    ? (caseItem?.hasCompletedFirstVisit ? 'deep-diagnosis' : 'first-visit')
    : undefined);

  if (!resolvedActionId) {
    return null;
  }

  return {
    ...sourceMessage,
    targetCaseId,
    targetOpportunityId: receipt.targetOpportunityId || sourceMessage.targetOpportunityId,
    primaryActionId: resolvedActionId,
    primaryCtaLabel: step.label,
  };
}

function renderMessageActionSlot(
  state: GameState,
  message: WechatMessage,
  onOpenMessageAction: (message: WechatMessage) => boolean,
) {
  if (!message.primaryCtaLabel || !message.primaryActionId) {
    return null;
  }

  if (isMessageActionHandled(state, message)) {
    return (
      <span className="mt-2 inline-flex rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] px-1.5 py-0 text-[8px] font-semibold leading-4 text-[var(--seller-subtle)]">
        已承接
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenMessageAction(message)}
      className="mt-2 rounded-full border border-[color:var(--seller-accent)]/24 bg-[color:var(--seller-accent)]/8 px-1 py-0 text-[8px] font-semibold leading-4 text-[var(--seller-accent)] transition hover:bg-[color:var(--seller-accent)]/14"
    >
      {message.primaryCtaLabel}
    </button>
  );
}

function isMessageActionHandled(state: GameState, message: WechatMessage) {
  return hasConversationHandledMessage(message) || isMessageActionScheduled(state, message);
}

const ConversationEffectStrip: React.FC<{ turn: ConversationReceipt }> = ({ turn }) => {
  const effectLabels = getConversationEffectLabels(turn);
  const labels = effectLabels.length > 0
    ? effectLabels
    : [turn.summary];
  const impactText = buildConversationImpactText(turn);
  const snapshot = turn.traceSnapshot;
  const [traceOpen, setTraceOpen] = useState(false);

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {labels.slice(0, 4).map((label) => (
          <span
            key={label}
            className="rounded-full border border-[color:var(--seller-accent)]/18 bg-[color:var(--seller-accent)]/7 px-2 py-0.5 text-[9px] font-semibold text-[var(--seller-accent)]"
          >
            {label}
          </span>
        ))}
        {turn.source === 'fallback' && (
          <span className="rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[9px] font-semibold text-[var(--seller-subtle)]">
            本地判断
          </span>
        )}
        {snapshot && (
          <button
            type="button"
            onClick={() => setTraceOpen((v) => !v)}
            className="rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[9px] font-semibold text-[var(--seller-subtle)] hover:bg-[rgba(255,255,255,0.08)]"
          >
            {traceOpen ? '收起判断' : '查看判断'}
          </button>
        )}
      </div>
      {impactText && (
        <div className="max-w-full px-0.5 text-[9px] leading-4 text-[var(--seller-subtle)]">
          {impactText}
        </div>
      )}
      {snapshot && traceOpen && <AgentTraceDetail snapshot={snapshot} />}
    </div>
  );
};

const AgentTraceDetail: React.FC<{ snapshot: ConversationTraceSnapshot }> = ({ snapshot }) => {
  const sourceLabel =
    snapshot.acceptedSource === 'llm' ? 'AI' :
    snapshot.acceptedSource === 'rule' ? '规则兜底' : 'fallback';
  const sourceColor =
    snapshot.acceptedSource === 'llm' ? 'text-[var(--seller-accent)]' :
    snapshot.acceptedSource === 'rule' ? 'text-[var(--seller-ink)]' :
    'text-[var(--seller-muted)]';

  return (
    <div className="mt-1 min-w-0 space-y-0.5 overflow-hidden rounded-lg border border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] px-2.5 py-2 text-[9px] leading-[18px]">
      <div>
        <span className="text-[var(--seller-subtle)]">本次采用：</span>
        <span className={sourceColor}>{sourceLabel}</span>
      </div>
      {snapshot.modelId && (
        <div>
          <span className="text-[var(--seller-subtle)]">模型：</span>
          <span className="text-[var(--seller-ink)]">{snapshot.modelId}</span>
        </div>
      )}
      {snapshot.llmError && (
        <div>
          <span className="text-[var(--seller-subtle)]">LLM 异常：</span>
          <span className="text-rose-300">{snapshot.llmError}</span>
        </div>
      )}
      {snapshot.shadowStatus && (
        <div className="min-w-0 break-words text-[var(--seller-subtle)]">
          Shadow：{snapshot.shadowStatus}{snapshot.shadowDecision ? ` / ${snapshot.shadowDecision}` : ''}
          {snapshot.shadowRiskLevel ? ` / ${snapshot.shadowRiskLevel}` : ''}
        </div>
      )}
      {snapshot.shadowSummary && (
        <div className="min-w-0 break-words text-[var(--seller-subtle)]">
          对比：{snapshot.shadowSummary}
        </div>
      )}
      {snapshot.evaluationStatus && (
        <div className="min-w-0 break-words text-[var(--seller-subtle)]">
          会话：{snapshot.evaluationStatus}{snapshot.evaluationVerdict ? ` / ${snapshot.evaluationVerdict}` : ''}
          {typeof snapshot.evaluationScore === 'number' ? ` / ${snapshot.evaluationScore}` : ''}
        </div>
      )}
      {snapshot.evaluationSummary && (
        <div className="min-w-0 break-words text-[var(--seller-subtle)]">
          判断：{snapshot.evaluationSummary}
        </div>
      )}
      {snapshot.evaluationSignals && snapshot.evaluationSignals.length > 0 && (
        <div className="min-w-0 break-words text-[var(--seller-subtle)]">
          会话信号：{snapshot.evaluationSignals.slice(0, 3).join('、')}
          {snapshot.evaluationSignals.length > 3 && ` 等${snapshot.evaluationSignals.length}条`}
        </div>
      )}
      {snapshot.shadowSignals && snapshot.shadowSignals.length > 0 && (
        <div className="min-w-0 break-words text-[var(--seller-subtle)]">
          信号：{snapshot.shadowSignals.slice(0, 3).join('、')}
          {snapshot.shadowSignals.length > 3 && ` 等${snapshot.shadowSignals.length}条`}
        </div>
      )}
      <div className="flex flex-wrap gap-x-3">
        <span className="text-[var(--seller-subtle)]">规则置信度 {Math.round(snapshot.ruleConfidence * 100)}%</span>
        <span className="text-[var(--seller-subtle)]">
          LLM 置信度 {snapshot.llmConfidence != null ? `${Math.round(snapshot.llmConfidence * 100)}%` : '未启用'}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3">
        <span className="text-[var(--seller-subtle)]">记忆：{snapshot.memoryFactCount} 条</span>
        <span className="text-[var(--seller-subtle)]">上下文：{snapshot.contextSignalCount} 条</span>
      </div>
      {snapshot.contextBudget && (
        <div className="min-w-0 break-words text-[var(--seller-subtle)]">
          预算：{snapshot.contextBudget}
        </div>
      )}
      {snapshot.pressure.length > 0 && (
        <div className="min-w-0 break-words text-[var(--seller-subtle)]">
          压力：{snapshot.pressure.slice(0, 2).join('、')}
        </div>
      )}
      {snapshot.uncertainty.length > 0 && (
        <div className="min-w-0 break-words text-[var(--seller-subtle)]">
          不确定点：{snapshot.uncertainty.slice(0, 2).join('、')}
        </div>
      )}
      {snapshot.validationNotes.length > 0 && (
        <div className="min-w-0 break-words text-[var(--seller-subtle)]">
          校验：{snapshot.validationNotes.slice(0, 3).join('、')}
          {snapshot.validationNotes.length > 3 && ` 等${snapshot.validationNotes.length}条`}
        </div>
      )}
      {snapshot.normalizationNotes && snapshot.normalizationNotes.length > 0 && (
        <div className="min-w-0 break-words text-[var(--seller-subtle)]">
          归一化：{snapshot.normalizationNotes.slice(0, 2).join('、')}
          {snapshot.normalizationNotes.length > 2 && ` 等${snapshot.normalizationNotes.length}条`}
        </div>
      )}
      {snapshot.rejectedReasons.length > 0 && (
        <div className="min-w-0 break-words text-rose-300">
          拒绝：{snapshot.rejectedReasons.slice(0, 2).join('、')}
          {snapshot.rejectedReasons.length > 2 && ` 等${snapshot.rejectedReasons.length}条`}
        </div>
      )}
      {snapshot.arbiterDecision && (
        <div className="min-w-0 line-clamp-2 break-words text-[var(--seller-subtle)]">
          原因：{snapshot.arbiterDecision}
        </div>
      )}
    </div>
  );
};

function buildConversationImpactText(turn: ConversationReceipt) {
  const settlement = (turn as { settlement?: Partial<ConversationReceipt['settlement']> }).settlement || {};
  if (typeof settlement.askPriceBefore === 'number' && typeof settlement.askPriceAfter === 'number') {
    return `影响：挂牌价从 ${settlement.askPriceBefore} 调到 ${settlement.askPriceAfter}，客户比价和业主预期会一起变化。`;
  }
  if (settlement.trustDelta || settlement.patienceDelta || settlement.urgencyDelta) {
    const pieces: string[] = [];
    if (settlement.trustDelta > 0) pieces.push('业主更愿意听你的判断');
    if (settlement.trustDelta < 0) pieces.push('业主对你的信任受损');
    if (settlement.patienceDelta > 0) pieces.push('可沟通时间变宽');
    if (settlement.patienceDelta < 0) pieces.push('可沟通窗口变窄');
    if (settlement.urgencyDelta < 0) pieces.push('催促感下降');
    if (settlement.urgencyDelta > 0) pieces.push('催促感上升');
    return pieces.length ? `影响：${pieces.slice(0, 3).join('，')}。` : '';
  }
  if (settlement.customerIntentDelta || settlement.customerConfidenceDelta) {
    return '影响：客户更愿意继续等反馈，后续跟进空间变大。';
  }
  const nextSteps = getConversationNextSteps(turn);
  if (nextSteps.length > 0) {
    return `下一步：${nextSteps[0]?.label || '继续跟进'}。`;
  }
  return '';
}

function getConversationEffectLabels(turn: ConversationReceipt) {
  const rawLabels = (turn as { settlement?: { effectLabels?: unknown } }).settlement?.effectLabels;
  return Array.isArray(rawLabels)
    ? rawLabels.filter((label): label is string => typeof label === 'string' && label.trim().length > 0)
    : [];
}

function getConversationNextSteps(turn: ConversationReceipt): ConversationNextStepDraft[] {
  const rawNextSteps = (turn as { nextSteps?: unknown }).nextSteps;
  const explicitSteps = Array.isArray(rawNextSteps)
    ? rawNextSteps.map(normalizeConversationNextStep).filter((step): step is ConversationNextStepDraft => Boolean(step))
    : [];
  if (explicitSteps.length > 0) return explicitSteps;

  const proposalStep = normalizeConversationNextStep((turn as { proposal?: { nextStep?: unknown } }).proposal?.nextStep);
  if (proposalStep) return [proposalStep];

  if (needsRecoveryConversation(turn)) {
    return [{
      kind: 'open_case',
      label: '补救沟通',
      reason: '这次回复让关系或催促感变差，需要补一条带方案的沟通。',
      priority: 'high',
    }];
  }

  return [];
}

function normalizeConversationNextStep(value: unknown): ConversationNextStepDraft | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ConversationNextStepDraft>;
  const kind = candidate.kind;
  if (
    kind !== 'schedule_face_visit'
    && kind !== 'review_price'
    && kind !== 'prepare_competition_comparison'
    && kind !== 'follow_customer'
    && kind !== 'confirm_price_adjustment'
    && kind !== 'open_case'
  ) {
    return null;
  }

  return {
    kind,
    actionId: typeof candidate.actionId === 'string' ? candidate.actionId : undefined,
    label: typeof candidate.label === 'string' && candidate.label.trim() ? candidate.label.trim() : fallbackNextStepLabel(kind),
    reason: typeof candidate.reason === 'string' && candidate.reason.trim() ? candidate.reason.trim() : '把这次微信承接成今天能做的事项。',
    priority: candidate.priority === 'urgent' || candidate.priority === 'high' || candidate.priority === 'medium' || candidate.priority === 'low'
      ? candidate.priority
      : 'medium',
  };
}

function fallbackNextStepLabel(kind: ConversationNextStepDraft['kind']) {
  if (kind === 'schedule_face_visit') return '安排面访';
  if (kind === 'review_price') return '做价格沟通';
  if (kind === 'prepare_competition_comparison') return '准备竞品对比';
  if (kind === 'follow_customer') return '跟进客户';
  if (kind === 'confirm_price_adjustment') return '确认挂牌价调整';
  return '补救沟通';
}

function needsRecoveryConversation(turn: ConversationReceipt) {
  const settlement = (turn as { settlement?: Partial<ConversationReceipt['settlement']> }).settlement || {};
  const riskKinds = (turn as { proposal?: { riskKinds?: unknown } }).proposal?.riskKinds;
  const hasRisk = Array.isArray(riskKinds) && riskKinds.some((risk) => typeof risk === 'string' && risk !== 'none');
  return hasRisk && (
    Number(settlement.trustDelta || 0) < 0
    || Number(settlement.patienceDelta || 0) < 0
    || Number(settlement.urgencyDelta || 0) > 0
  );
}

const OfficialArticleRow: React.FC<OfficialArticleRowProps> = ({
  article,
  read,
  onClick,
}) => {
  return (
    <button
      type="button"
      data-my-wechat-official-row="true"
      data-my-wechat-read={read ? 'true' : 'false'}
      onClick={onClick}
      className="group w-full rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] px-3 py-3 text-left transition-all hover:border-[color:var(--seller-accent)]/45 hover:bg-[rgba(255,255,255,0.05)]"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <OfficialAccountAvatar accountName={article.accountName} />
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold text-[var(--seller-muted)]">{article.accountName}</div>
            <div className="mt-0.5 truncate text-[13px] font-semibold text-[var(--seller-ink)]">{article.title}</div>
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-medium text-[var(--seller-subtle)]">{article.timeLabel}</span>
      </div>
      <p className="mt-2 line-clamp-3 text-[11px] leading-5 text-[var(--seller-muted)]">{article.preview}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {!read && <span className="h-2 w-2 rounded-full bg-rose-500" />}
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${articleToneClassName(article.tone)}`}>{articleTagLabel(article.tag)}</span>
        {article.relatedCaseIds.length > 0 && <span className="seller-chip">影响 {article.relatedCaseIds.length} 套</span>}
        {article.primaryCtaLabel && <span className="text-[10px] font-semibold text-[var(--seller-accent)]">{article.primaryCtaLabel}</span>}
      </div>
    </button>
  );
};

const OfficialArticleDetail: React.FC<OfficialArticleDetailProps> = ({
  article,
  onBack,
  onSelectCase,
  onOpenMarket,
}) => {
  const detailLines = buildOfficialArticleDetailLines(article);
  const firstCaseId = article.relatedCaseIds[0] || null;

  return (
    <div
      className="flex h-[min(560px,calc(100vh-220px))] min-h-[420px] flex-col overflow-hidden rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)]"
      data-my-wechat-official-detail="true"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[15px] text-[var(--seller-muted)] transition hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--seller-ink)]"
          aria-label="返回公众号列表"
        >
          ←
        </button>
        <OfficialAccountAvatar accountName={article.accountName} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-[var(--seller-ink)]">{article.accountName}</div>
          <div className="mt-0.5 text-[10px] text-[var(--seller-subtle)]">{article.timeLabel}</div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${articleToneClassName(article.tone)}`}>
          {articleTagLabel(article.tag)}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="rounded-[16px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.035)] px-3.5 py-3.5">
          <h3 className="text-[16px] font-semibold leading-6 tracking-[-0.02em] text-[var(--seller-ink)]">
            {article.title}
          </h3>
          <p className="mt-3 whitespace-pre-wrap text-[12px] leading-6 text-[var(--seller-muted)]">
            {article.summary}
          </p>
        </div>

        <div className="mt-3 grid gap-2">
          {detailLines.map((line) => (
            <div
              key={line.label}
              className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] px-3 py-2.5"
            >
              <div className="seller-label text-[9px]">{line.label}</div>
              <p className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{line.value}</p>
            </div>
          ))}
        </div>

        {article.relatedCaseIds.length > 0 && (
          <div className="mt-3 rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] px-3 py-2.5">
            <div className="seller-label text-[9px]">影响范围</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {article.relatedCaseIds.map((caseId, index) => (
                <button
                  key={caseId}
                  type="button"
                  onClick={() => onSelectCase(caseId)}
                  className="rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] px-2 py-1 text-[10px] font-semibold text-[var(--seller-ink)] transition hover:border-[color:var(--seller-accent)]/38 hover:text-[var(--seller-accent)]"
                >
                  受影响房源 {index + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] px-3 py-2.5">
        <div className="flex flex-wrap justify-end gap-2">
          {onOpenMarket && (
            <button
              type="button"
              onClick={() => onOpenMarket(mapArticleTagToLayer(article.tag))}
              className="seller-button-secondary h-8 rounded-full px-3 text-[11px]"
            >
              看市场雷达
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (firstCaseId) {
                onSelectCase(firstCaseId);
                return;
              }
              onOpenMarket?.(mapArticleTagToLayer(article.tag));
            }}
            className="seller-button-primary h-8 rounded-full px-3 text-[11px]"
          >
            {article.primaryCtaLabel || '继续处理'}
          </button>
        </div>
      </div>
    </div>
  );
};

function OfficialAccountAvatar({ accountName }: { accountName: string }) {
  return (
    <span
      className="relative flex h-7 w-7 shrink-0 overflow-hidden rounded-[9px] border border-[var(--seller-border)] bg-[linear-gradient(135deg,rgba(148,163,184,0.18),rgba(15,23,42,0.65))] shadow-[0_10px_18px_rgba(0,0,0,0.18)]"
      aria-hidden="true"
    >
      <img
        src={getOfficialAccountAvatarSrc(accountName)}
        alt=""
        loading="lazy"
        className="relative h-full w-full object-cover"
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
    </span>
  );
}

function WechatEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[12px] border border-dashed border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] px-3 py-4 text-center">
      <div className="text-[12px] font-semibold text-[var(--seller-ink)]">{title}</div>
      <p className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{description}</p>
    </div>
  );
}

const PORTRAIT_AVATAR_INDICES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const NON_FACE_AVATAR_INDICES = [13, 14, 15, 16];

function WechatAvatar({ senderName, senderRole, label, className }: WechatAvatarProps) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden border border-[var(--seller-border)] bg-[rgba(255,255,255,0.06)] ${className}`}
      aria-hidden="true"
    >
      <span
        className="seller-wechat-avatar-fallback absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-[var(--seller-ink)]"
        data-avatar-label={label}
      />
      <img
        src={getWechatAvatarSrc(senderName, senderRole)}
        alt=""
        loading="lazy"
        className="relative h-full w-full object-cover"
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
    </div>
  );
}

function getWechatAvatarSrc(senderName: string, senderRole: WechatMessage['senderRole']) {
  const pool =
    senderRole === 'official_account' || senderRole === 'system'
      ? NON_FACE_AVATAR_INDICES
      : PORTRAIT_AVATAR_INDICES;
  const index = pool[stableHash(`${senderRole}:${senderName}`) % pool.length];
  return `/selling-houses/avatars/avatar-${String(index).padStart(2, '0')}.png`;
}

function getOfficialAccountAvatarSrc(accountName: string) {
  const fallbackIndex = stableHash(accountName) % OFFICIAL_ACCOUNT_AVATAR_FALLBACKS.length;
  return OFFICIAL_ACCOUNT_AVATAR_BY_NAME[accountName] || OFFICIAL_ACCOUNT_AVATAR_FALLBACKS[fallbackIndex];
}

function buildOfficialArticleDetailLines(article: OfficialAccountArticle) {
  const impactLine = article.relatedCaseIds.length > 0
    ? `这条情报会影响 ${article.relatedCaseIds.length} 套手里房源，适合在沟通前先统一客户比价、业主反馈和下一步动作。`
    : '这条情报偏市场面，适合先放进今天的判断里，再决定是否调整当前沟通口径。';

  if (article.tag === 'competitor') {
    return [
      {
        label: '看点',
        value: '同价位新增供给变多后，客户会更容易拿竞品做锚点，压价理由也会更具体。',
      },
      {
        label: '建议动作',
        value: '先准备竞品对比口径：价格差、楼层装修差、业主可谈边界都要能讲清，再去承接客户反馈。',
      },
      { label: '影响范围', value: impactLine },
    ];
  }

  if (article.tag === 'community' || article.tag === 'district') {
    return [
      {
        label: '看点',
        value: '同小区或同板块供给变化，会直接改变客户看房路线和业主对市场热度的体感。',
      },
      {
        label: '建议动作',
        value: '先把本房和新增房源的差异讲清楚，再决定是补卖点、补带看，还是提前做价格预期沟通。',
      },
      { label: '影响范围', value: impactLine },
    ];
  }

  if (article.tag === 'market') {
    return [
      {
        label: '看点',
        value: '客户预算和带看热度在变化，价格略高的房源更需要提前解释市场位置。',
      },
      {
        label: '建议动作',
        value: '今天沟通时先给市场判断，再给行动安排，避免只说行情不好或继续等等。',
      },
      { label: '影响范围', value: impactLine },
    ];
  }

  return [
    {
      label: '看点',
      value: '这类提醒更像经营方法，不是单条消息通知，重点是帮你把下一次沟通说得更具体。',
    },
    {
      label: '建议动作',
      value: '先给判断，再给安排：让业主看到你知道问题在哪，也知道下一步要做什么。',
    },
    { label: '影响范围', value: impactLine },
  ];
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function urgencyLabel(urgency: WechatMessageUrgency) {
  if (urgency === 'high') return '紧急';
  if (urgency === 'medium') return '需跟进';
  return '普通';
}

function urgencyClassName(urgency: WechatMessageUrgency) {
  if (urgency === 'high') return 'bg-rose-500/14 text-rose-200';
  if (urgency === 'medium') return 'bg-amber-500/14 text-amber-200';
  return 'bg-[rgba(255,255,255,0.06)] text-[var(--seller-muted)]';
}

function articleToneClassName(tone: OfficialAccountArticle['tone']) {
  if (tone === 'risk') return 'bg-rose-500/14 text-rose-200';
  if (tone === 'chance') return 'bg-emerald-500/14 text-emerald-200';
  return 'bg-sky-500/14 text-sky-200';
}

function articleTagLabel(tag: OfficialAccountArticle['tag']) {
  if (tag === 'market') return '市场';
  if (tag === 'district') return '商圈';
  if (tag === 'community') return '小区';
  if (tag === 'competitor') return '竞品';
  if (tag === 'policy') return '政策';
  return '方法';
}

function mapArticleTagToLayer(tag: OfficialAccountArticle['tag']): IntelLayerTab {
  if (tag === 'competitor') return 'competition';
  if (tag === 'community') return 'district';
  if (tag === 'district') return 'district';
  if (tag === 'method') return 'listing';
  return 'macro';
}

export default MyWechatPanel;
