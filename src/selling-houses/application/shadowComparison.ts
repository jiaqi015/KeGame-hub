import type {
  ConversationEffectProposal,
  ConversationIntentKind,
  ConversationNextStepDraft,
  ConversationNextStepKind,
  ConversationRiskKind,
} from '../core/world-state/conversation/models.js';

export type ShadowComparisonScopeType = 'conversation' | 'case';
export type ShadowComparisonWinner = 'rule' | 'ai' | 'tie';
export type ShadowComparisonDimensionId = 'risk_hit' | 'next_step' | 'core_issue';

export interface ShadowComparisonInput {
  readonly scopeType: ShadowComparisonScopeType;
  readonly scopeId: string;
  readonly sourceText: string;
  readonly ruleProposal: ConversationEffectProposal;
  readonly aiProposal: ConversationEffectProposal;
  readonly focusTerms?: readonly string[];
  readonly criticalRiskKinds?: readonly ConversationRiskKind[];
}

export interface ShadowComparisonDimensionResult {
  readonly id: ShadowComparisonDimensionId;
  readonly winner: ShadowComparisonWinner;
  readonly ruleScore: number;
  readonly aiScore: number;
  readonly summary: string;
  readonly signals: readonly string[];
}

export interface ShadowComparisonCandidateView {
  readonly label: string;
  readonly summary: string;
  readonly recipientReply: string;
  readonly intentKinds: readonly ConversationIntentKind[];
  readonly riskKinds: readonly ConversationRiskKind[];
  readonly nextStepKind: ConversationNextStepKind;
  readonly nextStepLabel: string;
  readonly confidence: number;
  readonly riskScore: number;
  readonly coreIssueCoverage: number;
}

export interface ShadowComparisonReport {
  readonly comparisonId: string;
  readonly scopeType: ShadowComparisonScopeType;
  readonly scopeId: string;
  readonly sourceText: string;
  readonly focusTerms: readonly string[];
  readonly criticalRiskKinds: readonly ConversationRiskKind[];
  readonly rule: ShadowComparisonCandidateView;
  readonly ai: ShadowComparisonCandidateView;
  readonly dimensions: readonly ShadowComparisonDimensionResult[];
  readonly overallWinner: ShadowComparisonWinner;
  readonly overallScore: {
    readonly rule: number;
    readonly ai: number;
    readonly delta: number;
  };
  readonly signals: readonly string[];
  readonly summary: string;
}

interface CandidateMetrics {
  readonly riskScore: number;
  readonly riskHits: readonly ConversationRiskKind[];
  readonly coreIssueCoverage: number;
  readonly coreIssueHits: readonly string[];
  readonly nextStepScore: number;
  readonly nextStepKind: ConversationNextStepKind;
  readonly nextStepLabel: string;
}

const SOURCE_HINT_PATTERNS: readonly { term: string; pattern: RegExp }[] = [
  { term: '明确方案', pattern: /明确方案/ },
  { term: '再等等', pattern: /再等等/ },
  { term: '下一步', pattern: /下一步/ },
  { term: '价格', pattern: /价格|价位|报价|挂牌/ },
  { term: '面访', pattern: /面访|当面|见面/ },
  { term: '客户反馈', pattern: /客户反馈|客户会|客户说/ },
  { term: '竞品', pattern: /竞品|同类|同小区|对比/ },
  { term: '业主', pattern: /业主/ },
];

const CRITICAL_RISK_PATTERNS: readonly { kind: ConversationRiskKind; pattern: RegExp }[] = [
  { kind: 'missing_next_step', pattern: /明确方案|下一步|别只是说再等等|别只是再等等|别只是说|怎么做|怎么办|具体/ },
  { kind: 'empty_comfort', pattern: /空口|只会说|先安抚|再看看|再说|别空口|先等等/ },
  { kind: 'ignores_customer', pattern: /客户|业主|问题|关切|诉求/ },
  { kind: 'overpromise', pattern: /一定|肯定|包|保证|绝对/ },
  { kind: 'price_pressure_too_fast', pattern: /立刻降价|马上调价|今天就调|马上降/ },
  { kind: 'offensive_reply', pattern: /傻逼|滚|闭嘴|废物|煞笔|沙币|爱咋咋地/ },
];

const NEXT_STEP_SCORES: Record<ConversationNextStepKind, number> = {
  none: 0,
  open_case: 1,
  follow_customer: 2,
  review_price: 2,
  prepare_competition_comparison: 3,
  schedule_face_visit: 4,
  confirm_price_adjustment: 5,
};

export function buildShadowComparisonReport(input: ShadowComparisonInput): ShadowComparisonReport {
  const focusTerms = resolveFocusTerms(input.sourceText, input.focusTerms);
  const criticalRiskKinds = resolveCriticalRiskKinds(input.sourceText, input.criticalRiskKinds);

  const ruleMetrics = buildCandidateMetrics(input.ruleProposal, focusTerms, criticalRiskKinds);
  const aiMetrics = buildCandidateMetrics(input.aiProposal, focusTerms, criticalRiskKinds);

  const dimensions = buildDimensions(ruleMetrics, aiMetrics, focusTerms, criticalRiskKinds);
  const overallScore = buildOverallScore(ruleMetrics, aiMetrics, focusTerms, criticalRiskKinds);
  const overallWinner = resolveWinner(overallScore.rule, overallScore.ai);
  const signals = buildSignals(input, focusTerms, criticalRiskKinds, dimensions, overallWinner);

  return Object.freeze({
    comparisonId: `shadow-compare:${input.scopeType}:${input.scopeId}`,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    sourceText: input.sourceText,
    focusTerms: Object.freeze([...focusTerms]),
    criticalRiskKinds: Object.freeze([...criticalRiskKinds]),
    rule: buildCandidateView('rule', input.ruleProposal, ruleMetrics),
    ai: buildCandidateView('ai', input.aiProposal, aiMetrics),
    dimensions: Object.freeze(dimensions),
    overallWinner,
    overallScore,
    signals: Object.freeze(signals),
    summary: buildSummary(input, focusTerms, criticalRiskKinds, dimensions, overallWinner, overallScore),
  });
}

export function summarizeShadowComparisonReport(report: ShadowComparisonReport): string {
  return report.summary;
}

function buildCandidateView(
  label: string,
  proposal: ConversationEffectProposal,
  metrics: CandidateMetrics,
): ShadowComparisonCandidateView {
  return Object.freeze({
    label,
    summary: proposal.summary,
    recipientReply: proposal.recipientReply,
    intentKinds: Object.freeze([...proposal.intentKinds]),
    riskKinds: Object.freeze([...proposal.riskKinds]),
    nextStepKind: metrics.nextStepKind,
    nextStepLabel: metrics.nextStepLabel,
    confidence: proposal.confidence,
    riskScore: metrics.riskScore,
    coreIssueCoverage: metrics.coreIssueCoverage,
  });
}

function buildCandidateMetrics(
  proposal: ConversationEffectProposal,
  focusTerms: readonly string[],
  criticalRiskKinds: readonly ConversationRiskKind[],
): CandidateMetrics {
  const nextStep = proposal.nextStep ?? null;
  const nextStepKind = nextStep?.kind ?? 'none';
  const nextStepLabel = nextStep?.label ?? '无';
  const riskHits = resolveRiskHits(proposal.riskKinds, criticalRiskKinds);
  const coreIssueHits = resolveCoreIssueHits(proposal, focusTerms);

  return {
    riskScore: riskHits.length,
    riskHits,
    coreIssueCoverage: coreIssueHits.length,
    coreIssueHits,
    nextStepScore: scoreNextStep(nextStep),
    nextStepKind,
    nextStepLabel,
  };
}

function buildDimensions(
  ruleMetrics: CandidateMetrics,
  aiMetrics: CandidateMetrics,
  focusTerms: readonly string[],
  criticalRiskKinds: readonly ConversationRiskKind[],
): ShadowComparisonDimensionResult[] {
  const riskWinner = resolveWinner(ruleMetrics.riskScore, aiMetrics.riskScore);
  const nextStepWinner = resolveWinner(ruleMetrics.nextStepScore, aiMetrics.nextStepScore);
  const coreIssueWinner = resolveWinner(ruleMetrics.coreIssueCoverage, aiMetrics.coreIssueCoverage);

  return [
    Object.freeze({
      id: 'risk_hit' as const,
      winner: riskWinner,
      ruleScore: ruleMetrics.riskScore,
      aiScore: aiMetrics.riskScore,
      summary: buildRiskSummary(ruleMetrics, aiMetrics, criticalRiskKinds),
      signals: Object.freeze([
        `risk_hit:${riskWinner}`,
        ...buildRiskSignals(ruleMetrics, aiMetrics, criticalRiskKinds),
      ]),
    }),
    Object.freeze({
      id: 'next_step' as const,
      winner: nextStepWinner,
      ruleScore: ruleMetrics.nextStepScore,
      aiScore: aiMetrics.nextStepScore,
      summary: buildNextStepSummary(ruleMetrics, aiMetrics),
      signals: Object.freeze([`next_step:${nextStepWinner}`]),
    }),
    Object.freeze({
      id: 'core_issue' as const,
      winner: coreIssueWinner,
      ruleScore: ruleMetrics.coreIssueCoverage,
      aiScore: aiMetrics.coreIssueCoverage,
      summary: buildCoreIssueSummary(ruleMetrics, aiMetrics, focusTerms),
      signals: Object.freeze([`core_issue:${coreIssueWinner}`]),
    }),
  ];
}

function buildOverallScore(
  ruleMetrics: CandidateMetrics,
  aiMetrics: CandidateMetrics,
  focusTerms: readonly string[],
  criticalRiskKinds: readonly ConversationRiskKind[],
): { readonly rule: number; readonly ai: number; readonly delta: number } {
  const riskMax = Math.max(1, criticalRiskKinds.length);
  const coreMax = Math.max(1, focusTerms.length);
  const rule = round2(
    scale(ruleMetrics.riskScore, riskMax, 35) +
    scale(ruleMetrics.nextStepScore, 5, 35) +
    scale(ruleMetrics.coreIssueCoverage, coreMax, 30),
  );
  const ai = round2(
    scale(aiMetrics.riskScore, riskMax, 35) +
    scale(aiMetrics.nextStepScore, 5, 35) +
    scale(aiMetrics.coreIssueCoverage, coreMax, 30),
  );
  return Object.freeze({ rule, ai, delta: round2(ai - rule) });
}

function buildSignals(
  input: ShadowComparisonInput,
  focusTerms: readonly string[],
  criticalRiskKinds: readonly ConversationRiskKind[],
  dimensions: readonly ShadowComparisonDimensionResult[],
  overallWinner: ShadowComparisonWinner,
): string[] {
  const signals: string[] = [
    `scope:${input.scopeType}`,
    `overall:${overallWinner}`,
  ];
  for (const dimension of dimensions) {
    signals.push(`dimension:${dimension.id}:${dimension.winner}`);
  }
  for (const term of focusTerms.slice(0, 6)) {
    signals.push(`focus_term:${term}`);
  }
  for (const riskKind of criticalRiskKinds) {
    signals.push(`critical_risk:${riskKind}`);
  }
  return signals;
}

function buildSummary(
  input: ShadowComparisonInput,
  focusTerms: readonly string[],
  criticalRiskKinds: readonly ConversationRiskKind[],
  dimensions: readonly ShadowComparisonDimensionResult[],
  overallWinner: ShadowComparisonWinner,
  overallScore: { readonly rule: number; readonly ai: number; readonly delta: number },
): string {
  const winnerLabel = overallWinner === 'ai' ? 'AI' : overallWinner === 'rule' ? '规则' : '平局';
  const dominantDimensions = dimensions.filter((dimension) => dimension.winner === overallWinner).map((dimension) => dimension.id);
  const focusText = focusTerms.length > 0 ? `焦点 ${focusTerms.slice(0, 4).join('、')}` : '无焦点词';
  const riskText = criticalRiskKinds.length > 0 ? `关键风险 ${criticalRiskKinds.join('、')}` : '无关键风险';
  return [
    `${formatScope(input.scopeType)} ${input.scopeId} 对照`,
    `${winnerLabel} 领先 ${dominantDimensions.length}/${dimensions.length} 个维度`,
    `分数 rule=${overallScore.rule.toFixed(1)} ai=${overallScore.ai.toFixed(1)} delta=${overallScore.delta.toFixed(1)}`,
    focusText,
    riskText,
  ].join('；');
}

function buildRiskSummary(
  ruleMetrics: CandidateMetrics,
  aiMetrics: CandidateMetrics,
  criticalRiskKinds: readonly ConversationRiskKind[],
): string {
  if (criticalRiskKinds.length === 0) {
    return `rule 命中 ${ruleMetrics.riskScore} 个风险，AI 命中 ${aiMetrics.riskScore} 个风险。`;
  }
  const ruleHits = joinList(ruleMetrics.riskHits, '、') || '无';
  const aiHits = joinList(aiMetrics.riskHits, '、') || '无';
  return `关键风险 ${joinList(criticalRiskKinds, '、')}；rule 命中 ${ruleMetrics.riskScore}（${ruleHits}），AI 命中 ${aiMetrics.riskScore}（${aiHits}）。`;
}

function buildNextStepSummary(ruleMetrics: CandidateMetrics, aiMetrics: CandidateMetrics): string {
  return `rule 下一步 ${ruleMetrics.nextStepKind}，AI 下一步 ${aiMetrics.nextStepKind}。`;
}

function buildCoreIssueSummary(
  ruleMetrics: CandidateMetrics,
  aiMetrics: CandidateMetrics,
  focusTerms: readonly string[],
): string {
  const focusText = focusTerms.length > 0 ? joinList(focusTerms, '、') : '自动推断焦点';
  const ruleHits = joinList(ruleMetrics.coreIssueHits, '、') || '无';
  const aiHits = joinList(aiMetrics.coreIssueHits, '、') || '无';
  return `核心问题 ${focusText}；rule 覆盖 ${ruleMetrics.coreIssueCoverage}（${ruleHits}），AI 覆盖 ${aiMetrics.coreIssueCoverage}（${aiHits}）。`;
}

function buildRiskSignals(
  ruleMetrics: CandidateMetrics,
  aiMetrics: CandidateMetrics,
  criticalRiskKinds: readonly ConversationRiskKind[],
): string[] {
  const signals: string[] = [];
  for (const riskKind of criticalRiskKinds) {
    if (ruleMetrics.riskHits.includes(riskKind) || aiMetrics.riskHits.includes(riskKind)) {
      signals.push(`source_hint:${riskKind}`);
    }
  }
  return signals;
}

function resolveFocusTerms(sourceText: string, explicitFocusTerms?: readonly string[]): string[] {
  const explicit = sanitizeTerms(explicitFocusTerms || []);
  if (explicit.length > 0) {
    return explicit;
  }
  const derived = SOURCE_HINT_PATTERNS
    .filter((item) => item.pattern.test(sourceText))
    .map((item) => item.term);
  return derived.length > 0 ? derived : ['对话意图'];
}

function resolveCriticalRiskKinds(
  sourceText: string,
  explicitRiskKinds?: readonly ConversationRiskKind[],
): ConversationRiskKind[] {
  const explicit = dedupeRiskKinds(explicitRiskKinds || []);
  if (explicit.length > 0) {
    return explicit;
  }
  const inferred = CRITICAL_RISK_PATTERNS
    .filter((item) => item.pattern.test(sourceText))
    .map((item) => item.kind);
  return dedupeRiskKinds(inferred);
}

function resolveRiskHits(
  riskKinds: readonly ConversationRiskKind[],
  criticalRiskKinds: readonly ConversationRiskKind[],
): ConversationRiskKind[] {
  const hits: ConversationRiskKind[] = [];
  const riskSet = new Set(riskKinds);
  for (const riskKind of criticalRiskKinds) {
    if (riskSet.has(riskKind)) {
      hits.push(riskKind);
    }
  }
  return hits;
}

function resolveCoreIssueHits(
  proposal: ConversationEffectProposal,
  focusTerms: readonly string[],
): string[] {
  const content = normalizeText([proposal.summary, proposal.recipientReply, proposal.nextStep?.label ?? '', proposal.nextStep?.reason ?? ''].join(' '));
  const hits: string[] = [];
  for (const term of focusTerms) {
    if (normalizeText(term) && content.includes(normalizeText(term))) {
      hits.push(term);
    }
  }
  return hits;
}

function scoreNextStep(nextStep: ConversationNextStepDraft | null): number {
  if (!nextStep) return 0;
  const base = NEXT_STEP_SCORES[nextStep.kind];
  const detailBonus = nextStep.actionId ? 1 : 0;
  const priorityBonus = nextStep.priority === 'urgent' || nextStep.priority === 'high' ? 1 : 0;
  return base + detailBonus + priorityBonus;
}

function resolveWinner(ruleScore: number, aiScore: number): ShadowComparisonWinner {
  if (aiScore > ruleScore) return 'ai';
  if (ruleScore > aiScore) return 'rule';
  return 'tie';
}

function scale(value: number, max: number, weight: number): number {
  if (max <= 0) return 0;
  const bounded = Math.max(0, Math.min(value, max));
  return (bounded / max) * weight;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?；;：:（）()【】\[\]<>《》"'“”‘’\-_/\\|]/g, '');
}

function sanitizeTerms(terms: readonly string[]): string[] {
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    const trimmed = term.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    cleaned.push(trimmed);
  }
  return cleaned;
}

function dedupeRiskKinds(riskKinds: readonly ConversationRiskKind[]): ConversationRiskKind[] {
  const cleaned: ConversationRiskKind[] = [];
  const seen = new Set<ConversationRiskKind>();
  for (const riskKind of riskKinds) {
    if (riskKind === 'none' || seen.has(riskKind)) {
      continue;
    }
    seen.add(riskKind);
    cleaned.push(riskKind);
  }
  return cleaned;
}

function formatScope(scopeType: ShadowComparisonScopeType): string {
  return scopeType === 'conversation' ? '会话' : 'case';
}

function joinList(values: readonly string[], separator: string): string {
  return values.length > 0 ? values.join(separator) : '';
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
