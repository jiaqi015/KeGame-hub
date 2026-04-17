import React, { useState } from 'react';
import { GameState, Case } from '../../domain/models';
import { ACTIONS } from '../../domain/constants';
import { costText, caseSortValue } from '../../domain/utils';
import { getActiveOpportunities, getActionAvailability, findBestOpportunity } from '../../domain/engine';
import { PERSONALITIES } from '../../domain/constants';
import { Home as HomeIcon, MapPin, Trophy, Users, Heart, History, Star, Shield, Target, BriefcaseBusiness, TrendingUp, MessagesSquare } from 'lucide-react';

interface CasesProps {
  state: GameState;
  onSelectCase: (id: string) => void;
  onExecuteAction: (actionId: string, caseItem: any, optionId?: string | null) => boolean;
  autoDecision: boolean;
  onToggleAutoDecision: () => void;
}

export function Cases({ state, onSelectCase, onExecuteAction, autoDecision, onToggleAutoDecision }: CasesProps) {
  const { cases, selectedCaseId } = state;
  const sortedCases = [...cases].sort((a, b) => caseSortValue(b) - caseSortValue(a));
  const selectedCase = cases.find(c => c.id === selectedCaseId) || sortedCases[0];
  const activeOpportunities = selectedCase ? getActiveOpportunities(state, selectedCase.id) : [];

  const [decisionConfig, setDecisionConfig] = useState<any>(null);

  const handleAction = (actionId: string) => {
    const action = ACTIONS.find(a => a.id === actionId);
    if (!action) return;

    if (action.type === 'scenario') {
      if (autoDecision) {
        // Auto-resolve with balanced strategy
        const defaultOptionId = actionId === "negotiate" ? "balanced" : "small-cut";
        onExecuteAction(actionId, selectedCase, defaultOptionId);
        return;
      }
      
      const topOpportunity = findBestOpportunity(state, selectedCase.id, actionId === "negotiate" ? 3 : 0);
      const config = actionId === "price-talk"
        ? {
            actionId,
            title: `${selectedCase.title} · 调价沟通`,
            body: `${selectedCase.ownerName} 目前状态：${selectedCase.ownerMood || '平稳'}。当前报价 ${selectedCase.askPrice} 万，市场心理价 ${selectedCase.marketPrice} 万。你要决定是守价、微调还是快速去化。`,
            options: [
              { id: "hold-story", title: "不先降价，换话术和包装", note: "关系小幅回升，竞争力提升，但去化速度变化有限。" },
              { id: "small-cut", title: "小降 1.5%，换更高确定性", note: "速度与价格比较平衡，是最稳的中位方案。" },
              { id: "deep-cut", title: "明降 3%，强行换窗口", note: "关系和热度提得最快，但价格让步最大。" },
            ],
          }
        : {
            actionId,
            title: `${selectedCase.title} · 议价冲刺`,
            body: topOpportunity
              ? (() => {
                  const isShadow = topOpportunity.visibility === 'shadow';
                  const displayName = isShadow ? `影子客 #${topOpportunity.id.split('-').pop()}` : topOpportunity.customerName;
                  return `${displayName} 已来到 ${topOpportunity.stageLabel}。${isShadow ? '意向和底牌仍处于黑盒状态。' : `当前意向 ${Math.round(topOpportunity.intent)}，置信 ${Math.round(topOpportunity.confidence)}。`} 你要决定以什么策略冲成交。`;
                })()
              : "当前没有进入报价阶段的客户，无法发起议价冲刺。",
            options: topOpportunity ? [
              { id: "hold", title: "守价硬谈", note: "成交价更高，但失败风险也明显更大。" },
              { id: "balanced", title: "让 1%，换掉桌上的犹豫", note: "兼顾价格与成交率，通常是最稳的谈法。" },
              { id: "close", title: "优先成交，主动给出让步", note: "成交率最高，但佣金和价格都会更低。" },
            ] : [],
          };
      setDecisionConfig(config);
    } else {
      onExecuteAction(actionId, selectedCase);
    }
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-2 overflow-y-auto rounded-[20px] border border-black/5 bg-white p-2.5 shadow-sm">
        {sortedCases.map(c => (
          <div 
            key={c.id}
            onClick={() => onSelectCase(c.id)}
            className={`relative overflow-hidden rounded-xl border p-3.5 transition-all cursor-pointer ${
              c.id === selectedCaseId 
                ? 'border-emerald-500 bg-emerald-50/50 shadow-inner' 
                : 'border-transparent hover:bg-slate-50'
            }`}
          >
            {c.isFocused && (
              <div className="absolute top-0 right-0 p-1 bg-amber-500 text-white rounded-bl-xl shadow-lg animate-pulse">
                <Star size={10} fill="currentColor" />
              </div>
            )}
            <div className="flex justify-between items-start mb-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                c.isFocused ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {c.isFocused ? '本周聚焦' : c.stageLabel}
              </span>
              <small className="text-slate-400 font-medium">{c.district}</small>
            </div>
            <strong className="block text-slate-800 line-clamp-1">{c.title}</strong>
            <div className="mt-2.5 flex items-center gap-3">
              <MiniStat label="信任" val={c.trust} />
              <MiniStat label="热度" val={c.heat} />
              <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded ${
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
                </div>
                <div className="rounded-[22px] border border-black/[0.04] bg-white px-4 py-4 text-right shadow-sm">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">挂牌价格</div>
                  <div className="mt-2 text-[28px] font-bold text-slate-900">
                    {selectedCase.askPrice} <span className="text-sm font-normal text-slate-400">万</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">市场心理价 {selectedCase.marketPrice} 万</div>
                  <div className={`mt-3 text-xs font-bold ${selectedCase.askPrice <= selectedCase.marketPrice ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {selectedCase.askPrice <= selectedCase.marketPrice ? '价格站位稳，可主打转化' : `较市场高 ${selectedCase.askPrice - selectedCase.marketPrice} 万`}
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_1fr]">
              <section className="rounded-[20px] border border-black/[0.04] bg-slate-50/80 p-5">
                <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  <MessagesSquare size={14} />
                  房东状态
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-black/[0.04] bg-white p-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">当前状态</div>
                    <div className="mt-2 text-sm font-semibold text-slate-800">{selectedCase.ownerMood || '待观察'}</div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      {deriveSellerGuidance(selectedCase)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-black/[0.04] bg-white p-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">沟通建议</div>
                    <div className="mt-2 text-sm font-semibold text-slate-800">{deriveCommunicationMode(selectedCase)}</div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      {selectedCase.personality ? PERSONALITIES[selectedCase.personality as keyof typeof PERSONALITIES]?.desc : '先用反馈把房东拉回同一页。'}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <DetailStat label="信任度" val={selectedCase.trust} icon={<Shield size={16} />} color="bg-emerald-600" />
                  <DetailStat label="耐心" val={selectedCase.patience} icon={<Heart size={16} />} color="bg-rose-500" />
                  <DetailStat label="紧迫度" val={selectedCase.urgency} icon={<Target size={16} />} color="bg-amber-500" />
                </div>
              </section>

              <section className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  <Trophy size={14} />
                  盘面竞争力
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <DetailStat label="竞争力总分" val={selectedCase.competitiveness} icon={<Trophy size={16} />} color="bg-emerald-600" />
                  <DetailStat label="准客池厚度" val={selectedCase.d1} icon={<Users size={16} />} color="bg-sky-500" />
                  <DetailStat label="货盘素质" val={selectedCase.d2} icon={<HomeIcon size={16} />} color="bg-slate-900" />
                  <DetailStat label="房东配合" val={selectedCase.d3} icon={<Heart size={16} />} color="bg-rose-500" />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-3">
                  <MetricChip label="强项" value={deriveStrongPoint(selectedCase)} tone="emerald" />
                  <MetricChip label="短板" value={deriveWeakPoint(selectedCase)} tone="amber" />
                  <MetricChip label="最该修" value={deriveNextFix(selectedCase, activeOpportunities)} tone="slate" />
                </div>
              </section>
            </div>

            {/* Attribution Panel */}
            {selectedCase.competitivenessSnapshots?.length > 0 && (
              <div className="mb-6 rounded-[18px] border border-black/[0.03] bg-slate-50 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <History size={14} /> 经营归因
                  </h4>
                  <span className={`text-xs font-bold ${selectedCase.competitivenessSnapshots[0].delta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {selectedCase.competitivenessSnapshots[0].delta >= 0 ? '+' : ''}{Math.round(selectedCase.competitivenessSnapshots[0].delta * 10) / 10}pts
                  </span>
                </div>
                <div className="space-y-2.5">
                  {(selectedCase.competitivenessSnapshots[0].breakdown.d1_drivers || []).map((d: any, i: number) => (
                    <AttributionItem key={`d1-${i}`} driver={d} category="漏斗" />
                  ))}
                  {(selectedCase.competitivenessSnapshots[0].breakdown.d3_drivers || []).map((d: any, i: number) => (
                    <AttributionItem key={`d3-${i}`} driver={d} category="意愿" />
                  ))}
                  {(!selectedCase.competitivenessSnapshots[0].breakdown.d1_drivers?.length && 
                    !selectedCase.competitivenessSnapshots[0].breakdown.d3_drivers?.length) && (
                    <p className="text-xs text-slate-400 italic">本日数值平稳漂移，无重大转折。</p>
                  )}
                </div>
              </div>
            )}

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 xl:grid-cols-[1fr_1.05fr]">
              <section className="min-h-0">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">本周事项</h4>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <span className="text-[10px] font-bold text-slate-300 group-hover:text-slate-500 transition-colors uppercase tracking-widest">自动决策</span>
                    <div 
                      onClick={onToggleAutoDecision}
                      className={`w-8 h-4 rounded-full relative transition-colors ${autoDecision ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${autoDecision ? 'left-4.5' : 'left-0.5'}`} />
                    </div>
                  </label>
                </div>
                <div className="mb-5 space-y-2.5">
                  {deriveCaseMatters(state, selectedCase, activeOpportunities).map((matter, index) => (
                    <div key={`${matter.title}-${index}`} className="rounded-xl border border-black/[0.04] bg-slate-50 p-3.5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-[13px] font-semibold text-slate-800">{matter.title}</div>
                          <p className="mt-1 text-xs leading-relaxed text-slate-500">{matter.detail}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${matter.tone === 'rose' ? 'bg-rose-100 text-rose-600' : matter.tone === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-600'}`}>
                          {matter.badge}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mb-4 flex items-center justify-between">
                  <h5 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">可用手段</h5>
                  <span className="text-[10px] font-medium text-slate-300">事项里的应对动作</span>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {ACTIONS.map(a => {
                    const availability = getActionAvailability(state, selectedCase, a.id);
                    return (
                      <div key={a.id} className="flex items-center justify-between gap-4 rounded-xl border border-black/[0.03] bg-slate-50 p-3.5">
                        <div>
                          <div className="text-[13px] font-semibold text-slate-800">{a.name}</div>
                          <div className="mt-1 text-xs leading-relaxed text-slate-500">{a.description}</div>
                          <div className="text-xs text-slate-400">{costText(a)}</div>
                        </div>
                        <button 
                          disabled={!availability.enabled}
                          onClick={() => handleAction(a.id)}
                          className={`px-4 py-2 rounded-xl font-bold text-xs transition-all ${
                            availability.enabled 
                              ? 'bg-white text-slate-900 shadow-sm border border-black/5 hover:bg-slate-900 hover:text-white' 
                              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          执行
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="flex flex-col">
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">准客池</h4>
                  <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-300">{activeOpportunities.length} 位活跃准客</span>
                </div>
                <div className="mb-4 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
                  <PoolMetric label="池子总量" value={activeOpportunities.length} tone="slate" />
                  <PoolMetric label="高意向" value={activeOpportunities.filter(o => o.intent >= 75).length} tone="emerald" />
                  <PoolMetric label="黑盒线索" value={activeOpportunities.filter(o => o.visibility === 'shadow').length} tone="amber" />
                  <PoolMetric label="3天内转冷" value={activeOpportunities.filter(o => o.daysLeft <= 3).length} tone="rose" />
                </div>
                <div className="mb-4 rounded-xl border border-black/[0.04] bg-slate-50 p-4">
                  <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">阶段分布</div>
                  <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
                    {derivePoolStages(activeOpportunities).map(stage => (
                      <div key={stage.label} className="rounded-lg bg-white px-3 py-2 text-center shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{stage.label}</div>
                        <div className="mt-1 text-[17px] font-bold text-slate-800">{stage.count}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2.5 overflow-y-auto">
                  {activeOpportunities.map(o => {
                    const isShadow = o.visibility === 'shadow';
                    const displayName = isShadow ? `影子客 #${o.id.split('-').pop()}` : o.customerName;
                    return (
                      <div key={o.id} className={`rounded-xl border border-dashed p-3.5 ${isShadow ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200'}`}>
                        <div className="flex justify-between items-center mb-2">
                          <strong className="text-slate-800">{displayName}</strong>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isShadow ? 'bg-amber-100 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                            {isShadow ? '待揭秘' : o.stageLabel}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                          {isShadow ? (
                            <span className="text-amber-500 italic">底牌未知 (请先对线)</span>
                          ) : (
                            <>
                              <span>意向 {Math.round(o.intent)}%</span>
                              <span>置信 {Math.round(o.confidence)}%</span>
                            </>
                          )}
                          <span>来源 {o.channelName}</span>
                          <span>{deriveLeadSuggestion(o)}</span>
                          <span className="ml-auto text-slate-300">{o.daysLeft} 天流失</span>
                        </div>
                      </div>
                    );
                  })}
                  {activeOpportunities.length === 0 && (
                    <div className="flex flex-1 items-center justify-center rounded-[24px] border-2 border-dashed border-slate-100 p-10 text-sm italic text-slate-300">
                      准客池偏空，先补线索或争取一次聚焦动作。
                    </div>
                  )}
                </div>
              </section>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 italic">选择一个房源开始经营</div>
        )}
      </main>

      {decisionConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
          <div className="bg-white rounded-[32px] shadow-2xl max-w-lg w-full p-8 animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-slate-900 mb-2">{decisionConfig.title}</h3>
            <p className="text-slate-500 text-sm leading-relaxed mb-6">{decisionConfig.body}</p>
            <div className="space-y-3">
              {decisionConfig.options.map((opt: any) => (
                <button 
                  key={opt.id}
                  onClick={() => {
                    onExecuteAction(decisionConfig.actionId, selectedCase, opt.id);
                    setDecisionConfig(null);
                  }}
                  className="w-full text-left p-4 rounded-2xl bg-slate-50 border border-black/[0.03] hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
                >
                  <strong className="block text-slate-800 group-hover:text-emerald-700">{opt.title}</strong>
                  <p className="text-xs text-slate-400 mt-1">{opt.note}</p>
                </button>
              ))}
            </div>
            <div className="mt-8 flex justify-end">
              <button 
                onClick={() => setDecisionConfig(null)}
                className="px-6 py-2 rounded-full text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest"
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

function deriveTargetLabel(caseItem: Case, activeCount: number) {
  if (caseItem.stageIndex >= 4) return '把高阶段准客压到报价和议价';
  if (activeCount === 0) return '先把准客池重新补厚';
  if (caseItem.heat < 50) return '先把盘面热起来，再谈转化';
  return '把现有带看转成再看和报价';
}

function deriveManagerTake(caseItem: Case, opportunities: any[]) {
  if (caseItem.riskFlags?.includes('价格锚偏高')) return '先校准价格口径，别急着继续堆热度';
  if (opportunities.some(o => o.visibility === 'shadow')) return '池子里有黑盒线索，先对线再安排带看';
  if (opportunities.some(o => o.stageIndex >= 3)) return '后段准客已出现，优先追转化';
  return '这套盘还能继续经营，但本周要给房东看见进展';
}

function deriveSellerGuidance(caseItem: Case) {
  if (caseItem.trust < 55) return '房东已经开始怀疑推进节奏，周反馈要讲结果也要讲依据。';
  if (caseItem.patience < 45) return '房东耐心不高，适合先谈确定性，再谈更大的资源投入。';
  if (caseItem.urgency > 80) return '房东目标很急，沟通时更看重速度和确定性。';
  return '房东当前尚可协同，适合用本周进展去换下一步配合。';
}

function deriveCommunicationMode(caseItem: Case) {
  if (caseItem.personality === 'pragmatic') return '用带看反馈和竞品数据说话';
  if (caseItem.personality === 'emotional') return '先稳情绪，再给房东信心';
  if (caseItem.personality === 'urgent') return '强调速度和结果，不要绕太久';
  return '先把房东拉回统一口径';
}

function deriveStrongPoint(caseItem: Case) {
  if (caseItem.d2 >= 75) return '货盘素质在线，适合主打产品力';
  if (caseItem.d1 >= 70) return '准客池不薄，适合继续推带看';
  if (caseItem.d3 >= 70) return '房东配合不错，适合谈更强动作';
  return '基础面平稳，还有经营空间';
}

function deriveWeakPoint(caseItem: Case) {
  if (caseItem.askPrice > caseItem.marketPrice * 1.05) return '价格锚偏高，容易卡带看和报价';
  if (caseItem.d1 < 45) return '准客池偏浅，流量和带看都不够厚';
  if (caseItem.d3 < 50) return '房东意愿偏弱，容易在关键节点掉链子';
  return '没有致命短板，但还没形成强势窗口';
}

function deriveNextFix(caseItem: Case, opportunities: any[]) {
  if (opportunities.length === 0) return '先补池子，再谈开放日和议价';
  if (opportunities.some(o => o.visibility === 'shadow')) return '先摸清黑盒准客，再决定推谁';
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
      detail: '这套盘暂无突发事项，适合先整理进展、补证据、稳住房东预期。',
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
  if (opportunity.visibility === 'shadow') return '先对线，别盲推';
  if (opportunity.stageIndex >= 4) return '可进入报价管理';
  if (opportunity.stageIndex === 3) return '优先安排再看';
  if (opportunity.intent >= 70) return '适合追转化';
  return '先继续培养兴趣';
}
