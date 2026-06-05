import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArrangementItemProjection, ArrangementProjection } from '../../../application/projections/operatingProjection.js';
import type { GameState } from '../../../domain/models.js';
import {
  AI_ARRANGEMENT_THINKING_STEPS,
  buildAiArrangementProposal,
  resolveAiArrangementAdoptableItems,
} from '../aiArrangement.js';
import { fetchAiArrangementProposal } from '../aiArrangementClient.js';

function candidate(overrides: Partial<ArrangementItemProjection>): ArrangementItemProjection {
  return {
    id: 'candidate-1',
    source: 'candidate',
    slot: 'am',
    rank: 1,
    label: '优先',
    title: '瑞和里 89㎡ 两房 · 业主面访',
    detail: '业主正在催反馈，先把客户反馈和竞品价格讲清楚。',
    tone: 'risk',
    caseId: 'case-1',
    durationHours: 1,
    energyCost: 1,
    statusLabel: '可加入',
    actionId: 'owner-meeting',
    executionMode: 'scenario',
    ctaLabel: '加入上午',
    ...overrides,
  };
}

function arrangement(overrides: Partial<ArrangementProjection>): ArrangementProjection {
  return {
    headline: '待选：瑞和里 89㎡ 两房 · 业主面访',
    summary: '候选可排。',
    remainingEnergy: 2,
    remainingEnergyLabel: '可排余量 2/4 小时',
    plannedEnergy: 0,
    fixedEnergyReserve: 2,
    plannedEnergyLabel: '已排占用 0 · 固定预留 2',
    fixedItems: [],
    plannedItems: [],
    candidateItems: [],
    completedItems: [],
    weekFocusLabel: '本周暂无固定重点',
    slots: {
      am: { slot: 'am', label: '上午', fixedItems: [], plannedItems: [], candidateItems: [], completedItems: [] },
      pm: { slot: 'pm', label: '下午', fixedItems: [], plannedItems: [], candidateItems: [], completedItems: [] },
    },
    ...overrides,
  };
}

describe('ai arrangement frontend framework', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds one bounded proposal from enabled candidate actions', () => {
    const source = arrangement({
      remainingEnergy: 2,
      candidateItems: [
        candidate({ id: 'disabled', rank: 1, isDisabled: true, disabledReason: '上午已满' }),
        candidate({ id: 'owner-face', rank: 2, slot: 'pm', energyCost: 1, title: '瑞和里 89㎡ 两房 · 业主面访' }),
        candidate({ id: 'heavy', rank: 3, energyCost: 3, title: '星湖苑 118㎡ 三房 · 深度复盘' }),
        candidate({ id: 'customer-follow', rank: 4, energyCost: 1, title: '万航小区 63㎡ 一房 · 客户跟进' }),
      ],
    });

    const proposal = buildAiArrangementProposal({
      arrangement: source,
      day: 1,
      activeSlot: 'am',
    });

    expect(proposal.day).toBe(1);
    expect(proposal.drafts.map((draft) => draft.itemId)).toEqual(['owner-face', 'customer-follow']);
    expect(proposal.drafts.reduce((sum, draft) => sum + draft.energyCost, 0)).toBeLessThanOrEqual(2);
    expect(proposal.evidenceLabels).toContain('可排余量 2 小时');
    expect(proposal.headline).toContain('建议');
  });

  it('resolves adoptable items without trusting unknown, disabled, duplicated, or over-budget drafts', () => {
    const source = arrangement({
      remainingEnergy: 1,
      candidateItems: [
        candidate({ id: 'safe', slot: 'pm', energyCost: 1 }),
        candidate({ id: 'disabled', isDisabled: true, energyCost: 1 }),
        candidate({ id: 'too-heavy', energyCost: 2 }),
      ],
    });

    const resolved = resolveAiArrangementAdoptableItems({
      proposalId: 'proposal-1',
      day: 1,
      source: 'frontend-framework',
      confidence: 0.68,
      headline: '建议先排业主面访',
      summary: '把当前最急的一件事排进去。',
      evidenceLabels: [],
      drafts: [
        { itemId: 'missing', slot: 'am', title: '不存在', reason: 'unknown', energyCost: 1, durationHours: 1 },
        { itemId: 'disabled', slot: 'am', title: '禁用', reason: 'disabled', energyCost: 1, durationHours: 1 },
        { itemId: 'too-heavy', slot: 'am', title: '超量', reason: 'too heavy', energyCost: 2, durationHours: 2 },
        { itemId: 'safe', slot: 'pm', title: '可采纳', reason: 'safe', energyCost: 1, durationHours: 1 },
        { itemId: 'safe', slot: 'pm', title: '重复', reason: 'duplicate', energyCost: 1, durationHours: 1 },
      ],
    }, source);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.item.id).toBe('safe');
    expect(resolved[0]?.slot).toBe('pm');
  });

  it('keeps the thinking copy user-facing instead of exposing system internals', () => {
    const visibleCopy = AI_ARRANGEMENT_THINKING_STEPS.join(' ');

    expect(visibleCopy).not.toMatch(/fallback|LLM|模型|规则置信度|trace/i);
    expect(visibleCopy).toContain('今日');
  });

  it('posts the current game state and arrangement projection to the AI handler', async () => {
    const source = arrangement({
      remainingEnergy: 1,
      candidateItems: [candidate({ id: 'pm-follow-up', slot: 'pm', energyCost: 1 })],
    });
    const state = { day: 4 } as GameState;
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        ok: true,
        source: 'fallback',
        proposal: buildAiArrangementProposal({
          arrangement: source,
          day: 4,
          activeSlot: 'am',
        }),
      }),
    }));
    vi.stubGlobal('fetch', fetchSpy);

    await fetchAiArrangementProposal(state, source, 'am');

    const [, init] = fetchSpy.mock.calls[0] || [];
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.day).toBe(4);
    expect(body.currentSlot).toBe('am');
    expect(body.state.day).toBe(4);
    expect(body.arrangement.candidateItems[0].id).toBe('pm-follow-up');
  });

  it('falls back to the local planner instead of returning an empty suggestion after a handler failure', async () => {
    const source = arrangement({
      remainingEnergy: 1,
      candidateItems: [candidate({ id: 'urgent-owner', slot: 'pm', energyCost: 1 })],
    });
    const state = { day: 4 } as GameState;
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: false,
        source: 'fallback',
        proposal: {
          proposalId: 'server-empty',
          day: 4,
          source: 'fallback',
          confidence: 0.42,
          headline: '今天暂时不用再加安排',
          summary: '当前余量或候选动作不足，先处理已有安排。',
          evidenceLabels: [],
          drafts: [],
        },
        error: 'state_missing',
      }),
    })));

    const result = await fetchAiArrangementProposal(state, source, 'am');

    expect(result.proposal.drafts.map((draft) => draft.itemId)).toEqual(['urgent-owner']);
    expect(result.error).toBe('state_missing');
  });
});
