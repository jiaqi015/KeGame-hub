import { OpenDaySnapshotService } from '../../application/openDaySnapshotService.js';
import { FileOpenDaySnapshotRepository } from '../../infrastructure/fileOpenDaySnapshotRepository.js';

const snapshotService = new OpenDaySnapshotService(new FileOpenDaySnapshotRepository());

export async function handleOpenDaySnapshotList(query: { limit?: string | string[] | undefined }) {
  const rawLimit = Array.isArray(query.limit) ? query.limit[0] : query.limit;
  const limit = typeof rawLimit === 'string' ? Number(rawLimit) : undefined;
  return snapshotService.listRecent(limit);
}
