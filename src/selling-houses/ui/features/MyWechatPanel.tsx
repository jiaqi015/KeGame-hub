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
  onSelectOpportunity?: (opportunityId: string) => void;
  onOpenMarket?: (layer?: IntelLayerTab) => void;
}

type WechatTab = 'messages' | 'official';
type WechatMessageRowProps = {
  message: WechatMessage;
  read: boolean;
  lead: boolean;
  onClick: () => void;
};
type OfficialArticleRowProps = {
  article: OfficialAccountArticle;
  read: boolean;
  onClick: () => void;
};

export function MyWechatPanel({
  projection,
  readIds,
  onMarkRead,
  onSelectCase,
  onSelectOpportunity,
  onOpenMarket,
}: MyWechatPanelProps) {
  const [activeTab, setActiveTab] = useState<WechatTab>('messages');
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
  const sortedOfficialAccounts = useMemo(
    () => sortUnreadFirst(projection.officialAccounts, effectiveReadIds),
    [projection.officialAccounts, effectiveReadIds],
  );
  const unreadCount = projection.messages.filter((message) => !effectiveReadIds.has(message.id)).length;

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

  const openMessage = (message: WechatMessage) => {
    markRead(message.id);
    if (message.targetCaseId) {
      onSelectCase(message.targetCaseId);
      return;
    }
    if (message.targetOpportunityId && onSelectOpportunity) {
      onSelectOpportunity(message.targetOpportunityId);
    }
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
          sortedMessages.length > 0 ? (
            sortedMessages.map((message) => (
              <WechatMessageRow
                key={message.id}
                message={message}
                read={effectiveReadIds.has(message.id)}
                lead={message.id === projection.leadCaseMessageId}
                onClick={() => openMessage(message)}
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
  message,
  read,
  lead,
  onClick,
}) => {
  return (
    <button
      type="button"
      data-my-wechat-message-row="true"
      data-my-wechat-read={read ? 'true' : 'false'}
      onClick={onClick}
      className="group flex w-full gap-2.5 rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] px-3 py-2.5 text-left transition-all hover:border-[color:var(--seller-accent)]/45 hover:bg-[rgba(255,255,255,0.05)]"
    >
      <span
        aria-hidden="true"
        className={`mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full ${read ? 'bg-transparent' : 'bg-rose-500 shadow-[0_0_0_2px_var(--seller-panel)]'}`}
      />
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.06)] text-[13px] font-semibold text-[var(--seller-ink)]">
        {message.avatarLabel}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0 truncate text-[13px] font-semibold text-[var(--seller-ink)]">{message.senderName}</div>
          <span className="shrink-0 text-[10px] font-medium text-[var(--seller-subtle)]">{message.timeLabel}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[var(--seller-muted)]">{message.preview}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${urgencyClassName(message.urgency)}`}>
            {urgencyLabel(message.urgency)}
          </span>
          {lead && <span className="seller-chip seller-chip-accent">今日重点</span>}
          {message.primaryCtaLabel && <span className="text-[10px] font-semibold text-[var(--seller-accent)]">{message.primaryCtaLabel}</span>}
        </div>
      </div>
      <ChevronRight size={14} className="mt-3 shrink-0 text-[var(--seller-subtle)] transition-transform group-hover:translate-x-0.5" />
    </button>
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
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border border-[var(--seller-border)] bg-[rgba(34,197,94,0.10)] text-[11px] font-semibold text-emerald-200">
            订
          </span>
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

function WechatEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[12px] border border-dashed border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] px-3 py-4 text-center">
      <div className="text-[12px] font-semibold text-[var(--seller-ink)]">{title}</div>
      <p className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{description}</p>
    </div>
  );
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
