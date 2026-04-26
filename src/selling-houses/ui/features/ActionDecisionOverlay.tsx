import React, { useState } from 'react';
import type { GameState, Case } from '../../domain/models';
import { ACTIONS } from '../../domain/actions/definitions';
import { getActionTemplate, getScenarioMode, getScenarioTemplate, isScenarioAction } from '../../domain/actions/templates';
import type { MatterEntry } from '../../domain/models';
import { ReportMatterView } from './matters/ReportMatterView';
import { DiagnoseMatterView } from './matters/DiagnoseMatterView';
import { ExecuteMatterView } from './matters/ExecuteMatterView';
import { NegotiateMatterView } from './matters/NegotiateMatterView';

export type CharacterFeedback = {
  actor: 'owner' | 'customer' | 'market';
  mood: 'positive' | 'neutral' | 'negative';
  message: string;
  metricChanges: Array<{ label: string; change: number }>;
};

export type Settlement = {
  outcome: 'strong-progress' | 'progress' | 'stall' | 'regress';
  title: string;
  summary: string;
  details: string[];
  stateDeltas: Array<{ field: string; value: number; label: string }>;
  nextActionHint: string;
  finalOptionId: string | null;
};

export type ScenarioResult = Settlement;
export type ScenarioChoice = { round: number; main: string; assist: string };
export type ScenarioFeedback = CharacterFeedback;

export type ActionDecisionConfig = {
  actionId: string;
  title: string;
  summary: string;
  body: string;
  actorLabel: string;
  metricFocus: string[];
  options: Array<{ id: string; title: string; note: string }>;
  isScenario?: boolean;
  scenarioMode?: 'direct' | 'light' | 'heavy';
  contextBullets?: string[];
  rounds?: any[];
  strategies?: { main: any[]; assist: any[] };
};

function deriveActorLabel(template: any) {
  if (template.actor === 'owner') return '这次主要在和业主博弈';
  if (template.actor === 'customer') return '这次主要在和客户博弈';
  return '这次主要在和市场博弈';
}

export function buildActionDecisionConfig(
  state: GameState,
  caseItem: Case,
  actionId: string,
): ActionDecisionConfig | null {
  const action = ACTIONS.find((entry) => entry.id === actionId) || null;
  if (!action) return null;

  const template = getActionTemplate(action);
  if (!template) return null;

  const isScenario = isScenarioAction(actionId);
  const scenarioTemplate = template as any;

  return {
    actionId,
    title: isScenario && scenarioTemplate.scenarioTitle
      ? `${caseItem.title} · ${scenarioTemplate.scenarioTitle}`
      : `${caseItem.title} · ${action.name}`,
    summary: isScenario && scenarioTemplate.goal ? scenarioTemplate.goal : (action.summary || template.summary),
    body: template.buildBody(state, caseItem, action),
    actorLabel: deriveActorLabel(template),
    metricFocus: template.metricFocus,
    options: template.getStrategies(state, caseItem, action).map((option: any) => ({
      id: option.id,
      title: option.title,
      note: option.note,
    })),
    isScenario,
    scenarioMode: scenarioTemplate.scenarioMode,
    contextBullets: scenarioTemplate.getContextBullets?.(state, caseItem),
    rounds: scenarioTemplate.rounds,
    strategies: scenarioTemplate.strategies,
  };
}

type OverlayMode = 'direct' | 'light' | 'heavy';
type OverlayPhase = 'choosing' | 'feedback' | 'result';

export function ActionDecisionOverlay({
  config,
  onChoose,
  onComplete,
  onClose,
  state,
  caseItem,
  matter,
}: {
  config: ActionDecisionConfig;
  onChoose?: (optionId: string, assistOptionId?: string, choices?: Array<{ round: number; main: string; assist: string }>, feedbacks?: CharacterFeedback[]) => void;
  onComplete?: (result: Settlement, choices: Array<{ round: number; main: string; assist: string }>, feedbacks: CharacterFeedback[]) => void;
  onClose: () => void;
  state?: GameState;
  caseItem?: Case;
  matter?: MatterEntry;
}) {
  if (matter) {
    switch (matter.lifecycleCategory) {
      case 'report':
        return <ReportMatterView config={config} matter={matter} onChoose={onChoose} onComplete={onComplete} onClose={onClose} state={state} caseItem={caseItem} />;
      case 'diagnose':
        return <DiagnoseMatterView config={config} matter={matter} onChoose={onChoose} onComplete={onComplete} onClose={onClose} state={state} caseItem={caseItem} />;
      case 'execute':
        return <ExecuteMatterView config={config} matter={matter} onChoose={onChoose} onComplete={onComplete} onClose={onClose} state={state} caseItem={caseItem} />;
      case 'negotiate':
        return <NegotiateMatterView config={config} matter={matter} onChoose={onChoose} onComplete={onComplete} onClose={onClose} state={state} caseItem={caseItem} />;
    }
  }

  const mode: OverlayMode = !config.isScenario ? 'direct' : config.scenarioMode === 'heavy' ? 'heavy' : 'light';
  const totalRounds = mode === 'heavy' ? 3 : 2;

  const [currentRound, setCurrentRound] = useState(1);
  const [phase, setPhase] = useState<OverlayPhase>('choosing');
  const [selectedMain, setSelectedMain] = useState<string | null>(null);
  const [selectedAssist, setSelectedAssist] = useState<string | null>(null);
  const [choices, setChoices] = useState<Array<{ round: number; main: string; assist: string }>>([]);
  const [feedbacks, setFeedbacks] = useState<CharacterFeedback[]>([]);
  const [result, setResult] = useState<Settlement | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const getCurrentRound = () => {
    if (mode === 'direct') return null;
    return config.rounds?.[currentRound - 1] || null;
  };

  const currentRoundConfig = getCurrentRound();

  const handleConfirmChoice = () => {
    if (!selectedMain || isAnimating) return;
    setIsAnimating(true);

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
      feedback = {
        actor: 'owner',
        mood: 'neutral',
        message: '"好，我知道了。"',
        metricChanges: [],
      };
    }

    const newChoices = [...choices, { round: currentRound, main: selectedMain, assist: selectedAssist || '' }];
    setChoices(newChoices);
    setFeedbacks([...feedbacks, feedback]);

    setTimeout(() => {
      setPhase('feedback');
      setIsAnimating(false);
    }, 300);
  };

  const handleContinue = () => {
    if (isAnimating) return;
    setIsAnimating(true);

    if (currentRound < totalRounds) {
      setTimeout(() => {
        setCurrentRound(currentRound + 1);
        setSelectedMain(null);
        setSelectedAssist(null);
        setPhase('choosing');
        setIsAnimating(false);
      }, 300);
    } else {
      const template = config.actionId ? getActionTemplate(ACTIONS.find((a) => a.id === config.actionId)!) : null;
      let outcomeResult: Settlement;
      
      if (template && (template as any).resolveOutcome) {
        outcomeResult = (template as any).resolveOutcome(choices, feedbacks, state, caseItem);
      } else {
        const lastChoiceMain = choices.length > 0 ? choices[choices.length - 1].main : null;
        outcomeResult = {
          outcome: 'progress',
          title: '动作执行完成',
          summary: '已根据你的选择完成了本次动作。',
          details: ['本次操作完成', '结果已记录'],
          stateDeltas: feedbacks.flatMap((f) => f.metricChanges.map((m) => ({ field: m.label, value: m.change, label: m.label }))),
          nextActionHint: '回到房源详情查看状态变化。',
          finalOptionId: lastChoiceMain,
        };
      }

      setTimeout(() => {
        setResult(outcomeResult);
        setPhase('result');
        setIsAnimating(false);
      }, 300);
    }
  };

  const handleFinalComplete = () => {
    if (onComplete && result) {
      onComplete(result, choices, feedbacks);
    }
    onClose();
  };

  if (mode === 'direct') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,8,12,0.72)] p-6 backdrop-blur-sm">
        <div className="max-w-lg w-full animate-in zoom-in rounded-[24px] border border-[var(--seller-border)] bg-[var(--seller-paper)] p-6 shadow-[var(--seller-shadow-lg)] fade-in duration-200">
          <h3 className="mb-2 text-[16px] font-bold text-[var(--seller-ink)]">{config.title}</h3>
          <div className="mb-4 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.14em]">
            <span className="rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-[var(--seller-muted)]">
              {config.actorLabel}
            </span>
            {config.metricFocus.map((metric) => (
              <span
                key={metric}
                className="rounded-full border border-[color:var(--seller-accent)]/22 bg-[var(--seller-accent-soft)] px-3 py-1 text-[var(--seller-accent)]"
              >
                {metric}
              </span>
            ))}
          </div>
          <p className="mb-2 text-[13px] font-semibold leading-relaxed text-[var(--seller-ink)]">{config.summary}</p>
          <p className="mb-5 text-[12px] leading-relaxed text-[var(--seller-muted)]">{config.body}</p>
          <div className="space-y-3">
            {config.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onChoose?.(option.id)}
                className="group w-full rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] p-3.5 text-left transition-all hover:border-[color:var(--seller-accent)]/45 hover:bg-[var(--seller-accent-soft)]"
              >
                <strong className="block text-[13px] text-[var(--seller-ink)] group-hover:text-[var(--seller-accent)]">
                  {option.title}
                </strong>
                <p className="mt-1 text-[11px] text-[var(--seller-muted)]">{option.note}</p>
              </button>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-5 py-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--seller-muted)] transition-colors hover:text-[var(--seller-ink)]"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  const outcomeStyles = {
    'strong-progress': { bg: 'bg-[var(--seller-chance)]', text: 'text-[var(--seller-chance)]', emoji: '🎉', label: '大幅推进' },
    'progress': { bg: 'bg-[var(--seller-accent)]', text: 'text-[var(--seller-accent)]', emoji: '👍', label: '正常推进' },
    'stall': { bg: 'bg-[var(--seller-muted)]', text: 'text-[var(--seller-muted)]', emoji: '🤷', label: '暂无变化' },
    'regress': { bg: 'bg-[var(--seller-risk)]', text: 'text-[var(--seller-risk)]', emoji: '⚠️', label: '关系后退' },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,8,12,0.72)] p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col animate-in zoom-in rounded-[24px] border border-[var(--seller-border)] bg-[var(--seller-paper)] shadow-[var(--seller-shadow-lg)] fade-in duration-200">
        <div className="border-b border-[var(--seller-border)] p-6 pb-4">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="mb-1 text-[18px] font-bold text-[var(--seller-ink)]">{config.title}</h3>
              <p className="text-[13px] text-[var(--seller-muted)]">{config.summary}</p>
            </div>
            <div className="flex items-center gap-3">
              {(
                <>
                  <div className="flex gap-1.5">
                    {Array.from({ length: totalRounds }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-2 w-2 rounded-full transition-all ${
                          i + 1 < currentRound ? 'bg-[var(--seller-chance)]' :
                          i + 1 === currentRound ? 'bg-[var(--seller-accent)] scale-125' :
                          'bg-[var(--seller-border)]'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-muted)]">
                    第 {currentRound}/{totalRounds} 轮
                  </span>
                </>
              )}
            </div>
          </div>
          {config.contextBullets && config.contextBullets.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--seller-muted)]">
              {config.contextBullets.map((bullet, i) => (
                <span key={i}>• {bullet}</span>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-4">
          {phase === 'choosing' && currentRoundConfig && (
            <>
              <h4 className="mb-2 text-[14px] font-bold text-[var(--seller-ink)]">{currentRoundConfig.title}</h4>
              <p className="mb-5 text-[12px] text-[var(--seller-muted)]">{currentRoundConfig.description}</p>

              <div className="mb-5">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-muted)]">主选项</div>
                <div className="space-y-2.5">
                  {currentRoundConfig.mainStrategies.map((option: any) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedMain(option.id)}
                    className={`group w-full rounded-[14px] border p-3.5 text-left transition-all ${
                      selectedMain === option.id
                        ? 'border-[var(--seller-accent)] bg-[var(--seller-accent-soft)]'
                        : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] hover:border-[color:var(--seller-accent)]/45 hover:bg-[var(--seller-accent-soft)]'
                    }`}
                  >
                    <strong className={`block text-[13px] ${selectedMain === option.id ? 'text-[var(--seller-accent)]' : 'text-[var(--seller-ink)]'}`}>
                      {option.title}
                    </strong>
                    <p className="mt-1 text-[11px] text-[var(--seller-muted)]">{option.note}</p>
                  </button>
                ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-muted)]">补充动作</div>
                <div className="grid grid-cols-2 gap-2.5">
                  {currentRoundConfig.assistStrategies.map((option: any) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedAssist(selectedAssist === option.id ? null : option.id)}
                      className={`group rounded-[12px] border p-3 text-left transition-all ${
                        selectedAssist === option.id
                          ? 'border-[color:var(--seller-chance)] bg-[var(--seller-chance-soft)]'
                          : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] hover:border-[color:var(--seller-chance)]/40 hover:bg-[var(--seller-chance-soft)]'
                      }`}
                    >
                      <strong className={`block text-[12px] ${selectedAssist === option.id ? 'text-[var(--seller-chance)]' : 'text-[var(--seller-ink)]'}`}>
                        {option.title}
                      </strong>
                      <p className="mt-0.5 text-[10px] text-[var(--seller-muted)]">{option.note}</p>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {phase === 'feedback' && feedbacks.length > 0 && (
            <div className="py-4">
              <div className="mb-6 flex items-center gap-4">
                <div className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl ${
                  feedbacks[feedbacks.length - 1].mood === 'positive' ? 'bg-[var(--seller-chance-soft)]' :
                  feedbacks[feedbacks.length - 1].mood === 'negative' ? 'bg-[var(--seller-risk-soft)]' : 'bg-[var(--seller-accent-soft)]'
                }`}>
                  {feedbacks[feedbacks.length - 1].actor === 'owner' ? '👤' : 
                   feedbacks[feedbacks.length - 1].actor === 'customer' ? '💼' : '📊'}
                </div>
                <div>
                  <div className="text-sm font-bold text-[var(--seller-ink)]">
                    {feedbacks[feedbacks.length - 1].actor === 'owner' ? '业主' : 
                     feedbacks[feedbacks.length - 1].actor === 'customer' ? '客户' : '市场'}反馈
                  </div>
                  <div className={`text-[11px] font-bold uppercase tracking-[0.14em] ${
                    feedbacks[feedbacks.length - 1].mood === 'positive' ? 'text-[var(--seller-chance)]' :
                    feedbacks[feedbacks.length - 1].mood === 'negative' ? 'text-[var(--seller-risk)]' : 'text-[var(--seller-muted)]'
                  }`}>
                    {feedbacks[feedbacks.length - 1].mood === 'positive' ? '积极' : 
                     feedbacks[feedbacks.length - 1].mood === 'negative' ? '抵触' : '中性'}
                  </div>
                </div>
              </div>

              <div className="seller-note mb-5 rounded-[16px] p-4">
                <p className="text-[14px] leading-relaxed text-[var(--seller-ink)] italic">
                  "{feedbacks[feedbacks.length - 1].message}"
                </p>
              </div>

              {feedbacks[feedbacks.length - 1].metricChanges.length > 0 && (
                <div className="mb-5 rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] p-4">
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-muted)]">状态变化</div>
                  <div className="flex flex-wrap gap-3">
                    {feedbacks[feedbacks.length - 1].metricChanges.map((change, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="text-[12px] text-[var(--seller-muted)]">{change.label}</span>
                        <span className={`text-[13px] font-bold ${change.change >= 0 ? 'text-[var(--seller-chance)]' : 'text-[var(--seller-risk)]'}`}>
                          {change.change >= 0 ? '+' : ''}{change.change}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {choices.length > 0 && (
                <div className="rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.01)] p-4">
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-muted)]">本轮选择</div>
                  <div className="space-y-1.5">
                    {choices.map((choice, i) => {
                      const mainOption = config.rounds?.[choice.round - 1]?.mainStrategies?.find((o: any) => o.id === choice.main);
                      return (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-[12px] text-[var(--seller-muted)]">第 {choice.round} 轮</span>
                          <span className="text-[12px] font-medium text-[var(--seller-ink)]">{mainOption?.title || choice.main}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {phase === 'result' && result && (
            <div className="py-2">
              <div className="mb-6 text-center">
                <div className={`mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full bg-[var(--seller-paper)]`}>
                  <span className="text-4xl">{outcomeStyles[result.outcome].emoji}</span>
                </div>
                <div className={`mb-2 text-[12px] font-bold uppercase tracking-[0.14em] ${outcomeStyles[result.outcome].text}`}>
                  {outcomeStyles[result.outcome].label}
                </div>
                <h4 className="text-[20px] font-bold text-[var(--seller-ink)]">{result.title}</h4>
                <p className="mt-1 text-[13px] text-[var(--seller-muted)]">{result.summary}</p>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-4">
                <div className="seller-panel-soft rounded-[16px] p-4">
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">本轮回看</div>
                  <ul className="space-y-1.5">
                    {choices.map((choice, i) => {
                      const mainOption = config.rounds?.[choice.round - 1]?.mainStrategies?.find((o: any) => o.id === choice.main);
                      return (
                        <li key={i} className="flex items-start justify-between gap-2 text-[12px] text-[var(--seller-muted)]">
                        <span>第{choice.round}轮</span>
                        <span className="font-medium text-[var(--seller-ink)]">{mainOption?.title || choice.main}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="seller-panel-soft rounded-[16px] p-4">
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">核心变化</div>
                  {result.stateDeltas.length > 0 ? (
                    <div className="space-y-1.5">
                      {result.stateDeltas.map((delta, i) => (
                        <div key={i} className="flex items-start justify-between gap-2">
                          <span className="text-[12px] text-[var(--seller-muted)]">{delta.label}</span>
                          <span className={`text-[13px] font-bold ${delta.value >= 0 ? 'text-[var(--seller-chance)]' : 'text-[var(--seller-risk)]'}`}>
                            {delta.value >= 0 ? '+' : ''}{delta.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-[var(--seller-muted)]">无显著变化</p>
                  )}
                </div>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-4">
                <div className="seller-panel-soft rounded-[16px] p-4">
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">实际效果</div>
                  <ul className="space-y-1.5">
                    {result.details.map((detail, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--seller-muted)]">
                        <span className={`${outcomeStyles[result.outcome].text}`}>•</span>
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-[16px] bg-[var(--seller-accent-soft)] p-4">
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-accent)]">后续动作</div>
                  <p className="text-[12px] text-[var(--seller-ink)]">{result.nextActionHint}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--seller-border)] p-6 pt-4">
          {phase === 'choosing' && (
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-[var(--seller-muted)]">
                {selectedMain ? '已选主项' : '请选择主项'}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full px-5 py-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--seller-muted)] transition-colors hover:text-[var(--seller-ink)]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmChoice}
                  disabled={!selectedMain || isAnimating}
                  className="seller-button-primary disabled:opacity-40 rounded-[14px] px-6 py-2.5 text-[13px] font-bold"
                >
                  确认选择
                </button>
              </div>
            </div>
          )}

          {phase === 'feedback' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleContinue}
                disabled={isAnimating}
                className="seller-button-primary rounded-[14px] px-6 py-2.5 text-[13px] font-bold"
              >
                {currentRound < totalRounds ? '进入下一轮' : '查看结果'}
              </button>
            </div>
          )}

          {phase === 'result' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleFinalComplete}
                className="seller-button-primary rounded-[14px] px-6 py-2.5 text-[13px] font-bold"
              >
                完成并回到房源
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
