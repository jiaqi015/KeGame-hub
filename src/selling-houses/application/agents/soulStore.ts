import type { ParticipantSoul, ConversationMemory, CommunicationPattern, ParticipantSoulStore } from '../../core/world-state/agents/soul';
import { clamp } from '../../domain/utils';

export function initializeSoulFromCase(caseContext: {
  caseId: string;
  ownerName: string;
  ownerProfileLabel: string;
  trust: number;
  patience: number;
  urgency: number;
  priceGapPct: number;
}): ParticipantSoul {
  const isAssertive = /强势|硬控|控盘|博弈|自信/.test(caseContext.ownerProfileLabel);
  const isAnxious = /焦虑|急/.test(caseContext.ownerProfileLabel);

  return {
    participantId: `owner:${caseContext.caseId}:${caseContext.ownerName}`,
    ownerProfileLabel: caseContext.ownerProfileLabel,
    basePersonality: {
      assertiveness: isAssertive ? 80 : isAnxious ? 30 : 50,
      patience: caseContext.patience,
      trust倾向: caseContext.trust,
      priceSensitivity: caseContext.priceGapPct > 10 ? 80 : caseContext.priceGapPct > 5 ? 60 : 40,
    },
    emotionalState: {
      trust: caseContext.trust,
      patience: caseContext.patience,
      urgency: caseContext.urgency,
      mood: 'neutral',
    },
    conversationHistory: [],
    communicationPatterns: [],
  };
}

export function updateSoulAfterConversation(
  soul: ParticipantSoul,
  receipt: {
    day: number;
    playerText: string;
    recipientReply: string;
    settlement: { trustDelta: number; patienceDelta: number; urgencyDelta: number };
    proposal: { intentKinds: readonly string[]; riskKinds: readonly string[] };
  },
): ParticipantSoul {
  const newTrust = clamp(soul.emotionalState.trust + receipt.settlement.trustDelta, 0, 100);
  const newPatience = clamp(soul.emotionalState.patience + receipt.settlement.patienceDelta, 0, 100);
  const newUrgency = clamp(soul.emotionalState.urgency + receipt.settlement.urgencyDelta, 0, 100);

  let newMood: 'positive' | 'neutral' | 'negative' = 'neutral';
  if (receipt.settlement.trustDelta >= 3) newMood = 'positive';
  else if (receipt.settlement.trustDelta <= -3) newMood = 'negative';
  else if (soul.emotionalState.mood === 'negative' && receipt.settlement.trustDelta < 0) newMood = 'negative';

  const memory: ConversationMemory = {
    day: receipt.day,
    playerText: receipt.playerText.slice(0, 100),
    recipientReply: receipt.recipientReply.slice(0, 80),
    trustDelta: receipt.settlement.trustDelta,
    patienceDelta: receipt.settlement.patienceDelta,
    urgencyDelta: receipt.settlement.urgencyDelta,
    intents: receipt.proposal.intentKinds,
    risks: receipt.proposal.riskKinds,
  };

  const effectiveness = receipt.settlement.trustDelta / 5;
  const existingPattern = soul.communicationPatterns.find(
    p => p.intent === receipt.proposal.intentKinds[0],
  );

  let updatedPatterns: CommunicationPattern[];
  if (existingPattern) {
    const newCount = existingPattern.count + 1;
    const newEffectiveness = (existingPattern.effectiveness * existingPattern.count + effectiveness) / newCount;
    updatedPatterns = soul.communicationPatterns.map(p =>
      p.intent === receipt.proposal.intentKinds[0]
        ? { ...p, effectiveness: newEffectiveness, lastUsed: receipt.day, count: newCount }
        : p,
    );
  } else {
    updatedPatterns = [
      ...soul.communicationPatterns,
      {
        intent: receipt.proposal.intentKinds[0] || 'unknown',
        effectiveness,
        lastUsed: receipt.day,
        count: 1,
      },
    ];
  }

  return {
    ...soul,
    emotionalState: {
      trust: newTrust,
      patience: newPatience,
      urgency: newUrgency,
      mood: newMood,
    },
    conversationHistory: [...soul.conversationHistory, memory].slice(-10),
    communicationPatterns: updatedPatterns,
  };
}

export function buildSoulPromptLines(soul: ParticipantSoul): string[] {
  const lines: string[] = [];

  lines.push(`参与者 Soul：${soul.ownerProfileLabel}（${soul.participantId}）`);
  lines.push(`基础性格：强势=${soul.basePersonality.assertiveness}，耐心=${soul.basePersonality.patience}，信任倾向=${soul.basePersonality.trust倾向}，价格敏感=${soul.basePersonality.priceSensitivity}`);
  lines.push(`当前状态：trust=${soul.emotionalState.trust}，patience=${soul.emotionalState.patience}，urgency=${soul.emotionalState.urgency}，mood=${soul.emotionalState.mood}`);

  if (soul.conversationHistory.length > 0) {
    const recent = soul.conversationHistory.slice(-3);
    lines.push(`最近对话：`);
    for (const mem of recent) {
      const riskLabel = mem.risks.filter(r => r !== 'none').map(r => translateRisk(r)).join('+') || '无风险';
      lines.push(`  D${mem.day}：玩家说"${mem.playerText}"，回复"${mem.recipientReply}"，trust${mem.trustDelta > 0 ? '+' : ''}${mem.trustDelta}，${riskLabel}`);
    }
  }

  if (soul.communicationPatterns.length > 0) {
    const sorted = [...soul.communicationPatterns].sort((a, b) => b.count - a.count);
    lines.push(`沟通模式（按频率）：`);
    for (const p of sorted.slice(0, 5)) {
      const effLabel = p.effectiveness > 0.3 ? '有效' : p.effectiveness < -0.3 ? '无效' : '一般';
      lines.push(`  ${p.intent}：${effLabel}（${p.effectiveness.toFixed(1)}），用了${p.count}次`);
    }
  }

  return lines;
}

function translateRisk(risk: string): string {
  const map: Record<string, string> = {
    'empty_comfort': '空安抚',
    'overpromise': '过度承诺',
    'ignores_customer': '忽略问题',
    'missing_next_step': '缺少下一步',
    'offensive_reply': '冒犯回复',
    'price_pressure_too_fast': '价格压力过快',
  };
  return map[risk] || risk;
}
