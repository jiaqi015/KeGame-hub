import type {
  MaintainerCreateRunCommand,
  MaintainerLeaderboardEntry,
  MaintainerRunRecord,
  MaintainerSaveRunCommand,
} from '../application/cloudSync.js';
import {
  buildFinalStats,
  buildScoreBreakdown,
  deriveRankTitle,
  deriveRunScore,
  deriveRunStatus,
  normalizePlayerName,
} from '../application/cloudSync.js';
import { withSellingHousesNeon } from './neonGameDatabase.js';

interface GameRunRow {
  run_id: string;
  user_id: string;
  player_name: string;
  status: string;
  season_id: string;
  scenario_id: string | null;
  difficulty_id: string | null;
  world_id: string | null;
  world_version: number | null;
  rng_seed: number | string | null;
  schema_version: number;
  day: number;
  cash: number | string;
  energy: number;
  reputation: number | string;
  sold_count: number;
  withdrawn_count: number;
  score: number | null;
  sync_version: number | string;
  scenario_snapshot: unknown;
  save_data: unknown;
  daily_logs: unknown;
  started_at: string;
  finished_at: string | null;
  last_played_at: string;
  client_updated_at: string | null;
  updated_at: string;
}

interface LeaderboardRow {
  run_id: string;
  user_id: string;
  player_name: string;
  season_id: string;
  score: number | string;
  rank_title: string;
  final_stats: unknown;
  score_breakdown: unknown;
  finished_at: string;
  created_at: string;
}

function toNumber(value: unknown) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toJsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  return (value as T) ?? fallback;
}

function mapRunRow(row: GameRunRow): MaintainerRunRecord {
  const saveData = toJsonValue(row.save_data, null) as MaintainerRunRecord['saveData'];
  return {
    runId: row.run_id,
    userId: row.user_id,
    playerName: row.player_name,
    status: row.status as MaintainerRunRecord['status'],
    seasonId: row.season_id,
    scenarioId: row.scenario_id,
    difficultyId: row.difficulty_id,
    worldId: row.world_id,
    worldVersion: row.world_version,
    rngSeed: row.rng_seed == null ? null : toNumber(row.rng_seed),
    schemaVersion: row.schema_version,
    day: row.day,
    cash: toNumber(row.cash),
    energy: row.energy,
    commission: typeof saveData === 'object' && saveData ? toNumber((saveData as { commission?: unknown }).commission) : 0,
    reputation: toNumber(row.reputation),
    soldCount: row.sold_count,
    withdrawnCount: row.withdrawn_count,
    score: row.score,
    syncVersion: toNumber(row.sync_version),
    saveData,
    dailyLogs: toJsonValue(row.daily_logs, []),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    lastPlayedAt: row.last_played_at,
    clientUpdatedAt: row.client_updated_at,
    updatedAt: row.updated_at,
  };
}

function mapLeaderboardRow(row: LeaderboardRow): MaintainerLeaderboardEntry {
  return {
    runId: row.run_id,
    userId: row.user_id,
    playerName: row.player_name,
    seasonId: row.season_id,
    score: toNumber(row.score),
    rankTitle: row.rank_title,
    finalStats: toJsonValue(row.final_stats, {}),
    scoreBreakdown: toJsonValue(row.score_breakdown, {}),
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  };
}

function resolveClientUpdatedAt(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value : null;
}

export class MaintainerSyncConflictError extends Error {
  latest: MaintainerRunRecord | null;

  constructor(latest: MaintainerRunRecord | null) {
    super('云端进度已更新，请先同步最新存档。');
    this.name = 'MaintainerSyncConflictError';
    this.latest = latest;
  }
}

export class NeonGameRunRepository {
  private async touchUser(userId: string, playerName?: string) {
    await withSellingHousesNeon(async (sql) => {
      await sql.query(
        `
          INSERT INTO maintainer_users (user_id, display_name, last_seen_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (user_id)
          DO UPDATE SET
            display_name = CASE
              WHEN EXCLUDED.display_name = '匿名维护人' THEN maintainer_users.display_name
              ELSE EXCLUDED.display_name
            END,
            last_seen_at = NOW()
        `,
        [userId, normalizePlayerName(playerName)],
      );
    });
  }

  private async upsertLeaderboard(run: MaintainerRunRecord) {
    if (run.status !== 'finished') {
      return;
    }

    await withSellingHousesNeon(async (sql) => {
      await sql.query(
        `
          INSERT INTO maintainer_leaderboard_entries (
            run_id,
            user_id,
            player_name,
            season_id,
            score,
            rank_title,
            final_stats,
            score_breakdown,
            finished_at,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, COALESCE($9::timestamptz, NOW()), NOW())
          ON CONFLICT (run_id)
          DO UPDATE SET
            user_id = EXCLUDED.user_id,
            player_name = EXCLUDED.player_name,
            season_id = EXCLUDED.season_id,
            score = EXCLUDED.score,
            rank_title = EXCLUDED.rank_title,
            final_stats = EXCLUDED.final_stats,
            score_breakdown = EXCLUDED.score_breakdown,
            finished_at = EXCLUDED.finished_at
        `,
        [
          run.runId,
          run.userId,
          run.playerName,
          run.seasonId,
          run.score ?? deriveRunScore(run.saveData),
          deriveRankTitle(run.saveData),
          JSON.stringify(buildFinalStats(run.saveData)),
          JSON.stringify(buildScoreBreakdown(run.saveData)),
          run.finishedAt,
        ],
      );
    });
  }

  async createRun(command: MaintainerCreateRunCommand & { runId: string }) {
    const playerName = normalizePlayerName(command.playerName);
    const seasonId = command.seasonId || 'season-1';
    const status = deriveRunStatus(command.state);
    const score = status === 'finished' ? deriveRunScore(command.state) : null;
    const runContext = command.state.runContext;

    await this.touchUser(command.userId, playerName);

    const created = await withSellingHousesNeon(async (sql) => {
      const rows = await sql.query(
        `
          INSERT INTO maintainer_game_runs (
            run_id,
            user_id,
            player_name,
            status,
            season_id,
            scenario_id,
            difficulty_id,
            world_id,
            world_version,
            rng_seed,
            schema_version,
            day,
            cash,
            energy,
            reputation,
            sold_count,
            withdrawn_count,
            score,
            sync_version,
            scenario_snapshot,
            save_data,
            daily_logs,
            started_at,
            finished_at,
            last_played_at,
            client_updated_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15,
            $16,
            $17,
            $18,
            1,
            $19::jsonb,
            $20::jsonb,
            $21::jsonb,
            NOW(),
            CASE WHEN $4 = 'finished' THEN NOW() ELSE NULL END,
            NOW(),
            $22::timestamptz,
            NOW()
          )
          RETURNING
            run_id,
            user_id,
            player_name,
            status,
            season_id,
            scenario_id,
            difficulty_id,
            world_id,
            world_version,
            rng_seed,
            schema_version,
            day,
            cash,
            energy,
            reputation,
            sold_count,
            withdrawn_count,
            score,
            sync_version,
            scenario_snapshot,
            save_data,
            daily_logs,
            started_at,
            finished_at,
            last_played_at,
            client_updated_at,
            updated_at
        `,
        [
          command.runId,
          command.userId,
          playerName,
          status,
          seasonId,
          runContext?.scenarioId || null,
          runContext?.difficultyId || null,
          runContext?.worldId || null,
          runContext?.worldVersion || null,
          runContext?.rngSeed || null,
          command.state.version,
          command.state.day,
          command.state.cash,
          command.state.energy,
          command.state.reputation,
          command.state.soldCount,
          command.state.withdrawnCount,
          score,
          JSON.stringify(runContext?.scenarioSnapshot || null),
          JSON.stringify(command.state),
          JSON.stringify(command.state.eventLog || []),
          resolveClientUpdatedAt(command.clientUpdatedAt),
        ],
      );

      return mapRunRow((rows as GameRunRow[])[0]);
    });

    await this.upsertLeaderboard(created);
    return created;
  }

  async getRun(runId: string, userId: string) {
    return withSellingHousesNeon(async (sql) => {
      const rows = (await sql.query(
        `
          SELECT
            run_id,
            user_id,
            player_name,
            status,
            season_id,
            scenario_id,
            difficulty_id,
            world_id,
            world_version,
            rng_seed,
            schema_version,
            day,
            cash,
            energy,
            reputation,
            sold_count,
            withdrawn_count,
            score,
            sync_version,
            scenario_snapshot,
            save_data,
            daily_logs,
            started_at,
            finished_at,
            last_played_at,
            client_updated_at,
            updated_at
          FROM maintainer_game_runs
          WHERE run_id = $1 AND user_id = $2
          LIMIT 1
        `,
        [runId, userId],
      )) as GameRunRow[];

      return rows[0] ? mapRunRow(rows[0]) : null;
    });
  }

  async listRuns(userId: string, limit: number) {
    return withSellingHousesNeon(async (sql) => {
      const rows = (await sql.query(
        `
          SELECT
            run_id,
            user_id,
            player_name,
            status,
            season_id,
            scenario_id,
            difficulty_id,
            world_id,
            world_version,
            rng_seed,
            schema_version,
            day,
            cash,
            energy,
            reputation,
            sold_count,
            withdrawn_count,
            score,
            sync_version,
            scenario_snapshot,
            save_data,
            daily_logs,
            started_at,
            finished_at,
            last_played_at,
            client_updated_at,
            updated_at
          FROM maintainer_game_runs
          WHERE user_id = $1
          ORDER BY updated_at DESC
          LIMIT $2
        `,
        [userId, Math.max(1, Math.min(limit, 20))],
      )) as GameRunRow[];

      return rows.map(mapRunRow);
    });
  }

  async saveRun(command: MaintainerSaveRunCommand) {
    const playerName = normalizePlayerName(command.playerName);
    const seasonId = command.seasonId || 'season-1';
    const status = deriveRunStatus(command.state);
    const score = status === 'finished' ? deriveRunScore(command.state) : null;
    const runContext = command.state.runContext;

    await this.touchUser(command.userId, playerName);

    const updatedRows = await withSellingHousesNeon(async (sql) => {
      return (await sql.query(
        `
          UPDATE maintainer_game_runs
          SET
            player_name = $3,
            status = $4,
            season_id = $5,
            scenario_id = $6,
            difficulty_id = $7,
            world_id = $8,
            world_version = $9,
            rng_seed = $10,
            schema_version = $11,
            day = $12,
            cash = $13,
            energy = $14,
            reputation = $15,
            sold_count = $16,
            withdrawn_count = $17,
            score = $18,
            sync_version = sync_version + 1,
            scenario_snapshot = $19::jsonb,
            save_data = $20::jsonb,
            daily_logs = $21::jsonb,
            finished_at = CASE
              WHEN $4 = 'finished' THEN COALESCE(finished_at, NOW())
              ELSE NULL
            END,
            last_played_at = NOW(),
            client_updated_at = $22::timestamptz,
            updated_at = NOW()
          WHERE run_id = $1
            AND user_id = $2
            AND sync_version = $23
          RETURNING
            run_id,
            user_id,
            player_name,
            status,
            season_id,
            scenario_id,
            difficulty_id,
            world_id,
            world_version,
            rng_seed,
            schema_version,
            day,
            cash,
            energy,
            reputation,
            sold_count,
            withdrawn_count,
            score,
            sync_version,
            scenario_snapshot,
            save_data,
            daily_logs,
            started_at,
            finished_at,
            last_played_at,
            client_updated_at,
            updated_at
        `,
        [
          command.runId,
          command.userId,
          playerName,
          status,
          seasonId,
          runContext?.scenarioId || null,
          runContext?.difficultyId || null,
          runContext?.worldId || null,
          runContext?.worldVersion || null,
          runContext?.rngSeed || null,
          command.state.version,
          command.state.day,
          command.state.cash,
          command.state.energy,
          command.state.reputation,
          command.state.soldCount,
          command.state.withdrawnCount,
          score,
          JSON.stringify(runContext?.scenarioSnapshot || null),
          JSON.stringify(command.state),
          JSON.stringify(command.state.eventLog || []),
          resolveClientUpdatedAt(command.clientUpdatedAt),
          command.expectedSyncVersion,
        ],
      )) as GameRunRow[];
    });

    const updated = updatedRows[0];
    if (!updated) {
      const latest = await this.getRun(command.runId, command.userId);
      throw new MaintainerSyncConflictError(latest);
    }

    const record = mapRunRow(updated);
    await this.upsertLeaderboard(record);
    return record;
  }

  async listLeaderboard(seasonId = 'season-1', limit = 20) {
    return withSellingHousesNeon(async (sql) => {
      const rows = (await sql.query(
        `
          SELECT
            run_id,
            user_id,
            player_name,
            season_id,
            score,
            rank_title,
            final_stats,
            score_breakdown,
            finished_at,
            created_at
          FROM maintainer_leaderboard_entries
          WHERE season_id = $1
          ORDER BY score DESC, created_at DESC
          LIMIT $2
        `,
        [seasonId, Math.max(1, Math.min(limit, 50))],
      )) as LeaderboardRow[];

      return rows.map(mapLeaderboardRow);
    });
  }
}
