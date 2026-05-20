import { describe, expect, it } from 'vitest';
import {
  createEmptyAgentMemoryStore,
  normalizeAgentMemoryStore,
  selectAgentMemoryFacts,
  mergeAgentMemoryFacts,
} from '../agents/memoryStore.js';
import type { AgentMemoryFact } from '../agents/models.js';

describe('AgentMemoryStore', () => {
  it('should create empty store and normalize legacy inputs', () => {
    const store = createEmptyAgentMemoryStore();
    expect(store.facts).toEqual([]);

    const normalized = normalizeAgentMemoryStore(undefined);
    expect(normalized.facts).toEqual([]);

    const normalizedLegacy = normalizeAgentMemoryStore({
      facts: [
        {
          factId: 'f1',
          agentId: 'a1',
          kind: 'test',
          summary: 'some fact',
          strength: '0.8' as any, // legacy string strength
        },
      ],
    });
    expect(normalizedLegacy.facts[0].strength).toBe(0.8);
  });

  it('should filter facts correctly by query parameters', () => {
    const store = createEmptyAgentMemoryStore();
    const facts: AgentMemoryFact[] = [
      {
        factId: 'fact-1',
        agentId: 'wechat:owner-1',
        kind: 'test-kind',
        summary: 'Fact 1',
        strength: 0.9,
        expiresAtDay: 5,
        scope: { conversationKey: 'owner-1', caseId: 'case-1' },
      },
      {
        factId: 'fact-2',
        agentId: 'wechat:owner-1',
        kind: 'test-kind',
        summary: 'Fact 2',
        strength: 0.8,
        expiresAtDay: 10,
        scope: { conversationKey: 'owner-2', caseId: 'case-2' }, // different conversation
      },
      {
        factId: 'fact-3',
        agentId: 'wechat:owner-1',
        kind: 'test-kind',
        summary: 'Fact 3 (global)',
        strength: 0.7,
        expiresAtDay: 10,
        scope: { conversationKey: 'owner-1' }, // matches conversation
      },
      {
        factId: 'fact-4',
        agentId: 'wechat:owner-2',
        kind: 'test-kind',
        summary: 'Fact 4',
        strength: 0.95,
        expiresAtDay: 10,
        scope: { conversationKey: 'owner-1', caseId: 'case-1' }, // different agent ID but matches conversation & case
      },
    ];

    const updated = mergeAgentMemoryFacts(store, facts);

    // Query for owner-1 on case-1 at day 3
    const selected = selectAgentMemoryFacts(updated, {
      conversationKey: 'owner-1',
      caseId: 'case-1',
      channel: 'wechat',
      day: 3,
    });

    const selectedIds = selected.map((f) => f.factId);
    expect(selectedIds).toContain('fact-1');
    expect(selectedIds).toContain('fact-3'); // global fact matching conversationKey
    expect(selectedIds).toContain('fact-4'); // matches conversationKey, caseId and has no agentId constraint in query
    expect(selectedIds).not.toContain('fact-2'); // isolated conversation Key
  });

  it('should expire facts based on current day', () => {
    const store = createEmptyAgentMemoryStore();
    const facts: AgentMemoryFact[] = [
      {
        factId: 'f-exp',
        agentId: 'wechat:owner-1',
        kind: 'test',
        summary: 'Will expire',
        strength: 0.8,
        expiresAtDay: 5,
        scope: { conversationKey: 'owner-1' },
      },
      {
        factId: 'f-keep',
        agentId: 'wechat:owner-1',
        kind: 'test',
        summary: 'Will stay',
        strength: 0.8,
        expiresAtDay: 10,
        scope: { conversationKey: 'owner-1' },
      },
    ];

    const updated = mergeAgentMemoryFacts(store, facts);

    const activeAtDay4 = selectAgentMemoryFacts(updated, {
      conversationKey: 'owner-1',
      channel: 'wechat',
      day: 4,
    });
    expect(activeAtDay4.map((f) => f.factId)).toContain('f-exp');

    const activeAtDay6 = selectAgentMemoryFacts(updated, {
      conversationKey: 'owner-1',
      channel: 'wechat',
      day: 6,
    });
    expect(activeAtDay6.map((f) => f.factId)).not.toContain('f-exp');
    expect(activeAtDay6.map((f) => f.factId)).toContain('f-keep');
  });

  it('should limit store facts to prevent memory leaks', () => {
    const store = createEmptyAgentMemoryStore();
    const lotsOfFacts: AgentMemoryFact[] = [];
    for (let i = 0; i < 300; i++) {
      lotsOfFacts.push({
        factId: `fact-${i}`,
        agentId: 'wechat:owner-1',
        kind: 'leak-test',
        summary: `Fact number ${i}`,
        strength: 0.5,
      });
    }

    const updated = mergeAgentMemoryFacts(store, lotsOfFacts);
    expect(updated.facts.length).toBe(240); // MAX_STORE_FACTS
  });
});
