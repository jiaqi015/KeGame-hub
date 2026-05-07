import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GameState, Case, type Opportunity, type RivalListing } from '../../domain/models';
import {
  buildCaseDetailProjection,
  buildOperatingProjection,
  type ProductOpportunityProjection,
} from '../../application/projections/operatingProjection.js';
import { buildOwnerPersonaProfile } from '../../application/projections/ownerPersonaProfile.js';
import { ACTIONS, ACTION_CATEGORIES } from '../../domain/constants';
import { clamp, costText, caseSortValue } from '../../domain/utils';
import { getActiveOpportunities, getActionAvailability } from '../../domain/engine';
import { Star } from 'lucide-react';
import { buildOpportunityViewModels, type OpportunityViewModel } from './caseOpportunityViewModel';
import {
  ActionDecisionOverlay,
  buildActionDecisionConfig,
  type ActionDecisionConfig,
  type ScenarioChoice,
  type ScenarioFeedback,
  type ScenarioResult,
} from './ActionDecisionOverlay';

interface CasesProps {
  state: GameState;
  selectedCaseIdOverride?: string | null;
  onSelectCase: (id: string) => void;
  onExecuteAction: (actionId: string, caseItem: Case, optionId?: string | null) => boolean;
  onCaptureOpportunity: (opportunity: ProductOpportunityProjection) => boolean;
  onExecuteScenarioAction: (
    actionId: string,
    caseItem: Case,
    settlement: ScenarioResult,
    choices: ScenarioChoice[],
    feedbacks: ScenarioFeedback[],
  ) => boolean;
}

type ActionCategoryTab = 'feedback' | 'marketing' | 'pricing' | 'negotiation';
type CaseDetailTab = 'overview' | 'attention' | 'customers' | 'changes' | 'evidence';
type ActionWorkspaceCard = {
  action: typeof ACTIONS[number];
  availability: ReturnType<typeof getActionAvailability>;
  hint: string;
};
type ActionCategoryGroup = {
  category: typeof ACTION_CATEGORIES[number];
  cards: ActionWorkspaceCard[];
  availableCards: ActionWorkspaceCard[];
  blockedCards: ActionWorkspaceCard[];
};
type CaseStageFilter = 'all' | 'pre_visit' | 'packaging' | 'showing' | 'feedback_offer' | 'negotiation' | 'closed';
type CaseQuickFilter = 'focused' | 'urgent' | 'price' | 'late-stage';
type CustomerFilter = 'all' | 'comparing' | 'late';
type SelectedCustomerState = GameState['customerStates'][number];
type AttentionListingRow = {
  id: string;
  targetCaseId?: string;
  title: string;
  sourceLabel: string;
  price: number;
  priceDelta: number;
  priceDeltaLabel: string;
  houseScore: number;
  houseDelta: number;
  houseLabel: string;
  customerOverlap: number;
  overlapLabel: string;
  actualOverlapCount: number;
  heat: number;
  strengthLabel: string;
  detail: string;
};
type PotentialAudienceProfile = {
  demandTitle: string;
  demandDetail: string;
  sizeLabel: string;
  sizeTone: 'slate' | 'amber' | 'emerald' | 'rose';
  shareLabel: string;
  countLine: string;
  priceLine: string;
  evidence: string[];
};
const CASE_STAGE_FILTERS: Array<{ id: CaseStageFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'pre_visit', label: '面访' },
  { id: 'packaging', label: '包装' },
  { id: 'showing', label: '带看' },
  { id: 'feedback_offer', label: '反馈' },
  { id: 'negotiation', label: '谈判' },
  { id: 'closed', label: '结束' },
];

const CASE_QUICK_FILTERS: Array<{ id: CaseQuickFilter; label: string }> = [
  { id: 'focused', label: '聚焦' },
  { id: 'urgent', label: '易丢' },
  { id: 'price', label: '需要反馈' },
  { id: 'late-stage', label: '成交' },
];

type RecommendedActionCardLike = {
  action: { id: string };
  availability: { enabled: boolean };
};

export function resolveRecommendedActionCard<T extends RecommendedActionCardLike>(
  cards: T[],
  primaryActionId?: string | null,
): T | null {
  return cards.find((card) => card.action.id === primaryActionId && card.availability.enabled)
    || cards.find((card) => card.availability.enabled)
    || null;
}

export function Cases({ state, selectedCaseIdOverride, onSelectCase, onExecuteAction, onCaptureOpportunity, onExecuteScenarioAction }: CasesProps) {
  const { cases, selectedCaseId } = state;
  const [stageFilter, setStageFilter] = useState<CaseStageFilter>('all');
  const [quickFilter, setQuickFilter] = useState<CaseQuickFilter | null>(null);
  const sortedCases = [...cases].sort((a, b) => deriveCaseListPriority(state, b) - deriveCaseListPriority(state, a));
  const caseProjectionById = useMemo(
    () => new Map(sortedCases.map((entry) => [entry.id, buildCaseDetailProjection(state, entry)])),
    [sortedCases, state],
  );
  const productOpportunities = useMemo(
    () => buildOperatingProjection(state).productOpportunities,
    [state],
  );
  const listingOpportunityByCaseId = useMemo(
    () => new Map(
      productOpportunities
        .filter((entry) => entry.scope === 'listing' && entry.caseId)
        .map((entry) => [entry.caseId as string, entry]),
    ),
    [productOpportunities],
  );
  const communityOpportunityByCommunity = useMemo(
    () => new Map(
      productOpportunities
        .filter((entry) => entry.scope === 'community')
        .map((entry) => [entry.targetId, entry]),
    ),
    [productOpportunities],
  );
  const visibleCases = sortedCases
    .filter((entry) => matchStageFilter(entry, caseProjectionById.get(entry.id) || null, stageFilter))
    .filter((entry) => matchQuickFilter(state, entry, caseProjectionById.get(entry.id) || null, quickFilter));
  const effectiveSelectedCaseId = selectedCaseIdOverride || selectedCaseId;
  const selectedCase = sortedCases.find((entry) => entry.id === effectiveSelectedCaseId) || visibleCases[0] || sortedCases[0];
  const selectedOwnerProfile = selectedCase ? buildOwnerPersonaProfile(selectedCase) : null;
  const selectionHiddenByFilter = Boolean(selectedCase && !visibleCases.some((entry) => entry.id === selectedCase.id));
  const activeOpportunities = selectedCase ? getActiveOpportunities(state, selectedCase.id) : [];

  const [decisionConfig, setDecisionConfig] = useState<ActionDecisionConfig | null>(null);
  const [activeActionTab, setActiveActionTab] = useState<ActionCategoryTab>('feedback');
  const [activeDetailTab, setActiveDetailTab] = useState<CaseDetailTab>('overview');
  const [blockedActionPanelOpen, setBlockedActionPanelOpen] = useState(false);
  const [activeAttentionListingId, setActiveAttentionListingId] = useState<string | null>(null);
  const [activeCustomerFilter, setActiveCustomerFilter] = useState<CustomerFilter>('all');

  const caseProjection = selectedCase ? caseProjectionById.get(selectedCase.id) || null : null;
  const opportunityModels = useMemo(
    () => buildOpportunityViewModels(state, activeOpportunities),
    [activeOpportunities, state],
  );
  const predictedOpportunities = opportunityModels.filter((model) => model.engagementBand === 'potential');
  const engagedOpportunities = opportunityModels.filter((model) => model.engagementBand !== 'potential');
  const filteredEngagedOpportunities = useMemo(
    () => filterCustomerModels(engagedOpportunities, activeCustomerFilter),
    [activeCustomerFilter, engagedOpportunities],
  );
  const customerStatesForSelectedCase = selectedCase
    ? state.customerStates
        .filter(entry => entry.activeCaseIds.includes(selectedCase.id))
        .sort((a, b) => {
          const aRuntime = a.caseStates[selectedCase.id];
          const bRuntime = b.caseStates[selectedCase.id];
          return ((bRuntime?.stageIndex || 0) * 100 + (bRuntime?.interest || 0) + (bRuntime?.confidence || 0))
            - ((aRuntime?.stageIndex || 0) * 100 + (aRuntime?.interest || 0) + (aRuntime?.confidence || 0));
        })
    : [];
  const comparingCustomers = customerStatesForSelectedCase.filter(entry => entry.status === 'comparing');
  const negotiatingCustomers = customerStatesForSelectedCase.filter(entry => entry.status === 'negotiating');
  const atRiskCustomers = customerStatesForSelectedCase.filter(entry => entry.churnRisk >= 60);
  const potentialSignalRows = useMemo(
    () => buildPotentialSignalRows(predictedOpportunities),
    [predictedOpportunities],
  );
  const potentialAudienceProfile = useMemo(
    () => (selectedCase ? buildPotentialAudienceProfile(state, selectedCase, predictedOpportunities) : null),
    [predictedOpportunities, selectedCase, state],
  );
  const attentionListings = useMemo(
    () => (selectedCase ? buildAttentionListings(state, selectedCase, customerStatesForSelectedCase) : []),
    [customerStatesForSelectedCase, selectedCase, state],
  );
  const activeAttentionListing = attentionListings.find((row) => row.id === activeAttentionListingId) || attentionListings[0] || null;
  const activeAttentionRows = activeAttentionListing ? [activeAttentionListing] : attentionListings;

  useEffect(() => {
    if (attentionListings.length === 0) {
      setActiveAttentionListingId(null);
      return;
    }
    if (!attentionListings.some((row) => row.id === activeAttentionListingId)) {
      setActiveAttentionListingId(attentionListings[0].id);
    }
  }, [activeAttentionListingId, attentionListings]);
  const actionCards: ActionWorkspaceCard[] = selectedCase
    ? [...ACTIONS]
        .map(action => {
          const availability = getActionAvailability(state, selectedCase, action.id);
          return {
            action,
            availability,
            hint: deriveActionHint(action.id, selectedCase, activeOpportunities),
          };
        })
        .sort((a, b) => {
          if (a.availability.enabled !== b.availability.enabled) {
            return Number(b.availability.enabled) - Number(a.availability.enabled);
          }
          return 0;
        })
    : [];
  const actionCardsByCategory: ActionCategoryGroup[] = ACTION_CATEGORIES.map(category => {
    const cards = actionCards.filter(({ action }) => action.categoryId === category.id);
    return {
      category,
      cards,
      availableCards: cards.filter(({ availability }) => availability.enabled),
      blockedCards: cards.filter(({ availability }) => !availability.enabled),
    };
  }).filter(({ cards }) => cards.length > 0);
  const activeActionCategory = actionCardsByCategory.find(({ category }) => category.id === activeActionTab) || actionCardsByCategory[0];
  const availableActionCount = actionCards.filter(({ availability }) => availability.enabled).length;
  const blockedActionCount = actionCards.length - availableActionCount;
  const recommendedActionCard = resolveRecommendedActionCard(
    actionCards,
    caseProjection?.listingLifecyclePhase.primaryActionId,
  );

  useEffect(() => {
    setActiveActionTab('feedback');
    setActiveDetailTab('overview');
    setBlockedActionPanelOpen(false);
  }, [selectedCase?.id]);

  const handleAction = (actionId: string) => {
    if (!selectedCase) return;

    const decision = buildActionDecisionConfig(state, selectedCase, actionId);
    if (decision) {
      setDecisionConfig(decision);
      return;
    }

    onExecuteAction(actionId, selectedCase);
  };

  return (
    <div className="grid min-h-full grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]" data-selling-houses-page="cases">
      <aside className="seller-panel sticky top-0 flex max-h-full flex-col overflow-hidden">
        <div className="z-10 space-y-3 border-b border-[var(--seller-border)] bg-[rgba(15,23,32,0.94)] px-3 pb-3 pt-3 backdrop-blur">
          <div>
            <div className="seller-label">房源筛选</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {CASE_STAGE_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setStageFilter(filter.id)}
                  className={`whitespace-nowrap rounded-full px-1.5 py-[1px] text-[8px] font-semibold leading-4 ${
                    stageFilter === filter.id ? 'bg-[var(--seller-ink)] text-[var(--seller-bg)]' : 'bg-[rgba(255,255,255,0.05)] text-[var(--seller-muted)]'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="seller-label">快捷筛选</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {CASE_QUICK_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setQuickFilter((current) => current === filter.id ? null : filter.id)}
                  className={`rounded-full px-1.5 py-[1px] text-[8px] font-semibold leading-4 ${
                    quickFilter === filter.id ? 'seller-chip-chance' : 'bg-[rgba(255,255,255,0.05)] text-[var(--seller-muted)]'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-1.5 overflow-y-auto p-2.5">
        {visibleCases.map(c => (
          <div
            key={c.id}
            onClick={() => onSelectCase(c.id)}
            className={`relative min-h-[150px] cursor-pointer overflow-hidden rounded-[16px] border px-3 py-3.5 transition-all ${
              c.id === selectedCase?.id
                ? 'border-[color:var(--seller-border-strong)] bg-[rgba(255,255,255,0.055)] shadow-inner'
                : 'border-transparent bg-[rgba(255,255,255,0.02)] hover:border-[var(--seller-border)] hover:bg-[rgba(255,255,255,0.04)]'
            }`}
          >
              {c.isFocused && (
                <div className="absolute right-0 top-0 rounded-bl-xl bg-[var(--seller-accent)] p-1 text-[var(--seller-bg)] shadow-lg">
                  <Star size={10} fill="currentColor" />
                </div>
              )}
            <div className="flex items-start justify-between gap-2">
              <small className="text-[9px] font-medium text-[var(--seller-subtle)]">{c.district}</small>
            </div>
            <strong className="mt-2 block line-clamp-2 text-[14px] font-semibold leading-5 text-[var(--seller-ink)]">{c.title}</strong>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[var(--seller-muted)]">
              <span>{c.community}</span>
              <span className="text-[var(--seller-border-strong)]">/</span>
              <span>{c.layout} · {c.area}㎡</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <CaseCardPrice label="挂牌" value={c.askPrice} strong />
              <CaseCardPrice label="市场" value={c.marketPrice} />
              <CaseCardPrice label="底线" value={c.bottomPrice} />
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <CompactMetric label="业主信任度" val={c.trust} />
              <CompactMetric label="好房分" val={c.competitiveness} />
            </div>
            </div>
        ))}
          {visibleCases.length === 0 && (
            <div className="seller-empty px-4 py-6 text-sm">
              该筛选下暂无房源。
            </div>
          )}
          {selectionHiddenByFilter && selectedCase && (
            <div className="rounded-[16px] border border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)] px-4 py-4 text-[12px] text-[var(--seller-chance)]">
              正在查看 <strong>{selectedCase.title}</strong>，不在当前筛选内。
            </div>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-col">
        {selectedCase ? (
          <div className="min-h-0 flex-1">
            <div className="flex min-h-0 flex-col gap-3">
              <section className="seller-workbench overflow-visible">
                <div className="grid gap-3 border-b border-[var(--seller-border)] px-3.5 py-3 xl:grid-cols-[minmax(0,1fr)_228px]">
                  <div className="grid min-w-0 gap-3 sm:grid-cols-[154px_minmax(0,1fr)]">
                    <ListingHeroImage caseItem={selectedCase} />
                    <div className="min-w-0">
                      <div className="seller-label">单房决策 · 当前房源</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <h2 className="seller-title text-[17px] leading-5">{selectedCase.title}</h2>
                        {selectedCase.isFocused && (
                          <span className="seller-chip seller-chip-accent flex items-center gap-1">
                            <Star size={11} fill="currentColor" />
                            本周聚焦
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--seller-muted)]">
                        <span>{selectedCase.community}</span>
                        <span className="text-[var(--seller-border-strong)]">/</span>
                        <span>{selectedCase.district}</span>
                        <span className="text-[var(--seller-border-strong)]">/</span>
                        <span>{selectedCase.layout} · {selectedCase.area}㎡</span>
                      </div>
                      <div className="mt-3">
                        <div className="seller-label">房源阶段</div>
                        <div className="mt-1 text-[15px] font-semibold leading-5 text-[var(--seller-ink)]">
                          {caseProjection?.listingLifecyclePhase.phaseLabel || selectedCase.stageLabel}
                        </div>
                      </div>
                      <p className="seller-body mt-2 max-w-[72ch] text-[11px] leading-5">
                        已接上 {caseProjection?.customerPoolSummary.metCount ?? customerStatesForSelectedCase.length} 位 · 带看 {selectedCase.viewings} 次 · 报价 {selectedCase.offers} 次
                      </p>
                      {(() => {
                        const listingOpportunity = selectedCase ? listingOpportunityByCaseId.get(selectedCase.id) : null;
                        const communityOpportunity = selectedCase ? communityOpportunityByCommunity.get(selectedCase.community) : null;
                        const visibleOpportunity = (listingOpportunity?.status === 'triggered' || listingOpportunity?.status === 'accepted')
                          ? listingOpportunity
                          : (communityOpportunity?.status === 'triggered' || communityOpportunity?.status === 'accepted')
                            ? communityOpportunity
                            : null;
                        if (!visibleOpportunity) return null;
                        return (
                          <div className="mt-3 rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
                            <div className="text-[12px] font-semibold text-[var(--seller-ink)]">{visibleOpportunity.headline}</div>
                            <p className="mt-1 text-[11px] text-[var(--seller-muted)]">{visibleOpportunity.reasonLabel}</p>
                            <div className="mt-2">
                              <button
                                type="button"
                                className="seller-button-primary rounded-[10px] px-3 py-2 text-[11px]"
                                onClick={() => onCaptureOpportunity(visibleOpportunity)}
                              >
                                {visibleOpportunity.status === 'accepted' ? '查看进展' : visibleOpportunity.primaryActionLabel}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5">
                    <PriceLine label="挂牌价" value={`${selectedCase.askPrice} 万`} strong />
                    <PriceLine label="市场成交位" value={`${selectedCase.marketPrice} 万`} />
                    <PriceLine label="业主底线" value={`${selectedCase.bottomPrice} 万`} tone="floor" />
                  </div>
                </div>

                <div className="grid gap-3 px-3.5 py-3 lg:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
	                  <section className="seller-panel-soft px-3 py-3">
	                    <div className="seller-label">房源诊断</div>
	                    <div className="mt-2 grid gap-1.5">
                      <DiagnosisBriefRow
                        label="阶段"
                        value={caseProjection?.listingLifecyclePhase.phaseLabel || selectedCase.stageLabel}
                        tone={caseProjection?.listingLifecyclePhase.phaseDelayLevel === 'late' ? 'rose' : 'slate'}
                      />
                      <DiagnosisBriefRow
                        label="业主分型"
                        value={selectedOwnerProfile?.label || '未分型'}
                        tone={selectedOwnerProfile?.tone === 'risk' ? 'rose' : selectedOwnerProfile?.tone === 'accent' ? 'emerald' : 'slate'}
                      />
                      <DiagnosisBriefRow
                        label="建议动作"
                        value={caseProjection?.listingLifecyclePhase.primaryActionLabel || deriveNextFix(selectedCase, activeOpportunities)}
                        tone="amber"
                      />
	                    </div>
	                  </section>

	                  <section className="seller-panel-soft relative px-3 py-3">
	                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="seller-label">执行清单 · 当前动作</div>
                        <div className="mt-1 text-[14px] font-semibold leading-5 text-[var(--seller-ink)]">
                          {caseProjection?.listingLifecyclePhase.primaryActionLabel || '补关键一步。'}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-expanded={blockedActionPanelOpen}
                        disabled={blockedActionCount === 0}
                        onClick={() => setBlockedActionPanelOpen((open) => !open)}
                        className="seller-chip seller-chip-accent disabled:cursor-default disabled:opacity-70"
                      >
                        当前可做 {availableActionCount} / {ACTIONS.length} · 暂缓 {blockedActionCount}
                      </button>
	                    </div>

	                    <div className="mt-3 space-y-2">
                      {recommendedActionCard ? (
                        <CompactActionButton
                          card={recommendedActionCard}
                          onExecute={handleAction}
                          index={0}
                        />
                      ) : (
                        <div className="seller-empty px-3 py-4 text-[12px]">这套房眼下还没有能直接执行的动作。</div>
                      )}
	                    </div>

	                    {blockedActionPanelOpen && activeActionCategory ? (
                      <BlockedActionsPopover
                        categories={actionCardsByCategory}
                        activeCategoryId={activeActionCategory.category.id as ActionCategoryTab}
                        onSelectCategory={(categoryId) => setActiveActionTab(categoryId)}
                        onClose={() => setBlockedActionPanelOpen(false)}
                      />
	                    ) : null}
	                  </section>
                </div>
              </section>

              <section className="seller-panel overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-[var(--seller-border)] px-3.5 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="seller-label">明细</div>
                  <div className="seller-tabbar">
                    <button
                      type="button"
                      onClick={() => setActiveDetailTab('overview')}
                      className={`seller-tab ${activeDetailTab === 'overview' ? 'seller-tab-active' : ''}`}
                    >
                      房源和业主
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDetailTab('attention')}
                      className={`seller-tab ${activeDetailTab === 'attention' ? 'seller-tab-active' : ''}`}
                    >
                      竞品PK
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDetailTab('customers')}
                      className={`seller-tab ${activeDetailTab === 'customers' ? 'seller-tab-active' : ''}`}
                    >
                      准客池
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDetailTab('changes')}
                      className={`seller-tab ${activeDetailTab === 'changes' ? 'seller-tab-active' : ''}`}
                    >
                      日志
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDetailTab('evidence')}
                      className={`seller-tab ${activeDetailTab === 'evidence' ? 'seller-tab-active' : ''}`}
                    >
                      风险
                    </button>
                  </div>
                </div>

                <div className="px-3.5 py-3">
	                  {activeDetailTab === 'overview' && (
	                    <div className="grid gap-3 lg:grid-cols-[minmax(0,0.98fr)_minmax(0,1.02fr)]">
                      <DeskSection title="房源状态" count={caseProjection?.listingLifecyclePhase.phaseLabel || selectedCase.stageLabel}>
                        <SummaryPanel
                          title={deriveStrongPoint(selectedCase)}
                          detail={deriveWeakPoint(selectedCase)}
                        />
                        <HouseDimensionPosition caseItem={selectedCase} />
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <ProgressRail label="准客情况" value={selectedCase.d1} tone="chance" />
                          <ProgressRail label="房子条件" value={selectedCase.d2} tone="neutral" />
                          <ProgressRail label="业主配合" value={selectedCase.d3} tone="risk" />
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <InfoStrip label="当前动作" value={deriveNextFix(selectedCase, activeOpportunities)} />
                          <InfoStrip label="价格关系" value={`${selectedCase.askPrice} 万 / 市场 ${selectedCase.marketPrice} 万`} />
                        </div>
                      </DeskSection>

                      <DeskSection title="业主状态" count={selectedOwnerProfile?.label || '业主'}>
                        <SummaryPanel
                          title={caseProjection?.ownerSummary.title || '业主状态稳定'}
                          detail={caseProjection?.ownerSummary.detail || deriveSellerGuidance(selectedCase)}
                          points={[]}
                        />
                        {caseProjection?.ownerSummary.isRevealed ? (
                          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <ProgressRail label="信任" value={caseProjection.ownerSummary.trust} tone="neutral" />
                            <ProgressRail label="耐心" value={caseProjection.ownerSummary.patience} tone="chance" />
                            <ProgressRail label="紧迫" value={caseProjection.ownerSummary.urgency} tone="risk" />
                          </div>
                        ) : (
                          <div className="mt-2">
                            <InfoStrip label="状态" value="首次面访后可见" />
                          </div>
                        )}
                        <div className="mt-2">
                          <InfoStrip label="沟通方式" value={selectedOwnerProfile?.communicationLabel || deriveCommunicationMode(selectedCase)} />
                        </div>
                      </DeskSection>
	                    </div>
	                  )}

                  {activeDetailTab === 'attention' && (
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                      <DeskSection title="竞品列表" count={`${attentionListings.length} 套`}>
                        <div className="mt-2.5 space-y-2">
                          {attentionListings.slice(0, 4).map((row) => (
                            <div key={row.id}>
                              <AttentionListingCard
                                row={row}
                                selected={row.id === activeAttentionListing?.id}
                                onSelect={() => setActiveAttentionListingId(row.id)}
                              />
                            </div>
                          ))}
                          {attentionListings.length === 0 && (
                            <div className="seller-empty px-3 py-4 text-[12px]">暂时没有同类竞品露出，先看本房价格和房况位置。</div>
                          )}
                        </div>
                      </DeskSection>

                      <DeskSection title="PK 详情" count={activeAttentionListing?.strengthLabel || '对比'}>
                        <PkHeader caseItem={selectedCase} row={activeAttentionListing} />
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <ComparisonMetric
                            label="挂牌位置"
                            value={deriveAttentionPriceSummary(selectedCase, activeAttentionRows)}
                            tone={deriveAttentionPriceTone(selectedCase, activeAttentionRows)}
                          />
                          <ComparisonMetric
                            label="房子条件"
                            value={deriveAttentionHouseSummary(selectedCase, activeAttentionRows)}
                            tone={deriveAttentionHouseTone(selectedCase, activeAttentionRows)}
                          />
                          <ComparisonMetric
                            label="客户重合"
                            value={deriveAttentionOverlapSummary(activeAttentionRows)}
                            tone={deriveAttentionOverlapTone(activeAttentionRows)}
                          />
                        </div>
                        <div className="mt-2.5">
                          <AttentionComparisonTable caseItem={selectedCase} row={activeAttentionListing} />
                        </div>
                      </DeskSection>
                    </div>
                  )}

	                  {activeDetailTab === 'customers' && (
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,0.98fr)_minmax(0,1.02fr)]">
                      <DeskSection title="客户情况" count={`${filteredEngagedOpportunities.length}/${engagedOpportunities.length} 位`}>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                          <PoolMetric
                            label="已接上"
                            value={caseProjection?.customerPoolSummary.metCount ?? customerStatesForSelectedCase.length}
                            tone="slate"
                            active={activeCustomerFilter === 'all'}
                            onClick={() => setActiveCustomerFilter('all')}
                          />
                          <PoolMetric
                            label="比较中"
                            value={caseProjection?.customerPoolSummary.comparingCount ?? comparingCustomers.length}
                            tone="amber"
                            active={activeCustomerFilter === 'comparing'}
                            onClick={() => setActiveCustomerFilter('comparing')}
                          />
                          <PoolMetric
                            label="后段 / 风险"
                            value={(caseProjection?.customerPoolSummary.closingCount ?? negotiatingCustomers.length) + (caseProjection?.customerPoolSummary.atRiskCount ?? atRiskCustomers.length)}
                            tone="rose"
                            active={activeCustomerFilter === 'late'}
                            onClick={() => setActiveCustomerFilter('late')}
                          />
                        </div>

                        <div className="mt-2.5 divide-y divide-[color:var(--seller-border)]">
                          {filteredEngagedOpportunities.slice(0, 4).map((model) => (
                            <div key={model.opportunity.id}>
                              <OpportunityLine model={model} />
                            </div>
                          ))}
                          {filteredEngagedOpportunities.length === 0 && (
                            <div className="seller-empty px-3 py-4 text-[12px]">当前筛选下没有客户。</div>
                          )}
                        </div>
                      </DeskSection>

                      <DeskSection title="潜在客群画像" count={potentialAudienceProfile?.sizeLabel || '待估'}>
                        {potentialAudienceProfile && (
                          <PotentialAudiencePanel profile={potentialAudienceProfile} />
                        )}
                        {potentialSignalRows.length > 0 && (
                          <div className="mt-2.5 space-y-1.5">
                            {potentialSignalRows.slice(0, 4).map((row) => (
                              <div key={row.id}>
                                <PotentialSignalLine row={row} />
                              </div>
                            ))}
                          </div>
                        )}
                      </DeskSection>
                    </div>
                  )}

                  {activeDetailTab === 'changes' && (
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                      <DeskSection title="日志" count={`${caseProjection?.recentChanges.length || 0} 条`}>
                        <div className="space-y-1.5">
                          {caseProjection?.recentChanges.slice(0, 5).map((change) => (
                            <div key={change.id}>
                              <RecentChangeLine change={change} />
                            </div>
                          ))}
                          {!caseProjection || caseProjection.recentChanges.length === 0 ? (
                            <div className="seller-empty px-3 py-3 text-[11px]">最近没有明显变化。</div>
                          ) : null}
                        </div>
                      </DeskSection>
                    </div>
                  )}

                  {activeDetailTab === 'evidence' && (
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                      <DeskSection title="风险" count={`${caseProjection?.factChain.length || 0} 条`}>
                        <div className="space-y-1.5">
                          {caseProjection?.factChain.slice(0, 6).map((fact) => (
                            <div key={fact.id}>
                              <FactLine fact={fact} />
                            </div>
                          ))}
                          {!caseProjection || caseProjection.factChain.length === 0 ? (
                            <div className="seller-empty px-3 py-3 text-[11px]">目前没有明显风险。</div>
                          ) : null}
                        </div>
                      </DeskSection>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[var(--seller-subtle)] italic">选择一个房源开始经营</div>
        )}
      </main>

      {decisionConfig && (
        <ActionDecisionOverlay
          config={decisionConfig}
          onChoose={(optionId) => {
            if (!decisionConfig.isScenario) {
              onExecuteAction(decisionConfig.actionId, selectedCase, optionId);
              setDecisionConfig(null);
            }
          }}
          onComplete={(result, choices, feedbacks) => {
            onExecuteScenarioAction(decisionConfig.actionId, selectedCase, result, choices, feedbacks);
            setDecisionConfig(null);
          }}
          onClose={() => setDecisionConfig(null)}
          state={state}
          caseItem={selectedCase || undefined}
        />
      )}
    </div>
  );
}

function CompactMetric({ label, val }: { label: string; val: number }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex justify-between text-[9px] font-bold tracking-[0.04em] text-[var(--seller-subtle)]">
        <span>{label}</span>
        <span>{Math.round(val)}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.07)]">
        <div className="h-full bg-[var(--seller-accent)]" style={{ width: `${val}%` }} />
      </div>
    </div>
  );
}

function ListingHeroImage({ caseItem }: { caseItem: Case }) {
  const tone = caseItem.d2 >= 70 ? 'good' : caseItem.d1 < 45 || caseItem.d3 < 48 ? 'risk' : 'normal';
  const toneClass = tone === 'good'
    ? 'from-emerald-500/24 via-cyan-500/12 to-white/[0.03]'
    : tone === 'risk'
      ? 'from-amber-500/18 via-rose-500/10 to-white/[0.03]'
      : 'from-cyan-500/18 via-slate-500/10 to-white/[0.03]';
  const bedroomLabel = caseItem.layout.includes('3室') ? '三房' : caseItem.layout.includes('1室') ? '一房' : '两房';

  return (
    <div className="relative min-h-[164px] overflow-hidden rounded-[18px] border border-[var(--seller-border)] bg-[#101822] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className={`absolute inset-0 bg-gradient-to-br ${toneClass}`} />
      <div className="absolute inset-x-0 top-0 h-16 bg-[radial-gradient(circle_at_28%_12%,rgba(255,255,255,0.20),transparent_24%),radial-gradient(circle_at_82%_20%,rgba(73,221,133,0.16),transparent_24%)]" />
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-[linear-gradient(180deg,transparent,rgba(5,9,14,0.78))]" />

      <svg
        viewBox="0 0 172 156"
        role="img"
        aria-label={`${caseItem.community}${bedroomLabel}模拟3D户型图`}
        className="absolute inset-x-1 top-7 h-[118px] w-[calc(100%-0.5rem)] overflow-visible"
      >
        <defs>
          <linearGradient id={`floor-fill-${caseItem.id}`} x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(118,221,255,0.20)" />
            <stop offset="100%" stopColor="rgba(73,221,133,0.15)" />
          </linearGradient>
          <filter id={`plan-shadow-${caseItem.id}`} x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="12" stdDeviation="7" floodColor="rgba(0,0,0,0.42)" />
          </filter>
        </defs>
        <g transform="translate(10 18) rotate(-8 76 62)" filter={`url(#plan-shadow-${caseItem.id})`}>
          <polygon points="18,34 136,34 146,44 28,44" fill="rgba(255,255,255,0.10)" />
          <polygon points="136,34 146,44 146,123 136,113" fill="rgba(7,13,21,0.74)" />
          <polygon points="28,113 146,123 136,113 18,103" fill="rgba(5,9,14,0.78)" />
          <rect x="18" y="34" width="118" height="79" rx="4" fill={`url(#floor-fill-${caseItem.id})`} stroke="rgba(255,255,255,0.34)" strokeWidth="3" />
          <rect x="22" y="38" width="34" height="34" rx="2" fill="rgba(23,38,54,0.92)" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
          <rect x="22" y="72" width="34" height="37" rx="2" fill="rgba(19,34,50,0.92)" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
          <rect x="56" y="38" width="76" height="44" rx="2" fill="rgba(17,55,57,0.82)" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
          <rect x="56" y="82" width="35" height="27" rx="2" fill="rgba(36,49,41,0.9)" stroke="rgba(255,255,255,0.24)" strokeWidth="2" />
          <rect x="91" y="82" width="18" height="27" rx="2" fill="rgba(34,42,56,0.94)" stroke="rgba(255,255,255,0.24)" strokeWidth="2" />
          <rect x="109" y="82" width="23" height="27" rx="2" fill="rgba(28,47,58,0.86)" stroke="rgba(102,209,224,0.34)" strokeWidth="2" />
          <path d="M56 61 Q69 61 69 48" fill="none" stroke="rgba(255,255,255,0.26)" strokeWidth="1.5" />
          <path d="M56 94 Q66 94 66 84" fill="none" stroke="rgba(255,255,255,0.24)" strokeWidth="1.5" />
          <path d="M91 96 Q99 96 99 88" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
          <line x1="72" y1="36" x2="122" y2="36" stroke="rgba(102,209,224,0.72)" strokeWidth="2" strokeLinecap="round" />
          <line x1="22" y1="49" x2="22" y2="62" stroke="rgba(73,221,133,0.70)" strokeWidth="2" strokeLinecap="round" />
          <line x1="22" y1="84" x2="22" y2="99" stroke="rgba(73,221,133,0.60)" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}

function HouseDimensionPosition({ caseItem }: { caseItem: Case }) {
  const [yawDeg, setYawDeg] = useState(26);
  const [pitchDeg, setPitchDeg] = useState(-18);
  const dragStartRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const lead = clampScore(caseItem.d1) / 100;
  const house = clampScore(caseItem.d2) / 100;
  const owner = clampScore(caseItem.d3) / 100;
  const origin = { x: 30, y: 112 };
  const leadAxis = projectDimensionAxis({ x: 1, y: 0, z: 0 }, yawDeg, pitchDeg, 104);
  const houseAxis = projectDimensionAxis({ x: 0, y: 1, z: 0 }, yawDeg, pitchDeg, 80);
  const ownerAxis = projectDimensionAxis({ x: 0, y: 0, z: -1 }, yawDeg, pitchDeg, 68);
  const point = {
    x: origin.x + leadAxis.x * lead + houseAxis.x * house + ownerAxis.x * owner,
    y: origin.y + leadAxis.y * lead + houseAxis.y * house + ownerAxis.y * owner,
  };
  const floorA = `${origin.x},${origin.y}`;
  const floorB = `${origin.x + leadAxis.x},${origin.y + leadAxis.y}`;
  const floorC = `${origin.x + leadAxis.x + ownerAxis.x},${origin.y + leadAxis.y + ownerAxis.y}`;
  const floorD = `${origin.x + ownerAxis.x},${origin.y + ownerAxis.y}`;
  const topA = `${origin.x + houseAxis.x},${origin.y + houseAxis.y}`;
  const topB = `${origin.x + leadAxis.x + houseAxis.x},${origin.y + leadAxis.y + houseAxis.y}`;
  const topC = `${origin.x + leadAxis.x + ownerAxis.x + houseAxis.x},${origin.y + leadAxis.y + ownerAxis.y + houseAxis.y}`;
  const topD = `${origin.x + ownerAxis.x + houseAxis.x},${origin.y + ownerAxis.y + houseAxis.y}`;
  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { x: event.clientX, y: event.clientY, yaw: yawDeg, pitch: pitchDeg };
  };
  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const dragStart = dragStartRef.current;
    if (!dragStart) return;
    const deltaX = event.clientX - dragStart.x;
    const deltaY = event.clientY - dragStart.y;
    setYawDeg(clamp(dragStart.yaw + deltaX * 0.38, -62, 62));
    setPitchDeg(clamp(dragStart.pitch - deltaY * 0.22, -42, 26));
  };
  const handlePointerEnd = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStartRef.current = null;
  };

  return (
    <div className="mt-2 overflow-hidden rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="seller-label text-[9px]">三维评价位置</div>
          <div className="mt-0.5 text-[11px] font-semibold text-[var(--seller-ink)]">{buildDimensionPositionLabel(caseItem)}</div>
        </div>
        <span className="seller-chip">好房分 {Math.round(caseItem.competitiveness)}</span>
      </div>
      <div className="rounded-[12px] bg-[rgba(255,255,255,0.018)] px-2 py-2">
        <svg
          viewBox="0 0 210 146"
          role="img"
          aria-label="准客情况、房子条件、业主配合三维坐标"
          className="h-[190px] w-full cursor-grab touch-none select-none overflow-visible active:cursor-grabbing md:h-[220px]"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <polygon points={`${floorA} ${floorB} ${floorC} ${floorD}`} fill="rgba(73,221,133,0.06)" stroke="rgba(255,255,255,0.12)" />
          <polygon points={`${topA} ${topB} ${topC} ${topD}`} fill="rgba(102,209,224,0.06)" stroke="rgba(255,255,255,0.10)" />
          <polygon points={`${floorB} ${floorC} ${topC} ${topB}`} fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.08)" />
          <polygon points={`${floorD} ${floorC} ${topC} ${topD}`} fill="rgba(255,255,255,0.018)" stroke="rgba(255,255,255,0.08)" />
          {[0.25, 0.5, 0.75].map((step) => {
            const baseX = origin.x + leadAxis.x * step;
            const baseY = origin.y + leadAxis.y * step;
            return (
              <line
                key={`lead-grid-${step}`}
                x1={baseX}
                y1={baseY}
                x2={baseX + ownerAxis.x}
                y2={baseY + ownerAxis.y}
                stroke="rgba(255,255,255,0.08)"
              />
            );
          })}
          {[0.25, 0.5, 0.75].map((step) => {
            const baseX = origin.x + ownerAxis.x * step;
            const baseY = origin.y + ownerAxis.y * step;
            return (
              <line
                key={`owner-grid-${step}`}
                x1={baseX}
                y1={baseY}
                x2={baseX + leadAxis.x}
                y2={baseY + leadAxis.y}
                stroke="rgba(255,255,255,0.08)"
              />
            );
          })}
          <line x1={origin.x} y1={origin.y} x2={origin.x + leadAxis.x} y2={origin.y + leadAxis.y} stroke="rgba(73,221,133,0.76)" strokeWidth="2" />
          <line x1={origin.x} y1={origin.y} x2={origin.x + houseAxis.x} y2={origin.y + houseAxis.y} stroke="rgba(102,209,224,0.78)" strokeWidth="2" />
          <line x1={origin.x} y1={origin.y} x2={origin.x + ownerAxis.x} y2={origin.y + ownerAxis.y} stroke="rgba(255,107,129,0.72)" strokeWidth="2" />
          <line x1={point.x} y1={point.y} x2={point.x} y2={origin.y + leadAxis.y * lead + ownerAxis.y * owner} stroke="rgba(255,255,255,0.18)" strokeDasharray="4 4" />
          <circle cx={point.x} cy={point.y} r="7" fill="#49dd85" stroke="rgba(255,255,255,0.9)" strokeWidth="2" />
          <circle cx={point.x} cy={point.y} r="14" fill="rgba(73,221,133,0.12)" />
          <text x={origin.x + leadAxis.x + 5} y={origin.y + leadAxis.y + 2} fill="rgba(73,221,133,0.9)" fontSize="10" fontWeight="700">准客</text>
          <text x={origin.x - 8} y={origin.y + houseAxis.y - 6} fill="rgba(102,209,224,0.9)" fontSize="10" fontWeight="700">房子</text>
          <text x={origin.x + ownerAxis.x + 5} y={origin.y + ownerAxis.y + 4} fill="rgba(255,107,129,0.9)" fontSize="10" fontWeight="700">业主</text>
        </svg>
      </div>
    </div>
  );
}

function projectDimensionAxis(
  axis: { x: number; y: number; z: number },
  yawDeg: number,
  pitchDeg: number,
  length: number,
) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);

  const rotatedX = axis.x * cosYaw + axis.z * sinYaw;
  const rotatedZ = -axis.x * sinYaw + axis.z * cosYaw;
  const rotatedY = axis.y * cosPitch - rotatedZ * sinPitch;

  return {
    x: rotatedX * length,
    y: -rotatedY * length,
  };
}

function DiagnosisBriefRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'slate' | 'amber' | 'emerald' | 'rose';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-[color:var(--seller-accent)]/24 bg-[var(--seller-accent-soft)]'
      : tone === 'amber'
        ? 'border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)]'
        : tone === 'rose'
          ? 'border-[color:var(--seller-risk)]/24 bg-[var(--seller-risk-soft)]'
          : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)]';

  return (
    <div className={`grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 rounded-[12px] border px-3 py-2.5 ${toneClass}`}>
      <div className="seller-label text-[9px]">{label}</div>
      <div className="truncate text-[12px] font-semibold leading-5 text-[var(--seller-ink)]" title={value}>
        {value}
      </div>
    </div>
  );
}

function PoolMetric({
  label,
  value,
  tone,
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  tone: 'slate' | 'emerald' | 'amber' | 'rose';
  active?: boolean;
  onClick?: () => void;
}) {
  const toneClass = tone === 'emerald'
    ? 'border-[color:var(--seller-accent)]/24 bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]'
    : tone === 'amber'
      ? 'border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)] text-[var(--seller-chance)]'
      : tone === 'rose'
        ? 'border-[color:var(--seller-risk)]/24 bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]'
        : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] text-[var(--seller-ink)]';
  const activeClass = active ? 'ring-1 ring-[var(--seller-chance)]' : '';
  const content = (
    <>
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-70">{label}</div>
      <div className="mt-1 text-[17px] font-semibold">{value}</div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`rounded-xl border px-3 py-2.5 text-left transition hover:border-[var(--seller-chance)] ${toneClass} ${activeClass}`}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${toneClass} ${activeClass}`}>
      {content}
    </div>
  );
}

function SummaryPanel({
  title,
  detail,
  points,
}: {
  title: string;
  detail: string;
  points?: string[];
}) {
  const pointList = points || [];
  return (
    <div className="seller-tablet px-3 py-2.5">
      <div className="text-[12px] font-semibold leading-5 text-[var(--seller-ink)]">{title}</div>
      <p className="seller-body mt-1 text-[11px] leading-5">{detail}</p>
      {pointList.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {pointList.map((point) => (
            <span key={`${title}-${point}`} className="seller-chip">
              {point}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressRail({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'chance' | 'risk' }) {
  const colorClass = tone === 'chance' ? 'bg-[var(--seller-chance)]' : tone === 'risk' ? 'bg-[var(--seller-risk)]' : 'bg-[var(--seller-accent)]';
  const scoreBand = formatScoreBand(value);

  return (
    <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between">
        <div className="seller-label text-[9px]">{label}</div>
        <div className="text-[10px] font-semibold text-[var(--seller-muted)]">{scoreBand}</div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.07)]">
        <div className={`h-full ${colorClass}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function formatScoreBand(value: number) {
  if (value >= 70) return '高';
  if (value >= 45) return '中';
  return '低';
}

function buildDimensionPositionLabel(caseItem: Case) {
  const strongest = [
    { label: '准客更强', value: caseItem.d1 },
    { label: '房子更强', value: caseItem.d2 },
    { label: '业主更配合', value: caseItem.d3 },
  ].sort((left, right) => right.value - left.value)[0];
  const weakest = [
    { label: '准客偏薄', value: caseItem.d1 },
    { label: '房子条件弱', value: caseItem.d2 },
    { label: '业主配合弱', value: caseItem.d3 },
  ].sort((left, right) => left.value - right.value)[0];
  if (strongest.value - weakest.value < 12) return '三项比较均衡';
  return `${strongest.label}，${weakest.label}`;
}

function InfoStrip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
      <div className="seller-label text-[9px]">{label}</div>
      <div className="mt-1 text-[11px] font-semibold leading-5 text-[var(--seller-ink)]">{value}</div>
    </div>
  );
}

function PkHeader({ caseItem, row }: { caseItem: Case; row: AttentionListingRow | null }) {
  return (
    <div className="mb-2.5 rounded-[16px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
        <div className="min-w-0 rounded-[12px] bg-[var(--seller-accent-soft)] px-3 py-2.5">
          <div className="seller-label">本房</div>
          <div className="mt-1 truncate text-[13px] font-semibold text-[var(--seller-ink)]">{caseItem.title}</div>
          <div className="mt-0.5 text-[10px] text-[var(--seller-muted)]">{caseItem.askPrice} 万 · {formatScoreBand(caseItem.d2)}</div>
        </div>
        <div className="hidden text-[10px] font-bold text-[var(--seller-subtle)] sm:block">PK</div>
        <div className="min-w-0 rounded-[12px] bg-[rgba(102,209,224,0.08)] px-3 py-2.5">
          <div className="seller-label">竞品</div>
          <div className="mt-1 truncate text-[13px] font-semibold text-[var(--seller-ink)]">{row?.title || '暂无竞品'}</div>
          <div className="mt-0.5 text-[10px] text-[var(--seller-muted)]">{row ? `${row.price} 万 · ${row.houseLabel}` : '等待市场露出'}</div>
        </div>
      </div>
    </div>
  );
}

function AttentionListingCard({
  row,
  selected,
  onSelect,
}: {
  row: AttentionListingRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    onSelect();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      aria-pressed={selected}
      className={`cursor-pointer rounded-[14px] border px-3 py-3 transition ${
        selected
          ? 'border-[color:var(--seller-chance)] bg-[rgba(102,209,224,0.11)] shadow-[inset_0_0_0_1px_rgba(102,209,224,0.12)]'
          : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] hover:border-[var(--seller-accent)] hover:bg-[rgba(73,221,133,0.07)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="seller-chip">{row.sourceLabel}</span>
            <span className="seller-chip seller-chip-accent">{selected ? '对比中' : '看对比'}</span>
          </div>
          <div className="mt-2 text-[13px] font-semibold leading-5 text-[var(--seller-ink)]">{row.title}</div>
          <p className="seller-body mt-1 text-[11px] leading-5">{row.detail}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[15px] font-semibold text-[var(--seller-ink)]">{row.price} 万</div>
          <div className={`mt-1 text-[10px] font-semibold ${row.priceDelta < 0 ? 'text-[var(--seller-risk)]' : row.priceDelta > 0 ? 'text-[var(--seller-accent)]' : 'text-[var(--seller-muted)]'}`}>
            {row.priceDeltaLabel}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <MiniCompareCell label="房子条件" value={row.houseLabel} />
        <MiniCompareCell label="价差" value={row.priceDeltaLabel} />
        <MiniCompareCell label="重合" value={`${row.customerOverlap}%`} />
      </div>
    </div>
  );
}

function ComparisonMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'slate' | 'amber' | 'emerald' | 'rose';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-[color:var(--seller-accent)]/24 bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]'
      : tone === 'amber'
        ? 'border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)] text-[var(--seller-chance)]'
        : tone === 'rose'
          ? 'border-[color:var(--seller-risk)]/24 bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]'
          : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] text-[var(--seller-ink)]';

  return (
    <div className={`rounded-[12px] border px-3 py-2.5 ${toneClass}`}>
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-70">{label}</div>
      <div className="mt-1 text-[12px] font-semibold leading-5">{value}</div>
    </div>
  );
}

function AttentionComparisonTable({ caseItem, row }: { caseItem: Case; row: AttentionListingRow | null }) {
  const rows = [
    { label: '挂牌价', mine: `${caseItem.askPrice} 万`, rival: row ? `${row.price} 万` : '暂无竞品' },
    { label: '房子条件', mine: formatScoreBand(caseItem.d2), rival: row ? row.houseLabel : '—' },
    { label: '准客重合', mine: '本房准客', rival: row ? row.overlapLabel : '—' },
    { label: '吸客强度', mine: formatScoreBand(caseItem.heat), rival: row ? formatScoreBand(row.heat) : '—' },
  ];

  return (
    <div className="overflow-hidden rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)]">
      <div className="grid grid-cols-[0.8fr_1fr_1fr] border-b border-[var(--seller-border)] px-3 py-2 text-[10px] font-bold text-[var(--seller-subtle)]">
        <span>对比项</span>
        <span>本房</span>
        <span>{row ? '最强竞品' : '竞品'}</span>
      </div>
      {rows.map((item) => (
        <div key={item.label} className="grid grid-cols-[0.8fr_1fr_1fr] border-b border-[var(--seller-border)] px-3 py-2 text-[11px] last:border-b-0">
          <span className="text-[var(--seller-subtle)]">{item.label}</span>
          <span className="font-semibold text-[var(--seller-ink)]">{item.mine}</span>
          <span className="font-semibold text-[var(--seller-muted)]">{item.rival}</span>
        </div>
      ))}
    </div>
  );
}

function MiniCompareCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-2 py-1.5">
      <div className="text-[8px] font-bold tracking-[0.08em] text-[var(--seller-subtle)]">{label}</div>
      <div className="mt-0.5 truncate text-[11px] font-semibold text-[var(--seller-ink)]">{value}</div>
    </div>
  );
}

function DeskSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="seller-panel min-h-0 px-3.5 py-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="seller-label">{title}</div>
        {count && <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function PriceLine({
  label,
  value,
  strong = false,
  tone = 'default',
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'default' | 'floor';
}) {
  const toneClass = strong
    ? 'border-[color:var(--seller-accent)]/28 bg-[var(--seller-accent-soft)]'
    : tone === 'floor'
      ? 'border-[color:var(--seller-chance)]/24 bg-[rgba(245,158,11,0.10)]'
      : 'border-[color:var(--seller-border)] bg-[rgba(255,255,255,0.03)]';
  const valueClass = strong
    ? 'text-[18px] text-[var(--seller-accent)]'
    : tone === 'floor'
      ? 'text-[13px] text-[var(--seller-chance)]'
      : 'text-[13px] text-[var(--seller-ink)]';

  return (
    <div className={`rounded-[12px] border px-3 py-2.5 ${toneClass}`}>
      <div className="seller-label text-[9px]">{label}</div>
      <div className={`mt-1 ${valueClass} font-semibold`}>{value}</div>
    </div>
  );
}

function CaseCardPrice({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`rounded-[10px] border px-2 py-1.5 ${strong ? 'border-[color:var(--seller-accent)]/24 bg-[var(--seller-accent-soft)]' : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)]'}`}>
      <div className="text-[8px] font-bold tracking-[0.08em] text-[var(--seller-subtle)]">{label}</div>
      <div className={`mt-0.5 text-[11px] font-semibold ${strong ? 'text-[var(--seller-accent)]' : 'text-[var(--seller-ink)]'}`}>{Math.round(value)} 万</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'slate' | 'amber' | 'emerald' | 'rose';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-[var(--seller-accent-soft)] text-[var(--seller-accent)] border-[color:var(--seller-accent)]/24'
      : tone === 'amber'
        ? 'bg-[var(--seller-chance-soft)] text-[var(--seller-chance)] border-[color:var(--seller-chance)]/22'
        : tone === 'rose'
          ? 'bg-[var(--seller-risk-soft)] text-[var(--seller-risk)] border-[color:var(--seller-risk)]/24'
          : 'bg-[rgba(255,255,255,0.03)] text-[var(--seller-muted)] border-[var(--seller-border)]';

  return (
    <div className={`rounded-[12px] border px-3 py-2 ${toneClass}`}>
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] opacity-70">{label}</div>
      <div className="mt-1 text-[12px] font-semibold leading-5">{value}</div>
    </div>
  );
}

function FactLine({
  fact,
}: {
  fact: { title: string; fact: string; nextStep: string; tone: 'risk' | 'chance' | 'neutral' };
}) {
  const toneClass = fact.tone === 'risk'
    ? 'seller-chip-risk'
    : fact.tone === 'chance'
      ? 'seller-chip-chance'
      : 'seller-chip';

  return (
    <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-[var(--seller-ink)]">{fact.title}</div>
          <p className="seller-body mt-0.5 text-[11px] leading-5">{fact.fact}</p>
          <p className="mt-1 text-[11px] font-semibold leading-5 text-[var(--seller-ink)]">当前动作：{fact.nextStep}</p>
        </div>
        <span className={toneClass}>
          {fact.tone === 'risk' ? '风险' : fact.tone === 'chance' ? '机会' : '平稳'}
        </span>
      </div>
    </div>
  );
}

function RecentChangeLine({
  change,
}: {
  change: { label: string; title: string; detail: string; tone: 'risk' | 'chance' | 'neutral' };
}) {
  const toneClass = change.tone === 'risk'
    ? 'bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]'
    : change.tone === 'chance'
      ? 'bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]'
      : 'bg-[rgba(255,255,255,0.05)] text-[var(--seller-muted)]';

  return (
    <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--seller-subtle)]">{change.label}</div>
          <div className="mt-0.5 text-[12px] font-semibold text-[var(--seller-ink)]">{change.title}</div>
          <p className="seller-body mt-0.5 line-clamp-2 text-[11px] leading-5">{change.detail}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${toneClass}`}>
          {change.tone === 'risk' ? '风险' : change.tone === 'chance' ? '机会' : '平稳'}
        </span>
      </div>
    </div>
  );
}

function OpportunityLine({ model }: { model: OpportunityViewModel }) {
  return (
    <div className="py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-[var(--seller-ink)]">
            {model.customer?.name || model.opportunity.customerName}
          </div>
          <p className="mt-0.5 text-[10px] text-[var(--seller-subtle)]">
            {model.profileLine}
          </p>
          <p className="seller-body mt-1 line-clamp-2 text-[11px] leading-5">{model.opportunityStatusDetail}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-[9px] font-bold text-[var(--seller-muted)]">
            {model.opportunity.stageLabel}
          </span>
          <div className="mt-1 text-[10px] text-[var(--seller-subtle)]">{model.urgencyLabel}</div>
        </div>
      </div>
    </div>
  );
}

function PotentialSignalLine({
  row,
}: {
  row: { title: string; detail: string; count: number; budgetLine: string; urgency: string };
}) {
  return (
    <div className="rounded-[12px] border border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)] px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-[var(--seller-ink)]">{row.title}</div>
          <p className="seller-body mt-0.5 line-clamp-2 text-[11px] leading-5">{row.detail}</p>
          <div className="mt-1 text-[10px] text-[var(--seller-muted)]">{row.budgetLine}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] font-semibold text-[var(--seller-chance)]">{row.count} 组</div>
          <div className="mt-1 text-[10px] text-[var(--seller-subtle)]">{row.urgency}</div>
        </div>
      </div>
    </div>
  );
}

function PotentialAudiencePanel({ profile }: { profile: PotentialAudienceProfile }) {
  return (
    <div className="rounded-[16px] border border-[color:var(--seller-chance)]/24 bg-[rgba(102,209,224,0.075)] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="seller-label">需求画像</div>
          <div className="mt-1 text-[13px] font-semibold leading-5 text-[var(--seller-ink)]">{profile.demandTitle}</div>
          <p className="seller-body mt-1 text-[11px] leading-5">{profile.demandDetail}</p>
        </div>
        <span className={`seller-chip ${profile.sizeTone === 'emerald' ? 'seller-chip-accent' : profile.sizeTone === 'rose' ? 'seller-chip-risk' : profile.sizeTone === 'amber' ? 'seller-chip-chance' : ''}`}>
          {profile.sizeLabel}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
        <MiniCompareCell label="规模预估" value={profile.shareLabel} />
        <MiniCompareCell label="客户关系" value={profile.countLine} />
        <MiniCompareCell label="价格带" value={profile.priceLine} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {profile.evidence.map((item) => (
          <span key={item} className="seller-chip">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function CompactActionButton({
  card,
  onExecute,
  index,
}: {
  card: ActionWorkspaceCard;
  onExecute: (actionId: string) => void;
  index?: number;
}) {
  const { action, hint, availability } = card;
  const primary = index === 0;
  const disabled = !availability.enabled;

  return (
    <button
      type="button"
      onClick={() => {
        if (!disabled) onExecute(action.id);
      }}
      disabled={disabled}
      className={`w-full rounded-[12px] border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        primary
          ? 'border-[color:var(--seller-accent)]/38 bg-[var(--seller-accent-soft)] hover:border-[color:var(--seller-accent)]/56 disabled:hover:border-[color:var(--seller-accent)]/38'
          : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] hover:border-[var(--seller-border-strong)] hover:bg-[rgba(255,255,255,0.05)] disabled:hover:border-[var(--seller-border)] disabled:hover:bg-[rgba(255,255,255,0.03)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-[12px] font-semibold ${primary ? 'text-[var(--seller-accent)]' : 'text-[var(--seller-ink)]'}`}>{action.name}</div>
          <p className="seller-body mt-0.5 line-clamp-2 text-[11px] leading-5">{disabled ? availability.reason : hint}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${primary ? 'bg-[var(--seller-accent)] text-[var(--seller-bg)]' : 'bg-[rgba(255,255,255,0.06)] text-[var(--seller-muted)]'}`}>
          {costText(action)}
        </span>
      </div>
    </button>
  );
}

function BlockedActionsPopover({
  categories,
  activeCategoryId,
  onSelectCategory,
  onClose,
}: {
  categories: ActionCategoryGroup[];
  activeCategoryId: ActionCategoryTab;
  onSelectCategory: (categoryId: ActionCategoryTab) => void;
  onClose: () => void;
}) {
  const activeCategory = categories.find(({ category }) => category.id === activeCategoryId) || categories[0];
  const blockedCards = activeCategory?.blockedCards || [];

  return (
    <div className="absolute right-3 top-[52px] z-30 w-[min(360px,calc(100%-24px))] rounded-[14px] border border-[var(--seller-border-strong)] bg-[rgba(14,22,31,0.98)] p-3 shadow-[0_18px_48px_rgba(0,0,0,0.42)] backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <div className="seller-label">暂缓动作</div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-[var(--seller-border)] px-2 py-0.5 text-[9px] font-bold text-[var(--seller-muted)] hover:text-[var(--seller-ink)]"
        >
          收起
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {categories.map(({ category, blockedCards: categoryBlockedCards }) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelectCategory(category.id as ActionCategoryTab)}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold leading-4 transition-colors ${
              activeCategory?.category.id === category.id
                ? 'bg-[var(--seller-ink)] text-[var(--seller-bg)]'
                : 'bg-[rgba(255,255,255,0.05)] text-[var(--seller-muted)] hover:bg-[rgba(255,255,255,0.08)]'
            }`}
          >
            <span>{category.name}</span>
            <span className={activeCategory?.category.id === category.id ? 'opacity-70' : 'text-[var(--seller-subtle)]'}>
              {categoryBlockedCards.length}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-2 max-h-[220px] space-y-2 overflow-y-auto pr-1">
        {blockedCards.map((card) => (
          <div key={card.action.id}>
            <BlockedActionLine card={card} />
          </div>
        ))}
        {blockedCards.length === 0 && (
          <div className="seller-empty px-3 py-4 text-[12px]">这一类动作目前没有明显阻塞。</div>
        )}
      </div>
    </div>
  );
}

function BlockedActionLine({
  card,
}: {
  card: ActionWorkspaceCard;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-[var(--seller-muted)]">{card.action.name}</div>
          <p className="seller-body mt-0.5 text-[11px] leading-5">{card.availability.reason || '条件不足。'}</p>
        </div>
        <span className="seller-chip seller-chip-risk">暂缓</span>
      </div>
    </div>
  );
}

function deriveActionHint(actionId: string, caseItem: Case, opportunities: Opportunity[]) {
  if (actionId === 'first-visit') return !caseItem.hasCompletedFirstVisit ? '未完成首次面访。' : '首次面访已完成。';
  if (actionId === 'weekly-feedback') return caseItem.trust < 60 ? '业主关系已经有点发紧。'
    : '业主关系还稳。';
  if (actionId === 'deep-diagnosis') return opportunities.some(o => o.visibility === 'shadow') ? `还有 ${opportunities.filter(o => o.visibility === 'shadow').length} 位客户没核实。`
    : '重点看价格和带看反馈。';
  if (actionId === 'story') return caseItem.d2 < 70 ? '房子卖点还没讲透。'
    : '房子卖点基础不错。';
  if (actionId === 'pricing-advice') return `挂牌 ${caseItem.askPrice} 万，对比市场常见成交价 ${caseItem.marketPrice} 万。`;
  if (actionId === 'ask-psychological-price') return `底价 ${caseItem.bottomPrice} 万，业主心理价还没说透。`;
  if (actionId === 'adjust-listing-price') return caseItem.askPrice > caseItem.marketPrice * 1.03 ? '挂牌价明显高于市场常见成交价。'
    : '挂牌价和市场常见成交价差距较小。';
  if (actionId === 'xiaohongshu-boost') return opportunities.length > 0 ? '现在有客户在看，投放能继续放大热度。': '现在客户少，更需要拉新客。';
  if (actionId === 'broker-broadcast') return opportunities.filter(o => o.visibility === 'shadow').length > 0 ? '还有客户没核实，发合作经纪人更容易补线索。': '可以再补一波外部客源。';
  if (actionId === 'private-referral') return caseItem.trust >= 60 ? '业主关系还行，适合走熟人介绍。': '业主关系偏弱，先别急着做熟人介绍。';
  if (actionId === 'open-day') return caseItem.heat >= 55 ? '现在热度还可以，开放日有机会放大到访。': '现在热度一般，开放日更偏拉新。';
  if (actionId === 'showing') return opportunities.some(o => o.stageIndex >= 1 && o.visibility !== 'shadow') ? '已有客户进入可带看阶段。'
    : '暂无客户进入可带看阶段。';
  if (actionId === 'sincerity-sale') return opportunities.some(o => o.stageIndex >= 2 && o.visibility !== 'shadow') ? '已有客户接近成交阶段。'
    : '客户阶段不足以触发诚意卖。';
  if (actionId === 'invite-customer-negotiation') return opportunities.some(o => o.stageIndex >= 3 && o.visibility !== 'shadow') ? '已有客户接近报价或议价阶段。'
    : '暂无客户进入谈判区。';
  return '查看房源情况。';
}

function deriveCaseListPriority(state: GameState, caseItem: Case) {
  const opportunities = getActiveOpportunities(state, caseItem.id);
  let score = caseSortValue(caseItem);

  if (!caseItem.hasCompletedFirstVisit) score += 120;
  if (caseItem.isFocused) score += 80;
  if (caseItem.windowDays <= 5) score += 70;
  if (caseItem.askPrice > caseItem.marketPrice * 1.04) score += 55;
  if (opportunities.some((entry) => entry.visibility !== 'shadow' && entry.stageIndex >= 3)) score += 90;
  if (caseItem.status === 'sold' || caseItem.status === 'withdrawn' || caseItem.status === 'lost_to_rival') score -= 200;

  return score;
}

function matchStageFilter(
  caseItem: Case,
  projection: ReturnType<typeof buildCaseDetailProjection> | null,
  filter: CaseStageFilter,
) {
  if (filter === 'all') return true;
  const phaseCode = projection?.listingLifecyclePhase.phaseCode;
  if (filter === 'closed') {
    return phaseCode === 'sold' || phaseCode === 'written_off' || phaseCode === 'sold_elsewhere';
  }
  return phaseCode === filter;
}

function matchQuickFilter(
  state: GameState,
  caseItem: Case,
  projection: ReturnType<typeof buildCaseDetailProjection> | null,
  filter: CaseQuickFilter | null,
) {
  if (!filter) return true;
  const opportunities = getActiveOpportunities(state, caseItem.id);
  const lifecycle = projection?.listingLifecyclePhase;

  if (filter === 'focused') return Boolean(caseItem.isFocused);
  if (filter === 'urgent') return lifecycle?.phaseDelayLevel === 'late' || caseItem.windowDays <= 5;
  if (filter === 'price') {
    return lifecycle?.primaryActionId === 'adjust-listing-price'
      || lifecycle?.primaryActionId === 'pricing-advice'
      || caseItem.askPrice > caseItem.marketPrice * 1.04;
  }
  return lifecycle?.phaseCode === 'feedback_offer'
    || lifecycle?.phaseCode === 'negotiation'
    || opportunities.some((entry) => entry.visibility !== 'shadow' && entry.stageIndex >= 3);
}

function derivePricePosition(caseItem: Case) {
  if (caseItem.askPrice <= caseItem.marketPrice) return '价格有竞争力';
  if (caseItem.askPrice <= caseItem.marketPrice * 1.03) return '价格略高，还能谈';
  return `比市场常见成交价高 ${caseItem.askPrice - caseItem.marketPrice} 万`;
}

function deriveWindowLabel(caseItem: Case, opportunities: Opportunity[]) {
  if (caseItem.windowDays <= 5) return '再拖容易失手';
  if (opportunities.some(o => o.daysLeft <= 2 && o.visibility !== 'shadow')) return '已有客户在掉线边缘';
  if (opportunities.some(o => o.visibility === 'shadow')) return '还有客户没核实';
  return '还要继续往前推';
}

function deriveManagerTake(caseItem: Case, opportunities: Opportunity[]) {
  if (caseItem.status === 'lost_to_rival') return '这套房已经在别处成交';
  if (caseItem.status === 'withdrawn') return '这套房已经核销';
  if (caseItem.riskFlags?.includes('要价偏高')) return '现在最大问题是价格偏高';
  if (opportunities.some(o => o.visibility === 'shadow')) return '还有客户没核实清楚';
  if (opportunities.some(o => o.stageIndex >= 3)) return '已经有客户快谈到成交了';
  return '这套房还在推进，但不能断跟';
}

function deriveSellerGuidance(caseItem: Case) {
  if (caseItem.trust < 55) return '业主信任偏低。';
  if (caseItem.patience < 45) return '业主耐心偏低。';
  if (caseItem.urgency > 80) return '业主更看重速度。';
  return '业主状态相对稳定。';
}

function deriveCommunicationMode(caseItem: Case) {
  if (caseItem.personality === 'pragmatic') return '带看反馈 / 同类房数据';
  if (caseItem.personality === 'emotional') return '情绪安抚 / 事实同步';
  if (caseItem.personality === 'urgent') return '速度 / 明确结果';
  return '统一口径';
}

function deriveStrongPoint(caseItem: Case) {
  if (caseItem.d2 >= 75) return '房子条件较好';
  if (caseItem.d1 >= 70) return '准客情况较好';
  if (caseItem.d3 >= 70) return '业主配合较好';
  return '目前没有明显短板';
}

function deriveWeakPoint(caseItem: Case) {
  if (caseItem.askPrice > caseItem.marketPrice * 1.05) return '价格高于市场成交位。';
  if (caseItem.d1 < 45) return '准客情况偏薄。';
  if (caseItem.d3 < 50) return '业主配合度偏低。';
  return '还没有明显优势';
}

function deriveNextFix(caseItem: Case, opportunities: Opportunity[]) {
  if (opportunities.length === 0) return '去补客户';
  if (opportunities.some(o => o.visibility === 'shadow')) return '去核实客户';
  if (caseItem.askPrice > caseItem.marketPrice * 1.05) return '去谈价格';
  return '去推进带看';
}

function filterCustomerModels(models: OpportunityViewModel[], filter: CustomerFilter) {
  if (filter === 'comparing') {
    return models.filter((model) => model.customerState?.status === 'comparing');
  }
  if (filter === 'late') {
    return models.filter((model) => (
      model.customerState?.status === 'negotiating'
      || (model.customerState?.churnRisk || 0) >= 60
      || model.opportunity.stageIndex >= 3
    ));
  }
  return models;
}

function describeWindowDays(days: number) {
  if (days <= 3) return `${days} 天内`;
  if (days <= 7) return `${days} 天内要推进`;
  return `${days} 天观察期`;
}

function buildPotentialSignalRows(models: OpportunityViewModel[]) {
  const groups = new Map<string, OpportunityViewModel[]>();

  models.forEach((model) => {
    const key = model.opportunity.channelName || '未知来源';
    const items = groups.get(key) || [];
    items.push(model);
    groups.set(key, items);
  });

  return [...groups.entries()]
    .map(([channelName, items]) => {
      const budgets = items
        .map((item) => item.opportunity.budgetMax)
        .filter((value) => Number.isFinite(value))
        .sort((left, right) => left - right);
      const maxConfidence = Math.max(...items.map((item) => item.opportunity.confidence));
      const soonestDaysLeft = Math.min(...items.map((item) => item.opportunity.daysLeft));
      const lead = items[0];

      return {
        id: `${lead.caseItem?.id || 'case'}-${channelName}`,
        title: `来自 ${channelName} 的潜在人群`,
        detail: lead.profileDetail || '这部分人还没接上，只能看出大概会被什么吸引。',
        count: items.length,
        budgetLine: describePotentialBudgetRange(budgets),
        confidenceLabel: deriveSignalStrengthLabel(maxConfidence),
        urgency: `${soonestDaysLeft} 天内不接，这波会散`,
        score: items.length * 20 + maxConfidence - soonestDaysLeft * 3,
      };
    })
    .sort((left, right) => right.score - left.score);
}

function buildPotentialAudienceProfile(
  state: GameState,
  caseItem: Case,
  predictedModels: OpportunityViewModel[],
): PotentialAudienceProfile {
  const totalCustomers = state.customers.length;
  const scoredCustomers = state.customers.map((customer) => {
    const customerState = state.customerStates.find((entry) => entry.customerId === customer.id);
    const runtime = customerState?.caseStates[caseItem.id];
    return {
      customer,
      score: scorePotentialCustomerFit(caseItem, customer, runtime),
    };
  });
  const strongMatches = scoredCustomers.filter((entry) => entry.score >= 66);
  const possibleMatches = scoredCustomers.filter((entry) => entry.score >= 52);
  const strongShare = totalCustomers > 0 ? strongMatches.length / totalCustomers : 0;
  const possibleShare = totalCustomers > 0 ? possibleMatches.length / totalCustomers : 0;
  const sizeTone = deriveAudienceSizeTone(strongShare, strongMatches.length);
  const bedroomLabel = deriveBedroomDemandLabel(caseItem);
  const priceDelta = caseItem.askPrice - caseItem.marketPrice;
  const demandTitle = deriveDemandTitle(caseItem, priceDelta, bedroomLabel);
  const predictedBudgetCeiling = predictedModels.length > 0
    ? Math.round(predictedModels.reduce((sum, model) => sum + model.opportunity.budgetMax, 0) / predictedModels.length)
    : null;

  return {
    demandTitle,
    demandDetail: deriveDemandDetail(caseItem, priceDelta, bedroomLabel, possibleShare),
    sizeLabel: deriveAudienceSizeLabel(strongShare, strongMatches.length),
    sizeTone,
    shareLabel: `${Math.round(strongShare * 100)}% 强匹配`,
    countLine: `${strongMatches.length}/${Math.max(1, totalCustomers)} 位 ≥66分`,
    priceLine: predictedBudgetCeiling ? `预算上沿约 ${predictedBudgetCeiling} 万` : derivePricePositionLine(priceDelta),
    evidence: [
      `${possibleMatches.length} 位可触达`,
      `${Math.round(possibleShare * 100)}% 可考虑`,
      derivePricePositionLine(priceDelta),
    ],
  };
}

function scorePotentialCustomerFit(
  caseItem: Case,
  customer: GameState['customers'][number],
  runtime?: GameState['customerStates'][number]['caseStates'][string],
) {
  const priceScore = caseItem.askPrice <= customer.budgetMax
    ? 30
    : caseItem.askPrice <= customer.budgetMax * 1.06
      ? 20
      : caseItem.askPrice <= customer.budgetMax * 1.12
        ? 10
        : 0;
  const districtScore = customer.targetDistrict === caseItem.district
    || customer.targetDistrict.includes(caseItem.district)
    || caseItem.district.includes(customer.targetDistrict)
    ? 22
    : 8;
  const bedroomCount = deriveBedroomCount(caseItem.layout);
  const layoutScore = customer.layouts.some((layout) => layout.includes(`${bedroomCount}`) || layout.includes(deriveBedroomText(bedroomCount)))
    ? 18
    : bedroomCount === 2
      ? 10
      : 6;
  const preferenceText = customer.preferences.join(' ');
  const preferenceScore = [
    caseItem.community,
    caseItem.district,
    deriveBedroomText(bedroomCount),
    caseItem.layout,
  ].some((token) => token && preferenceText.includes(token)) ? 10 : 4;
  const runtimeScore = runtime
    ? runtime.fit * 0.28 + runtime.interest * 0.22 + runtime.confidence * 0.16
    : 0;
  const activityScore = Math.min(10, Math.round((customer.activity + customer.urgency) / 20));
  return clampScore(Math.round(priceScore + districtScore + layoutScore + preferenceScore + activityScore + runtimeScore));
}

function deriveAudienceSizeLabel(strongShare: number, strongCount: number) {
  if (strongCount >= 6 || strongShare >= 0.34) return '规模很高';
  if (strongCount >= 4 || strongShare >= 0.24) return '规模高';
  if (strongCount >= 2 || strongShare >= 0.14) return '规模中';
  if (strongCount >= 1 || strongShare >= 0.06) return '规模低';
  return '规模极低';
}

function deriveAudienceSizeTone(strongShare: number, strongCount: number): PotentialAudienceProfile['sizeTone'] {
  if (strongCount >= 4 || strongShare >= 0.24) return 'emerald';
  if (strongCount >= 2 || strongShare >= 0.14) return 'amber';
  if (strongCount === 0 && strongShare < 0.06) return 'rose';
  return 'slate';
}

function deriveDemandTitle(caseItem: Case, priceDelta: number, bedroomLabel: string) {
  if (caseItem.layout.includes('1室')) return '预算克制的首套 / 过渡客';
  if (caseItem.layout.includes('3室')) return '家庭改善与一步到位客';
  if (priceDelta <= -20) return `${bedroomLabel}性价比客`;
  if (priceDelta >= 30 && caseItem.d2 >= 65) return `${bedroomLabel}品质改善客`;
  return `${bedroomLabel}首套升级客`;
}

function deriveDemandDetail(caseItem: Case, priceDelta: number, bedroomLabel: string, possibleShare: number) {
  const priceText = priceDelta > 0 ? `挂牌高出市场约 ${priceDelta} 万` : priceDelta < 0 ? `挂牌低于市场约 ${Math.abs(priceDelta)} 万` : '挂牌接近市场成交位';
  const scaleText = possibleShare >= 0.2 ? '可触达客群不薄' : '可触达客群偏窄';
  return `${caseItem.community} ${caseItem.area}㎡ ${bedroomLabel}，${priceText}，${scaleText}。`;
}

function derivePricePositionLine(priceDelta: number) {
  if (priceDelta > 0) return `高市场 ${priceDelta} 万`;
  if (priceDelta < 0) return `低市场 ${Math.abs(priceDelta)} 万`;
  return '接近市场价';
}

function deriveBedroomCount(layout: string) {
  const match = layout.match(/(\d+)室/);
  return match ? Number(match[1]) : 2;
}

function deriveBedroomText(count: number) {
  if (count <= 1) return '一房';
  if (count === 2) return '两房';
  if (count === 3) return '三房';
  return `${count}房`;
}

function deriveBedroomDemandLabel(caseItem: Case) {
  return deriveBedroomText(deriveBedroomCount(caseItem.layout));
}

function buildAttentionListings(
  state: GameState,
  caseItem: Case,
  customerStatesForSelectedCase: SelectedCustomerState[],
): AttentionListingRow[] {
  const activeRivals = (state.marketShadow?.rivalListings || [])
    .filter((entry) => entry.status === 'active')
    .filter((entry) => (
      entry.linkedCaseId === caseItem.id
      || entry.marketCellId === caseItem.marketCellId
      || entry.district === caseItem.district
    ));
  const rowsById = new Map<string, AttentionListingRow>();

  activeRivals.forEach((rival) => {
    rowsById.set(rival.id, buildRivalAttentionRow(caseItem, rival, customerStatesForSelectedCase));
  });

  state.cases
    .filter((entry) => entry.id !== caseItem.id && entry.status === 'active')
    .filter((entry) => entry.marketCellId === caseItem.marketCellId || entry.district === caseItem.district)
    .forEach((entry) => {
      if (!rowsById.has(entry.id)) {
        rowsById.set(entry.id, buildCaseAttentionRow(caseItem, entry, customerStatesForSelectedCase));
      }
    });

  return [...rowsById.values()]
    .sort((left, right) => (
      right.customerOverlap - left.customerOverlap
      || right.actualOverlapCount - left.actualOverlapCount
      || right.heat - left.heat
    ))
    .slice(0, 6);
}

function buildRivalAttentionRow(
  caseItem: Case,
  rival: RivalListing,
  customerStatesForSelectedCase: SelectedCustomerState[],
): AttentionListingRow {
  const actualOverlapCount = countCustomerOverlap(customerStatesForSelectedCase, rival.id);
  const houseScore = clampScore(Math.round(rival.storyStrength * 0.42 + rival.freshness * 0.3 + rival.heat * 0.28));
  const customerOverlap = deriveRivalOverlapScore(rival, actualOverlapCount, customerStatesForSelectedCase.length);
  const priceDelta = rival.askPrice - caseItem.askPrice;

  return {
    id: rival.id,
    title: rival.title,
    sourceLabel: rival.source === 'seed' ? '同类竞品' : '市场新盘',
    price: rival.askPrice,
    priceDelta,
    priceDeltaLabel: formatPriceDelta(priceDelta),
    houseScore,
    houseDelta: houseScore - caseItem.d2,
    houseLabel: formatHouseDelta(houseScore - caseItem.d2),
    customerOverlap,
    overlapLabel: formatOverlapLabel(customerOverlap),
    actualOverlapCount,
    heat: rival.heat,
    strengthLabel: formatOverlapLabel(customerOverlap),
    detail: `${rival.district} · ${rival.segment} · ${actualOverlapCount > 0 ? `${actualOverlapCount} 位准客也在看` : `吸客 ${formatScoreBand(rival.leadSiphonPower)}`}。`,
  };
}

function buildCaseAttentionRow(
  caseItem: Case,
  competitor: Case,
  customerStatesForSelectedCase: SelectedCustomerState[],
): AttentionListingRow {
  const actualOverlapCount = countCustomerOverlap(customerStatesForSelectedCase, competitor.id);
  const sameMarketCell = competitor.marketCellId === caseItem.marketCellId;
  const sameLayout = competitor.layout === caseItem.layout;
  const priceDelta = competitor.askPrice - caseItem.askPrice;
  const customerOverlap = deriveCaseOverlapScore(caseItem, competitor, actualOverlapCount, customerStatesForSelectedCase.length);

  return {
    id: competitor.id,
    targetCaseId: competitor.id,
    title: competitor.title,
    sourceLabel: sameMarketCell ? '同商圈' : '同区房源',
    price: competitor.askPrice,
    priceDelta,
    priceDeltaLabel: formatPriceDelta(priceDelta),
    houseScore: clampScore(Math.round(competitor.d2)),
    houseDelta: competitor.d2 - caseItem.d2,
    houseLabel: formatHouseDelta(competitor.d2 - caseItem.d2),
    customerOverlap,
    overlapLabel: formatOverlapLabel(customerOverlap),
    actualOverlapCount,
    heat: competitor.heat,
    strengthLabel: formatOverlapLabel(customerOverlap),
    detail: `${competitor.community} · ${competitor.layout} · ${sameLayout ? '户型接近' : `${competitor.area}㎡`}。`,
  };
}

function countCustomerOverlap(customerStatesForSelectedCase: SelectedCustomerState[], competitorId: string) {
  return customerStatesForSelectedCase.filter((customerState) => (
    customerState.activeCaseIds.includes(competitorId)
    || Object.values(customerState.caseStates).some((runtime) => runtime.competingCaseIds?.includes(competitorId))
  )).length;
}

function deriveRivalOverlapScore(rival: RivalListing, actualOverlapCount: number, selectedCustomerCount: number) {
  const directOverlap = selectedCustomerCount > 0 ? (actualOverlapCount / selectedCustomerCount) * 100 : 0;
  const marketPull = rival.leadSiphonPower * 0.55 + rival.heat * 0.28 + rival.freshness * 0.17;
  return clampScore(Math.round(actualOverlapCount > 0 ? Math.max(directOverlap, marketPull, 58) : marketPull));
}

function deriveCaseOverlapScore(
  caseItem: Case,
  competitor: Case,
  actualOverlapCount: number,
  selectedCustomerCount: number,
) {
  const directOverlap = selectedCustomerCount > 0 ? (actualOverlapCount / selectedCustomerCount) * 100 : 0;
  const priceGapRatio = Math.abs(competitor.askPrice - caseItem.askPrice) / Math.max(1, caseItem.askPrice);
  const areaGapRatio = Math.abs(competitor.area - caseItem.area) / Math.max(1, caseItem.area);
  const similarityScore = 28
    + (competitor.marketCellId === caseItem.marketCellId ? 22 : 10)
    + (competitor.layout === caseItem.layout ? 16 : 0)
    + Math.max(0, 20 - Math.round(priceGapRatio * 220))
    + Math.max(0, 14 - Math.round(areaGapRatio * 120))
    + Math.round(competitor.heat * 0.12);

  return clampScore(Math.round(Math.max(directOverlap, similarityScore)));
}

function deriveAttentionPriceSummary(caseItem: Case, rows: AttentionListingRow[]) {
  if (rows.length === 0) return `${caseItem.askPrice} 万`;
  const lowerCount = rows.filter((row) => row.price < caseItem.askPrice).length;
  const nearestLower = rows
    .filter((row) => row.price < caseItem.askPrice)
    .sort((left, right) => Math.abs(left.priceDelta) - Math.abs(right.priceDelta))[0];

  if (nearestLower) return `${lowerCount} 套更低，最近低 ${Math.abs(nearestLower.priceDelta)} 万`;
  const closest = rows.slice().sort((left, right) => Math.abs(left.priceDelta) - Math.abs(right.priceDelta))[0];
  if (!closest || closest.priceDelta === 0) return '和竞品持平';
  return `本房低 ${closest.priceDelta} 万`;
}

function deriveAttentionPriceTone(caseItem: Case, rows: AttentionListingRow[]): 'slate' | 'amber' | 'emerald' | 'rose' {
  const lowerCount = rows.filter((row) => row.price < caseItem.askPrice).length;
  if (lowerCount >= 2) return 'rose';
  if (lowerCount === 1) return 'amber';
  if (rows.some((row) => row.price > caseItem.askPrice)) return 'emerald';
  return 'slate';
}

function deriveAttentionHouseSummary(caseItem: Case, rows: AttentionListingRow[]) {
  if (rows.length === 0) return formatScoreBand(caseItem.d2);
  const strongerCount = rows.filter((row) => row.houseScore > caseItem.d2 + 5).length;
  const weakerCount = rows.filter((row) => row.houseScore < caseItem.d2 - 5).length;
  if (strongerCount > 0) return `${strongerCount} 套房况更强`;
  if (weakerCount > 0) return '本房房况占优';
  return '房况接近';
}

function deriveAttentionHouseTone(caseItem: Case, rows: AttentionListingRow[]): 'slate' | 'amber' | 'emerald' | 'rose' {
  if (rows.some((row) => row.houseScore > caseItem.d2 + 10)) return 'rose';
  if (rows.some((row) => row.houseScore > caseItem.d2 + 5)) return 'amber';
  if (rows.some((row) => row.houseScore < caseItem.d2 - 5)) return 'emerald';
  return 'slate';
}

function deriveAttentionOverlapSummary(rows: AttentionListingRow[]) {
  if (rows.length === 0) return '暂无竞品';
  const strongest = rows[0];
  if (strongest.actualOverlapCount > 0) return `${strongest.actualOverlapCount} 位准客重合`;
  return strongest.overlapLabel;
}

function deriveAttentionOverlapTone(rows: AttentionListingRow[]): 'slate' | 'amber' | 'emerald' | 'rose' {
  const strongest = rows[0];
  if (!strongest) return 'slate';
  if (strongest.customerOverlap >= 70) return 'rose';
  if (strongest.customerOverlap >= 45) return 'amber';
  return 'slate';
}

function formatPriceDelta(delta: number) {
  if (delta < 0) return `低 ${Math.abs(delta)} 万`;
  if (delta > 0) return `高 ${delta} 万`;
  return '持平';
}

function formatHouseDelta(delta: number) {
  if (delta >= 8) return '更强';
  if (delta <= -8) return '本房更强';
  return '接近';
}

function formatOverlapLabel(value: number) {
  return `重合 ${Math.round(value)}%`;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function describePotentialBudgetRange(budgets: number[]) {
  if (budgets.length === 0) return '预算还没摸清';
  if (budgets[0] === budgets[budgets.length - 1]) {
    return `预算上限多在 ${budgets[0]} 万`;
  }
  return `预算上限多在 ${budgets[0]}-${budgets[budgets.length - 1]} 万`;
}

function deriveTrustLabel(value: number) {
  if (value >= 70) return '关系稳';
  if (value >= 55) return '有点发紧';
  return '快不稳了';
}

function deriveTrustTone(value: number): 'slate' | 'amber' | 'emerald' | 'rose' {
  if (value >= 70) return 'emerald';
  if (value >= 55) return 'amber';
  return 'rose';
}

function deriveHeatLabel(value: number) {
  if (value >= 70) return '客户在看';
  if (value >= 50) return '客户一般';
  return '客户偏少';
}

function deriveHeatTone(value: number): 'slate' | 'amber' | 'emerald' | 'rose' {
  if (value >= 70) return 'emerald';
  if (value >= 50) return 'slate';
  return 'amber';
}

function deriveSignalStrengthLabel(value: number) {
  if (value >= 80) return '信号强，值得尽快接触';
  if (value >= 60) return '信号中，适合低成本承接';
  return '信号偏弱，先观察';
}
