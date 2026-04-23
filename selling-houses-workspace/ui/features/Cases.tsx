import React, { useEffect, useMemo, useState } from 'react';
import { GameState, Case } from '../../domain/models';
import { buildCaseDetailProjection } from '../../application/projections/operatingProjection.js';
import { ACTIONS, ACTION_CATEGORIES } from '../../domain/constants';
import { costText, caseSortValue } from '../../domain/utils';
import { getActiveOpportunities, getActionAvailability } from '../../domain/engine';
import { PERSONALITIES } from '../../domain/constants';
import { Star } from 'lucide-react';
import { buildOpportunityViewModels, type OpportunityViewModel } from './caseOpportunityViewModel';
import { ActionDecisionOverlay, buildActionDecisionConfig, type ActionDecisionConfig, type ScenarioResult, type ScenarioChoice, type ScenarioFeedback, type Settlement } from './ActionDecisionOverlay';

interface CasesProps {
  state: GameState;
  onSelectCase: (id: string) => void;
  onExecuteAction: (actionId: string, caseItem: any, optionId?: string | null) => boolean;
  onExecuteScenarioAction?: (actionId: string, caseItem: any, settlement: Settlement) => boolean;
}

type ActionCategoryTab = 'feedback' | 'marketing' | 'pricing' | 'negotiation';
type CaseDetailTab = 'overview' | 'customers' | 'changes' | 'evidence';
type ActionWorkspaceCard = {
  action: typeof ACTIONS[number];
  availability: ReturnType<typeof getActionAvailability>;
  hint: string;
};
type CaseStageFilter = 'all' | 'pre_visit' | 'packaging' | 'showing' | 'feedback_offer' | 'negotiation' | 'closed';
type CaseQuickFilter = 'focused' | 'urgent' | 'price' | 'late-stage';
const CASE_STAGE_FILTERS: Array<{ id: CaseStageFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'pre_visit', label: '待面访分型' },
  { id: 'packaging', label: '需包装曝光' },
  { id: 'showing', label: '需提升带看' },
  { id: 'feedback_offer', label: '促进反馈出价' },
  { id: 'negotiation', label: '推进谈判成交' },
  { id: 'closed', label: '已结束' },
];

const CASE_QUICK_FILTERS: Array<{ id: CaseQuickFilter; label: string }> = [
  { id: 'focused', label: '本周聚焦' },
  { id: 'urgent', label: '拖久会丢' },
  { id: 'price', label: '价格卡壳' },
  { id: 'late-stage', label: '接近成交' },
];

export function Cases({ state, onSelectCase, onExecuteAction, onExecuteScenarioAction }: CasesProps) {
  const { cases, selectedCaseId } = state;
  const [stageFilter, setStageFilter] = useState<CaseStageFilter>('all');
  const [quickFilter, setQuickFilter] = useState<CaseQuickFilter | null>(null);
  const sortedCases = [...cases].sort((a, b) => deriveCaseListPriority(state, b) - deriveCaseListPriority(state, a));
  const caseProjectionById = useMemo(
    () => new Map(sortedCases.map((entry) => [entry.id, buildCaseDetailProjection(state, entry)])),
    [sortedCases, state],
  );
  const visibleCases = sortedCases
    .filter((entry) => matchStageFilter(entry, caseProjectionById.get(entry.id) || null, stageFilter))
    .filter((entry) => matchQuickFilter(state, entry, caseProjectionById.get(entry.id) || null, quickFilter));
  const selectedCase = sortedCases.find((entry) => entry.id === selectedCaseId) || visibleCases[0] || sortedCases[0];
  const selectionHiddenByFilter = Boolean(selectedCase && !visibleCases.some((entry) => entry.id === selectedCase.id));
  const activeOpportunities = selectedCase ? getActiveOpportunities(state, selectedCase.id) : [];

  const [decisionConfig, setDecisionConfig] = useState<ActionDecisionConfig | null>(null);
  const [activeActionTab, setActiveActionTab] = useState<ActionCategoryTab>('feedback');
  const [activeDetailTab, setActiveDetailTab] = useState<CaseDetailTab>('overview');

  const caseProjection = selectedCase ? caseProjectionById.get(selectedCase.id) || null : null;
  const latestScoreSnapshot = selectedCase?.competitivenessSnapshots?.[0];
  const opportunityModels = useMemo(
    () => buildOpportunityViewModels(state, activeOpportunities),
    [activeOpportunities, state],
  );
  const predictedOpportunities = opportunityModels.filter((model) => model.engagementBand === 'potential');
  const engagedOpportunities = opportunityModels.filter((model) => model.engagementBand !== 'potential');
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
  const executionChecklist = useMemo(
    () => (selectedCase && caseProjection ? buildExecutionChecklist(selectedCase, caseProjection, activeOpportunities.length) : []),
    [activeOpportunities.length, caseProjection, selectedCase],
  );
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
  const actionCardsByCategory = ACTION_CATEGORIES.map(category => {
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

  useEffect(() => {
    setActiveActionTab('feedback');
    setActiveDetailTab('overview');
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
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CASE_STAGE_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setStageFilter(filter.id)}
                  className={`whitespace-nowrap rounded-full px-2 py-[3px] text-[9px] font-semibold leading-4 ${
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
            <div className="mt-2 flex flex-wrap gap-2">
              {CASE_QUICK_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setQuickFilter((current) => current === filter.id ? null : filter.id)}
                  className={`rounded-full px-2 py-[3px] text-[9px] font-semibold leading-4 ${
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
        {visibleCases.map(c => {
          const cardProjection = caseProjectionById.get(c.id) || null;
          return (
          <div
            key={c.id}
            onClick={() => onSelectCase(c.id)}
            className={`relative cursor-pointer overflow-hidden rounded-[12px] border px-2.5 py-2.5 transition-all ${
              c.id === selectedCase?.id
                ? 'border-[color:var(--seller-border-strong)] bg-[rgba(255,255,255,0.04)] shadow-inner'
                : 'border-transparent bg-[rgba(255,255,255,0.02)] hover:border-[var(--seller-border)] hover:bg-[rgba(255,255,255,0.04)]'
            }`}
          >
              {c.isFocused && (
                <div className="absolute right-0 top-0 rounded-bl-xl bg-[var(--seller-accent)] p-1 text-[var(--seller-bg)] shadow-lg">
                  <Star size={10} fill="currentColor" />
                </div>
              )}
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] ${
                c.isFocused ? 'bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]' : 'bg-[rgba(255,255,255,0.06)] text-[var(--seller-subtle)]'
              }`}>
                {c.isFocused ? '本周聚焦' : cardProjection?.listingLifecyclePhase.completionStateLabel || cardProjection?.listingLifecyclePhase.phaseLabel || c.stageLabel}
              </span>
              <small className="pt-0.5 text-[9px] font-medium text-[var(--seller-subtle)]">{c.district}</small>
            </div>
            <strong className="block line-clamp-1 text-[13px] font-semibold leading-5 text-[var(--seller-ink)]">{c.title}</strong>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[var(--seller-muted)]">
              <span>{c.community}</span>
              <span className="text-[var(--seller-border-strong)]">/</span>
              <span>{c.layout} · {c.area}㎡</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <CompactTag label="剩余" value={deriveListingAgeLabel(c)} tone="amber" />
              <CompactTag
                label="阶段"
                value={cardProjection?.listingLifecyclePhase.phaseLabel || deriveShortCaseState(c, getActiveOpportunities(state, c.id))}
                tone={deriveHouseScoreTone(c.competitiveness)}
              />
              <CompactTag label="后果" value={cardProjection?.listingLifecyclePhase.phaseRiskHint || deriveWindowLabel(c, getActiveOpportunities(state, c.id))} tone="rose" />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <CompactMetric label="信" val={c.trust} />
              <CompactMetric label="热" val={c.heat} />
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[8px] font-bold ${
                c.personality === 'pragmatic' ? 'bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]' :
                c.personality === 'emotional' ? 'bg-[rgba(102,209,224,0.12)] text-[var(--seller-chance)]' : 'bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]'
              }`}>
                {PERSONALITIES[c.personality as keyof typeof PERSONALITIES]?.label}
                </span>
              </div>
            </div>
          );
        })}
          {visibleCases.length === 0 && (
            <div className="seller-empty px-4 py-6 text-sm">
              当前筛选下没有房源，换个阶段或取消快速筛选看看。
            </div>
          )}
          {selectionHiddenByFilter && selectedCase && (
            <div className="rounded-[16px] border border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)] px-4 py-4 text-[12px] text-[var(--seller-chance)]">
              当前正在看 <strong>{selectedCase.title}</strong>，但它不在这组筛选里。
            </div>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-col">
        {selectedCase ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.28fr)_320px]">
            <div className="flex min-h-0 flex-col gap-3">
              <section className="seller-workbench overflow-hidden">
                <div className="grid gap-3 border-b border-[var(--seller-border)] px-3.5 py-3 xl:grid-cols-[minmax(0,1fr)_228px]">
                  <div className="min-w-0">
                    <div className="seller-label">当前房源</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <h2 className="seller-title text-[17px] leading-5">{selectedCase.title}</h2>
                      <span className="seller-chip bg-[var(--seller-ink)] text-[var(--seller-bg)]">
                        {caseProjection?.listingLifecyclePhase.completionStateLabel || caseProjection?.listingLifecyclePhase.phaseLabel || selectedCase.stageLabel}
                      </span>
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
                      {selectedCase.personality && (
                        <>
                          <span className="text-[var(--seller-border-strong)]">/</span>
                          <span>{PERSONALITIES[selectedCase.personality as keyof typeof PERSONALITIES]?.label}业主</span>
                        </>
                      )}
                    </div>
                    <div className="mt-3">
                      <div className="seller-label">当前问题</div>
                      <div className="mt-1 text-[15px] font-semibold leading-5 text-[var(--seller-ink)]">
                        {caseProjection?.listingLifecyclePhase.coreProblemLabel || deriveManagerTake(selectedCase, activeOpportunities)}
                      </div>
                    </div>
                    <p className="seller-body mt-2 max-w-[72ch] text-[11px] leading-5">
                      {caseProjection?.listingLifecyclePhase.phaseRiskHint || deriveManagerTake(selectedCase, activeOpportunities)}
                    </p>
                    {caseProjection?.listingLifecyclePhase?.phaseLabel && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="seller-chip">{caseProjection.listingLifecyclePhase.phaseLabel}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-1.5">
                    <PriceLine label="挂牌价" value={`${selectedCase.askPrice} 万`} strong />
                    <PriceLine label="市场成交位" value={`${selectedCase.marketPrice} 万`} />
                    <PriceLine label="业主底线" value={`${selectedCase.bottomPrice} 万`} />
                  </div>
                </div>

                <div className="grid gap-3 px-3.5 py-3 lg:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
                  <section className="seller-panel-soft px-3 py-3">
                    <div className="seller-label">当前问题</div>
                    <div className="mt-2 grid gap-2">
                      <DiagnosisCard
                        label="主阶段"
                        value={caseProjection?.listingLifecyclePhase.phaseLabel || selectedCase.stageLabel}
                        detail={caseProjection?.listingLifecyclePhase.coreProblemLabel || '房源状态'}
                        tone={caseProjection?.listingLifecyclePhase.phaseDelayLevel === 'late' ? 'rose' : 'slate'}
                        metrics={[
                          { label: '已接上', value: `${caseProjection?.customerPoolSummary.metCount ?? customerStatesForSelectedCase.length} 位` },
                          { label: '带看', value: `${selectedCase.viewings} 次` },
                        ]}
                      />
                      <DiagnosisCard
                        label="下一步"
                        value={caseProjection?.listingLifecyclePhase.primaryActionLabel || deriveNextFix(selectedCase, activeOpportunities)}
                        detail={caseProjection?.nextStepLine || '下一步动作'}
                        tone="amber"
                        metrics={[
                          { label: '报价', value: `${selectedCase.offers} 次` },
                          { label: '比较中', value: `${caseProjection?.customerPoolSummary.comparingCount ?? comparingCustomers.length} 位` },
                        ]}
                      />
                      <DiagnosisCard
                        label="再拖会怎样"
                        value={caseProjection?.listingLifecyclePhase.phaseRiskHint || deriveWindowLabel(selectedCase, activeOpportunities)}
                        detail={caseProjection?.competitionSummary.detail || '外部压力'}
                        tone={caseProjection?.listingLifecyclePhase.phaseDelayLevel === 'late' ? 'rose' : 'amber'}
                        metrics={[
                          { label: '同类房', value: `${caseProjection?.competitionSummary.rivalCount ?? 0} 套` },
                          { label: '压力', value: `${caseProjection?.competitionSummary.pressure ?? 0}` },
                        ]}
                      />
                    </div>
                  </section>

                  <section className="seller-panel-soft px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="seller-label">当前动作</div>
                        <div className="mt-1 text-[14px] font-semibold leading-5 text-[var(--seller-ink)]">
                          {caseProjection?.listingLifecyclePhase.primaryActionLabel || '主动作'}
                        </div>
                      </div>
                      <span className="seller-chip seller-chip-accent">
                        {availableActionCount}/{ACTIONS.length} 可做
                      </span>
                    </div>

                    <div className="mt-3 space-y-2">
                      {(actionCards.find((card) => card.action.id === caseProjection?.listingLifecyclePhase.primaryActionId)
                        || actionCards.find(({ availability }) => availability.enabled)
                        || null) ? (
                        <CompactActionButton
                          card={(actionCards.find((card) => card.action.id === caseProjection?.listingLifecyclePhase.primaryActionId)
                            || actionCards.find(({ availability }) => availability.enabled))!}
                          onExecute={handleAction}
                          index={0}
                        />
                      ) : (
                        <div className="seller-empty px-3 py-4 text-[12px]">这套房眼下还没有能直接执行的动作。</div>
                      )}
                    </div>
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
                      概况
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDetailTab('customers')}
                      className={`seller-tab ${activeDetailTab === 'customers' ? 'seller-tab-active' : ''}`}
                    >
                      客户
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDetailTab('changes')}
                      className={`seller-tab ${activeDetailTab === 'changes' ? 'seller-tab-active' : ''}`}
                    >
                      变化
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDetailTab('evidence')}
                      className={`seller-tab ${activeDetailTab === 'evidence' ? 'seller-tab-active' : ''}`}
                    >
                      依据
                    </button>
                  </div>
                </div>

                <div className="px-3.5 py-3">
                  {activeDetailTab === 'overview' && (
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,0.98fr)_minmax(0,1.02fr)]">
                      <DeskSection title="对象状态" count="业主与房子">
                        <div className="grid gap-2 lg:grid-cols-2">
                          <SummaryPanel
                            title={caseProjection?.ownerSummary.title || '业主还在等明确反馈'}
                            detail={caseProjection?.ownerSummary.detail || deriveSellerGuidance(selectedCase)}
                            points={[
                              `信任 ${caseProjection?.ownerSummary.trust ?? Math.round(selectedCase.trust)}`,
                              `耐心 ${caseProjection?.ownerSummary.patience ?? Math.round(selectedCase.patience)}`,
                              `紧迫 ${caseProjection?.ownerSummary.urgency ?? Math.round(selectedCase.urgency)}`,
                            ]}
                          />
                          <SummaryPanel
                            title={deriveStrongPoint(selectedCase)}
                            detail={deriveWeakPoint(selectedCase)}
                            points={[
                              `客户储备 ${Math.round(selectedCase.d1)}`,
                              `房子条件 ${Math.round(selectedCase.d2)}`,
                              `业主配合 ${Math.round(selectedCase.d3)}`,
                            ]}
                          />
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <ProgressRail label="客户储备" value={selectedCase.d1} tone="chance" />
                          <ProgressRail label="房子条件" value={selectedCase.d2} tone="neutral" />
                          <ProgressRail label="业主配合" value={selectedCase.d3} tone="risk" />
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <InfoStrip label="沟通方式" value={deriveCommunicationMode(selectedCase)} />
                          <InfoStrip label="当前动作" value={deriveNextFix(selectedCase, activeOpportunities)} />
                        </div>
                      </DeskSection>
                    </div>
                  )}

                  {activeDetailTab === 'customers' && (
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,0.98fr)_minmax(0,1.02fr)]">
                      <DeskSection title="客户情况" count={`${engagedOpportunities.length} 位在跟`}>
                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                          <PoolMetric label="已接上" value={caseProjection?.customerPoolSummary.metCount ?? customerStatesForSelectedCase.length} tone="slate" />
                          <PoolMetric label="潜在人群" value={caseProjection?.customerPoolSummary.potentialCount ?? predictedOpportunities.length} tone="amber" />
                          <PoolMetric label="比较中" value={caseProjection?.customerPoolSummary.comparingCount ?? comparingCustomers.length} tone="amber" />
                          <PoolMetric
                            label="后段 / 风险"
                            value={(caseProjection?.customerPoolSummary.closingCount ?? negotiatingCustomers.length) + (caseProjection?.customerPoolSummary.atRiskCount ?? atRiskCustomers.length)}
                            tone="rose"
                          />
                        </div>

                        <div className="mt-2.5 divide-y divide-[color:var(--seller-border)]">
                          {engagedOpportunities.slice(0, 4).map((model) => (
                            <div key={model.opportunity.id}>
                              <OpportunityLine model={model} />
                            </div>
                          ))}
                          {engagedOpportunities.length === 0 && (
                            <div className="seller-empty px-3 py-4 text-[12px]">目前还没有真正接上的客户。</div>
                          )}
                        </div>
                      </DeskSection>

                      <DeskSection title="潜在人群" count={`${predictedOpportunities.length} 组`}>
                        <div className="space-y-1.5">
                          {potentialSignalRows.slice(0, 4).map((row) => (
                            <div key={row.id}>
                              <PotentialSignalLine row={row} />
                            </div>
                          ))}
                          {potentialSignalRows.length === 0 && (
                            <div className="seller-empty px-3 py-3 text-[11px]">暂时还没有新的潜在人群信号。</div>
                          )}
                        </div>
                      </DeskSection>
                    </div>
                  )}

                  {activeDetailTab === 'changes' && (
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                      <DeskSection title="最近变化" count={`${caseProjection?.recentChanges.length || 0} 条`}>
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
                      <DeskSection title="判断依据" count={`${caseProjection?.factChain.length || 0} 条`}>
                        <div className="space-y-1.5">
                          {caseProjection?.factChain.slice(0, 6).map((fact) => (
                            <div key={fact.id}>
                              <FactLine fact={fact} />
                            </div>
                          ))}
                          {!caseProjection || caseProjection.factChain.length === 0 ? (
                            <div className="seller-empty px-3 py-3 text-[11px]">目前还没有足够依据。</div>
                          ) : null}
                        </div>
                      </DeskSection>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <aside className="flex min-h-0 flex-col gap-3">
              <section className="seller-panel-muted px-3.5 py-3">
                <div className="seller-label">这套房卡在哪</div>
                <div className="mt-2 text-[15px] font-semibold leading-5 text-[var(--seller-ink)]">
                  {caseProjection?.listingLifecyclePhase.coreProblemLabel || '继续推进'}
                </div>
                <p className="seller-body mt-1 text-[11px] leading-5">
                  {caseProjection?.listingLifecyclePhase.phaseRiskHint || caseProjection?.nextStepLine || '别让这套房继续停住。'}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {caseProjection?.listingLifecyclePhase && (
                    <span className="seller-chip seller-chip-accent">
                      当前动作：{caseProjection.listingLifecyclePhase.primaryActionLabel}
                    </span>
                  )}
                  {latestScoreSnapshot ? (
                    <span className={latestScoreSnapshot.delta >= 0 ? 'seller-chip seller-chip-chance' : 'seller-chip seller-chip-risk'}>
                      {latestScoreSnapshot.delta >= 0 ? '+' : ''}{Math.round(latestScoreSnapshot.delta * 10) / 10} 分
                    </span>
                  ) : null}
                </div>
              </section>

              <DeskSection title="暂不可做" count={`${activeActionCategory?.blockedCards.length || 0} 项`}>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {actionCardsByCategory.map(({ category, availableCards }) => (
                    <button
                      key={category.id}
                      onClick={() => setActiveActionTab(category.id as ActionCategoryTab)}
                      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] transition-colors ${
                        activeActionCategory?.category.id === category.id
                          ? 'bg-[var(--seller-ink)] text-[var(--seller-bg)]'
                          : 'bg-[rgba(255,255,255,0.05)] text-[var(--seller-muted)] hover:bg-[rgba(255,255,255,0.08)]'
                      }`}
                    >
                      {category.name} · {availableCards.length}
                    </button>
                  ))}
                </div>

                {activeActionCategory && (
                  <>
                    <div className="mt-2 space-y-2">
                      {activeActionCategory.blockedCards.slice(0, 3).map((card) => (
                        <div key={card.action.id}>
                          <BlockedActionLine card={card} />
                        </div>
                      ))}
                      {activeActionCategory.blockedCards.length === 0 && (
                        <div className="seller-empty px-3 py-4 text-[12px]">这一类动作目前没有明显阻塞。</div>
                      )}
                    </div>
                  </>
                )}
              </DeskSection>

              <DeskSection title="执行清单" count={`${executionChecklist.length || 0} 步`}>
                <div className="space-y-1.5">
                  {executionChecklist.map((entry, index) => (
                    <div key={`${entry.title}-${index}`}>
                      <MatterLine matter={entry} compact />
                    </div>
                  ))}
                  {executionChecklist.length === 0 && (
                    <div className="seller-empty px-3 py-3 text-[11px]">这套房今天没有特别紧的事项。</div>
                  )}
                </div>
              </DeskSection>

            </aside>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[var(--seller-subtle)] italic">选择一个房源开始经营</div>
        )}
      </main>

      {decisionConfig && (
        <ActionDecisionOverlay
          config={decisionConfig}
          onChoose={(optionId, assistOptionId, choices, feedbacks) => {
            if (!decisionConfig.isScenario) {
              onExecuteAction(decisionConfig.actionId, selectedCase, optionId);
              setDecisionConfig(null);
            }
          }}
          onComplete={(result, choices, feedbacks) => {
            if (onExecuteScenarioAction && selectedCase) {
              onExecuteScenarioAction(decisionConfig.actionId, selectedCase, result);
            } else {
              const mainStrategy = choices.length > 0 ? choices[0].main : null;
              onExecuteAction(decisionConfig.actionId, selectedCase, mainStrategy);
            }
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
      <div className="mb-1 flex justify-between text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--seller-subtle)]">
        <span>{label}</span>
        <span>{Math.round(val)}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.07)]">
        <div className="h-full bg-[var(--seller-accent)]" style={{ width: `${val}%` }} />
      </div>
    </div>
  );
}

function DiagnosisCard({
  label,
  value,
  detail,
  tone,
  metrics,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'slate' | 'amber' | 'emerald' | 'rose';
  metrics: Array<{ label: string; value: string }>;
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-[color:var(--seller-accent)]/28 bg-[var(--seller-accent-soft)]'
      : tone === 'amber'
        ? 'border-[color:var(--seller-chance)]/24 bg-[var(--seller-chance-soft)]'
        : tone === 'rose'
          ? 'border-[color:var(--seller-risk)]/28 bg-[var(--seller-risk-soft)]'
          : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)]';

  return (
    <div className={`rounded-[14px] border px-3 py-3 ${toneClass}`}>
      <div className="seller-label">{label}</div>
      <div className="mt-2 text-[13px] font-semibold leading-5 text-[var(--seller-ink)]">{value}</div>
      <p className="seller-body mt-1 line-clamp-2 text-[11px] leading-5">{detail}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {metrics.map((metric) => (
          <span key={`${label}-${metric.label}`} className="seller-chip">
            {metric.label} · {metric.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function PoolMetric({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'amber' | 'rose' }) {
  const toneClass = tone === 'emerald'
    ? 'border-[color:var(--seller-accent)]/24 bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]'
    : tone === 'amber'
      ? 'border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)] text-[var(--seller-chance)]'
      : tone === 'rose'
        ? 'border-[color:var(--seller-risk)]/24 bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]'
        : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] text-[var(--seller-ink)]';
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${toneClass}`}>
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-70">{label}</div>
      <div className="mt-1 text-[17px] font-semibold">{value}</div>
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
  points: string[];
}) {
  return (
    <div className="seller-tablet px-3 py-2.5">
      <div className="text-[12px] font-semibold leading-5 text-[var(--seller-ink)]">{title}</div>
      <p className="seller-body mt-1 text-[11px] leading-5">{detail}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {points.map((point) => (
          <span key={`${title}-${point}`} className="seller-chip">
            {point}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProgressRail({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'chance' | 'risk' }) {
  const colorClass = tone === 'chance' ? 'bg-[var(--seller-chance)]' : tone === 'risk' ? 'bg-[var(--seller-risk)]' : 'bg-[var(--seller-accent)]';

  return (
    <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between">
        <div className="seller-label text-[9px]">{label}</div>
        <div className="text-[10px] font-semibold text-[var(--seller-muted)]">{Math.round(value)}</div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.07)]">
        <div className={`h-full ${colorClass}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function InfoStrip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
      <div className="seller-label text-[9px]">{label}</div>
      <div className="mt-1 text-[11px] font-semibold leading-5 text-[var(--seller-ink)]">{value}</div>
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

function PriceLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-[12px] border px-3 py-2.5 ${strong ? 'border-[color:var(--seller-accent)]/28 bg-[var(--seller-accent-soft)]' : 'border-[color:var(--seller-border)] bg-[rgba(255,255,255,0.03)]'}`}>
      <div className="seller-label text-[9px]">{label}</div>
      <div className={`mt-1 ${strong ? 'text-[18px] text-[var(--seller-accent)]' : 'text-[13px] text-[var(--seller-ink)]'} font-semibold`}>{value}</div>
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

function MatterLine({
  matter,
  compact = false,
}: {
  matter: { title: string; detail: string; badge: string; tone: 'rose' | 'amber' | 'emerald' };
  compact?: boolean;
}) {
  const toneClass = matter.tone === 'rose'
    ? 'bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]'
    : matter.tone === 'amber'
      ? 'bg-[var(--seller-chance-soft)] text-[var(--seller-chance)]'
      : 'bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]';

  return (
    <div className={compact ? 'rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5' : 'py-2.5'}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-[var(--seller-ink)]">{matter.title}</div>
          <p className="seller-body mt-0.5 line-clamp-2 text-[11px] leading-5">{matter.detail}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${toneClass}`}>{matter.badge}</span>
      </div>
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

function CompactActionButton({
  card,
  onExecute,
  index,
}: {
  card: ActionWorkspaceCard;
  onExecute: (actionId: string) => void;
  index?: number;
}) {
  const { action, hint } = card;
  const primary = index === 0;

  return (
    <button
      type="button"
      onClick={() => onExecute(action.id)}
      className={`w-full rounded-[12px] border px-3 py-2.5 text-left transition ${
        primary
          ? 'border-[color:var(--seller-accent)]/38 bg-[var(--seller-accent-soft)] hover:border-[color:var(--seller-accent)]/56'
          : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] hover:border-[var(--seller-border-strong)] hover:bg-[rgba(255,255,255,0.05)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-[12px] font-semibold ${primary ? 'text-[var(--seller-accent)]' : 'text-[var(--seller-ink)]'}`}>{action.name}</div>
          <p className="seller-body mt-0.5 line-clamp-2 text-[11px] leading-5">{hint}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${primary ? 'bg-[var(--seller-accent)] text-[var(--seller-bg)]' : 'bg-[rgba(255,255,255,0.06)] text-[var(--seller-muted)]'}`}>
          {costText(action)}
        </span>
      </div>
    </button>
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

function deriveActionHint(actionId: string, caseItem: Case, opportunities: any[]) {
  if (actionId === 'first-visit') return !caseItem.hasCompletedFirstVisit ? '当前还没完成首次面访。' : '首次面访已经完成。';
  if (actionId === 'weekly-feedback') return caseItem.trust < 60 ? '业主关系已经有点发紧。'
    : '业主关系还稳。';
  if (actionId === 'deep-diagnosis') return opportunities.some(o => o.visibility === 'shadow') ? `还有 ${opportunities.filter(o => o.visibility === 'shadow').length} 位客户没核实。`
    : '重点看价格和带看反馈。';
  if (actionId === 'story') return caseItem.d2 < 70 ? '房子卖点还没讲透。'
    : '房子卖点基础不错。';
  if (actionId === 'pricing-advice') return `挂牌 ${caseItem.askPrice} 万，对比市场常见成交价 ${caseItem.marketPrice} 万。`;
  if (actionId === 'ask-psychological-price') return `当前底价 ${caseItem.bottomPrice} 万，业主心里真正能接受的价格还没完全说出来。`;
  if (actionId === 'adjust-listing-price') return caseItem.askPrice > caseItem.marketPrice * 1.03 ? '当前挂牌价明显高于市场常见成交价。'
    : '当前挂牌价和市场常见成交价差距较小。';
  if (actionId === 'xiaohongshu-boost') return opportunities.length > 0 ? '现在有客户在看，投放能继续放大热度。': '现在客户少，更需要拉新客。';
  if (actionId === 'broker-broadcast') return opportunities.filter(o => o.visibility === 'shadow').length > 0 ? '还有客户没核实，发合作经纪人更容易补线索。': '可以再补一波外部客源。';
  if (actionId === 'private-referral') return caseItem.trust >= 60 ? '业主关系还行，适合走熟人介绍。': '业主关系偏弱，先别急着做熟人介绍。';
  if (actionId === 'open-day') return caseItem.heat >= 55 ? '现在热度还可以，开放日有机会放大到访。': '现在热度一般，开放日更偏拉新。';
  if (actionId === 'showing') return opportunities.some(o => o.stageIndex >= 1 && o.visibility !== 'shadow') ? '当前已有客户进入可带看阶段。'
    : '当前还没有客户进入可带看阶段。';
  if (actionId === 'sincerity-sale') return opportunities.some(o => o.stageIndex >= 2 && o.visibility !== 'shadow') ? '当前已有客户开始接近成交阶段。'
    : '当前客户阶段还不足以触发诚意卖。';
  if (actionId === 'invite-customer-negotiation') return opportunities.some(o => o.stageIndex >= 3 && o.visibility !== 'shadow') ? '当前已有客户接近报价或议价阶段。'
    : '当前还没有客户进入谈判区。';
  return '结合当前情况查看。';
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

function deriveWindowLabel(caseItem: Case, opportunities: any[]) {
  if (caseItem.windowDays <= 5) return '再拖容易失手';
  if (opportunities.some(o => o.daysLeft <= 2 && o.visibility !== 'shadow')) return '已有客户在掉线边缘';
  if (opportunities.some(o => o.visibility === 'shadow')) return '还有客户没核实';
  return '还要继续往前推';
}

function deriveManagerTake(caseItem: Case, opportunities: any[]) {
  if (caseItem.status === 'lost_to_rival') return '这套房已经在别处成交';
  if (caseItem.status === 'withdrawn') return '这套房已经核销';
  if (caseItem.riskFlags?.includes('要价偏高')) return '现在最大问题是价格偏高';
  if (opportunities.some(o => o.visibility === 'shadow')) return '还有客户没核实清楚';
  if (opportunities.some(o => o.stageIndex >= 3)) return '已经有客户快谈到成交了';
  return '这套房还在推进，但不能断跟';
}

function deriveSellerGuidance(caseItem: Case) {
  if (caseItem.trust < 55) return '业主已经开始不放心，反馈要讲结果，也要讲原因。';
  if (caseItem.patience < 45) return '业主耐心不多了，沟通要更直接。';
  if (caseItem.urgency > 80) return '业主很急，更看重速度和结果。';
  return '业主现在还愿意配合。';
}

function deriveCommunicationMode(caseItem: Case) {
  if (caseItem.personality === 'pragmatic') return '用带看反馈和同类房数据说话';
  if (caseItem.personality === 'emotional') return '先稳情绪，再讲事情';
  if (caseItem.personality === 'urgent') return '强调速度和结果，不要绕太久';
  return '说法要统一，别来回变';
}

function deriveStrongPoint(caseItem: Case) {
  if (caseItem.d2 >= 75) return '房子条件不错，容易讲卖点';
  if (caseItem.d1 >= 70) return '客户储备还可以，适合继续推带看';
  if (caseItem.d3 >= 70) return '业主比较配合，动作容易落下去';
  return '目前没有明显短板';
}

function deriveWeakPoint(caseItem: Case) {
  if (caseItem.askPrice > caseItem.marketPrice * 1.05) return '价格偏高，容易卡在带看和出价';
  if (caseItem.d1 < 45) return '客户太少，带看和转化都接不上';
  if (caseItem.d3 < 50) return '业主不够配合，关键时候容易掉链子';
  return '还没有明显优势';
}

function deriveNextFix(caseItem: Case, opportunities: any[]) {
  if (opportunities.length === 0) return '补客户';
  if (opportunities.some(o => o.visibility === 'shadow')) return '核实客户';
  if (caseItem.askPrice > caseItem.marketPrice * 1.05) return '谈价格';
  return '推进带看';
}

function deriveShortCaseState(caseItem: Case, opportunities: any[]) {
  if (caseItem.status === 'sold') return '已成交';
  if (caseItem.status === 'lost_to_rival') return '他处成交';
  if (caseItem.status === 'withdrawn') return '已核销';
  if (caseItem.windowDays <= 3 || caseItem.trust < 50) return '有丢盘风险';
  if (opportunities.some(o => o.visibility !== 'shadow' && o.stageIndex >= 3)) return '快成交';
  if (opportunities.length === 0) return '缺客户';
  if (caseItem.askPrice > caseItem.marketPrice * 1.05) return '价格硬';
  if (caseItem.heat < 45) return '偏冷';
  return '在跟进';
}

function describeWindowDays(days: number) {
  if (days <= 3) return `${days} 天内`;
  if (days <= 7) return `${days} 天内要推进`;
  return `${days} 天观察期`;
}

function buildExecutionChecklist(caseItem: Case, projection: NonNullable<ReturnType<typeof buildCaseDetailProjection>>, activeOpportunityCount: number) {
  const checklist = projection.actionReasons.map((entry) => ({
    title: entry.title,
    detail: entry.detail,
    badge: entry.tone === 'risk' ? '当前问题' : entry.tone === 'chance' ? '可推进' : '待执行',
    tone: entry.tone === 'risk' ? 'rose' : entry.tone === 'chance' ? 'emerald' : 'amber',
  }));

  if (projection.currentRiskTags.length > 0) {
    checklist.unshift({
      title: projection.currentRiskTags[0],
      detail: `${caseItem.title} 当前最容易掉在这个点上。`,
      badge: '风险点',
      tone: 'rose',
    });
  }

  if (activeOpportunityCount === 0) {
    checklist.push({
      title: '把第一批客户接出来',
      detail: '现在还没人真正接上，这套房的第一步是补到访和补接触。',
      badge: '补客户',
      tone: 'amber',
    });
  }

  return checklist.slice(0, 3);
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

function deriveListingAgeLabel(caseItem: Case) {
  if (caseItem.status === 'sold') return '已成交';
  if (caseItem.defenseOutcome === 'lost_to_rival') return '他处成交';
  if (caseItem.status === 'withdrawn') return '已核销';
  return `${Math.max(0, caseItem.windowDays)}天`;
}

function deriveHouseScoreTone(score: number): 'emerald' | 'amber' | 'rose' {
  if (score >= 75) return 'emerald';
  if (score >= 60) return 'amber';
  return 'rose';
}

function CompactTag({
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
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold leading-none ${toneClass}`}>
      <span className="text-[var(--seller-subtle)]">{label}</span>
      <span>{value}</span>
    </span>
  );
}
