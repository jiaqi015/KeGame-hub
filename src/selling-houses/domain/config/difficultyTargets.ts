import type { DifficultyId, ScoreThresholds } from '../models.js';

export const PLAYER_TARGET_SCORE_BY_DIFFICULTY: Record<DifficultyId, number> = {
  warmup: 58,
  easy: 64,
  standard: 72,
  advanced: 78,
  hard: 84,
  extreme: 88,
};

export function targetScoreForDifficulty(difficultyId: DifficultyId) {
  return PLAYER_TARGET_SCORE_BY_DIFFICULTY[difficultyId];
}

export function scoreThresholdsForTarget(targetScore: number): ScoreThresholds {
  return {
    pass: Math.max(42, targetScore - 12),
    strong: Math.min(94, targetScore + 12),
    ace: Math.min(98, targetScore + 20),
  };
}
