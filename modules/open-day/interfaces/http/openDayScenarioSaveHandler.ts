import type { OpenDaySaveScenarioCommand } from '../../domain/openDay.types.js';
import { getOpenDayScenarioService } from '../../infrastructure/openDayPlatform.js';

const scenarioService = getOpenDayScenarioService();

function normalizeBody(body: unknown): OpenDaySaveScenarioCommand {
  if (!body || typeof body !== 'object') {
    throw new Error('请求体不能为空。');
  }

  const candidate = body as Partial<OpenDaySaveScenarioCommand>;
  return {
    templateId: typeof candidate.templateId === 'string' ? candidate.templateId : '',
    name: typeof candidate.name === 'string' ? candidate.name : '',
    description: typeof candidate.description === 'string' ? candidate.description : '',
    scenario: candidate.scenario,
    config: candidate.config,
    activePresetId: typeof candidate.activePresetId === 'string' ? candidate.activePresetId : '',
    activeParameterPackageId:
      typeof candidate.activeParameterPackageId === 'string'
        ? candidate.activeParameterPackageId
        : typeof candidate.activePresetId === 'string'
          ? candidate.activePresetId
          : '',
  };
}

export async function handleOpenDayScenarioSave(body: unknown) {
  const command = normalizeBody(body);
  return scenarioService.save(command);
}
