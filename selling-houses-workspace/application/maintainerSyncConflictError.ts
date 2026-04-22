import type { MaintainerRunRecord } from './cloudSync.js';

export class MaintainerSyncConflictError extends Error {
  latest: MaintainerRunRecord | null;

  constructor(latest: MaintainerRunRecord | null) {
    super('云端进度已更新，请先同步最新存档。');
    this.name = 'MaintainerSyncConflictError';
    this.latest = latest;
  }
}
