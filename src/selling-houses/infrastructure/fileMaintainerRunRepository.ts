import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  MaintainerCreateRunCommand,
  MaintainerLeaderboardCategoryEntry,
  MaintainerLeaderboardDetail,
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
import { buildRuntimeAuxiliaryStats } from '../domain/runtimeStats.js';
import type { MaintainerRunRepository } from '../application/maintainerRunRepository.js';
import { MaintainerSyncConflictError } from '../application/maintainerSyncConflictError.js';
import {
  buildShadowWriteSummary,
  createEmptyShadowWriteSummary,
  type ShadowSyncVerificationSummary,
  type ShadowWriteSummary,
} from '../application/shadowSyncSummary.js';
import { getRuntimeTempDir } from '../../../lib/runtimeTemp.js';

interface FileRunIndexItem {
  runId: string;
  userId: string;
  playerName: string;
  status: MaintainerRunRecord['status'];
  seasonId: string;
  score: number | null;
  updatedAt: string;
}

interface FileRunIndex {
  items: FileRunIndexItem[];
}

interface FileLeaderboardIndex {
  items: MaintainerLeaderboardEntry[];
}

interface FileRunDetail {
  record: MaintainerRunRecord;
}

interface FileShadowSummaryDetail {
  runId: string;
  userId: string;
  updatedAt: string;
  summary: ShadowWriteSummary;
}

function clampLimit(limit: number | undefined, fallback: number, max: number) {
  if (!Number.isFinite(limit)) {
    return fallback;
  }

  return Math.max(1, Math.min(Math.trunc(limit as number), max));
}

function buildLeaderboardCategoryEntries(
  items: MaintainerLeaderboardEntry[],
  resolveValue: (entry: MaintainerLeaderboardEntry) => number,
  combine: (current: number, next: number) => number,
  limit: number,
): MaintainerLeaderboardCategoryEntry[] {
  const aggregated = new Map<string, MaintainerLeaderboardCategoryEntry>();

  for (const item of items) {
    const existing = aggregated.get(item.userId);
    const nextValue = resolveValue(item);

    if (!existing) {
      aggregated.set(item.userId, {
        userId: item.userId,
        playerName: item.playerName,
        value: nextValue,
      });
      continue;
    }

    existing.value = combine(existing.value, nextValue);
    if (!existing.playerName && item.playerName) {
      existing.playerName = item.playerName;
    }
  }

  return [...aggregated.values()]
    .sort((left, right) => {
      if (right.value !== left.value) {
        return right.value - left.value;
      }
      return left.playerName.localeCompare(right.playerName, 'zh-CN');
    })
    .slice(0, clampLimit(limit, 20, 50));
}

function resolveClientUpdatedAt(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function buildAuxiliaryStats(state: MaintainerRunRecord['saveData']) {
  return buildRuntimeAuxiliaryStats(state);
}

function buildRunRecord(
  command: (MaintainerCreateRunCommand & { runId: string }) | MaintainerSaveRunCommand,
  options: {
    previous?: MaintainerRunRecord | null;
    now: string;
  },
): MaintainerRunRecord {
  const previous = options.previous ?? null;
  const state = command.state;
  const status = deriveRunStatus(state);
  const score = status === 'finished' ? deriveRunScore(state) : null;
  const runContext = state.runContext;
  const auxiliaryStats = buildAuxiliaryStats(state);

  return {
    runId: command.runId,
    userId: command.userId,
    playerName: normalizePlayerName(command.playerName),
    status,
    seasonId: command.seasonId || 'season-1',
    scenarioId: runContext?.scenarioId || null,
    difficultyId: runContext?.difficultyId || null,
    worldId: runContext?.worldId || null,
    worldVersion: runContext?.worldVersion ?? null,
    rngSeed: runContext?.rngSeed ?? null,
    schemaVersion: state.version,
    day: state.day,
    cash: auxiliaryStats.promotionBudget,
    energy: state.energy,
    auxiliaryStats,
    score,
    syncVersion: previous ? previous.syncVersion + 1 : 1,
    saveData: state,
    dailyLogs: Array.isArray(state.eventLog) ? state.eventLog : [],
    startedAt: previous?.startedAt || options.now,
    finishedAt: status === 'finished'
      ? (previous?.finishedAt || options.now)
      : null,
    lastPlayedAt: options.now,
    clientUpdatedAt: resolveClientUpdatedAt(command.clientUpdatedAt),
    updatedAt: options.now,
  };
}

function toRunIndexItem(record: MaintainerRunRecord): FileRunIndexItem {
  return {
    runId: record.runId,
    userId: record.userId,
    playerName: record.playerName,
    status: record.status,
    seasonId: record.seasonId,
    score: record.score,
    updatedAt: record.updatedAt,
  };
}

function buildLeaderboardEntry(
  record: MaintainerRunRecord,
  createdAt: string,
): MaintainerLeaderboardEntry {
  return {
    runId: record.runId,
    userId: record.userId,
    playerName: record.playerName,
    seasonId: record.seasonId,
    score: record.score ?? deriveRunScore(record.saveData),
    rankTitle: deriveRankTitle(record.saveData),
    finalStats: buildFinalStats(record.saveData),
    scoreBreakdown: buildScoreBreakdown(record.saveData),
    finishedAt: record.finishedAt || record.updatedAt,
    createdAt,
  };
}

export class FileMaintainerRunRepository implements MaintainerRunRepository {
  private readonly baseDir: string;
  private readonly detailDir: string;
  private readonly shadowDir: string;
  private readonly indexFile: string;
  private readonly leaderboardFile: string;

  constructor(baseDir = getRuntimeTempDir('selling-houses-runtime', 'runs')) {
    this.baseDir = baseDir;
    this.detailDir = path.join(baseDir, 'details');
    this.shadowDir = path.join(baseDir, 'shadow-summaries');
    this.indexFile = path.join(baseDir, 'index.json');
    this.leaderboardFile = path.join(baseDir, 'leaderboard.json');
  }

  async createRun(command: MaintainerCreateRunCommand & { runId: string }): Promise<MaintainerRunRecord> {
    const now = new Date().toISOString();
    const record = buildRunRecord(command, { now });
    await this.ensureDirs();
    await this.writeRunDetail(record);
    await this.upsertRunIndex(record);
    await this.upsertLeaderboard(record);
    await this.writeShadowSummary(record);
    return record;
  }

  async saveRun(command: MaintainerSaveRunCommand): Promise<MaintainerRunRecord> {
    await this.ensureDirs();
    const current = await this.getRun(command.runId, command.userId);
    if (!current || current.syncVersion !== command.expectedSyncVersion) {
      throw new MaintainerSyncConflictError(current);
    }

    const now = new Date().toISOString();
    const record = buildRunRecord(command, {
      previous: current,
      now,
    });

    await this.writeRunDetail(record);
    await this.upsertRunIndex(record);
    await this.upsertLeaderboard(record);
    await this.writeShadowSummary(record);
    return record;
  }

  async getRun(runId: string, userId: string): Promise<MaintainerRunRecord | null> {
    const detail = await this.readRunDetail(runId);
    if (!detail || detail.record.userId !== userId) {
      return null;
    }

    return detail.record;
  }

  async listRuns(userId: string, limit = 8): Promise<MaintainerRunRecord[]> {
    const index = await this.readIndex();
    const selected = index.items
      .filter((item) => item.userId === userId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, clampLimit(limit, 8, 20));

    const details = await Promise.all(selected.map((item) => this.readRunDetail(item.runId)));
    return details
      .map((entry) => entry?.record || null)
      .filter((entry): entry is MaintainerRunRecord => Boolean(entry));
  }

  async listLeaderboard(seasonId = 'season-1', limit = 20): Promise<MaintainerLeaderboardEntry[]> {
    const leaderboard = await this.readLeaderboard();
    return leaderboard.items
      .filter((item) => item.seasonId === seasonId)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return right.createdAt.localeCompare(left.createdAt);
      })
      .slice(0, clampLimit(limit, 20, 50));
  }

  async getLeaderboardDetail(seasonId = 'season-1', limit = 20): Promise<MaintainerLeaderboardDetail> {
    const leaderboard = await this.readLeaderboard();
    const seasonEntries = leaderboard.items.filter((item) => item.seasonId === seasonId);

    return {
      seasonId,
      totalScore: buildLeaderboardCategoryEntries(seasonEntries, (item) => item.score, (current, next) => current + next, limit),
      bestScore: buildLeaderboardCategoryEntries(seasonEntries, (item) => item.score, (current, next) => Math.max(current, next), limit),
      playCount: buildLeaderboardCategoryEntries(seasonEntries, () => 1, (current, next) => current + next, limit),
    };
  }

  async verifyShadowSync(runId: string, userId: string): Promise<ShadowSyncVerificationSummary> {
    const run = await this.getRun(runId, userId);
    if (!run) {
      throw new Error('未找到对应 run，无法校验文件影子摘要。');
    }

    const expected = buildShadowWriteSummary(run.saveData);
    const actual = await this.readShadowSummary(run.runId);

    return {
      runId,
      expected,
      actual: actual?.summary || createEmptyShadowWriteSummary(),
    };
  }

  async rebuildShadowTables(runId: string, userId: string): Promise<ShadowSyncVerificationSummary> {
    const run = await this.getRun(runId, userId);
    if (!run) {
      throw new Error('未找到对应 run，无法重建文件影子摘要。');
    }

    await this.writeShadowSummary(run);
    return this.verifyShadowSync(runId, userId);
  }

  private async ensureDirs() {
    await fs.mkdir(this.detailDir, { recursive: true });
    await fs.mkdir(this.shadowDir, { recursive: true });
  }

  private detailFile(runId: string) {
    return path.join(this.detailDir, `${runId}.json`);
  }

  private shadowFile(runId: string) {
    return path.join(this.shadowDir, `${runId}.json`);
  }

  private async writeRunDetail(record: MaintainerRunRecord) {
    const payload: FileRunDetail = { record };
    await fs.writeFile(this.detailFile(record.runId), JSON.stringify(payload, null, 2), 'utf8');
  }

  private async readRunDetail(runId: string): Promise<FileRunDetail | null> {
    try {
      const content = await fs.readFile(this.detailFile(runId), 'utf8');
      return JSON.parse(content) as FileRunDetail;
    } catch {
      return null;
    }
  }

  private async writeShadowSummary(record: MaintainerRunRecord) {
    const payload: FileShadowSummaryDetail = {
      runId: record.runId,
      userId: record.userId,
      updatedAt: record.updatedAt,
      summary: buildShadowWriteSummary(record.saveData),
    };
    await fs.writeFile(this.shadowFile(record.runId), JSON.stringify(payload, null, 2), 'utf8');
  }

  private async readShadowSummary(runId: string): Promise<FileShadowSummaryDetail | null> {
    try {
      const content = await fs.readFile(this.shadowFile(runId), 'utf8');
      return JSON.parse(content) as FileShadowSummaryDetail;
    } catch {
      return null;
    }
  }

  private async readIndex(): Promise<FileRunIndex> {
    try {
      const content = await fs.readFile(this.indexFile, 'utf8');
      const parsed = JSON.parse(content) as FileRunIndex;
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    } catch {
      return { items: [] };
    }
  }

  private async upsertRunIndex(record: MaintainerRunRecord) {
    const current = await this.readIndex();
    const nextItems = current.items.filter((item) => item.runId !== record.runId);
    nextItems.unshift(toRunIndexItem(record));
    await fs.writeFile(
      this.indexFile,
      JSON.stringify({ items: nextItems }, null, 2),
      'utf8',
    );
  }

  private async readLeaderboard(): Promise<FileLeaderboardIndex> {
    try {
      const content = await fs.readFile(this.leaderboardFile, 'utf8');
      const parsed = JSON.parse(content) as FileLeaderboardIndex;
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    } catch {
      return { items: [] };
    }
  }

  private async upsertLeaderboard(record: MaintainerRunRecord) {
    if (record.status !== 'finished') {
      return;
    }

    const current = await this.readLeaderboard();
    const existing = current.items.find((item) => item.runId === record.runId);
    const nextEntry = buildLeaderboardEntry(record, existing?.createdAt || new Date().toISOString());
    const nextItems = current.items.filter((item) => item.runId !== record.runId);
    nextItems.push(nextEntry);

    await fs.writeFile(
      this.leaderboardFile,
      JSON.stringify({ items: nextItems }, null, 2),
      'utf8',
    );
  }
}
