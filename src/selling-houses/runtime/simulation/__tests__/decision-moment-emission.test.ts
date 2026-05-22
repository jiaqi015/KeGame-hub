import { describe, expect, it } from 'vitest';

import {
  createInitialState,
  normalizeLoadedState,
  updateDerivedState,
} from '../../../application/gameState';
import { executeGameAction, executeScenarioAction } from '../../../application/gameTransitions';
import {
  createOpportunity,
  executeAction,
  refreshOpportunityLabel,
} from '../../../domain/engine';
import { getScenarioSnapshotById } from '../../../domain/scenarioCatalog';
import type { GameState, Case } from '../../../domain/models';
import type { Settlement } from '../../../domain/actions/templates';

function buildWorld(): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  if (!snapshot) {
    throw new Error('Missing builtin scenario for test');
  }
  const world = createInitialState(snapshot, 123456);
  updateDerivedState(world);
  return world;
}

function getActiveCases(state: GameState): Case[] {
  return state.cases.filter((c) => c.status === 'active');
}

function findMomentEvents(state: GameState) {
  return state.eventStore.filter((e) => e.kind === 'decision_moment_triggered');
}

function findFlowEvents(state: GameState) {
  return state.eventStore.filter((e) => e.kind === 'business_flow_step_advanced');
}

function advanceOppsForCase(state: GameState, caseId: string, targetStage: number) {
  let hasActiveOpportunity = false;
  for (const opp of state.opportunities) {
    if (opp.caseId === caseId && opp.status === 'active') {
      hasActiveOpportunity = true;
      opp.stageIndex = Math.max(opp.stageIndex, targetStage);
      refreshOpportunityLabel(state, opp);
    }
  }
  if (!hasActiveOpportunity) {
    const caseItem = state.cases.find((entry) => entry.id === caseId);
    const opportunity = createOpportunity(state, caseItem, 'broker-network', 20);
    if (!opportunity) {
      throw new Error(`Could not create opportunity for ${caseId}`);
    }
    opportunity.stageIndex = Math.max(opportunity.stageIndex, targetStage);
    refreshOpportunityLabel(state, opportunity);
  }
}

function prepareOpenDayCase(state: GameState): Case {
  const caseItem = getActiveCases(state)[0];
  caseItem.hasCompletedFirstVisit = true;
  caseItem.touchedOwnerToday = false;
  caseItem.actionsToday = 0;
  caseItem.openDayCooldown = 0;
  caseItem.stageIndex = Math.max(caseItem.stageIndex, 2);
  advanceOppsForCase(state, caseItem.id, 1);
  state.energy = 100;
  return caseItem;
}

function buildSettlement(): Settlement {
  return {
    outcome: 'progress',
    title: '开放日顺利推进',
    summary: '吸引了多位客户到访。',
    details: ['到访客户 5 组', '新增意向客户 2 位'],
    stateDeltas: [
      { field: 'case.heat', value: 15, label: '关注度' },
    ],
    nextActionHint: '趁热打铁跟进意向客户',
    finalOptionId: 'quality-open-day',
  };
}

describe('domain path boundary', () => {
  it('executeAction (domain) does not emit decision_moment_triggered events', () => {
    const state = buildWorld();
    const caseItem = getActiveCases(state)[0];
    const ok = executeAction(state, 'first-visit', caseItem);
    expect(ok).toBe(true);
    expect(findMomentEvents(state)).toHaveLength(0);
  });

  it('executeAction (domain) does not advance flowProgress', () => {
    const state = buildWorld();
    const caseItem = getActiveCases(state)[0];
    executeAction(state, 'first-visit', caseItem);
    expect(state.flowProgress['standard-selling']).toBeUndefined();
  });
});

describe('decision moment emission', () => {
  it('emits first-visit-owner-discovery on first-visit', () => {
    const state = buildWorld();
    const cases = getActiveCases(state);
    expect(cases.length).toBeGreaterThan(0);

    const caseItem = cases[0];
    const { nextState, success } = executeGameAction(state, 'first-visit', caseItem.id);
    expect(success).toBe(true);

    const momentEvents = findMomentEvents(nextState);
    const ids = momentEvents.map((e) => (e.payload as any).momentId);
    expect(ids).toContain('first-visit-owner-discovery');
  });

  it('emits pricing-strategy-adjustment on ask-psychological-price', () => {
    const state = buildWorld();
    const cases = getActiveCases(state);
    const caseItem = cases[0];

    caseItem.hasCompletedFirstVisit = true;
    caseItem.touchedOwnerToday = false;
    caseItem.actionsToday = 0;

    const { nextState, success } = executeGameAction(state, 'ask-psychological-price', caseItem.id);
    expect(success).toBe(true);

    const momentEvents = findMomentEvents(nextState);
    const ids = momentEvents.map((e) => (e.payload as any).momentId);
    expect(ids).toContain('pricing-strategy-adjustment');
  });

  it('emits open-day-participation on open-day', () => {
    const state = buildWorld();
    const caseItem = prepareOpenDayCase(state);

    const { nextState, success } = executeGameAction(state, 'open-day', caseItem.id);
    expect(success).toBe(true);

    const momentEvents = findMomentEvents(nextState);
    const ids = momentEvents.map((e) => (e.payload as any).momentId);
    expect(ids).toContain('open-day-participation');
  });

  it('emits sincerity-sale-entry on sincerity-sale', () => {
    const state = buildWorld();
    const cases = getActiveCases(state);
    const caseItem = cases[0];

    caseItem.hasCompletedFirstVisit = true;
    caseItem.touchedOwnerToday = false;
    caseItem.actionsToday = 0;
    advanceOppsForCase(state, caseItem.id, 4);
    caseItem.stageIndex = Math.max(caseItem.stageIndex, 4);
    caseItem.offers = Math.max(caseItem.offers, 1);
    updateDerivedState(state);

    const { nextState, success } = executeGameAction(state, 'sincerity-sale', caseItem.id);
    expect(success).toBe(true);

    const momentEvents = findMomentEvents(nextState);
    const ids = momentEvents.map((e) => (e.payload as any).momentId);
    expect(ids).toContain('sincerity-sale-entry');
  });

  it('emits offer-acceptance-negotiation on invite-customer-negotiation', () => {
    const state = buildWorld();
    const cases = getActiveCases(state);
    const caseItem = cases[0];

    caseItem.hasCompletedFirstVisit = true;
    caseItem.touchedOwnerToday = false;
    advanceOppsForCase(state, caseItem.id, 5);
    caseItem.stageIndex = Math.max(caseItem.stageIndex, 5);
    caseItem.offers = Math.max(caseItem.offers, 1);
    updateDerivedState(state);

    const { nextState, success } = executeGameAction(state, 'invite-customer-negotiation', caseItem.id);
    expect(success).toBe(true);

    const momentEvents = findMomentEvents(nextState);
    const ids = momentEvents.map((e) => (e.payload as any).momentId);
    expect(ids).toContain('offer-acceptance-negotiation');
  });

  it('produces correct number of events for sequential actions', () => {
    const state = buildWorld();
    const cases = getActiveCases(state);
    const caseItem = cases[0];

    const result1 = executeGameAction(state, 'first-visit', caseItem.id);
    expect(result1.success).toBe(true);

    const caseItem2 = getActiveCases(result1.nextState).find((c) => c.id === caseItem.id)!;
    caseItem2.touchedOwnerToday = false;
    caseItem2.actionsToday = 0;

    const result2 = executeGameAction(result1.nextState, 'ask-psychological-price', caseItem2.id);
    expect(result2.success).toBe(true);

    const pricingEvents = findMomentEvents(result2.nextState).filter(
      (e) => (e.payload as any).momentId === 'pricing-strategy-adjustment',
    );
    expect(pricingEvents).toHaveLength(1);

    const firstVisitEvents = findMomentEvents(result2.nextState).filter(
      (e) => (e.payload as any).momentId === 'first-visit-owner-discovery',
    );
    expect(firstVisitEvents).toHaveLength(1);
  });

  it('does not emit events for actions without decisionMomentIds', () => {
    const state = buildWorld();
    const cases = getActiveCases(state);
    const caseItem = cases[0];

    caseItem.hasCompletedFirstVisit = true;
    caseItem.touchedOwnerToday = false;

    const { nextState, success } = executeGameAction(state, 'weekly-feedback', caseItem.id);
    expect(success).toBe(true);

    expect(findMomentEvents(nextState)).toHaveLength(0);
  });
});

describe('flow progress advancement', () => {
  it('sets currentStepId to owner-alignment after first-visit', () => {
    const state = buildWorld();
    const cases = getActiveCases(state);
    const caseItem = cases[0];

    const { nextState, success } = executeGameAction(state, 'first-visit', caseItem.id);
    expect(success).toBe(true);

    expect(nextState.flowProgress).toBeDefined();
    const progress = nextState.flowProgress!['standard-selling'];
    expect(progress).toBeDefined();
    expect(progress.currentStepId).toBe('owner-alignment');
  });

  it('advances through standard-selling steps', () => {
    const state = buildWorld();
    const cases = getActiveCases(state);
    const caseItem = cases[0];

    const r1 = executeGameAction(state, 'first-visit', caseItem.id);
    expect(r1.success).toBe(true);

    const p1 = r1.nextState.flowProgress!['standard-selling'];
    expect(p1.currentStepId).toBe('owner-alignment');

    const c2 = getActiveCases(r1.nextState).find((c) => c.id === caseItem.id)!;
    c2.touchedOwnerToday = false;
    c2.actionsToday = 0;
    c2.stageIndex = Math.max(c2.stageIndex, 1);
    const r2 = executeGameAction(r1.nextState, 'story', c2.id);
    expect(r2.success).toBe(true);

    const p2 = r2.nextState.flowProgress!['standard-selling'];
    expect(p2.completedStepIds).toContain('owner-alignment');
    expect(p2.currentStepId).toBe('demand-generation');

    const c3 = getActiveCases(r2.nextState).find((c) => c.id === caseItem.id)!;
    c3.touchedOwnerToday = false;
    c3.actionsToday = 0;
    advanceOppsForCase(r2.nextState, c3.id, 5);
    c3.stageIndex = Math.max(c3.stageIndex, 5);
    c3.offers = Math.max(c3.offers, 1);
    updateDerivedState(r2.nextState);

    const r3 = executeGameAction(r2.nextState, 'invite-customer-negotiation', c3.id);
    expect(r3.success).toBe(true);

    const p3 = r3.nextState.flowProgress!['standard-selling'];
    expect(p3.completedStepIds).toContain('demand-generation');
    expect(p3.currentStepId).toBe('price-and-close');
  });

  it('creates open-day flow progress when executing open-day', () => {
    const state = buildWorld();
    const caseItem = prepareOpenDayCase(state);

    const { nextState, success } = executeGameAction(state, 'open-day', caseItem.id);
    expect(success).toBe(true);

    expect(nextState.flowProgress).toBeDefined();
    const openDayProgress = nextState.flowProgress!['open-day'];
    expect(openDayProgress).toBeDefined();
    expect(openDayProgress.currentStepId).toBe('owner-signup');
  });
});

describe('dual path consistency', () => {
  it('open-day via both paths emit identical moment event shape', () => {
    const stateA = buildWorld();
    const caseA = prepareOpenDayCase(stateA);

    const { nextState: nextStateA, success: successA } = executeGameAction(stateA, 'open-day', caseA.id);
    expect(successA).toBe(true);

    const evA = nextStateA.eventStore.find((e) => e.kind === 'decision_moment_triggered');
    expect(evA).toBeDefined();

    const stateB = buildWorld();
    const caseB = prepareOpenDayCase(stateB);
    const settlement = buildSettlement();

    const scenarioContext = {
      choices: [
        { round: 1, main: 'quality-open-day', assist: 'conversion-open-day' },
      ],
      feedbacks: [
        { actor: 'market', mood: 'positive', message: '客户反馈积极' },
      ],
    };

    const { nextState: nextStateB, success: successB } = executeScenarioAction(stateB, 'open-day', caseB.id, settlement, scenarioContext);
    expect(successB).toBe(true);

    const evB = nextStateB.eventStore.find((e) => e.kind === 'decision_moment_triggered');
    expect(evB).toBeDefined();

    expect((evA!.payload as any).momentId).toBe('open-day-participation');
    expect((evB!.payload as any).momentId).toBe('open-day-participation');
    expect((evA!.payload as any).actionId).toBe((evB!.payload as any).actionId);
    expect(evA!.kind).toBe(evB!.kind);
    expect(evA!.actor).toBe(evB!.actor);
    expect(evA!.tone).toBe(evB!.tone);

    expect((evA!.payload as any).signalsSnapshot).toBeDefined();
    expect((evB!.payload as any).signalsSnapshot).toBeDefined();
    expect(Object.keys((evA!.payload as any).signalsSnapshot)).toEqual(
      Object.keys((evB!.payload as any).signalsSnapshot),
    );
  });

  it('open-day via executeScenarioAction also advances flowProgress', () => {
    const state = buildWorld();
    const caseItem = prepareOpenDayCase(state);
    const settlement = buildSettlement();

    const { nextState, success } = executeScenarioAction(state, 'open-day', caseItem.id, settlement);
    expect(success).toBe(true);

    const flowEvents = findFlowEvents(nextState);
    expect(flowEvents.length).toBeGreaterThan(0);
    expect(nextState.flowProgress).toBeDefined();
    expect(nextState.flowProgress!['open-day']).toBeDefined();
    expect(nextState.flowProgress!['open-day'].currentStepId).toBe('owner-signup');
  });
});

describe('legacy save compatibility', () => {
  it('normalizeLoadedState handles legacy snapshot without flowProgress', () => {
    const snapshot = getScenarioSnapshotById('standard-window-chain');
    if (!snapshot) throw new Error('Missing builtin scenario');

    const freshState = createInitialState(snapshot, 123456);
    updateDerivedState(freshState);

    const serialized = JSON.parse(JSON.stringify(freshState));
    delete serialized.flowProgress;

    const restored = normalizeLoadedState(serialized);
    expect(restored).not.toBeNull();
    expect(restored!.flowProgress).toEqual({});

    const caseItem = getActiveCases(restored!)[0];
    const { nextState, success } = executeGameAction(restored!, 'first-visit', caseItem.id);
    expect(success).toBe(true);

    expect(nextState.flowProgress['standard-selling']).toBeDefined();
    expect(nextState.flowProgress['standard-selling'].currentStepId).toBe('owner-alignment');
  });

  it('normalizeLoadedState handles legacy snapshot with null flowProgress', () => {
    const snapshot = getScenarioSnapshotById('standard-window-chain');
    if (!snapshot) throw new Error('Missing builtin scenario');

    const freshState = createInitialState(snapshot, 999);
    updateDerivedState(freshState);

    const serialized = JSON.parse(JSON.stringify(freshState));
    serialized.flowProgress = null;

    const restored = normalizeLoadedState(serialized);
    expect(restored).not.toBeNull();
    expect(restored!.flowProgress).toEqual({});

    const caseItem = getActiveCases(restored!)[0];
    const { nextState, success } = executeGameAction(restored!, 'first-visit', caseItem.id);
    expect(success).toBe(true);
    expect(nextState.flowProgress['standard-selling']).toBeDefined();
  });

  it('normalizeLoadedState preserves existing flowProgress from save', () => {
    const snapshot = getScenarioSnapshotById('standard-window-chain');
    if (!snapshot) throw new Error('Missing builtin scenario');

    const freshState = createInitialState(snapshot, 123456);
    updateDerivedState(freshState);

    const caseItem = getActiveCases(freshState)[0];
    const r1 = executeGameAction(freshState, 'first-visit', caseItem.id);
    expect(r1.nextState.flowProgress!['standard-selling']).toBeDefined();

    const serialized = JSON.parse(JSON.stringify(r1.nextState));
    expect(serialized.flowProgress).toBeDefined();
    expect(serialized.flowProgress['standard-selling']).toBeDefined();

    const restored = normalizeLoadedState(serialized);
    expect(restored).not.toBeNull();
    expect(restored!.flowProgress['standard-selling']).toBeDefined();
    expect(restored!.flowProgress['standard-selling'].currentStepId).toBe('owner-alignment');
    expect(restored!.flowProgress['standard-selling'].completedStepIds).toEqual([]);
  });
});
