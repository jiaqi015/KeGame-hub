import type {
  OpenDayScenarioTemplateRecord,
  OpenDayScenarioTemplateSummary,
  OpenDayScenarioTemplateVersionSummary,
} from '../domain/openDay.types.js';

export interface OpenDayScenarioRepository {
  save(template: OpenDayScenarioTemplateRecord): Promise<void>;
  list(limit: number): Promise<OpenDayScenarioTemplateSummary[]>;
  get(id: string): Promise<OpenDayScenarioTemplateRecord | null>;
  listVersions(templateId: string, limit: number): Promise<OpenDayScenarioTemplateVersionSummary[]>;
  delete(id: string): Promise<boolean>;
}
