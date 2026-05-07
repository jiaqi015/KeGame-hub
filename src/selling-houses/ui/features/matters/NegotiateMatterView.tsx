import React, { useState } from 'react';
import type { GameState, Case, MatterEntry } from '../../../domain/models';
import type { ActionDecisionConfig, CharacterFeedback, Settlement } from '../ActionDecisionOverlay';
import { getActionTemplate } from '../../../domain/actions/templates';
import { ACTIONS } from '../../../domain/actions/definitions';

interface Props {
  config: ActionDecisionConfig;
  matter?: MatterEntry;
  onChoose?: (optionId: string, assistOptionId?: string, choices?: Array<{ round: number; main: string; assist: string }>, feedbacks?: CharacterFeedback[]) => void;
  onComplete?: (result: Settlement, choices: Array<{ round: number; main: string; assist: string }>, feedbacks: CharacterFeedback[]) => void;
  onClose: () => void;
  state?: GameState;
  caseItem?: Case;
}

export function NegotiateMatterView({ config, matter, onChoose, onComplete, onClose, state, caseItem }: Props) {
  const mode = !config.isScenario ? 'direct' : config.scenarioMode === 'heavy' ? 'heavy' : 'light';
  const totalRounds = mode === 'heavy' ? 3 : 2;

  const [currentRound, setCurrentRound] = useState(1);
  const [phase, setPhase] = useState<'choosing' | 'feedback' | 'result' | 'breakdown'>('choosing');
  const [selectedMain, setSelectedMain] = useState<string | null>(null);
  const [selectedAssist, setSelectedAssist] = useState<string | null>(null);
  const [choices, setChoices] = useState<Array<{ round: number; main: string; assist: string }>>([]);
  const [feedbacks, setFeedbacks] = useState<CharacterFeedback[]>([]);
  const [result, setResult] = useState<Settlement | null>(null);

  // For visual tug-of-war
  const [ropePosition, setRopePosition] = useState(50); // 0 = owner wins, 100 = customer wins, 50 = middle
  const [shake, setShake] = useState(false);

  const getCurrentRound = () => {
    if (mode === 'direct') return null;
    return config.rounds?.[currentRound - 1] || null;
  };
  const currentRoundConfig = getCurrentRound();

  const handleConfirmChoice = () => {
    if (!selectedMain) return;

    let feedback: CharacterFeedback;
    if (mode === 'direct') {
      onChoose?.(selectedMain);
      onClose();
      return;
    }

    const template = config.actionId ? getActionTemplate(ACTIONS.find((a) => a.id === config.actionId)!) : null;
    if (template && (template as any).getFeedback) {
      feedback = (template as any).getFeedback(selectedMain, selectedAssist || '', state, caseItem);
    } else if (config.rounds) {
      const roundDef = config.rounds[currentRound - 1];
      feedback = roundDef.getFeedback(selectedMain, selectedAssist || '', state, caseItem);
    } else {
      feedback = { actor: 'owner', mood: 'neutral', message: '"再看看吧。"', metricChanges: [] };
    }

    // Update rope position based on mood
    if (feedback.mood === 'negative') {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setRopePosition(prev => Math.max(10, prev - 20)); // pull towards owner
    } else if (feedback.mood === 'positive') {
      setRopePosition(prev => Math.min(90, prev + 20)); // pull towards customer
    }

    setChoices([...choices, { round: currentRound, main: selectedMain, assist: selectedAssist || '' }]);
    setFeedbacks([...feedbacks, feedback]);
    
    // Check if breakdown
    if (feedback.mood === 'negative' && ropePosition <= 30) {
      setTimeout(() => setPhase('breakdown'), 600);
    } else {
      setTimeout(() => setPhase('feedback'), 400);
    }
  };

  const handleContinue = () => {
    if (currentRound < totalRounds) {
      setCurrentRound(currentRound + 1);
      setSelectedMain(null);
      setSelectedAssist(null);
      setPhase('choosing');
    } else {
      const template = config.actionId ? getActionTemplate(ACTIONS.find((a) => a.id === config.actionId)!) : null;
      let outcomeResult: Settlement;
      if (template && (template as any).resolveOutcome) {
        outcomeResult = (template as any).resolveOutcome(choices, feedbacks, state, caseItem);
      } else {
        outcomeResult = {
          outcome: 'progress',
          title: '博弈结束',
          summary: '谈判已完成。',
          details: [],
          stateDeltas: feedbacks.flatMap((f) => f.metricChanges.map((m) => ({ field: m.label, value: m.change, label: m.label }))),
          nextActionHint: '等待下一步',
          finalOptionId: choices[choices.length - 1]?.main || null,
        };
      }
      setResult(outcomeResult);
      setPhase('result');
    }
  };

  const handleFinish = () => {
    if (onComplete && result) {
      onComplete(result, choices, feedbacks);
    } else if (phase === 'breakdown' && onComplete) {
       // Mock a regress result for breakdown
       onComplete({
          outcome: 'regress',
          title: '谈判破裂',
          summary: '已触及对方底线，当前博弈无法继续。',
          details: [],
          stateDeltas: [],
          nextActionHint: '需要缓和关系',
          finalOptionId: choices[choices.length - 1]?.main || null,
       }, choices, feedbacks);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,8,12,0.92)] p-4 backdrop-blur-md">
      <div className={`flex h-full max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-[24px] border border-[var(--seller-border)] bg-[linear-gradient(180deg,#111823_0%,#091018_100%)] shadow-[0_0_120px_rgba(220,40,40,0.1)] transition-transform duration-75 ${shake ? 'translate-x-2 -translate-y-1' : ''}`}>
        
        {/* Tug-of-War Top Bar */}
        <div className="relative pt-10 pb-6 px-12 bg-[rgba(255,255,255,0.02)] border-b border-[var(--seller-border)]">
           <div className="absolute top-4 left-6 text-[11px] font-bold uppercase tracking-[0.14em] text-red-400">
             博弈桌 · {matter?.title || config.title}
           </div>
           
           <div className="flex justify-between items-end mb-4">
             <div className="text-left">
               <div className="text-[14px] font-bold text-[var(--seller-ink)]">业主防线</div>
               <div className="text-[12px] text-[var(--seller-muted)]">价格咬死 / 意愿低</div>
             </div>
             <div className="text-center">
                <div className="text-[20px] font-bold text-[var(--seller-ink)]">当前共识度</div>
             </div>
             <div className="text-right">
               <div className="text-[14px] font-bold text-[var(--seller-ink)]">客户预期</div>
               <div className="text-[12px] text-[var(--seller-muted)]">要大刀 / 随时走</div>
             </div>
           </div>

           {/* The Rope */}
           <div className="relative h-4 w-full bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
              <div 
                className="absolute top-0 bottom-0 left-0 bg-red-500/80 transition-all duration-500 ease-out" 
                style={{ width: `${ropePosition}%` }} 
              />
              <div 
                className="absolute top-0 bottom-0 left-0 w-full border-x-4 border-black/50" 
                style={{ clipPath: `inset(0 ${100 - ropePosition - 2}% 0 ${ropePosition - 2}%)` }} 
              />
           </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: History Chips */}
          <div className="w-1/3 border-r border-[var(--seller-border)] bg-[rgba(0,0,0,0.2)] p-6 overflow-y-auto hidden md:block">
             <h4 className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--seller-muted)] mb-4">历史试探单</h4>
             <div className="space-y-3">
               {choices.map((c, i) => {
                 const f = feedbacks[i];
                 const mainOptionTitle = config.rounds?.[c.round - 1]?.mainStrategies?.find((o: any) => o.id === c.main)?.title || c.main;
                 return (
                   <div key={i} className="rounded-[12px] bg-[rgba(255,255,255,0.03)] p-3 border border-[rgba(255,255,255,0.05)]">
                      <div className="text-[10px] text-[var(--seller-subtle)] mb-1">第 {c.round} 轮</div>
                      <div className="text-[12px] font-bold text-[var(--seller-ink)] mb-2">{mainOptionTitle}</div>
                      {f && (
                        <div className={`text-[11px] italic ${f.mood === 'negative' ? 'text-red-400' : f.mood === 'positive' ? 'text-green-400' : 'text-[var(--seller-muted)]'}`}>
                          "{f.message}"
                        </div>
                      )}
                   </div>
                 );
               })}
               {choices.length === 0 && (
                 <div className="text-[12px] text-[var(--seller-subtle)] italic">尚未出牌</div>
               )}
             </div>
          </div>

          {/* Right: Action Area */}
          <div className="flex-1 p-8 overflow-y-auto relative">
             {phase === 'breakdown' && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[rgba(20,5,5,0.9)] backdrop-blur-sm p-8 text-center animate-in zoom-in-95 fade-in">
                  <div className="w-32 h-32 rounded-full border-4 border-red-600 flex items-center justify-center rotate-12 mb-6">
                    <span className="text-red-600 font-black text-3xl tracking-widest">破裂</span>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">谈判已崩盘</h3>
                  <p className="text-red-200 mb-8 max-w-md">
                    {feedbacks[feedbacks.length - 1]?.message}
                    <br/><br/>
                    你触碰了对方的绝对底线，当前博弈窗口已关闭。
                  </p>
                  <button onClick={handleFinish} className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-full transition-colors">
                    接受结果并退出
                  </button>
                </div>
             )}

             {phase === 'result' && result && (
                <div className="flex flex-col items-center justify-center h-full text-center animate-in fade-in slide-in-from-bottom-4">
                  <div className="text-5xl mb-4">
                    {result.outcome === 'strong-progress' ? '🤝' : result.outcome === 'regress' ? '⚠️' : '⚖️'}
                  </div>
                  <h3 className="text-2xl font-bold text-[var(--seller-ink)] mb-2">{result.title}</h3>
                  <p className="text-[14px] text-[var(--seller-muted)] mb-8">{result.summary}</p>
                  <button onClick={handleFinish} className="seller-button-primary px-8 py-3 rounded-full font-bold">
                    完成结算
                  </button>
                </div>
             )}

             {phase === 'feedback' && feedbacks.length > 0 && (
                <div className="flex flex-col items-center justify-center h-full animate-in zoom-in-95">
                  <div className={`text-[12px] font-bold uppercase tracking-[0.14em] mb-4 ${
                    feedbacks[feedbacks.length - 1].mood === 'negative' ? 'text-red-400' : 'text-[var(--seller-muted)]'
                  }`}>
                    对方反馈
                  </div>
                  <div className="text-[20px] font-bold text-white text-center leading-relaxed italic mb-8 max-w-lg">
                    {feedbacks[feedbacks.length - 1].message}
                  </div>
                  <button onClick={handleContinue} className="seller-button-primary px-8 py-3 rounded-full font-bold">
                    {currentRound < totalRounds ? '准备下一轮出牌' : '查看最终结果'}
                  </button>
                </div>
             )}

             {phase === 'choosing' && currentRoundConfig && (
               <div className="animate-in fade-in slide-in-from-right-4">
                 <div className="flex justify-between items-end mb-6">
                   <div>
                     <h4 className="text-[18px] font-bold text-[var(--seller-ink)]">{currentRoundConfig.title}</h4>
                     <p className="text-[13px] text-[var(--seller-muted)] mt-1">{currentRoundConfig.description}</p>
                   </div>
                   <div className="text-[11px] font-bold text-[var(--seller-subtle)] uppercase tracking-wider">
                     第 {currentRound} 轮抛出
                   </div>
                 </div>

                 <div className="space-y-3 mb-8">
                   {currentRoundConfig.mainStrategies.map((opt: any) => (
                      <button
                        key={opt.id}
                        onClick={() => setSelectedMain(opt.id)}
                        className={`w-full text-left p-4 rounded-[16px] border transition-all ${
                          selectedMain === opt.id 
                            ? 'border-[var(--seller-accent)] bg-[var(--seller-accent-soft)] shadow-[0_0_20px_rgba(40,120,240,0.2)]' 
                            : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.2)]'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className={`font-bold text-[14px] ${selectedMain === opt.id ? 'text-[var(--seller-accent)]' : 'text-[var(--seller-ink)]'}`}>
                            {opt.title}
                          </span>
                        </div>
                        <div className="text-[12px] text-[var(--seller-muted)]">{opt.note}</div>
                      </button>
                   ))}
                 </div>

                 {currentRoundConfig.assistStrategies && currentRoundConfig.assistStrategies.length > 0 && (
                    <div className="mb-8">
                       <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)] mb-3">搭配附加条件 (可选)</div>
                       <div className="grid grid-cols-2 gap-3">
                         {currentRoundConfig.assistStrategies.map((opt: any) => (
                           <button
                             key={opt.id}
                             onClick={() => setSelectedAssist(selectedAssist === opt.id ? null : opt.id)}
                             className={`text-left p-3 rounded-[12px] border transition-all ${
                               selectedAssist === opt.id
                                 ? 'border-yellow-500/50 bg-yellow-500/10'
                                 : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] hover:border-yellow-500/30'
                             }`}
                           >
                             <div className={`font-bold text-[12px] ${selectedAssist === opt.id ? 'text-yellow-400' : 'text-[var(--seller-ink)]'}`}>
                               {opt.title}
                             </div>
                           </button>
                         ))}
                       </div>
                    </div>
                 )}

                 <div className="flex justify-end pt-4 border-t border-[rgba(255,255,255,0.05)]">
                   <button 
                     disabled={!selectedMain}
                     onClick={handleConfirmChoice}
                     className="seller-button-primary px-10 py-3 rounded-full text-[14px] font-bold disabled:opacity-30 disabled:grayscale transition-all hover:scale-105"
                   >
                     抛出筹码
                   </button>
                 </div>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
