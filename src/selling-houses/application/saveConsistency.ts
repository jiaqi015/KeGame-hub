import type { GameSaveSource, GameState } from '../domain/models.js';

export type GameSaveComparisonDecision = 'remote_newer' | 'local_newer' | 'same' | 'conflict';

export interface GameSaveComparisonSnapshot {
  runId: string;
  day: number;
  currentDate: string;
  localRevision: number;
  clientUpdatedAt: string;
}

export interface GameSaveComparison {
  decision: GameSaveComparisonDecision;
  reason: string;
  local: GameSaveComparisonSnapshot;
  remote: GameSaveComparisonSnapshot;
}

interface SaveMetadataInput {
  runId?: unknown;
  localRevision?: unknown;
  revision?: unknown;
  clientUpdatedAt?: unknown;
  updatedAt?: unknown;
  lastSavedAt?: unknown;
  lastHydratedAt?: unknown;
  saveSource?: unknown;
}

export interface SaveMetadataFallback {
  runId?: string;
  createdAt?: string;
  now?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeRevision(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0;
}

function normalizeIsoDate(value: unknown) {
  const candidate = normalizeString(value);
  if (!candidate) return null;
  return Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

function normalizeSaveSource(value: unknown): GameSaveSource {
  return value === 'local' || value === 'cloud' || value === 'manual' || value === 'system'
    ? value
    : 'system';
}

function compareIsoDate(left: string, right: string) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    return null;
  }

  return leftTime - rightTime;
}

function isComparableSnapshot(snapshot: GameSaveComparisonSnapshot) {
  return Boolean(snapshot.runId)
    && Number.isFinite(snapshot.day)
    && snapshot.day > 0
    && Boolean(snapshot.currentDate)
    && Number.isFinite(Date.parse(snapshot.currentDate))
    && Number.isFinite(snapshot.localRevision)
    && snapshot.localRevision >= 0
    && Boolean(snapshot.clientUpdatedAt)
    && Number.isFinite(Date.parse(snapshot.clientUpdatedAt));
}

function buildSnapshot(state: GameState): GameSaveComparisonSnapshot {
  return {
    runId: state.runId,
    day: state.day,
    currentDate: state.currentDate,
    localRevision: state.localRevision,
    clientUpdatedAt: state.clientUpdatedAt,
  };
}

export function createGameRunId() {
  const randomPart = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `selling-houses-${randomPart}`;
}

export function createLegacyGameRunId(input: {
  scenarioId?: string;
  runSeed?: number;
  createdAt?: string;
}) {
  const scenarioId = input.scenarioId?.trim() || 'unknown-scenario';
  const runSeed = Number.isFinite(input.runSeed) ? String(input.runSeed) : 'unknown-seed';
  const createdAt = input.createdAt?.trim() || 'unknown-created-at';
  return `legacy-${scenarioId}-${runSeed}-${createdAt}`.replace(/[^a-zA-Z0-9:_-]+/g, '-');
}

export function normalizeGameSaveMetadata(input: unknown, fallback: SaveMetadataFallback = {}) {
  const record: SaveMetadataInput = isRecord(input) ? input : {};
  const now = fallback.now || new Date().toISOString();
  const clientUpdatedAt = normalizeIsoDate(record.clientUpdatedAt)
    || normalizeIsoDate(record.updatedAt)
    || normalizeIsoDate(fallback.createdAt)
    || now;

  return {
    runId: normalizeString(record.runId) || fallback.runId || createGameRunId(),
    localRevision: normalizeRevision(record.localRevision ?? record.revision),
    clientUpdatedAt,
    lastSavedAt: normalizeIsoDate(record.lastSavedAt) || undefined,
    lastHydratedAt: normalizeIsoDate(record.lastHydratedAt) || undefined,
    saveSource: normalizeSaveSource(record.saveSource),
  };
}

export function markLocalStateChange(
  state: GameState,
  saveSource: GameSaveSource = 'local',
  now = new Date().toISOString(),
): GameState {
  return {
    ...state,
    localRevision: Math.max(0, state.localRevision || 0) + 1,
    clientUpdatedAt: now,
    saveSource,
  };
}

export function markHydratedState(
  state: GameState,
  now = new Date().toISOString(),
): GameState {
  return {
    ...state,
    lastHydratedAt: now,
    saveSource: 'cloud',
  };
}

export function markSavedState(
  state: GameState,
  now = new Date().toISOString(),
): GameState {
  return {
    ...state,
    lastSavedAt: now,
  };
}

export function compareGameProgress(localState: GameState, remoteState: GameState): GameSaveComparison {
  const local = buildSnapshot(localState);
  const remote = buildSnapshot(remoteState);

  if (!isComparableSnapshot(local) || !isComparableSnapshot(remote)) {
    return { decision: 'conflict', reason: 'incomplete_save_metadata', local, remote };
  }

  if (local.runId !== remote.runId) {
    return { decision: 'conflict', reason: 'run_id_mismatch', local, remote };
  }

  if (remote.day > local.day) {
    return { decision: 'remote_newer', reason: 'remote_day_ahead', local, remote };
  }
  if (remote.day < local.day) {
    return { decision: 'local_newer', reason: 'local_day_ahead', local, remote };
  }

  const dateComparison = compareIsoDate(remote.currentDate, local.currentDate);
  if (dateComparison === null) {
    return { decision: 'conflict', reason: 'invalid_current_date', local, remote };
  }
  if (dateComparison > 0) {
    return { decision: 'remote_newer', reason: 'remote_date_ahead', local, remote };
  }
  if (dateComparison < 0) {
    return { decision: 'local_newer', reason: 'local_date_ahead', local, remote };
  }

  if (remote.localRevision > local.localRevision) {
    return { decision: 'remote_newer', reason: 'remote_revision_ahead', local, remote };
  }
  if (remote.localRevision < local.localRevision) {
    return { decision: 'local_newer', reason: 'local_revision_ahead', local, remote };
  }

  const updatedAtComparison = compareIsoDate(remote.clientUpdatedAt, local.clientUpdatedAt);
  if (updatedAtComparison === null) {
    return { decision: 'conflict', reason: 'invalid_client_updated_at', local, remote };
  }
  if (updatedAtComparison > 0) {
    return { decision: 'remote_newer', reason: 'remote_updated_at_ahead', local, remote };
  }
  if (updatedAtComparison < 0) {
    return { decision: 'local_newer', reason: 'local_updated_at_ahead', local, remote };
  }

  return { decision: 'same', reason: 'same_progress_revision_and_timestamp', local, remote };
}

export function shouldHydrateRemote(comparison: GameSaveComparison) {
  return comparison.decision === 'remote_newer';
}

export function buildKeepLocalWarning(comparison: GameSaveComparison) {
  if (comparison.decision === 'conflict') {
    return '检测到云端进度冲突，已保留本地进度。';
  }

  if (comparison.decision === 'local_newer') {
    if (comparison.local.day === comparison.remote.day) {
      return `云端存档也是第 ${comparison.local.day} 天，但本地有更新的操作记录，已保留本地最新进度。`;
    }
    return `云端存档停在第 ${comparison.remote.day} 天，本地已经到第 ${comparison.local.day} 天，已保留本地最新进度。`;
  }

  return null;
}

export function buildSaveComparisonLog(comparison: GameSaveComparison) {
  return {
    decision: comparison.decision,
    reason: comparison.reason,
    runIdMatched: comparison.local.runId === comparison.remote.runId,
    localDay: comparison.local.day,
    remoteDay: comparison.remote.day,
    localCurrentDate: comparison.local.currentDate,
    remoteCurrentDate: comparison.remote.currentDate,
    localRevision: comparison.local.localRevision,
    remoteRevision: comparison.remote.localRevision,
    localUpdatedAt: comparison.local.clientUpdatedAt,
    remoteUpdatedAt: comparison.remote.clientUpdatedAt,
  };
}
