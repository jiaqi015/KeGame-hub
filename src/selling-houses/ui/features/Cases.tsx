import React, { useState } from 'react';
import { GameState, Case } from '../../domain/models';
import { ACTIONS, ACTION_CATEGORIES } from '../../domain/constants';
import { getActionTemplate } from '../../domain/actions/templates';
import { costText, caseSortValue } from '../../domain/utils';
import { getActiveOpportunities, getActionAvailability } from '../../domain/engine';
import { PERSONALITIES } from '../../domain/constants';
import { Home as HomeIcon, MapPin, Trophy, Users, Heart, History, Star, Shield, Target, BriefcaseBusiness, TrendingUp, MessagesSquare } from 'lucide-react';

interface CasesProps {
  state: GameState;
  onSelectCase: (id: string) => void;
  onExecuteAction: (actionId: string, caseItem: any, optionId?: string | null) => boolean;
}

type CaseDetailTab = 'judgment' | 'owner' | 'score' | 'pool' | 'history';
type ActionDecisionConfig = {
  actionId: string;
  title: string;
  summary: string;
  body: string;
  actorLabel: string;
  metricFocus: string[];
  options: Array<{ id: string; title: string; note: string }>;
};

const DETAIL_TABS: Array<{ id: CaseDetailTab; label: string }> = [
  { id: 'judgment', label: '经营判断' },
  { id: 'owner', label: '业主' },
  { id: 'score', label: '价格与好房分' },
  { id: 'pool', label: '准客池' },
  { id: 'history', label: '日志归因' },
];

export function Cases({ state, onSelectCase, onExecuteAction }: CasesProps) {
  const { cases, selectedCaseId } = state;
  const sortedCases = [...cases].sort((a, b) => caseSortValue(b) - caseSortValue(a));
  const selectedCase = cases.find(c => c.id === selectedCaseId) || sortedCases[0];
  const activeOpportunities = selectedCase ? getActiveOpportunities(state, selectedCase.id) : [];

  const [decisionConfig, setDecisionConfig] = useState<ActionDecisionConfig | null>(null);
  const [activeTab, setActiveTab] = useState<CaseDetailTab>('judgment');

  const caseMatters = selectedCase ? deriveCaseMatters(state, selectedCase, activeOpportunities) : [];
  const latestScoreSnapshot = selectedCase?.competitivenessSnapshots?.[0];
  const predictedOpportunities = activeOpportunities.filter(opportunity => opportunity.visibility === 'shadow');
  const engagedOpportunities = activeOpportunities.filter(opportunity => opportunity.visibility !== 'shadow');
  const actionCards = selectedCase
    ? [...ACTIONS]
        .map(action => {
          const availability = getActionAvailability(state, selectedCase, action.id);
          return {
            action,
            availability,
            priority: deriveActionPriority(action.id, selectedCase, activeOpportunities, availability.enabled),
          };
        })
        .sort((a, b) => b.priority - a.priority)
    : [];
  const actionCardsByCategory = ACTION_CATEGORIES.map(category => ({
    category,
    cards: actionCards.filter(({ action }) => action.categoryId === category.id),
  })).filter(({ cards }) => cards.length > 0);
  const availableActionCount = actionCards.filter(({ availability }) => availability.enabled).length;

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
        metricFocus: (action.metricFocus || template.metricFocus).map(deriveMetricLabel),
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
    <div className="grid h-full min-h-0 grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-2 overflow-y-auto rounded-[20px] border border-black/5 bg-white p-2.5 shadow-sm">
        {sortedCases.map(c => (
          <div
            key={c.id}
            onClick={() => onSelectCase(c.id)}
            className={`relative cursor-pointer overflow-hidden rounded-xl border p-3.5 transition-all ${
              c.id === selectedCaseId
                ? 'border-emerald-500 bg-emerald-50/50 shadow-inner'
                : 'border-transparent hover:bg-slate-50'
            }`}
          >
            {c.isFocused && (
              <div className="absolute right-0 top-0 rounded-bl-xl bg-amber-500 p-1 text-white shadow-lg animate-pulse">
                <Star size={10} fill="currentColor" />
              </div>
            )}
            <div className="mb-2 flex items-start justify-between">
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                c.isFocused ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {c.isFocused ? '本周聚焦' : c.stageLabel}
              </span>
              <small className="font-medium text-slate-400">{c.district}</small>
            </div>
            <strong className="block line-clamp-1 text-slate-800">{c.title}</strong>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ListTag label="客观阶段" value={c.stageLabel} tone="slate" />
              <ListTag label="挂牌时长" value={deriveListingAgeLabel(state)} tone="amber" />
              <ListTag
                label="好房分"
                value={`${Math.round(c.competitiveness)}分`}
                tone={deriveHouseScoreTone(c.competitiveness)}
              />
            </div>
            <div className="mt-2.5 flex items-center gap-3">
              <MiniStat label="信任" val={c.trust} />
              <MiniStat label="热度" val={c.heat} />
              <span className={`ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold ${
                c.personality === 'pragmatic' ? 'bg-emerald-100 text-emerald-600' :
                c.personality === 'emotional' ? 'bg-indigo-100 text-indigo-600' : 'bg-rose-100 text-rose-600'
              }`}>
                {PERSONALITIES[c.personality as keyof typeof PERSONALITIES]?.label}
              </span>
            </div>
          </div>
        ))}
      </aside>

      <main className="flex flex-col overflow-y-auto rounded-[20px] border border-black/5 bg-white p-6 shadow-sm">
        {selectedCase ? (
          <>
            <div className="mb-6 rounded-[24px] border border-black/[0.04] bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 p-5">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-3.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-[28px] font-semibold tracking-tight text-slate-900">{selectedCase.title}</h2>
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-white">
                      {selectedCase.stageLabel}
                    </span>
                    {selectedCase.isFocused && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-amber-500/20">
                        <Star size={12} fill="currentColor" />
                        本周聚焦
                      </span>
                    )}
                    {selectedCase.personality && (
                      <div className="group relative">
                        <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white shadow-sm ${
                          selectedCase.personality === 'pragmatic' ? 'bg-emerald-500' :
                          selectedCase.personality === 'emotional' ? 'bg-indigo-500' : 'bg-rose-500'
                        }`}>
                          <Shield size={10} fill="currentColor" />
                          业主画像 · {PERSONALITIES[selectedCase.personality as keyof typeof PERSONALITIES]?.label}
                        </span>
                        <div className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-52 rounded-xl bg-slate-900 p-3 text-[10px] text-white opacity-0 shadow-2xl transition-opacity group-hover:opacity-100">
                          <p className="mb-1 font-bold">{PERSONALITIES[selectedCase.personality as keyof typeof PERSONALITIES]?.label}</p>
                          <p className="leading-relaxed opacity-80">{PERSONALITIES[selectedCase.personality as keyof typeof PERSONALITIES]?.desc}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-slate-500">
                    <div className="flex items-center gap-1"><HomeIcon size={14} /> <span>{selectedCase.community}</span></div>
                    <div className="flex items-center gap-1"><MapPin size={14} /> <span>{selectedCase.district}</span></div>
                    <div className="text-slate-300">/</div>
                    <div>{selectedCase.layout} · {selectedCase.area}㎡</div>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                    <SummaryCallout
                      icon={<TrendingUp size={15} />}
                      label="本周经营目标"
                      value={deriveTargetLabel(selectedCase, activeOpportunities.length)}
                      tone="emerald"
                    />
                    <SummaryCallout
                      icon={<Target size={15} />}
                      label="当前主风险"
                      value={selectedCase.riskFlags?.[0] || '节奏稳定'}
                      tone="rose"
                    />
                    <SummaryCallout
                      icon={<BriefcaseBusiness size={15} />}
                      label="维护判断"
                      value={deriveManagerTake(selectedCase, activeOpportunities)}
                      tone="slate"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
                    <ListTag label="信任" value={`${Math.round(selectedCase.trust)}`} tone="slate" />
                    <ListTag label="热度" value={`${Math.round(selectedCase.heat)}`} tone="slate" />
                    <ListTag label="紧迫度" value={`${Math.round(selectedCase.urgency)}`} tone="amber" />
                    <ListTag label="好房分" value={`${Math.round(selectedCase.competitiveness)}分`} tone={deriveHouseScoreTone(selectedCase.competitiveness)} />
                    <ListTag label="窗口" value={deriveWindowLabel(selectedCase, activeOpportunities)} tone="rose" />
                  </div>
                </div>
                <div className="rounded-[22px] border border-black/[0.04] bg-white px-4 py-4 text-right shadow-sm">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">挂牌价格</div>
                  <div className="mt-2 text-[28px] font-bold text-slate-900">
                    {selectedCase.askPrice} <span className="text-sm font-normal text-slate-400">万</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">市场心理价 {selectedCase.marketPrice} 万</div>
                  <div className={`mt-3 text-xs font-bold ${selectedCase.askPrice <= selectedCase.marketPrice ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {derivePricePosition(selectedCase)}
                  </div>
                </div>
              </div>
            </div>

            <section className="mb-6 rounded-[20px] border border-black/[0.04] bg-slate-50/80 p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">可做的动作</div>
                  <p className="mt-1 text-sm text-slate-500">动作区固定在总览之后，先决定做什么，再下钻看证据。</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 shadow-sm">
                  {availableActionCount}/{ACTIONS.length} 可执行
                </span>
              </div>
              <div className="space-y-4">
                {actionCardsByCategory.map(({ category, cards }) => (
                  <section key={category.id} className="rounded-[18px] border border-black/[0.04] bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">{category.name}</h4>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">{category.summary}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                        {cards.filter(({ availability }) => availability.enabled).length}/{cards.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                      {cards.map(({ action, availability, priority }) => (
                        <div
                          key={action.id}
                          className={`rounded-[16px] border p-4 transition-all ${
                            availability.enabled ? 'border-black/[0.04] bg-slate-50/70' : 'border-black/[0.03] bg-slate-100/80'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-[13px] font-semibold text-slate-800">{action.name}</div>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${
                                  availability.enabled
                                    ? priority >= 80
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-slate-100 text-slate-600'
                                    : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {deriveActionFitLabel(priority, availability.enabled)}
                                </span>
                              </div>
                              <p className="mt-2 text-xs leading-relaxed text-slate-500">{action.description}</p>
                              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium">
                                <span className="rounded-full bg-white px-2.5 py-1 text-slate-500">{costText(action)}</span>
                                <span className={`rounded-full px-2.5 py-1 ${
                                  availability.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {availability.enabled
                                    ? deriveActionHint(action.id, selectedCase, activeOpportunities)
                                    : availability.reason}
                                </span>
                              </div>
                            </div>
                            <button
                              disabled={!availability.enabled}
                              onClick={() => handleAction(action.id)}
                              className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                                availability.enabled
                                  ? 'border border-black/5 bg-slate-900 text-white hover:bg-emerald-600'
                                  : 'cursor-not-allowed bg-slate-200 text-slate-400'
                              }`}
                            >
                              执行
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>

            <section className="min-h-0 flex flex-1 flex-col rounded-[20px] border border-black/[0.04] bg-white shadow-sm">
              <div className="border-b border-black/[0.04] px-5 pt-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">信息区</div>
                    <p className="mt-1 text-sm text-slate-500">按问题切换信息维度，不把所有信息一次性压在一整页里。</p>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-4">
                    {DETAIL_TABS.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${
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

              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {activeTab === 'judgment' && (
                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                    <section className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">本周事项</h4>
                        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-300">{caseMatters.length} 条判断</span>
                      </div>
                      {caseMatters.map((matter, index) => (
                        <div key={`${matter.title}-${index}`} className="rounded-xl border border-black/[0.04] bg-slate-50 p-3.5">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-[13px] font-semibold text-slate-800">{matter.title}</div>
                              <p className="mt-1 text-xs leading-relaxed text-slate-500">{matter.detail}</p>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${
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
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">一句话判断</div>
                        <div className="mt-2 text-sm font-semibold leading-relaxed text-slate-800">
                          {deriveManagerTake(selectedCase, activeOpportunities)}
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-slate-500">
                          {derivePricePosition(selectedCase)} 当前窗口 {deriveWindowLabel(selectedCase, activeOpportunities)}。
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                        <MetricChip label="强项" value={deriveStrongPoint(selectedCase)} tone="emerald" />
                        <MetricChip label="短板" value={deriveWeakPoint(selectedCase)} tone="amber" />
                        <MetricChip label="最该修" value={deriveNextFix(selectedCase, activeOpportunities)} tone="slate" />
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
                    </section>
                  </div>
                )}

                {activeTab === 'owner' && (
                  <section className="rounded-[20px] border border-black/[0.04] bg-slate-50/80 p-5">
                    <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                      <MessagesSquare size={14} />
                      业主状态
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-black/[0.04] bg-white p-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">当前状态</div>
                        <div className="mt-2 text-sm font-semibold text-slate-800">{selectedCase.ownerMood || '待观察'}</div>
                        <p className="mt-2 text-xs leading-relaxed text-slate-500">{deriveSellerGuidance(selectedCase)}</p>
                      </div>
                      <div className="rounded-xl border border-black/[0.04] bg-white p-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">沟通建议</div>
                        <div className="mt-2 text-sm font-semibold text-slate-800">{deriveCommunicationMode(selectedCase)}</div>
                        <p className="mt-2 text-xs leading-relaxed text-slate-500">
                          {selectedCase.personality
                            ? PERSONALITIES[selectedCase.personality as keyof typeof PERSONALITIES]?.desc
                            : '先用反馈把业主拉回同一页。'}
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
                      <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                        <Trophy size={14} />
                        价格与好房分
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-black/[0.04] bg-white p-4">
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">挂牌价格</div>
                          <div className="mt-2 text-2xl font-bold text-slate-900">
                            {selectedCase.askPrice} <span className="text-sm font-normal text-slate-400">万</span>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-slate-500">市场心理价 {selectedCase.marketPrice} 万，底价 {selectedCase.bottomPrice} 万。</p>
                        </div>
                        <div className="rounded-xl border border-black/[0.04] bg-white p-4">
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">价格判断</div>
                          <div className="mt-2 text-sm font-semibold text-slate-800">{derivePricePosition(selectedCase)}</div>
                          <p className="mt-2 text-xs leading-relaxed text-slate-500">{deriveNextFix(selectedCase, activeOpportunities)}</p>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-3">
                        <MetricChip label="强项" value={deriveStrongPoint(selectedCase)} tone="emerald" />
                        <MetricChip label="短板" value={deriveWeakPoint(selectedCase)} tone="amber" />
                        <MetricChip label="窗口" value={deriveWindowLabel(selectedCase, activeOpportunities)} tone="slate" />
                      </div>
                    </section>

                    <section className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
                      <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
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
                      <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">准客池</h4>
                      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-300">{activeOpportunities.length} 位活跃准客</span>
                    </div>
                    <div className="mb-4 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
                      <PoolMetric label="池子总量" value={activeOpportunities.length} tone="slate" />
                      <PoolMetric label="预测客群" value={predictedOpportunities.length} tone="amber" />
                      <PoolMetric label="接洽中" value={engagedOpportunities.length} tone="emerald" />
                      <PoolMetric label="3天内转冷" value={engagedOpportunities.filter(o => o.daysLeft <= 3).length} tone="rose" />
                    </div>
                    <div className="space-y-5">
                      <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <h5 className="text-sm font-semibold text-slate-800">预测客群</h5>
                            <p className="mt-1 text-xs leading-relaxed text-slate-500">这批人群和房源可能匹配，但真实预算、需求和成交力度还没被验证。</p>
                          </div>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">
                            {predictedOpportunities.length} 组
                          </span>
                        </div>
                        <div className="space-y-2.5">
                          {predictedOpportunities.map(o => (
                            <div key={o.id} className="rounded-xl border border-dashed border-amber-200 bg-white/80 p-3.5">
                              <div className="mb-2 flex items-center justify-between">
                                <strong className="text-slate-800">{`预测客群 #${o.id.split('-').pop()}`}</strong>
                                <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                  待确认
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                                <span>来源 {o.channelName}</span>
                                <span>先和合作经纪人确认真实需求</span>
                                <span className="ml-auto text-slate-300">{o.daysLeft} 天后可能流失</span>
                              </div>
                            </div>
                          ))}
                          {predictedOpportunities.length === 0 && (
                            <div className="rounded-xl border border-dashed border-amber-200 bg-white/80 p-4 text-sm text-slate-400">
                              当前没有需要先摸清的预测客群。
                            </div>
                          )}
                        </div>
                      </section>

                      <section className="rounded-xl border border-black/[0.04] bg-slate-50 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <h5 className="text-sm font-semibold text-slate-800">接洽中的客户</h5>
                            <p className="mt-1 text-xs leading-relaxed text-slate-500">这部分客户已经接上话，可以继续经营推进到看房、报价或成交。</p>
                          </div>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                            {engagedOpportunities.length} 位
                          </span>
                        </div>
                        <div className="mb-4 rounded-xl border border-black/[0.04] bg-white p-4">
                          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">推进阶段分布</div>
                          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
                            {derivePoolStages(engagedOpportunities).map(stage => (
                              <div key={stage.label} className="rounded-lg bg-slate-50 px-3 py-2 text-center shadow-sm">
                                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{stage.label}</div>
                                <div className="mt-1 text-[17px] font-bold text-slate-800">{stage.count}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2.5">
                          {engagedOpportunities.map(o => (
                            <div key={o.id} className="rounded-xl border border-slate-200 p-3.5">
                              <div className="mb-2 flex items-center justify-between">
                                <strong className="text-slate-800">{o.customerName}</strong>
                                <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
                                  {o.stageLabel}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                                <span>意向 {Math.round(o.intent)}%</span>
                                <span>把握度 {Math.round(o.confidence)}%</span>
                                <span>来源 {o.channelName}</span>
                                <span>{deriveLeadSuggestion(o)}</span>
                                <span className="ml-auto text-slate-300">{o.daysLeft} 天后可能流失</span>
                              </div>
                            </div>
                          ))}
                          {engagedOpportunities.length === 0 && (
                            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-400">
                              目前还没有进入接洽阶段的客户，先补客群或先摸清预测客群。
                            </div>
                          )}
                        </div>
                      </section>
                    </div>
                  </section>
                )}

                {activeTab === 'history' && (
                  <section className="rounded-[20px] border border-black/[0.04] bg-slate-50/70 p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                        <History size={14} />
                        日志归因
                      </h4>
                      {latestScoreSnapshot && (
                        <span className={`text-xs font-bold ${latestScoreSnapshot.delta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {latestScoreSnapshot.delta >= 0 ? '+' : ''}
                          {Math.round(latestScoreSnapshot.delta * 10) / 10}pts
                        </span>
                      )}
                    </div>
                    {latestScoreSnapshot ? (
                      <div className="space-y-2.5">
                        {(latestScoreSnapshot.breakdown.d1_drivers || []).map((driver: any, index: number) => (
                          <AttributionItem key={`d1-${index}`} driver={driver} category="漏斗" />
                        ))}
                        {(latestScoreSnapshot.breakdown.d3_drivers || []).map((driver: any, index: number) => (
                          <AttributionItem key={`d3-${index}`} driver={driver} category="意愿" />
                        ))}
                        {(!latestScoreSnapshot.breakdown.d1_drivers?.length && !latestScoreSnapshot.breakdown.d3_drivers?.length) && (
                          <p className="text-xs italic text-slate-400">本日数值平稳漂移，无重大转折。</p>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-400">
                        这套房暂时还没有形成足够明确的归因记录，先推进动作，后面再看变化。
                      </div>
                    )}
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
            <h3 className="mb-2 text-xl font-bold text-slate-900">{decisionConfig.title}</h3>
            <div className="mb-4 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.18em]">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-500">{decisionConfig.actorLabel}</span>
              {decisionConfig.metricFocus.map(metric => (
                <span key={metric} className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                  {metric}
                </span>
              ))}
            </div>
            <p className="mb-2 text-sm font-semibold leading-relaxed text-slate-800">{decisionConfig.summary}</p>
            <p className="mb-6 text-sm leading-relaxed text-slate-500">{decisionConfig.body}</p>
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
                  <p className="mt-1 text-xs text-slate-400">{opt.note}</p>
                </button>
              ))}
            </div>
            <div className="mt-8 flex justify-end">
              <button
                onClick={() => setDecisionConfig(null)}
                className="rounded-full px-6 py-2 text-sm font-bold uppercase tracking-widest text-slate-400 transition-colors hover:text-slate-600"
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
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
        {icon} <span>{label}</span>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} transition-all duration-500 ease-out`} 
          style={{ width: `${val}%` }} 
        />
      </div>
      <div className="text-right text-[10px] font-bold text-slate-400">{Math.round(val)}</div>
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
        <span className="text-xs text-slate-600 font-medium">{driver.reason}</span>
      </div>
      <span className={`text-[10px] font-bold ${driver.contribution >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
        {driver.contribution >= 0 ? '+' : ''}{driver.contribution}
      </span>
    </div>
  );
}

function MiniStat({ label, val }: { label: string; val: number }) {
  return (
    <div className="flex-1">
      <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase mb-1">
        <span>{label}</span>
        <span>{Math.round(val)}</span>
      </div>
      <div className="h-1 w-full bg-black/5 rounded-full overflow-hidden">
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
    <div className={`rounded-xl border p-3.5 ${toneClass}`}>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] opacity-75">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-[13px] font-semibold leading-relaxed">{value}</div>
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
    <div className={`rounded-xl px-3.5 py-3 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-70">{label}</div>
      <div className="mt-1 text-[13px] font-semibold leading-relaxed">{value}</div>
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
    <div className={`rounded-xl px-3.5 py-3 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-70">{label}</div>
      <div className="mt-1 text-[22px] font-bold">{value}</div>
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
    reputation: '声誉',
    commission: '佣金',
  };
  return labels[metric] || metric;
}

function deriveActionPriority(actionId: string, caseItem: Case, opportunities: any[], enabled: boolean) {
  let score = enabled ? 40 : 0;

  if (actionId === 'first-visit' && caseItem.lastTouchedDay <= 0) score += 52;
  if (actionId === 'weekly-feedback' && (caseItem.trust < 60 || caseItem.patience < 45 || caseItem.urgency > 78)) score += 46;
  if (actionId === 'deep-diagnosis' && (opportunities.some(o => o.visibility === 'shadow') || caseItem.askPrice > caseItem.marketPrice * 1.03)) score += 44;
  if (actionId === 'story' && (caseItem.d2 < 70 || caseItem.heat < 60)) score += 24;
  if (actionId === 'pricing-advice' && (caseItem.askPrice > caseItem.marketPrice * 1.02 || caseItem.d3 < 65)) score += 42;
  if (actionId === 'ask-psychological-price' && caseItem.bottomPrice >= caseItem.marketPrice * 0.97) score += 34;
  if (actionId === 'adjust-listing-price' && caseItem.askPrice > caseItem.marketPrice * 1.03) score += 52;
  if (actionId === 'xiaohongshu-boost' && opportunities.length <= 2) score += 28;
  if (actionId === 'broker-broadcast' && !opportunities.some(o => o.visibility === 'shadow')) score += 30;
  if (actionId === 'private-referral' && caseItem.trust >= 62 && opportunities.length <= 3) score += 26;
  if (actionId === 'open-day' && opportunities.length <= 3 && caseItem.heat < 70) score += 26;
  if (actionId === 'showing' && opportunities.some(o => o.stageIndex >= 1 && o.visibility !== 'shadow')) score += 44;
  if (actionId === 'sincerity-sale' && opportunities.some(o => o.stageIndex >= 2 && o.visibility !== 'shadow')) score += 38;
  if (actionId === 'invite-customer-negotiation' && opportunities.some(o => o.stageIndex >= 3 && o.visibility !== 'shadow')) score += 56;

  return score;
}

function deriveActionFitLabel(priority: number, enabled: boolean) {
  if (!enabled) return '稍后再做';
  if (priority >= 85) return '优先做';
  return '可安排';
}

function deriveActionHint(actionId: string, caseItem: Case, opportunities: any[]) {
  if (actionId === 'first-visit') return caseItem.lastTouchedDay <= 0 ? '适合先把经营路径讲清楚' : '适合重建第一轮共识';
  if (actionId === 'weekly-feedback') return caseItem.trust < 60 ? '适合先稳住业主关系' : '适合做一次节奏反馈';
  if (actionId === 'deep-diagnosis') return opportunities.some(o => o.visibility === 'shadow') ? '适合把预测客群和盘面问题讲透' : '适合重新诊断真实卡点';
  if (actionId === 'story') return caseItem.d2 < 70 ? '适合补强卖点表达' : '可继续优化讲法';
  if (actionId === 'pricing-advice') return caseItem.askPrice > caseItem.marketPrice * 1.03 ? '适合先讲清价格站位' : '适合先统一定价口径';
  if (actionId === 'ask-psychological-price') return '先摸清业主真实心理价，再决定怎么往下谈';
  if (actionId === 'adjust-listing-price') return caseItem.askPrice > caseItem.marketPrice * 1.03 ? '价格偏硬时优先考虑' : '先确认是否真的需要调价';
  if (actionId === 'xiaohongshu-boost') return opportunities.length <= 2 ? '公开客群偏薄时值得补量' : '当前更适合先转化现有客户';
  if (actionId === 'broker-broadcast') return opportunities.some(o => o.visibility === 'shadow') ? '待确认客户已经不少，先消化现有客群' : '适合补一批经纪人侧客群';
  if (actionId === 'private-referral') return caseItem.trust >= 62 ? '关系比较顺时，私域线索质量更好' : '先稳住业主和卖点，再做私域转介绍';
  if (actionId === 'open-day') return caseItem.heat < 70 ? '适合用活动拉热度' : '热度已在线，按需再开';
  if (actionId === 'showing') return opportunities.some(o => o.stageIndex >= 1 && o.visibility !== 'shadow') ? '已有客户可推进到看房' : '先把客户接上再安排带看';
  if (actionId === 'sincerity-sale') return opportunities.some(o => o.stageIndex >= 2 && o.visibility !== 'shadow') ? '适合把成熟客户推进到诚意阶段' : '还没到适合做诚意卖的时候';
  if (actionId === 'invite-customer-negotiation') return opportunities.some(o => o.stageIndex >= 3 && o.visibility !== 'shadow') ? '已经有人接近成交桌' : '还没到谈判时机';
  return '结合当前节奏安排';
}

function derivePricePosition(caseItem: Case) {
  if (caseItem.askPrice <= caseItem.marketPrice) return '价格站位稳，可主打转化';
  if (caseItem.askPrice <= caseItem.marketPrice * 1.03) return '价格略硬，但还在可沟通区间';
  return `较市场高 ${caseItem.askPrice - caseItem.marketPrice} 万，需要重新校准口径`;
}

function deriveWindowLabel(caseItem: Case, opportunities: any[]) {
  if (caseItem.windowDays <= 5) return '窗口偏短';
  if (opportunities.some(o => o.daysLeft <= 2 && o.visibility !== 'shadow')) return '有客户接近流失';
  if (opportunities.some(o => o.visibility === 'shadow')) return '先确认预测客群';
  return '窗口尚稳';
}

function deriveTargetLabel(caseItem: Case, activeCount: number) {
  if (caseItem.stageIndex >= 4) return '把高阶段准客压到报价和议价';
  if (activeCount === 0) return '先把准客池重新补厚';
  if (caseItem.heat < 50) return '先把盘面热起来，再谈转化';
  return '把现有带看转成再看和报价';
}

function deriveManagerTake(caseItem: Case, opportunities: any[]) {
  if (caseItem.riskFlags?.includes('价格锚偏高')) return '先校准价格口径，别急着继续堆热度';
  if (opportunities.some(o => o.visibility === 'shadow')) return '池子里有还在判断中的预测客群，先摸清需求再安排带看';
  if (opportunities.some(o => o.stageIndex >= 3)) return '后段准客已出现，优先追转化';
  return '这套盘还能继续经营，但本周要让业主看到进展';
}

function deriveSellerGuidance(caseItem: Case) {
  if (caseItem.trust < 55) return '业主已经开始怀疑推进节奏，周反馈要讲结果，也要讲依据。';
  if (caseItem.patience < 45) return '业主耐心不高，适合先谈确定性，再谈更大的资源投入。';
  if (caseItem.urgency > 80) return '业主目标很急，沟通时更看重速度和确定性。';
  return '业主当前尚可协同，适合用本周进展去换下一步配合。';
}

function deriveCommunicationMode(caseItem: Case) {
  if (caseItem.personality === 'pragmatic') return '用带看反馈和竞品数据说话';
  if (caseItem.personality === 'emotional') return '先稳情绪，再给业主信心';
  if (caseItem.personality === 'urgent') return '强调速度和结果，不要绕太久';
  return '先把业主拉回统一口径';
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
  if (opportunities.length === 0) return '先补池子，再谈开放日和议价';
  if (opportunities.some(o => o.visibility === 'shadow')) return '先摸清预测客群，再决定重点推进谁';
  if (caseItem.askPrice > caseItem.marketPrice * 1.05) return '先修价格口径，再继续拉热度';
  return '把现有反馈沉淀成更顺的卖点表达';
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
      title: '处理快转冷的准客',
      detail: '池子里已经有人接近流失边缘，今天要先碰一下，不然转化温度会断。',
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
      detail: '这套盘暂无突发事项，适合先整理进展、补证据、稳住业主预期。',
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
  if (opportunity.visibility === 'shadow') return '先确认需求，再决定是否推进';
  if (opportunity.stageIndex >= 4) return '可进入报价管理';
  if (opportunity.stageIndex === 3) return '优先安排再看';
  if (opportunity.intent >= 70) return '适合追转化';
  return '先继续培养兴趣';
}

function deriveListingAgeLabel(state: GameState) {
  const startDay = state.runContext.scenarioSnapshot.scenario.startDay || 1;
  const listingDays = Math.max(1, state.day - startDay + 1);
  return `${listingDays}天`;
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
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold leading-none ${toneClass}`}>
      <span className="text-slate-400">{label}</span>
      <span>{value}</span>
    </span>
  );
}
