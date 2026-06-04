import { describe, it, expect } from 'vitest';
import type { ParticipantSoul, ConversationMemory, CommunicationPattern, ParticipantSoulStore } from '../../core/world-state/agents/soul';
import { initializeSoulFromCase, updateSoulAfterConversation, buildSoulPromptLines } from '../agents/soulStore';

describe('ParticipantSoul', () => {
  describe('type definitions', () => {
    it('should define ParticipantSoul with required fields', () => {
      const soul: ParticipantSoul = {
        participantId: 'owner:case-1:王姐',
        ownerProfileLabel: '焦虑型',
        basePersonality: {
          assertiveness: 40,
          patience: 50,
          trust倾向: 50,
          priceSensitivity: 60,
        },
        emotionalState: {
          trust: 35,
          patience: 25,
          urgency: 80,
          mood: 'negative',
        },
        emotionalArc: { trustTrend: 'stable', patienceTrend: 'stable', urgencyTrend: 'stable', lastMood: 'neutral', consecutivePositive: 0, consecutiveNegative: 0 },
        conversationHistory: [],
        communicationPatterns: [],
      };
      expect(soul.participantId).toBe('owner:case-1:王姐');
      expect(soul.ownerProfileLabel).toBe('焦虑型');
      expect(soul.basePersonality.assertiveness).toBe(40);
      expect(soul.emotionalState.mood).toBe('negative');
    });

    it('should define ConversationMemory with required fields', () => {
      const memory: ConversationMemory = {
        day: 1,
        playerText: '我今天下午去面访',
        recipientReply: '好，那你今天就定时间',
        trustDelta: 3,
        patienceDelta: 1,
        urgencyDelta: -1,
        intents: ['propose_face_visit'],
        risks: ['none'],
      };
      expect(memory.day).toBe(1);
      expect(memory.trustDelta).toBe(3);
      expect(memory.intents).toContain('propose_face_visit');
    });

    it('should define CommunicationPattern with required fields', () => {
      const pattern: CommunicationPattern = {
        intent: 'propose_face_visit',
        effectiveness: 0.8,
        lastUsed: 1,
        count: 3,
      };
      expect(pattern.intent).toBe('propose_face_visit');
      expect(pattern.effectiveness).toBe(0.8);
      expect(pattern.count).toBe(3);
    });

    it('should define ParticipantSoulStore as record of souls', () => {
      const store: ParticipantSoulStore = {
        'owner:case-1:王姐': {
          participantId: 'owner:case-1:王姐',
          ownerProfileLabel: '焦虑型',
          basePersonality: { assertiveness: 40, patience: 50, trust倾向: 50, priceSensitivity: 60 },
          emotionalState: { trust: 35, patience: 25, urgency: 80, mood: 'negative' },
        emotionalArc: { trustTrend: 'stable', patienceTrend: 'stable', urgencyTrend: 'stable', lastMood: 'neutral', consecutivePositive: 0, consecutiveNegative: 0 },
          conversationHistory: [],
          communicationPatterns: [],
        },
      };
      expect(store['owner:case-1:王姐'].ownerProfileLabel).toBe('焦虑型');
    });
  });

  describe('soul initialization', () => {
    it('should initialize soul from case context with correct personality mapping', () => {
      const caseContext = {
        caseId: 'case-1',
        ownerName: '王姐',
        ownerProfileLabel: '焦虑型',
        trust: 35,
        patience: 25,
        urgency: 80,
        priceGapPct: 9.7,
      };

      const soul = initializeSoulFromCase(caseContext);

      expect(soul.participantId).toBe('owner:case-1:王姐');
      expect(soul.ownerProfileLabel).toBe('焦虑型');
      expect(soul.emotionalState.trust).toBe(35);
      expect(soul.emotionalState.patience).toBe(25);
      expect(soul.emotionalState.urgency).toBe(80);
      expect(soul.emotionalState.mood).toBe('neutral');
      expect(soul.conversationHistory).toEqual([]);
      expect(soul.communicationPatterns).toEqual([]);
    });

    it('should map assertive owner to high assertiveness', () => {
      const caseContext = {
        caseId: 'case-2',
        ownerName: '李总',
        ownerProfileLabel: '强势型',
        trust: 45,
        patience: 50,
        urgency: 50,
        priceGapPct: 13.3,
      };

      const soul = initializeSoulFromCase(caseContext);

      expect(soul.basePersonality.assertiveness).toBeGreaterThanOrEqual(70);
    });

    it('should map anxious owner to high urgency sensitivity', () => {
      const caseContext = {
        caseId: 'case-3',
        ownerName: '周姐',
        ownerProfileLabel: '焦虑型',
        trust: 25,
        patience: 40,
        urgency: 55,
        priceGapPct: 4.0,
      };

      const soul = initializeSoulFromCase(caseContext);

      expect(soul.basePersonality.assertiveness).toBeLessThanOrEqual(50);
    });

    it('should map high priceGapPct to high priceSensitivity', () => {
      const caseContext = {
        caseId: 'case-4',
        ownerName: '钱总',
        ownerProfileLabel: '强势型',
        trust: 30,
        patience: 20,
        urgency: 85,
        priceGapPct: 15.0,
      };

      const soul = initializeSoulFromCase(caseContext);

      expect(soul.basePersonality.priceSensitivity).toBeGreaterThanOrEqual(70);
    });
  });

  describe('soul update after conversation', () => {
    it('should update emotional state after conversation', () => {
      const soul: ParticipantSoul = {
        participantId: 'owner:case-1:王姐',
        ownerProfileLabel: '焦虑型',
        basePersonality: { assertiveness: 40, patience: 50, trust倾向: 50, priceSensitivity: 60 },
        emotionalState: { trust: 35, patience: 25, urgency: 80, mood: 'neutral' },
        emotionalArc: { trustTrend: 'stable', patienceTrend: 'stable', urgencyTrend: 'stable', lastMood: 'neutral', consecutivePositive: 0, consecutiveNegative: 0 },
        conversationHistory: [],
        communicationPatterns: [],
      };

      const receipt = {
        day: 1,
        playerText: '我今天下午去面访',
        recipientReply: '好，那你今天就定时间',
        settlement: { trustDelta: 3, patienceDelta: 1, urgencyDelta: -1 },
        proposal: { intentKinds: ['propose_face_visit'], riskKinds: ['none'] },
      };

      const updated = updateSoulAfterConversation(soul, receipt);

      expect(updated.emotionalState.trust).toBe(38);
      expect(updated.emotionalState.patience).toBe(26);
      expect(updated.emotionalState.urgency).toBe(79);
      expect(updated.emotionalState.mood).toBe('positive');
      expect(updated.conversationHistory).toHaveLength(1);
    });

    it('should set mood to negative when trust drops significantly', () => {
      const soul: ParticipantSoul = {
        participantId: 'owner:case-1:王姐',
        ownerProfileLabel: '焦虑型',
        basePersonality: { assertiveness: 40, patience: 50, trust倾向: 50, priceSensitivity: 60 },
        emotionalState: { trust: 40, patience: 25, urgency: 80, mood: 'neutral' },
        emotionalArc: { trustTrend: 'stable', patienceTrend: 'stable', urgencyTrend: 'stable', lastMood: 'neutral', consecutivePositive: 0, consecutiveNegative: 0 },
        conversationHistory: [],
        communicationPatterns: [],
      };

      const receipt = {
        day: 1,
        playerText: '收到，我这边跟进一下',
        recipientReply: '你这么说太笼统了',
        settlement: { trustDelta: -5, patienceDelta: -2, urgencyDelta: 3 },
        proposal: { intentKinds: ['reassure'], riskKinds: ['empty_comfort'] },
      };

      const updated = updateSoulAfterConversation(soul, receipt);

      expect(updated.emotionalState.trust).toBe(35);
      expect(updated.emotionalState.mood).toBe('negative');
    });

    it('should update communication patterns', () => {
      const soul: ParticipantSoul = {
        participantId: 'owner:case-1:王姐',
        ownerProfileLabel: '焦虑型',
        basePersonality: { assertiveness: 40, patience: 50, trust倾向: 50, priceSensitivity: 60 },
        emotionalState: { trust: 35, patience: 25, urgency: 80, mood: 'neutral' },
        emotionalArc: { trustTrend: 'stable', patienceTrend: 'stable', urgencyTrend: 'stable', lastMood: 'neutral', consecutivePositive: 0, consecutiveNegative: 0 },
        conversationHistory: [],
        communicationPatterns: [],
      };

      const receipt = {
        day: 1,
        playerText: '我今天下午去面访',
        recipientReply: '好，那你今天就定时间',
        settlement: { trustDelta: 3, patienceDelta: 1, urgencyDelta: -1 },
        proposal: { intentKinds: ['propose_face_visit'], riskKinds: ['none'] },
      };

      const updated = updateSoulAfterConversation(soul, receipt);

      expect(updated.communicationPatterns).toHaveLength(1);
      expect(updated.communicationPatterns[0].intent).toBe('propose_face_visit');
      expect(updated.communicationPatterns[0].effectiveness).toBeGreaterThan(0);
    });
  });

  describe('soul prompt generation', () => {
    it('should generate prompt lines from soul', () => {
      const soul: ParticipantSoul = {
        participantId: 'owner:case-1:王姐',
        ownerProfileLabel: '焦虑型',
        basePersonality: { assertiveness: 40, patience: 50, trust倾向: 50, priceSensitivity: 60 },
        emotionalState: { trust: 35, patience: 25, urgency: 80, mood: 'negative' },
        emotionalArc: { trustTrend: 'stable', patienceTrend: 'stable', urgencyTrend: 'stable', lastMood: 'neutral', consecutivePositive: 0, consecutiveNegative: 0 },
        conversationHistory: [
          {
            day: 1,
            playerText: '收到，我这边跟进一下',
            recipientReply: '你这么说太笼统了',
            trustDelta: -1,
            patienceDelta: -1,
            urgencyDelta: 1,
            intents: ['reassure'],
            risks: ['empty_comfort'],
          },
        ],
        communicationPatterns: [
          { intent: 'reassure', effectiveness: -0.5, lastUsed: 1, count: 1 },
        ],
      };

      const lines = buildSoulPromptLines(soul);

      expect(lines.length).toBeGreaterThan(0);
      expect(lines.some(l => l.includes('焦虑型'))).toBe(true);
      expect(lines.some(l => l.includes('trust=35'))).toBe(true);
      expect(lines.some(l => l.includes('negative'))).toBe(true);
    });

    it('should include conversation history summary', () => {
      const soul: ParticipantSoul = {
        participantId: 'owner:case-1:王姐',
        ownerProfileLabel: '焦虑型',
        basePersonality: { assertiveness: 40, patience: 50, trust倾向: 50, priceSensitivity: 60 },
        emotionalState: { trust: 35, patience: 25, urgency: 80, mood: 'negative' },
        emotionalArc: { trustTrend: 'stable', patienceTrend: 'stable', urgencyTrend: 'stable', lastMood: 'neutral', consecutivePositive: 0, consecutiveNegative: 0 },
        conversationHistory: [
          {
            day: 1,
            playerText: '收到，我这边跟进一下',
            recipientReply: '你这么说太笼统了',
            trustDelta: -1,
            patienceDelta: -1,
            urgencyDelta: 1,
            intents: ['reassure'],
            risks: ['empty_comfort'],
          },
        ],
        communicationPatterns: [],
      };

      const lines = buildSoulPromptLines(soul);

      expect(lines.some(l => l.includes('空安抚'))).toBe(true);
    });

    it('should include communication patterns', () => {
      const soul: ParticipantSoul = {
        participantId: 'owner:case-1:王姐',
        ownerProfileLabel: '焦虑型',
        basePersonality: { assertiveness: 40, patience: 50, trust倾向: 50, priceSensitivity: 60 },
        emotionalState: { trust: 35, patience: 25, urgency: 80, mood: 'negative' },
        emotionalArc: { trustTrend: 'stable', patienceTrend: 'stable', urgencyTrend: 'stable', lastMood: 'neutral', consecutivePositive: 0, consecutiveNegative: 0 },
        conversationHistory: [],
        communicationPatterns: [
          { intent: 'reassure', effectiveness: -0.5, lastUsed: 1, count: 1 },
          { intent: 'propose_face_visit', effectiveness: 0.8, lastUsed: 2, count: 3 },
        ],
      };

      const lines = buildSoulPromptLines(soul);

      expect(lines.some(l => l.includes('reassure') && l.includes('-0.5'))).toBe(true);
      expect(lines.some(l => l.includes('propose_face_visit') && l.includes('0.8'))).toBe(true);
    });
  });
});
