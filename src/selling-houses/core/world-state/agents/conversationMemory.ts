import type { ConversationReceipt, ConversationNextStepDraft, ConversationRiskKind } from '../conversation/models.js';
import type { AgentMemoryFact } from './models.js';

export interface ConversationMemoryWritebackInput {
  readonly receipt: ConversationReceipt;
  readonly existingFacts?: readonly AgentMemoryFact[];
}

export interface ConversationMemoryWriteback {
  readonly facts: readonly AgentMemoryFact[];
  readonly summary: string;
}

const RISK_LABELS: Record<Exclude<ConversationRiskKind, 'none'>, string> = {
  overpromise: '过度承诺',
  empty_comfort: '空泛安抚',
  price_pressure_too_fast: '价格推进过快',
  missing_next_step: '缺少下一步',
  ignores_customer: '没接住客户问题',
  offensive_reply: '冒犯性回复',
};

export function buildConversationMemoryWriteback(input: ConversationMemoryWritebackInput): ConversationMemoryWriteback {
  const receipt = input.receipt;
  const agentId = resolveAgentId(receipt);
  const scope = {
    conversationKey: receipt.conversationKey,
    caseId: receipt.targetCaseId,
    opportunityId: receipt.targetOpportunityId,
    channel: 'wechat' as const,
  };
  const sourceRef = {
    refType: 'conversation_receipt',
    refId: receipt.receiptId,
  };
  const baseId = `wechat:${receipt.conversationKey}:turn:${receipt.turnIndex}`;
  const facts: AgentMemoryFact[] = [
    {
      factId: `${baseId}:risk`,
      agentId,
      kind: 'open_risk',
      summary: buildRiskSummary(receipt.proposal.riskKinds),
      strength: 0.8,
      scope,
      sourceRef,
      createdAtDay: receipt.day,
      updatedAtDay: receipt.day,
      expiresAtDay: receipt.day + 5,
    },
    {
      factId: `${baseId}:next-step`,
      agentId,
      kind: receipt.nextSteps.length > 0 ? 'active_next_step' : 'next_step_unfulfilled',
      summary: buildNextStepSummary(receipt, input.existingFacts),
      strength: receipt.nextSteps.length > 0 ? 0.86 : 0.7,
      scope,
      sourceRef,
      createdAtDay: receipt.day,
      updatedAtDay: receipt.day,
      expiresAtDay: receipt.day + 6,
    },
    {
      factId: `${baseId}:attitude`,
      agentId,
      kind: 'current_attitude',
      summary: buildAttitudeSummary(receipt),
      strength: 0.72,
      scope,
      sourceRef,
      createdAtDay: receipt.day,
      updatedAtDay: receipt.day,
      expiresAtDay: receipt.day + 4,
    },
    {
      factId: `${baseId}:relationship`,
      agentId,
      kind: 'relationship_effect',
      summary: buildRelationshipSummary(receipt),
      strength: 0.84,
      scope,
      sourceRef,
      createdAtDay: receipt.day,
      updatedAtDay: receipt.day,
      expiresAtDay: receipt.day + 7,
    },
  ];

  return {
    facts,
    summary: facts.map((fact) => fact.summary).join('；'),
  };
}

function resolveAgentId(receipt: ConversationReceipt): string {
  return `wechat:${receipt.conversationKey.replace(/\s+/g, '-')}`;
}

function buildRiskSummary(risks: readonly ConversationRiskKind[]): string {
  const localized = risks
    .filter((risk): risk is Exclude<ConversationRiskKind, 'none'> => risk !== 'none')
    .map((risk) => RISK_LABELS[risk])
    .filter(Boolean);
  return localized.length > 0 ? `未消化风险：${localized.join('、')}` : '未消化风险：暂无';
}

function buildNextStepSummary(receipt: ConversationReceipt, existingFacts?: readonly AgentMemoryFact[]): string {
  const nextStep = receipt.nextSteps.find((step) => step.kind !== 'none') || receipt.proposal.nextStep;
  if (nextStep && nextStep.kind !== 'none') {
    return `已兑现下一步：${normalizeMemoryText(nextStep.label)}；原因：${normalizeMemoryText(nextStep.reason)}`;
  }

  const pending = findPendingNextStep(existingFacts, receipt.conversationKey);
  if (pending) {
    return `未兑现下一步：${pending}`;
  }

  return '未兑现下一步：本轮没有明确动作';
}

function findPendingNextStep(
  facts: readonly AgentMemoryFact[] | undefined,
  conversationKey: string,
): string | null {
  const candidate = [...(facts || [])]
    .filter((fact) =>
      fact.scope?.conversationKey === conversationKey
      && (fact.kind === 'active_next_step' || fact.kind === 'next_step_unfulfilled'),
    )
    .sort((left, right) => {
      const leftDay = left.updatedAtDay ?? left.createdAtDay ?? 0;
      const rightDay = right.updatedAtDay ?? right.createdAtDay ?? 0;
      if (leftDay !== rightDay) return rightDay - leftDay;
      return right.strength - left.strength;
    })[0];

  if (!candidate) return null;
  const raw = candidate.summary
    .replace(/^已兑现下一步[:：]\s*/, '')
    .replace(/^未兑现下一步[:：]\s*/, '')
    .replace(/^下一步期待[:：]\s*/, '')
    .replace(/^下一步已承诺[:：]\s*/, '')
    .trim();
  return raw ? normalizeMemoryText(raw) : null;
}

function buildAttitudeSummary(receipt: ConversationReceipt): string {
  const deltas = receipt.settlement;
  const riskCount = receipt.proposal.riskKinds.filter((risk) => risk !== 'none').length;
  if (riskCount > 0 && (deltas.trustDelta < 0 || deltas.patienceDelta < 0)) {
    return '当前态度：更谨慎';
  }
  if (deltas.urgencyDelta > 0) {
    return '当前态度：追问更急';
  }
  if (deltas.priceFlexibilityDelta > 0) {
    return '当前态度：价格更松动';
  }
  if (deltas.trustDelta > 0 || deltas.patienceDelta > 0) {
    return '当前态度：更愿意配合';
  }
  if (deltas.customerIntentDelta > 0 || deltas.customerConfidenceDelta > 0) {
    return '当前态度：继续推进';
  }
  return '当前态度：保持观望';
}

function buildRelationshipSummary(receipt: ConversationReceipt): string {
  const deltas = receipt.settlement;
  const parts: string[] = [];
  if (deltas.trustDelta !== 0) parts.push(`信任 ${formatSignedDelta(deltas.trustDelta)}`);
  if (deltas.patienceDelta !== 0) parts.push(`耐心 ${formatSignedDelta(deltas.patienceDelta)}`);
  if (deltas.urgencyDelta !== 0) parts.push(`催促 ${formatSignedDelta(deltas.urgencyDelta)}`);
  if (deltas.priceFlexibilityDelta !== 0) parts.push(`价格态度 ${formatSignedDelta(deltas.priceFlexibilityDelta)}`);
  if (deltas.customerIntentDelta !== 0) parts.push(`客户意向 ${formatSignedDelta(deltas.customerIntentDelta)}`);
  if (deltas.customerConfidenceDelta !== 0) parts.push(`客户信心 ${formatSignedDelta(deltas.customerConfidenceDelta)}`);

  const effectLabels = [...new Set(receipt.settlement.effectLabels)]
    .map((label) => normalizeMemoryText(label))
    .filter((label) => containsChinese(label));

  const effectText = effectLabels.length > 0 ? effectLabels.join('、') : '关系持平';
  const deltaText = parts.length > 0 ? parts.join('、') : '基本持平';
  return `本轮关系变化：${deltaText}；${effectText}`;
}

function formatSignedDelta(value: number): string {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : 0;
  return normalized > 0 ? `+${normalized}` : `${normalized}`;
}

function normalizeMemoryText(text: string, maxLength = 48): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function containsChinese(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}
