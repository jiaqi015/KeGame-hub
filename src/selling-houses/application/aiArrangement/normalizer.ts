import type { AiArrangementContextPack } from './contextPack.js';
import type { AiArrangementProposalV2, AiArrangementDraftV2 } from './proposal.js';

export interface NormalizedProposalResult {
  readonly proposal: AiArrangementProposalV2;
  readonly validationNotes: readonly string[];
}

export function normalizeAiArrangementProposal(
  raw: unknown,
  pack: AiArrangementContextPack,
): NormalizedProposalResult {
  const validationNotes: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return {
      proposal: buildEmptyProposal(pack),
      validationNotes: ['invalid_input'],
    };
  }

  const input = raw as Record<string, unknown>;
  const validItemIds = new Set(pack.candidateItems.map(item => item.itemId));
  const seen = new Set<string>();
  let remainingEnergy = pack.energy.remaining;

  const rawDrafts = Array.isArray(input.drafts) ? input.drafts : [];
  const normalizedDrafts: AiArrangementDraftV2[] = [];

  for (const draft of rawDrafts) {
    if (!draft || typeof draft !== 'object') continue;
    const d = draft as Record<string, unknown>;
    const itemId = typeof d.itemId === 'string' ? d.itemId : '';

    if (!validItemIds.has(itemId)) {
      validationNotes.push(`invalid_item:${itemId}`);
      continue;
    }
    if (seen.has(itemId)) {
      validationNotes.push(`duplicate_item:${itemId}`);
      continue;
    }
    seen.add(itemId);

    const candidate = pack.candidateItems.find(item => item.itemId === itemId);
    if (!candidate) continue;

    if (candidate.energyCost > remainingEnergy) {
      validationNotes.push(`exceeds_energy:${itemId}`);
      continue;
    }

    const slot = d.slot === 'pm' ? 'pm' as const : 'am' as const;
    const slotCapacity = slot === 'am' ? pack.slots.am.remainingCapacity : pack.slots.pm.remainingCapacity;
    const slotUsedHours = normalizedDrafts
      .filter(dr => dr.slot === slot)
      .reduce((sum, dr) => sum + dr.durationHours, 0);
    if (slotUsedHours + candidate.durationHours > slotCapacity) {
      validationNotes.push(`exceeds_slot_capacity:${slot}`);
      continue;
    }

    if (!candidate.title) {
      validationNotes.push(`empty_title:${itemId}`);
      continue;
    }

    normalizedDrafts.push({
      itemId,
      slot,
      title: candidate.title.slice(0, 30),
      reason: typeof d.reason === 'string' ? d.reason.slice(0, 42) : '优先处理',
      energyCost: candidate.energyCost,
      durationHours: candidate.durationHours,
    });
    remainingEnergy -= candidate.energyCost;
  }

  const headline = typeof input.headline === 'string' ? input.headline.slice(0, 60) : '安排建议';
  const summary = typeof input.summary === 'string' ? input.summary.slice(0, 120) : '';
  const evidenceLabels = Array.isArray(input.evidenceLabels)
    ? (input.evidenceLabels as unknown[]).filter((e): e is string => typeof e === 'string').slice(0, 6)
    : [];
  const confidence = typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : 0.7;

  return {
    proposal: {
      proposalId: `ai-arrangement-${pack.day}-${normalizedDrafts.map(d => d.itemId).join('-') || 'empty'}`,
      source: 'ai',
      confidence,
      headline,
      summary,
      evidenceLabels,
      drafts: normalizedDrafts,
    },
    validationNotes,
  };
}

function buildEmptyProposal(pack: AiArrangementContextPack): AiArrangementProposalV2 {
  return {
    proposalId: `ai-arrangement-${pack.day}-empty`,
    source: 'fallback',
    confidence: 0.42,
    headline: '今天暂时不用再加安排',
    summary: '当前余量或候选动作不足，先处理已有安排。',
    evidenceLabels: [],
    drafts: [],
  };
}
