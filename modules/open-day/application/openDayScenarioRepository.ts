import type {
  OpenDayScenarioTemplateRecord,
  OpenDayScenarioTemplateSummary,
} from '../domain/openDay.types.js';

export interface OpenDayScenarioRepository {
  save(template: OpenDayScenarioTemplateRecord): Promise<void>;
  list(limit: number): Promise<OpenDayScenarioTemplateSummary[]>;
  get(id: string): Promise<OpenDayScenarioTemplateRecord | null>;
}
