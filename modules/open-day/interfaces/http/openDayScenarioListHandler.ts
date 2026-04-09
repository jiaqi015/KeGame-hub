import { OpenDayScenarioService } from '../../application/openDayScenarioService.js';
import { FileOpenDayScenarioRepository } from '../../infrastructure/fileOpenDayScenarioRepository.js';

const scenarioService = new OpenDayScenarioService(new FileOpenDayScenarioRepository());

export async function handleOpenDayScenarioList(query: unknown) {
  const record = query && typeof query === 'object' ? (query as Record<string, unknown>) : {};
  const limit = Number(record.limit);
  return scenarioService.listRecent(Number.isFinite(limit) ? limit : 8);
}
