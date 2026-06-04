import { describe, expect, it } from 'vitest';
import { buildFallbackConversationEffectProposal } from '../wechatConversation.js';
import type { ConversationSceneInputPack } from '../../core/world-state/conversation/models.js';

function buildScene(overrides: Partial<ConversationSceneInputPack> = {}): ConversationSceneInputPack {
  return {
    sceneId: 'scene-test',
    runId: 'run-test',
    day: 7,
    conversationKey: 'owner:test',
    sourceMessageId: 'msg-test',
    sceneType: 'owner_wechat',
    playerText: '测试消息',
    sourceMessage: {
      messageId: 'msg-test',
      senderName: '张三',
      senderRole: 'owner',
      content: '测试内容',
      timeLabel: 'DAY 7',
      urgency: 'medium',
    },
    caseContext: {
      caseId: 'case-test',
      title: '测试小区 80㎡ 两房',
      ownerName: '张三',
      district: '浦东',
      community: '测试小区',
      askPrice: 500,
      marketPrice: 480,
      priceGapPct: 4,
      trust: 50,
      patience: 50,
      urgency: 50,
      heat: 50,
      competitiveness: 50,
      hasCompletedFirstVisit: true,
      ownerProfileLabel: '普通业主',
    },
    recentTurns: [],
    ...overrides,
  };
}

describe('fallbackReplyTable - hostile/offensive input', () => {
  it('returns hostile reply for offensive_reply risk in customer_wechat', () => {
    const scene = buildScene({ 
      sceneType: 'customer_wechat',
      playerText: '傻逼',
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toBe('你这个态度，我就先不跟你聊这套了。');
  });

  it('returns hostile reply for offensive_reply risk in manager_wechat', () => {
    const scene = buildScene({ 
      sceneType: 'manager_wechat',
      playerText: '傻逼',
      sourceMessage: {
        messageId: 'msg-test',
        senderName: '王经理',
        senderRole: 'district_manager',
        content: '测试内容',
        timeLabel: 'DAY 7',
        urgency: 'medium',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toBe('这个态度不行，先把客户和业主稳住。');
  });

  it('returns hostile reply for offensive_reply risk in owner_wechat', () => {
    const scene = buildScene({ 
      sceneType: 'owner_wechat', 
      playerText: '傻逼',
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toBe('你要是这个态度，那我没法继续信你了。');
  });

  it('returns hostile reply for hostile intent', () => {
    const scene = buildScene({ playerText: '爱咋咋地' });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toContain('态度');
  });
});

describe('fallbackReplyTable - secure_price_adjustment intent', () => {
  it('returns assertive reply with price ref', () => {
    const scene = buildScene({
      playerText: '调到450万吧',
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 500,
        marketPrice: 480,
        priceGapPct: 4,
        trust: 50,
        patience: 50,
        urgency: 50,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '强势业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toContain('450万');
    expect(proposal.recipientReply).toContain('依据');
  });

  it('returns assertive reply with high price gap', () => {
    const scene = buildScene({
      playerText: '调到450万吧',
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 600,
        marketPrice: 480,
        priceGapPct: 25,
        trust: 50,
        patience: 50,
        urgency: 50,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '强势业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toContain('凭什么调');
    expect(proposal.recipientReply).toContain('挂价600万');
  });

  it('returns anxious reply with price ref', () => {
    const scene = buildScene({
      playerText: '调到450万吧',
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 500,
        marketPrice: 480,
        priceGapPct: 4,
        trust: 50,
        patience: 50,
        urgency: 80,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '焦虑业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toContain('450万');
    expect(proposal.recipientReply).toContain('最怕调了也没用');
  });
});

describe('fallbackReplyTable - propose_face_visit intent', () => {
  it('returns assertive reply with time ref', () => {
    const scene = buildScene({
      playerText: '明天见面聊',
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 500,
        marketPrice: 480,
        priceGapPct: 4,
        trust: 50,
        patience: 50,
        urgency: 50,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '强势业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toContain('明天');
    expect(proposal.recipientReply).toContain('竞品数据');
  });

  it('returns default reply with time ref', () => {
    const scene = buildScene({
      playerText: '下午见面',
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 500,
        marketPrice: 480,
        priceGapPct: 4,
        trust: 50,
        patience: 50,
        urgency: 50,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '普通业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toContain('下午');
    expect(proposal.recipientReply).toContain('当面');
  });
});

describe('fallbackReplyTable - empty_comfort risk', () => {
  it('returns high urgency reply', () => {
    const scene = buildScene({
      playerText: '收到，先这样。',
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 500,
        marketPrice: 480,
        priceGapPct: 4,
        trust: 50,
        patience: 50,
        urgency: 80,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '普通业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.riskKinds).toContain('empty_comfort');
    expect(proposal.recipientReply).toContain('具体方案');
  });

  it('returns assertive reply', () => {
    const scene = buildScene({
      playerText: '收到，先这样。',
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 500,
        marketPrice: 480,
        priceGapPct: 4,
        trust: 50,
        patience: 50,
        urgency: 50,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '强势业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.riskKinds).toContain('empty_comfort');
    expect(proposal.recipientReply).toContain('具体怎么做');
  });
});

describe('fallbackReplyTable - ignores_customer risk', () => {
  it('returns reply that addresses ignored question', () => {
    const scene = buildScene({
      sceneType: 'customer_wechat',
      playerText: '我晚点联系您。',
      sourceMessage: {
        messageId: 'msg-test',
        senderName: '李四',
        senderRole: 'customer',
        content: '价格还能再低点吗？',
        timeLabel: 'DAY 7',
        urgency: 'medium',
      },
      opportunityContext: {
        opportunityId: 'opp-test',
        customerName: '李四',
        stage: '价格谈判',
        intent: 60,
        confidence: 50,
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toContain('窗口别错过');
    expect(proposal.recipientReply).toContain('李四');
  });
});

describe('fallbackReplyTable - manager scene', () => {
  it('returns manager reply for secure_price_adjustment', () => {
    const scene = buildScene({
      sceneType: 'manager_wechat',
      playerText: '调到450万吧',
      sourceMessage: {
        messageId: 'msg-test',
        senderName: '王经理',
        senderRole: 'district_manager',
        content: '业主要调价',
        timeLabel: 'DAY 7',
        urgency: 'medium',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toContain('调价的事你先别急');
    expect(proposal.recipientReply).toContain('市场数据');
  });

  it('returns manager reply for propose_face_visit with time ref', () => {
    const scene = buildScene({
      sceneType: 'manager_wechat',
      playerText: '明天面访',
      sourceMessage: {
        messageId: 'msg-test',
        senderName: '王经理',
        senderRole: 'district_manager',
        content: '安排面访',
        timeLabel: 'DAY 7',
        urgency: 'medium',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toContain('明天');
    expect(proposal.recipientReply).toContain('面访完');
  });

  it('returns manager reply for present_market_evidence without first visit', () => {
    const scene = buildScene({
      sceneType: 'manager_wechat',
      playerText: '竞品数据发您',
      sourceMessage: {
        messageId: 'msg-test',
        senderName: '王经理',
        senderRole: 'district_manager',
        content: '竞品数据',
        timeLabel: 'DAY 7',
        urgency: 'medium',
      },
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 500,
        marketPrice: 480,
        priceGapPct: 4,
        trust: 50,
        patience: 50,
        urgency: 50,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: false,
        ownerProfileLabel: '普通业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toContain('数据先放一边');
    expect(proposal.recipientReply).toContain('面访过');
  });
});

describe('fallbackReplyTable - fallback to neutral', () => {
  it('returns neutral variant when no rules match', () => {
    const scene = buildScene({
      playerText: '好的',
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 500,
        marketPrice: 480,
        priceGapPct: 4,
        trust: 50,
        patience: 50,
        urgency: 50,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '普通业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toBeDefined();
    expect(proposal.recipientReply.length).toBeGreaterThan(0);
  });
});

describe('fallbackReplyTable - discuss_price intent', () => {
  it('returns assertive reply with price ref', () => {
    const scene = buildScene({
      playerText: '450万可以谈',
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 500,
        marketPrice: 480,
        priceGapPct: 4,
        trust: 50,
        patience: 50,
        urgency: 50,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '强势业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toBeDefined();
    expect(proposal.recipientReply.length).toBeGreaterThan(0);
  });

  it('returns default reply without price ref', () => {
    const scene = buildScene({
      playerText: '价格可以谈',
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 500,
        marketPrice: 480,
        priceGapPct: 4,
        trust: 50,
        patience: 50,
        urgency: 50,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '普通业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toContain('价格可以谈');
    expect(proposal.recipientReply).toContain('真实出价');
  });
});

describe('fallbackReplyTable - present_market_evidence intent', () => {
  it('returns reply for no first visit with action data', () => {
    const scene = buildScene({
      playerText: '竞品数据发您',
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 500,
        marketPrice: 480,
        priceGapPct: 4,
        trust: 50,
        patience: 50,
        urgency: 50,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: false,
        ownerProfileLabel: '普通业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toContain('面访过');
    expect(proposal.recipientReply).toContain('先来一趟');
  });

  it('returns reply for low trust', () => {
    const scene = buildScene({
      playerText: '竞品数据发您',
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 500,
        marketPrice: 480,
        priceGapPct: 4,
        trust: 30,
        patience: 50,
        urgency: 50,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '普通业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toContain('有出入');
    expect(proposal.recipientReply).toContain('具体数据才信你');
  });
});

describe('fallbackReplyTable - follow_customer intent', () => {
  it('returns reply with customer name and high intent', () => {
    const scene = buildScene({
      sceneType: 'customer_wechat',
      playerText: '客户意向不错',
      sourceMessage: {
        messageId: 'msg-test',
        senderName: '王经纪人',
        senderRole: 'broker',
        content: '客户意向不错',
        timeLabel: 'DAY 7',
        urgency: 'medium',
      },
      opportunityContext: {
        opportunityId: 'opp-test',
        customerName: '李四',
        stage: '价格谈判',
        intent: 80,
        confidence: 70,
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toContain('李四');
    expect(proposal.recipientReply).toContain('意向不错');
  });

  it('returns reply with time ref', () => {
    const scene = buildScene({
      sceneType: 'customer_wechat',
      playerText: '明天确认',
      sourceMessage: {
        messageId: 'msg-test',
        senderName: '王经纪人',
        senderRole: 'broker',
        content: '客户意向不错',
        timeLabel: 'DAY 7',
        urgency: 'medium',
      },
      opportunityContext: {
        opportunityId: 'opp-test',
        customerName: '李四',
        stage: '价格谈判',
        intent: 50,
        confidence: 50,
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toContain('明天');
    expect(proposal.recipientReply).toBeDefined();
    expect(proposal.recipientReply.length).toBeGreaterThan(0);
  });
});

describe('fallbackReplyTable - promise_feedback intent', () => {
  it('returns reply for low trust with action feedback', () => {
    const scene = buildScene({
      playerText: '我反馈一下情况',
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 500,
        marketPrice: 480,
        priceGapPct: 4,
        trust: 30,
        patience: 50,
        urgency: 50,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '普通业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toContain('具体动作');
    expect(proposal.recipientReply).toContain('不只是口头');
  });

  it('returns reply with time ref', () => {
    const scene = buildScene({
      playerText: '我今天发您',
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toContain('今天');
    expect(proposal.recipientReply).toContain('结果发我');
  });
});

describe('fallbackReplyTable - align_manager intent', () => {
  it('returns reply with action feedback', () => {
    const scene = buildScene({
      sceneType: 'manager_wechat',
      playerText: '情况已经反馈了',
      sourceMessage: {
        messageId: 'msg-test',
        senderName: '王经理',
        senderRole: 'district_manager',
        content: '测试内容',
        timeLabel: 'DAY 7',
        urgency: 'medium',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.recipientReply).toContain('收到');
    expect(proposal.recipientReply).toContain('情况和风险点');
  });
});

describe('fallbackReplyTable - overpromise risk', () => {
  it('returns reply about overpromise', () => {
    const scene = buildScene({
      playerText: '保证能卖出去',
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.riskKinds).toContain('overpromise');
    expect(proposal.recipientReply).toContain('太绝对了');
    expect(proposal.recipientReply).toContain('更稳妥的方案');
  });
});

describe('fallbackReplyTable - missing_next_step risk', () => {
  it('returns assertive reply for missing next step', () => {
    const scene = buildScene({
      playerText: '方向是对的',
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 500,
        marketPrice: 480,
        priceGapPct: 4,
        trust: 50,
        patience: 50,
        urgency: 50,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '强势业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.riskKinds).toContain('missing_next_step');
    expect(proposal.recipientReply).toContain('下一步做什么你没说');
    expect(proposal.recipientReply).toContain('明确动作和时间点');
  });

  it('returns default reply for missing next step', () => {
    const scene = buildScene({
      playerText: '方向是对的',
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 500,
        marketPrice: 480,
        priceGapPct: 4,
        trust: 50,
        patience: 50,
        urgency: 50,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '普通业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.riskKinds).toContain('missing_next_step');
    expect(proposal.recipientReply).toContain('下一步做什么你没说');
    expect(proposal.recipientReply).toContain('明确动作');
  });
});

describe('fallbackReplyTable - reassure intent with empty_comfort', () => {
  it('returns empty_comfort reply for low trust', () => {
    const scene = buildScene({
      playerText: '收到，先这样。',
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 500,
        marketPrice: 480,
        priceGapPct: 4,
        trust: 30,
        patience: 50,
        urgency: 50,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '普通业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.riskKinds).toContain('empty_comfort');
    expect(proposal.recipientReply).toContain('不够具体');
    expect(proposal.recipientReply).toContain('下一步怎么做');
  });

  it('returns empty_comfort reply for anxious owner', () => {
    const scene = buildScene({
      playerText: '收到，先这样。',
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 500,
        marketPrice: 480,
        priceGapPct: 4,
        trust: 50,
        patience: 50,
        urgency: 80,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '焦虑业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.riskKinds).toContain('empty_comfort');
    expect(proposal.recipientReply).toContain('具体方案');
    expect(proposal.recipientReply).toContain('不是安慰');
  });

  it('returns empty_comfort reply for default', () => {
    const scene = buildScene({
      playerText: '收到，先这样。',
      caseContext: {
        caseId: 'case-test',
        title: '测试小区 80㎡ 两房',
        ownerName: '张三',
        district: '浦东',
        community: '测试小区',
        askPrice: 500,
        marketPrice: 480,
        priceGapPct: 4,
        trust: 50,
        patience: 50,
        urgency: 50,
        heat: 50,
        competitiveness: 50,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '普通业主',
      },
    });
    const proposal = buildFallbackConversationEffectProposal(scene);
    expect(proposal.riskKinds).toContain('empty_comfort');
    expect(proposal.recipientReply).toContain('不够具体');
    expect(proposal.recipientReply).toContain('下一步怎么做');
  });
});
