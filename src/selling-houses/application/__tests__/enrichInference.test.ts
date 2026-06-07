import { describe, it, expect } from 'vitest';
import { buildFallbackConversationEffectProposal, sanitizeWechatPlayerText } from '../wechatConversation.js';
import type { ConversationSceneInputPack } from '../../core/world-state/conversation/models.js';

function buildPack(overrides: Partial<ConversationSceneInputPack> = {}): ConversationSceneInputPack {
  return {
    sceneId: 'test', runId: 'run', day: 1,
    conversationKey: 'owner:test', sourceMessageId: 'msg-1',
    sceneType: 'owner_wechat', playerText: '',
    recentTurns: [],
    ...overrides,
    caseContext: { ...{ caseId: 'case-1', title: '天山花园3房', ownerName: '王姐', district: '长宁', community: '天山花园', askPrice: 680, marketPrice: 620, priceGapPct: 9.7, trust: 50, patience: 50, urgency: 50, heat: 60, competitiveness: 55, hasCompletedFirstVisit: true, ownerProfileLabel: '焦虑型' }, ...(overrides.caseContext || {}) },
    sourceMessage: { ...{ messageId: 'msg-1', senderName: '王姐', senderRole: 'owner', content: '测试', timeLabel: '14:30', urgency: 'medium' }, ...(overrides.sourceMessage || {}) },
  } as ConversationSceneInputPack;
}

function getReply(scene: ConversationSceneInputPack): string {
  const proposal = buildFallbackConversationEffectProposal(scene);
  return proposal.recipientReply;
}

describe('enrichInference - 言外之意推理', () => {
  it('竞争对手报价 → 回复应包含竞品/市场/依据', () => {
    const reply = getReply(buildPack({ playerText: sanitizeWechatPlayerText('隔壁中介说能卖700万') }));
    expect(reply).toMatch(/竞品|市场|依据|数据|对比|真实|判断/);
  });

  it('家人犹豫 → 回复应包含差异化/优势/对比', () => {
    const reply = getReply(buildPack({ playerText: sanitizeWechatPlayerText('我家里人觉得另一套也可以') }));
    expect(reply).toMatch(/优势|差异|对比|特点|卖点|别的/);
  });

  it('挂了很久 → 回复应包含调整/方案/策略', () => {
    const reply = getReply(buildPack({ playerText: sanitizeWechatPlayerText('挂了三个月了还没卖出去') }));
    expect(reply).toMatch(/调整|方案|策略|改变|新|动/);
  });

  it('价格怀疑 → 回复应包含价格/市场/数据', () => {
    const reply = getReply(buildPack({ playerText: sanitizeWechatPlayerText('这个价格到底有没有机会？') }));
    expect(reply).toMatch(/价格|市场|数据|万|成交/);
  });

  it('时间压力 → 回复应包含今天/明天/尽快', () => {
    const reply = getReply(buildPack({ caseContext: { urgency: 85 } as any, playerText: sanitizeWechatPlayerText('家里人一直催我') }));
    expect(reply).toMatch(/今天|明天|尽快|抓紧|马上/);
  });

  it('信任质疑 → 回复应包含理解/依据/事实', () => {
    const reply = getReply(buildPack({ caseContext: { trust: 20 } as any, playerText: sanitizeWechatPlayerText('你之前说的和实际有出入') }));
    expect(reply).toMatch(/理解|依据|事实|真实|具体/);
  });

  it('市场担忧 → 回复应包含市场/趋势/分析', () => {
    const reply = getReply(buildPack({ playerText: sanitizeWechatPlayerText('市场会不会继续跌？') }));
    expect(reply).toMatch(/市场|趋势|分析|判断|数据/);
  });

  it('竞品比较 → 回复应包含竞品/价格/对比', () => {
    const reply = getReply(buildPack({ playerText: sanitizeWechatPlayerText('隔壁那套是不是价格低一些？') }));
    expect(reply).toMatch(/竞品|价格|对比|市场|差异/);
  });
});
