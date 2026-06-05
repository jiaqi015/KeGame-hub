import type { AiArrangementContextPack, VisibleArrangementItem } from './contextPack.js';
import type { AiArrangementProposalV2, AiArrangementDraftV2 } from './proposal.js';
import { buildReasonedProposal } from './reasoningEngine.js';

export function buildFallbackAiArrangementProposal(
  pack: AiArrangementContextPack,
): AiArrangementProposalV2 {
  return buildReasonedProposal(pack);
}
