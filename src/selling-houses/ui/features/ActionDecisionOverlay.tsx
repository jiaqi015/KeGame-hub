import React, { useEffect, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import type { GameState, Case, ActionDefinition } from '../../domain/models';
import { ACTIONS } from '../../domain/actions/definitions';
import { getActionTemplate, getScenarioMode, getScenarioTemplate, isScenarioAction, isScenarioTemplate } from '../../domain/actions/templates';
import type { ScenarioChoice as DomainScenarioChoice } from '../../domain/actions/templates';
import type { MatterEntry } from '../../domain/models';
import { ReportMatterView } from './matters/ReportMatterView';
import { DiagnoseMatterView } from './matters/DiagnoseMatterView';
import { ExecuteMatterView } from './matters/ExecuteMatterView';
import { NegotiateMatterView } from './matters/NegotiateMatterView';
import { buildOwnerProfilingMemorySummary } from '../../application/projections/ownerProfilingMemory.js';
import {
  buildFallbackActionScenarioSimulation,
  type ActionAdviceOption,
  type ActionAdviceProposal,
  type ActionAdviceRequest,
} from '../../application/actionDecisionAdvice.js';
import { fetchActionDecisionAdvice } from '../../infrastructure/actionDecisionAdviceClient.js';
import type { AgentEvaluationReport } from '../../core/world-state/agents/evaluationReport.js';
import type { AgentShadowReport } from '../../core/world-state/agents/shadowReport.js';

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
export type ScenarioChoice = DomainScenarioChoice;
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

function MemoryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-[rgba(255,255,255,0.04)] px-3 py-2">
      <div className="text-[10px] font-semibold text-[var(--seller-subtle)]">{label}</div>
      <div className="mt-1 text-[12px] leading-5 text-[var(--seller-ink)]">{value}</div>
    </div>
  );
}

function deriveActorLabel(template: any) {
  if (template.actor === 'owner') return '这次主要在和业主博弈';
  if (template.actor === 'customer') return '这次主要在和客户博弈';
  return '这次主要在和市场博弈';
}

function buildScenarioRoundsForConfig(
  template: any,
  state: GameState,
  caseItem: Case,
  action: ActionDefinition,
) {
  const rounds = template.rounds?.map((round: any) => ({
    ...round,
    mainStrategies: [...(round.mainStrategies || [])],
    assistStrategies: [...(round.assistStrategies || [])],
  }));
  if (!rounds || action.id !== 'showing') {
    return rounds;
  }

  const options = template.getStrategies(state, caseItem, action);
  const customerOptions = options.filter((option: any) => String(option.id).startsWith('show-customer'));
  const compareOptions = options.filter((option: any) => String(option.id).startsWith('compare-rival'));
  const ownerOptions = options.filter((option: any) => option.id === 'owner-feedback-after');
  if (rounds[0]) {
    rounds[0].mainStrategies = customerOptions.length
      ? customerOptions
      : [{ id: 'show-customer', title: '先锁定真实看房客户', note: '先选出最接近真实看房的客户，不做空泛带看。' }];
  }
  if (rounds[1]) {
    rounds[1].mainStrategies = [
      ...(compareOptions.length ? compareOptions : [{ id: 'compare-rival', title: '先补齐竞品对比', note: '先把其他经纪人维护的同商圈、同户型、同预算房源补出来。' }]),
      ...(ownerOptions.length ? ownerOptions : []),
    ];
  }
  return rounds;
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
  const scenario = isScenario && isScenarioTemplate(template) ? template : null;

  return {
    actionId,
    title: scenario
      ? `${caseItem.title} · ${scenario.scenarioTitle}`
      : `${caseItem.title} · ${action.name}`,
    summary: scenario ? scenario.goal : (action.summary || template.summary),
    body: template.buildBody(state, caseItem, action),
    actorLabel: deriveActorLabel(template),
    metricFocus: template.metricFocus,
    options: template.getStrategies(state, caseItem, action).map((option) => ({
      id: option.id,
      title: option.title,
      note: option.note,
    })),
    isScenario,
    scenarioMode: scenario?.scenarioMode,
    contextBullets: scenario?.getContextBullets(state, caseItem),
    rounds: scenario ? buildScenarioRoundsForConfig(scenario, state, caseItem, action) : undefined,
    strategies: scenario?.strategies,
  };
}

function buildActionAdviceRequest(
  config: ActionDecisionConfig,
  currentRoundConfig: any,
  currentRound: number,
  totalRounds: number,
  caseItem?: Case,
): ActionAdviceRequest {
  return {
    actionId: config.actionId,
    title: config.title,
    summary: config.summary,
    body: config.body,
    actorLabel: config.actorLabel,
    currentRound,
    totalRounds,
    contextBullets: config.contextBullets || [],
    round: {
      title: String(currentRoundConfig.title || ''),
      description: String(currentRoundConfig.description || ''),
      mainStrategies: (currentRoundConfig.mainStrategies || []).map((option: any) => ({
        id: String(option.id || ''),
        title: String(option.title || ''),
        note: String(option.note || ''),
      })),
      assistStrategies: (currentRoundConfig.assistStrategies || []).map((option: any) => ({
        id: String(option.id || ''),
        title: String(option.title || ''),
        note: String(option.note || ''),
      })),
    },
    caseContext: caseItem ? {
      title: caseItem.title,
      ownerName: caseItem.ownerName,
      district: caseItem.district,
      community: caseItem.community,
      askPrice: caseItem.askPrice,
      marketPrice: caseItem.marketPrice,
      trust: caseItem.trust,
      patience: caseItem.patience,
      urgency: caseItem.urgency,
      heat: caseItem.heat,
      stageLabel: caseItem.stageLabel,
    } : undefined,
  };
}

type OverlayMode = 'direct' | 'light' | 'heavy';
type OverlayPhase = 'choosing' | 'feedback' | 'result';
const MAX_MAIN_TOPIC_SELECTIONS = 2;

interface ActionAdviceState {
  simulation: ActionAdviceProposal | null;
  source: 'ai' | 'fallback';
  loading: boolean;
  error?: string;
  shadowReport?: AgentShadowReport | null;
  evaluationReport?: AgentEvaluationReport | null;
}

function mergeSimulatedRoundConfig(baseRound: any, simulation: ActionAdviceProposal | null) {
  if (!simulation) return baseRound;
  return {
    ...baseRound,
    title: simulation.roundTitle || baseRound.title,
    description: simulation.roundDescription || baseRound.description,
    mainStrategies: simulation.mainStrategies?.length ? simulation.mainStrategies : baseRound.mainStrategies,
    assistStrategies: simulation.assistStrategies?.length ? simulation.assistStrategies : baseRound.assistStrategies,
  };
}

interface AiSimulationRecommendation {
  reason: string;
  mainOptions: readonly ActionAdviceOption[];
  assistOption: ActionAdviceOption | null;
}

function buildAiSimulationRecommendation(
  simulation: ActionAdviceProposal | null,
  displayRoundConfig: any,
  mainSelectionLimit: number,
): AiSimulationRecommendation | null {
  if (!simulation || !displayRoundConfig) return null;
  const mainStrategies: readonly ActionAdviceOption[] = displayRoundConfig.mainStrategies || [];
  const assistStrategies: readonly ActionAdviceOption[] = displayRoundConfig.assistStrategies || [];
  if (!mainStrategies.length) return null;

  const mainById = new Map(mainStrategies.map((option) => [option.id, option]));
  const recommendedMainIds = (simulation.recommendedMainStrategyIds || [])
    .filter((id) => mainById.has(id))
    .slice(0, mainSelectionLimit);
  const fallbackMainIds = mainStrategies.slice(0, mainSelectionLimit).map((option) => option.id);
  const mainOptions = (recommendedMainIds.length ? recommendedMainIds : fallbackMainIds)
    .map((id) => mainById.get(id))
    .filter((option): option is ActionAdviceOption => Boolean(option));
  if (!mainOptions.length) return null;

  const assistOption = simulation.recommendedAssistStrategyId
    ? assistStrategies.find((option) => option.id === simulation.recommendedAssistStrategyId) || null
    : null;
  const reason = simulation.recommendationReason?.trim()
    || buildClientRecommendationReason(simulation, mainOptions, assistOption);

  return { reason, mainOptions, assistOption };
}

function buildClientRecommendationReason(
  simulation: ActionAdviceProposal,
  mainOptions: readonly ActionAdviceOption[],
  assistOption: ActionAdviceOption | null,
) {
  const mainText = mainOptions.map((option) => option.title).join('、');
  const assistText = assistOption ? `，态度用「${assistOption.title}」` : '';
  const pressure = simulation.stakes[0] || simulation.roleCue || simulation.sceneOpening || '先把真实情况问清楚';
  return `这轮先抓「${mainText}」${assistText}，因为${pressure.replace(/[。.!！]$/, '')}。`;
}

function AiSimulationRecommendationPanel({
  recommendation,
  loading,
  applied,
  onApply,
}: {
  recommendation: AiSimulationRecommendation | null;
  loading: boolean;
  applied: boolean;
  onApply: () => void;
}) {
  if (!recommendation) return null;
  const disabled = loading || applied || recommendation.mainOptions.length === 0;

  return (
    <div className="rounded-[14px] border border-[color:var(--seller-accent)]/18 bg-[rgba(255,255,255,0.025)] px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--seller-accent)]">
              <Sparkles size={12} />
              AI 模拟建议
            </span>
            {loading ? (
              <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">更新中</span>
            ) : null}
          </div>
          <p className="text-[12px] leading-5 text-[var(--seller-muted)]">
            {loading ? '正在结合这一轮业主状态、市场压力和可选话题做模拟...' : recommendation.reason}
          </p>
          {!loading ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {recommendation.mainOptions.map((option, index) => (
                <span
                  key={option.id}
                  className="rounded-full border border-[color:var(--seller-accent)]/18 bg-[color:var(--seller-accent)]/8 px-2 py-1 text-[10px] font-semibold text-[var(--seller-accent)]"
                >
                  {index === 0 ? '主线' : `话题${index + 1}`}：{option.title}
                </span>
              ))}
              {recommendation.assistOption ? (
                <span className="rounded-full border border-[color:var(--seller-chance)]/18 bg-[var(--seller-chance-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--seller-chance)]">
                  态度：{recommendation.assistOption.title}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onApply}
          disabled={disabled}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--seller-accent)]/24 px-3 py-1.5 text-[11px] font-bold text-[var(--seller-accent)] transition-colors hover:bg-[var(--seller-accent-soft)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Check size={12} />
          {applied ? '已采用' : '采用建议'}
        </button>
      </div>
    </div>
  );
}

function ScenarioSimulationPanel({
  simulationState,
}: {
  simulationState: ActionAdviceState;
}) {
  const simulation = simulationState.simulation;
  if (!simulation) return null;

  return (
    <div className="mb-5 rounded-[16px] border border-[color:var(--seller-accent)]/26 bg-[color:var(--seller-accent)]/8 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-accent)]">局面提示</span>
          </div>
          <h4 className="mt-1 text-[15px] font-bold text-[var(--seller-ink)]">{simulation.sceneTitle}</h4>
          <p className="mt-1 text-[12px] leading-5 text-[var(--seller-muted)]">{simulation.sceneOpening}</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-[12px] bg-[rgba(255,255,255,0.035)] px-3 py-2">
          <div className="mb-1 text-[10px] font-semibold text-[var(--seller-subtle)]">对方状态</div>
          <p className="text-[11px] leading-5 text-[var(--seller-muted)]">{simulation.roleCue}</p>
        </div>
        <div className="rounded-[12px] bg-[rgba(255,255,255,0.035)] px-3 py-2">
          <div className="mb-1 text-[10px] font-semibold text-[var(--seller-subtle)]">局面压力</div>
          <ul className="space-y-1">
            {simulation.stakes.slice(0, 2).map((stake) => (
              <li key={stake} className="text-[11px] leading-5 text-[var(--seller-muted)]">{stake}</li>
            ))}
          </ul>
        </div>
      </div>

      {simulationState.loading ? (
        <p className="mt-2 text-[10px] text-[var(--seller-subtle)]">正在结合当前房源和对方反馈更新提示...</p>
      ) : null}
    </div>
  );
}

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
  onChoose?: (optionId: string, assistOptionId?: string, choices?: ScenarioChoice[], feedbacks?: CharacterFeedback[]) => void;
  onComplete?: (result: Settlement, choices: ScenarioChoice[], feedbacks: CharacterFeedback[]) => void;
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
  const totalRounds = mode === 'direct'
    ? 1
    : config.rounds?.length || (mode === 'heavy' ? 3 : 2);

  const [currentRound, setCurrentRound] = useState(1);
  const [phase, setPhase] = useState<OverlayPhase>('choosing');
  const [selectedMainIds, setSelectedMainIds] = useState<string[]>([]);
  const [selectedAssist, setSelectedAssist] = useState<string | null>(null);
  const [choices, setChoices] = useState<ScenarioChoice[]>([]);
  const [feedbacks, setFeedbacks] = useState<CharacterFeedback[]>([]);
  const [result, setResult] = useState<Settlement | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [simulationState, setSimulationState] = useState<ActionAdviceState>({
    simulation: null,
    source: 'fallback',
    loading: false,
  });

  const getCurrentRound = () => {
    if (mode === 'direct') return null;
    return config.rounds?.[currentRound - 1] || null;
  };

  const currentRoundConfig = getCurrentRound();
  const selectedMain = selectedMainIds[0] || null;
  const mainSelectionLimit = config.actionId === 'showing' ? 1 : MAX_MAIN_TOPIC_SELECTIONS;
  const mainSelectionLimitReached = selectedMainIds.length >= mainSelectionLimit;

  useEffect(() => {
    if (mode === 'direct' || phase !== 'choosing' || !currentRoundConfig) return;

    const request = buildActionAdviceRequest(config, currentRoundConfig, currentRound, totalRounds, caseItem);
    const fallback = buildFallbackActionScenarioSimulation(request);
    const controller = new AbortController();
    setSimulationState({
      simulation: fallback,
      source: 'fallback',
      loading: true,
      shadowReport: null,
      evaluationReport: null,
    });

    fetchActionDecisionAdvice(request, controller.signal)
      .then((result) => {
        if (!result) {
          setSimulationState({
            simulation: fallback,
            source: 'fallback',
            loading: false,
            error: '本地先按规则模拟这一轮。',
            shadowReport: result?.shadowReport ?? null,
            evaluationReport: result?.evaluationReport ?? null,
          });
          return;
        }
        setSimulationState({
          simulation: result.advice,
          source: result.source,
          loading: false,
          error: result.error,
          shadowReport: result.shadowReport ?? null,
          evaluationReport: result.evaluationReport ?? null,
        });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSimulationState({
          simulation: fallback,
          source: 'fallback',
          loading: false,
          error: error instanceof Error ? error.message : '情景模拟暂时不可用。',
          shadowReport: null,
          evaluationReport: null,
        });
      });

    return () => controller.abort();
  }, [caseItem, config, currentRound, currentRoundConfig, mode, phase, totalRounds]);

  const toggleMainTopic = (optionId: string) => {
    setSelectedMainIds((current) => {
      if (current.includes(optionId)) {
        return current.filter((id) => id !== optionId);
      }
      if (current.length >= mainSelectionLimit) {
        return current;
      }
      return [...current, optionId];
    });
  };

  const displayRoundConfig = currentRoundConfig
    ? mergeSimulatedRoundConfig(currentRoundConfig, simulationState.simulation)
    : null;
  const aiSimulationRecommendation = buildAiSimulationRecommendation(
    simulationState.simulation,
    displayRoundConfig,
    mainSelectionLimit,
  );
  const aiSimulationRecommendationApplied = Boolean(
    aiSimulationRecommendation
    && selectedMainIds.length === aiSimulationRecommendation.mainOptions.length
    && aiSimulationRecommendation.mainOptions.every((option, index) => selectedMainIds[index] === option.id)
    && (selectedAssist || null) === (aiSimulationRecommendation.assistOption?.id ?? null),
  );

  const applyAiSimulationRecommendation = () => {
    if (!aiSimulationRecommendation || simulationState.loading || aiSimulationRecommendationApplied) return;
    setSelectedMainIds(aiSimulationRecommendation.mainOptions.map((option) => option.id));
    setSelectedAssist(aiSimulationRecommendation.assistOption?.id ?? null);
  };

  const formatMainTopics = (choice: ScenarioChoice) => {
    const baseRound = config.rounds?.[choice.round - 1];
    const roundDef = choice.round === currentRound && baseRound
      ? mergeSimulatedRoundConfig(baseRound, simulationState.simulation)
      : baseRound;
    const topicIds = choice.mainTopics?.length ? choice.mainTopics : [choice.main];
    return topicIds
      .map((topicId) => roundDef?.mainStrategies?.find((option: any) => option.id === topicId)?.title || topicId)
      .join(' / ');
  };

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

    if (template && isScenarioTemplate(template) && template.getFeedback) {
      feedback = template.getFeedback(selectedMain, selectedAssist || '', state, caseItem);
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

    const newChoices = [
      ...choices,
      {
        round: currentRound,
        main: selectedMain,
        mainTopics: [...selectedMainIds],
        assist: selectedAssist || '',
      },
    ];
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
        setSelectedMainIds([]);
        setSelectedAssist(null);
        setPhase('choosing');
        setIsAnimating(false);
      }, 300);
    } else {
      const template = config.actionId ? getActionTemplate(ACTIONS.find((a) => a.id === config.actionId)!) : null;
      let outcomeResult: Settlement;

      if (template && isScenarioTemplate(template)) {
        outcomeResult = template.resolveOutcome(choices, feedbacks, state, caseItem);
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
  const ownerProfileMemory = phase === 'result' && result && config.actionId === 'first-visit' && state && caseItem
    ? buildOwnerProfilingMemorySummary(caseItem, choices)
    : null;

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
          {phase === 'choosing' && currentRoundConfig && displayRoundConfig && (
            <>
              <ScenarioSimulationPanel simulationState={simulationState} />

              <h4 className="mb-2 text-[14px] font-bold text-[var(--seller-ink)]">{displayRoundConfig.title}</h4>
              <p className="mb-5 text-[12px] text-[var(--seller-muted)]">{displayRoundConfig.description}</p>

              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-muted)]">主要话题</div>
                  <div className="text-[10px] font-semibold text-[var(--seller-subtle)]">最多选 {mainSelectionLimit} 个</div>
                </div>
                <div className="space-y-2.5">
                  {displayRoundConfig.mainStrategies.map((option: any) => {
                    const selectedIndex = selectedMainIds.indexOf(option.id);
                    const isSelected = selectedIndex >= 0;
                    const disabled = !isSelected && mainSelectionLimitReached;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={isSelected}
                        disabled={disabled}
                        onClick={() => toggleMainTopic(option.id)}
                        className={`group w-full rounded-[14px] border p-3.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
                          isSelected
                            ? 'border-[var(--seller-accent)] bg-[var(--seller-accent-soft)]'
                            : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] hover:border-[color:var(--seller-accent)]/45 hover:bg-[var(--seller-accent-soft)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <strong className={`block text-[13px] ${isSelected ? 'text-[var(--seller-accent)]' : 'text-[var(--seller-ink)]'}`}>
                            {option.title}
                          </strong>
                          {isSelected ? (
                            <span className="rounded-full border border-[color:var(--seller-accent)]/25 bg-[rgba(74,227,138,0.1)] px-2 py-0.5 text-[10px] font-bold text-[var(--seller-accent)]">
                              {selectedIndex === 0 ? '主线' : `话题${selectedIndex + 1}`}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--seller-muted)]">{option.note}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-muted)]">态度</div>
                <div className="grid grid-cols-2 gap-2.5">
                  {displayRoundConfig.assistStrategies.map((option: any) => (
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
                  {feedbacks[feedbacks.length - 1].message}
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
                      return (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-[12px] text-[var(--seller-muted)]">第 {choice.round} 轮</span>
                          <span className="text-[12px] font-medium text-[var(--seller-ink)]">{formatMainTopics(choice)}</span>
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
                      return (
                        <li key={i} className="flex items-start justify-between gap-2 text-[12px] text-[var(--seller-muted)]">
                        <span>第{choice.round}轮</span>
                        <span className="text-right font-medium text-[var(--seller-ink)]">{formatMainTopics(choice)}</span>
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

              {ownerProfileMemory ? (
                <div className="mb-4 rounded-[18px] border border-[color:var(--seller-accent)]/24 bg-[color:var(--seller-accent)]/8 p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-accent)]">业主分型记忆</div>
                      <h5 className="mt-1 text-[18px] font-black tracking-[-0.04em] text-[var(--seller-ink)]">
                        {ownerProfileMemory.ownerTypeName}
                      </h5>
                      <p className="mt-1 max-w-[68ch] text-[12px] leading-5 text-[var(--seller-muted)]">
                        {ownerProfileMemory.ownerTypeDescription}
                      </p>
                    </div>
                    <span className="rounded-full border border-[color:var(--seller-accent)]/25 bg-[var(--seller-paper)] px-3 py-1 text-[10px] font-bold text-[var(--seller-accent)]">
                      skill: owner-profiling-memory
                    </span>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div className="rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] p-3">
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">四维判断</div>
                      <div className="grid grid-cols-2 gap-2">
                        {ownerProfileMemory.dimensions.map((dimension) => (
                          <div key={dimension.key} className="rounded-[12px] bg-[rgba(255,255,255,0.04)] px-3 py-2">
                            <div className="text-[10px] text-[var(--seller-subtle)]">{dimension.label}</div>
                            <div className="mt-1 text-[13px] font-bold text-[var(--seller-ink)]">{dimension.valueLabel}</div>
                            <div className="mt-1 text-[10px] text-[var(--seller-muted)]">{dimension.confidence === 'medium' ? '中置信' : dimension.confidence === 'high' ? '高置信' : '低置信'}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] p-3">
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">服务策略</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <MemoryLine label="主目标" value={ownerProfileMemory.serviceStrategy.primaryGoal} />
                        <MemoryLine label="卡点" value={ownerProfileMemory.serviceStrategy.mainBlocker} />
                        <MemoryLine label="沟通方式" value={ownerProfileMemory.serviceStrategy.communicationStyle} />
                        <MemoryLine label="下一步" value={ownerProfileMemory.serviceStrategy.recommendedNextAction} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div className="rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] p-3">
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">标签</div>
                      <div className="flex flex-wrap gap-1.5">
                        {ownerProfileMemory.labels.map((label) => (
                          <span key={`${label.name}-${label.value}`} className="seller-chip seller-chip-accent">
                            {label.value}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] p-3">
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">还要补问</div>
                      <ul className="space-y-1.5">
                        {ownerProfileMemory.openQuestions.map((question) => (
                          <li key={question} className="text-[12px] leading-5 text-[var(--seller-muted)]">• {question}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-3 rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">证据</div>
                      <div className="text-[10px] font-semibold text-[var(--seller-muted)]">每个判断可追溯</div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-3">
                      {ownerProfileMemory.evidenceBank.slice(0, 3).map((evidence) => (
                        <div key={evidence.id} className="rounded-[12px] bg-[rgba(255,255,255,0.035)] px-3 py-2">
                          <div className="mb-1 text-[10px] font-bold text-[var(--seller-accent)]">{evidence.id}</div>
                          <p className="text-[11px] leading-5 text-[var(--seller-muted)]">{evidence.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

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
            <div className="space-y-3">
              <AiSimulationRecommendationPanel
                recommendation={aiSimulationRecommendation}
                loading={simulationState.loading}
                applied={aiSimulationRecommendationApplied}
                onApply={applyAiSimulationRecommendation}
              />
              <div className="flex items-center justify-between gap-4">
                <div className="text-[11px] text-[var(--seller-muted)]">
                  {selectedMainIds.length > 0 ? `已选 ${selectedMainIds.length} 个主要话题` : '请选择主要话题'}
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
