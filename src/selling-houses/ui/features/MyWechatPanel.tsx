import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  MessageCircle,
  Minimize2,
  MoreHorizontal,
  Newspaper,
  Send,
} from 'lucide-react';
import type {
  ConversationNextStepDraft,
  ConversationReceipt,
  ConversationTraceSnapshot,
} from '../../core/world-state/conversation/models.js';
import type { AgentMemoryFact } from '../../core/world-state/agents/models.js';
import type { ParticipantSoul } from '../../core/world-state/agents/soul.js';
import { selectAgentMemoryFacts } from '../../core/world-state/agents/memoryStore.js';
import { OWNER_URGENCY_HIGH, PRICE_GAP_SIGNIFICANT } from '../../core/world-state/agents/thresholds.js';
import type { GameState } from '../../domain/models.js';
import type {
  MyWechatProjection,
  OfficialAccountArticle,
  WechatMessage,
  WechatMessageUrgency,
} from '../../application/projections/myWechatTypes.js';
import { initializeSoulFromCase } from '../../application/agents/soulStore.js';
import { buildCoachFeedback } from '../../application/conversationCoach.js';
import { ConversationCoachCard } from './ConversationCoachCard.js';
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
const WECHAT_MESSAGE_META_PILL_CLASS =
  'box-border inline-flex h-[18px] min-w-[54px] shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2 text-[9px] font-semibold leading-none';
const WECHAT_MESSAGE_META_NEUTRAL_PILL_CLASS =
  `${WECHAT_MESSAGE_META_PILL_CLASS} border border-[var(--seller-border)] bg-[rgba(255,255,255,0.05)] text-[var(--seller-muted)]`;
const WECHAT_MESSAGE_META_ACCENT_PILL_CLASS =
  `${WECHAT_MESSAGE_META_PILL_CLASS} border border-[color:var(--seller-accent)]/24 bg-[color:var(--seller-accent)]/10 text-[var(--seller-accent)]`;
const WECHAT_MESSAGE_META_ACTION_PILL_CLASS =
  'box-border inline-flex h-[14px] min-w-[42px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-[#4ea7ff]/30 bg-[#4ea7ff]/12 px-1.5 text-[#65b7ff] transition hover:border-[#65b7ff]/45 hover:bg-[#4ea7ff]/18';
const WECHAT_MESSAGE_META_ACTION_STYLE: React.CSSProperties = {
  fontSize: '7px',
  fontWeight: 600,
  lineHeight: 1,
};
const WECHAT_INLINE_ACTION_CHIP_STYLE: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  lineHeight: '18px',
};

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
  const effectiveReadIds = readIds || localReadIds;
  const runScopeKey = `${state.runContext.createdAt}:${state.runContext.runSeed}:${state.runContext.difficultyId}`;
  const visibleIds = useMemo(
    () => new Set([
      ...projection.messages.map((message) => message.id),
      ...projection.officialAccounts.map((article) => article.id),
    ]),
    [projection.messages, projection.officialAccounts],
  );

  useEffect(() => {
    setActiveTab('messages');
    setSelectedConversationKey(null);
    setSelectedArticleId(null);
    setLocalReadIds(new Set());
  }, [runScopeKey]);

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

  const isOfficialMode = activeTab === 'official';

  return (
    <section
      className="seller-panel overflow-hidden"
      data-my-wechat-panel="true"
      data-my-wechat-official-mode={isOfficialMode ? 'true' : 'false'}
    >
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

        <div
          className="mt-3 grid grid-cols-2 gap-1 rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] p-1"
        >
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

      <div className={`space-y-2 px-3 ${isOfficialMode && selectedArticle ? 'py-2' : 'py-3'}`}>
        {activeTab === 'messages' ? (
          selectedConversation ? (
            <WechatConversationDetail
              conversation={selectedConversation}
              conversations={conversations}
              state={state}
              onBack={() => setSelectedConversationKey(null)}
              onSwitchConversation={openConversation}
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
    primaryLine: caseItem?.district || '',
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

const ConversationWorldContextCard: React.FC<{
  context: ConversationWorldContext;
  latestReceipt: ConversationReceipt | null;
  onUseAngle: (text: string) => void;
  onUseNextStep: (receipt: ConversationReceipt, step: ConversationNextStepDraft) => void;
  isNextStepHandled?: (receipt: ConversationReceipt, step: ConversationNextStepDraft) => boolean;
}> = ({ context, latestReceipt, onUseAngle, onUseNextStep, isNextStepHandled }) => {
  const [selectedAngleIndex, setSelectedAngleIndex] = useState(0);
  const latestNextSteps = latestReceipt ? getConversationNextSteps(latestReceipt) : [];
  const primaryNextStep = latestNextSteps[0] || null;
  const primaryNextStepHandled = Boolean(latestReceipt && primaryNextStep && isNextStepHandled?.(latestReceipt, primaryNextStep));
  const replyAngleKey = context.replyAngles.join('\u0001');
  const selectedAngle = context.replyAngles[selectedAngleIndex] || context.replyAngles[0];

  useEffect(() => {
    setSelectedAngleIndex(0);
  }, [context.title, context.primaryLine, replyAngleKey]);

  return (
    <div className="border-b border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold leading-5 text-[var(--seller-ink)]">{context.title}</div>
          {context.primaryLine && (
            <div className="truncate text-[10px] leading-4 text-[var(--seller-subtle)]">{context.primaryLine}</div>
          )}
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
        <div className="mt-2 rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.035)] px-2.5 py-2">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                <span className="shrink-0 text-[9px] font-semibold text-[var(--seller-subtle)]">回复参考</span>
                {context.replyAngles.length > 1 && (
                  <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold text-[var(--seller-subtle)]" aria-label="切换回复参考">
                    <button
                      type="button"
                      onClick={() => setSelectedAngleIndex((current) => Math.max(0, current - 1))}
                      disabled={selectedAngleIndex === 0}
                      className="grid h-6 w-6 place-items-center rounded-[7px] text-[var(--seller-muted)] transition hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--seller-ink)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--seller-muted)]"
                      title="上一条回复参考"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <span className="min-w-[30px] text-center leading-6 tabular-nums">
                      {selectedAngleIndex + 1}/{context.replyAngles.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedAngleIndex((current) => Math.min(context.replyAngles.length - 1, current + 1))}
                      disabled={selectedAngleIndex >= context.replyAngles.length - 1}
                      className="grid h-6 w-6 place-items-center rounded-[7px] text-[var(--seller-muted)] transition hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--seller-ink)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--seller-muted)]"
                      title="下一条回复参考"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                )}
              </div>
              <p className="min-w-0 truncate text-[11px] leading-5 text-[var(--seller-ink)]" title={selectedAngle}>
                {selectedAngle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onUseAngle(selectedAngle)}
              className="mt-3 shrink-0 rounded-[8px] border border-[color:var(--seller-accent)]/22 bg-[color:var(--seller-accent)]/9 px-2.5 py-1 text-[9px] font-semibold leading-4 text-[var(--seller-accent)] transition hover:bg-[color:var(--seller-accent)]/14"
              title={selectedAngle}
            >
              使用
            </button>
          </div>
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
          <span className={`${WECHAT_MESSAGE_META_PILL_CLASS} ${urgencyClassName(latestMessage.urgency)}`}>
            {urgencyLabel(latestMessage.urgency)}
          </span>
          {lead && <span className={WECHAT_MESSAGE_META_ACCENT_PILL_CLASS}>今日重点</span>}
          {latestReceipt && <span className={WECHAT_MESSAGE_META_NEUTRAL_PILL_CLASS}>已回复</span>}
          {latestReceipt && getConversationEffectLabels(latestReceipt).slice(0, 2).map((label) => (
            <span key={label} className={WECHAT_MESSAGE_META_ACCENT_PILL_CLASS}>{label}</span>
          ))}
          {latestMessage.primaryCtaLabel && primaryActionHandled ? (
            <span className={WECHAT_MESSAGE_META_NEUTRAL_PILL_CLASS}>已承接</span>
          ) : latestMessage.primaryCtaLabel && onPrimaryAction ? (
            <button
              type="button"
              data-my-wechat-message-action="true"
              onClick={(event) => {
                event.stopPropagation();
                onPrimaryAction();
              }}
              className={WECHAT_MESSAGE_META_ACTION_PILL_CLASS}
              style={WECHAT_MESSAGE_META_ACTION_STYLE}
              title="点击直接安排事项"
            >
              {latestMessage.primaryCtaLabel}
            </button>
          ) : latestMessage.primaryCtaLabel ? (
            <span className={WECHAT_MESSAGE_META_ACCENT_PILL_CLASS}>{latestMessage.primaryCtaLabel}</span>
          ) : null}
        </div>
      </div>
      <ChevronRight size={14} className="mt-3 shrink-0 text-[var(--seller-subtle)] transition-transform group-hover:translate-x-0.5" />
    </div>
  );
};

const WechatConversationRail: React.FC<{
  conversations: WechatConversation[];
  activeKey: string;
  state: GameState;
  onSelect: (conversation: WechatConversation) => void;
}> = ({ conversations, activeKey, state, onSelect }) => (
  <aside className="hidden w-[264px] shrink-0 flex-col border-r border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] md:flex">
    <div className="shrink-0 border-b border-[var(--seller-border)] px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <WechatLogoIcon />
          <span className="truncate text-[12px] font-semibold text-[var(--seller-ink)]">微信</span>
        </div>
        <span className="rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[9px] font-semibold text-[var(--seller-subtle)]">
          {conversations.length} 个会话
        </span>
      </div>
      <div className="mt-2 rounded-[10px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.035)] px-2.5 py-1.5 text-[10px] text-[var(--seller-subtle)]">
        会话列表
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
      <div className="space-y-1">
        {conversations.map((item) => {
          const latestMessage = item.messages[0];
          const displayName = getWechatSenderDisplayName(item.senderName, item.senderRole);
          const latestReceipt = getLatestConversationReceipt(item);
          const latestImpact = latestReceipt ? buildConversationListImpactText(latestReceipt) : '';
          const active = item.key === activeKey;
          const primaryActionHandled = latestMessage ? hasConversationHandledMessage(latestMessage) || isMessageActionScheduled(state, latestMessage) : false;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item)}
              aria-current={active ? 'true' : undefined}
              className={`group flex w-full gap-2 rounded-[10px] px-2 py-2 text-left transition ${
                active
                  ? 'bg-[rgba(255,255,255,0.075)] shadow-[inset_2px_0_0_var(--seller-accent)]'
                  : 'hover:bg-[rgba(255,255,255,0.045)]'
              }`}
            >
              <span
                aria-hidden="true"
                className={`mt-3 h-2 w-2 shrink-0 rounded-full ${item.unreadCount > 0 ? 'bg-rose-500' : 'bg-transparent'}`}
              />
              <WechatAvatar
                senderName={item.senderName}
                senderRole={item.senderRole}
                label={item.avatarLabel}
                className="h-8 w-8 rounded-full"
              />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-semibold text-[var(--seller-ink)]">{displayName}</span>
                  {latestMessage && (
                    <span className="shrink-0 text-[9px] font-medium text-[var(--seller-subtle)]">{latestMessage.timeLabel}</span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-[10px] leading-4 text-[var(--seller-muted)]">
                  {latestImpact || (latestMessage ? stripWechatSpeakerPrefix(latestMessage.preview, item.senderName, item.senderRole) : '暂无消息')}
                </span>
                <span className="mt-1 flex min-w-0 flex-wrap gap-1">
                  {latestMessage && latestMessage.urgency !== 'low' && (
                    <span className={`${WECHAT_MESSAGE_META_PILL_CLASS} ${urgencyClassName(latestMessage.urgency)}`}>
                      {urgencyLabel(latestMessage.urgency)}
                    </span>
                  )}
                  {latestReceipt && <span className={WECHAT_MESSAGE_META_NEUTRAL_PILL_CLASS}>已回复</span>}
                  {primaryActionHandled && <span className={WECHAT_MESSAGE_META_NEUTRAL_PILL_CLASS}>已承接</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  </aside>
);

const WechatConversationDetail: React.FC<{
  conversation: WechatConversation;
  conversations: WechatConversation[];
  state: GameState;
  onBack: () => void;
  onSwitchConversation: (conversation: WechatConversation) => void;
  onSelectCase: (caseId: string) => void;
  onOpenMessageAction: (message: WechatMessage) => boolean;
  onSendConversationReply?: (
    conversationKey: string,
    message: WechatMessage,
    playerText: string,
  ) => Promise<{ success: boolean; reason: string; receipt: unknown | null }>;
}> = ({
  conversation,
  conversations,
  state,
  onBack,
  onSwitchConversation,
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
  const prevScrollKey = useRef({ key: '', turns: 0 });
  const conversationTurnCount = conversation.messages.reduce((total, message) => total + (message.conversationTurns?.length || 0), 0);

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
    const hasNewContent = !isKeyChange && conversationTurnCount > prev.turns;

    prevScrollKey.current = { key: conversation.key, turns: conversationTurnCount };

    if (!isKeyChange && !hasNewContent) return;

    const frame = window.requestAnimationFrame(() => {
      if (!chatScrollRef.current) return;
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: isKeyChange ? 'instant' as ScrollBehavior : 'smooth' as ScrollBehavior,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversation.key, conversationTurnCount]);

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
      data-my-wechat-conversation-detail="true"
      className={`seller-wechat-detail flex overflow-hidden rounded-[18px] border border-[var(--seller-border)] shadow-[0_20px_50px_rgba(0,0,0,0.14)] transition-all duration-200 ${
        expanded
          ? 'fixed bottom-3 left-3 right-3 top-[76px] z-[95] h-auto min-h-0 flex-row md:left-8 md:right-8 md:top-[84px] xl:left-[calc(50vw-620px)] xl:right-[calc(50vw-620px)] xl:bottom-5 xl:top-[92px]'
          : 'h-[min(820px,calc(100vh-110px))] min-h-[660px] flex-col'
      }`}
    >
      {expanded && (
        <WechatConversationRail
          conversations={conversations}
          activeKey={conversation.key}
          state={state}
          onSelect={onSwitchConversation}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="seller-wechat-topbar flex shrink-0 items-center gap-2 border-b border-[var(--seller-border)] px-3 py-2.5">
          {!expanded && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[16px] text-[var(--seller-muted)] transition hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--seller-ink)]"
              aria-label="返回消息列表"
            >
              ←
            </button>
          )}
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
            onUseAngle={(text) => {
              setDraftText(text);
              if (sendError) setSendError(null);
            }}
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

                {turnHistory.map((turn) => (
                  <ConversationTurnThread
                    key={turn.receiptId}
                    turn={turn}
                    message={message}
                    participantSoul={resolveConversationParticipantSoul(
                      state,
                      turn.targetCaseId || message.targetCaseId || conversation.caseIds[0],
                      message.senderName,
                    )}
                  />
                ))}
              </div>
            );
          })}
        </div>

        <div className="seller-wechat-composer shrink-0 border-t border-[var(--seller-border)] px-3 py-3">
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
                className="seller-wechat-input h-10 max-h-[88px] flex-1 resize-none rounded-full border border-[var(--seller-border)] px-3.5 py-2.5 text-[12px] leading-5 text-[var(--seller-ink)] outline-none transition placeholder:text-[var(--seller-subtle)] focus:border-[color:var(--seller-accent)]/50 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!draftText.trim() || !replyTarget || !onSendConversationReply || sending}
                title="发送（回车可发送）"
                className="seller-button-primary inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-55"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>

            {sendError && (
              <div className="rounded-[10px] border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-[10px] leading-4 text-rose-200">
                {sendError}
              </div>
            )}

            {fallbackHint && !sendError && (
              <div className="text-[10px] text-[var(--seller-subtle)] px-3 pb-1">
                对方输入中...
              </div>
            )}

          </div>
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
  participantSoul?: ParticipantSoul | null;
}> = ({ turn, message, participantSoul }) => {
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
          <ConversationEffectStrip turn={turn} participantSoul={participantSoul} participantName={displayName} />
          {(() => {
            const feedback = buildCoachFeedback(turn);
            return feedback ? <ConversationCoachCard feedback={feedback} /> : null;
          })()}
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
      <span className="mt-2 inline-flex rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.035)] px-[5px] py-0 text-[7px] font-medium leading-[12px] text-[var(--seller-subtle)]">
        已承接
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenMessageAction(message)}
      className="mt-1.5 inline-flex h-[18px] items-center rounded-full border border-[color:var(--seller-accent)]/16 bg-[color:var(--seller-accent)]/6 px-2 py-0 text-[10px] font-semibold leading-none text-[var(--seller-accent)]/90 transition hover:bg-[color:var(--seller-accent)]/10"
      style={WECHAT_INLINE_ACTION_CHIP_STYLE}
    >
      {message.primaryCtaLabel}
    </button>
  );
}

function isMessageActionHandled(state: GameState, message: WechatMessage) {
  return hasConversationHandledMessage(message) || isMessageActionScheduled(state, message);
}

const ConversationEffectStrip: React.FC<{
  turn: ConversationReceipt;
  participantSoul?: ParticipantSoul | null;
  participantName?: string;
}> = ({ turn, participantSoul, participantName }) => {
  const effectLabels = getConversationEffectLabels(turn);
  const labels = effectLabels.length > 0
    ? effectLabels
    : [turn.summary];
  const snapshot = turn.traceSnapshot;
  const hasAgentTrace = Boolean(snapshot?.modelId || snapshot?.llmError || snapshot?.llmConfidence != null);
  const [traceOpen, setTraceOpen] = useState(false);

  return (
    <div className="mt-2 max-w-full overflow-hidden rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] px-2.5 py-2">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {labels.slice(0, 3).map((label) => (
            <span
              key={label}
              className="max-w-full truncate rounded-full border border-[color:var(--seller-accent)]/18 bg-[color:var(--seller-accent)]/7 px-2 py-0.5 text-[9px] font-semibold text-[var(--seller-accent)]"
            >
              {label}
            </span>
          ))}
          {labels.length > 3 && (
            <span className="rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.035)] px-2 py-0.5 text-[9px] font-semibold text-[var(--seller-subtle)]">
              +{labels.length - 3}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {turn.source === 'fallback' && (
            <span className="rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[9px] font-semibold text-[var(--seller-subtle)]">
              本地
            </span>
          )}
          {snapshot && hasAgentTrace && (
            <button
              type="button"
              onClick={() => setTraceOpen((v) => !v)}
              aria-label={traceOpen ? '收起 AI 判断' : '查看 AI 判断'}
              aria-expanded={traceOpen}
              title={traceOpen ? '收起 AI 判断' : '查看 AI 判断'}
              className="grid h-5 w-5 place-items-center rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] text-[var(--seller-subtle)] transition hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--seller-ink)]"
            >
              <MoreHorizontal size={12} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>
      {snapshot && hasAgentTrace && traceOpen && (
        <AgentTraceDetail
          snapshot={snapshot}
          turn={turn}
          participantSoul={participantSoul}
          participantName={participantName}
        />
      )}
    </div>
  );
};

const AgentTraceDetail: React.FC<{
  snapshot: ConversationTraceSnapshot;
  turn: ConversationReceipt;
  participantSoul?: ParticipantSoul | null;
  participantName?: string;
}> = ({ snapshot, turn, participantSoul, participantName }) => {
  const sourceLabel =
    snapshot.acceptedSource === 'llm' ? 'AI' :
    snapshot.acceptedSource === 'rule' ? '规则兜底' : '本地兜底';
  const sourceToneClass =
    snapshot.acceptedSource === 'llm' ? 'border-[color:var(--seller-accent)]/22 bg-[color:var(--seller-accent)]/9 text-[var(--seller-accent)]' :
    snapshot.acceptedSource === 'rule' ? 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.045)] text-[var(--seller-ink)]' :
    'border-[var(--seller-border)] bg-[rgba(255,255,255,0.035)] text-[var(--seller-subtle)]';
  const soulMetrics = participantSoul ? buildSoulMetricItems(participantSoul) : [];
  const recentLine = participantSoul ? buildSoulRecentLine(participantSoul) : null;
  const patternLine = participantSoul ? buildSoulPatternLine(participantSoul) : null;
  const turnSoulLine = buildTurnSoulLine(turn);
  const turnDeltaItems = buildTurnDeltaItems(turn);
  const turnRiskLine = buildTurnRiskLine(turn);
  const judgmentLines = buildTraceJudgmentLines(snapshot);
  const sourceMeta = [
    sourceLabel,
    snapshot.modelId ? `模型 ${snapshot.modelId}` : null,
    snapshot.llmConfidence != null ? `AI ${Math.round(snapshot.llmConfidence * 100)}%` : null,
    `记忆 ${snapshot.memoryFactCount}`,
    `上下文 ${snapshot.contextSignalCount}`,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="mt-1 min-w-0 space-y-2 overflow-hidden rounded-lg border border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] px-2.5 py-2 text-[9px] leading-[18px]">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[10px] font-semibold text-[var(--seller-ink)]">
          {participantName ? `${participantName} 的 Soul` : '判断内核'}
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-semibold ${sourceToneClass}`}>
          {participantSoul ? formatSoulMood(participantSoul.emotionalState.mood) : sourceLabel}
        </span>
      </div>

      {participantSoul ? (
        <div className="space-y-1.5">
          <div className="min-w-0 break-words text-[var(--seller-subtle)]">
            {participantSoul.ownerProfileLabel} · {buildSoulStateLine(participantSoul)}
          </div>
          <div className="space-y-1">
            {soulMetrics.map((metric) => (
              <div key={metric.label} className="grid grid-cols-[34px_minmax(0,1fr)_34px] items-center gap-2">
                <span className="text-[var(--seller-subtle)]">{metric.label}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                  <span
                    className={`block h-full rounded-full ${metric.toneClass}`}
                    style={{ width: `${metric.value}%` }}
                  />
                </span>
                <span className="text-right tabular-nums text-[var(--seller-muted)]">{metric.value}{metric.trend}</span>
              </div>
            ))}
          </div>
          {recentLine && <div className="min-w-0 break-words text-[var(--seller-muted)]">最近反应：{recentLine}</div>}
          {patternLine && <div className="min-w-0 break-words text-[var(--seller-muted)]">沟通偏好：{patternLine}</div>}
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="min-w-0 break-words text-[var(--seller-subtle)]">
            本轮反应 · {turnSoulLine}
          </div>
          <div className="flex flex-wrap gap-1">
            {turnDeltaItems.map((item) => (
              <span
                key={item.label}
                className={`rounded-full border px-2 py-0.5 text-[8px] font-semibold ${item.className}`}
              >
                {item.label}{formatSignedDelta(item.value)}
              </span>
            ))}
          </div>
          {turnRiskLine && <div className="min-w-0 break-words text-[var(--seller-muted)]">风险：{turnRiskLine}</div>}
        </div>
      )}

      {judgmentLines.length > 0 && (
        <div className="space-y-1 border-t border-[var(--seller-border)] pt-1.5">
          {judgmentLines.map((line) => (
            <div key={`${line.label}:${line.text}`} className="grid grid-cols-[42px_minmax(0,1fr)] gap-1.5">
              <span className="text-[var(--seller-subtle)]">{line.label}</span>
              <span className="min-w-0 break-words text-[var(--seller-muted)]">{line.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-x-2 gap-y-1 border-t border-[var(--seller-border)] pt-1.5 text-[8px] text-[var(--seller-subtle)]">
        {sourceMeta.map((item) => <span key={item}>{item}</span>)}
        {snapshot.llmError && <span className="text-rose-300">异常：{snapshot.llmError}</span>}
        {snapshot.rejectedReasons.length > 0 && <span className="text-rose-300">拒绝 {snapshot.rejectedReasons.length}</span>}
      </div>
    </div>
  );
};

function resolveConversationParticipantSoul(
  state: GameState,
  caseId: string | undefined,
  ownerName: string | undefined,
): ParticipantSoul | null {
  if (!caseId || !ownerName) return null;
  const storedSoul = state.participantSouls?.[`owner:${caseId}:${ownerName}`];
  if (storedSoul) return storedSoul;
  const caseItem = state.cases.find((entry) => entry.id === caseId && entry.ownerName === ownerName) || null;
  if (!caseItem) return null;
  return initializeSoulFromCase({
    caseId: caseItem.id,
    ownerName: caseItem.ownerName,
    ownerProfileLabel: caseItem.ownerProfilingMemory?.ownerTypeName || caseItem.personality || '未知业主',
    trust: caseItem.trust,
    patience: caseItem.patience,
    urgency: caseItem.urgency,
    priceGapPct: caseItem.priceGapPct,
  });
}

function buildSoulMetricItems(soul: ParticipantSoul) {
  return [
    {
      label: '信任',
      value: clampPercent(soul.emotionalState.trust),
      trend: formatSoulTrend(soul.emotionalArc.trustTrend),
      toneClass: soul.emotionalState.trust >= 65 ? 'bg-[var(--seller-accent)]' : soul.emotionalState.trust < 45 ? 'bg-rose-400/80' : 'bg-sky-300/75',
    },
    {
      label: '耐心',
      value: clampPercent(soul.emotionalState.patience),
      trend: formatSoulTrend(soul.emotionalArc.patienceTrend),
      toneClass: soul.emotionalState.patience >= 60 ? 'bg-[var(--seller-accent)]' : soul.emotionalState.patience < 40 ? 'bg-rose-400/80' : 'bg-sky-300/75',
    },
    {
      label: '催促',
      value: clampPercent(soul.emotionalState.urgency),
      trend: formatSoulTrend(soul.emotionalArc.urgencyTrend),
      toneClass: soul.emotionalState.urgency >= 70 ? 'bg-rose-400/80' : soul.emotionalState.urgency <= 35 ? 'bg-[var(--seller-accent)]' : 'bg-amber-300/80',
    },
  ];
}

function buildSoulStateLine(soul: ParticipantSoul) {
  const trustLine = soul.emotionalState.trust >= 65
    ? '愿意听解释'
    : soul.emotionalState.trust < 45
      ? '信任偏薄'
      : '半信半疑';
  const patienceLine = soul.emotionalState.patience >= 60
    ? '还能等'
    : soul.emotionalState.patience < 40
      ? '耐心快耗尽'
      : '耐心有限';
  const urgencyLine = soul.emotionalState.urgency >= 70
    ? '正在催结果'
    : soul.emotionalState.urgency <= 35
      ? '催促感低'
      : '有跟进压力';
  return `${trustLine}，${patienceLine}，${urgencyLine}`;
}

function buildSoulRecentLine(soul: ParticipantSoul) {
  const recent = soul.conversationHistory[soul.conversationHistory.length - 1];
  if (!recent) return null;
  const riskText = recent.risks
    .filter((risk) => risk !== 'none')
    .map(formatConversationRiskLabel)
    .join('、') || '无明显风险';
  return `信任${formatSignedDelta(recent.trustDelta)}，耐心${formatSignedDelta(recent.patienceDelta)}，催促${formatSignedDelta(recent.urgencyDelta)}；${riskText}`;
}

function buildSoulPatternLine(soul: ParticipantSoul) {
  if (soul.communicationPatterns.length === 0) return null;
  const [pattern] = [...soul.communicationPatterns].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.effectiveness - a.effectiveness;
  });
  if (!pattern) return null;
  const effectLabel = pattern.effectiveness > 0.3
    ? '更容易生效'
    : pattern.effectiveness < -0.3
      ? '容易反噬'
      : '效果一般';
  return `${formatConversationIntentLabel(pattern.intent)}：${effectLabel}，用过 ${pattern.count} 次`;
}

function buildTurnSoulLine(turn: ConversationReceipt) {
  const trust = turn.settlement.trustDelta;
  const patience = turn.settlement.patienceDelta;
  const urgency = turn.settlement.urgencyDelta;
  const trustLine = trust > 0 ? '更愿意听你说' : trust < 0 ? '信任被磨薄' : '信任没有明显变化';
  const patienceLine = patience > 0 ? '还能继续沟通' : patience < 0 ? '耐心在下降' : '耐心暂时稳定';
  const urgencyLine = urgency > 0 ? '催促感变强' : urgency < 0 ? '催促感被压住' : '催促感未变';
  return `${trustLine}，${patienceLine}，${urgencyLine}`;
}

function buildTurnDeltaItems(turn: ConversationReceipt) {
  return [
    {
      label: '信任',
      value: turn.settlement.trustDelta,
      className: toneClassForDelta(turn.settlement.trustDelta, false),
    },
    {
      label: '耐心',
      value: turn.settlement.patienceDelta,
      className: toneClassForDelta(turn.settlement.patienceDelta, false),
    },
    {
      label: '催促',
      value: turn.settlement.urgencyDelta,
      className: toneClassForDelta(turn.settlement.urgencyDelta, true),
    },
  ];
}

function buildTurnRiskLine(turn: ConversationReceipt) {
  const risks = turn.proposal.riskKinds
    .filter((risk) => risk !== 'none')
    .map(formatConversationRiskLabel);
  return risks.join('、') || null;
}

function toneClassForDelta(value: number, inverse: boolean) {
  const positive = inverse ? value < 0 : value > 0;
  const negative = inverse ? value > 0 : value < 0;
  if (positive) return 'border-[color:var(--seller-accent)]/22 bg-[color:var(--seller-accent)]/9 text-[var(--seller-accent)]';
  if (negative) return 'border-rose-400/20 bg-rose-400/10 text-rose-200';
  return 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.035)] text-[var(--seller-subtle)]';
}

function buildTraceJudgmentLines(snapshot: ConversationTraceSnapshot) {
  const lines: Array<{ label: string; text: string }> = [];
  if (snapshot.pressure.length > 0) {
    lines.push({ label: '压力', text: snapshot.pressure.slice(0, 2).join('、') });
  }
  if (snapshot.uncertainty.length > 0) {
    lines.push({ label: '盲区', text: snapshot.uncertainty.slice(0, 2).join('、') });
  }
  if (snapshot.evaluationSummary) {
    lines.push({ label: '判断', text: cleanTraceSummary(snapshot.evaluationSummary) });
  } else if (snapshot.shadowSummary) {
    lines.push({ label: '对照', text: cleanTraceSummary(snapshot.shadowSummary) });
  }
  if (snapshot.evaluationSignals && snapshot.evaluationSignals.length > 0) {
    lines.push({ label: '命中', text: snapshot.evaluationSignals.slice(0, 3).map(formatTraceSignal).join('、') });
  } else if (snapshot.shadowSignals && snapshot.shadowSignals.length > 0) {
    lines.push({ label: '命中', text: snapshot.shadowSignals.slice(0, 3).map(formatTraceSignal).join('、') });
  }
  return lines.slice(0, 4);
}

function cleanTraceSummary(text: string) {
  return text
    .replace(/^微信回合[:：]\s*/, '')
    .replace(/\s*verdict\s+\w+[，,]?\s*/i, '')
    .replace(/\s*status\s+\w+[。.]?\s*/i, '')
    .trim();
}

function formatTraceSignal(signal: string) {
  const normalized = signal.replace(/_/g, ' ');
  if (signal.includes('core_question_missed')) return '没接住核心问题';
  if (signal.includes('no_next_step')) return '缺少下一步';
  if (signal.includes('relationship_risk')) return '关系风险';
  if (signal.includes('risk:none')) return '风险可控';
  if (signal.includes('missing next step')) return '下一步不够明确';
  if (signal.includes('empty comfort')) return '空安抚';
  return normalized.replace(/^risk:/, '风险：').replace(/^critical risk:/, '关键风险：');
}

function formatSoulMood(mood: ParticipantSoul['emotionalState']['mood']) {
  if (mood === 'positive') return '松动';
  if (mood === 'negative') return '抵触';
  return '观望';
}

function formatSoulTrend(trend: ParticipantSoul['emotionalArc']['trustTrend']) {
  if (trend === 'rising') return '↑';
  if (trend === 'falling') return '↓';
  return '→';
}

function formatSignedDelta(value: number) {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatConversationIntentLabel(intent: string) {
  const labels: Record<string, string> = {
    reassure: '安抚',
    present_market_evidence: '摆市场证据',
    propose_face_visit: '约面访',
    discuss_price: '谈价格',
    secure_price_adjustment: '确认调价',
    promise_feedback: '承诺反馈',
    follow_customer: '跟客户',
    align_manager: '对齐店长',
    overpromise: '过度承诺',
    hostile: '硬顶',
    unclear: '没说清',
  };
  return labels[intent] || intent;
}

function formatConversationRiskLabel(risk: string) {
  const labels: Record<string, string> = {
    overpromise: '过度承诺',
    empty_comfort: '空安抚',
    price_pressure_too_fast: '价格压太快',
    missing_next_step: '缺下一步',
    ignores_customer: '没接住问题',
    offensive_reply: '冒犯回复',
  };
  return labels[risk] || risk;
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
      className="seller-official-article-row group w-full overflow-hidden rounded-[14px] text-left transition-all"
    >
      <div className="px-3.5 py-3.5">
        <div className="flex items-start gap-2.5">
          <OfficialAccountAvatar accountName={article.accountName} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-[12px] font-bold text-[var(--seller-muted)]">
              <span className="truncate">{article.accountName}</span>
              <span className="shrink-0">{article.timeLabel}</span>
            </div>
            <div className="mt-3.5 text-[15px] font-bold leading-6 text-[var(--seller-ink)]">{article.title}</div>
          </div>
        </div>
        <p className="mt-2.5 line-clamp-4 text-[13px] font-medium leading-6 text-[var(--seller-muted)]">{article.preview}</p>
      </div>
      <div className="seller-official-article-row-footer flex items-center justify-between px-3.5 pb-3.5 text-[12px] font-semibold">
        <span className="text-[var(--seller-muted)]">
          {article.relatedCaseIds.length > 0 ? `关联 ${article.relatedCaseIds.length} 套房源` : articleTagLabel(article.tag)}
        </span>
        <span className="text-[#8fa4c5]">全文</span>
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
  const articleSections = buildOfficialArticleSections(article);
  const firstCaseId = article.relatedCaseIds[0] || null;

  return (
    <div
      className="seller-official-article-detail flex h-[clamp(720px,calc(100vh-104px),980px)] flex-col overflow-hidden rounded-[14px]"
      data-my-wechat-official-detail="true"
    >
      <div className="seller-official-article-topbar flex shrink-0 items-center gap-2 px-3.5 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[18px] text-[var(--seller-muted)] transition hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--seller-ink)]"
          aria-label="返回公众号列表"
        >
          ←
        </button>
        <OfficialAccountAvatar accountName={article.accountName} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold text-[var(--seller-ink)]">{article.accountName}</div>
          <div className="mt-0.5 text-[12px] font-semibold text-[var(--seller-muted)]">公众号 · {article.timeLabel}</div>
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--seller-muted)] transition hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--seller-ink)]"
          aria-label="更多"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      <article className="flex-1 overflow-y-auto px-6 py-6">
        <header>
          <h3 className="text-[23px] font-bold leading-[1.34] text-[var(--seller-ink)]">
            {article.title}
          </h3>
          <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12px] font-semibold leading-5 text-[var(--seller-subtle)]">
            <span className="seller-official-original rounded-[4px] px-1.5 py-0.5">原创</span>
            <span className="text-[#8fa4c5]">{article.accountName}</span>
            <span>{article.timeLabel}</span>
            <span>{articleTagLabel(article.tag)}</span>
          </div>
          <p className="seller-official-article-lead mt-6 font-medium">
            {article.summary}
          </p>
        </header>

        <div className="mt-7 space-y-7">
          {articleSections.map((section) => (
            <section key={section.title}>
              <h4 className="seller-official-article-section-title text-center text-[17px] font-bold leading-8">{section.title}</h4>
              <p className="seller-official-article-body mt-3 font-medium">{section.body}</p>
            </section>
          ))}
        </div>

        {article.relatedCaseIds.length > 0 && (
          <footer className="mt-8 border-t border-[var(--seller-border)] pt-4">
            <div className="text-[13px] font-bold text-[var(--seller-muted)]">文中提到的房源</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {article.relatedCaseIds.map((caseId, index) => (
                <button
                  key={caseId}
                  type="button"
                  onClick={() => onSelectCase(caseId)}
                  className="rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.045)] px-3 py-1.5 text-[12px] font-bold text-[var(--seller-accent)] transition hover:border-[color:var(--seller-accent)]/40 hover:bg-[rgba(74,227,138,0.12)]"
                >
                  受影响房源 {index + 1}
                </button>
              ))}
            </div>
          </footer>
        )}
      </article>

      <div className="seller-official-article-actions shrink-0 px-3.5 py-3">
        <div className="flex flex-wrap justify-end gap-2">
          {onOpenMarket && (
            <button
              type="button"
              onClick={() => onOpenMarket(mapArticleTagToLayer(article.tag))}
              className="h-9 rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.045)] px-3.5 text-[12px] font-bold text-[var(--seller-ink)] transition hover:bg-[rgba(255,255,255,0.07)]"
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
            className="h-9 rounded-full bg-[var(--seller-accent)] px-3.5 text-[12px] font-bold text-[var(--seller-bg)] transition hover:brightness-110"
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

function buildOfficialArticleSections(article: OfficialAccountArticle) {
  if (article.bodySections?.length) {
    return article.bodySections;
  }

  const impactLine = article.relatedCaseIds.length > 0
    ? `这条变化会打到 ${article.relatedCaseIds.length} 套手里房源。今天开口前，先把客户可能拿来比较的点、业主可能追问的点，以及你准备给出的下一步安排放在同一套话术里。`
    : '这条变化暂时更像市场风向。它不一定立刻改变某一套房，但会改变客户提问的方式，也会影响你今天判断价格、带看和沟通节奏。';

  if (article.tag === 'competitor') {
    return [
      {
        title: '客户会拿什么来比',
        body: '同价位供给一多，客户不会只问“这套好不好”，而是会直接拿旁边的房源问价格、楼层、装修和业主让步空间。压价不再是抽象情绪，而是有了更具体的参照物。',
      },
      {
        title: '今天先准备什么',
        body: '先把竞品对比口径准备好：我们的价格差在哪里，户型或装修有没有硬优势，业主能不能谈，哪些点不能让。再去接客户反馈，会比临场解释稳得多。',
      },
      { title: '会影响哪些动作', body: impactLine },
    ];
  }

  if (article.tag === 'community' || article.tag === 'district') {
    return [
      {
        title: '板块里的风向变了',
        body: '同小区或同板块供给变化，会直接改变客户看房路线。客户多看一套，业主就多一个被比较的理由；如果不提前讲清差异，后面的反馈很容易变成一句“再看看”。',
      },
      {
        title: '别只报新增供给',
        body: '先把本房和新增房源的差异讲清楚，再决定是补卖点、补带看，还是提前做价格预期沟通。公众号提醒的价值，不是告诉你“有变化”，而是帮你提前组织判断。',
      },
      { title: '会影响哪些动作', body: impactLine },
    ];
  }

  if (article.tag === 'market') {
    return [
      {
        title: '客户的预算感在变',
        body: '客户预算和带看热度变化时，价格略高的房源最先感受到压力。你不能只说“市场就这样”，要能讲清这套房在同商圈里的位置。',
      },
      {
        title: '沟通顺序要换一下',
        body: '今天沟通时先给市场判断，再给行动安排：先解释客户为什么犹豫，再告诉业主下一步怎么补证据、补带看或补价格预期。这样比只说“继续等等”更能稳住信任。',
      },
      { title: '会影响哪些动作', body: impactLine },
    ];
  }

  return [
    {
      title: '这不是一条普通通知',
      body: '这类提醒更像一篇经营方法短文。重点不是多一个消息红点，而是帮你把下一次沟通说得更具体，让业主和客户知道你已经看到了问题。',
    },
    {
      title: '先给判断，再给安排',
      body: '不要一上来就报动作。先告诉对方你判断的原因，再给出今天准备推进的安排，沟通会更像专业经营，而不是临时回复。',
    },
    { title: '会影响哪些动作', body: impactLine },
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
