/**
 * Re-export from domain layer.
 * The canonical implementation is now in domain/config/difficultyPresentation.ts.
 * This file exists for backward compatibility only.
 */
export {
  buildDifficultyPresentation,
  buildDifficultyPresentationFromRules,
  type DifficultyPresentation,
  type DifficultyPresentationChip,
  type DifficultyPresentationTone,
} from '../domain/config/difficultyPresentation.js';
