import React, { useEffect, useMemo, useState } from 'react';
import { GameState, Case } from '../../domain/models';
import { buildCaseDetailProjection } from '../../application/projections/operatingProjection.js';
import { ACTIONS, ACTION_CATEGORIES } from '../../domain/constants';
import { getActionTemplate } from '../../domain/actions/templates';
import { costText, caseSortValue } from '../../domain/utils';
import { getActiveOpportunities, getActionAvailability } from '../../domain/engine';
import { PERSONALITIES } from '../../domain/constants';
import { Home as HomeIcon, MapPin, Trophy, Users, Heart, History, Star } from 'lucide-react';
import { deriveCaseFollowUpPriority } from './followUpPriority';
import { buildOpportunityViewModels, type OpportunityViewModel } from './caseOpportunityViewModel';

interface CasesProps {
  state: GameState;
  onSelectCase: (id: string) => void;
  onExecuteAction: (actionId: string, caseItem: any, optionId?: string | null) => boolean;
}

type ActionCategoryTab = 'feedback' | 'marketing' | 'pricing' | 'negotiation';
type ActionDecisionConfig = {
  actionId: string;
  title: string;
  summary: string;
  body: string;
  actorLabel: string;
  metricFocus: string[];
  options: Array<{ id: string; title: string; note: string }>;
};
type ActionWorkspaceCard = {
  action: typeof ACTIONS[number];
  availability: ReturnType<typeof getActionAvailability>;
  hint: string;
};
type CaseStageFilter = 'all' | 'pre-visit' | 'operating' | 'pricing' | 'negotiating' | 'closed';
type CaseQuickFilter = 'focused' | 'urgent' | 'price' | 'late-stage';
const CASE_STAGE_FILTERS: Array<{ id: CaseStageFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'pre-visit', label: '待面访' },
  { id: 'operating', label: '跟进中' },
  { id: 'pricing', label: '定价中' },
  { id: 'negotiating', label: '谈判中' },
  { id: 'closed', label: '已结算' },
];

const CASE_QUICK_FILTERS: Array<{ id: CaseQuickFilter; label: string }> = [
  { id: 'focused', label: '本周聚焦' },
  { id: 'urgent', label: '窗口短' },
  { id: 'price', label: '价格偏硬' },
  { id: 'late-stage', label: '快成交客户' },
];

export function Cases({ state, onSelectCase, onExecuteAction }: CasesProps) {
  const { cases, selectedCaseId } = state;
  const [stageFilter, setStageFilter] = useState<CaseStageFilter>('all');
  const [quickFilter, setQuickFilter] = useState<CaseQuickFilter | null>(null);
  const sortedCases = [...cases].sort((a, b) => deriveCaseListPriority(state, b) - deriveCaseListPriority(state, a));
  const visibleCases = sortedCases.filter((entry) => matchStageFilter(entry, stageFilter)).filter((entry) => matchQuickFilter(state, entry, quickFilter));
  const selectedCase = sortedCases.find((entry) => entry.id === selectedCaseId) || visibleCases[0] || sortedCases[0];
  const selectionHiddenByFilter = Boolean(selectedCase && !visibleCases.some((entry) => entry.id === selectedCase.id));
  const activeOpportunities = selectedCase ? getActiveOpportunities(state, selectedCase.id) : [];

  const [decisionConfig, setDecisionConfig] = useState<ActionDecisionConfig | null>(null);
  const [activeActionTab, setActiveActionTab] = useState<ActionCategoryTab>('feedback');

  const caseProjection = selectedCase ? buildCaseDetailProjection(state, selectedCase) : null;
  const followUpPriority = selectedCase ? deriveCaseFollowUpPriority(state, selectedCase) : null;
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
  const caseAgenda = useMemo(
    () => (selectedCase && caseProjection ? buildCaseAgenda(selectedCase, caseProjection, activeOpportunities.length) : []),
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
  }, [selectedCase?.id]);

  const handleAction = (actionId: string) => {
    if (!selectedCase) return;

    const action = ACTIONS.find(a => a.id === actionId);
    if (!action) return;

    const template = getActionTemplate(action);
    const options = template?.getStrategies(state, selectedCase, action) || [];
    if (template && options.length > 0) {
      setDecisionConfig({
        actionId,
        title: `${selectedCase.title} · ${action.name}`,
        summary: action.summary || template.summary,
        body: template.buildBody(state, selectedCase, action),
        actorLabel: deriveActorLabel(template.actor),
        metricFocus: template.metricFocus.map(deriveMetricLabel),
        options: options.map(option => ({
          id: option.id,
          title: option.title,
          note: option.note,
        })),
      });
      return;
    }

    onExecuteAction(actionId, selectedCase);
  };

  return (
    <div className="grid min-h-full grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
      <aside className="seller-panel sticky top-0 flex max-h-full flex-col overflow-hidden">
        <div className="z-10 space-y-3 border-b border-black/[0.04] bg-white/95 px-3 pb-3 pt-3 backdrop-blur">
          <div>
            <div className="seller-label">阶段</div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {CASE_STAGE_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setStageFilter(filter.id)}
                  className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                    stageFilter === filter.id ? 'bg-[var(--seller-ink)] text-white' : 'bg-[rgba(255,255,255,0.7)] text-[var(--seller-muted)]'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="seller-label">快速筛选</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {CASE_QUICK_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setQuickFilter((current) => current === filter.id ? null : filter.id)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                    quickFilter === filter.id ? 'seller-chip-chance' : 'bg-[rgba(255,255,255,0.7)] text-[var(--seller-muted)]'
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
            className={`relative cursor-pointer overflow-hidden rounded-[12px] border px-2.5 py-2.5 transition-all ${
              c.id === selectedCase?.id
                ? 'border-[color:var(--seller-ink)] bg-[var(--seller-paper)] shadow-inner'
                : 'border-transparent bg-white/60 hover:bg-white'
            }`}
          >
              {c.isFocused && (
                <div className="absolute right-0 top-0 rounded-bl-xl bg-amber-500 p-1 text-white shadow-lg animate-pulse">
                  <Star size={10} fill="currentColor" />
                </div>
              )}
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] ${
                c.isFocused ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {c.isFocused ? '本周聚焦' : c.stageLabel}
              </span>
              <small className="pt-0.5 text-[9px] font-medium text-slate-400">{c.district}</small>
            </div>
            <strong className="block line-clamp-1 text-[13px] font-semibold leading-5 text-slate-800">{c.title}</strong>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500">
              <span>{c.community}</span>
              <span className="text-slate-300">/</span>
              <span>{c.layout} · {c.area}㎡</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <CompactTag label="剩余" value={deriveListingAgeLabel(c)} tone="amber" />
              <CompactTag
                label="状态"
                value={deriveShortCaseState(c, getActiveOpportunities(state, c.id))}
                tone={deriveHouseScoreTone(c.competitiveness)}
              />
              <CompactTag label="窗口" value={deriveWindowLabel(c, getActiveOpportunities(state, c.id))} tone="rose" />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <CompactMetric label="信" val={c.trust} />
              <CompactMetric label="热" val={c.heat} />
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[8px] font-bold ${
                c.personality === 'pragmatic' ? 'bg-emerald-100 text-emerald-600' :
                c.personality === 'emotional' ? 'bg-indigo-100 text-indigo-600' : 'bg-rose-100 text-rose-600'
              }`}>
                {PERSONALITIES[c.personality as keyof typeof PERSONALITIES]?.label}
                </span>
              </div>
            </div>
          ))}
          {visibleCases.length === 0 && (
            <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-400">
              当前筛选下没有房源，换个阶段或取消快速筛选看看。
            </div>
          )}
          {selectionHiddenByFilter && selectedCase && (
            <div className="rounded-[16px] border border-amber-200 bg-amber-50/60 px-4 py-4 text-[12px] text-amber-800">
              当前正在看 <strong>{selectedCase.title}</strong>，但它不在这组筛选里。
            </div>
          )}
        </div>
      </aside>

      <main className="seller-panel flex min-w-0 flex-col p-3 lg:p-3.5">
        {selectedCase ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <section className="seller-panel-muted px-3.5 py-3">
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_232px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="seller-title text-[18px] leading-6">{selectedCase.title}</h2>
                    <span className="seller-chip bg-[var(--seller-ink)] text-white">{selectedCase.stageLabel}</span>
                    {selectedCase.isFocused && (
                      <span className="seller-chip seller-chip-accent flex items-center gap-1">
                        <Star size={11} fill="currentColor" />
                        本周聚焦
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1"><HomeIcon size={12} />{selectedCase.community}</span>
                    <span className="flex items-center gap-1"><MapPin size={12} />{selectedCase.district}</span>
                    <span>{selectedCase.layout} · {selectedCase.area}㎡</span>
                    {selectedCase.personality && (
                      <span>业主类型 · {PERSONALITIES[selectedCase.personality as keyof typeof PERSONALITIES]?.label}</span>
                    )}
                  </div>
                  <div className="mt-2.5 text-[14px] font-semibold leading-5 text-slate-900">
                    {caseProjection?.headline || deriveManagerTake(selectedCase, activeOpportunities)}
                  </div>
                  <p className="seller-body mt-1 line-clamp-2 max-w-[78ch] text-[11px] leading-5">
                    {caseProjection?.actionReasons[0]?.detail || '先把今天最该做的一步落下去，再看有没有新的客户变化。'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-1.5 xl:grid-cols-1">
                  <PriceLine label="挂牌价" value={`${selectedCase.askPrice} 万`} strong />
                  <PriceLine label="市场常见成交价" value={`${selectedCase.marketPrice} 万`} />
                  <PriceLine label="业主底线" value={`${selectedCase.bottomPrice} 万`} />
                </div>
              </div>
            </section>

            <section className="grid min-h-0 flex-1 grid-cols-1 gap-3 2xl:grid-cols-[0.92fr_1.05fr_0.92fr]">
              <DeskSection title="房产信息" count="4 项">
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label="好房分" value={`${Math.round(selectedCase.competitiveness)}分`} tone={deriveHouseScoreTone(selectedCase.competitiveness)} />
                  <MiniStat label="窗口" value={deriveWindowLabel(selectedCase, activeOpportunities)} tone="rose" />
                  <MiniStat label="业主" value={deriveTrustLabel(selectedCase.trust)} tone={deriveTrustTone(selectedCase.trust)} />
                  <MiniStat label="客户" value={deriveHeatLabel(selectedCase.heat)} tone={deriveHeatTone(selectedCase.heat)} />
                </div>

                <div className="seller-tablet mt-2.5 px-3 py-2.5">
                  <div className="seller-label">价格判断</div>
                  <div className={`mt-1 text-[12px] font-semibold leading-5 ${selectedCase.askPrice <= selectedCase.marketPrice ? 'text-emerald-700' : 'text-[color:var(--seller-risk)]'}`}>
                    {caseProjection?.priceSummary.title || derivePricePosition(selectedCase)}
                  </div>
                  <p className="seller-body mt-1 line-clamp-3 text-[11px] leading-5">
                    {caseProjection?.priceSummary.detail || '价格会直接影响客户看完以后愿不愿意继续往后走。'}
                  </p>
                </div>

                <div className="mt-2.5 grid grid-cols-1 gap-2">
                  <DetailStat label="客户储备" val={selectedCase.d1} icon={<Users size={14} />} color="bg-sky-500" />
                  <DetailStat label="房子条件" val={selectedCase.d2} icon={<HomeIcon size={14} />} color="bg-slate-900" />
                  <DetailStat label="业主配合" val={selectedCase.d3} icon={<Heart size={14} />} color="bg-rose-500" />
                </div>
              </DeskSection>

              <DeskSection title="事项" count={`${caseAgenda.length || 1} 条`}>
                {followUpPriority && (
                  <div className="seller-tablet mb-2.5 px-3 py-2.5">
                    <div className="seller-label">今天先处理</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="seller-chip bg-[var(--seller-ink)] text-white">{followUpPriority.label}</span>
                      <span className="seller-chip">{followUpPriority.metric}</span>
                    </div>
                    <p className="seller-body mt-1.5 line-clamp-2 text-[11px] leading-5">
                      {caseProjection?.nextStepLine || followUpPriority.reason}
                    </p>
                  </div>
                )}

                <div className="divide-y divide-slate-200/70">
                  {caseAgenda.map((entry, index) => (
                    <div key={`${entry.title}-${index}`}>
                      <MatterLine matter={entry} />
                    </div>
                  ))}
                  {caseAgenda.length === 0 && (
                    <div className="seller-empty px-3 py-4 text-[12px]">这套房今天没有特别紧的事项。</div>
                  )}
                </div>

                {caseProjection && (
                  <div className="mt-2.5 border-t border-slate-200/70 pt-2.5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="seller-label flex items-center gap-1.5">
                        <History size={12} />
                        最近变化
                      </div>
                      {latestScoreSnapshot && (
                        <span className={`text-[10px] font-bold ${latestScoreSnapshot.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {latestScoreSnapshot.delta >= 0 ? '+' : ''}
                          {Math.round(latestScoreSnapshot.delta * 10) / 10}pts
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {caseProjection.recentChanges.slice(0, 2).map((change) => (
                        <div key={change.id}>
                          <RecentChangeLine change={change} />
                        </div>
                      ))}
                      {caseProjection.recentChanges.length === 0 && (
                        <div className="seller-empty px-3 py-3 text-[11px]">目前还没有新变化。</div>
                      )}
                    </div>
                  </div>
                )}
              </DeskSection>

              <DeskSection title="机会" count={`${engagedOpportunities.length} 位`}>
                <div className="grid grid-cols-2 gap-1.5">
                  <PoolMetric label="已接上" value={caseProjection?.customerPoolSummary.metCount ?? customerStatesForSelectedCase.length} tone="slate" />
                  <PoolMetric label="潜在人群" value={caseProjection?.customerPoolSummary.potentialCount ?? predictedOpportunities.length} tone="amber" />
                  <PoolMetric label="比较中" value={caseProjection?.customerPoolSummary.comparingCount ?? comparingCustomers.length} tone="amber" />
                  <PoolMetric
                    label="快成交 / 快流失"
                    value={(caseProjection?.customerPoolSummary.closingCount ?? negotiatingCustomers.length) + (caseProjection?.customerPoolSummary.atRiskCount ?? atRiskCustomers.length)}
                    tone="rose"
                  />
                </div>

                <div className="mt-2.5 divide-y divide-slate-200/70">
                  {engagedOpportunities.slice(0, 4).map((model) => (
                    <div key={model.opportunity.id}>
                      <OpportunityLine model={model} />
                    </div>
                  ))}
                  {engagedOpportunities.length === 0 && (
                    <div className="seller-empty px-3 py-4 text-[12px]">目前还没有接上的客户。</div>
                  )}
                </div>

                <div className="mt-2.5 border-t border-slate-200/70 pt-2.5">
                  <div className="seller-label">潜在人群信号</div>
                  <div className="mt-1.5 space-y-1.5">
                    {potentialSignalRows.slice(0, 2).map((row) => (
                      <div key={row.id}>
                        <PotentialSignalLine row={row} />
                      </div>
                    ))}
                    {potentialSignalRows.length === 0 && (
                      <div className="seller-empty px-3 py-3 text-[11px]">还没有明显潜在人群。</div>
                    )}
                  </div>
                </div>
              </DeskSection>
            </section>

            <section className="seller-panel-muted px-3.5 py-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-2">
                  <div className="seller-label">今天能做的事</div>
                  <span className="seller-chip">{availableActionCount}/{ACTIONS.length} 可做</span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                  {actionCardsByCategory.map(({ category, availableCards }) => (
                    <button
                      key={category.id}
                      onClick={() => setActiveActionTab(category.id as ActionCategoryTab)}
                      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                        activeActionCategory?.category.id === category.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {category.name} · {availableCards.length}
                    </button>
                  ))}
                </div>
              </div>

              {activeActionCategory && (
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
                  {activeActionCategory.availableCards.map(card => (
                    <div key={card.action.id}>
                      <CompactActionButton card={card} onExecute={handleAction} />
                    </div>
                  ))}
                  {activeActionCategory.availableCards.length === 0 && (
                    <div className="seller-empty px-3 py-4 text-[12px]">这一类动作当前没有可直接执行的项。</div>
                  )}
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-slate-400 italic">选择一个房源开始经营</div>
        )}
      </main>

      {decisionConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm">
          <div className="max-w-lg w-full animate-in zoom-in rounded-[32px] bg-white p-8 shadow-2xl fade-in duration-200">
            <h3 className="mb-2 text-[18px] font-bold text-slate-900">{decisionConfig.title}</h3>
            <div className="mb-4 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.18em]">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-500">{decisionConfig.actorLabel}</span>
              {decisionConfig.metricFocus.map(metric => (
                <span key={metric} className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                  {metric}
                </span>
              ))}
            </div>
            <p className="mb-2 text-[13px] font-semibold leading-relaxed text-slate-800">{decisionConfig.summary}</p>
            <p className="mb-6 text-[12px] leading-relaxed text-slate-500">{decisionConfig.body}</p>
            <div className="space-y-3">
              {decisionConfig.options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    onExecuteAction(decisionConfig.actionId, selectedCase, opt.id);
                    setDecisionConfig(null);
                  }}
                  className="group w-full rounded-2xl border border-black/[0.03] bg-slate-50 p-4 text-left transition-all hover:border-emerald-500 hover:bg-emerald-50"
                >
                  <strong className="block text-slate-800 group-hover:text-emerald-700">{opt.title}</strong>
                  <p className="mt-1 text-[11px] text-slate-400">{opt.note}</p>
                </button>
              ))}
            </div>
            <div className="mt-8 flex justify-end">
              <button
                onClick={() => setDecisionConfig(null)}
                className="rounded-full px-6 py-2 text-[12px] font-bold uppercase tracking-widest text-slate-400 transition-colors hover:text-slate-600"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailStat({ label, val, icon, color = "bg-slate-900" }: { label: string; val: number; icon: React.ReactNode; color?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.14em]">
        {icon} <span>{label}</span>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} transition-all duration-500 ease-out`} 
          style={{ width: `${val}%` }} 
        />
      </div>
      <div className="text-right text-[10px] font-semibold text-slate-500">{Math.round(val)}</div>
    </div>
  );
}

function CompactMetric({ label, val }: { label: string; val: number }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex justify-between text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
        <span>{label}</span>
        <span>{Math.round(val)}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-black/5">
        <div className="h-full bg-emerald-500" style={{ width: `${val}%` }} />
      </div>
    </div>
  );
}

function PoolMetric({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'amber' | 'rose' }) {
  const toneClass = tone === 'emerald'
    ? 'bg-emerald-50 text-emerald-700'
    : tone === 'amber'
      ? 'bg-amber-50 text-amber-700'
      : tone === 'rose'
        ? 'bg-rose-50 text-rose-700'
        : 'bg-slate-50 text-slate-700';
  return (
    <div className={`rounded-xl px-4 py-3 ${toneClass}`}>
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-70">{label}</div>
      <div className="mt-1.5 text-[20px] font-semibold">{value}</div>
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
        {count && <span className="text-[10px] font-semibold text-slate-400">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function PriceLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-[12px] border px-3 py-2.5 ${strong ? 'border-slate-200 bg-white' : 'border-[color:var(--seller-border)] bg-white/78'}`}>
      <div className="seller-label text-[9px]">{label}</div>
      <div className={`mt-1 ${strong ? 'text-[18px]' : 'text-[13px]'} font-semibold text-slate-900`}>{value}</div>
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
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-700 border-amber-100'
        : tone === 'rose'
          ? 'bg-rose-50 text-rose-700 border-rose-100'
          : 'bg-slate-50 text-slate-700 border-slate-200';

  return (
    <div className={`rounded-[12px] border px-3 py-2 ${toneClass}`}>
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] opacity-70">{label}</div>
      <div className="mt-1 text-[12px] font-semibold leading-5">{value}</div>
    </div>
  );
}

function MatterLine({
  matter,
}: {
  matter: { title: string; detail: string; badge: string; tone: 'rose' | 'amber' | 'emerald' };
}) {
  const toneClass = matter.tone === 'rose'
    ? 'bg-rose-50 text-rose-700'
    : matter.tone === 'amber'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-emerald-50 text-emerald-700';

  return (
    <div className="py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-slate-900">{matter.title}</div>
          <p className="seller-body mt-0.5 line-clamp-2 text-[11px] leading-5">{matter.detail}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${toneClass}`}>{matter.badge}</span>
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
    ? 'bg-rose-50 text-rose-700'
    : change.tone === 'chance'
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-slate-100 text-slate-600';

  return (
    <div className="rounded-[12px] border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{change.label}</div>
          <div className="mt-0.5 text-[12px] font-semibold text-slate-900">{change.title}</div>
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
          <div className="text-[12px] font-semibold text-slate-900">
            {model.customer?.name || model.opportunity.customerName}
          </div>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {model.profileLine}
          </p>
          <p className="seller-body mt-1 line-clamp-2 text-[11px] leading-5">{model.opportunityStatusDetail}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">
            {model.opportunity.stageLabel}
          </span>
          <div className="mt-1 text-[10px] text-slate-400">{model.urgencyLabel}</div>
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
    <div className="rounded-[12px] border border-amber-100 bg-amber-50/55 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-slate-900">{row.title}</div>
          <p className="seller-body mt-0.5 line-clamp-2 text-[11px] leading-5">{row.detail}</p>
          <div className="mt-1 text-[10px] text-slate-500">{row.budgetLine}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] font-semibold text-amber-700">{row.count} 组</div>
          <div className="mt-1 text-[10px] text-slate-400">{row.urgency}</div>
        </div>
      </div>
    </div>
  );
}

function CompactActionButton({
  card,
  onExecute,
}: {
  card: ActionWorkspaceCard;
  onExecute: (actionId: string) => void;
}) {
  const { action, hint } = card;
  return (
    <button
      type="button"
      onClick={() => onExecute(action.id)}
      className="rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-slate-300 hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-slate-900">{action.name}</div>
          <p className="seller-body mt-0.5 line-clamp-2 text-[11px] leading-5">{hint}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">
          {costText(action)}
        </span>
      </div>
    </button>
  );
}

function deriveActorLabel(actor: 'owner' | 'market' | 'customer') {
  if (actor === 'owner') return '这次主要在和业主博弈';
  if (actor === 'customer') return '这次主要在和客户博弈';
  return '这次主要在和市场博弈';
}

function deriveMetricLabel(metric: string) {
  const labels: Record<string, string> = {
    trust: '信任',
    patience: '耐心',
    urgency: '紧迫度',
    heat: '热度',
    competitiveness: '好房分',
    d1: '客户数量',
    d2: '房子条件',
    d3: '业主配合',
    windowDays: '窗口',
    askPrice: '挂牌价',
    intent: '客户意向',
    confidence: '成交把握',
    promotionBudget: '推广金',
    wordOfMouth: '口碑',
    commission: '佣金',
  };
  return labels[metric] || metric;
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

function matchStageFilter(caseItem: Case, filter: CaseStageFilter) {
  if (filter === 'all') return true;
  if (filter === 'pre-visit') return !caseItem.hasCompletedFirstVisit && caseItem.status === 'active';
  if (filter === 'operating') return caseItem.hasCompletedFirstVisit && caseItem.status === 'active' && caseItem.stageIndex <= 2;
  if (filter === 'pricing') return caseItem.status === 'active' && (caseItem.askPrice > caseItem.marketPrice * 1.03 || caseItem.d3 < 62);
  if (filter === 'negotiating') return caseItem.status === 'active' && caseItem.stageIndex >= 3;
  return caseItem.status === 'sold' || caseItem.status === 'withdrawn' || caseItem.status === 'lost_to_rival';
}

function matchQuickFilter(state: GameState, caseItem: Case, filter: CaseQuickFilter | null) {
  if (!filter) return true;
  const opportunities = getActiveOpportunities(state, caseItem.id);

  if (filter === 'focused') return Boolean(caseItem.isFocused);
  if (filter === 'urgent') return caseItem.windowDays <= 5;
  if (filter === 'price') return caseItem.askPrice > caseItem.marketPrice * 1.04;
  return opportunities.some((entry) => entry.visibility !== 'shadow' && entry.stageIndex >= 3);
}

function derivePricePosition(caseItem: Case) {
  if (caseItem.askPrice <= caseItem.marketPrice) return '价格有竞争力';
  if (caseItem.askPrice <= caseItem.marketPrice * 1.03) return '价格略高，还能谈';
  return `比市场常见成交价高 ${caseItem.askPrice - caseItem.marketPrice} 万`;
}

function deriveWindowLabel(caseItem: Case, opportunities: any[]) {
  if (caseItem.windowDays <= 5) return '窗口很短';
  if (opportunities.some(o => o.daysLeft <= 2 && o.visibility !== 'shadow')) return '客户快流失了';
  if (opportunities.some(o => o.visibility === 'shadow')) return '还有客户没核实';
  return '窗口还稳';
}

function deriveManagerTake(caseItem: Case, opportunities: any[]) {
  if (caseItem.status === 'lost_to_rival') return '这套房已经被别人抢走了';
  if (caseItem.status === 'withdrawn') return '这套房已经撤盘了';
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
  if (caseItem.personality === 'pragmatic') return '用带看反馈和竞品数据说话';
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
  if (opportunities.length === 0) return '先补客户';
  if (opportunities.some(o => o.visibility === 'shadow')) return '先核实客户';
  if (caseItem.askPrice > caseItem.marketPrice * 1.05) return '先跟业主谈价格';
  return '先把带看往后推';
}

function deriveShortCaseState(caseItem: Case, opportunities: any[]) {
  if (caseItem.status === 'sold') return '已成交';
  if (caseItem.status === 'lost_to_rival') return '被截走';
  if (caseItem.status === 'withdrawn') return '已撤盘';
  if (caseItem.windowDays <= 3 || caseItem.trust < 50) return '快丢了';
  if (opportunities.some(o => o.visibility !== 'shadow' && o.stageIndex >= 3)) return '快成交';
  if (opportunities.length === 0) return '缺客户';
  if (caseItem.askPrice > caseItem.marketPrice * 1.05) return '价格硬';
  if (caseItem.heat < 45) return '偏冷';
  return '在跟进';
}

function buildCaseAgenda(caseItem: Case, projection: NonNullable<ReturnType<typeof buildCaseDetailProjection>>, activeOpportunityCount: number) {
  const agenda = projection.actionReasons.map((entry) => ({
    title: entry.title,
    detail: entry.detail,
    badge: entry.tone === 'risk' ? '要紧' : entry.tone === 'chance' ? '有机会' : '今天要做',
    tone: entry.tone === 'risk' ? 'rose' : entry.tone === 'chance' ? 'emerald' : 'amber',
  }));

  if (projection.currentRiskTags.length > 0) {
    agenda.unshift({
      title: projection.currentRiskTags[0],
      detail: `${caseItem.title} 现在最容易掉在这里，今天别放过。`,
      badge: '要紧',
      tone: 'rose',
    });
  }

  if (activeOpportunityCount === 0) {
    agenda.push({
      title: '先把第一批客户接出来',
      detail: '现在还没人真正接上，这套房的第一步是补到访和补接触。',
      badge: '补客户',
      tone: 'amber',
    });
  }

  return agenda.slice(0, 3);
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
  if (value >= 60) return '信号中，先做低成本承接';
  return '信号偏弱，先观察';
}

function deriveListingAgeLabel(caseItem: Case) {
  if (caseItem.status === 'sold') return '已成交';
  if (caseItem.defenseOutcome === 'lost_to_rival') return '已被抢走';
  if (caseItem.status === 'withdrawn') return '已撤盘';
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
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : tone === 'rose'
          ? 'bg-rose-50 text-rose-700 border-rose-200'
          : 'bg-slate-50 text-slate-600 border-slate-200';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold leading-none ${toneClass}`}>
      <span className="text-slate-400">{label}</span>
      <span>{value}</span>
    </span>
  );
}
