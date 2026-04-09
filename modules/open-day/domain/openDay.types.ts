export type WaterlineMode = 'percentile' | 'absolute';
export type OpenDayFormulaId = 'weighted_catalyst_v1' | 'geometric_catalyst_v2';

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
  hardFilters: OpenDayHardFilters;
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

export interface OpenDayPresetDefinition {
  id: string;
  label: string;
  description: string;
  overrides: Partial<OpenDayConfig>;
}

export interface OpenDayPreset extends OpenDayPresetDefinition {
  version: string;
  resolvedConfig: OpenDayConfig;
}

export interface OpenDayAnalysisMeta {
  cacheHit: boolean;
  cacheKey: string;
  configVersion: string;
  totalCount: number;
  eligibleCount: number;
  weights: OpenDayWeights;
  waterlines: OpenDayWaterlines;
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
  presets: OpenDayPreset[];
}

export interface OpenDayAnalysisSnapshotSummary {
  id: string;
  createdAt: string;
  sourceName: string;
  presetId: string | null;
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

export interface OpenDaySnapshotListResponse {
  items: OpenDayAnalysisSnapshotSummary[];
}

export interface OpenDayScoreCommand {
  rows: OpenDayRawRow[];
  mappings: OpenDayMappings;
  config?: Partial<OpenDayConfig>;
  sourceName?: string;
  activePresetId?: string;
}
