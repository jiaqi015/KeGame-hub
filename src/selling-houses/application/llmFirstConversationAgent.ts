import type { ConversationSceneInputPack } from '../core/world-state/conversation/models.js';
import type { GameState } from '../domain/models.js';

export interface ConversationMemory {
  readonly conversationKey: string;
  readonly turns: readonly MemoryTurn[];
  readonly promises: readonly PromiseRecord[];
  readonly relationshipScore: number;
  readonly lastInteractionDay: number;
}

export interface MemoryTurn {
  readonly day: number;
  readonly playerText: string;
  readonly recipientReply: string;
  readonly emotion: string;
  readonly topic: string;
}

export interface PromiseRecord {
  readonly day: number;
  readonly promise: string;
  readonly fulfilled: boolean;
  readonly deadline?: string;
}

export interface PersonalityProfile {
  readonly archetype: 'anxious' | 'assertive' | 'pragmatic' | 'emotional' | 'rational';
  readonly communicationStyle: 'direct' | 'diplomatic' | 'empathetic' | 'analytical';
  readonly trustThreshold: number;
  readonly patienceThreshold: number;
  readonly urgencyThreshold: number;
}

export interface ConversationStrategy {
  readonly goal: 'build_trust' | 'push_price' | 'schedule_visit' | 'gather_info' | 'de_escalate' | 'maintain';
  readonly tone: 'empathetic' | 'assertive' | 'reassuring' | 'urgent' | 'neutral';
  readonly nextAction: string;
  readonly reasoning: string;
}

export interface LlmConversationProposal {
  readonly reply: string;
  readonly strategy: ConversationStrategy;
  readonly confidence: number;
  readonly reasoning: string;
}

export function buildLlmFirstProposal(
  scene: ConversationSceneInputPack,
  state?: GameState,
  memory?: ConversationMemory,
): LlmConversationProposal {
  const personality = resolvePersonality(scene);
  const resolvedMemory = memory || (state ? buildConversationMemory(scene.conversationKey || '', state) : undefined);
  const strategy = reasonStrategy(scene, personality, resolvedMemory);
  const reply = generateReply(scene, personality, strategy, resolvedMemory);

  return {
    reply,
    strategy,
    confidence: calculateConfidence(scene, strategy),
    reasoning: `${personality.archetype}型业主，目标：${strategy.goal}，策略：${strategy.reasoning}`,
  };
}

function resolvePersonality(scene: ConversationSceneInputPack): PersonalityProfile {
  const label = scene.caseContext?.ownerProfileLabel || '';
  const trust = scene.caseContext?.trust ?? 50;
  const patience = scene.caseContext?.patience ?? 50;
  const urgency = scene.caseContext?.urgency ?? 50;

  if (/焦虑/.test(label) || urgency >= 70) {
    return { archetype: 'anxious', communicationStyle: 'empathetic', trustThreshold: 40, patienceThreshold: 30, urgencyThreshold: 70 };
  }
  if (/强势/.test(label) || (trust >= 60 && patience < 40)) {
    return { archetype: 'assertive', communicationStyle: 'direct', trustThreshold: 50, patienceThreshold: 40, urgencyThreshold: 60 };
  }
  if (/理性/.test(label) || (trust >= 50 && urgency < 50)) {
    return { archetype: 'rational', communicationStyle: 'analytical', trustThreshold: 50, patienceThreshold: 50, urgencyThreshold: 50 };
  }
  if (trust < 35) {
    return { archetype: 'emotional', communicationStyle: 'empathetic', trustThreshold: 35, patienceThreshold: 30, urgencyThreshold: 60 };
  }
  return { archetype: 'pragmatic', communicationStyle: 'diplomatic', trustThreshold: 50, patienceThreshold: 50, urgencyThreshold: 50 };
}

function reasonStrategy(
  scene: ConversationSceneInputPack,
  personality: PersonalityProfile,
  memory?: ConversationMemory,
): ConversationStrategy {
  const trust = scene.caseContext?.trust ?? 50;
  const urgency = scene.caseContext?.urgency ?? 50;
  const patience = scene.caseContext?.patience ?? 50;
  const playerText = scene.playerText || '';

  // Goal selection based on state
  if (trust < personality.trustThreshold) {
    return {
      goal: 'build_trust',
      tone: 'empathetic',
      nextAction: '承认问题，给出具体行动',
      reasoning: `信任度${trust}低于阈值${personality.trustThreshold}，需要重建信任`,
    };
  }

  if (urgency >= personality.urgencyThreshold) {
    return {
      goal: 'push_price',
      tone: 'urgent',
      nextAction: '给出具体方案和时间表',
      reasoning: `紧迫度${urgency}高于阈值${personality.urgencyThreshold}，需要推动行动`,
    };
  }

  if (/面访|见面|上门/.test(playerText)) {
    return {
      goal: 'schedule_visit',
      tone: 'reassuring',
      nextAction: '确认时间，准备数据',
      reasoning: '玩家提到面访，推进安排',
    };
  }

  if (/价格|调价|降价/.test(playerText)) {
    return {
      goal: 'push_price',
      tone: 'assertive',
      nextAction: '给出市场依据',
      reasoning: '玩家提到价格，需要数据支撑',
    };
  }

  if (patience < personality.patienceThreshold) {
    return {
      goal: 'de_escalate',
      tone: 'empathetic',
      nextAction: '安抚情绪，给出明确时间表',
      reasoning: `耐心度${patience}低于阈值${personality.patienceThreshold}，需要安抚`,
    };
  }

  if (memory && memory.relationshipScore < 40) {
    return {
      goal: 'build_trust',
      tone: 'empathetic',
      nextAction: '回顾之前的承诺，给出进展',
      reasoning: `关系分${memory.relationshipScore}，需要加强关系`,
    };
  }

  return {
    goal: 'maintain',
    tone: 'neutral',
    nextAction: '保持联系，同步进展',
    reasoning: '状态稳定，维持关系',
  };
}

function generateReply(
  scene: ConversationSceneInputPack,
  personality: PersonalityProfile,
  strategy: ConversationStrategy,
  memory?: ConversationMemory,
): string {
  const senderName = scene.sourceMessage.senderName;
  const caseRef = scene.caseContext?.title ? `${scene.caseContext.title}这套` : '这套房';
  const community = scene.caseContext?.community || '';
  const trust = scene.caseContext?.trust ?? 50;
  const urgency = scene.caseContext?.urgency ?? 50;

  // Build reply based on strategy
  const parts: string[] = [];

  // Acknowledgment
  parts.push(getAcknowledgment(strategy.tone, personality));

  // Context reference
  if (community) {
    parts.push(`${community}的情况我了解`);
  }

  // Strategy-specific content
  switch (strategy.goal) {
    case 'build_trust':
      parts.push(getTrustBuildingContent(trust, personality, memory));
      break;
    case 'push_price':
      parts.push(getPriceContent(scene, personality));
      break;
    case 'schedule_visit':
      parts.push(getVisitContent(scene, personality));
      break;
    case 'de_escalate':
      parts.push(getDeEscalationContent(personality, memory));
      break;
    case 'gather_info':
      parts.push('我需要你帮我补充一些关键信息');
      break;
    case 'maintain':
      parts.push(getMaintainContent(scene));
      break;
  }

  // Next action
  parts.push(strategy.nextAction);

  // Assemble
  const body = parts.filter(Boolean).join('，');
  return `${senderName}：${body}。`;
}

function getAcknowledgment(tone: string, personality: PersonalityProfile): string {
  switch (tone) {
    case 'empathetic': return '我理解你的感受';
    case 'assertive': return '收到';
    case 'reassuring': return '没问题';
    case 'urgent': return '这事得抓紧';
    default: return '收到';
  }
}

function getTrustBuildingContent(trust: number, personality: PersonalityProfile, memory?: ConversationMemory): string {
  if (memory && memory.promises.length > 0) {
    const unfulfilled = memory.promises.filter(p => !p.fulfilled);
    if (unfulfilled.length > 0) {
      return `之前说的${unfulfilled[0].promise}我在推进`;
    }
  }
  if (trust < 25) {
    return '之前有些地方没做到位，我今天用实际行动来证明';
  }
  return '我今天把真实情况给你讲清楚';
}

function getPriceContent(scene: ConversationSceneInputPack, personality: PersonalityProfile): string {
  const askPrice = scene.caseContext?.askPrice ?? 0;
  const marketPrice = scene.caseContext?.marketPrice ?? 0;
  if (askPrice > 0 && marketPrice > 0) {
    return `挂价${askPrice}万，市场价大概${marketPrice}万，差距我帮你分析`;
  }
  return '价格的事我帮你做个对比分析';
}

function getVisitContent(scene: ConversationSceneInputPack, personality: PersonalityProfile): string {
  const hasVisited = scene.caseContext?.hasCompletedFirstVisit ?? false;
  if (!hasVisited) {
    return '面访是关键，我帮你安排时间';
  }
  return '面访的情况我帮你整理';
}

function getDeEscalationContent(personality: PersonalityProfile, memory?: ConversationMemory): string {
  return '你的顾虑我收到了，今天给你一个明确方案';
}

function getMaintainContent(scene: ConversationSceneInputPack): string {
  const caseRef = scene.caseContext?.title ? `${scene.caseContext.title}这套` : '这套房';
  return `${caseRef}的情况我在持续跟进`;
}

function calculateConfidence(scene: ConversationSceneInputPack, strategy: ConversationStrategy): number {
  let confidence = 0.7;
  const trust = scene.caseContext?.trust ?? 50;
  const urgency = scene.caseContext?.urgency ?? 50;

  // Higher confidence for clear situations
  if (trust < 30 || urgency >= 80) confidence += 0.1;
  if (strategy.goal !== 'maintain') confidence += 0.1;

  return Math.min(1, confidence);
}

export function buildConversationMemory(
  conversationKey: string,
  state: GameState,
): ConversationMemory {
  const history = (state as any).wechatConversationHistory || [];
  const relevantHistory = history.filter((h: any) => h.conversationKey === conversationKey);

  const turns: MemoryTurn[] = relevantHistory.slice(-5).map((h: any) => ({
    day: h.day || 0,
    playerText: h.playerText || '',
    recipientReply: h.recipientReply || '',
    emotion: h.emotion || 'neutral',
    topic: h.topic || 'general',
  }));

  const promises: PromiseRecord[] = relevantHistory
    .filter((h: any) => /今天|明天|下午|这周/.test(h.recipientReply || ''))
    .slice(-3)
    .map((h: any) => ({
      day: h.day || 0,
      promise: (h.recipientReply || '').match(/(今天|明天|下午|这周).{0,20}/)?.[0] || '',
      fulfilled: false,
    }));

  const relationshipScore = turns.length > 0
    ? Math.min(100, 50 + turns.length * 5)
    : 50;

  return {
    conversationKey,
    turns,
    promises,
    relationshipScore,
    lastInteractionDay: turns.length > 0 ? turns[turns.length - 1].day : 0,
  };
}
