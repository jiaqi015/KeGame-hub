import { queueDealClosingEvaluation } from '../dealClosing.js';
import type { Case, GameState, Opportunity } from '../models.js';

export function queueNegotiationProcessEvaluation(
  state: GameState,
  caseItem: Case,
  opportunity: Opportunity,
  optionId: string | null,
  onMessage?: (msg: string) => void,
) {
  queueDealClosingEvaluation(state, caseItem, opportunity, optionId || 'balanced');
  onMessage?.(`${caseItem.title} 已进入价格确认，今天结束后会看客户和业主条件能不能谈成。`);
}
