import type { AiArrangementContextPack, VisibleArrangementItem } from './contextPack.js';
import type { AiArrangementProposalV2 } from './proposal.js';

interface ScoredCandidate {
  item: VisibleArrangementItem;
  scores: {
    ownerScore: number;
    customerScore: number;
    riskScore: number;
    urgencyScore: number;
    impactScore: number;
    compositeScore: number;
  };
  reasoning: string[];
}

export function buildReasonedProposal(pack: AiArrangementContextPack): AiArrangementProposalV2 {
  const candidates = pack.candidateItems.filter(item => !item.disabledReason);
  
  if (candidates.length === 0 || pack.energy.remaining <= 0) {
    return buildNoDecisionProposal(pack);
  }

  const scored = candidates.map(item => scoreCandidate(item, pack));
  scored.sort((a, b) => b.scores.compositeScore - a.scores.compositeScore);

  const drafts: Array<{
    readonly itemId: string;
    readonly slot: 'am' | 'pm';
    readonly title: string;
    readonly reason: string;
    readonly energyCost: number;
    readonly durationHours: number;
  }> = [];
  const seen = new Set<string>();
  const slotUsedHours = { am: 0, pm: 0 };
  let remainingEnergy = pack.energy.remaining;

  for (const candidate of scored) {
    if (drafts.length >= 3) break;
    const item = candidate.item;
    if (seen.has(item.itemId)) continue;
    if (item.energyCost > remainingEnergy) continue;
    const slot = item.slot || pack.currentSlot;
    const slotCapacity = slot === 'am' ? pack.slots.am.remainingCapacity : pack.slots.pm.remainingCapacity;
    if (slotUsedHours[slot] + item.durationHours > slotCapacity) continue;
    seen.add(item.itemId);
    drafts.push({
      itemId: item.itemId,
      slot,
      title: item.title.slice(0, 30),
      reason: candidate.reasoning.join('；').slice(0, 60),
      energyCost: item.energyCost,
      durationHours: item.durationHours,
    });
    remainingEnergy -= item.energyCost;
    slotUsedHours[slot] += item.durationHours;
  }

  const evidenceLabels = buildEvidenceLabels(pack, scored, drafts);
  const leadDraft = drafts[0] || null;

  return {
    proposalId: `reasoned-${pack.day}-${drafts.map(d => d.itemId).join('-') || 'empty'}`,
    source: 'fallback',
    confidence: calculateConfidence(pack, drafts),
    headline: leadDraft ? `建议先排：${leadDraft.title}` : '今天暂时不用再加安排',
    summary: leadDraft
      ? buildSummary(pack, drafts, scored)
      : '当前余量或候选动作不足，先处理已有安排。',
    evidenceLabels,
    drafts,
  };
}

function scoreCandidate(item: VisibleArrangementItem, pack: AiArrangementContextPack): ScoredCandidate {
  const reasoning: string[] = [];
  const signals = item.signalTrace || [];

  let ownerScore = 50;
  const trustSignal = signals.find(s => s.signal.includes('信任') || s.signal.includes('关系'));
  if (trustSignal) ownerScore += trustSignal.credibility * 30;
  const urgencySignal = signals.find(s => s.signal.includes('催') || s.signal.includes('急'));
  if (urgencySignal) ownerScore += urgencySignal.credibility * 20;
  if (item.riskLevel === 'high') ownerScore += 15;
  if (item.riskLevel === 'medium') ownerScore += 8;

  let customerScore = 50;
  const intentSignal = signals.find(s => s.signal.includes('意向') || s.signal.includes('客户'));
  if (intentSignal) customerScore += intentSignal.credibility * 25;
  if (item.actionId === 'showing' || item.actionId === 'follow-up') customerScore += 15;

  let riskScore = 0;
  if (item.riskLevel === 'high') riskScore = 80;
  else if (item.riskLevel === 'medium') riskScore = 50;
  else riskScore = 20;
  if (item.evidenceLabels && item.evidenceLabels.length > 2) riskScore += 10;

  let urgencyScore = 50;
  const highUrgencySignals = signals.filter(s => s.credibility > 0.7);
  urgencyScore += highUrgencySignals.length * 10;
  if (item.rank !== undefined && item.rank <= 2) urgencyScore += 15;

  let impactScore = 50;
  if (item.actionId === 'first-visit' || item.actionId === 'pricing-advice') impactScore += 20;
  if (item.actionId === 'deep-diagnosis') impactScore += 15;
  if (item.durationHours >= 1.5) impactScore += 10;

  const slotMatch = (item.slot || pack.currentSlot) === pack.currentSlot ? 1 : 0;

  const compositeScore =
    ownerScore * 0.3 +
    customerScore * 0.2 +
    riskScore * 0.25 +
    urgencyScore * 0.15 +
    impactScore * 0.1 +
    slotMatch * 5;

  if (ownerScore > 65) reasoning.push(`业主视角：${ownerScore > 80 ? '高优先' : '需关注'}`);
  if (customerScore > 65) reasoning.push(`客户视角：${customerScore > 80 ? '高意向' : '需跟进'}`);
  if (riskScore > 60) reasoning.push(`风险：${item.riskLevel || 'medium'}`);
  if (urgencyScore > 70) reasoning.push('紧急');
  if (item.evidenceLabels && item.evidenceLabels.length > 0) {
    reasoning.push(`依据：${item.evidenceLabels[0]}`);
  }

  return {
    item,
    scores: { ownerScore, customerScore, riskScore, urgencyScore, impactScore, compositeScore },
    reasoning,
  };
}

function buildNoDecisionProposal(pack: AiArrangementContextPack): AiArrangementProposalV2 {
  return {
    proposalId: `reasoned-${pack.day}-no-decision`,
    source: 'fallback',
    confidence: 0.42,
    headline: '今天暂时不用再加安排',
    summary: '当前余量或候选动作不足，先处理已有安排。',
    evidenceLabels: pack.constraints.length > 0 ? pack.constraints : ['无可用候选动作'],
    drafts: [],
  };
}

function buildEvidenceLabels(
  pack: AiArrangementContextPack,
  scored: ScoredCandidate[],
  drafts: AiArrangementProposalV2['drafts'],
): string[] {
  const labels: string[] = [];
  labels.push(`可排余量 ${pack.energy.remaining} 小时`);
  labels.push(`${pack.candidateItems.length} 个候选动作`);
  if (pack.fixedItems.length > 0) labels.push(`固定 ${pack.fixedItems.length} 件`);
  if (pack.plannedItems.length > 0) labels.push(`已排 ${pack.plannedItems.length} 件`);
  if (pack.wechatSignals.length > 0) labels.push(`${pack.wechatSignals.length} 条微信信号`);
  if (pack.marketSignals.length > 0) labels.push(`${pack.marketSignals.length} 条市场信号`);
  if (scored.length > 0 && scored[0].scores.compositeScore > 70) {
    labels.push(`最高分候选：${scored[0].item.title}`);
  }
  return labels;
}

function calculateConfidence(pack: AiArrangementContextPack, drafts: AiArrangementProposalV2['drafts']): number {
  if (drafts.length === 0) return 0.42;
  let confidence = 0.68;
  if (pack.wechatSignals.some(s => s.urgency === 'high')) confidence += 0.08;
  if (pack.marketSignals.length > 0) confidence += 0.04;
  if (pack.constraints.length === 0) confidence += 0.04;
  return Math.min(confidence, 0.92);
}

function buildSummary(
  pack: AiArrangementContextPack,
  drafts: AiArrangementProposalV2['drafts'],
  scored: ScoredCandidate[],
): string {
  const parts: string[] = [];
  parts.push(`先把最影响今日节奏的 ${drafts.length} 件事排进去`);
  if (pack.energy.remaining > 0) parts.push(`保留剩余余量 ${pack.energy.remaining} 小时`);
  const highRisk = scored.filter(s => s.item.riskLevel === 'high');
  if (highRisk.length > 0) parts.push(`含 ${highRisk.length} 个高风险动作`);
  return parts.join('，') + '。';
}
