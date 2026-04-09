import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  OpenDayScenarioTemplateRecord,
  OpenDayScenarioTemplateSummary,
} from '../domain/openDay.types.js';
import type { OpenDayScenarioRepository } from '../application/openDayScenarioRepository.js';
import { getRuntimeTempDir } from '../../../lib/runtimeTemp.js';

interface ScenarioIndexFile {
  items: OpenDayScenarioTemplateSummary[];
}

export class FileOpenDayScenarioRepository implements OpenDayScenarioRepository {
  private readonly baseDir: string;
  private readonly scenarioDir: string;
  private readonly indexFile: string;

  constructor(baseDir = getRuntimeTempDir('open-day-runtime')) {
    this.baseDir = baseDir;
    this.scenarioDir = path.join(baseDir, 'scenarios');
    this.indexFile = path.join(this.scenarioDir, 'index.json');
  }

  async save(template: OpenDayScenarioTemplateRecord): Promise<void> {
    await fs.mkdir(this.scenarioDir, { recursive: true });
    const detailFile = path.join(this.scenarioDir, `${template.summary.id}.json`);
    await fs.writeFile(detailFile, JSON.stringify(template, null, 2), 'utf8');

    const current = await this.readIndex();
    const items = current.items.filter((item) => item.id !== template.summary.id);
    items.unshift(template.summary);

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

  async list(limit: number): Promise<OpenDayScenarioTemplateSummary[]> {
    const current = await this.readIndex();
    return current.items.slice(0, limit);
  }

  async get(id: string): Promise<OpenDayScenarioTemplateRecord | null> {
    const detailFile = path.join(this.scenarioDir, `${id}.json`);

    try {
      const content = await fs.readFile(detailFile, 'utf8');
      return JSON.parse(content) as OpenDayScenarioTemplateRecord;
    } catch {
      return null;
    }
  }

  private async readIndex(): Promise<ScenarioIndexFile> {
    try {
      const content = await fs.readFile(this.indexFile, 'utf8');
      const parsed = JSON.parse(content) as ScenarioIndexFile;
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    } catch {
      return { items: [] };
    }
  }
}
