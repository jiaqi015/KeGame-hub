import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  OpenDayDatasetProfileSummary,
  OpenDayDatasetSummary,
} from '../domain/openDay.types.js';
import type {
  OpenDayDatasetRepository,
  SaveOpenDayDatasetCommand,
  SaveOpenDayDatasetProfileCommand,
} from '../application/openDayDatasetRepository.js';
import { getRuntimeTempDir } from '../../../lib/runtimeTemp.js';

export class FileOpenDayDatasetRepository implements OpenDayDatasetRepository {
  private readonly datasetDir: string;
  private readonly profileDir: string;

  constructor(baseDir = getRuntimeTempDir('open-day-runtime')) {
    this.datasetDir = path.join(baseDir, 'datasets');
    this.profileDir = path.join(baseDir, 'dataset-profiles');
  }

  async saveDataset(command: SaveOpenDayDatasetCommand): Promise<OpenDayDatasetSummary> {
    await fs.mkdir(this.datasetDir, { recursive: true });
    await fs.writeFile(
      path.join(this.datasetDir, `${command.summary.id}.json`),
      JSON.stringify(command, null, 2),
      'utf8',
    );
    return command.summary;
  }

  async saveDatasetProfile(command: SaveOpenDayDatasetProfileCommand): Promise<OpenDayDatasetProfileSummary> {
    await fs.mkdir(this.profileDir, { recursive: true });
    await fs.writeFile(
      path.join(this.profileDir, `${command.summary.id}.json`),
      JSON.stringify(command, null, 2),
      'utf8',
    );
    return command.summary;
  }
}
