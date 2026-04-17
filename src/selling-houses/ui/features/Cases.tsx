import React, { useState } from 'react';
import { GameState, Case } from '../../domain/models';
import { ACTIONS } from '../../domain/constants';
import { costText, getCaseById, caseSortValue } from '../../domain/utils';
import { getActiveOpportunities, getActionAvailability, findBestOpportunity } from '../../domain/engine';
import { MoreVertical, Home as HomeIcon, MapPin, Gauge, Info, AlertCircle, Trophy, Users, Heart, History } from 'lucide-react';

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
              ? `${topOpportunity.customerName} 已来到 ${topOpportunity.stageLabel}。当前意向 ${Math.round(topOpportunity.intent)}，置信 ${Math.round(topOpportunity.confidence)}。你要决定以什么策略冲成交。`
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
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 h-full min-h-0">
      <aside className="bg-white rounded-[24px] border border-black/5 overflow-y-auto p-3 space-y-2 shadow-sm">
        {sortedCases.map(c => (
          <div 
            key={c.id}
            onClick={() => onSelectCase(c.id)}
            className={`p-4 rounded-2xl cursor-pointer transition-all border ${
              c.id === selectedCaseId 
                ? 'border-emerald-500 bg-emerald-50/50 shadow-inner' 
                : 'border-transparent hover:bg-slate-50'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500">
                {c.stageLabel}
              </span>
              <small className="text-slate-400 font-medium">{c.district}</small>
            </div>
            <strong className="block text-slate-800 line-clamp-1">{c.title}</strong>
            <div className="mt-3 flex gap-4">
              <MiniStat label="信任" val={c.trust} />
              <MiniStat label="热度" val={c.heat} />
            </div>
          </div>
        ))}
      </aside>

      <main className="bg-white rounded-[24px] border border-black/5 overflow-y-auto p-8 shadow-sm flex flex-col">
        {selectedCase ? (
          <>
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-3xl font-semibold text-slate-900 tracking-tight">{selectedCase.title}</h2>
                <div className="flex items-center gap-4 mt-2 text-slate-500">
                  <div className="flex items-center gap-1"><HomeIcon size={14} /> <span>{selectedCase.community}</span></div>
                  <div className="flex items-center gap-1"><MapPin size={14} /> <span>{selectedCase.district}</span></div>
                  <div className="text-slate-300">/</div>
                  <div>{selectedCase.layout} · {selectedCase.area}㎡</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-900">{selectedCase.askPrice} <span className="text-sm font-normal text-slate-400">万</span></div>
                <div className="text-xs text-slate-400 mt-1">市场心理价 {selectedCase.marketPrice} 万</div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-6 mb-10">
              <DetailStat label="竞争力总分" val={selectedCase.competitiveness} icon={<Trophy size={16} />} color="bg-emerald-600" />
              <DetailStat label="D1 准客管理" val={selectedCase.d1} icon={<Users size={16} />} />
              <DetailStat label="D2 居住素质" val={selectedCase.d2} icon={<HomeIcon size={16} />} />
              <DetailStat label="D3 业主意愿" val={selectedCase.d3} icon={<Heart size={16} />} />
            </div>

            {/* Attribution Panel */}
            {selectedCase.competitivenessSnapshots?.length > 0 && (
              <div className="mb-10 p-5 rounded-2xl bg-slate-50 border border-black/[0.03]">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <History size={14} /> 经营归因
                  </h4>
                  <span className={`text-xs font-bold ${selectedCase.competitivenessSnapshots[0].delta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {selectedCase.competitivenessSnapshots[0].delta >= 0 ? '+' : ''}{Math.round(selectedCase.competitivenessSnapshots[0].delta * 10) / 10}pts
                  </span>
                </div>
                <div className="space-y-3">
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

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-10 min-h-0 flex-1">
              <section>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">执行指令</h4>
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
                <div className="grid grid-cols-1 gap-3">
                  {ACTIONS.map(a => {
                    const availability = getActionAvailability(state, selectedCase, a.id);
                    return (
                      <div key={a.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-black/[0.03]">
                        <div>
                          <div className="font-semibold text-slate-800">{a.name}</div>
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
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">关联机会 ({getActiveOpportunities(state, selectedCase.id).length})</h4>
                <div className="space-y-3 overflow-y-auto">
                  {getActiveOpportunities(state, selectedCase.id).map(o => (
                    <div key={o.id} className="p-4 rounded-2xl border border-dashed border-slate-200">
                      <div className="flex justify-between items-center mb-2">
                        <strong className="text-slate-800">{o.customerName}</strong>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-600 rounded">{o.stageLabel}</span>
                      </div>
                      <div className="flex gap-4 text-xs text-slate-500">
                        <span>意向 {Math.round(o.intent)}%</span>
                        <span>置信 {Math.round(o.confidence)}%</span>
                        <span className="ml-auto text-slate-300">{o.daysLeft} 天流失</span>
                      </div>
                    </div>
                  ))}
                  {getActiveOpportunities(state, selectedCase.id).length === 0 && (
                    <div className="flex-1 flex items-center justify-center p-12 border-2 border-dashed border-slate-100 rounded-3xl text-slate-300 text-sm italic">
                      暂无活跃机会，请补进流量。
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
    <div className="space-y-2">
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
        <span className="px-1.5 py-0.5 rounded-md bg-white text-[8px] font-bold text-slate-400 border border-black/5 uppercase">
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
