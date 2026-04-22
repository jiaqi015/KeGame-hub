import type {
  OpenDaySaveScenarioCommand,
  OpenDayScenarioListResponse,
  OpenDayScenarioTemplateRecord,
  OpenDayScenarioTemplateSummary,
  OpenDayScenarioVersionListResponse,
} from '../domain/openDay.types.js';
import { createOpenDayHash } from './openDayFingerprint.js';
import type { OpenDayScenarioRepository } from './openDayScenarioRepository.js';
import { resolveOpenDayScenarioDraft } from './openDayScenarioDraft.js';

export class OpenDayScenarioService {
  constructor(private readonly repository: OpenDayScenarioRepository) {}

  async listRecent(limit = 8): Promise<OpenDayScenarioListResponse> {
    const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.floor(limit))) : 8;
    return {
      items: await this.repository.list(normalizedLimit),
    };
  }

  async listVersions(templateId: string, limit = 20): Promise<OpenDayScenarioVersionListResponse> {
    const normalizedTemplateId = typeof templateId === 'string' ? templateId.trim() : '';
    if (!normalizedTemplateId) {
      throw new Error('缺少方案模板 ID。');
    }

    const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 20;
    return {
      items: await this.repository.listVersions(normalizedTemplateId, normalizedLimit),
    };
  }

  async save(command: OpenDaySaveScenarioCommand): Promise<OpenDayScenarioTemplateRecord> {
    const name = typeof command.name === 'string' ? command.name.trim() : '';
    if (!name) {
      throw new Error('方案名称不能为空。');
    }

    const description = typeof command.description === 'string' ? command.description.trim() : '';
    const scenario = resolveOpenDayScenarioDraft(command);
    const updatedAt = new Date().toISOString();
    const requestedTemplateId = typeof command.templateId === 'string' ? command.templateId.trim() : '';
    const existingTemplate = requestedTemplateId ? await this.repository.get(requestedTemplateId) : null;
    const summaryBase: OpenDayScenarioTemplateSummary = {
      id:
        existingTemplate?.summary.id
        || createOpenDayHash(
          {
            name,
            createdAt: updatedAt,
          },
          'scenario-template',
        ).replace(/^scenario-template:/, ''),
      name,
      description,
      formulaId: scenario.formulaId,
      parameterPackageId: scenario.parameterPackageId,
      configVersion: createOpenDayHash(scenario.config, 'cfg'),
      updatedAt,
      latestVersionId: '',
      currentVersionNo: (existingTemplate?.summary.currentVersionNo || 0) + 1,
    };
    const latestVersion = {
      id: createOpenDayHash(
        {
          templateId: summaryBase.id,
          versionNo: summaryBase.currentVersionNo,
          configVersion: summaryBase.configVersion,
          updatedAt,
        },
        'scenario-version',
      ).replace(/^scenario-version:/, ''),
      templateId: summaryBase.id,
      versionNo: summaryBase.currentVersionNo || 1,
      createdAt: updatedAt,
      configVersion: summaryBase.configVersion,
    };
    const summary = {
      ...summaryBase,
      latestVersionId: latestVersion.id,
    };

    const record: OpenDayScenarioTemplateRecord = {
      summary,
      scenario,
      latestVersion,
    };

    await this.repository.save(record);
    return record;
  }

  async getById(id: string): Promise<OpenDayScenarioTemplateRecord> {
    const normalizedId = typeof id === 'string' ? id.trim() : '';
    if (!normalizedId) {
      throw new Error('缺少方案 ID。');
    }

    const record = await this.repository.get(normalizedId);
    if (!record) {
      throw new Error('未找到对应的方案。');
    }

    return record;
  }
}
