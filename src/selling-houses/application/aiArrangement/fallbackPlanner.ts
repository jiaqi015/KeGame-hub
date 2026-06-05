import type { AiArrangementContextPack, VisibleArrangementItem } from './contextPack.js';
import type { AiArrangementProposalV2, AiArrangementDraftV2 } from './proposal.js';

export function buildReason(item: import('./contextPack.js').VisibleArrangementItem): string {
  const parts: string[] = [];
  if (item.evidenceLabels && item.evidenceLabels.length > 0) {
    parts.push(item.evidenceLabels[0]);
  }
  if (item.signalTrace && item.signalTrace.length > 0) {
    parts.push(item.signalTrace[0].signal.slice(0, 20));
  }
  if (item.riskLevel === 'high') parts.push('高风险');
  if (item.riskLevel === 'medium') parts.push('需关注');
  if (parts.length === 0) parts.push(item.detail.slice(0, 42) || '优先处理');
  return parts.join('；').slice(0, 60);
}

export function buildFallbackAiArrangementProposal(
  pack: AiArrangementContextPack,
): AiArrangementProposalV2 {
  const sortedCandidates = [...pack.candidateItems]
    .filter(item => !item.disabledReason)
    .sort((a, b) => {
      const rankA = a.rank ?? 99;
      const rankB = b.rank ?? 99;
      const slotA = (a.slot || pack.currentSlot) === pack.currentSlot ? 0 : 1;
      const slotB = (b.slot || pack.currentSlot) === pack.currentSlot ? 0 : 1;
      if (Math.abs(rankA - rankB) <= 3) return slotA - slotB;
      return rankA - rankB;
    });

  let remainingEnergy = pack.energy.remaining;
  const slotUsedHours = { am: 0, pm: 0 };
  const drafts: AiArrangementDraftV2[] = [];
  const seen = new Set<string>();

  for (const item of sortedCandidates) {
    if (drafts.length >= 3) break;
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
      reason: buildReason(item),
      energyCost: item.energyCost,
      durationHours: item.durationHours,
    });
    remainingEnergy -= item.energyCost;
    slotUsedHours[slot] += item.durationHours;
  }

  const evidenceLabels = [
    `可排余量 ${pack.energy.remaining} 小时`,
    `${pack.candidateItems.length} 个候选动作`,
  ];
  if (pack.fixedItems.length > 0) evidenceLabels.push(`固定 ${pack.fixedItems.length} 件`);
  if (pack.plannedItems.length > 0) evidenceLabels.push(`已排 ${pack.plannedItems.length} 件`);

  const leadDraft = drafts[0] || null;
  const proposalKey = drafts.map(d => d.itemId).join('-') || 'empty';

  return {
    proposalId: `ai-arrangement-${pack.day}-${proposalKey}`,
    source: 'fallback',
    confidence: drafts.length > 0 ? 0.68 : 0.42,
    headline: leadDraft ? `建议先排：${leadDraft.title}` : '今天暂时不用再加安排',
    summary: leadDraft
      ? `先把最影响今日节奏的 ${drafts.length} 件事排进去，保留剩余余量。`
      : '当前余量或候选动作不足，先处理已有安排。',
    evidenceLabels,
    drafts,
  };
}
