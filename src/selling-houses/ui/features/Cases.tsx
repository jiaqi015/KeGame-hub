import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GameState, Case, type Opportunity, type RivalListing } from '../../domain/models';
import {
  buildCaseDetailProjection,
  buildOperatingProjection,
  type ProductOpportunityProjection,
} from '../../application/projections/operatingProjection.js';
import { buildOwnerPersonaProfile } from '../../application/projections/ownerPersonaProfile.js';
import type { OwnerProfilingTone } from '../../domain/ownerProfilingMemoryTypes.js';
import { ACTIONS, ACTION_CATEGORIES } from '../../domain/constants';
import { clamp, costText, caseSortValue } from '../../domain/utils';
import { getActiveOpportunities, getActionAvailability } from '../../domain/engine';
import { isCaseTerminalByCanonicalStatus } from '../../domain/caseLifecycleStatusRead';
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
  theme?: 'dark' | 'light';
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
  behaviorTimeline: AttentionBehaviorEvent[];
};
type AttentionBehaviorEvent = {
  id: string;
  day: number;
  title: string;
  detail: string;
  tone: 'neutral' | 'chance' | 'risk';
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
type SuggestedActionCopy = {
  title: string;
  detail: string;
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

export function Cases({ state, selectedCaseIdOverride, theme = 'dark', onSelectCase, onExecuteAction, onCaptureOpportunity, onExecuteScenarioAction }: CasesProps) {
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
  const activeOpportunities = selectedCase ? getActiveOpportunities(state, selectedCase.id) : [];

  const [decisionConfig, setDecisionConfig] = useState<ActionDecisionConfig | null>(null);
  const [activeActionTab, setActiveActionTab] = useState<ActionCategoryTab>('feedback');
  const [activeDetailTab, setActiveDetailTab] = useState<CaseDetailTab>('overview');
  const [blockedActionPanelOpen, setBlockedActionPanelOpen] = useState(false);
  const [activeAttentionListingId, setActiveAttentionListingId] = useState<string | null>(null);
  const [activeCustomerFilter, setActiveCustomerFilter] = useState<CustomerFilter>('all');

  const caseProjection = selectedCase ? caseProjectionById.get(selectedCase.id) || null : null;
  const ownerProfiling = caseProjection?.ownerProfiling || null;
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
  const suggestedActionCopy = selectedCase
    ? buildSuggestedActionCopy(caseProjection, selectedCase, activeOpportunities)
    : { title: '选择房源', detail: '先选一套房源，再看下一步动作。' };

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
              <CaseCardPrice label="业主预期" value={c.bottomPrice} />
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
        </div>
      </aside>

      <main className="flex min-w-0 flex-col">
        {selectedCase ? (
          <div className="min-h-0 flex-1">
            <div className="flex min-h-0 flex-col gap-3">
              <section className="seller-workbench overflow-visible">
                <div className="grid gap-3 border-b border-[var(--seller-border)] px-3.5 py-3 xl:grid-cols-[minmax(0,1fr)_228px]">
                  <div className="grid min-w-0 gap-3 sm:grid-cols-[184px_minmax(0,1fr)] sm:gap-4 lg:items-start">
                    <ListingHeroImage caseItem={selectedCase} />
                    <div className="min-w-0 sm:border-l sm:border-[var(--seller-border)] sm:pl-4">
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
                    <PriceLine label="市场合理价" value={`${selectedCase.marketPrice} 万`} />
                    <PriceLine label="业主预期" value={`${selectedCase.bottomPrice} 万`} tone="floor" />
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
                        label="建议动作"
                        value={`${suggestedActionCopy.title}\n${suggestedActionCopy.detail}`}
                        tone="amber"
                        multiLine
                      />
	                    </div>
	                  </section>

	                  <section className="seller-panel-soft relative px-3 py-3">
	                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="seller-label">执行清单 · 当前动作</div>
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
                        <OwnerProfilingCard profiling={ownerProfiling} hasCompletedFirstVisit={selectedCase.hasCompletedFirstVisit} />
                      </DeskSection>
	                    </div>
	                  )}

                  {activeDetailTab === 'attention' && (
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                      <DeskSection title="外部比较" count={`${attentionListings.length} 套`}>
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
                            <div className="seller-empty px-3 py-4 text-[12px]">
                              现在还没有显式竞品露出，世界会继续补进同商圈和同户型的对比盘。
                            </div>
                          )}
                        </div>
                      </DeskSection>

                      <DeskSection title="比较详情" count={activeAttentionListing?.strengthLabel || '对比'}>
                        {caseProjection ? (
                          <ComparisonWorldBrief summary={caseProjection.comparisonSummary} />
                        ) : null}
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
                        <div className="mt-2.5">
                          <AttentionBehaviorTimeline row={activeAttentionListing} />
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

type ListingHeroViewId = 'plan' | 'three-d' | 'community';

const LISTING_HERO_VIEWS: Array<{ id: ListingHeroViewId; label: string }> = [
  { id: 'plan', label: '平面' },
  { id: 'three-d', label: '3D' },
  { id: 'community', label: '环境' },
];

function ListingHeroImage({ caseItem }: { caseItem: Case }) {
  const [activeView, setActiveView] = useState<ListingHeroViewId>('plan');
  const hoverPausedRef = useRef(false);
  const tone = caseItem.d2 >= 70 ? 'good' : caseItem.d1 < 45 || caseItem.d3 < 48 ? 'risk' : 'normal';
  const toneClass = tone === 'good'
    ? 'from-emerald-500/24 via-cyan-500/12 to-white/[0.03]'
    : tone === 'risk'
      ? 'from-amber-500/18 via-rose-500/10 to-white/[0.03]'
      : 'from-cyan-500/18 via-slate-500/10 to-white/[0.03]';
  const bedroomLabel = caseItem.layout.includes('3室') ? '三房' : caseItem.layout.includes('1室') ? '一房' : '两房';
  const scene = getListingHeroScene(activeView);
  const sceneKey = `${caseItem.id}-${activeView}`;

  useEffect(() => {
    setActiveView('plan');
  }, [caseItem.id]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (hoverPausedRef.current) return;
      setActiveView((current) => nextListingHeroView(current));
    }, 4600);

    return () => window.clearInterval(timer);
  }, []);

  const content = (
    <div
      className={`seller-listing-hero seller-listing-hero-${activeView} relative min-h-[188px] overflow-hidden rounded-[18px] border border-[var(--seller-border)] bg-[#101822] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]`}
      onPointerEnter={() => {
        hoverPausedRef.current = true;
      }}
      onPointerLeave={() => {
        hoverPausedRef.current = false;
      }}
    >
      <div className={`seller-listing-hero-tone absolute inset-0 bg-gradient-to-br ${toneClass}`} />
      <div className="seller-listing-hero-light absolute inset-x-0 top-0 h-16 bg-[radial-gradient(circle_at_28%_12%,rgba(255,255,255,0.20),transparent_24%),radial-gradient(circle_at_82%_20%,rgba(73,221,133,0.16),transparent_24%)]" />
      <div className="seller-listing-hero-shade absolute bottom-0 left-0 right-0 h-[72px] bg-[linear-gradient(180deg,transparent,rgba(5,9,14,0.82))]" />

      <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
        <div className="seller-listing-hero-pill rounded-full border border-[var(--seller-border)] bg-[rgba(8,13,20,0.68)] px-2.5 py-1 text-[9px] font-semibold text-[var(--seller-muted)] backdrop-blur">
          {scene.badge}
        </div>
      </div>

      <div className="seller-listing-hero-stage absolute inset-x-1 top-10 h-[130px]">
        {renderListingHeroScene({
          activeView,
          bedroomLabel,
          caseItem,
          sceneKey,
        })}
      </div>

      <div className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-2">
        <div className="seller-listing-hero-switch ml-auto inline-flex shrink-0 rounded-full border border-[var(--seller-border)] bg-[rgba(8,13,20,0.72)] p-0.5 backdrop-blur">
          {LISTING_HERO_VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              aria-pressed={activeView === view.id}
              onClick={() => setActiveView(view.id)}
              className={`rounded-full px-2 py-0.5 text-[9px] font-semibold leading-4 transition ${
                activeView === view.id
                  ? 'bg-[var(--seller-ink)] text-[var(--seller-bg)]'
                  : 'text-[var(--seller-muted)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--seller-ink)]'
              }`}
            >
              {view.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return content;
}

function getListingHeroScene(view: ListingHeroViewId) {
  switch (view) {
    case 'three-d':
      return {
        badge: '3D 户型',
      };
    case 'community':
      return {
        badge: '小区环境',
      };
    case 'plan':
    default:
      return {
        badge: '平面图',
      };
  }
}

function nextListingHeroView(current: ListingHeroViewId): ListingHeroViewId {
  const currentIndex = LISTING_HERO_VIEWS.findIndex((view) => view.id === current);
  return LISTING_HERO_VIEWS[(currentIndex + 1) % LISTING_HERO_VIEWS.length].id;
}

function renderListingHeroScene({
  activeView,
  bedroomLabel,
  caseItem,
  sceneKey,
}: {
  activeView: ListingHeroViewId;
  bedroomLabel: string;
  caseItem: Case;
  sceneKey: string;
}) {
  if (activeView === 'three-d') {
    return renderListingHero3dScene({ caseItem, bedroomLabel, sceneKey });
  }
  if (activeView === 'community') {
    return renderListingHeroCommunityScene({ caseItem, sceneKey });
  }
  return renderListingHeroPlanScene({ caseItem, bedroomLabel, sceneKey });
}

function renderListingHeroPlanScene({
  caseItem,
  bedroomLabel,
  sceneKey,
}: {
  caseItem: Case;
  bedroomLabel: string;
  sceneKey: string;
}) {
  return (
    <svg
      viewBox="0 0 172 132"
      role="img"
      aria-label={`${caseItem.community}${bedroomLabel}平面图`}
      className="seller-listing-hero-visual h-full w-full overflow-visible"
    >
      <defs>
        <linearGradient id={`hero-plan-wash-${sceneKey}`} x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(118,221,255,0.18)" />
          <stop offset="55%" stopColor="rgba(73,221,133,0.10)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
        </linearGradient>
        <linearGradient id={`hero-plan-room-${sceneKey}`} x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
        </linearGradient>
        <filter id={`hero-plan-shadow-${sceneKey}`} x="-18%" y="-18%" width="136%" height="150%">
          <feDropShadow dx="0" dy="10" stdDeviation="7" floodColor="var(--listing-hero-shadow, rgba(0,0,0,0.42))" />
        </filter>
      </defs>

      <rect x="7" y="10" width="158" height="110" rx="16" fill="var(--listing-hero-glass-panel, rgba(255,255,255,0.018))" stroke="var(--listing-hero-line, rgba(255,255,255,0.06))" />
      <g opacity="0.28" stroke="var(--listing-hero-line, rgba(255,255,255,0.12))" strokeWidth="1">
        <line x1="18" y1="24" x2="152" y2="24" />
        <line x1="18" y1="42" x2="152" y2="42" />
        <line x1="18" y1="60" x2="152" y2="60" />
        <line x1="18" y1="78" x2="152" y2="78" />
        <line x1="18" y1="96" x2="152" y2="96" />
        <line x1="36" y1="16" x2="36" y2="110" />
        <line x1="68" y1="16" x2="68" y2="110" />
        <line x1="100" y1="16" x2="100" y2="110" />
        <line x1="132" y1="16" x2="132" y2="110" />
      </g>

      <g transform="translate(18 15) rotate(-4 56 41)" filter={`url(#hero-plan-shadow-${sceneKey})`}>
        <rect x="0" y="0" width="120" height="86" rx="8" fill={`url(#hero-plan-wash-${sceneKey})`} stroke="var(--listing-hero-line, rgba(255,255,255,0.24))" strokeWidth="2.2" />
        <rect x="6" y="6" width="36" height="28" rx="4" fill={`url(#hero-plan-room-${sceneKey})`} stroke="var(--listing-hero-line, rgba(255,255,255,0.26))" strokeWidth="1.6" />
        <rect x="42" y="6" width="72" height="44" rx="4" fill="var(--listing-hero-room-deep, rgba(17,57,58,0.84))" stroke="var(--listing-hero-line, rgba(255,255,255,0.22))" strokeWidth="1.6" />
        <rect x="6" y="34" width="36" height="46" rx="4" fill="var(--listing-hero-room-strong, rgba(18,32,48,0.92))" stroke="var(--listing-hero-line, rgba(255,255,255,0.22))" strokeWidth="1.6" />
        <rect x="42" y="50" width="36" height="30" rx="4" fill="var(--listing-hero-room-strong, rgba(36,52,42,0.92))" stroke="var(--listing-hero-line, rgba(255,255,255,0.22))" strokeWidth="1.6" />
        <rect x="78" y="50" width="16" height="30" rx="4" fill="var(--listing-hero-room-strong, rgba(34,43,58,0.92))" stroke="var(--listing-hero-line, rgba(255,255,255,0.22))" strokeWidth="1.6" />
        <rect x="94" y="50" width="20" height="30" rx="4" fill="var(--listing-hero-room-deep, rgba(31,52,63,0.90))" stroke="rgba(102,209,224,0.30)" strokeWidth="1.6" />

        <path d="M42 26 H114" stroke="rgba(102,209,224,0.72)" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6 52 H39" stroke="rgba(73,221,133,0.62)" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M42 66 H78" stroke="var(--listing-hero-line, rgba(255,255,255,0.22))" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M78 67 H94" stroke="var(--listing-hero-line, rgba(255,255,255,0.20))" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M94 67 H114" stroke="var(--listing-hero-line, rgba(255,255,255,0.20))" strokeWidth="1.4" strokeLinecap="round" />

        <rect x="14" y="14" width="16" height="8" rx="4" fill="var(--listing-hero-glass-panel, rgba(255,255,255,0.16))" />
        <rect x="53" y="14" width="28" height="14" rx="6" fill="var(--listing-hero-glass-panel, rgba(255,255,255,0.10))" />
        <rect x="86" y="17" width="18" height="6" rx="3" fill="var(--listing-hero-glass-panel, rgba(255,255,255,0.12))" />
        <circle cx="23" cy="58" r="7" fill="rgba(73,221,133,0.18)" />
        <rect x="50" y="56" width="20" height="14" rx="4" fill="var(--listing-hero-glass-panel, rgba(255,255,255,0.10))" />
        <rect x="81" y="57" width="10" height="12" rx="3" fill="var(--listing-hero-glass-panel, rgba(255,255,255,0.12))" />
        <rect x="98" y="58" width="8" height="10" rx="2" fill="rgba(102,209,224,0.24)" />
      </g>

      <g transform="translate(128 18)">
        <rect x="0" y="0" width="22" height="22" rx="6" fill="var(--listing-hero-glass-panel, rgba(255,255,255,0.05))" stroke="var(--listing-hero-line, rgba(255,255,255,0.16))" />
        <line x1="11" y1="18" x2="11" y2="30" stroke="var(--listing-hero-line, rgba(255,255,255,0.25))" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M11 6 L14 12 H8 Z" fill="rgba(255,255,255,0.84)" />
      </g>
    </svg>
  );
}

function renderListingHero3dScene({
  caseItem,
  bedroomLabel,
  sceneKey,
}: {
  caseItem: Case;
  bedroomLabel: string;
  sceneKey: string;
}) {
  return (
    <svg
      viewBox="0 0 172 132"
      role="img"
      aria-label={`${caseItem.community}${bedroomLabel}3D户型`}
      className="seller-listing-hero-visual h-full w-full overflow-visible"
    >
      <defs>
        <linearGradient id={`hero-3d-top-${sceneKey}`} x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="100%" stopColor="rgba(73,221,133,0.18)" />
        </linearGradient>
        <linearGradient id={`hero-3d-side-${sceneKey}`} x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="var(--listing-hero-room-deep, rgba(12,29,40,0.88))" />
          <stop offset="100%" stopColor="var(--listing-hero-room-strong, rgba(7,16,24,0.96))" />
        </linearGradient>
        <linearGradient id={`hero-3d-front-${sceneKey}`} x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="var(--listing-hero-room-deep, rgba(20,59,64,0.88))" />
          <stop offset="100%" stopColor="var(--listing-hero-room-strong, rgba(11,30,34,0.96))" />
        </linearGradient>
        <radialGradient id={`hero-3d-glow-${sceneKey}`} cx="50%" cy="42%" r="58%">
          <stop offset="0%" stopColor="rgba(102,209,224,0.18)" />
          <stop offset="100%" stopColor="rgba(102,209,224,0)" />
        </radialGradient>
        <filter id={`hero-3d-shadow-${sceneKey}`} x="-24%" y="-24%" width="148%" height="164%">
          <feDropShadow dx="0" dy="12" stdDeviation="8" floodColor="var(--listing-hero-shadow, rgba(0,0,0,0.48))" />
        </filter>
      </defs>

      <rect x="7" y="10" width="158" height="110" rx="16" fill="var(--listing-hero-glass-panel, rgba(255,255,255,0.016))" stroke="var(--listing-hero-line, rgba(255,255,255,0.06))" />
      <ellipse cx="86" cy="97" rx="52" ry="10" fill="var(--listing-hero-ground, rgba(0,0,0,0.26))" />
      <circle cx="90" cy="48" r="42" fill={`url(#hero-3d-glow-${sceneKey})`} />
      <g opacity="0.24" stroke="var(--listing-hero-line, rgba(255,255,255,0.10))" strokeWidth="1">
        <line x1="18" y1="31" x2="154" y2="31" />
        <line x1="18" y1="58" x2="154" y2="58" />
        <line x1="18" y1="85" x2="154" y2="85" />
      </g>

      <g transform="translate(19 14)" filter={`url(#hero-3d-shadow-${sceneKey})`}>
        <polygon points="26,18 93,18 111,29 44,29" fill={`url(#hero-3d-top-${sceneKey})`} stroke="var(--listing-hero-line, rgba(255,255,255,0.26))" strokeWidth="1.8" />
        <polygon points="93,18 111,29 111,83 93,72" fill={`url(#hero-3d-side-${sceneKey})`} stroke="var(--listing-hero-line, rgba(255,255,255,0.10))" strokeWidth="1.4" />
        <polygon points="44,29 111,29 111,83 44,83" fill={`url(#hero-3d-front-${sceneKey})`} stroke="var(--listing-hero-line, rgba(255,255,255,0.16))" strokeWidth="1.6" />
        <polygon points="18,33 44,29 44,83 18,88" fill="var(--listing-hero-room-strong, rgba(8,18,29,0.78))" stroke="var(--listing-hero-line, rgba(255,255,255,0.10))" strokeWidth="1.2" />
        <polygon points="26,18 44,29 18,33 0,21" fill="var(--listing-hero-glass-panel, rgba(255,255,255,0.08))" stroke="var(--listing-hero-line, rgba(255,255,255,0.10))" strokeWidth="1.2" />

        <polygon points="44,29 70,29 76,45 51,45" fill="var(--listing-hero-glass-panel, rgba(255,255,255,0.06))" />
        <polygon points="70,29 92,29 98,44 76,45" fill="rgba(73,221,133,0.12)" />
        <rect x="49" y="33" width="18" height="18" rx="3" fill="var(--listing-hero-room-strong, rgba(24,40,58,0.94))" stroke="var(--listing-hero-line, rgba(255,255,255,0.18))" />
        <rect x="67" y="33" width="20" height="29" rx="3" fill="var(--listing-hero-room-deep, rgba(19,61,62,0.88))" stroke="var(--listing-hero-line, rgba(255,255,255,0.18))" />
        <rect x="49" y="51" width="18" height="24" rx="3" fill="var(--listing-hero-room-strong, rgba(19,33,50,0.90))" stroke="var(--listing-hero-line, rgba(255,255,255,0.16))" />
        <rect x="67" y="62" width="18" height="13" rx="3" fill="var(--listing-hero-room-strong, rgba(36,48,39,0.94))" stroke="var(--listing-hero-line, rgba(255,255,255,0.16))" />
        <rect x="85" y="62" width="18" height="13" rx="3" fill="var(--listing-hero-room-strong, rgba(30,46,58,0.94))" stroke="rgba(102,209,224,0.28)" />
        <rect x="52" y="50" width="10" height="5" rx="2.5" fill="var(--listing-hero-glass-panel, rgba(255,255,255,0.14))" />
        <rect x="61" y="51" width="18" height="11" rx="4" fill="rgba(102,209,224,0.16)" />
        <rect x="81" y="52" width="10" height="18" rx="3" fill="var(--listing-hero-glass-panel, rgba(255,255,255,0.12))" />
        <rect x="52" y="70" width="14" height="8" rx="3" fill="rgba(73,221,133,0.16)" />
        <rect x="80" y="71" width="14" height="8" rx="3" fill="var(--listing-hero-glass-panel, rgba(255,255,255,0.10))" />

        <path d="M49 42 H103" stroke="rgba(102,209,224,0.74)" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M49 66 H85" stroke="rgba(73,221,133,0.64)" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M85 68 H103" stroke="var(--listing-hero-line, rgba(255,255,255,0.18))" strokeWidth="1.4" strokeLinecap="round" />

        <ellipse cx="60" cy="77" rx="44" ry="8" fill="var(--listing-hero-ground, rgba(0,0,0,0.20))" />
      </g>
      <g transform="translate(124 18)" opacity="0.9">
        <circle cx="12" cy="12" r="11" fill="var(--listing-hero-glass-panel, rgba(255,255,255,0.05))" stroke="var(--listing-hero-line, rgba(255,255,255,0.12))" />
        <path d="M12 3 A9 9 0 0 1 20 12" fill="none" stroke="rgba(255,255,255,0.36)" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M12 21 A9 9 0 0 1 4 12" fill="none" stroke="rgba(73,221,133,0.42)" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M16 6 L20 11 L15 11 Z" fill="rgba(255,255,255,0.8)" />
      </g>
    </svg>
  );
}

function renderListingHeroCommunityScene({
  caseItem,
  sceneKey,
}: {
  caseItem: Case;
  sceneKey: string;
}) {
  return (
    <svg
      viewBox="0 0 172 132"
      role="img"
      aria-label={`${caseItem.community}小区环境`}
      className="seller-listing-hero-visual h-full w-full overflow-visible"
    >
      <defs>
        <linearGradient id={`hero-community-sky-${sceneKey}`} x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(102,209,224,0.14)" />
          <stop offset="100%" stopColor="rgba(73,221,133,0.10)" />
        </linearGradient>
        <linearGradient id={`hero-community-build-${sceneKey}`} x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
        </linearGradient>
        <filter id={`hero-community-shadow-${sceneKey}`} x="-18%" y="-18%" width="136%" height="150%">
          <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="var(--listing-hero-shadow, rgba(0,0,0,0.42))" />
        </filter>
      </defs>

      <rect x="7" y="10" width="158" height="110" rx="16" fill={`url(#hero-community-sky-${sceneKey})`} stroke="var(--listing-hero-line, rgba(255,255,255,0.06))" />
      <g opacity="0.24" stroke="var(--listing-hero-line, rgba(255,255,255,0.12))" strokeWidth="1">
        <path d="M19 95 C36 78, 52 74, 70 72 S107 69, 155 42" fill="none" />
        <path d="M21 44 C42 54, 55 57, 79 58 S122 54, 151 69" fill="none" />
        <path d="M20 77 H154" fill="none" />
      </g>

      <g transform="translate(14 18)" filter={`url(#hero-community-shadow-${sceneKey})`}>
        <rect x="8" y="22" width="128" height="58" rx="12" fill="var(--listing-hero-glass-panel, rgba(13,22,30,0.68))" stroke="var(--listing-hero-line, rgba(255,255,255,0.10))" />
        <rect x="22" y="31" width="20" height="37" rx="7" fill={`url(#hero-community-build-${sceneKey})`} stroke="var(--listing-hero-line, rgba(255,255,255,0.18))" />
        <rect x="46" y="26" width="24" height="42" rx="7" fill="var(--listing-hero-room-strong, rgba(19,35,50,0.90))" stroke="var(--listing-hero-line, rgba(255,255,255,0.14))" />
        <rect x="74" y="29" width="18" height="39" rx="7" fill="var(--listing-hero-room-strong, rgba(24,48,41,0.86))" stroke="var(--listing-hero-line, rgba(255,255,255,0.16))" />
        <rect x="96" y="33" width="28" height="33" rx="7" fill="var(--listing-hero-room-deep, rgba(16,43,43,0.92))" stroke="var(--listing-hero-line, rgba(255,255,255,0.14))" />
        <path d="M12 79 H132" stroke="var(--listing-hero-line, rgba(255,255,255,0.12))" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M18 22 H68" stroke="rgba(102,209,224,0.58)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="35" cy="20" r="7" fill="rgba(73,221,133,0.20)" />
        <circle cx="48" cy="18" r="5" fill="rgba(73,221,133,0.24)" />
        <circle cx="113" cy="24" r="6" fill="rgba(102,209,224,0.18)" />

        <g fill="rgba(73,221,133,0.26)">
          <circle cx="14" cy="62" r="5" />
          <circle cx="18" cy="52" r="4" />
          <circle cx="125" cy="44" r="4" />
          <circle cx="131" cy="52" r="5" />
          <circle cx="114" cy="71" r="4" />
          <circle cx="28" cy="72" r="4.5" />
        </g>

        <path d="M57 30 C67 25, 81 23, 92 29" fill="none" stroke="var(--listing-hero-line, rgba(255,255,255,0.16))" strokeWidth="1.4" />
        <path d="M78 30 C89 25, 101 26, 110 33" fill="none" stroke="var(--listing-hero-line, rgba(255,255,255,0.16))" strokeWidth="1.4" />

        <circle cx="79" cy="48" r="12" fill="rgba(73,221,133,0.18)" />
        <circle cx="79" cy="48" r="5" fill="rgba(73,221,133,0.88)" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" />
        <path d="M79 39 L83 45 L79 58 L75 45 Z" fill="rgba(255,255,255,0.88)" />

        <rect x="18" y="82" width="20" height="7" rx="3.5" fill="var(--listing-hero-glass-panel, rgba(255,255,255,0.08))" />
        <rect x="44" y="82" width="26" height="7" rx="3.5" fill="rgba(102,209,224,0.12)" />
        <rect x="76" y="82" width="18" height="7" rx="3.5" fill="rgba(73,221,133,0.12)" />
      </g>

      <g transform="translate(115 17)">
        <rect x="0" y="0" width="38" height="22" rx="11" fill="var(--listing-hero-glass-panel, rgba(8,13,20,0.58))" stroke="var(--listing-hero-line, rgba(255,255,255,0.10))" />
        <path d="M19 6 L23 12 L19 19 L15 12 Z" fill="rgba(255,255,255,0.84)" />
        <circle cx="19" cy="12" r="2.3" fill="var(--listing-hero-room-strong, rgba(8,13,20,0.9))" />
      </g>
    </svg>
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
      <div className="seller-dimension-cube rounded-[12px] px-2 py-2">
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
          <polygon className="seller-dimension-face seller-dimension-face-floor" points={`${floorA} ${floorB} ${floorC} ${floorD}`} />
          <polygon className="seller-dimension-face seller-dimension-face-top" points={`${topA} ${topB} ${topC} ${topD}`} />
          <polygon className="seller-dimension-face seller-dimension-face-side" points={`${floorB} ${floorC} ${topC} ${topB}`} />
          <polygon className="seller-dimension-face seller-dimension-face-back" points={`${floorD} ${floorC} ${topC} ${topD}`} />
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
                className="seller-dimension-grid-line"
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
                className="seller-dimension-grid-line"
              />
            );
          })}
          <line className="seller-dimension-axis seller-dimension-axis-lead" x1={origin.x} y1={origin.y} x2={origin.x + leadAxis.x} y2={origin.y + leadAxis.y} />
          <line className="seller-dimension-axis seller-dimension-axis-house" x1={origin.x} y1={origin.y} x2={origin.x + houseAxis.x} y2={origin.y + houseAxis.y} />
          <line className="seller-dimension-axis seller-dimension-axis-owner" x1={origin.x} y1={origin.y} x2={origin.x + ownerAxis.x} y2={origin.y + ownerAxis.y} />
          <line className="seller-dimension-guide-line" x1={point.x} y1={point.y} x2={point.x} y2={origin.y + leadAxis.y * lead + ownerAxis.y * owner} />
          <circle className="seller-dimension-point-halo" cx={point.x} cy={point.y} r="11" />
          <circle className="seller-dimension-point" cx={point.x} cy={point.y} r="5.2" />
          <text className="seller-dimension-label seller-dimension-label-lead" x={origin.x + leadAxis.x + 5} y={origin.y + leadAxis.y + 2} fontSize="10" fontWeight="700">准客</text>
          <text className="seller-dimension-label seller-dimension-label-house" x={origin.x - 8} y={origin.y + houseAxis.y - 6} fontSize="10" fontWeight="700">房子</text>
          <text className="seller-dimension-label seller-dimension-label-owner" x={origin.x + ownerAxis.x + 5} y={origin.y + ownerAxis.y + 4} fontSize="10" fontWeight="700">业主</text>
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
  multiLine = false,
}: {
  label: string;
  value: string;
  tone: 'slate' | 'amber' | 'emerald' | 'rose';
  multiLine?: boolean;
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
    <div className={`grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-[12px] border px-3 py-2.5 ${toneClass} ${multiLine ? 'items-start' : 'items-center'}`}>
      <div className="seller-label text-[9px]">{label}</div>
      <div
        className={multiLine
          ? 'whitespace-pre-line text-[12px] font-semibold leading-5 text-[var(--seller-ink)]'
          : 'truncate text-[12px] font-semibold leading-5 text-[var(--seller-ink)]'}
        title={value}
      >
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

function OwnerProfilingCard({
  profiling,
  hasCompletedFirstVisit,
}: {
  profiling: ReturnType<typeof buildCaseDetailProjection>['ownerProfiling'];
  hasCompletedFirstVisit: boolean;
}) {
  if (!hasCompletedFirstVisit) {
    return (
      <div className="mt-2 rounded-[14px] border border-dashed border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] px-3 py-3">
        <div className="seller-label text-[9px]">业主分型</div>
        <p className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">
          完成首次面访后，会生成价格锚点、时间窗口、交易经验和决策方式四维分型。
        </p>
      </div>
    );
  }

  if (!profiling) {
    return (
      <div className="mt-2 rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] px-3 py-3">
        <div className="seller-label text-[9px]">业主分型</div>
        <p className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">
          已完成面访，但还没有沉淀出分型分析；再进入一次面访情景补齐信息。
        </p>
      </div>
    );
  }

  const evidenceById = new Map(profiling.evidenceBank.map((entry) => [entry.id, entry]));

  return (
    <div className="mt-2 space-y-2 rounded-[16px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="seller-label text-[9px]">业主分型</div>
          <div className="mt-1 text-[15px] font-black tracking-[-0.03em] text-[var(--seller-ink)]">{profiling.ownerTypeName}</div>
          <p className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{profiling.ownerTypeDescription}</p>
        </div>
        <span className={`seller-chip ${ownerProfilingToneClass(profiling.ownerTypeTone)}`}>
          {ownerProfilingToneLabel(profiling.ownerTypeTone)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {profiling.dimensions.map((dimension) => {
          const evidence = dimension.evidenceIds
            .map((id) => evidenceById.get(id)?.text)
            .find(Boolean);
          return (
            <div key={dimension.key} className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="seller-label text-[8px]">{dimension.label}</div>
                <div className="text-[9px] font-semibold text-[var(--seller-subtle)]">{confidenceLabel(dimension.confidence)}</div>
              </div>
              <div className="mt-1 text-[12px] font-bold text-[var(--seller-ink)]">{dimension.valueLabel}</div>
              {evidence ? (
                <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[var(--seller-muted)]">{evidence}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <InfoStrip label="服务目标" value={profiling.serviceStrategy.primaryGoal} />
        <InfoStrip label="主要卡点" value={profiling.serviceStrategy.mainBlocker} />
        <InfoStrip label="下一步" value={profiling.serviceStrategy.recommendedNextAction} />
        <InfoStrip label="沟通方式" value={profiling.serviceStrategy.communicationStyle} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
          <div className="seller-label text-[9px]">标签</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {profiling.labels.slice(0, 5).map((label) => (
              <span key={`${label.name}-${label.value}`} className="seller-chip seller-chip-accent">
                {label.value}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
          <div className="seller-label text-[9px]">还要补问</div>
          <ul className="mt-1 space-y-1">
            {(profiling.openQuestions.length ? profiling.openQuestions : ['下一次沟通里验证价格拍板人和真实期限。']).slice(0, 3).map((question) => (
              <li key={question} className="text-[10px] leading-4 text-[var(--seller-muted)]">• {question}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function confidenceLabel(confidence: 'high' | 'medium' | 'low') {
  if (confidence === 'high') return '高置信';
  if (confidence === 'medium') return '中置信';
  return '低置信';
}

function ownerProfilingToneClass(tone: OwnerProfilingTone) {
  if (tone === 'risk') return 'seller-chip-risk';
  if (tone === 'chance') return 'seller-chip-chance';
  if (tone === 'accent') return 'seller-chip-accent';
  return '';
}

function ownerProfilingToneLabel(tone: OwnerProfilingTone) {
  if (tone === 'risk') return '高风险';
  if (tone === 'chance') return '机会';
  if (tone === 'accent') return '强特征';
  return '观察';
}

function ComparisonWorldBrief({
  summary,
}: {
  summary: ReturnType<typeof buildCaseDetailProjection>['comparisonSummary'];
}) {
  const rows = [
    ...summary.rivalStores,
    ...summary.rivalListings,
    ...summary.comparingCustomers,
  ].slice(0, 5);

  return (
    <div className="mb-2.5 rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] px-3 py-2.5">
      <div className="text-[12px] font-bold text-[var(--seller-ink)]">{summary.title}</div>
      <p className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{summary.detail}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {summary.decisionLens.slice(0, 4).map((item) => (
          <span key={item} className="seller-chip">
            {item}
          </span>
        ))}
      </div>
      {rows.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {rows.map((row) => (
            <div key={row.id} className="flex items-start justify-between gap-3 rounded-[10px] bg-[rgba(255,255,255,0.03)] px-2.5 py-2">
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-[var(--seller-subtle)]">{row.label}</div>
                <div className="mt-0.5 truncate text-[11px] font-semibold text-[var(--seller-ink)]">{row.title}</div>
              </div>
              <div className="max-w-[48%] text-right text-[10px] leading-4 text-[var(--seller-muted)]">{row.detail}</div>
            </div>
          ))}
        </div>
      ) : null}
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

function AttentionBehaviorTimeline({ row }: { row: AttentionListingRow | null }) {
  const events = row?.behaviorTimeline || [];

  return (
    <div className="rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="seller-label">竞品行为</div>
        <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">最近 {events.length || 0} 条</span>
      </div>
      {events.length > 0 ? (
        <div className="space-y-2">
          {events.map((event, index) => (
            <div key={event.id} className="grid grid-cols-[54px_minmax(0,1fr)] gap-2">
              <div className="pt-0.5 text-[10px] font-semibold text-[var(--seller-subtle)]">D{event.day}</div>
              <div className="relative border-l border-[var(--seller-border)] pl-3">
                <span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ${attentionBehaviorDotClass(event.tone)}`} />
                <div className={`rounded-[12px] border px-3 py-2 ${index === 0 ? 'border-[color:var(--seller-chance)]/30 bg-[rgba(102,209,224,0.08)]' : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)]'}`}>
                  <div className="text-[11px] font-bold text-[var(--seller-ink)]">{event.title}</div>
                  <p className="mt-0.5 text-[10px] leading-4 text-[var(--seller-muted)]">{event.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="seller-empty px-3 py-3 text-[11px]">还没有捕捉到竞品行为。</div>
      )}
    </div>
  );
}

function attentionBehaviorDotClass(tone: AttentionBehaviorEvent['tone']) {
  if (tone === 'risk') return 'bg-[var(--seller-risk)]';
  if (tone === 'chance') return 'bg-[var(--seller-chance)]';
  return 'bg-[var(--seller-muted)]';
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
          <div className="text-[11px] font-semibold text-[var(--seller-chance)]">{row.count} 批客源</div>
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
  if (actionId === 'ask-psychological-price') return `业主预期 ${caseItem.bottomPrice} 万，业主心理价还没说透。`;
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
  if (isCaseTerminalByCanonicalStatus(state, caseItem)) score -= 200;

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

// legacy_status_mirror_read: unused legacy display adapter, retained for reference
// TODO: Remove if not needed, or refactor to accept GameState for canonical read
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
  if (caseItem.personality === 'pragmatic') return '数据驱动 / 带看反馈';
  if (caseItem.personality === 'emotional') return '热度敏感 / 情绪安抚';
  if (caseItem.personality === 'urgent') return '时间压力 / 明确结果';
  return '统一口径';
}

function deriveStrongPoint(caseItem: Case) {
  if (caseItem.d2 >= 75) return '房子条件较好';
  if (caseItem.d1 >= 70) return '准客情况较好';
  if (caseItem.d3 >= 70) return '业主配合较好';
  return '目前没有明显短板';
}

function deriveWeakPoint(caseItem: Case) {
  if (caseItem.askPrice > caseItem.marketPrice * 1.05) return '价格高于市场合理价。';
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

function buildSuggestedActionCopy(
  caseProjection: { listingLifecyclePhase?: { phaseCode?: string; primaryActionLabel?: string; phaseRiskHint?: string } | null } | null,
  caseItem: Case,
  opportunities: Opportunity[],
): SuggestedActionCopy {
  const title = caseProjection?.listingLifecyclePhase?.primaryActionLabel || deriveNextFix(caseItem, opportunities);
  const phaseCode = caseProjection?.listingLifecyclePhase?.phaseCode;

  if (phaseCode === 'pre_visit') {
    const priceGap = caseItem.askPrice - caseItem.marketPrice;
    const priceHint = priceGap > 0
      ? `挂牌比市场高 ${priceGap} 万`
      : `挂牌已经贴近市场位`;
    const ownerState = caseItem.trust < 55
      ? '业主信任还没建立'
      : caseItem.patience < 45
        ? '业主耐心正在变紧'
        : caseItem.urgency > 80
          ? '业主更看重速度'
          : '业主态度还算稳定';
    return {
      title,
      detail: `${caseItem.ownerName} 还没完成首次面访，先别急着铺推广。面访里要问清卖房原因、最晚可等到哪天、能不能接受市场反馈；同时把「${priceHint}」这件事讲透，做完再决定先补包装、调价格还是拉第一批客户。当前${ownerState}，这一步会直接影响后面的带看和议价空间。`,
    };
  }

  if (phaseCode === 'packaging') {
    return {
      title,
      detail: '先把房源讲清，再把曝光和节奏推起来。',
    };
  }

  if (phaseCode === 'showing') {
    return {
      title,
      detail: '先把带看节奏拉起来，再把客户反馈收回来。',
    };
  }

  if (phaseCode === 'feedback_offer') {
    return {
      title,
      detail: '把反馈翻成报价动作，不要只停在看房。',
    };
  }

  if (phaseCode === 'negotiation') {
    return {
      title,
      detail: '把价格、条件和时间窗口一起收口。',
    };
  }

  return {
    title,
    detail: caseProjection?.listingLifecyclePhase?.phaseRiskHint || '把下一步接上。',
  };
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
        urgency: `${soonestDaysLeft} 天内要跟进，不然这批客源会流失`,
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
  const priceText = priceDelta > 0 ? `挂牌高出市场约 ${priceDelta} 万` : priceDelta < 0 ? `挂牌低于市场约 ${Math.abs(priceDelta)} 万` : '挂牌接近市场合理价';
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
    rowsById.set(rival.id, buildRivalAttentionRow(state, caseItem, rival, customerStatesForSelectedCase));
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
  state: GameState,
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
    behaviorTimeline: buildAttentionBehaviorTimeline(state, caseItem, rival, priceDelta, actualOverlapCount),
  };
}

function buildAttentionBehaviorTimeline(
  state: GameState,
  caseItem: Case,
  rival: RivalListing,
  priceDelta: number,
  actualOverlapCount: number,
): AttentionBehaviorEvent[] {
  const matchedLogEvents = state.eventStore
    .filter((event) => event.detail.includes(rival.title) || event.detail.includes(rival.district))
    .filter((event) => /入场|降价|成交|撤出|分流|比较|抢走|竞品|同类房/.test(`${event.title}${event.detail}${event.actor}`))
    .map<AttentionBehaviorEvent>((event) => ({
      id: `event-${event.id}`,
      day: event.day,
      title: event.title || event.actor,
      detail: event.detail,
      tone: event.tone === 'danger' ? 'risk' : event.tone === 'success' ? 'chance' : 'neutral',
    }));

  const syntheticEvents: AttentionBehaviorEvent[] = [
    {
      id: `${rival.id}-listed`,
      day: estimateRivalListedDay(state.day, rival),
      title: rival.source === 'seed' ? '持续在场' : '竞品入场',
      detail: `${rival.title} 进入同板块比较，当前挂牌 ${rival.askPrice} 万。`,
      tone: 'neutral',
    },
    ...buildPriceBehaviorEvents(state.day, rival, priceDelta),
    ...buildCustomerBehaviorEvents(state.day, rival, actualOverlapCount),
    ...buildHeatBehaviorEvents(state.day, rival),
    ...buildDeadlineBehaviorEvents(state.day, rival),
  ];

  return dedupeAttentionBehaviorEvents([...matchedLogEvents, ...syntheticEvents])
    .filter((event) => event.day <= state.day)
    .filter((event) => event.day >= Math.max(1, state.day - 10) || event.id.endsWith('-listed'))
    .sort((left, right) => right.day - left.day)
    .slice(0, 4)
    .map((event) => ({
      ...event,
      detail: event.detail.replace(caseItem.title, '本房'),
    }));
}

function buildPriceBehaviorEvents(currentDay: number, rival: RivalListing, priceDelta: number): AttentionBehaviorEvent[] {
  if (priceDelta >= -5) {
    return [];
  }

  return [{
    id: `${rival.id}-price-cut`,
    day: Math.max(1, currentDay - Math.max(1, Math.min(4, Math.ceil((100 - rival.freshness) / 25)))),
    title: '价格动作',
    detail: `${rival.title} 当前比本房低 ${Math.abs(priceDelta)} 万，已经在压同类房的报价预期。`,
    tone: 'risk',
  }];
}

function buildCustomerBehaviorEvents(currentDay: number, rival: RivalListing, actualOverlapCount: number): AttentionBehaviorEvent[] {
  if (actualOverlapCount <= 0 && rival.leadSiphonPower < 62) {
    return [];
  }

  return [{
    id: `${rival.id}-lead-siphon`,
    day: Math.max(1, currentDay - 1),
    title: actualOverlapCount > 0 ? '客户比较' : '吸客升温',
    detail: actualOverlapCount > 0
      ? `${actualOverlapCount} 位准客也在看这套竞品，需要把价格和卖点讲得更硬。`
      : `${rival.title} 吸客强度 ${formatScoreBand(rival.leadSiphonPower)}，正在分流同板块注意力。`,
    tone: 'risk',
  }];
}

function buildHeatBehaviorEvents(currentDay: number, rival: RivalListing): AttentionBehaviorEvent[] {
  if (rival.heat < 68 && rival.freshness < 68) {
    return [];
  }

  return [{
    id: `${rival.id}-freshness`,
    day: Math.max(1, currentDay - 2),
    title: rival.freshness >= 68 ? '新鲜度高' : '热度抬升',
    detail: `${rival.title} 最近曝光还在，热度 ${Math.round(rival.heat)}、新鲜度 ${Math.round(rival.freshness)}。`,
    tone: 'neutral',
  }];
}

function buildDeadlineBehaviorEvents(currentDay: number, rival: RivalListing): AttentionBehaviorEvent[] {
  if (rival.daysLeft > 3) {
    return [];
  }

  return [{
    id: `${rival.id}-closing-window`,
    day: currentDay,
    title: '窗口收紧',
    detail: `${rival.title} 只剩 ${Math.max(0, Math.round(rival.daysLeft))} 天，容易出现成交或撤出动作。`,
    tone: 'risk',
  }];
}

function estimateRivalListedDay(currentDay: number, rival: RivalListing) {
  const ageByFreshness = Math.max(0, Math.round((100 - rival.freshness) / 8));
  const ageByWindow = Math.max(0, 10 - Math.round(rival.daysLeft));
  return Math.max(1, currentDay - Math.max(ageByFreshness, ageByWindow));
}

function dedupeAttentionBehaviorEvents(events: AttentionBehaviorEvent[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.day}-${event.title}-${event.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
