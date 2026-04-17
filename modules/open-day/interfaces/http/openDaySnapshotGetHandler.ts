import { getOpenDaySnapshotService } from '../../infrastructure/openDayPlatform.js';

const snapshotService = getOpenDaySnapshotService();

export async function handleOpenDaySnapshotGet(query: unknown) {
  const record = query && typeof query === 'object' ? (query as Record<string, unknown>) : {};
  const id =
    typeof record.id === 'string'
      ? record.id
      : typeof record.runId === 'string'
        ? record.runId
        : '';
  return snapshotService.getById(id);
}
