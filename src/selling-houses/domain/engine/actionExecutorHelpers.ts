import { ACTIONS } from '../constants.js';
import type { Case } from '../models.js';

function normalizeActionId(actionId: string) {
  const action = ACTIONS.find((entry) => entry.id === actionId || entry.executorId === actionId);
  return action?.executorId || action?.id || actionId;
}

export function touchCaseForAction(
  caseItem: Case,
  actionId: string,
  currentDay: number,
  touchOwner = false,
) {
  caseItem.actionsToday += 1;
  caseItem.touchedToday = true;
  caseItem.lastTouchedDay = currentDay;
  caseItem.lastAction = normalizeActionId(actionId);
  if (touchOwner) {
    caseItem.touchedOwnerToday = true;
  }
}
