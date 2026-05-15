import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, MessageCircle, Newspaper } from 'lucide-react';
import type {
  MyWechatProjection,
  OfficialAccountArticle,
  WechatMessage,
  WechatMessageUrgency,
} from '../../application/projections/myWechatTypes.js';
import type { IntelLayerTab } from './marketIntel.js';

interface MyWechatPanelProps {
  projection: MyWechatProjection;
  readIds?: Set<string>;
  onMarkRead?: (id: string) => void;
  onSelectCase: (caseId: string) => void;
  onScheduleMessageAction?: (message: WechatMessage) => boolean;
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
type WechatMessageRowProps = {
  conversation: WechatConversation;
  read: boolean;
  lead: boolean;
  onClick: () => void;
  onPrimaryAction?: () => void;
};
type RelatedWechatCase = {
  id: string;
  title: string;
  actionMessage: WechatMessage | null;
};
type OfficialArticleRowProps = {
  article: OfficialAccountArticle;
  read: boolean;
  onClick: () => void;
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
  projection,
  readIds,
  onMarkRead,
  onSelectCase,
  onScheduleMessageAction,
  onOpenMarket,
}: MyWechatPanelProps) {
  const [activeTab, setActiveTab] = useState<WechatTab>('messages');
  const [selectedConversationKey, setSelectedConversationKey] = useState<string | null>(null);
  const [localReadIds, setLocalReadIds] = useState<Set<string>>(() => new Set());
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

  useEffect(() => {
    if (activeTab !== 'messages' || !selectedConversationKey) {
      return;
    }
    if (!conversations.some((conversation) => conversation.key === selectedConversationKey)) {
      setSelectedConversationKey(null);
    }
  }, [activeTab, conversations, selectedConversationKey]);

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
      onScheduleMessageAction(message);
      return;
    }
    setSelectedConversationKey(conversationKeyForMessage(message));
  };

  const openArticle = (article: OfficialAccountArticle) => {
    markRead(article.id);
    const firstCaseId = article.relatedCaseIds[0];
    if (firstCaseId) {
      onSelectCase(firstCaseId);
      return;
    }
    onOpenMarket?.(mapArticleTagToLayer(article.tag));
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
            onClick={() => setActiveTab('messages')}
          />
          <WechatTabButton
            active={activeTab === 'official'}
            icon={<Newspaper size={12} />}
            label="公众号"
            count={projection.officialAccounts.length}
            onClick={() => setActiveTab('official')}
          />
        </div>
      </div>

      <div className="space-y-2 px-3 py-3">
        {activeTab === 'messages' ? (
          selectedConversation ? (
            <WechatConversationDetail
              conversation={selectedConversation}
              onBack={() => setSelectedConversationKey(null)}
              onSelectCase={onSelectCase}
              onOpenMessageAction={triggerMessageAction}
            />
          ) : conversations.length > 0 ? (
            conversations.map((conversation) => (
              <WechatMessageRow
                key={conversation.key}
                conversation={conversation}
                read={conversation.unreadCount === 0}
                lead={conversation.messages.some((message) => message.id === projection.leadCaseMessageId)}
                onClick={() => openConversation(conversation)}
                onPrimaryAction={conversation.primaryMessage?.primaryActionId ? () => triggerMessageAction(conversation.primaryMessage!) : undefined}
              />
            ))
          ) : (
            <WechatEmptyState title={projection.emptyState?.title || '今天没有新的微信消息'} description={projection.emptyState?.description || '先按今日安排推进。'} />
          )
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

function collectRelatedCases(messages: WechatMessage[]): RelatedWechatCase[] {
  const relatedCases = new Map<string, RelatedWechatCase>();
  messages.forEach((message) => {
    if (!message.targetCaseId) return;
    if (!relatedCases.has(message.targetCaseId)) {
      relatedCases.set(message.targetCaseId, {
        id: message.targetCaseId,
        title: message.targetCaseTitle || '关联房源',
        actionMessage: message.primaryActionId ? message : null,
      });
      return;
    }

    const relatedCase = relatedCases.get(message.targetCaseId);
    if (relatedCase && !relatedCase.actionMessage && message.primaryActionId) {
      relatedCase.actionMessage = message;
    }
  });
  return [...relatedCases.values()];
}

function senderRoleLabel(role: WechatMessage['senderRole']) {
  if (role === 'owner') return '业主';
  if (role === 'customer') return '客户';
  if (role === 'district_manager') return '张经理';
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
  read,
  lead,
  onClick,
  onPrimaryAction,
}) => {
  const latestMessage = conversation.messages[0];
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
        className="h-9 w-9 rounded-[12px]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0 truncate text-[13px] font-semibold text-[var(--seller-ink)]">{conversation.senderName}</div>
          <span className="shrink-0 text-[10px] font-medium text-[var(--seller-subtle)]">{latestMessage.timeLabel}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[var(--seller-muted)]">{latestMessage.preview}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${urgencyClassName(latestMessage.urgency)}`}>
            {urgencyLabel(latestMessage.urgency)}
          </span>
          {lead && <span className="seller-chip seller-chip-accent">今日重点</span>}
          {latestMessage.primaryCtaLabel && onPrimaryAction ? (
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
  onBack: () => void;
  onSelectCase: (caseId: string) => void;
  onOpenMessageAction: (message: WechatMessage) => void;
}> = ({
  conversation,
  onBack,
  onSelectCase,
  onOpenMessageAction,
}) => {
  const relatedCases = collectRelatedCases(conversation.messages);

  return (
    <div className="flex h-[min(560px,calc(100vh-220px))] min-h-[420px] flex-col overflow-hidden rounded-[14px] border border-[var(--seller-border)] bg-[#0c131c]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[15px] text-[var(--seller-muted)] transition hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--seller-ink)]"
          aria-label="返回消息列表"
        >
          ←
        </button>
        <WechatAvatar
          senderName={conversation.senderName}
          senderRole={conversation.senderRole}
          label={conversation.avatarLabel}
          className="h-8 w-8 rounded-[10px]"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-[var(--seller-ink)]">{conversation.senderName}</div>
          <div className="mt-0.5 text-[10px] text-[var(--seller-subtle)]">{senderRoleLabel(conversation.senderRole)}</div>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {conversation.messages.map((message) => (
          <div key={message.id} className="flex items-start gap-2.5">
            <WechatAvatar
              senderName={message.senderName}
              senderRole={message.senderRole}
              label={message.avatarLabel}
              className="mt-4 h-7 w-7 rounded-[9px]"
            />
            <div className="min-w-0 max-w-[78%]">
              <div className="mb-1 flex items-center gap-2 text-[10px] text-[var(--seller-subtle)]">
                <span>{message.timeLabel}</span>
                {message.urgency !== 'low' ? <span>{urgencyLabel(message.urgency)}</span> : null}
              </div>
              <div className="rounded-[16px] rounded-tl-[5px] bg-[rgba(255,255,255,0.08)] px-3 py-2.5 shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
                <p className="whitespace-pre-wrap text-[12px] leading-5 text-[var(--seller-ink)]">{message.content}</p>
                {message.primaryCtaLabel && message.primaryActionId && (
                  <button
                    type="button"
                    onClick={() => onOpenMessageAction(message)}
                    className="mt-2 rounded-full border border-[color:var(--seller-accent)]/24 bg-[color:var(--seller-accent)]/8 px-1 py-0 text-[8px] font-semibold leading-4 text-[var(--seller-accent)] transition hover:bg-[color:var(--seller-accent)]/14"
                  >
                    {message.primaryCtaLabel}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-[var(--seller-border)] bg-[rgba(5,8,12,0.72)] px-3 py-2.5">
        {relatedCases.length > 0 ? (
          <div className="space-y-2">
            <div className="text-[10px] font-semibold text-[var(--seller-subtle)]">
              关联房源 {relatedCases.length} 套
            </div>
            <div className="flex flex-wrap gap-2">
              {relatedCases.map((relatedCase) => (
                <div
                  key={relatedCase.id}
                  className="flex max-w-full items-center gap-1.5 rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] px-2 py-1"
                >
                  <button
                    type="button"
                    onClick={() => onSelectCase(relatedCase.id)}
                    className="max-w-[160px] truncate text-[11px] font-semibold text-[var(--seller-ink)] transition hover:text-[var(--seller-accent)]"
                  >
                    {relatedCase.title}
                  </button>
                  {relatedCase.actionMessage?.primaryCtaLabel ? (
                    <button
                      type="button"
                      onClick={() => onOpenMessageAction(relatedCase.actionMessage!)}
                      className="rounded-full border border-[color:var(--seller-accent)]/24 bg-[color:var(--seller-accent)]/8 px-1 py-0 text-[8px] font-semibold leading-4 text-[var(--seller-accent)] transition hover:bg-[color:var(--seller-accent)]/14"
                    >
                      {relatedCase.actionMessage.primaryCtaLabel}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center text-[11px] text-[var(--seller-muted)]">暂无关联房源</div>
        )}
      </div>
    </div>
  );
};

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
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-[var(--seller-ink)]">
        {label}
      </span>
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
