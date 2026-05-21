import { describe, expect, it } from 'vitest';
import {
  buildConversationMemoryWriteback,
} from '../agents/conversationMemory.js';
import {
  createEmptyAgentMemoryStore,
  mergeAgentMemoryFacts,
} from '../agents/memoryStore.js';
import type { ConversationReceipt } from '../conversation/models.js';

function buildReceipt(overrides: Partial<ConversationReceipt> = {}): ConversationReceipt {
  return {
    receiptId: 'receipt-1',
    conversationKey: 'owner:shaonvshi',
    sourceMessageId: 'msg-1',
    day: 7,
    turnIndex: 1,
    sceneType: 'owner_wechat',
    actorName: '邵女士',
    actorRole: 'owner',
    playerText: '下午我把客户反馈和竞品价格当面说清楚。',
    recipientReply: '好，你把客户反馈和竞品价格摊开说。',
    summary: '这轮对话把节奏往前推了一点。',
    proposal: {
      summary: '这轮对话把节奏往前推了一点。',
      recipientReply: '好，你把客户反馈和竞品价格摊开说。',
      intentKinds: ['present_market_evidence'],
      riskKinds: ['missing_next_step'],
      evidenceUse: 'specific',
      trustDelta: -2,
      patienceDelta: -1,
      urgencyDelta: 2,
      priceFlexibilityDelta: 0,
      customerIntentDelta: 0,
      customerConfidenceDelta: 0,
      nextStep: {
        kind: 'schedule_face_visit',
        actionId: 'first-visit',
        label: '安排面访',
        reason: '当面把客户反馈、竞品和价格说清楚。',
        priority: 'high',
      },
      confidence: 0.8,
    },
    settlement: {
      trustDelta: -2,
      patienceDelta: -1,
      urgencyDelta: 2,
      priceFlexibilityDelta: 0,
      customerIntentDelta: 0,
      customerConfidenceDelta: 0,
      effectLabels: ['关系受损', '催促更强', '安排面访'],
    },
    nextSteps: [
      {
        kind: 'schedule_face_visit',
        actionId: 'first-visit',
        label: '安排面访',
        reason: '当面把客户反馈、竞品和价格说清楚。',
        priority: 'high',
      },
    ],
    source: 'ai',
    ...overrides,
  };
}

describe('conversation memory writeback', () => {
  it('compresses one dialogue round into localized memory facts', () => {
    const writeback = buildConversationMemoryWriteback({
      receipt: buildReceipt(),
    });

    const summaries = writeback.facts.map((fact) => fact.summary).join('\n');

    expect(summaries).toContain('未消化风险：缺少下一步');
    expect(summaries).toContain('已兑现下一步：安排面访');
    expect(summaries).toContain('当前态度：');
    expect(summaries).toContain('本轮关系变化：');
    expect(writeback.summary).toContain('缺少下一步');
    expect(writeback.summary).not.toContain('missing_next_step');
  });

  it('uses the same agentId shape as the WeChat runtime', () => {
    const writeback = buildConversationMemoryWriteback({
      receipt: buildReceipt(),
    });

    expect(writeback.facts.every((fact) => fact.agentId === 'wechat:owner:shaonvshi')).toBe(true);
  });

  it('keeps a no-next-step round as an explicit unresolved memory fact', () => {
    const writeback = buildConversationMemoryWriteback({
      receipt: buildReceipt({
        nextSteps: [],
        proposal: {
          ...buildReceipt().proposal,
          riskKinds: ['none'],
          nextStep: { kind: 'none', label: '继续观察', reason: '暂无后续动作。', priority: 'low' },
        },
        settlement: {
          ...buildReceipt().settlement,
          effectLabels: ['关系稳定'],
        },
      }),
    });

    expect(writeback.facts.map((fact) => fact.kind)).toContain('next_step_unfulfilled');
    expect(writeback.facts.map((fact) => fact.summary)).toContain('未兑现下一步：本轮没有明确动作');
  });

  it('emits stable fact ids so repeated merges do not duplicate memory', () => {
    const first = buildConversationMemoryWriteback({
      receipt: buildReceipt(),
    });
    const second = buildConversationMemoryWriteback({
      receipt: buildReceipt(),
    });

    expect(new Set(first.facts.map((fact) => fact.factId)).size).toBe(first.facts.length);

    const merged = mergeAgentMemoryFacts(
      mergeAgentMemoryFacts(createEmptyAgentMemoryStore(), first.facts),
      second.facts,
    );

    expect(merged.facts.length).toBe(first.facts.length);
  });
});
