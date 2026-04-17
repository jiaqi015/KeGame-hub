import { randomUUID } from 'node:crypto';
import type {
  MaintainerCreateRunCommand,
  MaintainerSaveRunCommand,
} from '../../application/cloudSync.js';
import { MaintainerSyncConflictError, NeonGameRunRepository } from '../../infrastructure/neonGameRunRepository.js';

const repository = new NeonGameRunRepository();

function normalizeCreateBody(body: unknown): MaintainerCreateRunCommand {
  if (!body || typeof body !== 'object') {
    throw new Error('创建存档时缺少请求体。');
  }

  const candidate = body as Partial<MaintainerCreateRunCommand>;
  if (!candidate.userId || typeof candidate.userId !== 'string') {
    throw new Error('缺少 userId。');
  }

  if (!candidate.state || typeof candidate.state !== 'object') {
    throw new Error('缺少 state。');
  }

  return {
    userId: candidate.userId.trim(),
    playerName: typeof candidate.playerName === 'string' ? candidate.playerName : undefined,
    seasonId: typeof candidate.seasonId === 'string' ? candidate.seasonId : undefined,
    state: candidate.state as MaintainerCreateRunCommand['state'],
    clientUpdatedAt: typeof candidate.clientUpdatedAt === 'string' ? candidate.clientUpdatedAt : undefined,
  };
}

function normalizeSaveBody(body: unknown): MaintainerSaveRunCommand {
  if (!body || typeof body !== 'object') {
    throw new Error('保存存档时缺少请求体。');
  }

  const candidate = body as Partial<MaintainerSaveRunCommand>;
  if (!candidate.runId || typeof candidate.runId !== 'string') {
    throw new Error('缺少 runId。');
  }

  if (!candidate.userId || typeof candidate.userId !== 'string') {
    throw new Error('缺少 userId。');
  }

  if (!candidate.state || typeof candidate.state !== 'object') {
    throw new Error('缺少 state。');
  }

  if (!Number.isFinite(candidate.expectedSyncVersion)) {
    throw new Error('缺少 expectedSyncVersion。');
  }

  return {
    runId: candidate.runId.trim(),
    userId: candidate.userId.trim(),
    playerName: typeof candidate.playerName === 'string' ? candidate.playerName : undefined,
    seasonId: typeof candidate.seasonId === 'string' ? candidate.seasonId : undefined,
    state: candidate.state as MaintainerSaveRunCommand['state'],
    expectedSyncVersion: Number(candidate.expectedSyncVersion),
    clientUpdatedAt: typeof candidate.clientUpdatedAt === 'string' ? candidate.clientUpdatedAt : undefined,
  };
}

export async function handleMaintainerRunCreate(body: unknown) {
  const command = normalizeCreateBody(body);
  return repository.createRun({
    ...command,
    runId: randomUUID(),
  });
}

export async function handleMaintainerRunSave(body: unknown) {
  return repository.saveRun(normalizeSaveBody(body));
}

export async function handleMaintainerRunGet(query: Record<string, unknown>) {
  const runId = typeof query.id === 'string' ? query.id.trim() : '';
  const userId = typeof query.userId === 'string' ? query.userId.trim() : '';

  if (!runId || !userId) {
    throw new Error('查询存档时需要同时提供 id 和 userId。');
  }

  const record = await repository.getRun(runId, userId);
  if (!record) {
    throw new Error('未找到对应存档。');
  }

  return record;
}

export async function handleMaintainerRunList(query: Record<string, unknown>) {
  const userId = typeof query.userId === 'string' ? query.userId.trim() : '';
  if (!userId) {
    throw new Error('查询存档列表时缺少 userId。');
  }

  const limit = typeof query.limit === 'string' ? Number(query.limit) : 8;
  const runs = await repository.listRuns(userId, Number.isFinite(limit) ? limit : 8);
  return { runs };
}

export function isMaintainerSyncConflictError(error: unknown): error is MaintainerSyncConflictError {
  return error instanceof MaintainerSyncConflictError;
}
