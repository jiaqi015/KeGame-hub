import React, { useMemo, useState } from 'react';
import type { GameState } from '../../domain/models';
import {
  AlertTriangle,
  ArrowRight,
  EyeOff,
  Gauge,
  HandCoins,
  MessagesSquare,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  buildOpportunityListProjection,
  type CustomerCaseRelationProjection,
  type CustomerProjection,
  type OpportunityBucketId,
} from '../../application/projections/operatingProjection.js';
import { buildOwnerPersonaProfile } from '../../application/projections/ownerPersonaProfile.js';
import { buildOpportunityViewModels, formatOpportunityDaysLeft, type OpportunityViewModel } from './caseOpportunityViewModel';

interface OpportunitiesProps {
  state: GameState;
  onSelectCase: (id: string) => void;
  onSetView: (view: string) => void;
}

type PotentialPoolGroup = {
  caseId: string;
  title: string;
  district: string;
  signalCount: number;
  channels: string[];
  budgetLine: string;
  summary: string;
  avgIntent: number;
  avgConfidence: number;
  soonestDaysLeft: number;
};

type OpportunityTab = 'active' | 'closing' | 'risk' | 'potential';
type ActiveCustomerFilter = 'all' | 'viewed' | 'contacted' | 'comparing' | 'negotiating';

const BUCKET_TAB_MAP: Record<OpportunityBucketId, OpportunityTab> = {
  met: 'active',
  potential: 'potential',
  closing: 'closing',
  'at-risk': 'risk',
};

export function Opportunities({ state, onSelectCase, onSetView }: OpportunitiesProps) {
  const projection = useMemo(() => buildOpportunityListProjection(state), [state]);
  const [activeTab, setActiveTab] = useState<OpportunityTab>('active');
  const [activeCustomerFilter, setActiveCustomerFilter] = useState<ActiveCustomerFilter>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const potentialModels = useMemo(() => buildOpportunityViewModels(state, projection.potential), [projection.potential, state]);
  const potentialPools = useMemo(() => groupPotentialPools(potentialModels), [potentialModels]);

  const customerRows = projection.customers;
  const viewedCustomers = customerRows.filter((customer) => customer.viewedRelationCount > 0);
  const contactedCustomers = customerRows.filter((customer) => customer.revealedRelationCount > 0 && customer.viewedRelationCount === 0);
  const comparingCustomers = customerRows.filter((customer) => customer.statusLabel === '比较中');
  const negotiatingCustomers = customerRows.filter((customer) => customer.statusLabel === '谈价中');
  const riskCustomers = customerRows.filter((customer) => customer.churnRisk >= 60 || customer.relations.some((relation) => relation.tone === 'risk'));
  const displayedCustomers = filterCustomerRows(customerRows, activeCustomerFilter);
  const showActiveTab = (filter: ActiveCustomerFilter = 'all') => {
    setActiveTab('active');
    setActiveCustomerFilter(filter);
  };
  const showBucketTab = (bucketId: OpportunityBucketId) => {
    setActiveCustomerFilter('all');
    setActiveTab(BUCKET_TAB_MAP[bucketId]);
  };
  const selectedCustomer = selectedCustomerId
    ? customerRows.find((customer) => customer.customerId === selectedCustomerId) || null
    : null;

  if (selectedCustomer) {
    return (
      <CustomerDetailPage
        customer={selectedCustomer}
        onBack={() => setSelectedCustomerId(null)}
        onOpenCase={(caseId) => openCase(caseId, onSelectCase, onSetView)}
      />
    );
  }

  return (
    <div className="space-y-4" data-selling-houses-page="customers">
      <section className="seller-panel p-4 lg:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="seller-label">客户资产池</div>
            <h2 className="seller-title mt-2 text-[20px]">按人推进客户</h2>
          </div>

          <div className="grid min-w-[280px] grid-cols-2 gap-2 md:grid-cols-4">
            {projection.bucketSummaries.map((bucket) => (
              <div key={bucket.id}>
                <BucketStat
                  label={bucket.label}
                  value={bucket.count}
                  summary={bucket.summary}
                  tone={bucket.id === 'closing' ? 'emerald' : bucket.id === 'at-risk' ? 'rose' : bucket.id === 'potential' ? 'amber' : 'slate'}
                  active={activeTab === BUCKET_TAB_MAP[bucket.id] && activeCustomerFilter === 'all'}
                  onClick={() => showBucketTab(bucket.id)}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="seller-panel overflow-hidden p-4 lg:p-5">
        <div className="flex flex-col gap-3 border-b border-[var(--seller-border)] pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="seller-label">分区</div>
          <div className="seller-tabbar">
            <button type="button" onClick={() => showActiveTab()} className={`seller-tab ${activeTab === 'active' ? 'seller-tab-active' : ''}`}>在跟准客</button>
            <button type="button" onClick={() => { setActiveCustomerFilter('all'); setActiveTab('closing'); }} className={`seller-tab ${activeTab === 'closing' ? 'seller-tab-active' : ''}`}>快成交</button>
            <button type="button" onClick={() => { setActiveCustomerFilter('all'); setActiveTab('risk'); }} className={`seller-tab ${activeTab === 'risk' ? 'seller-tab-active' : ''}`}>掉线</button>
            <button type="button" onClick={() => { setActiveCustomerFilter('all'); setActiveTab('potential'); }} className={`seller-tab ${activeTab === 'potential' ? 'seller-tab-active' : ''}`}>潜在</button>
          </div>
        </div>

        {activeTab === 'active' && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <StageOverviewCard
                title="已见过面"
                count={viewedCustomers.length}
                detail="看过房，后续多在复看、报价或家人决策。"
                tone="emerald"
                active={activeCustomerFilter === 'viewed'}
                onClick={() => showActiveTab('viewed')}
              />
              <StageOverviewCard
                title="只接上话"
                count={contactedCustomers.length}
                detail="聊过需求，还没形成看房记录。"
                tone="slate"
                active={activeCustomerFilter === 'contacted'}
                onClick={() => showActiveTab('contacted')}
              />
            </div>
            <div className="seller-note p-3.5">
              <div className="grid grid-cols-2 gap-3 text-[11px] text-[var(--seller-muted)] md:grid-cols-4">
                <CustomerMetricButton
                  label="在跟准客"
                  value={customerRows.length}
                  active={activeCustomerFilter === 'all'}
                  onClick={() => showActiveTab()}
                />
                <CustomerMetricButton
                  label="比较中"
                  value={comparingCustomers.length}
                  active={activeCustomerFilter === 'comparing'}
                  onClick={() => showActiveTab('comparing')}
                />
                <CustomerMetricButton
                  label="谈价中"
                  value={negotiatingCustomers.length}
                  active={activeCustomerFilter === 'negotiating'}
                  onClick={() => showActiveTab('negotiating')}
                />
                <CustomerMetricButton
                  label="看过房"
                  value={viewedCustomers.length}
                  active={activeCustomerFilter === 'viewed'}
                  onClick={() => showActiveTab('viewed')}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {displayedCustomers.length > 0 ? displayedCustomers.map((customer) => (
                <React.Fragment key={customer.customerId}>
                  <CustomerCard
                    customer={customer}
                    onOpenDetail={() => setSelectedCustomerId(customer.customerId)}
                  />
                </React.Fragment>
              )) : (
                <EmptyState
                  title={activeCustomerFilter === 'all' ? '还没有稳定接上的客户' : '这个分组暂时为空'}
                  detail={activeCustomerFilter === 'all' ? '当前客户池还没形成可推进关系。' : '可以切回在跟准客看全部客户。'}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'closing' && (
          <div className="mt-4 space-y-2.5">
            {negotiatingCustomers.length > 0 ? negotiatingCustomers.map((customer) => (
              <React.Fragment key={customer.customerId}>
                <CompactCustomerCard
                  customer={customer}
                  accent="emerald"
                  titleSuffix="已进入报价或谈判"
                  onOpenDetail={() => setSelectedCustomerId(customer.customerId)}
                />
              </React.Fragment>
            )) : (
              <EmptyState
                title="还没有客户走到报价或谈判"
                detail="把看过房的客户继续往后推。"
                compact
              />
            )}
          </div>
        )}

        {activeTab === 'risk' && (
          <div className="mt-4 space-y-2.5">
            {riskCustomers.length > 0 ? riskCustomers.map((customer) => (
              <React.Fragment key={customer.customerId}>
                <CompactCustomerCard
                  customer={customer}
                  accent="rose"
                  titleSuffix="需要尽快接上"
                  onOpenDetail={() => setSelectedCustomerId(customer.customerId)}
                />
              </React.Fragment>
            )) : (
              <EmptyState
                title="短期掉线压力不重"
                detail="目前没有大面积掉线。"
                compact
              />
            )}
          </div>
        )}

        {activeTab === 'potential' && (
          <div className="mt-4 space-y-4">
            <div className="seller-note px-4 py-3">
              <div className="grid grid-cols-1 gap-3 text-[11px] text-[var(--seller-muted)] md:grid-cols-3">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--seller-chance)]">有信号的房源</div>
                  <div className="mt-1 text-[15px] font-semibold text-[var(--seller-ink)]">{projection.potentialSummary.caseCount}</div>
                </div>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--seller-chance)]">主要来源渠道</div>
                  <div className="mt-1 text-[15px] font-semibold text-[var(--seller-ink)]">{projection.potentialSummary.channelCount}</div>
                </div>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--seller-chance)]">最早掉线时间</div>
                  <div className="mt-1 text-[15px] font-semibold text-[var(--seller-ink)]">
                    {projection.potentialSummary.soonestDaysLeft === null ? '暂无' : `${Math.max(0, projection.potentialSummary.soonestDaysLeft)} 天`}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {potentialPools.length > 0 ? potentialPools.map((pool) => (
                <React.Fragment key={pool.caseId}>
                  <PotentialPoolCard
                    pool={pool}
                    onOpenCase={() => openCase(pool.caseId, onSelectCase, onSetView)}
                  />
                </React.Fragment>
              )) : (
                <div className="col-span-full">
                  <EmptyState
                    title="潜在人群还没浮出来"
                    detail="新的客群信号还不够明显。"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function openCase(caseId: string, onSelectCase: (id: string) => void, onSetView: (view: string) => void) {
  onSelectCase(caseId);
  onSetView('cases');
}

function filterCustomerRows(customers: CustomerProjection[], filter: ActiveCustomerFilter) {
  if (filter === 'viewed') return customers.filter((customer) => customer.viewedRelationCount > 0);
  if (filter === 'contacted') return customers.filter((customer) => customer.revealedRelationCount > 0 && customer.viewedRelationCount === 0);
  if (filter === 'comparing') return customers.filter((customer) => customer.statusLabel === '比较中');
  if (filter === 'negotiating') return customers.filter((customer) => customer.statusLabel === '谈价中');
  return customers;
}

function groupPotentialPools(models: OpportunityViewModel[]): PotentialPoolGroup[] {
  const groups = new Map<string, OpportunityViewModel[]>();

  models.forEach((model) => {
    const items = groups.get(model.opportunity.caseId) || [];
    items.push(model);
    groups.set(model.opportunity.caseId, items);
  });

  return [...groups.entries()]
    .map(([caseId, items]) => {
      const lead = items[0];
      const budgets = items
        .map((item) => item.opportunity.budgetMax)
        .filter((value) => Number.isFinite(value))
        .sort((left, right) => left - right);
      const channels = [...new Set(items.map((item) => item.opportunity.channelName).filter(Boolean))];
      const avgIntent = average(items.map((item) => item.opportunity.intent));
      const avgConfidence = average(items.map((item) => item.opportunity.confidence));
      const soonestDaysLeft = Math.min(...items.map((item) => item.opportunity.daysLeft));

      return {
        caseId,
        title: lead.caseItem?.title || '未知房源',
        district: lead.caseItem?.district || '所在片区',
        signalCount: items.length,
        channels: channels.slice(0, 3),
        budgetLine: describeBudgetRange(budgets),
        summary: buildPotentialPoolSummary(items, channels),
        avgIntent: Math.round(avgIntent),
        avgConfidence: Math.round(avgConfidence),
        soonestDaysLeft,
      };
    })
    .sort((left, right) => scorePotentialPool(right) - scorePotentialPool(left));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function scorePotentialPool(pool: PotentialPoolGroup) {
  return pool.signalCount * 24 + pool.avgIntent * 1.2 + pool.avgConfidence - pool.soonestDaysLeft * 3;
}

function describeBudgetRange(budgets: number[]) {
  if (budgets.length === 0) return '预算还没摸清';
  if (budgets[0] === budgets[budgets.length - 1]) {
    return `预算上限多在 ${budgets[0]} 万`;
  }
  return `预算上限多在 ${budgets[0]}-${budgets[budgets.length - 1]} 万`;
}

function buildPotentialPoolSummary(models: OpportunityViewModel[], channels: string[]) {
  const lead = models[0];
  const channelLine = channels.length > 0 ? `主要来自 ${channels.join('、')}` : '来源还在分散';
  const needLine = lead.profileDetail || '需求还没核实';
  return `${channelLine}。${needLine}`;
}

function BucketStat({
  label,
  value,
  summary,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  summary: string;
  tone: 'slate' | 'amber' | 'emerald' | 'rose';
  active: boolean;
  onClick: () => void;
}) {
  const toneClass = tone === 'emerald'
    ? 'border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)] text-[var(--seller-chance)]'
    : tone === 'amber'
      ? 'border-[color:var(--seller-accent)]/22 bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]'
      : tone === 'rose'
        ? 'border-[color:var(--seller-risk)]/22 bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]'
        : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] text-[var(--seller-ink)]';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-3 text-left transition hover:border-[var(--seller-border-strong)] ${toneClass} ${active ? 'ring-1 ring-[var(--seller-accent)]' : ''}`}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">{label}</div>
      <div className="mt-1 text-[20px] font-bold">{value}</div>
      <div className="mt-1 text-[11px] leading-5 opacity-70">{summary}</div>
    </button>
  );
}

function StageOverviewCard({
  title,
  count,
  detail,
  tone,
  active,
  onClick,
}: {
  title: string;
  count: number;
  detail: string;
  tone: 'slate' | 'emerald';
  active: boolean;
  onClick: () => void;
}) {
  const toneClass = tone === 'emerald'
    ? 'border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)]'
    : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)]';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[20px] border px-4 py-4 text-left transition hover:border-[var(--seller-border-strong)] ${toneClass} ${active ? 'ring-1 ring-[var(--seller-accent)]' : ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--seller-subtle)]">{title}</div>
        <div className="text-[22px] font-bold text-[var(--seller-ink)]">{count}</div>
      </div>
      <p className="mt-2 text-[12px] leading-6 text-[var(--seller-muted)]">{detail}</p>
    </button>
  );
}

function CustomerMetricButton({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[12px] px-3 py-2 text-left transition hover:bg-[rgba(255,255,255,0.06)] ${active ? 'bg-[rgba(255,255,255,0.06)] ring-1 ring-[var(--seller-accent)]' : ''}`}
    >
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">{label}</div>
      <div className="mt-1 text-[15px] font-semibold text-[var(--seller-ink)]">{value}</div>
    </button>
  );
}

function CustomerDetailPage({
  customer,
  onBack,
  onOpenCase,
}: {
  customer: CustomerProjection;
  onBack: () => void;
  onOpenCase: (caseId: string) => void;
}) {
  return (
    <div className="space-y-4" data-selling-houses-page="customers">
      <section className="seller-panel p-4 lg:p-5">
        <button
          type="button"
          onClick={onBack}
          className="seller-button-secondary rounded-[10px] px-3 py-2 text-[11px]"
        >
          返回我的客户
        </button>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="seller-label">客户详情</div>
            <h2 className="seller-title mt-2 text-[24px]">{customer.name}</h2>
            <p className="mt-2 text-[12px] leading-6 text-[var(--seller-muted)]">
              {customer.statusLabel} · {customer.profile}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right lg:min-w-[280px]">
            <MetricPill label="信任" value={`${customer.advisorTrust}`} tone="slate" />
            <MetricPill label="疲劳" value={`${customer.fatigue}`} tone={customer.fatigue >= 65 ? 'rose' : 'slate'} />
            <MetricPill label="风险" value={`${customer.churnRisk}`} tone={customer.churnRisk >= 60 ? 'rose' : 'amber'} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <StatusPanel
          icon={<Sparkles size={14} />}
          label="信息"
          title={`${customer.budgetLine} · ${customer.targetDistrict}`}
          detail={customer.layoutLine}
          tone="slate"
        />
        <StatusPanel
          icon={<Users size={14} />}
          label="画像"
          title={customer.profile}
          detail={customer.statusDetail}
          tone="amber"
        />
        <StatusPanel
          icon={<MessagesSquare size={14} />}
          label="需求"
          title={customer.statusLabel}
          detail={customer.primaryActionLabel ? `下一步：${customer.primaryActionLabel}` : '先保持跟进，等待更明确关系。'}
          tone={customer.statusLabel === '谈价中' ? 'emerald' : 'slate'}
        />
      </section>

      <section className="seller-panel p-4 lg:p-5">
        <div className="flex flex-col gap-1 border-b border-[var(--seller-border)] pb-3">
          <div className="seller-label">关注房源</div>
          <p className="text-[12px] leading-6 text-[var(--seller-muted)]">
            {customer.relations.length} 套正在形成关系。
          </p>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {customer.relations.map((relation) => {
            return (
              <button
                key={relation.id}
                type="button"
                onClick={() => onOpenCase(relation.caseId)}
                className="rounded-[18px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] p-3.5 text-left transition hover:border-[var(--seller-border-strong)] hover:bg-[rgba(255,255,255,0.05)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-[14px] font-semibold text-[var(--seller-ink)]">{relation.title}</h3>
                    <p className="mt-1 text-[11px] leading-5 text-[var(--seller-subtle)]">{relation.district} · {relation.stageLabel}</p>
                    <span className="mt-2 inline-flex rounded-full bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-[10px] font-bold text-[var(--seller-muted)]">
                      {relation.channelName || (relation.revealed ? '已接触' : '潜在关系')}
                    </span>
                  </div>
                  <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-[10px] font-bold text-[var(--seller-subtle)]">
                    {relation.daysLeft === undefined ? '观察中' : formatOpportunityDaysLeft(relation.daysLeft)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MetricPill label="意向" value={`${relation.intent}`} tone="slate" />
                  <MetricPill label="把握" value={`${relation.confidence}`} tone="slate" />
                </div>
                <p className="mt-3 text-[11px] leading-5 text-[var(--seller-muted)]">
                  {relation.nextActionLabel ? `建议安排：${relation.nextActionLabel}` : '继续观察客户和房源匹配。'}
                </p>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function CustomerCard({
  customer,
  onOpenDetail,
}: {
  customer: CustomerProjection;
  onOpenDetail: () => void;
}) {
  const comparing = customer.statusLabel === '比较中';
  const atRisk = customer.churnRisk >= 60 || customer.relations.some((relation) => relation.tone === 'risk');

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className="w-full rounded-[18px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3.5 py-3 text-left transition hover:border-[var(--seller-border-strong)] hover:bg-[rgba(255,255,255,0.05)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-[14px] font-semibold text-[var(--seller-ink)]">{customer.name}</strong>
            <span className="rounded-full bg-[rgba(255,255,255,0.05)] px-2 py-0.5 text-[10px] font-bold text-[var(--seller-subtle)]">
              {customer.statusLabel}
            </span>
            {comparing && <span className="rounded-full bg-[var(--seller-accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--seller-accent)]">比较中</span>}
            {atRisk && <span className="rounded-full bg-[var(--seller-risk-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--seller-risk)]">掉线风险</span>}
          </div>
          <p className="mt-1 truncate text-[11px] leading-5 text-[var(--seller-subtle)]">
            {customer.topCaseTitle || '多房源关系'} · {customer.activeRelationCount} 条关系
          </p>
          <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-[var(--seller-muted)]">{customer.statusDetail}</p>
        </div>
        <div className="grid w-[210px] shrink-0 grid-cols-3 gap-2 text-right">
          <MetricPill label="房源" value={`${customer.activeRelationCount}`} tone="slate" />
          <MetricPill label="看过" value={`${customer.viewedRelationCount}`} tone="slate" />
          <MetricPill label="风险" value={`${customer.churnRisk}`} tone={atRisk ? 'rose' : 'amber'} />
        </div>
      </div>
    </button>
  );
}

function CompactCustomerCard({
  customer,
  accent,
  titleSuffix,
  onOpenDetail,
}: {
  customer: CustomerProjection;
  accent: 'emerald' | 'rose';
  titleSuffix: string;
  onOpenDetail: () => void;
}) {
  const cardClass = accent === 'emerald'
    ? 'border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)]'
    : 'border-[color:var(--seller-risk)]/22 bg-[var(--seller-risk-soft)]';

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className={`w-full rounded-2xl border px-4 py-3 text-left transition hover:bg-[rgba(255,255,255,0.05)] ${cardClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[var(--seller-ink)]">{customer.name}</div>
          <p className="mt-1 text-[11px] leading-5 text-[var(--seller-subtle)]">
            {customer.topCaseTitle || '多房源关系'} · {titleSuffix}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{customer.statusDetail}</p>
        </div>
        <span className="rounded-full bg-[rgba(255,255,255,0.05)] px-2 py-0.5 text-[10px] font-bold text-[var(--seller-subtle)]">
          {customer.primaryActionLabel || customer.statusLabel}
        </span>
      </div>
    </button>
  );
}

function PotentialPoolCard({
  pool,
  onOpenCase,
}: {
  pool: PotentialPoolGroup;
  onOpenCase: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpenCase}
      className="group rounded-[22px] border border-[color:var(--seller-accent)]/22 bg-[var(--seller-accent-soft)] p-4 text-left shadow-sm transition hover:border-[color:var(--seller-accent)]/35 hover:bg-[rgba(255,255,255,0.05)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-accent)]">
            <EyeOff size={14} />
            潜在人群池
          </div>
          <h3 className="mt-2 text-[16px] font-semibold text-[var(--seller-ink)]">{pool.title}</h3>
          <p className="mt-1 text-[11px] leading-5 text-[var(--seller-subtle)]">{pool.district} · {pool.signalCount} 组还没接上的人</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(255,255,255,0.08)] text-[var(--seller-accent)] transition group-hover:bg-[var(--seller-accent)] group-hover:text-[var(--seller-bg)]">
          <ArrowRight size={15} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <PotentialMetric label="机会强度" value={pool.avgIntent} />
        <PotentialMetric label="匹配把握" value={pool.avgConfidence} />
        <PotentialMetric label="最早散开" value={Math.max(pool.soonestDaysLeft, 0)} suffix="天" />
      </div>

      <div className="mt-4 space-y-3">
        <StatusPanel
          icon={<Sparkles size={14} />}
          label="主要是哪些人"
          title={pool.budgetLine}
          detail={pool.summary}
          tone="amber"
          compact
        />
      <div className="flex flex-wrap gap-2 text-[10px] font-semibold text-[var(--seller-subtle)]">
          {pool.channels.map((channel) => (
            <span key={channel} className="rounded-full bg-[rgba(255,255,255,0.06)] px-2.5 py-1">
              {channel}
            </span>
          ))}
          {pool.channels.length === 0 && (
            <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-2.5 py-1">
              来源待补
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function StatusPanel({
  icon,
  label,
  title,
  detail,
  tone,
  compact = false,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  detail: string;
  tone: 'slate' | 'amber' | 'emerald' | 'rose';
  compact?: boolean;
}) {
  const toneClass = tone === 'emerald'
    ? 'border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)]'
    : tone === 'amber'
      ? 'border-[color:var(--seller-accent)]/22 bg-[var(--seller-accent-soft)]'
      : tone === 'rose'
        ? 'border-[color:var(--seller-risk)]/22 bg-[var(--seller-risk-soft)]'
        : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)]';

  return (
    <div className={`rounded-[18px] border px-3.5 ${compact ? 'py-3' : 'py-3.5'} ${toneClass}`}>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-[13px] font-semibold leading-5 text-[var(--seller-ink)]">{title}</div>
      <p className="mt-2 text-[11px] leading-5 text-[var(--seller-muted)]">{detail}</p>
    </div>
  );
}

function InlineFlag({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'slate' | 'amber' | 'emerald' | 'rose';
}) {
  const toneClass = tone === 'emerald'
    ? 'bg-[var(--seller-chance-soft)] text-[var(--seller-chance)]'
    : tone === 'amber'
      ? 'bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]'
      : tone === 'rose'
        ? 'bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]'
        : 'bg-[rgba(255,255,255,0.06)] text-[var(--seller-muted)]';

  return (
    <div className={`rounded-[14px] px-3 py-2 text-[10px] font-semibold ${toneClass}`}>
      <div className="uppercase tracking-[0.12em] opacity-70">{label}</div>
      <div className="mt-1 text-[11px] leading-5 normal-case">{value}</div>
    </div>
  );
}

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'slate' | 'amber' | 'rose';
}) {
  const toneClass = tone === 'amber'
    ? 'bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]'
    : tone === 'rose'
      ? 'bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]'
      : 'bg-[rgba(255,255,255,0.06)] text-[var(--seller-ink)]';

  return (
    <div className={`rounded-xl px-2.5 py-2 ${toneClass}`}>
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-70">{label}</div>
      <div className="mt-1 text-[13px] font-semibold">{value}</div>
    </div>
  );
}

function PotentialMetric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--seller-border)] bg-[rgba(255,255,255,0.05)] px-3 py-2.5">
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">{label}</div>
      <div className="mt-1 text-[14px] font-semibold text-[var(--seller-ink)]">
        {value}
        {suffix ? <span className="ml-1 text-[11px] font-medium text-[var(--seller-subtle)]">{suffix}</span> : null}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  detail,
  compact = false,
}: {
  title: string;
  detail: string;
  compact?: boolean;
}) {
  return (
    <div className={`seller-empty rounded-[22px] border text-center ${compact ? 'px-4 py-6' : 'px-4 py-10'}`}>
      <Gauge size={compact ? 20 : 28} className="mx-auto mb-3 opacity-25" />
      <div className="text-[13px] font-semibold text-[var(--seller-muted)]">{title}</div>
      <p className="mx-auto mt-2 max-w-[42ch] text-[12px] leading-6 text-[var(--seller-subtle)]">{detail}</p>
    </div>
  );
}
