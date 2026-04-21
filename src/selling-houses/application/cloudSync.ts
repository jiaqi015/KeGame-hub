import type { CaseFinalResult, FinalResult, GameState } from '../domain/models.js';
import { resolveFormalSoldCount } from '../domain/runtimeStats.js';

export type MaintainerRunStatus = 'active' | 'finished' | 'abandoned';

export interface MaintainerAuxiliaryStats {
  commission: number;
  promotionBudget: number;
  wordOfMouth: number;
  soldCount: number;
  withdrawnCount: number;
}

export interface MaintainerFinalStats {
  title: string;
  summary: string;
  stats: Array<{ label: string; value: string }>;
  score: number;
  grade?: string;
  targetScore?: number;
  endingStats?: FinalResult['endingStats'];
  caseResults: CaseFinalResult[];
  auxiliaryStats: MaintainerAuxiliaryStats;
}

export interface MaintainerRunRecord {
  runId: string;
  accountId?: string;
  playerProfileId?: string;
  userId: string;
  playerName: string;
  status: MaintainerRunStatus;
  seasonId: string;
  scenarioId?: string | null;
  difficultyId?: string | null;
  worldId?: string | null;
  worldVersion?: number | null;
  rngSeed?: number | null;
  schemaVersion: number;
  day: number;
  /** Compatibility mirror for persisted promotion budget columns. Prefer auxiliaryStats.promotionBudget in new code. */
  cash: number;
  energy: number;
  auxiliaryStats: MaintainerAuxiliaryStats;
  score: number | null;
  syncVersion: number;
  saveData: GameState;
  dailyLogs: unknown[];
  startedAt: string;
  finishedAt: string | null;
  lastPlayedAt: string;
  clientUpdatedAt: string | null;
  updatedAt: string;
}

export interface MaintainerCreateRunCommand {
  runOwnerId: string;
  accountId?: string;
  playerProfileId?: string;
  playerName?: string;
  seasonId?: string;
  state: GameState;
  clientUpdatedAt?: string | null;
}

export interface MaintainerSaveRunCommand {
  runId: string;
  runOwnerId: string;
  accountId?: string;
  playerProfileId?: string;
  playerName?: string;
  seasonId?: string;
  state: GameState;
  expectedSyncVersion: number;
  clientUpdatedAt?: string | null;
}

export type MaintainerCreateRunRequest = Omit<MaintainerCreateRunCommand, 'runOwnerId'> & {
  /** Compatibility owner used by activation-key legacy flows. Authenticated session requests may omit it. */
  userId?: string;
};

export type MaintainerSaveRunRequest = Omit<MaintainerSaveRunCommand, 'runOwnerId'> & {
  /** Compatibility owner used by activation-key legacy flows. Authenticated session requests may omit it. */
  userId?: string;
};

export interface MaintainerLeaderboardEntry {
  runId: string;
  accountId?: string;
  playerProfileId?: string;
  userId: string;
  playerName: string;
  seasonId: string;
  score: number;
  rankTitle: string;
  finalStats: MaintainerFinalStats;
  scoreBreakdown: Record<string, unknown>;
  finishedAt: string;
  createdAt: string;
}

export type MaintainerLeaderboardCategory = 'total-score' | 'best-score' | 'play-count';

export interface MaintainerLeaderboardCategoryEntry {
  accountId?: string;
  playerProfileId?: string;
  userId: string;
  playerName: string;
  value: number;
}

export interface MaintainerLeaderboardDetail {
  seasonId: string;
  totalScore: MaintainerLeaderboardCategoryEntry[];
  bestScore: MaintainerLeaderboardCategoryEntry[];
  playCount: MaintainerLeaderboardCategoryEntry[];
}

export function resolveLeaderboardOwnerKey(entry: {
  accountId?: string;
  playerProfileId?: string;
  userId: string;
}) {
  if (entry.accountId?.trim()) {
    return `account:${entry.accountId.trim()}`;
  }

  if (entry.playerProfileId?.trim()) {
    return `profile:${entry.playerProfileId.trim()}`;
  }

  return `legacy:${entry.userId.trim()}`;
}

export function normalizePlayerName(value: string | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || '匿名资产顾问';
}

export function deriveRunStatus(state: GameState): MaintainerRunStatus {
  return state.gameOver ? 'finished' : 'active';
}

export function deriveRunScore(state: GameState) {
  if (typeof state.finalResult?.score === 'number') {
    return state.finalResult.score;
  }

  return 0;
}

export function deriveRankTitle(state: GameState) {
  if (state.finalResult?.title) {
    return state.finalResult.title;
  }

  const score = deriveRunScore(state);
  if (score >= 90) return '这局你真的把房子卖顺了';
  if (score >= 75) return '这局基本是你在带着节奏走';
  if (score >= 60) return '至少把最关键的部分撑住了';
  return '这局还是没能把情况扳回来';
}

export function buildScoreBreakdown(state: GameState) {
  if (Array.isArray(state.finalResult?.scoreBreakdown) && state.finalResult.scoreBreakdown.length > 0) {
    return {
      dimensions: state.finalResult.scoreBreakdown,
      targetScore: state.finalResult.targetScore,
      grade: state.finalResult.grade,
      endingStats: state.finalResult.endingStats,
    };
  }

  return {
    dimensions: [],
    note: '这局还没有生成新的房源结局结算。',
  };
}

export function buildFinalStats(state: GameState) {
  const auxiliaryStats = state.auxiliaryStats;
  const soldCount = resolveFormalSoldCount(state);
  return {
    title: state.finalResult?.title || deriveRankTitle(state),
    summary:
      state.finalResult?.summary
      || '这局还没有生成新的房源结局结算。',
    stats: Array.isArray(state.finalResult?.stats) ? state.finalResult.stats : [],
    score: deriveRunScore(state),
    grade: state.finalResult?.grade,
    targetScore: state.finalResult?.targetScore,
    endingStats: state.finalResult?.endingStats,
    caseResults: Array.isArray(state.finalResult?.caseResults) ? state.finalResult.caseResults : [],
    auxiliaryStats: {
      commission: auxiliaryStats.commission,
      promotionBudget: auxiliaryStats.promotionBudget,
      wordOfMouth: auxiliaryStats.wordOfMouth,
      soldCount,
      withdrawnCount: auxiliaryStats.withdrawnCount,
    },
  } satisfies MaintainerFinalStats;
}
