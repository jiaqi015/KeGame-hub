import { describe, expect, it } from 'vitest';
import { formatConversationRiskSummary } from '../agents/conversationRiskLabels.ts';

describe('conversation risk labels', () => {
  it('localizes missing_next_step summaries', () => {
    expect(formatConversationRiskSummary('未消化风险：missing_next_step')).toBe('未消化风险：缺少下一步');
  });
});
