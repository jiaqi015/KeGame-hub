import type { ConversationRiskKind } from '../../core/world-state/conversation/models.js';

const CONVERSATION_RISK_LABELS: Record<Exclude<ConversationRiskKind, 'none'>, string> = {
  overpromise: '过度承诺',
  empty_comfort: '空泛安抚',
  price_pressure_too_fast: '价格推进过快',
  missing_next_step: '缺少下一步',
  ignores_customer: '没接住客户问题',
  offensive_reply: '冒犯性回复',
};

export function formatConversationRiskKind(kind: ConversationRiskKind | string): string {
  if (kind === 'none') return '暂无';
  if (kind in CONVERSATION_RISK_LABELS) {
    return CONVERSATION_RISK_LABELS[kind as Exclude<ConversationRiskKind, 'none'>];
  }
  return kind;
}

export function formatConversationRiskSummary(summary: string): string {
  const prefix = '未消化风险：';
  if (!summary.startsWith(prefix)) {
    return summary;
  }

  const rawKinds = summary
    .slice(prefix.length)
    .split(/[、,，;；\s]+/)
    .map((kind) => kind.trim().replace(/^未消化风险：/, ''))
    .filter(Boolean);

  if (rawKinds.length === 0) {
    return `${prefix}暂无`;
  }

  const translated = rawKinds.map((kind) => formatConversationRiskKind(kind));
  return `${prefix}${translated.join('、')}`;
}
