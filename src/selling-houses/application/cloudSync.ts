import type { GameState } from '../domain/models.js';

export type MaintainerRunStatus = 'active' | 'finished' | 'abandoned';

export interface MaintainerRunRecord {
  runId: string;
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
  cash: number;
  energy: number;
  commission: number;
  reputation: number;
  soldCount: number;
  withdrawnCount: number;
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
  userId: string;
  playerName?: string;
  seasonId?: string;
  state: GameState;
  clientUpdatedAt?: string | null;
}

export interface MaintainerSaveRunCommand {
  runId: string;
  userId: string;
  playerName?: string;
  seasonId?: string;
  state: GameState;
  expectedSyncVersion: number;
  clientUpdatedAt?: string | null;
}

export interface MaintainerLeaderboardEntry {
  runId: string;
  userId: string;
  playerName: string;
  seasonId: string;
  score: number;
  rankTitle: string;
  finalStats: Record<string, unknown>;
  scoreBreakdown: Record<string, unknown>;
  finishedAt: string;
  createdAt: string;
}

export function normalizePlayerName(value: string | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || '匿名资产顾问';
}

export function deriveRunStatus(state: GameState): MaintainerRunStatus {
  return state.gameOver ? 'finished' : 'active';
}

export function deriveRunScore(state: GameState) {
  return Math.round(
    state.soldCount * 45
      + state.commission * 1.4
      + state.reputation
      - state.withdrawnCount * 12
      + state.opportunities.filter((entry) => entry.status === 'active').length * 2,
  );
}

export function deriveRankTitle(state: GameState) {
  const score = deriveRunScore(state);
  if (score >= 185) return '能控节奏的成交机器';
  if (score >= 145) return '稳健推进的组合经营者';
  if (score >= 110) return '开始看懂盘面的资产顾问';
  return '还在摸盘的经营者';
}

export function buildScoreBreakdown(state: GameState) {
  return {
    soldCount: state.soldCount,
    commission: state.commission,
    reputation: Math.round(state.reputation),
    withdrawnCount: state.withdrawnCount,
    activeOpportunityCount: state.opportunities.filter((entry) => entry.status === 'active').length,
  };
}

export function buildFinalStats(state: GameState) {
  return {
    title: state.finalResult?.title || deriveRankTitle(state),
    summary:
      state.finalResult?.summary
      || `本局共成交 ${state.soldCount} 单，撤盘 ${state.withdrawnCount} 单，累计佣金 ${state.commission} 万。`,
    stats: Array.isArray(state.finalResult?.stats) ? state.finalResult.stats : [],
    soldCount: state.soldCount,
    withdrawnCount: state.withdrawnCount,
    commission: state.commission,
    reputation: Math.round(state.reputation),
    score: deriveRunScore(state),
  };
}
