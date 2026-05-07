import type { Case, GameState } from './models.js';
import { recordDomainEvent } from './runtimeState.js';
import { applyAuxiliaryStats } from './runtimeStats.js';
import { markCaseLostToRival } from './caseOutcome.js';
import { applyBrokerOwnerTrustDelta } from './trustWriteHelper.js';
import { setOpportunityStatusOnState, setOpportunityStageLabel, findBrokeredStateForOpportunity, ensureBrokeredOpportunityState, findMatchStateForPair } from './opportunitySplitHelper.js';

export function loseCaseToRival(
  state: GameState,
  caseItem: Case,
  detail: string,
) {
  if (caseItem.status !== 'active') {
    return false;
  }

  caseItem.status = 'lost_to_rival';
  caseItem.stageLabel = '他处成交';

  markCaseLostToRival(caseItem);

  applyBrokerOwnerTrustDelta(state, caseItem, -8, '流失给竞品信任受损', 0, 100);

  applyAuxiliaryStats(state, {
    wordOfMouth: Math.max(0, state.auxiliaryStats.wordOfMouth - 5),
  });

  state.opportunities.forEach((entry) => {
    if (entry.caseId === caseItem.id && entry.status === 'active') {
      setOpportunityStatusOnState(state, entry, 'lost', '流失给竞品');
      // Ensure canonical brokered state exists, then set stageLabel through helper
      const match = findMatchStateForPair(state, entry.customerId, entry.caseId);
      if (match) {
        const brokered = ensureBrokeredOpportunityState(state, entry, match.matchId);
        setOpportunityStageLabel(state, brokered, '他处成交', '流失给竞品');
      }
      // If no match exists, stageLabel is set by the status/mirror sync only
    }
  });

  recordDomainEvent(state, {
    kind: 'case_lost_to_rival',
    actor: '竞品截走',
    title: '房源在他处成交',
    detail: `${caseItem.title} ${detail}`,
    tone: 'danger',
    caseId: caseItem.id,
    payload: {
      ownerSatisfaction: caseItem.ownerSatisfaction,
      defenseOutcome: caseItem.defenseOutcome,
      endingType: caseItem.endingType,
      endingBucket: caseItem.endingBucket,
    },
  });

  return {
    actor: '竞品截走',
    message: `${caseItem.title} ${detail}`,
  };
}
