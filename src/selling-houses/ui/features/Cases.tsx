import React, { useEffect, useState } from 'react';
import { GameState, Case } from '../../domain/models';
import { ACTIONS, ACTION_CATEGORIES } from '../../domain/constants';
import { getActionTemplate } from '../../domain/actions/templates';
import { costText, caseSortValue } from '../../domain/utils';
import { getActiveOpportunities, getActionAvailability } from '../../domain/engine';
import { PERSONALITIES } from '../../domain/constants';
import { Home as HomeIcon, MapPin, Trophy, Users, Heart, History, Star, Shield, Target, TrendingUp, MessagesSquare } from 'lucide-react';

interface CasesProps {
  state: GameState;
  onSelectCase: (id: string) => void;
  onExecuteAction: (actionId: string, caseItem: any, optionId?: string | null) => boolean;
}

type CaseDetailTab = 'judgment' | 'owner' | 'score' | 'pool';
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
  { id: 'operating', label: '经营中' },
  { id: 'pricing', label: '定价中' },
  { id: 'negotiating', label: '谈判中' },
  { id: 'closed', label: '已结算' },
];

const CASE_QUICK_FILTERS: Array<{ id: CaseQuickFilter; label: string }> = [
  { id: 'focused', label: '本周聚焦' },
  { id: 'urgent', label: '窗口短' },
  { id: 'price', label: '价格偏硬' },
  { id: 'late-stage', label: '有后段客户' },
];

const DETAIL_TABS: Array<{ id: CaseDetailTab; label: string }> = [
  { id: 'judgment', label: '怎么判断' },
  { id: 'owner', label: '业主' },
  { id: 'score', label: '价格' },
  { id: 'pool', label: '准客池' },
];

export function Cases({ state, onSelectCase, onExecuteAction }: CasesProps) {
  const { cases, selectedCaseId } = state;
  const [stageFilter, setStageFilter] = useState<CaseStageFilter>('all');
  const [quickFilter, setQuickFilter] = useState<CaseQuickFilter | null>(null);
  const sortedCases = [...cases].sort((a, b) => deriveCaseListPriority(state, b) - deriveCaseListPriority(state, a));
  const visibleCases = sortedCases.filter((entry) => matchStageFilter(entry, stageFilter)).filter((entry) => matchQuickFilter(state, entry, quickFilter));
  const selectedCase = visibleCases.find(c => c.id === selectedCaseId) || visibleCases[0] || sortedCases[0];
  const activeOpportunities = selectedCase ? getActiveOpportunities(state, selectedCase.id) : [];

  const [decisionConfig, setDecisionConfig] = useState<ActionDecisionConfig | null>(null);
  const [activeTab, setActiveTab] = useState<CaseDetailTab>('judgment');
  const [activeActionTab, setActiveActionTab] = useState<ActionCategoryTab>('feedback');

  const caseMatters = selectedCase ? deriveCaseMatters(state, selectedCase, activeOpportunities) : [];
  const latestScoreSnapshot = selectedCase?.competitivenessSnapshots?.[0];
  const predictedOpportunities = activeOpportunities.filter(opportunity => opportunity.visibility === 'shadow');
  const engagedOpportunities = activeOpportunities.filter(opportunity => opportunity.visibility !== 'shadow');
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
    <div className="grid min-h-full grid-cols-1 gap-5 lg:grid-cols-[312px_1fr]">
      <aside className="sticky top-0 flex max-h-full flex-col overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-sm">
        <div className="z-10 space-y-3 border-b border-black/[0.04] bg-white/95 px-3 pb-3 pt-3 backdrop-blur">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">阶段</div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {CASE_STAGE_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setStageFilter(filter.id)}
                  className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                    stageFilter === filter.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">快速筛选</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {CASE_QUICK_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setQuickFilter((current) => current === filter.id ? null : filter.id)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                    quickFilter === filter.id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {visibleCases.map(c => (
          <div
            key={c.id}
            onClick={() => onSelectCase(c.id)}
            className={`relative cursor-pointer overflow-hidden rounded-[14px] border px-3 py-3 transition-all ${
              c.id === selectedCaseId
                ? 'border-emerald-500 bg-emerald-50/60 shadow-inner'
                : 'border-transparent bg-white hover:bg-slate-50'
            }`}
          >
              {c.isFocused && (
                <div className="absolute right-0 top-0 rounded-bl-xl bg-amber-500 p-1 text-white shadow-lg animate-pulse">
                  <Star size={10} fill="currentColor" />
                </div>
              )}
            <div className="mb-2 flex items-start justify-between gap-3">
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] ${
                c.isFocused ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {c.isFocused ? '本周聚焦' : c.stageLabel}
              </span>
              <small className="pt-0.5 text-[10px] font-medium text-slate-400">{c.district}</small>
            </div>
            <strong className="block line-clamp-1 text-[14px] font-semibold leading-5 text-slate-800">{c.title}</strong>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
              <span>{c.community}</span>
              <span className="text-slate-300">/</span>
              <span>{c.layout} · {c.area}㎡</span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <CompactTag label="剩余" value={deriveListingAgeLabel(c)} tone="amber" />
              <CompactTag
                label="状态"
                value={deriveShortCaseState(c, getActiveOpportunities(state, c.id))}
                tone={deriveHouseScoreTone(c.competitiveness)}
              />
              <CompactTag label="窗口" value={deriveWindowLabel(c, getActiveOpportunities(state, c.id))} tone="rose" />
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <CompactMetric label="信" val={c.trust} />
              <CompactMetric label="热" val={c.heat} />
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[9px] font-bold ${
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
        </div>
      </aside>

      <main className="flex flex-col rounded-[20px] border border-black/5 bg-white p-6 shadow-sm">
        {selectedCase ? (
          <>
            <div className="mb-5 rounded-[24px] border border-black/[0.04] bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 p-5">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_240px] xl:items-start">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-[22px] font-semibold tracking-tight text-slate-900">{selectedCase.title}</h2>
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-white">
                      {selectedCase.stageLabel}
                    </span>
                    {selectedCase.isFocused && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-amber-500/20">
                        <Star size={12} fill="currentColor" />
                        本周聚焦
                      </span>
                    )}
                    {selectedCase.personality && (
                      <div className="group relative">
                        <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white shadow-sm ${
                          selectedCase.personality === 'pragmatic' ? 'bg-emerald-500' :
                          selectedCase.personality === 'emotional' ? 'bg-indigo-500' : 'bg-rose-500'
                        }`}>
                          <Shield size={10} fill="currentColor" />
                          业主画像 · {PERSONALITIES[selectedCase.personality as keyof typeof PERSONALITIES]?.label}
                        </span>
                        <div className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-52 rounded-xl bg-slate-900 p-3 text-[9px] text-white opacity-0 shadow-2xl transition-opacity group-hover:opacity-100">
                          <p className="mb-1 font-bold">{PERSONALITIES[selectedCase.personality as keyof typeof PERSONALITIES]?.label}</p>
                          <p className="leading-relaxed opacity-80">{PERSONALITIES[selectedCase.personality as keyof typeof PERSONALITIES]?.desc}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-slate-500">
                    <div className="flex items-center gap-1"><HomeIcon size={13} /> <span>{selectedCase.community}</span></div>
                    <div className="flex items-center gap-1"><MapPin size={13} /> <span>{selectedCase.district}</span></div>
                    <div className="text-slate-300">/</div>
                    <div>{selectedCase.layout} · {selectedCase.area}㎡</div>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                    <SummaryCallout
                      icon={<TrendingUp size={15} />}
                      label="盘面状态"
                      value={deriveManagerTake(selectedCase, activeOpportunities)}
                      tone="slate"
                    />
                    <SummaryCallout
                      icon={<Target size={15} />}
                      label="当前卡点"
                      value={deriveNextFix(selectedCase, activeOpportunities)}
                      tone="emerald"
                    />
                    <SummaryCallout
                      icon={<Trophy size={15} />}
                      label="价格站位"
                      value={derivePricePosition(selectedCase)}
                      tone={selectedCase.askPrice <= selectedCase.marketPrice ? 'emerald' : 'rose'}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <ListTag label="信任" value={`${Math.round(selectedCase.trust)}`} tone="slate" />
                    <ListTag label="热度" value={`${Math.round(selectedCase.heat)}`} tone="slate" />
                    <ListTag label="好房分" value={`${Math.round(selectedCase.competitiveness)}分`} tone={deriveHouseScoreTone(selectedCase.competitiveness)} />
                    <ListTag label="窗口" value={deriveWindowLabel(selectedCase, activeOpportunities)} tone="rose" />
                  </div>
                </div>
                <div className="rounded-[22px] border border-black/[0.04] bg-white px-4 py-4 shadow-sm">
                  <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">挂牌价格</div>
                  <div className="mt-2 flex items-end gap-2 text-slate-900">
                    <span className="text-[24px] font-semibold tracking-tight">{selectedCase.askPrice}</span>
                    <span className="pb-1 text-[12px] text-slate-400">万</span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-[12px]">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">市场心理价</div>
                      <div className="mt-1 font-semibold text-slate-700">{selectedCase.marketPrice} 万</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">当前判断</div>
                      <div className={`mt-1 text-[11px] font-semibold leading-relaxed ${selectedCase.askPrice <= selectedCase.marketPrice ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {derivePricePosition(selectedCase)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <section className="mb-5 rounded-[20px] border border-black/[0.04] bg-slate-50/80 p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">可执行动作</div>
                  <p className="mt-1 text-[12px] text-slate-500">系统只告诉你现在能做什么、为什么能做或不能做，不替你排答案。</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500 shadow-sm">
                  {availableActionCount}/{ACTIONS.length} 现在可做
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <section className="rounded-[18px] border border-black/[0.04] bg-white p-4 shadow-sm">
                  <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">动作清单</div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">点开就执行；不能做的会直接告诉你卡在哪里。</p>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {actionCardsByCategory.map(({ category, availableCards }) => (
                        <button
                          key={category.id}
                          onClick={() => setActiveActionTab(category.id as ActionCategoryTab)}
                          className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
                            activeActionCategory?.category.id === category.id
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {category.name} · {availableCards.length}
                        </button>
                      ))}
                    </div>
                  </div>

                  {activeActionCategory && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-black/[0.04] bg-slate-50 px-3.5 py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h5 className="text-[12px] font-semibold text-slate-800">{activeActionCategory.category.name}</h5>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{activeActionCategory.category.summary}</p>
                          </div>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
                            {activeActionCategory.availableCards.length}/{activeActionCategory.cards.length}
                          </span>
                        </div>
                      </div>

                      <ActionSubsection
                        title="现在可做"
                        count={activeActionCategory.availableCards.length}
                        emptyText="这一类动作当前没有可直接执行的项。"
                        cards={activeActionCategory.availableCards}
                        onExecute={handleAction}
                      />

                      <ActionSubsection
                        title="现在不可做"
                        count={activeActionCategory.blockedCards.length}
                        emptyText="这一类动作当前没有被卡住的项。"
                        cards={activeActionCategory.blockedCards}
                        onExecute={handleAction}
                        blocked
                      />
                    </div>
                  )}
                </section>
              </div>
            </section>

            <section className="rounded-[20px] border border-black/[0.04] bg-white shadow-sm">
              <div className="border-b border-black/[0.04] px-5 pt-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">为什么这么判断</div>
                    <p className="mt-1 text-[12px] text-slate-500">只看跟这套房有关的证据。</p>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-4">
                    {DETAIL_TABS.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ${
                          activeTab === tab.id
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-5">
                {activeTab === 'judgment' && (
                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                    <section className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">判断依据</h4>
                        <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-slate-300">{caseMatters.length} 条证据</span>
                      </div>
                      {caseMatters.map((matter, index) => (
                        <div key={`${matter.title}-${index}`} className="rounded-xl border border-black/[0.04] bg-slate-50 p-3.5">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-[12px] font-semibold text-slate-800">{matter.title}</div>
                              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{matter.detail}</p>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] ${
                              matter.tone === 'rose'
                                ? 'bg-rose-100 text-rose-600'
                                : matter.tone === 'amber'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-emerald-100 text-emerald-600'
                            }`}>
                              {matter.badge}
                            </span>
                          </div>
                        </div>
                      ))}
                    </section>

                    <section className="space-y-4">
                      <div className="rounded-[18px] border border-black/[0.04] bg-slate-50 p-4">
                        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">当前变化</div>
                        <div className="mt-2 text-[12px] font-semibold leading-5 text-slate-800">
                          {deriveManagerTake(selectedCase, activeOpportunities)}
                        </div>
                        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                          {`${derivePricePosition(selectedCase)} · ${deriveWindowLabel(selectedCase, activeOpportunities)}`}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                        <MetricChip label="好的一面" value={deriveStrongPoint(selectedCase)} tone="emerald" />
                        <MetricChip label="卡点" value={deriveWeakPoint(selectedCase)} tone="amber" />
                        <MetricChip label="当前卡点" value={deriveNextFix(selectedCase, activeOpportunities)} tone="slate" />
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <SummaryCallout
                          icon={<Trophy size={15} />}
                          label="好房分"
                          value={`${Math.round(selectedCase.competitiveness)} 分`}
                          tone="emerald"
                        />
                        <SummaryCallout
                          icon={<Users size={15} />}
                          label="准客窗口"
                          value={deriveWindowLabel(selectedCase, activeOpportunities)}
                          tone="slate"
                        />
                      </div>
                      <section className="rounded-[18px] border border-black/[0.04] bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between">
                          <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                            <History size={14} />
                            最近变化
                          </h4>
                          {latestScoreSnapshot && (
                            <span className={`text-[11px] font-bold ${latestScoreSnapshot.delta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {latestScoreSnapshot.delta >= 0 ? '+' : ''}
                              {Math.round(latestScoreSnapshot.delta * 10) / 10}pts
                            </span>
                          )}
                        </div>
                        {latestScoreSnapshot ? (
                          <div className="space-y-2.5">
                            {(latestScoreSnapshot.breakdown.d1_drivers || []).slice(0, 2).map((driver: any, index: number) => (
                              <AttributionItem key={`d1-${index}`} driver={driver} category="准客池" />
                            ))}
                            {(latestScoreSnapshot.breakdown.d3_drivers || []).slice(0, 2).map((driver: any, index: number) => (
                              <AttributionItem key={`d3-${index}`} driver={driver} category="业主" />
                            ))}
                            {(!latestScoreSnapshot.breakdown.d1_drivers?.length && !latestScoreSnapshot.breakdown.d3_drivers?.length) && (
                              <p className="text-[11px] italic text-slate-400">最近没有明显波动，当前还看不到新增驱动项。</p>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-[12px] text-slate-400">
                            还没有足够的变化证据，当前只记录到基础状态。
                          </div>
                        )}
                      </section>
                    </section>
                  </div>
                )}

                {activeTab === 'owner' && (
                  <section className="rounded-[20px] border border-black/[0.04] bg-slate-50/80 p-5">
                    <div className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      <MessagesSquare size={14} />
                      业主状态
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-black/[0.04] bg-white p-4">
                        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">当前状态</div>
                        <div className="mt-2 text-[12px] font-semibold text-slate-800">{selectedCase.ownerMood || '待观察'}</div>
                        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{deriveSellerGuidance(selectedCase)}</p>
                      </div>
                      <div className="rounded-xl border border-black/[0.04] bg-white p-4">
                        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">沟通方式</div>
                        <div className="mt-2 text-[12px] font-semibold text-slate-800">{deriveCommunicationMode(selectedCase)}</div>
                        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                          {selectedCase.personality
                            ? PERSONALITIES[selectedCase.personality as keyof typeof PERSONALITIES]?.desc
                            : '当前还没有更明确的业主画像。'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <DetailStat label="信任度" val={selectedCase.trust} icon={<Shield size={16} />} color="bg-emerald-600" />
                      <DetailStat label="耐心" val={selectedCase.patience} icon={<Heart size={16} />} color="bg-rose-500" />
                      <DetailStat label="紧迫度" val={selectedCase.urgency} icon={<Target size={16} />} color="bg-amber-500" />
                    </div>
                  </section>
                )}

                {activeTab === 'score' && (
                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.95fr_1.05fr]">
                    <section className="rounded-[20px] border border-black/[0.04] bg-slate-50/80 p-5">
                      <div className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                        <Trophy size={14} />
                        价格与好房分
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-black/[0.04] bg-white p-4">
                          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">挂牌价格</div>
                          <div className="mt-2 text-[22px] font-bold text-slate-900">
                            {selectedCase.askPrice} <span className="text-[12px] font-normal text-slate-400">万</span>
                          </div>
                          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">市场心理价 {selectedCase.marketPrice} 万，底价 {selectedCase.bottomPrice} 万。</p>
                        </div>
                        <div className="rounded-xl border border-black/[0.04] bg-white p-4">
                          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">价格判断</div>
                          <div className="mt-2 text-[12px] font-semibold text-slate-800">{derivePricePosition(selectedCase)}</div>
                          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{deriveNextFix(selectedCase, activeOpportunities)}</p>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-3">
                        <MetricChip label="强项" value={deriveStrongPoint(selectedCase)} tone="emerald" />
                        <MetricChip label="短板" value={deriveWeakPoint(selectedCase)} tone="amber" />
                        <MetricChip label="窗口" value={deriveWindowLabel(selectedCase, activeOpportunities)} tone="slate" />
                      </div>
                    </section>

                    <section className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
                      <div className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                        <Trophy size={14} />
                        好房分拆解
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <DetailStat label="好房分" val={selectedCase.competitiveness} icon={<Trophy size={16} />} color="bg-emerald-600" />
                        <DetailStat label="准客池厚度" val={selectedCase.d1} icon={<Users size={16} />} color="bg-sky-500" />
                        <DetailStat label="货盘素质" val={selectedCase.d2} icon={<HomeIcon size={16} />} color="bg-slate-900" />
                        <DetailStat label="业主配合" val={selectedCase.d3} icon={<Heart size={16} />} color="bg-rose-500" />
                      </div>
                    </section>
                  </div>
                )}

                {activeTab === 'pool' && (
                  <section className="flex flex-col">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">准客池</h4>
                      <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-slate-300">{activeOpportunities.length} 位活跃准客</span>
                    </div>
                    <div className="mb-4 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
                      <PoolMetric label="池子总量" value={activeOpportunities.length} tone="slate" />
                      <PoolMetric label="待确认客户" value={predictedOpportunities.length} tone="amber" />
                      <PoolMetric label="接洽中" value={engagedOpportunities.length} tone="emerald" />
                      <PoolMetric label="3天内转冷" value={engagedOpportunities.filter(o => o.daysLeft <= 3).length} tone="rose" />
                    </div>
                    <div className="space-y-5">
                      <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <h5 className="text-[12px] font-semibold text-slate-800">待确认客户</h5>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">看起来可能匹配，但预算、需求和成交意愿还没确认。</p>
                          </div>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-amber-700">
                            {predictedOpportunities.length} 组
                          </span>
                        </div>
                        <div className="space-y-2.5">
                          {predictedOpportunities.map(o => (
                            <div key={o.id} className="rounded-xl border border-dashed border-amber-200 bg-white/80 p-3.5">
                              <div className="mb-2 flex items-center justify-between">
                                <strong className="text-[12px] text-slate-800">{`待确认客户 #${o.id.split('-').pop()}`}</strong>
                                <span className="rounded bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">
                                  待确认
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-4 text-[11px] text-slate-500">
                                <span>来源 {o.channelName}</span>
                                <span>需求信息仍待合作经纪人确认</span>
                                <span className="ml-auto text-slate-300">{o.daysLeft} 天后可能流失</span>
                              </div>
                            </div>
                          ))}
                          {predictedOpportunities.length === 0 && (
                            <div className="rounded-xl border border-dashed border-amber-200 bg-white/80 p-4 text-[12px] text-slate-400">
                              当前没有待确认客户。
                            </div>
                          )}
                        </div>
                      </section>

                      <section className="rounded-xl border border-black/[0.04] bg-slate-50 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <h5 className="text-[12px] font-semibold text-slate-800">接洽中的客户</h5>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">这部分客户已经接上话，可以继续经营推进到看房、报价或成交。</p>
                          </div>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
                            {engagedOpportunities.length} 位
                          </span>
                        </div>
                        <div className="mb-4 rounded-xl border border-black/[0.04] bg-white p-4">
                          <div className="mb-3 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">推进阶段分布</div>
                          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
                            {derivePoolStages(engagedOpportunities).map(stage => (
                              <div key={stage.label} className="rounded-lg bg-slate-50 px-3 py-2 text-center shadow-sm">
                                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{stage.label}</div>
                                <div className="mt-1 text-[15px] font-bold text-slate-800">{stage.count}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2.5">
                          {engagedOpportunities.map(o => (
                            <div key={o.id} className="rounded-xl border border-slate-200 p-3.5">
                              <div className="mb-2 flex items-center justify-between">
                                <strong className="text-[12px] text-slate-800">{o.customerName}</strong>
                                <span className="rounded bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-600">
                                  {o.stageLabel}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-4 text-[11px] text-slate-500">
                                <span>意向 {Math.round(o.intent)}%</span>
                                <span>把握度 {Math.round(o.confidence)}%</span>
                                <span>来源 {o.channelName}</span>
                                <span>{deriveLeadSuggestion(o)}</span>
                                <span className="ml-auto text-slate-300">{o.daysLeft} 天后可能流失</span>
                              </div>
                            </div>
                          ))}
                          {engagedOpportunities.length === 0 && (
                            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-[12px] text-slate-400">
                              目前还没有进入接洽阶段的客户，当前客户池还停留在前段。
                            </div>
                          )}
                        </div>
                      </section>
                    </div>
                  </section>
                )}

              </div>
            </section>
          </>
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

function AttributionItem({ driver, category }: { driver: any; category: string; key?: string }) {
  return (
    <div className="flex items-start justify-between group">
      <div className="flex items-center gap-3">
        <span className="rounded-md border border-black/5 bg-white px-1.5 py-0.5 text-[8px] font-bold uppercase text-slate-400">
          {category}
        </span>
        <span className="text-[11px] text-slate-600 font-medium">{driver.reason}</span>
      </div>
      <span className={`text-[9px] font-bold ${driver.contribution >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
        {driver.contribution >= 0 ? '+' : ''}{driver.contribution}
      </span>
    </div>
  );
}

function MiniStat({ label, val }: { label: string; val: number }) {
  return (
    <div className="flex-1">
      <div className="mb-1.5 flex justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
        <span>{label}</span>
        <span>{Math.round(val)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5">
        <div className="h-full bg-emerald-500" style={{ width: `${val}%` }} />
      </div>
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

function SummaryCallout({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'emerald' | 'rose' | 'slate';
}) {
  const toneClass = tone === 'emerald'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
    : tone === 'rose'
      ? 'bg-rose-50 text-rose-700 border-rose-100'
      : 'bg-slate-50 text-slate-700 border-slate-200';
  return (
    <div className={`rounded-xl border px-4 py-3.5 ${toneClass}`}>
      <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] opacity-75">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-[13px] font-semibold leading-5">{value}</div>
    </div>
  );
}

function MetricChip({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'amber' | 'slate' }) {
  const toneClass = tone === 'emerald'
    ? 'bg-emerald-50 text-emerald-700'
    : tone === 'amber'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-slate-100 text-slate-700';
  return (
    <div className={`rounded-xl px-4 py-3 ${toneClass}`}>
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-70">{label}</div>
      <div className="mt-1.5 text-[13px] font-semibold leading-5">{value}</div>
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

function ActionSubsection({
  title,
  count,
  cards,
  emptyText,
  onExecute,
  blocked = false,
}: {
  title: string;
  count: number;
  cards: ActionWorkspaceCard[];
  emptyText: string;
  onExecute: (actionId: string) => void;
  blocked?: boolean;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h5 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{title}</h5>
        <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-slate-300">{count} 个</span>
      </div>
      <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
        {cards.map(card => (
          <ActionWorkspaceCardView
            key={card.action.id}
            card={card}
            onExecute={onExecute}
            blocked={blocked}
          />
        ))}
        {cards.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-[12px] text-slate-400">
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );
}

function ActionWorkspaceCardView({
  card,
  onExecute,
  blocked = false,
}: {
  key?: React.Key;
  card: ActionWorkspaceCard;
  onExecute: (actionId: string) => void;
  blocked?: boolean;
}) {
  const { action, availability, hint } = card;
  return (
    <div className={`rounded-[16px] border px-4 py-4 transition-all ${
      blocked
        ? 'border-slate-200 bg-slate-100/80'
        : 'border-black/[0.04] bg-slate-50/70'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[13px] font-semibold text-slate-800">{action.name}</div>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] ${
              blocked
                ? 'bg-slate-200 text-slate-500'
                : 'bg-emerald-100 text-emerald-700'
            }`}>
              {blocked ? '暂不可用' : '可执行'}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">{action.description}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-medium">
            <span className="rounded-full bg-white px-2.5 py-1 text-slate-500">{costText(action)}</span>
            <span className={`rounded-full px-2.5 py-1 ${
              blocked ? 'bg-slate-200 text-slate-500' : 'bg-emerald-50 text-emerald-700'
            }`}>
              {blocked ? availability.reason : hint}
            </span>
          </div>
        </div>
        <button
          disabled={blocked || !availability.enabled}
          onClick={() => onExecute(action.id)}
          className={`shrink-0 rounded-xl px-4 py-2 text-[11px] font-bold transition-all ${
            blocked || !availability.enabled
              ? 'cursor-not-allowed bg-slate-200 text-slate-400'
              : 'border border-black/5 bg-slate-900 text-white hover:bg-emerald-600'
          }`}
        >
          执行
        </button>
      </div>
    </div>
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
    d1: '准客池',
    d2: '货盘素质',
    d3: '业主配合',
    windowDays: '窗口',
    askPrice: '挂牌价',
    intent: '客户意向',
    confidence: '成交把握',
    promotionBudget: '推广金',
    reputation: '长期信任',
    commission: '佣金',
  };
  return labels[metric] || metric;
}

function deriveActionHint(actionId: string, caseItem: Case, opportunities: any[]) {
  if (actionId === 'first-visit') return !caseItem.hasCompletedFirstVisit ? '当前还没完成首次面访。' : '首次面访已经完成。';
  if (actionId === 'weekly-feedback') return caseItem.trust < 60 ? `当前信任 ${Math.round(caseItem.trust)}，关系波动较明显。`
    : `当前信任 ${Math.round(caseItem.trust)}，业主关系相对稳定。`;
  if (actionId === 'deep-diagnosis') return opportunities.some(o => o.visibility === 'shadow') ? `当前有 ${opportunities.filter(o => o.visibility === 'shadow').length} 位待确认客户。`
    : '当前没有待确认客户，诊断重点会落在价格和带看反馈。';
  if (actionId === 'story') return caseItem.d2 < 70 ? `当前货盘素质 ${Math.round(caseItem.d2)}，卖点表达空间较大。`
    : `当前货盘素质 ${Math.round(caseItem.d2)}，卖点基础已在线。`;
  if (actionId === 'pricing-advice') return `挂牌 ${caseItem.askPrice} 万，对比市场心理价 ${caseItem.marketPrice} 万。`;
  if (actionId === 'ask-psychological-price') return `当前底价 ${caseItem.bottomPrice} 万，业主真实心理价还未完全显性。`;
  if (actionId === 'adjust-listing-price') return caseItem.askPrice > caseItem.marketPrice * 1.03 ? '当前挂牌价明显高于市场心理价。'
    : '当前挂牌价和市场心理价差距较小。';
  if (actionId === 'xiaohongshu-boost') return `当前活跃客户 ${opportunities.length} 位，公开客群厚度会受投放影响。`;
  if (actionId === 'broker-broadcast') return `待确认客户 ${opportunities.filter(o => o.visibility === 'shadow').length} 位，经纪人侧会补充更多外部线索。`;
  if (actionId === 'private-referral') return `当前业主信任 ${Math.round(caseItem.trust)}，私域质量更依赖关系基础。`;
  if (actionId === 'open-day') return `当前热度 ${Math.round(caseItem.heat)}，开放日会直接抬升到访量和筛客压力。`;
  if (actionId === 'showing') return opportunities.some(o => o.stageIndex >= 1 && o.visibility !== 'shadow') ? '当前已有客户进入可带看阶段。'
    : '当前还没有客户进入可带看阶段。';
  if (actionId === 'sincerity-sale') return opportunities.some(o => o.stageIndex >= 2 && o.visibility !== 'shadow') ? '当前已有客户进入中后段。'
    : '当前客户阶段还不足以触发诚意卖。';
  if (actionId === 'invite-customer-negotiation') return opportunities.some(o => o.stageIndex >= 3 && o.visibility !== 'shadow') ? '当前已有客户接近报价或议价阶段。'
    : '当前还没有客户进入谈判区。';
  return '结合当前节奏安排';
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
  if (caseItem.askPrice <= caseItem.marketPrice) return '价格能打，可以推转化';
  if (caseItem.askPrice <= caseItem.marketPrice * 1.03) return '价格略高，还能沟通';
  return `高出市场 ${caseItem.askPrice - caseItem.marketPrice} 万，价格压力明显`;
}

function deriveWindowLabel(caseItem: Case, opportunities: any[]) {
  if (caseItem.windowDays <= 5) return '快到期';
  if (opportunities.some(o => o.daysLeft <= 2 && o.visibility !== 'shadow')) return '客户快冷了';
  if (opportunities.some(o => o.visibility === 'shadow')) return '客户待确认';
  return '还稳';
}

function deriveManagerTake(caseItem: Case, opportunities: any[]) {
  if (caseItem.status === 'lost_to_rival') return '已经被别人截走，复盘前面哪里断了';
  if (caseItem.status === 'withdrawn') return '业主撤了，复盘为什么没守住';
  if (caseItem.riskFlags?.includes('价格锚偏高')) return '价格高于市场心理价，价格口径是当前主要矛盾';
  if (opportunities.some(o => o.visibility === 'shadow')) return '有待确认客户，客户画像还不完整';
  if (opportunities.some(o => o.stageIndex >= 3)) return '有客户进入后段，房源已经靠近成交区';
  return '房源仍在场，当前主要看持续推进是否不断档';
}

function deriveSellerGuidance(caseItem: Case) {
  if (caseItem.trust < 55) return '业主已经开始怀疑推进节奏，周反馈要讲结果，也要讲依据。';
  if (caseItem.patience < 45) return '业主耐心不高，沟通里会更看重确定性。';
  if (caseItem.urgency > 80) return '业主目标很急，沟通时更看重速度和结果。';
  return '业主当前尚可协同，进展和依据都能被听进去。';
}

function deriveCommunicationMode(caseItem: Case) {
  if (caseItem.personality === 'pragmatic') return '用带看反馈和竞品数据说话';
  if (caseItem.personality === 'emotional') return '情绪波动更大，沟通里更吃关系承接';
  if (caseItem.personality === 'urgent') return '强调速度和结果，不要绕太久';
  return '把业主拉回统一口径';
}

function deriveStrongPoint(caseItem: Case) {
  if (caseItem.d2 >= 75) return '货盘素质在线，适合主打产品力';
  if (caseItem.d1 >= 70) return '准客池不薄，适合继续推带看';
  if (caseItem.d3 >= 70) return '业主配合不错，适合谈更强动作';
  return '基础面平稳，还有经营空间';
}

function deriveWeakPoint(caseItem: Case) {
  if (caseItem.askPrice > caseItem.marketPrice * 1.05) return '价格锚偏高，容易卡带看和报价';
  if (caseItem.d1 < 45) return '准客池偏浅，流量和带看都不够厚';
  if (caseItem.d3 < 50) return '业主意愿偏弱，容易在关键节点掉链子';
  return '没有致命短板，但还没形成强势窗口';
}

function deriveNextFix(caseItem: Case, opportunities: any[]) {
  if (opportunities.length === 0) return '当前缺少活跃客户';
  if (opportunities.some(o => o.visibility === 'shadow')) return '当前待确认客户较多';
  if (caseItem.askPrice > caseItem.marketPrice * 1.05) return '当前价格明显高于市场心理价';
  return '当前主要看带看后的持续转化';
}

function deriveShortCaseState(caseItem: Case, opportunities: any[]) {
  if (caseItem.status === 'sold') return '已成交';
  if (caseItem.status === 'lost_to_rival') return '被截走';
  if (caseItem.status === 'withdrawn') return '已撤盘';
  if (caseItem.windowDays <= 3 || caseItem.trust < 50) return '快失守';
  if (opportunities.some(o => o.visibility !== 'shadow' && o.stageIndex >= 3)) return '可收口';
  if (opportunities.length === 0) return '缺客户';
  if (caseItem.askPrice > caseItem.marketPrice * 1.05) return '价格硬';
  if (caseItem.heat < 45) return '偏冷';
  return '能推进';
}

function deriveCaseMatters(state: GameState, caseItem: Case, opportunities: any[]) {
  const matchingPriorities = state.priorities.filter((entry: any) => entry.caseId === caseItem.id).slice(0, 2);
  const derived = matchingPriorities.map((entry: any) => ({
    title: entry.title,
    detail: entry.detail,
    badge: entry.kind === 'opportunity' ? '事件' : '固定',
    tone: entry.kind === 'opportunity' ? 'amber' : 'emerald',
  }));

  if (opportunities.some(o => o.daysLeft <= 2)) {
    derived.unshift({
      title: '准客接近流失',
      detail: '池子里已经有人接近流失边缘，今天的转化温度正在下降。',
      badge: '紧急',
      tone: 'rose',
    });
  }
  if (caseItem.riskFlags?.includes('价格锚偏高')) {
    derived.push({
      title: '统一价格口径',
      detail: '这套盘的价格感知偏硬，周反馈和带看话术都要围绕市场锚点重讲。',
      badge: '重点',
      tone: 'amber',
    });
  }
  if (derived.length === 0) {
    derived.push({
      title: '准备本周反馈',
      detail: '这套盘暂无突发事项，本周进展和证据链相对完整。',
      badge: '固定',
      tone: 'emerald',
    });
  }
  return derived.slice(0, 3);
}

function derivePoolStages(opportunities: any[]) {
  const groups = [
    { label: '了解', matcher: (o: any) => o.stageIndex <= 1 },
    { label: '看房', matcher: (o: any) => o.stageIndex === 2 },
    { label: '再看', matcher: (o: any) => o.stageIndex === 3 },
    { label: '报价', matcher: (o: any) => o.stageIndex === 4 },
    { label: '议价', matcher: (o: any) => o.stageIndex >= 5 },
  ];
  return groups.map(group => ({
    label: group.label,
    count: opportunities.filter(group.matcher).length,
  }));
}

function deriveLeadSuggestion(opportunity: any) {
  if (opportunity.visibility === 'shadow') return '客户需求仍待确认';
  if (opportunity.stageIndex >= 4) return '已进入报价管理区';
  if (opportunity.stageIndex === 3) return '已进入再看阶段';
  if (opportunity.intent >= 70) return '意向度较高';
  return '仍在培养兴趣阶段';
}

function deriveListingAgeLabel(caseItem: Case) {
  if (caseItem.status === 'sold') return '已成交';
  if (caseItem.defenseOutcome === 'lost_to_rival') return '已失守';
  if (caseItem.status === 'withdrawn') return '已撤盘';
  return `${Math.max(0, caseItem.windowDays)}天`;
}

function deriveHouseScoreTone(score: number): 'emerald' | 'amber' | 'rose' {
  if (score >= 75) return 'emerald';
  if (score >= 60) return 'amber';
  return 'rose';
}

function ListTag({
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
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[9px] font-semibold leading-none ${toneClass}`}>
      <span className="text-slate-400">{label}</span>
      <span>{value}</span>
    </span>
  );
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
