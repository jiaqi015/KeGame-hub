import fs from 'node:fs/promises';
import path from 'node:path';
import type { OpenDayUploadArtifactSummary } from '../domain/openDay.types.js';
import type {
  OpenDayUploadArtifactRepository,
  SaveOpenDayUploadArtifactCommand,
} from '../application/openDayUploadArtifactRepository.js';
import { getRuntimeTempDir } from '../../../lib/runtimeTemp.js';

interface UploadArtifactIndexFile {
  items: OpenDayUploadArtifactSummary[];
}

export class FileOpenDayUploadArtifactRepository implements OpenDayUploadArtifactRepository {
  private readonly uploadDir: string;
  private readonly fileDir: string;
  private readonly metaDir: string;
  private readonly indexFile: string;

  constructor(baseDir = getRuntimeTempDir('open-day-runtime')) {
    this.uploadDir = path.join(baseDir, 'uploads');
    this.fileDir = path.join(this.uploadDir, 'files');
    this.metaDir = path.join(this.uploadDir, 'meta');
    this.indexFile = path.join(this.uploadDir, 'index.json');
  }

  async findExisting(query: SaveOpenDayUploadArtifactCommand | { originalFilename: string; byteSize: number; checksumSha256: string }) {
    const current = await this.readIndex();
    return current.items.find(
      (item) =>
        item.originalFilename === query.originalFilename &&
        item.byteSize === query.byteSize &&
        item.checksumSha256 === query.checksumSha256,
    ) || null;
  }

  async save(command: SaveOpenDayUploadArtifactCommand): Promise<OpenDayUploadArtifactSummary> {
    const targetFile = path.join(this.fileDir, ...command.storageKey.split('/'));
    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    await fs.mkdir(this.metaDir, { recursive: true });
    await fs.writeFile(targetFile, command.buffer);

    const summary: OpenDayUploadArtifactSummary = {
      id: command.id,
      createdAt: command.createdAt,
      originalFilename: command.originalFilename,
      byteSize: command.byteSize,
      contentType: command.contentType,
      checksumSha256: command.checksumSha256,
      storageBackend: 'local',
      storageKey: command.storageKey,
      url: null,
      downloadUrl: null,
    };

    await fs.writeFile(path.join(this.metaDir, `${command.id}.json`), JSON.stringify(summary, null, 2), 'utf8');

    const current = await this.readIndex();
    const items = current.items.filter((item) => item.id !== summary.id);
    items.unshift(summary);
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

    return summary;
  }

  private async readIndex(): Promise<UploadArtifactIndexFile> {
    try {
      const content = await fs.readFile(this.indexFile, 'utf8');
      const parsed = JSON.parse(content) as UploadArtifactIndexFile;
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    } catch {
      return {
        items: [],
      };
    }
  }
}
