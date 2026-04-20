import { randomUUID } from 'node:crypto';
import type {
  MaintainerCreateRunCommand,
  MaintainerSaveRunCommand,
} from '../../application/cloudSync.js';
import { MaintainerSyncConflictError } from '../../application/maintainerSyncConflictError.js';
import { getMaintainerRunRepository } from '../../infrastructure/sellingHousesPlatform.js';

const repository = getMaintainerRunRepository();

export interface MaintainerRunIdentityContext {
  accountId?: string;
  displayName?: string;
  source?: 'session' | 'activation-key';
}

function resolveUserId(candidateUserId: unknown, identity?: MaintainerRunIdentityContext): string {
  if (identity?.source === 'session' && identity.accountId?.trim()) {
    return identity.accountId.trim();
  }

  return typeof candidateUserId === 'string' ? candidateUserId.trim() : '';
}

function resolvePlayerName(candidatePlayerName: unknown, identity?: MaintainerRunIdentityContext): string | undefined {
  if (typeof candidatePlayerName === 'string' && candidatePlayerName.trim()) {
    return candidatePlayerName;
  }

  return identity?.displayName?.trim() || undefined;
}

function withIdentityQuery(
  query: Record<string, unknown>,
  identity?: MaintainerRunIdentityContext,
): Record<string, unknown> {
  if (identity?.source !== 'session' || !identity.accountId?.trim()) {
    return query;
  }

  return {
    ...query,
    userId: identity.accountId.trim(),
  };
}

function normalizeCreateBody(body: unknown, identity?: MaintainerRunIdentityContext): MaintainerCreateRunCommand {
  if (!body || typeof body !== 'object') {
    throw new Error('创建存档时缺少请求体。');
  }

  const candidate = body as Partial<MaintainerCreateRunCommand>;
  const userId = resolveUserId(candidate.userId, identity);
  if (!userId) {
    throw new Error('缺少 userId。');
  }

  if (!candidate.state || typeof candidate.state !== 'object') {
    throw new Error('缺少 state。');
  }

  return {
    userId,
    playerName: resolvePlayerName(candidate.playerName, identity),
    seasonId: typeof candidate.seasonId === 'string' ? candidate.seasonId : undefined,
    state: candidate.state as MaintainerCreateRunCommand['state'],
    clientUpdatedAt: typeof candidate.clientUpdatedAt === 'string' ? candidate.clientUpdatedAt : undefined,
  };
}

function normalizeSaveBody(body: unknown, identity?: MaintainerRunIdentityContext): MaintainerSaveRunCommand {
  if (!body || typeof body !== 'object') {
    throw new Error('保存存档时缺少请求体。');
  }

  const candidate = body as Partial<MaintainerSaveRunCommand>;
  if (!candidate.runId || typeof candidate.runId !== 'string') {
    throw new Error('缺少 runId。');
  }

  const userId = resolveUserId(candidate.userId, identity);
  if (!userId) {
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
    userId,
    playerName: resolvePlayerName(candidate.playerName, identity),
    seasonId: typeof candidate.seasonId === 'string' ? candidate.seasonId : undefined,
    state: candidate.state as MaintainerSaveRunCommand['state'],
    expectedSyncVersion: Number(candidate.expectedSyncVersion),
    clientUpdatedAt: typeof candidate.clientUpdatedAt === 'string' ? candidate.clientUpdatedAt : undefined,
  };
}

export async function handleMaintainerRunCreate(body: unknown, identity?: MaintainerRunIdentityContext) {
  const command = normalizeCreateBody(body, identity);
  return repository.createRun({
    ...command,
    runId: randomUUID(),
  });
}

export async function handleMaintainerRunSave(body: unknown, identity?: MaintainerRunIdentityContext) {
  return repository.saveRun(normalizeSaveBody(body, identity));
}

export async function handleMaintainerRunGet(query: Record<string, unknown>, identity?: MaintainerRunIdentityContext) {
  const effectiveQuery = withIdentityQuery(query, identity);
  const runId = typeof effectiveQuery.id === 'string' ? effectiveQuery.id.trim() : '';
  const userId = typeof effectiveQuery.userId === 'string' ? effectiveQuery.userId.trim() : '';

  if (!runId || !userId) {
    throw new Error('查询存档时需要同时提供 id 和 userId。');
  }

  const record = await repository.getRun(runId, userId);
  if (!record) {
    throw new Error('未找到对应存档。');
  }

  return record;
}

export async function handleMaintainerRunList(query: Record<string, unknown>, identity?: MaintainerRunIdentityContext) {
  const effectiveQuery = withIdentityQuery(query, identity);
  const userId = typeof effectiveQuery.userId === 'string' ? effectiveQuery.userId.trim() : '';
  if (!userId) {
    throw new Error('查询存档列表时缺少 userId。');
  }

  const limit = typeof effectiveQuery.limit === 'string' ? Number(effectiveQuery.limit) : 8;
  const runs = await repository.listRuns(userId, Number.isFinite(limit) ? limit : 8);
  return { runs };
}

export function isMaintainerSyncConflictError(error: unknown): error is MaintainerSyncConflictError {
  return error instanceof MaintainerSyncConflictError;
}
