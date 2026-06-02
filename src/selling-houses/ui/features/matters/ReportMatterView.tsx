import React, { useState } from 'react';
import type { GameState, Case, MatterEntry } from '../../../domain/models';
import type { ActionDecisionConfig, CharacterFeedback, Settlement } from '../ActionDecisionOverlay';
import { getActionTemplate, isScenarioTemplate } from '../../../domain/actions/templates';
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

export function ReportMatterView({ config, matter, onChoose, onComplete, onClose, state, caseItem }: Props) {
  const mode = !config.isScenario ? 'direct' : config.scenarioMode === 'heavy' ? 'heavy' : 'light';
  const totalRounds = mode === 'heavy' ? 3 : 2;

  const [currentRound, setCurrentRound] = useState(1);
  const [phase, setPhase] = useState<'choosing' | 'waiting' | 'feedback' | 'result'>('choosing');
  const [selectedMain, setSelectedMain] = useState<string | null>(null);
  const [choices, setChoices] = useState<Array<{ round: number; main: string; assist: string }>>([]);
  const [feedbacks, setFeedbacks] = useState<CharacterFeedback[]>([]);
  const [result, setResult] = useState<Settlement | null>(null);

  const getCurrentRound = () => {
    if (mode === 'direct') return null;
    return config.rounds?.[currentRound - 1] || null;
  };
  const currentRoundConfig = getCurrentRound();

  const handleSend = () => {
    if (!selectedMain) return;
    
    // Switch to waiting/sending animation
    setPhase('waiting');

    setTimeout(() => {
      let feedback: CharacterFeedback;
      if (mode === 'direct') {
        onChoose?.(selectedMain);
        onClose();
        return;
      }

      const template = config.actionId ? getActionTemplate(ACTIONS.find((a) => a.id === config.actionId)!) : null;
      if (template && isScenarioTemplate(template) && template.getFeedback) {
        feedback = template.getFeedback(selectedMain, '', state, caseItem);
      } else if (config.rounds) {
        const roundDef = config.rounds[currentRound - 1];
        feedback = roundDef.getFeedback(selectedMain, '', state, caseItem);
      } else {
        feedback = { actor: 'owner', mood: 'neutral', message: '"好的，我了解了。"', metricChanges: [] };
      }

      setChoices([...choices, { round: currentRound, main: selectedMain, assist: '' }]);
      setFeedbacks([...feedbacks, feedback]);
      setPhase('feedback');
    }, 1200); // simulate sending and receiving
  };

  const handleContinue = () => {
    if (currentRound < totalRounds) {
      setCurrentRound(currentRound + 1);
      setSelectedMain(null);
      setPhase('choosing');
    } else {
      const template = config.actionId ? getActionTemplate(ACTIONS.find((a) => a.id === config.actionId)!) : null;
      let outcomeResult: Settlement;
      if (template && isScenarioTemplate(template)) {
        outcomeResult = template.resolveOutcome(choices, feedbacks, state, caseItem);
      } else {
        outcomeResult = {
          outcome: 'progress',
          title: '汇报完成',
          summary: '已向对方同步完毕。',
          details: [],
          stateDeltas: feedbacks.flatMap((f) => f.metricChanges.map((m) => ({ field: m.label, value: m.change, label: m.label }))),
          nextActionHint: '等待后续反应',
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
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,8,12,0.85)] p-4 backdrop-blur-sm">
      <div className="flex h-full max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-[var(--seller-border)] bg-[var(--seller-paper)] shadow-2xl">
        <header className="border-b border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-accent)] mb-1">
                汇报线 · {matter?.title || config.title}
              </div>
              <h3 className="text-lg font-bold text-[var(--seller-ink)]">{config.title}</h3>
            </div>
            <button onClick={onClose} className="text-[var(--seller-muted)] hover:text-white">✕</button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-[rgba(5,8,12,0.4)] p-6 space-y-6">
          {/* Context Bubble */}
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-[rgba(255,255,255,0.05)] px-4 py-1 text-[11px] text-[var(--seller-muted)]">
              {config.summary}
            </div>
          </div>

          {/* History / Thread */}
          {choices.map((choice, i) => {
            const fb = feedbacks[i];
            const mainOptionTitle = config.rounds?.[choice.round - 1]?.mainStrategies?.find((o: any) => o.id === choice.main)?.title || choice.main;

            return (
              <React.Fragment key={i}>
                {/* My Message */}
                <div className="flex justify-end animate-in slide-in-from-right-4 fade-in">
                  <div className="max-w-[75%] rounded-[18px] rounded-tr-sm bg-[var(--seller-accent)] px-4 py-3 text-[13px] text-white">
                    <div className="font-bold mb-1 opacity-80 text-[10px]">我的汇报</div>
                    {mainOptionTitle}
                  </div>
                </div>
                {/* Reply */}
                {fb && (
                  <div className="flex justify-start animate-in slide-in-from-left-4 fade-in">
                    <div className="max-w-[75%] rounded-[18px] rounded-tl-sm bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] px-4 py-3 text-[13px] text-[var(--seller-ink)]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold opacity-80 text-[10px] uppercase">{fb.actor === 'owner' ? '业主' : '客户'} 回复</span>
                        {fb.mood === 'negative' && <span className="text-[10px] text-red-400">不满意</span>}
                        {fb.mood === 'positive' && <span className="text-[10px] text-green-400">满意</span>}
                      </div>
                      <div className="italic text-[var(--seller-subtle)]">"{fb.message}"</div>
                      {fb.metricChanges.length > 0 && (
                        <div className="mt-2 flex gap-2 text-[10px]">
                          {fb.metricChanges.map((mc, idx) => (
                            <span key={idx} className={mc.change > 0 ? 'text-green-400' : 'text-red-400'}>
                              {mc.label} {mc.change > 0 ? '+' : ''}{mc.change}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {/* Waiting Animation */}
          {phase === 'waiting' && (
            <div className="flex justify-start animate-in fade-in">
              <div className="rounded-[18px] rounded-tl-sm bg-[rgba(255,255,255,0.03)] px-5 py-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-[var(--seller-muted)] rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-[var(--seller-muted)] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-1.5 h-1.5 bg-[var(--seller-muted)] rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          )}

          {/* Result Phase */}
          {phase === 'result' && result && (
             <div className="flex justify-center animate-in fade-in slide-in-from-bottom-4 mt-8">
               <div className="text-center rounded-[16px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] p-6 max-w-sm">
                 <div className="text-3xl mb-2">
                   {result.outcome === 'strong-progress' ? '🎉' : result.outcome === 'regress' ? '⚠️' : '✅'}
                 </div>
                 <h4 className="font-bold text-[var(--seller-ink)]">{result.title}</h4>
                 <p className="text-[12px] text-[var(--seller-muted)] mt-1">{result.summary}</p>
                 <button onClick={handleFinish} className="mt-4 seller-button-primary px-6 py-2 rounded-full text-[12px] font-bold">
                   关闭记录
                 </button>
               </div>
             </div>
          )}
        </div>

        {/* Input Area */}
        {phase === 'choosing' && currentRoundConfig && (
          <div className="border-t border-[var(--seller-border)] bg-[var(--seller-paper)] p-4">
             <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-muted)]">
                撰写第 {currentRound} 轮汇报信息
             </div>
             <div className="grid grid-cols-1 gap-2">
               {currentRoundConfig.mainStrategies.map((opt: any) => (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedMain(opt.id)}
                    className={`text-left p-3 rounded-[12px] border transition-all ${
                      selectedMain === opt.id 
                        ? 'border-[var(--seller-accent)] bg-[var(--seller-accent-soft)]' 
                        : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] hover:border-[var(--seller-accent)]'
                    }`}
                  >
                    <div className="text-[13px] font-bold text-[var(--seller-ink)]">{opt.title}</div>
                    <div className="text-[11px] text-[var(--seller-muted)] mt-0.5">{opt.note}</div>
                  </button>
               ))}
             </div>
             <div className="mt-4 flex justify-end">
               <button 
                 disabled={!selectedMain}
                 onClick={handleSend}
                 className="seller-button-primary px-6 py-2 rounded-[12px] text-[13px] font-bold disabled:opacity-50"
               >
                 发送汇报 ↗
               </button>
             </div>
          </div>
        )}

        {phase === 'feedback' && currentRound < totalRounds && (
          <div className="border-t border-[var(--seller-border)] bg-[var(--seller-paper)] p-4 flex justify-end">
             <button onClick={handleContinue} className="seller-button-primary px-6 py-2 rounded-[12px] text-[13px] font-bold">
               继续跟进
             </button>
          </div>
        )}
        
        {phase === 'feedback' && currentRound >= totalRounds && (
          <div className="border-t border-[var(--seller-border)] bg-[var(--seller-paper)] p-4 flex justify-end">
             <button onClick={handleContinue} className="seller-button-primary px-6 py-2 rounded-[12px] text-[13px] font-bold">
               完成本轮沟通
             </button>
          </div>
        )}
      </div>
    </div>
  );
}
