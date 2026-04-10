export type WaterlineMode = 'percentile' | 'absolute';
export type OpenDayFormulaId = 'weighted_catalyst_v1' | 'geometric_catalyst_v2';
export type OpenDayParameterKey = keyof OpenDayAbsolutes;
export type OpenDayParameterSourceMode = 'percentile' | 'number';
export type OpenDayUploadStorageBackend = 'local' | 'blob';

export interface OpenDayWeights {
  product: number;
  interaction: number;
}

export interface OpenDayPercentiles {
  I_cap: number;
  V_cap: number;
  H_cap: number;
  R_cap: number;
}

export interface OpenDayAbsolutes {
  I_cap: number;
  V_cap: number;
  H_cap: number;
  R_cap: number;
}

export interface OpenDayHardFilters {
  min_inventory: number;
  min_hq_rooms: number;
  min_transaction: number;
}

export interface OpenDayConfig {
  formulaId: OpenDayFormulaId;
  alpha: number;
  waterlineMode: WaterlineMode;
  weights: OpenDayWeights;
  percentiles: OpenDayPercentiles;
  absolutes: OpenDayAbsolutes;
  waterlineOverrides?: Partial<OpenDayAbsolutes>;
  hardFilters: OpenDayHardFilters;
}

export interface OpenDayScenarioDraft {
  formulaId: OpenDayFormulaId;
  parameterPackageId: string | null;
  config: OpenDayConfig;
}

export interface OpenDayMappings {
  area?: string;
  name: string;
  inventory: string;
  traffic: string;
  transactions: string;
  premium: string;
}

export interface OpenDayRawRow {
  [key: string]: string;
}

export interface NormalizedOpenDayRow {
  area: string;
  name: string;
  inventory: number;
  traffic: number;
  transactions: number;
  premium: number;
  convRate: number;
}

export interface OpenDayWaterlines {
  source: string;
  I_cap: number;
  V_cap: number;
  H_cap: number;
  R_cap: number;
}

export interface OpenDayResolvedParameter {
  key: OpenDayParameterKey;
  sourceMode: OpenDayParameterSourceMode;
  percentileValue: number;
  configuredValue: number;
  derivedValue: number;
  overrideValue: number | null;
  finalValue: number;
  derivedPercentileValue: number;
  isOverridden: boolean;
}

export interface OpenDayAnalysisRow extends NormalizedOpenDayRow {
  rank: number;
  score: number;
  rawScore: number;
  scaleIdx: number;
  trafficIdx: number;
  productIdx: number;
  interactionIdx: number;
  catalyst: number;
  isEligible: boolean;
  tierCode: 'S' | 'A' | 'B' | 'C' | 'D';
  tierLabel: string;
}

export interface OpenDayFormulaDefinition {
  id: OpenDayFormulaId;
  label: string;
  description: string;
}

export interface OpenDayUploadArtifactSummary {
  id: string;
  createdAt: string;
  originalFilename: string;
  byteSize: number;
  contentType: string;
  checksumSha256: string;
  storageBackend: OpenDayUploadStorageBackend;
  storageKey: string;
  url: string | null;
  downloadUrl: string | null;
}

export interface OpenDayParameterPackageDefinition {
  id: string;
  label: string;
  description: string;
  overrides: Partial<OpenDayConfig>;
}

export interface OpenDayParameterPackage extends OpenDayParameterPackageDefinition {
  version: string;
  resolvedConfig: OpenDayConfig;
}

export type OpenDayPresetDefinition = OpenDayParameterPackageDefinition;
export type OpenDayPreset = OpenDayParameterPackage;

export interface OpenDayAnalysisMeta {
  cacheHit: boolean;
  cacheKey: string;
  configVersion: string;
  totalCount: number;
  eligibleCount: number;
  weights: OpenDayWeights;
  formula: OpenDayFormulaDefinition;
  scenario: OpenDayScenarioDraft;
  waterlines: OpenDayWaterlines;
  resolvedParameters: OpenDayResolvedParameter[];
  requestedConfig: OpenDayConfig;
  snapshotId?: string;
  snapshotCreatedAt?: string;
}

export interface OpenDayAnalysisResponse {
  meta: OpenDayAnalysisMeta;
  results: OpenDayAnalysisRow[];
}

export interface OpenDayCatalogResponse {
  generatedAt: string;
  defaultConfig: OpenDayConfig;
  defaultConfigVersion: string;
  formulas: OpenDayFormulaDefinition[];
  parameterPackages: OpenDayParameterPackage[];
  presets: OpenDayPreset[];
}

export interface OpenDayAnalysisSnapshotSummary {
  id: string;
  createdAt: string;
  sourceName: string;
  sourceUploadId: string | null;
  scenarioTemplateId: string | null;
  scenarioTemplateName: string | null;
  presetId: string | null;
  parameterPackageId: string | null;
  configVersion: string;
  waterlineSource: string;
  totalCount: number;
  eligibleCount: number;
  championName: string;
  championScore: number;
}

export interface OpenDayAnalysisSnapshotRecord {
  summary: OpenDayAnalysisSnapshotSummary;
  command: OpenDayScoreCommand;
  response: OpenDayAnalysisResponse;
}

export interface OpenDayScenarioTemplateSummary {
  id: string;
  name: string;
  description: string;
  formulaId: OpenDayFormulaId;
  parameterPackageId: string | null;
  configVersion: string;
  updatedAt: string;
}

export interface OpenDayScenarioTemplateRecord {
  summary: OpenDayScenarioTemplateSummary;
  scenario: OpenDayScenarioDraft;
}

export interface OpenDayScenarioListResponse {
  items: OpenDayScenarioTemplateSummary[];
}

export interface OpenDaySaveScenarioCommand {
  name: string;
  description?: string;
  scenario?: Partial<OpenDayScenarioDraft> & {
    config?: Partial<OpenDayConfig>;
  };
  config?: Partial<OpenDayConfig>;
  activePresetId?: string;
  activeParameterPackageId?: string;
}

export interface OpenDaySnapshotListResponse {
  items: OpenDayAnalysisSnapshotSummary[];
}

export interface OpenDayScoreCommand {
  rows: OpenDayRawRow[];
  mappings: OpenDayMappings;
  config?: Partial<OpenDayConfig>;
  scenario?: Partial<OpenDayScenarioDraft> & {
    config?: Partial<OpenDayConfig>;
  };
  sourceName?: string;
  sourceUploadId?: string;
  activeScenarioTemplateId?: string;
  activeScenarioTemplateName?: string;
  activePresetId?: string;
  activeParameterPackageId?: string;
}
