export interface AiArrangementProposalV2 {
  readonly proposalId: string;
  readonly source: 'ai' | 'fallback';
  readonly confidence: number;
  readonly headline: string;
  readonly summary: string;
  readonly evidenceLabels: readonly string[];
  readonly drafts: readonly AiArrangementDraftV2[];
}

export interface AiArrangementDraftV2 {
  readonly itemId: string;
  readonly slot: 'am' | 'pm';
  readonly title: string;
  readonly reason: string;
  readonly energyCost: number;
  readonly durationHours: number;
}
