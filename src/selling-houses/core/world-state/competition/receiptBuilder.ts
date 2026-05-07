/**
 * Pressure receipt builder — pure functions, lives in core.
 *
 * Takes PressureInputs and produces CompetitionPressureSnapshot[],
 * DecisionPressureDelta[], and CompetitionPOV.
 */

import type {
  CompetitionEvidence,
  CompetitionPressureSnapshot,
  ConstraintSignal,
  DecisionPressureDelta,
  PressureInput,
  CompetitionPOV,
} from './models.js';

// ---------------------------------------------------------------------------
// PressureInput -> ConstraintSignal
// ---------------------------------------------------------------------------

function mapLegacySourceToSignalSource(
  source: PressureInput['source'],
): ConstraintSignal['source'] {
  switch (source) {
    case 'rival-pressure': return 'rival-listing';
    case 'competition-group': return 'competition-group';
    case 'competition-rival-loss': return 'competition-group';
    case 'company-pressure': return 'company-pressure';
    case 'customer-feedback': return 'customer-feedback';
    case 'rival-customer-pull': return 'rival-customer-pull';
    case 'random-event': return 'random-event';
    case 'scripted-event': return 'scripted-event';
  }
}

function mapSourceToTargetEntityKind(
  source: PressureInput['source'],
  hasOpportunity: boolean,
): ConstraintSignal['targetEntityKind'] {
  if (source === 'rival-customer-pull') return 'customer-runtime';
  if (hasOpportunity) return 'opportunity';
  return 'case';
}

export function pressureInputToSignal(input: PressureInput, index: number): ConstraintSignal {
  const targetEntityKind = mapSourceToTargetEntityKind(
    input.source,
    (input.opportunityIds?.length ?? 0) > 0,
  );
  // For customer-runtime targets, prefer the actual customer runtime ID
  // over the generic caseId fallback.
  const targetEntityId = targetEntityKind === 'customer-runtime'
    ? (input.customerRuntimeIds?.[0] ?? input.caseId)
    : input.caseId;
  return {
    id: `signal:${input.source}:${input.caseId}:${input.day}:${index}`,
    source: mapLegacySourceToSignalSource(input.source),
    targetEntityKind,
    targetEntityId,
    dimension: input.dimension,
    magnitude: input.magnitude,
    evidence: input.evidence,
    day: input.day,
  };
}

// ---------------------------------------------------------------------------
// PressureInput -> CompetitionEvidence
// ---------------------------------------------------------------------------

function inferEvidenceKind(input: PressureInput): CompetitionEvidence['kind'] {
  if (input.evidenceKind) return input.evidenceKind;
  switch (input.source) {
    case 'rival-pressure': return 'rival-price-overlap';
    case 'competition-group': return 'group-premium-penalty';
    case 'competition-rival-loss': return 'rival-loss-window';
    case 'company-pressure': return 'company-shared-lead-pressure';
    case 'customer-feedback': return 'customer-no-active-leads';
    case 'rival-customer-pull': return 'rival-customer-pull-attention';
    case 'random-event': return 'random-event-competitor-activity';
    case 'scripted-event': return 'scripted-event-effect';
  }
}

export function pressureInputToEvidence(input: PressureInput, index: number): CompetitionEvidence {
  return {
    id: `evidence:${input.source}:${input.caseId}:${input.day}:${index}`,
    kind: input.evidenceKind ?? inferEvidenceKind(input),
    sourceEntityId: input.sourceEntityId ?? input.source,
    sourceLabel: input.sourceEntityLabel ?? input.source,
    day: input.day,
    strength: input.evidenceStrength ?? Math.min(100, Math.abs(input.magnitude) * 10),
    detail: input.evidenceDetail ?? input.evidence,
  };
}

// ---------------------------------------------------------------------------
// PressureInput[] -> CompetitionPressureSnapshot[]
// ---------------------------------------------------------------------------

export function buildCompetitionPressureSnapshots(
  inputs: readonly PressureInput[],
): CompetitionPressureSnapshot[] {
  // Build a lookup from input reference to its global index, so signal/evidence
  // IDs stay consistent with the indices used by buildDecisionPressureDeltas.
  const globalIndex = new Map<PressureInput, number>();
  inputs.forEach((input, i) => globalIndex.set(input, i));

  const byCase = new Map<string, PressureInput[]>();
  inputs.forEach((input) => {
    const existing = byCase.get(input.caseId);
    if (existing) {
      existing.push(input);
    } else {
      byCase.set(input.caseId, [input]);
    }
  });

  const snapshots: CompetitionPressureSnapshot[] = [];
  byCase.forEach((caseInputs, caseId) => {
    const signals = caseInputs.map((input) =>
      pressureInputToSignal(input, globalIndex.get(input)!),
    );
    const evidence = caseInputs.map((input) =>
      pressureInputToEvidence(input, globalIndex.get(input)!),
    );

    const netHeatDelta = sumDimension(signals, 'heat');
    const netTrustDelta = sumDimension(signals, 'trust');
    const netUrgencyDelta = sumDimension(signals, 'urgency');
    const intentSignals = signals.filter((signal) => signal.dimension === 'intent');
    const netIntentDelta = intentSignals.length > 0
      ? intentSignals.reduce((sum, signal) => sum + signal.magnitude, 0)
      : undefined;
    const lostToRival = caseInputs.some(
      (input) => input.source === 'competition-rival-loss' && input.dimension === 'heat',
    );
    const hasSignificantPressure = signals.some(
      (signal) => Math.abs(signal.magnitude) >= 3,
    );

    snapshots.push({
      caseId,
      day: caseInputs[0].day,
      signals,
      evidence,
      netHeatDelta,
      netTrustDelta,
      netUrgencyDelta,
      netIntentDelta,
      lostToRival,
      hasSignificantPressure,
    });
  });

  return snapshots;
}

// ---------------------------------------------------------------------------
// PressureInput[] -> DecisionPressureDelta[]
// ---------------------------------------------------------------------------

function inferDecisionPressureDimension(
  input: PressureInput,
): DecisionPressureDelta['dimension'] | null {
  if (input.dimension === 'heat' || input.dimension === 'competitive-pressure') {
    return 'price-adjustment-pressure';
  }
  if (input.dimension === 'trust') {
    return 'trust-repair-pressure';
  }
  if (input.dimension === 'urgency' || input.dimension === 'patience') {
    return 'speed-pressure';
  }
  if (input.dimension === 'intent' || input.dimension === 'confidence') {
    return 'service-quality-pressure';
  }
  return null;
}

export function buildDecisionPressureDeltas(
  inputs: readonly PressureInput[],
): DecisionPressureDelta[] {
  const deltas: DecisionPressureDelta[] = [];

  inputs.forEach((input, globalIndex) => {
    const dimension = inferDecisionPressureDimension(input);
    if (!dimension) return;

    // Each input produces exactly one CompetitionEvidence in buildCompetitionPressureSnapshots.
    // Use the same ID format and globalIndex so the delta points to a real evidence record.
    const evidenceId = `evidence:${input.source}:${input.caseId}:${input.day}:${globalIndex}`;

    deltas.push({
      caseId: input.caseId,
      dimension,
      delta: input.magnitude < 0 ? Math.abs(input.magnitude) : -input.magnitude * 0.5,
      sourceEvidenceIds: [evidenceId],
      day: input.day,
      summary: input.evidence,
    });
  });

  return deltas;
}

// ---------------------------------------------------------------------------
// CompetitionPOV builder
// ---------------------------------------------------------------------------

export function buildCompetitionPOV(
  actor: 'broker' | 'owner' | 'manager',
  day: number,
  snapshots: readonly CompetitionPressureSnapshot[],
  inputs: readonly PressureInput[],
): CompetitionPOV {
  const pressuredCaseIds = snapshots
    .filter((snapshot) => snapshot.hasSignificantPressure)
    .map((snapshot) => snapshot.caseId);

  const allEvidence = snapshots.flatMap((snapshot) => snapshot.evidence);
  const topEvidence = [...allEvidence]
    .sort((left, right) => right.strength - left.strength)
    .slice(0, 5);

  const activeRivalCount = new Set(
    inputs
      .filter((input) => input.source === 'rival-pressure' || input.source === 'rival-customer-pull')
      .map((input) => input.sourceEntityId)
      .filter(Boolean),
  ).size;

  const companyPressureActive = inputs.some(
    (input) => input.source === 'company-pressure',
  );

  return {
    actor,
    day,
    pressuredCaseIds,
    topEvidence,
    headline: buildHeadline(pressuredCaseIds.length, topEvidence, companyPressureActive),
    activeRivalCount,
    companyPressureActive,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sumDimension(
  signals: readonly ConstraintSignal[],
  dimension: ConstraintSignal['dimension'],
): number {
  return signals
    .filter((signal) => signal.dimension === dimension)
    .reduce((sum, signal) => sum + signal.magnitude, 0);
}

function buildHeadline(
  pressuredCount: number,
  topEvidence: readonly CompetitionEvidence[],
  companyPressureActive: boolean,
): string {
  if (pressuredCount === 0) {
    return '当前无显著竞争压力。';
  }
  const topKind = topEvidence[0]?.kind;
  const parts: string[] = [];
  parts.push(`${pressuredCount} 套房面临竞争压力。`);
  if (topKind?.startsWith('rival-')) {
    parts.push('主要来自竞品房源。');
  } else if (topKind?.startsWith('group-')) {
    parts.push('主要来自同类房源竞争组。');
  } else if (topKind?.startsWith('company-')) {
    parts.push('主要来自公司内部竞争。');
  } else if (topKind?.startsWith('customer-')) {
    parts.push('主要来自客户行为变化。');
  }
  if (companyPressureActive) {
    parts.push('公司压力已激活。');
  }
  return parts.join(' ');
}
