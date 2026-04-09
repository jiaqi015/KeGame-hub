import type {
  OpenDaySaveScenarioCommand,
  OpenDayScenarioListResponse,
  OpenDayScenarioTemplateRecord,
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

  async save(command: OpenDaySaveScenarioCommand): Promise<OpenDayScenarioTemplateRecord> {
    const name = typeof command.name === 'string' ? command.name.trim() : '';
    if (!name) {
      throw new Error('方案名称不能为空。');
    }

    const description = typeof command.description === 'string' ? command.description.trim() : '';
    const scenario = resolveOpenDayScenarioDraft(command);
    const updatedAt = new Date().toISOString();
    const summary = {
      id: createOpenDayHash(
        {
          name,
          parameterPackageId: scenario.parameterPackageId,
          formulaId: scenario.formulaId,
          updatedAt,
        },
        'scenario',
      ).replace(/^scenario:/, ''),
      name,
      description,
      formulaId: scenario.formulaId,
      parameterPackageId: scenario.parameterPackageId,
      configVersion: createOpenDayHash(scenario.config, 'cfg'),
      updatedAt,
    };

    const record: OpenDayScenarioTemplateRecord = {
      summary,
      scenario,
    };

    await this.repository.save(record);
    return record;
  }
}
