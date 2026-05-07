/**
 * PressureCollectionBuffer: per-tick scratch buffer for collecting PressureInputs.
 *
 * Lives in core so that domain code can create/use buffers without importing runtime.
 * The buffer itself is a simple mutable array wrapper with no engine dependencies.
 * Finalization (buildPressureReceiptsFromBuffer) produces frozen receipts.
 */

import type {
  CompetitionPOV,
  CompetitionPressureSnapshot,
  DecisionPressureDelta,
  PressureInput,
  PressureReceiptBundle,
  PressureReceiptSink,
} from './models.js';
import {
  buildCompetitionPOV,
  buildCompetitionPressureSnapshots,
  buildDecisionPressureDeltas,
} from './receiptBuilder.js';

// ---------------------------------------------------------------------------
// PressureCollectionBuffer type
// ---------------------------------------------------------------------------

export interface PressureCollectionBuffer extends PressureReceiptSink {
  readonly inputs: PressureInput[];
  readonly createdAtDay: number;
}

// ---------------------------------------------------------------------------
// Buffer lifecycle
// ---------------------------------------------------------------------------

export function createPressureCollectionBuffer(day: number): PressureCollectionBuffer {
  return {
    inputs: [],
    createdAtDay: day,
    collectPressure(input: PressureInput): void {
      this.inputs.push(input);
    },
  };
}

/**
 * Deep-freeze a CompetitionPOV: freeze topEvidence items and pressuredCaseIds.
 */
function deepFreezePOV(pov: CompetitionPOV): CompetitionPOV {
  return Object.freeze({
    ...pov,
    topEvidence: Object.freeze(
      pov.topEvidence.map((ev) => Object.freeze({ ...ev })),
    ),
    pressuredCaseIds: Object.freeze([...pov.pressuredCaseIds]),
  });
}

/**
 * Build all pressure receipts from the buffer.
 * Pure function: reads buffer.inputs, produces deeply frozen receipts.
 *
 * Deep-freeze guarantees:
 * - Each snapshot object is frozen
 * - Each signal inside signals[] is frozen
 * - Each evidence inside evidence[] is frozen
 * - Each decisionDelta is frozen, including sourceEvidenceIds[]
 * - Each POV's topEvidence[] and pressuredCaseIds[] are frozen
 * - The bundle itself is frozen
 */
export function buildPressureReceiptsFromBuffer(
  buffer: PressureCollectionBuffer | null | undefined,
): PressureReceiptBundle {
  const inputs: readonly PressureInput[] = buffer?.inputs ?? [];
  const day = buffer?.createdAtDay ?? 0;

  const rawSnapshots = buildCompetitionPressureSnapshots(inputs);
  const rawDeltas = buildDecisionPressureDeltas(inputs);

  // Deep-freeze snapshots: each signal and evidence item individually frozen
  const snapshots: readonly CompetitionPressureSnapshot[] = Object.freeze(
    rawSnapshots.map((snap) =>
      Object.freeze({
        ...snap,
        signals: Object.freeze(
          snap.signals.map((sig) => Object.freeze({ ...sig })),
        ),
        evidence: Object.freeze(
          snap.evidence.map((ev) => Object.freeze({ ...ev })),
        ),
      }),
    ),
  );

  // Deep-freeze deltas: sourceEvidenceIds array frozen per item
  const decisionDeltas: readonly DecisionPressureDelta[] = Object.freeze(
    rawDeltas.map((delta) =>
      Object.freeze({
        ...delta,
        sourceEvidenceIds: Object.freeze([...delta.sourceEvidenceIds]),
      }),
    ),
  );

  // Build POVs (they reference snapshots which are already frozen)
  const brokerPOV: CompetitionPOV = deepFreezePOV(
    buildCompetitionPOV('broker', day, snapshots, inputs),
  );
  const ownerPOV: CompetitionPOV = deepFreezePOV(
    buildCompetitionPOV('owner', day, snapshots, inputs),
  );
  const managerPOV: CompetitionPOV = deepFreezePOV(
    buildCompetitionPOV('manager', day, snapshots, inputs),
  );

  return Object.freeze({
    snapshots,
    decisionDeltas,
    brokerPOV,
    ownerPOV,
    managerPOV,
    inputCount: inputs.length,
    day,
  });
}

export function resetPressureCollectionBuffer(buffer: PressureCollectionBuffer): void {
  buffer.inputs.length = 0;
}
