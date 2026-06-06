import { describe, it, expect } from 'vitest';
import { generateInitialMessage } from '../intelligentMessageGenerator.js';
import type { WechatFact } from '../projections/myWechatTypes.js';
import type { GameState } from '../../domain/models.js';

function makeFact(overrides: Partial<WechatFact> = {}): WechatFact {
  return {
    id: 'fact-1',
    type: 'owner_no_showing',
    source: 'owner_state',
    day: 3,
    priority: 10,
    reason: '业主没有带看反馈',
    caseId: 'case-1',
    ownerName: '王姐',
    senderRole: 'owner',
    senderName: '王姐',
    caseTitle: '天山花园3房',
    community: '天山花园',
    district: '长宁',
    ...overrides,
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    runId: 'test-run',
    day: 3,
    cases: [{
      id: 'case-1',
      title: '天山花园3房',
      ownerName: '王姐',
      trust: 50,
      patience: 50,
      urgency: 50,
      askPrice: 680,
      marketPrice: 620,
      priceGapPct: 9.7,
      district: '长宁',
      community: '天山花园',
      personality: 'pragmatic',
    } as any],
    ...overrides,
  } as GameState;
}

describe('generateInitialMessage', () => {
  it('generates message with owner name', () => {
    const msg = generateInitialMessage(makeFact(), makeState());
    expect(msg).toContain('王姐');
  });

  it('generates message with case reference', () => {
    const msg = generateInitialMessage(makeFact(), makeState());
    expect(msg).toContain('天山花园');
  });

  it('generates different messages for different owner personalities', () => {
    const fact = makeFact();
    const anxiousState = makeState();
    const anxiousCase = anxiousState.cases[0] as any;
    anxiousCase.urgency = 85;
    anxiousCase.trust = 25;
    const calmState = makeState();
    const calmCase = calmState.cases[0] as any;
    calmCase.urgency = 30;
    calmCase.trust = 70;

    const msg1 = generateInitialMessage(fact, anxiousState);
    const msg2 = generateInitialMessage(fact, calmState);

    expect(msg1).not.toBe(msg2);
  });

  it('generates different messages for different fact types', () => {
    const noShowingFact = makeFact({ type: 'owner_no_showing' });
    const priceDoubtFact = makeFact({ type: 'owner_price_doubt' });
    const state = makeState();

    const msg1 = generateInitialMessage(noShowingFact, state);
    const msg2 = generateInitialMessage(priceDoubtFact, state);

    expect(msg1).not.toBe(msg2);
  });

  it('reflects urgency in message for anxious owners', () => {
    const fact = makeFact({ type: 'owner_urgent' });
    const state = makeState();
    const caseItem = state.cases[0] as any;
    caseItem.urgency = 85;
    caseItem.patience = 15;

    const msg = generateInitialMessage(fact, state);
    expect(msg.length).toBeGreaterThan(10);
  });

  it('handles customer facts', () => {
    const fact = makeFact({
      type: 'customer_comparing',
      senderRole: 'customer',
      senderName: '李先生',
      customerName: '李先生',
    });
    const state = makeState();

    const msg = generateInitialMessage(fact, state);
    expect(msg).toContain('李先生');
  });

  it('generates unique messages across calls with different seeds', () => {
    const fact = makeFact();
    const state = makeState();
    const messages = new Set<string>();

    for (let i = 0; i < 10; i++) {
      messages.add(generateInitialMessage(fact, state, `seed-${i}`));
    }

    expect(messages.size).toBeGreaterThan(1);
  });

  it('message is not empty and has reasonable length', () => {
    const fact = makeFact();
    const state = makeState();
    const msg = generateInitialMessage(fact, state);

    expect(msg.length).toBeGreaterThan(15);
    expect(msg.length).toBeLessThan(200);
  });
});
