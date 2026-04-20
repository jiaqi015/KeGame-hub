import type { Case, GameState } from './models.js';
import { recordDomainEvent } from './runtimeState.js';
import { applyAuxiliaryStats } from './runtimeStats.js';

export function loseCaseToRival(
  state: GameState,
  caseItem: Case,
  detail: string,
) {
  if (caseItem.status !== 'active') {
    return false;
  }

  caseItem.status = 'lost_to_rival';
  caseItem.stageLabel = '被竞品截走';
  caseItem.defenseOutcome = 'lost_to_rival';
  caseItem.ownerSatisfaction = caseItem.trust <= 52 ? 'unhappy' : 'regret';
  caseItem.endingType = 'sold_by_other';
  caseItem.endingBucket = 'bad';
  caseItem.trust = Math.max(0, caseItem.trust - 8);

  applyAuxiliaryStats(state, {
    wordOfMouth: Math.max(0, state.auxiliaryStats.wordOfMouth - 5),
  });

  state.opportunities.forEach((entry) => {
    if (entry.caseId === caseItem.id && entry.status === 'active') {
      entry.status = 'lost';
      entry.stageLabel = '被竞品截走';
    }
  });

  recordDomainEvent(state, {
    kind: 'case_lost_to_rival',
    actor: '竞品截走',
    title: '房源被竞品截走',
    detail: `${caseItem.title} ${detail}`,
    tone: 'danger',
    caseId: caseItem.id,
    payload: {
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
