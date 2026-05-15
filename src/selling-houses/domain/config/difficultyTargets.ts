import type { DifficultyId, ScoreThresholds } from '../models.js';

export const STANDARD_SCORE_THRESHOLDS: ScoreThresholds = {
  pass: 60,
  strong: 80,
  ace: 90,
};

export const STANDARD_TARGET_SCORE = STANDARD_SCORE_THRESHOLDS.pass;

export const PLAYER_TARGET_SCORE_BY_DIFFICULTY: Record<DifficultyId, number> = {
  warmup: STANDARD_TARGET_SCORE,
  easy: STANDARD_TARGET_SCORE,
  standard: STANDARD_TARGET_SCORE,
  advanced: STANDARD_TARGET_SCORE,
  hard: STANDARD_TARGET_SCORE,
  extreme: STANDARD_TARGET_SCORE,
};

export function targetScoreForDifficulty(difficultyId: DifficultyId) {
  return PLAYER_TARGET_SCORE_BY_DIFFICULTY[difficultyId];
}

export function scoreThresholdsForTarget(_targetScore: number): ScoreThresholds {
  return STANDARD_SCORE_THRESHOLDS;
}
