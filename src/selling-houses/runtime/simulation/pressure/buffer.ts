/**
 * Runtime re-export of core buffer.
 *
 * The buffer implementation lives in core/world-state/competition/pressureBuffer.ts
 * so that domain code can import it without crossing the domain->runtime boundary.
 * This file re-exports everything for runtime consumers and adds the convenience
 * buildPressureReceiptsFromInputs helper.
 */

export type { PressureCollectionBuffer } from '../../../core/world-state/competition/pressureBuffer.js';

export {
  createPressureCollectionBuffer,
  buildPressureReceiptsFromBuffer,
  resetPressureCollectionBuffer,
} from '../../../core/world-state/competition/pressureBuffer.js';

export type { PressureReceiptBundle, PressureInput } from '../../../core/world-state/competition/models.js';

import {
  createPressureCollectionBuffer as _createBuffer,
  buildPressureReceiptsFromBuffer as _finalize,
} from '../../../core/world-state/competition/pressureBuffer.js';
import type { PressureInput as _PressureInput, PressureReceiptBundle as _Bundle } from '../../../core/world-state/competition/models.js';

/**
 * Convenience: takes a list of PressureInputs and returns a frozen PressureReceiptBundle.
 * Useful for tests and callers that don't need incremental collection.
 */
export function buildPressureReceiptsFromInputs(
  inputs: readonly _PressureInput[],
  day: number,
): _Bundle {
  const buffer = _createBuffer(day);
  inputs.forEach((input) => buffer.collectPressure(input));
  return _finalize(buffer);
}
