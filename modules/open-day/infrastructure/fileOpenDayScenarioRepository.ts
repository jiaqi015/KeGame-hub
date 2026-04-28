import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  OpenDayScenarioTemplateRecord,
  OpenDayScenarioTemplateSummary,
  OpenDayScenarioTemplateVersionSummary,
} from '../domain/openDay.types.js';
import type { OpenDayScenarioRepository } from '../application/openDayScenarioRepository.js';
import { getRuntimeTempDir } from '../../../lib/runtimeTemp.js';

interface ScenarioIndexFile {
  items: OpenDayScenarioTemplateSummary[];
}

export class FileOpenDayScenarioRepository implements OpenDayScenarioRepository {
  private readonly baseDir: string;
  private readonly scenarioDir: string;
  private readonly versionDir: string;
  private readonly indexFile: string;

  constructor(baseDir = getRuntimeTempDir('open-day-runtime')) {
    this.baseDir = baseDir;
    this.scenarioDir = path.join(baseDir, 'scenarios');
    this.versionDir = path.join(this.scenarioDir, 'versions');
    this.indexFile = path.join(this.scenarioDir, 'index.json');
  }

  async save(template: OpenDayScenarioTemplateRecord): Promise<void> {
    await fs.mkdir(this.scenarioDir, { recursive: true });
    await fs.mkdir(this.versionDir, { recursive: true });
    const detailFile = path.join(this.scenarioDir, `${template.summary.id}.json`);
    await fs.writeFile(detailFile, JSON.stringify(template, null, 2), 'utf8');

    if (template.latestVersion) {
      const versionTargetDir = path.join(this.versionDir, template.summary.id);
      await fs.mkdir(versionTargetDir, { recursive: true });
      await fs.writeFile(
        path.join(versionTargetDir, `${template.latestVersion.id}.json`),
        JSON.stringify(
          {
            summary: template.summary,
            latestVersion: template.latestVersion,
            scenario: template.scenario,
          },
          null,
          2,
        ),
        'utf8',
      );
    }

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

  async listVersions(templateId: string, limit: number): Promise<OpenDayScenarioTemplateVersionSummary[]> {
    const versionTargetDir = path.join(this.versionDir, templateId);

    try {
      const files = await fs.readdir(versionTargetDir);
      const records = await Promise.all(
        files
          .filter((file) => file.endsWith('.json'))
          .map(async (file) => {
            const content = await fs.readFile(path.join(versionTargetDir, file), 'utf8');
            const parsed = JSON.parse(content) as { latestVersion?: OpenDayScenarioTemplateVersionSummary };
            return parsed.latestVersion || null;
          }),
      );

      return records
        .filter((item): item is OpenDayScenarioTemplateVersionSummary => Boolean(item))
        .sort((left, right) => right.versionNo - left.versionNo)
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  async delete(id: string): Promise<boolean> {
    const normalizedId = typeof id === 'string' ? id.trim() : '';
    if (!normalizedId) {
      return false;
    }

    const current = await this.readIndex();
    const nextItems = current.items.filter((item) => item.id !== normalizedId);
    const existedInIndex = nextItems.length !== current.items.length;
    const detailFile = path.join(this.scenarioDir, `${normalizedId}.json`);
    const versionTargetDir = path.join(this.versionDir, normalizedId);

    let existedOnDisk = false;
    try {
      await fs.rm(detailFile);
      existedOnDisk = true;
    } catch (error) {
      if (!error || typeof error !== 'object' || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    await fs.rm(versionTargetDir, { recursive: true, force: true });
    await fs.mkdir(this.scenarioDir, { recursive: true });
    await fs.writeFile(
      this.indexFile,
      JSON.stringify(
        {
          items: nextItems,
        },
        null,
        2,
      ),
      'utf8',
    );

    return existedInIndex || existedOnDisk;
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
