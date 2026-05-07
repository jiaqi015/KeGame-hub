/**
 * Runtime pressure module — re-exports from core + runtime-specific helpers.
 */

// Types from core
export type {
  PressureInput,
  PressureInputSource,
  PressureReceiptSink,
  PressureReceiptBundle,
  CompetitionEvidence,
  CompetitionEvidenceKind,
  CompetitionPOV,
  CompetitionPOVActor,
  CompetitionPressureSnapshot,
  ConstraintSignal,
  ConstraintSignalDimension,
  ConstraintSignalSource,
  ConstraintSignalTargetEntityKind,
  DecisionPressureDelta,
  DecisionPressureDimension,
} from '../../../core/world-state/competition/models.js';

// Receipt builder from core
export {
  pressureInputToSignal,
  pressureInputToEvidence,
  buildCompetitionPressureSnapshots,
  buildDecisionPressureDeltas,
  buildCompetitionPOV,
} from '../../../core/world-state/competition/receiptBuilder.js';

// Buffer from core (re-exported via local buffer.ts which adds convenience helpers)
export type { PressureCollectionBuffer } from './buffer.js';

export {
  createPressureCollectionBuffer,
  buildPressureReceiptsFromBuffer,
  resetPressureCollectionBuffer,
  buildPressureReceiptsFromInputs,
} from './buffer.js';
