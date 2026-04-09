import type { OpenDaySnapshotListResponse } from '../domain/openDay.types.js';
import type { OpenDaySnapshotRepository } from './openDaySnapshotRepository.js';

export class OpenDaySnapshotService {
  constructor(private readonly repository: OpenDaySnapshotRepository) {}

  async listRecent(limit = 8): Promise<OpenDaySnapshotListResponse> {
    const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.floor(limit))) : 8;
    return {
      items: await this.repository.list(normalizedLimit),
    };
  }
}
