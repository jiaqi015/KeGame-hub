import type { ConversationReceipt } from '../core/world-state/conversation/models.js';

export interface CoachFeedback {
  readonly overall: string;
  readonly insights: readonly string[];
  readonly nextStepAdvice: string | null;
}

export function buildCoachFeedback(receipt: ConversationReceipt): CoachFeedback | null {
  const snapshot = receipt.traceSnapshot;
  if (!snapshot?.evaluationVerdict) return null;

  const parts: string[] = [];
  const insights: string[] = [];

  // Overall verdict
  if (snapshot.evaluationVerdict === 'strong') {
    parts.push('这次回复质量不错。');
  } else if (snapshot.evaluationVerdict === 'acceptable') {
    parts.push('这次回复基本到位，但有提升空间。');
  } else {
    parts.push('这次回复需要改进。');
  }

  // Risk analysis
  const intents = receipt.proposal.intentKinds;
  const risks = receipt.proposal.riskKinds;

  if (risks.includes('overpromise')) {
    parts.push('回复过于绝对。');
    insights.push('建议用"如果...可能..."替代"保证"，避免业主期望过高。');
  }
  if (risks.includes('empty_comfort')) {
    parts.push('回复过于笼统。');
    insights.push('业主需要具体方案，不是安慰。下次尝试给出一个可执行的动作。');
  }
  if (risks.includes('ignores_customer')) {
    parts.push('没有回应业主的核心问题。');
    insights.push('业主问了具体问题却被跳过了。先正面回答问题，再补充其他信息。');
  }
  if (risks.includes('missing_next_step')) {
    parts.push('缺少明确的下一步。');
    insights.push('业主不知道接下来该做什么。下次回复时明确说出"下一步是XX"。');
  }
  if (risks.includes('price_pressure_too_fast')) {
    parts.push('调价压力过大。');
    insights.push('业主还没准备好就被催调价。先建立信任和数据支撑，再谈价格。');
  }

  // Intent effectiveness
  if (intents.includes('reassure') && (receipt.settlement.trustDelta ?? 0) <= 0) {
    insights.push('安抚意图未提升信任——业主可能需要看到具体行动而非口头承诺。');
  }
  if (intents.includes('discuss_price') && (receipt.settlement.priceFlexibilityDelta ?? 0) <= 0) {
    insights.push('讨论价格但未提升价格弹性——需要用市场数据支撑论点。');
  }

  // Evaluation signals
  if (snapshot.evaluationSignals) {
    for (const signal of snapshot.evaluationSignals) {
      if (signal.includes('core_question_missed')) {
        insights.push('回复没有抓住业主的核心关切，需要更精准地回应问题。');
      }
      if (signal.includes('no_next_step')) {
        insights.push('缺少可执行的下一步动作。');
      }
    }
  }

  // Next step advice
  const nextStep = receipt.proposal.nextStep;
  let nextStepAdvice: string | null = null;
  if (nextStep && nextStep.kind !== 'none') {
    const kindLabels: Record<string, string> = {
      schedule_face_visit: '安排面访',
      review_price: '复盘价格策略',
      prepare_competition_comparison: '准备竞品对比',
      follow_customer: '跟进客户',
      confirm_price_adjustment: '确认调价',
      open_case: '开展新案件',
    };
    const label = kindLabels[nextStep.kind] ?? nextStep.kind;
    nextStepAdvice = `建议下一步：${label}——${nextStep.reason}`;
  }

  return { overall: parts.join(''), insights, nextStepAdvice };
}
