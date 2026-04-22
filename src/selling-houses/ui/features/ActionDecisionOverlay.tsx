import React from 'react';
import { ACTIONS } from '../../domain/constants';
import type { Case, GameState } from '../../domain/models';
import { getActionTemplate } from '../../domain/actions/templates';

export type ActionDecisionConfig = {
  actionId: string;
  title: string;
  summary: string;
  body: string;
  actorLabel: string;
  metricFocus: string[];
  options: Array<{ id: string; title: string; note: string }>;
};

export function buildActionDecisionConfig(
  state: GameState,
  caseItem: Case,
  actionId: string,
): ActionDecisionConfig | null {
  const action = ACTIONS.find((entry) => entry.id === actionId) || null;
  if (!action) {
    return null;
  }

  const template = getActionTemplate(action);
  const options = template?.getStrategies(state, caseItem, action) || [];
  if (!template || options.length === 0) {
    return null;
  }

  return {
    actionId,
    title: `${caseItem.title} · ${action.name}`,
    summary: action.summary || template.summary,
    body: template.buildBody(state, caseItem, action),
    actorLabel: deriveActorLabel(template.actor),
    metricFocus: template.metricFocus.map(deriveMetricLabel),
    options: options.map((option) => ({
      id: option.id,
      title: option.title,
      note: option.note,
    })),
  };
}

export function ActionDecisionOverlay({
  config,
  onChoose,
  onClose,
}: {
  config: ActionDecisionConfig;
  onChoose: (optionId: string) => void;
  onClose: () => void;
}) {
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
              onClick={() => onChoose(option.id)}
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
