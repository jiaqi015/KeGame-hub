import type { GameState, Expectation } from '../models.js';

export function buildExpectations(state: GameState): Expectation[] {
  if (!state.expectationStore) {
    state.expectationStore = [];
  }
  
  const expectations: Expectation[] = [];

  // 1. 抓取昨日大动作（比如开放日、大型推广、涉及谈判的 Matter）
  const activeMatters = state.matters.filter(
    (m) => m.stage === 'in_progress' || (m.stage === 'completed' && m.updatedAtDay === state.day - 1)
  );

  for (const matter of activeMatters) {
    if (matter.lifecycleCategory === 'execute' || matter.lifecycleCategory === 'negotiate') {
      expectations.push({
        id: `exp_action_${matter.id}_${state.day}`,
        targetEntityId: matter.sourceKey || matter.caseId || '',
        expectedAction: matter.lifecycleCategory === 'negotiate' ? 'owner_response' : 'customer_conversion',
        createdAtDay: state.day,
        weight: 10,
        sourceMatterId: matter.id,
      });
    }
  }

  // 2. 临界状态实体（比如客户 readiness > 80% 或状态为 negotiating）
  state.customerStates.forEach(customer => {
    if (customer.status === 'negotiating') {
      expectations.push({
        id: `exp_crit_${customer.customerId}_${state.day}`,
        targetEntityId: customer.customerId,
        expectedAction: 'deal_progress',
        createdAtDay: state.day,
        weight: 8,
      });
    }
  });

  // 3. 连续沉默对象（连续3天未互动的高优房源）
  state.cases.forEach(c => {
    if (c.status === 'active' && (state.day - c.lastOwnerTouchedDay) >= 3) {
      expectations.push({
        id: `exp_silence_${c.id}_${state.day}`,
        targetEntityId: c.ownerName,
        expectedAction: 'owner_patience_drop',
        createdAtDay: state.day,
        weight: 5,
      });
    }
  });

  // 更新 Store
  state.expectationStore = [
    ...state.expectationStore.filter(e => (state.day - e.createdAtDay) < 2), 
    ...expectations
  ];

  return state.expectationStore;
}
