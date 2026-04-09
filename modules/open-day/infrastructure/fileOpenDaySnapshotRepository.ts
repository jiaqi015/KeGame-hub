import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  OpenDayAnalysisSnapshotRecord,
  OpenDayAnalysisSnapshotSummary,
} from '../domain/openDay.types.js';
import type { OpenDaySnapshotRepository } from '../application/openDaySnapshotRepository.js';

interface SnapshotIndexFile {
  items: OpenDayAnalysisSnapshotSummary[];
}

export class FileOpenDaySnapshotRepository implements OpenDaySnapshotRepository {
  private readonly baseDir: string;
  private readonly snapshotDir: string;
  private readonly indexFile: string;

  constructor(baseDir = path.join(process.cwd(), 'tmp', 'open-day-runtime')) {
    this.baseDir = baseDir;
    this.snapshotDir = path.join(baseDir, 'snapshots');
    this.indexFile = path.join(this.snapshotDir, 'index.json');
  }

  async save(snapshot: OpenDayAnalysisSnapshotRecord): Promise<void> {
    await fs.mkdir(this.snapshotDir, { recursive: true });
    const detailFile = path.join(this.snapshotDir, `${snapshot.summary.id}.json`);
    await fs.writeFile(detailFile, JSON.stringify(snapshot, null, 2), 'utf8');

    const current = await this.readIndex();
    const items = current.items.filter((item) => item.id !== snapshot.summary.id);
    items.unshift(snapshot.summary);

    await fs.writeFile(
      this.indexFile,
      JSON.stringify(
        {
          items: items.slice(0, 50),
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  async list(limit: number): Promise<OpenDayAnalysisSnapshotSummary[]> {
    const current = await this.readIndex();
    return current.items.slice(0, limit);
  }

  private async readIndex(): Promise<SnapshotIndexFile> {
    try {
      const content = await fs.readFile(this.indexFile, 'utf8');
      const parsed = JSON.parse(content) as SnapshotIndexFile;
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    } catch {
      return { items: [] };
    }
  }
}
