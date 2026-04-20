import type { GameState, InboundOpportunity } from '../models.js';
import { chance, randomInt } from '../utils.js';
import { applyInboundOpportunity } from './inboundOpportunityEngine.js';

export function settleMarketSignals(state: GameState) {
  state.marketShadow.marketSignals.forEach((signal) => {
    signal.expiresInDays -= 1;
  });
  state.marketShadow.marketSignals = state.marketShadow.marketSignals
    .filter((signal) => signal.expiresInDays > 0)
    .slice(0, state.rules.marketSignalMaxVisible);

  if (state.marketShadow.marketSignals.length >= state.rules.marketSignalMaxVisible) {
    return;
  }

  if (!chance(0.18, state)) {
    return;
  }

  const templates = state.runContext.scenarioSnapshot.world.signalTemplates || [];
  const template = templates[randomInt(0, Math.max(0, templates.length - 1), state)];
  const activeCase = state.cases.filter((entry) => entry.status === 'active')[0];
  if (!template || !activeCase) return;

  const inbound: InboundOpportunity = {
    id: `ambient-signal-${state.day}-${randomInt(100, 999, state)}`,
    type: 'signal_to_player',
    source: 'market_event',
    title: template.title,
    message: template.message,
    payload: {
      type: template.type,
      district: activeCase.district,
      expiresInDays: state.rules.marketSignalDecayDays,
    },
  };
  applyInboundOpportunity(state, inbound);
}
