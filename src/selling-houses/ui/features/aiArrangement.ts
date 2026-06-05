import type { TodayArrangementSlot } from '../../domain/models.js';
import type { ArrangementItemProjection, ArrangementProjection } from '../../application/projections/operatingProjection.js';

export const AI_ARRANGEMENT_THINKING_STEPS = [
  '读取今日余量',
  '比对待处理房源',
  '压缩成一个安排建议',
] as const;

export type AiArrangementProposalSource = 'frontend-framework' | 'ai' | 'fallback';

export interface AiArrangementDraft {
  itemId: string;
  slot: TodayArrangementSlot;
  title: string;
  reason: string;
  energyCost: number;
  durationHours: number;
}

export interface AiArrangementProposal {
  proposalId: string;
  day: number;
  source: AiArrangementProposalSource;
  confidence: number;
  headline: string;
  summary: string;
  evidenceLabels: string[];
  drafts: AiArrangementDraft[];
}

export interface AiArrangementProposalInput {
  arrangement: ArrangementProjection;
  day: number;
  activeSlot: TodayArrangementSlot;
  maxDrafts?: number;
}

export interface AiArrangementAdoptableItem {
  item: ArrangementItemProjection;
  slot: TodayArrangementSlot;
}

function shortText(value: string, max: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1))}…`;
}

function itemTitle(item: ArrangementItemProjection) {
  return item.displayTitle || item.title;
}

function itemReason(item: ArrangementItemProjection) {
  if (item.conflictHint?.message) {
    return shortText(item.conflictHint.message, 42);
  }
  return shortText(item.detail, 42);
}

function candidateRank(item: ArrangementItemProjection) {
  return typeof item.rank === 'number' ? item.rank : 99;
}

function isCandidateSelectable(item: ArrangementItemProjection) {
  return item.source === 'candidate' && Boolean(item.actionId) && !item.isDisabled;
}

export function buildAiArrangementProposal({
  arrangement,
  day,
  activeSlot,
  maxDrafts = 3,
}: AiArrangementProposalInput): AiArrangementProposal {
  const sortedCandidates = arrangement.candidateItems
    .filter(isCandidateSelectable)
    .sort((left, right) => {
      const rankDelta = candidateRank(left) - candidateRank(right);
      if (rankDelta !== 0) return rankDelta;
      const leftSlotScore = (left.slot || activeSlot) === activeSlot ? 0 : 1;
      const rightSlotScore = (right.slot || activeSlot) === activeSlot ? 0 : 1;
      return leftSlotScore - rightSlotScore;
    });

  let remainingEnergy = Math.max(0, arrangement.remainingEnergy);
  const drafts: AiArrangementDraft[] = [];

  for (const item of sortedCandidates) {
    if (drafts.length >= maxDrafts) break;
    if (item.energyCost > remainingEnergy) continue;
    drafts.push({
      itemId: item.id,
      slot: item.slot || activeSlot,
      title: shortText(itemTitle(item), 30),
      reason: itemReason(item),
      energyCost: item.energyCost,
      durationHours: item.durationHours,
    });
    remainingEnergy -= item.energyCost;
  }

  const evidenceLabels = [
    `可排余量 ${arrangement.remainingEnergy} 小时`,
    `${arrangement.candidateItems.length} 个候选动作`,
  ];
  if (arrangement.fixedItems.length > 0) {
    evidenceLabels.push(`固定 ${arrangement.fixedItems.length} 件`);
  }
  if (arrangement.plannedItems.length > 0) {
    evidenceLabels.push(`已排 ${arrangement.plannedItems.length} 件`);
  }

  const leadDraft = drafts[0] || null;
  const proposalKey = drafts.map((draft) => draft.itemId).join('-') || 'empty';
  return {
    proposalId: `ai-arrangement-${day}-${proposalKey}`,
    day,
    source: 'frontend-framework',
    confidence: drafts.length > 0 ? 0.68 : 0.42,
    headline: leadDraft ? `建议先排：${leadDraft.title}` : '今天暂时不用再加安排',
    summary: leadDraft
      ? `先把最影响今日节奏的 ${drafts.length} 件事排进去，保留剩余余量。`
      : '当前余量或候选动作不足，先处理已有安排。',
    evidenceLabels,
    drafts,
  };
}

export function resolveAiArrangementAdoptableItems(
  proposal: AiArrangementProposal,
  arrangement: ArrangementProjection,
): AiArrangementAdoptableItem[] {
  const candidateById = new Map(arrangement.candidateItems.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const resolved: AiArrangementAdoptableItem[] = [];
  let remainingEnergy = Math.max(0, arrangement.remainingEnergy);

  for (const draft of proposal.drafts) {
    if (seen.has(draft.itemId)) continue;
    seen.add(draft.itemId);
    const item = candidateById.get(draft.itemId);
    if (!item || !isCandidateSelectable(item)) continue;
    if (item.energyCost > remainingEnergy) continue;
    resolved.push({
      item,
      slot: draft.slot === 'pm' ? 'pm' : 'am',
    });
    remainingEnergy -= item.energyCost;
  }

  return resolved;
}
