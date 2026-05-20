import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import {
  buildFallbackConversationEffectProposal,
  buildWechatConversationScenePack,
} from '../src/selling-houses/application/wechatConversation.js';
import { sendWechatConversationReply } from '../src/selling-houses/application/gameTransitions.js';
import type { WechatMessage } from '../src/selling-houses/application/projections/myWechatTypes.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

const snapshot = getScenarioSnapshotById('standard-window-chain');
assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

const state = createInitialState(snapshot, 91919);
seedInitialOpportunities(state);
updateDerivedState(state);

const caseItem = state.cases.find((entry) => entry.status === 'active');
assert.ok(caseItem, 'Expected an active case');

const message: WechatMessage = {
  id: 'verify-agent-memory-owner-message',
  senderName: caseItem.ownerName,
  senderRole: 'owner',
  avatarLabel: caseItem.ownerName.slice(0, 1),
  content: `${caseItem.ownerName}：今天能不能给个明确方案，别只是说再等等。`,
  preview: '今天能不能给个明确方案',
  timeLabel: '今天',
  unread: true,
  urgency: 'high',
  targetCaseId: caseItem.id,
  targetCaseTitle: caseItem.title,
  primaryActionId: 'first-visit',
  primaryCtaLabel: '安排面访',
  sourceTrace: {
    source: 'case',
    factType: 'owner_urgent',
    caseId: caseItem.id,
    reason: '验证 agent memory harness',
  },
};

const conversationKey = `${message.senderRole}:${message.senderName}`;
const firstScene = buildWechatConversationScenePack(state, {
  conversationKey,
  message,
  playerText: '我下午当面把客户反馈、同类竞品和价格方案一起给您讲清楚，不让您继续空等。',
});
assert.equal(firstScene.agentMemory?.length || 0, 0, 'First turn should start without persisted agent memory');

const result = sendWechatConversationReply(state, {
  conversationKey,
  message,
  playerText: firstScene.playerText,
  proposal: buildFallbackConversationEffectProposal(firstScene),
  proposalSource: 'fallback',
});

assert.ok(result.success, result.reason);
assert.ok(result.nextState.agentMemoryStore?.facts.length, 'Expected conversation receipt to write agent memory facts');

const nextScene = buildWechatConversationScenePack(result.nextState, {
  conversationKey,
  message: {
    ...message,
    id: 'verify-agent-memory-owner-message-2',
    content: `${caseItem.ownerName}：那你下午具体怎么安排？`,
  },
  playerText: '我先约您下午四点，见面时按客户反馈、竞品对比和价格选择三块讲。',
});

assert.ok(nextScene.agentMemory?.length, 'Expected next scene to retrieve persisted agent memory');
assert.ok(
  nextScene.agentMemory?.some((fact) => fact.kind === 'active_next_step' || fact.kind === 'recent_interaction'),
  'Expected retrieved memory to include active next step or recent interaction',
);

console.log('OK selling-houses agent memory harness', {
  memoryFacts: result.nextState.agentMemoryStore?.facts.length,
  nextSceneMemory: nextScene.agentMemory?.map((fact) => fact.kind),
});
