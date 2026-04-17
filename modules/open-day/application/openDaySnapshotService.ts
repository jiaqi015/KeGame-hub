import type { OpenDaySnapshotListResponse } from '../domain/openDay.types.js';
import type { OpenDaySnapshotListOptions, OpenDaySnapshotRepository } from './openDaySnapshotRepository.js';

export class OpenDaySnapshotService {
  constructor(private readonly repository: OpenDaySnapshotRepository) {}

  async listRecent(limit = 8, options?: OpenDaySnapshotListOptions): Promise<OpenDaySnapshotListResponse> {
    const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.floor(limit))) : 8;
    return {
      items: await this.repository.list(normalizedLimit, options),
    };
  }

  async getById(id: string) {
    const normalizedId = typeof id === 'string' ? id.trim() : '';
    if (!normalizedId) {
      throw new Error('缺少历史测算记录 ID。');
    }

    const record = await this.repository.get(normalizedId);
    if (!record) {
      throw new Error('未找到对应的历史测算记录。');
    }

    return record;
  }
}
