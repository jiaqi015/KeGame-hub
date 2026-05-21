import type {
  ConversationIntentKind,
  ConversationNextStepDraft,
  ConversationRiskKind,
} from '../conversation/models.js';

export type ConversationEvaluationVerdict = 'strong' | 'acceptable' | 'needs-work';
export type ConversationEvaluationStatus = 'pass' | 'review' | 'watch';
export type ConversationEvaluationChannel = string;
export type ConversationEvaluationIntentKind = ConversationIntentKind | string;
export type ConversationEvaluationRiskKind = ConversationRiskKind | string;

export interface ConversationEvaluationSourceMessage {
  readonly content: string;
  readonly primaryCtaLabel?: string;
}

export interface ConversationEvaluationInput {
  readonly conversationKey: string;
  readonly channel: ConversationEvaluationChannel;
  readonly day?: number;
  readonly actorLabel?: string;
  readonly sourceMessage?: ConversationEvaluationSourceMessage;
  readonly playerText: string;
  readonly recipientReply: string;
  readonly summary: string;
  readonly intentKinds: readonly ConversationEvaluationIntentKind[];
  readonly riskKinds: readonly ConversationEvaluationRiskKind[];
  readonly evidenceUse: 'none' | 'mentioned' | 'specific';
  readonly nextStep?: ConversationNextStepDraft | null;
  readonly trustDelta?: number;
  readonly patienceDelta?: number;
  readonly urgencyDelta?: number;
  readonly priceFlexibilityDelta?: number;
  readonly customerIntentDelta?: number;
  readonly customerConfidenceDelta?: number;
}

export interface ConversationEvaluationDimension {
  readonly key: string;
  readonly label: string;
  readonly score: number;
  readonly signals: readonly string[];
  readonly summary: string;
}

export interface ConversationEvaluationReport {
  readonly reportId: string;
  readonly conversationKey: string;
  readonly channel: ConversationEvaluationChannel;
  readonly day?: number;
  readonly overallScore: number;
  readonly hasClearNextStep: boolean;
  readonly hasRisk: boolean;
  readonly coreIssueMatched: boolean;
  readonly businessMotion: {
    readonly price: boolean;
    readonly faceVisit: boolean;
    readonly followUp: boolean;
  };
  readonly riskLabels: readonly string[];
  readonly score: number;
  readonly verdict: ConversationEvaluationVerdict;
  readonly status: ConversationEvaluationStatus;
  readonly dimensions: {
    readonly coreQuestion: ConversationEvaluationDimension;
    readonly nextStep: ConversationEvaluationDimension;
    readonly relationshipRisk: ConversationEvaluationDimension;
    readonly businessMotion: ConversationEvaluationDimension;
  };
  readonly signals: readonly string[];
  readonly summary: string;
  readonly recommendations: readonly string[];
}

const MOTION_INTENTS = new Set<ConversationEvaluationIntentKind>([
  'present_market_evidence',
  'propose_face_visit',
  'discuss_price',
  'secure_price_adjustment',
  'follow_customer',
  'align_manager',
]);

const FACE_VISIT_STEPS = new Set<string>([
  'schedule_face_visit',
  'propose_face_visit',
]);

const PRICE_STEPS = new Set<string>([
  'review_price',
  'confirm_price_adjustment',
  'prepare_competition_comparison',
]);

const FOLLOW_UP_STEPS = new Set<string>([
  'follow_customer',
  'open_case',
]);

const CORE_KEYWORDS = [
  '方案',
  '下一步',
  '面访',
  '带看',
  '价格',
  '调价',
  '反馈',
  '竞品',
  '比较',
  '跟进',
  '判断',
  '明确',
  '客户',
  '业主',
  '再等等',
];

const RISK_LABELS: Record<string, string> = {
  overpromise: '过度承诺',
  empty_comfort: '空泛安抚',
  price_pressure_too_fast: '价格推进过快',
  missing_next_step: '缺少下一步',
  ignores_customer: '没接住客户问题',
  offensive_reply: '冒犯性回复',
};

export function buildConversationEvaluationReport(
  input: ConversationEvaluationInput,
): ConversationEvaluationReport {
  const coreQuestion = scoreCoreQuestion(input);
  const nextStep = scoreNextStep(input);
  const relationshipRisk = scoreRelationshipRisk(input);
  const businessMotion = scoreBusinessMotion(input);
  const score = clampScore(
    coreQuestion.score * 0.35
      + nextStep.score * 0.25
      + relationshipRisk.score * 0.2
      + businessMotion.score * 0.2,
  );
  const verdict = resolveVerdict(score);
  const status = resolveStatus(score, relationshipRisk, input.riskKinds);
  const signals = collectSignals(input, coreQuestion, nextStep, relationshipRisk, businessMotion, score, status);
  const normalizedRisks = normalizeRiskKinds(input.riskKinds);

  return Object.freeze({
    reportId: `conversation-evaluation:${input.conversationKey}:${input.day ?? 'na'}`,
    conversationKey: input.conversationKey,
    channel: input.channel,
    day: input.day,
    overallScore: score,
    hasClearNextStep: nextStep.score >= 60,
    hasRisk: normalizedRisks.some((risk) => risk !== 'none') || relationshipRisk.score < 80,
    coreIssueMatched: coreQuestion.score >= 60,
    businessMotion: Object.freeze(resolveBusinessMotionFlags(input)),
    riskLabels: Object.freeze(
      normalizedRisks
        .filter((risk): risk is Exclude<string, 'none'> => risk !== 'none')
        .map((risk) => formatConversationEvaluationRiskLabel(risk)),
    ),
    score,
    verdict,
    status,
    dimensions: Object.freeze({
      coreQuestion,
      nextStep,
      relationshipRisk,
      businessMotion,
    }),
    signals: Object.freeze(signals),
    summary: buildSummary(input, coreQuestion, nextStep, relationshipRisk, businessMotion, score, verdict, status),
    recommendations: Object.freeze(buildRecommendations(coreQuestion, nextStep, relationshipRisk, businessMotion)),
  });
}

function scoreCoreQuestion(input: ConversationEvaluationInput): ConversationEvaluationDimension {
  const signals: string[] = [];
  let score = 22;
  const sourceText = [input.sourceMessage?.content, input.sourceMessage?.primaryCtaLabel].filter(Boolean).join(' ');
  const replyText = [input.playerText, input.recipientReply, input.summary, input.nextStep?.label, input.nextStep?.reason]
    .filter(Boolean)
    .join(' ');
  const matchedKeywords = collectKeywordMatches(sourceText, replyText);

  if (input.intentKinds.some((kind) => MOTION_INTENTS.has(kind))) {
    score += 32;
    signals.push('core_question_intent');
  }
  if (input.evidenceUse === 'specific') {
    score += 18;
    signals.push('core_question_specific_evidence');
  } else if (input.evidenceUse === 'mentioned') {
    score += 10;
    signals.push('core_question_mentioned_evidence');
  }
  if (matchedKeywords.length > 0) {
    score += Math.min(24, matchedKeywords.length * 8);
    signals.push(...matchedKeywords.map((keyword) => `core_match:${keyword}`));
  }
  if (input.intentKinds.includes('reassure')) score += 2;
  if (input.riskKinds.includes('missing_next_step')) score -= 12;
  if (input.riskKinds.includes('empty_comfort')) score -= 18;
  if (input.riskKinds.includes('ignores_customer')) score -= 28;
  if (input.riskKinds.includes('offensive_reply')) score -= 36;

  score += clampDelta(input.trustDelta, -6, 6, 0);
  score += clampDelta(input.customerConfidenceDelta, -4, 4, 0);

  score = clampScore(score);
  const summary = score >= 80
    ? '接住核心问题，回复和上下文保持一致。'
    : score >= 60
      ? '部分接住核心问题，但还不够完整。'
      : '核心问题没有接住。';

  return Object.freeze({
    key: 'core_question',
    label: '核心问题',
    score,
    signals: Object.freeze(signals),
    summary,
  });
}

function scoreNextStep(input: ConversationEvaluationInput): ConversationEvaluationDimension {
  const signals: string[] = [];
  let score = 0;
  const nextStep = input.nextStep;

  if (nextStep && nextStep.kind !== 'none') {
    score += 42;
    signals.push('next_step_clear');
    if (nextStep.actionId) {
      score += 14;
      signals.push(`next_step_action:${nextStep.actionId}`);
    }
    if (FACE_VISIT_STEPS.has(nextStep.kind)) {
      score += 18;
      signals.push('next_step_face_visit');
    }
    if (PRICE_STEPS.has(nextStep.kind)) {
      score += 18;
      signals.push('next_step_price');
    }
    if (FOLLOW_UP_STEPS.has(nextStep.kind)) {
      score += 14;
      signals.push('next_step_follow_up');
    }
    if (nextStep.priority === 'urgent' || nextStep.priority === 'high') {
      score += 8;
      signals.push(`next_step_priority:${nextStep.priority}`);
    }
  } else {
    signals.push('next_step_missing');
    score -= 12;
  }

  if (input.riskKinds.includes('missing_next_step')) score -= 24;
  if (input.riskKinds.includes('empty_comfort')) score -= 6;
  if (input.riskKinds.includes('offensive_reply')) score -= 10;

  score = clampScore(score);
  const summary = score >= 80
    ? '下一步足够明确，可以直接推进。'
    : score >= 60
      ? '下一步有，但还不够具体。'
      : '缺少明确下一步。';

  return Object.freeze({
    key: 'next_step',
    label: '下一步',
    score,
    signals: Object.freeze(signals),
    summary,
  });
}

function scoreRelationshipRisk(input: ConversationEvaluationInput): ConversationEvaluationDimension {
  const signals: string[] = [];
  let score = 100;
  const risks = normalizeRiskKinds(input.riskKinds);

  for (const risk of risks) {
    signals.push(`risk:${risk}`);
    if (risk === 'offensive_reply') score -= 62;
    else if (risk === 'price_pressure_too_fast') score -= 34;
    else if (risk === 'ignores_customer') score -= 30;
    else if (risk === 'overpromise') score -= 24;
    else if (risk === 'empty_comfort') score -= 22;
    else if (risk === 'missing_next_step') score -= 16;
  }

  score -= magnitudePenalty(input.trustDelta, 2);
  score -= magnitudePenalty(input.patienceDelta, 2);
  score -= magnitudePenalty(input.customerConfidenceDelta, 1.5);
  if (input.urgencyDelta && input.urgencyDelta > 0 && risks.includes('offensive_reply')) {
    score -= 6;
  }

  score = clampScore(score);
  const summary = score >= 80
    ? '关系风险低。'
    : score >= 60
      ? '存在可控关系风险。'
      : '关系风险已经被明显触发。';

  return Object.freeze({
    key: 'relationship_risk',
    label: '关系风险',
    score,
    signals: Object.freeze(signals),
    summary,
  });
}

function scoreBusinessMotion(input: ConversationEvaluationInput): ConversationEvaluationDimension {
  const signals: string[] = [];
  let score = 8;
  const intentKinds = input.intentKinds.map((kind) => kind.toString());
  const nextStepKind = input.nextStep?.kind ?? 'none';

  if (intentKinds.includes('discuss_price')) {
    score += 24;
    signals.push('motion:price');
  }
  if (intentKinds.includes('secure_price_adjustment')) {
    score += 34;
    signals.push('motion:price_adjustment');
  }
  if (intentKinds.includes('propose_face_visit')) {
    score += 24;
    signals.push('motion:face_visit');
  }
  if (intentKinds.includes('follow_customer')) {
    score += 22;
    signals.push('motion:follow_up');
  }
  if (intentKinds.includes('present_market_evidence')) {
    score += 14;
    signals.push('motion:evidence');
  }

  if (FACE_VISIT_STEPS.has(nextStepKind)) {
    score += 18;
    signals.push('motion:face_visit');
  }
  if (PRICE_STEPS.has(nextStepKind)) {
    score += 18;
    signals.push('motion:price');
  }
  if (FOLLOW_UP_STEPS.has(nextStepKind)) {
    score += 14;
    signals.push('motion:follow_up');
  }

  score += clampDelta(input.priceFlexibilityDelta, 0, 10, 2);
  if (typeof input.priceFlexibilityDelta === 'number' && input.priceFlexibilityDelta > 0) {
    signals.push('motion:price');
  }
  score += clampDelta(input.customerIntentDelta, -2, 8, 1.5);
  score += clampDelta(input.customerConfidenceDelta, -2, 8, 1.5);

  if (input.evidenceUse === 'specific') {
    score += 8;
    signals.push('motion:specific_evidence');
  } else if (input.evidenceUse === 'mentioned') {
    score += 4;
    signals.push('motion:mentioned_evidence');
  }

  if (input.riskKinds.includes('missing_next_step')) score -= 10;
  if (input.riskKinds.includes('empty_comfort')) score -= 12;
  if (input.riskKinds.includes('ignores_customer')) score -= 18;
  if (input.riskKinds.includes('offensive_reply')) score -= 24;

  score = clampScore(score);
  const summary = score >= 80
    ? '价格、面访或跟进动作被有效推动。'
    : score >= 60
      ? '有业务推动，但动作力度一般。'
      : '业务推动不足。';

  return Object.freeze({
    key: 'business_motion',
    label: '业务推动',
    score,
    signals: Object.freeze(dedupe(signals)),
    summary,
  });
}

function buildSummary(
  input: ConversationEvaluationInput,
  coreQuestion: ConversationEvaluationDimension,
  nextStep: ConversationEvaluationDimension,
  relationshipRisk: ConversationEvaluationDimension,
  businessMotion: ConversationEvaluationDimension,
  score: number,
  verdict: ConversationEvaluationVerdict,
  status: ConversationEvaluationStatus,
): string {
  const actor = input.actorLabel ? `${input.actorLabel} ` : '';
  const coreText = coreQuestion.score >= 80 ? '接住核心问题' : coreQuestion.score >= 60 ? '部分接住核心问题' : '没有接住核心问题';
  const nextStepText = nextStep.score >= 80 ? '下一步很明确' : nextStep.score >= 60 ? '下一步有但偏弱' : '缺少下一步';
  const riskText = relationshipRisk.score >= 80 ? '关系风险低' : relationshipRisk.score >= 60 ? '关系风险可控' : '关系风险偏高';
  const motionText = businessMotion.score >= 80 ? '推动了价格/面访/跟进' : businessMotion.score >= 60 ? '有业务推进' : '业务推动不足';

  return `${input.channel === 'wechat' ? '微信' : '对话'}回合：${actor}${coreText}，${nextStepText}，${riskText}，${motionText}，总分 ${score}，verdict ${verdict}，status ${status}。`;
}

function buildRecommendations(
  coreQuestion: ConversationEvaluationDimension,
  nextStep: ConversationEvaluationDimension,
  relationshipRisk: ConversationEvaluationDimension,
  businessMotion: ConversationEvaluationDimension,
): string[] {
  const recommendations: string[] = [];
  if (coreQuestion.score < 60) recommendations.push('先接住对方核心问题，再谈推进。');
  if (nextStep.score < 60) recommendations.push('补一条明确下一步，避免对话停在安抚。');
  if (relationshipRisk.score < 60) recommendations.push('先修复关系，再继续压价格或追动作。');
  if (businessMotion.score < 60) recommendations.push('把价格、面访或跟进落成具体动作。');
  return recommendations;
}

function collectSignals(
  input: ConversationEvaluationInput,
  coreQuestion: ConversationEvaluationDimension,
  nextStep: ConversationEvaluationDimension,
  relationshipRisk: ConversationEvaluationDimension,
  businessMotion: ConversationEvaluationDimension,
  score: number,
  status: ConversationEvaluationStatus,
): string[] {
  const signals: string[] = [];
  signals.push(`score:${score}`);
  signals.push(`status:${status}`);
  if (coreQuestion.score >= 80) signals.push('core_question_hit');
  else if (coreQuestion.score >= 60) signals.push('core_question_partial');
  else signals.push('core_question_missed');
  signals.push(...coreQuestion.signals);
  signals.push(...nextStep.signals);
  signals.push(...relationshipRisk.signals);
  signals.push(...businessMotion.signals);
  if (input.riskKinds.length === 0 || normalizeRiskKinds(input.riskKinds).length === 0) {
    signals.push('risk:none');
  }
  if (nextStep.score >= 80) signals.push('next_step_clear');
  if (relationshipRisk.score < 60) signals.push('relationship_risk:triggered');
  if (businessMotion.score >= 80) signals.push('motion:strong');
  return dedupe(signals);
}

function resolveVerdict(score: number): ConversationEvaluationVerdict {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'acceptable';
  return 'needs-work';
}

function resolveStatus(
  score: number,
  relationshipRisk: ConversationEvaluationDimension,
  riskKinds: readonly ConversationEvaluationRiskKind[],
): ConversationEvaluationStatus {
  const normalizedRisks = normalizeRiskKinds(riskKinds);
  if (normalizedRisks.includes('offensive_reply') || normalizedRisks.includes('ignores_customer')) {
    return 'review';
  }
  if (relationshipRisk.score < 45) return 'review';
  if (score >= 80) return 'pass';
  return 'watch';
}

function resolveBusinessMotionFlags(input: ConversationEvaluationInput): {
  readonly price: boolean;
  readonly faceVisit: boolean;
  readonly followUp: boolean;
} {
  const intentKinds = input.intentKinds.map((kind) => kind.toString());
  const nextStepKind = input.nextStep?.kind ?? 'none';
  return {
    price:
      intentKinds.includes('discuss_price')
      || intentKinds.includes('secure_price_adjustment')
      || PRICE_STEPS.has(nextStepKind)
      || (typeof input.priceFlexibilityDelta === 'number' && input.priceFlexibilityDelta > 0),
    faceVisit:
      intentKinds.includes('propose_face_visit')
      || FACE_VISIT_STEPS.has(nextStepKind),
    followUp:
      intentKinds.includes('follow_customer')
      || FOLLOW_UP_STEPS.has(nextStepKind),
  };
}

function collectKeywordMatches(sourceText: string, replyText: string): string[] {
  if (!sourceText || !replyText) return [];
  return CORE_KEYWORDS.filter((keyword) => sourceText.includes(keyword) && replyText.includes(keyword));
}

function normalizeRiskKinds(riskKinds: readonly ConversationEvaluationRiskKind[]): string[] {
  return riskKinds
    .map((risk) => risk.toString())
    .filter(Boolean);
}

function clampDelta(
  value: number | undefined,
  min: number,
  max: number,
  multiplier: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const bounded = Math.max(min, Math.min(max, value));
  return Math.round(bounded * multiplier);
}

function magnitudePenalty(value: number | undefined, factor: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value >= 0) return 0;
  return Math.min(20, Math.round(Math.abs(value) * factor));
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function formatConversationEvaluationRiskLabel(riskKind: string): string {
  return RISK_LABELS[riskKind] || riskKind;
}
