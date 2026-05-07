/**
 * Runtime re-export of core receipt builder.
 *
 * The implementation lives in core/world-state/competition/receiptBuilder.ts.
 */

export {
  pressureInputToSignal,
  pressureInputToEvidence,
  buildCompetitionPressureSnapshots,
  buildDecisionPressureDeltas,
  buildCompetitionPOV,
} from '../../../core/world-state/competition/receiptBuilder.js';
