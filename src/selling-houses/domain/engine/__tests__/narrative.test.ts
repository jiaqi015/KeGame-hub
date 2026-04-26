import { describe, it, expect } from 'vitest';
import { generateDailyNarrative } from '../narrativeEngine.js';
import type { DomainEventEntry, Expectation, ForeshadowingHook } from '../../models.js';

describe('Narrative Engine', () => {
  const dummyState = {
    day: 5,
    rngState: 20260425,
    rngCalls: 0,
  };

  it('1. 强预期优先响应：当事件命中期望对象时，必须在开场回应', () => {
    const expectations: Expectation[] = [
      { id: 'exp1', targetEntityId: 'case_1', expectedAction: 'owner_response', createdAtDay: 4, weight: 10 }
    ];
    
    const events: DomainEventEntry[] = [
      { id: 'ev1', day: 5, date: '', kind: 'journal', actor: '王先生', title: '业主回复', detail: '拒绝降价', tone: 'danger', caseId: 'case_1', payload: {} }
    ];

    const result = generateDailyNarrative({
      events, expectations, resolvedHooks: [], state: dummyState
    });

    expect(result.openingHook).toContain('业主回复');
    expect(result.eventsUsed).toContain('ev1');
  });

  it('2. 沉默压迫感：如果没有任何事件，且有昨日期望，触发沉默兜底', () => {
    const expectations: Expectation[] = [
      { id: 'exp1', targetEntityId: 'case_1', expectedAction: 'owner_response', createdAtDay: 4, weight: 10 }
    ];

    const result = generateDailyNarrative({
      events: [], expectations, resolvedHooks: [], state: dummyState
    });

    expect(result.openingHook).toContain('像被冻住了一样');
    expect(result.openingHook).toContain('没有回复本身就是激烈的态度');
  });

  it('3. 伏笔引爆：如果有回收的悬念，将替代意外事件抛出', () => {
    const resolvedHooks: ForeshadowingHook[] = [
      { id: 'hook1', hookType: 'market_drop', sourceEventId: '', buryDay: 2, conditionToTrigger: '', expirationDay: 5, description: '隔壁小区挂牌价大幅下调' }
    ];

    const result = generateDailyNarrative({
      events: [], expectations: [], resolvedHooks, state: dummyState
    });

    expect(result.midTwist).toContain('昨日的隐患终于爆发');
    expect(result.midTwist).toContain('隔壁小区挂牌价大幅下调');
  });

  it('4. 最大情绪冲击优先：高 EIF 事件排在中段', () => {
    const events: DomainEventEntry[] = [
      { id: 'ev_small', day: 5, date: '', kind: 'journal', actor: '', title: '带看一次', detail: '', tone: 'accent', payload: {} },
      { id: 'ev_big', day: 5, date: '', kind: 'case_sold', actor: '', title: '直接成交', detail: '全款买入', tone: 'success', payload: {} }
    ];

    const result = generateDailyNarrative({
      events, expectations: [], resolvedHooks: [], state: dummyState
    });

    // ev_big EIF更高，应该被排到 midTwist
    expect(result.midTwist).toContain('直接成交');
    expect(result.lateUndercurrent).toContain('带看一次');
  });
});
