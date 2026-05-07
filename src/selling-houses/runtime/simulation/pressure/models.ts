/**
 * Runtime pressure models — re-exports from core.
 *
 * PressureInput and PressureInputSource are now defined in core/world-state/competition/models.ts
 * so that domain code can reference them without importing from runtime.
 */

export type {
  PressureInput,
  PressureInputSource,
} from '../../../core/world-state/competition/models.js';
