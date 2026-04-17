import {
  OpenDayAnalysisResponse,
  OpenDayAnalysisRow,
  OpenDayAnalysisSnapshotSummary,
  OpenDayCatalogResponse,
  OpenDayConfig,
  OpenDayRawRow,
  OpenDayScenarioTemplateSummary,
} from '../../modules/open-day/domain/openDay.types.ts';
import { OpenDayFormMappings, DatasetQualityReport } from './openDayConstants.ts';

export type WorkspaceStage = 'upload' | 'workspace';

export interface OpenDayState {
  // Stage
  stage: WorkspaceStage;

  // Catalog
  catalog: OpenDayCatalogResponse;
  catalogMessage: string;

  // Config
  config: OpenDayConfig;
  activeParameterPackageId: string;

  // Upload / Dataset
  datasetId: string;
  datasetProfileId: string;
  headers: string[];
  rows: OpenDayRawRow[];
  sourceName: string;
  sourceUploadId: string;
  workbookSheets: string[];
  activeSheet: string;
  uploadedFile: File | null;
  mappings: OpenDayFormMappings;
  uploadError: string;
  isParsingFile: boolean;

  // Analysis
  analysis: OpenDayAnalysisResponse | null;
  statusMessage: string;
  isBootstrapping: boolean;
  isAnalyzing: boolean;
  hasPendingChanges: boolean;
  activeRow: OpenDayAnalysisRow | null;
  searchTerm: string;

  // Snapshots
  snapshots: OpenDayAnalysisSnapshotSummary[];
  scenarioSnapshots: OpenDayAnalysisSnapshotSummary[];
  replayingSnapshotId: string;
  showScenarioSnapshotsOnly: boolean;

  // Scenarios
  scenarios: OpenDayScenarioTemplateSummary[];
  scenarioName: string;
  scenarioMessage: string;
  isSavingScenario: boolean;
  isLoadingScenario: string;
  activeScenarioTemplateId: string;
  activeScenarioTemplateName: string;
  activeScenarioTemplateVersionId: string;

  // UI
  isSidebarCollapsed: boolean;
  isFullScreen: boolean;
  isLibraryOpen: boolean;
  auditRow: OpenDayAnalysisRow | null;
  baselineAnalysis: OpenDayAnalysisResponse | null;
  baselineSnapshotId: string;

  // Validation
  qualityReport: DatasetQualityReport | null;
}

export type OpenDayAction =
  | { type: 'SET_STAGE'; stage: WorkspaceStage }
  | { type: 'SET_CATALOG'; catalog: OpenDayCatalogResponse; config: OpenDayConfig }
  | { type: 'SET_CATALOG_MESSAGE'; message: string }
  | { type: 'SET_CONFIG'; config: OpenDayConfig }
  | { type: 'SET_PARAMETER_PACKAGE_ID'; id: string }
  | { type: 'SET_HEADERS'; headers: string[] }
  | { type: 'SET_ROWS'; rows: OpenDayRawRow[] }
  | { type: 'SET_DATASET_ID'; id: string }
  | { type: 'SET_DATASET_PROFILE_ID'; id: string }
  | { type: 'SET_SOURCE_NAME'; name: string }
  | { type: 'SET_SOURCE_UPLOAD_ID'; id: string }
  | { type: 'SET_WORKBOOK_SHEETS'; sheets: string[] }
  | { type: 'SET_ACTIVE_SHEET'; sheet: string }
  | { type: 'SET_UPLOADED_FILE'; file: File | null }
  | { type: 'SET_MAPPINGS'; mappings: OpenDayFormMappings }
  | { type: 'SET_UPLOAD_ERROR'; error: string }
  | { type: 'SET_IS_PARSING_FILE'; value: boolean }
  | { type: 'SET_ANALYSIS'; analysis: OpenDayAnalysisResponse | null }
  | { type: 'SET_STATUS_MESSAGE'; message: string }
  | { type: 'SET_IS_BOOTSTRAPPING'; value: boolean }
  | { type: 'SET_IS_ANALYZING'; value: boolean }
  | { type: 'SET_HAS_PENDING_CHANGES'; value: boolean }
  | { type: 'SET_ACTIVE_ROW'; row: OpenDayAnalysisRow | null }
  | { type: 'SET_SEARCH_TERM'; term: string }
  | { type: 'SET_SNAPSHOTS'; items: OpenDayAnalysisSnapshotSummary[] }
  | { type: 'SET_SCENARIO_SNAPSHOTS'; items: OpenDayAnalysisSnapshotSummary[] }
  | { type: 'SET_REPLAYING_SNAPSHOT_ID'; id: string }
  | { type: 'SET_SHOW_SCENARIO_SNAPSHOTS_ONLY'; value: boolean }
  | { type: 'SET_SCENARIOS'; items: OpenDayScenarioTemplateSummary[] }
  | { type: 'SET_SCENARIO_NAME'; name: string }
  | { type: 'SET_SCENARIO_MESSAGE'; message: string }
  | { type: 'SET_IS_SAVING_SCENARIO'; value: boolean }
  | { type: 'SET_IS_LOADING_SCENARIO'; id: string }
  | { type: 'SET_ACTIVE_SCENARIO_TEMPLATE'; id: string; name: string; versionId?: string }
  | { type: 'SET_IS_SIDEBAR_COLLAPSED'; value: boolean }
  | { type: 'TOGGLE_FULL_SCREEN' }
  | { type: 'SET_IS_FULL_SCREEN'; value: boolean }
  | { type: 'TOGGLE_LIBRARY' }
  | { type: 'SET_IS_LIBRARY_OPEN'; value: boolean }
  | { type: 'SET_AUDIT_ROW'; row: OpenDayAnalysisRow | null }
  | { type: 'SET_BASELINE_ANALYSIS'; analysis: OpenDayAnalysisResponse | null; snapshotId: string }
  | { type: 'CLEAR_BASELINE' }
  | { type: 'MARK_DIRTY'; message?: string }
  | { type: 'APPLY_PRESET'; config: OpenDayConfig; packageId: string }
  | { type: 'RESTORE_DEFAULTS'; config: OpenDayConfig }
  | { 
      type: 'APPLY_PARSED_DATA'; 
      headers: string[]; 
      rows: OpenDayRawRow[]; 
      datasetId?: string;
      sourceName: string; 
      mappings: OpenDayFormMappings; 
      qualityReport: DatasetQualityReport;
      statusMessage: string 
    }
  | { type: 'BOOTSTRAP_SUCCESS'; catalog: OpenDayCatalogResponse; config: OpenDayConfig; snapshots: OpenDayAnalysisSnapshotSummary[]; scenarios: OpenDayScenarioTemplateSummary[] }
  | { type: 'BOOTSTRAP_FAILURE'; catalog: OpenDayCatalogResponse; config: OpenDayConfig; message: string }
  | { type: 'REPLAY_SNAPSHOT'; payload: ReplaySnapshotPayload }
  | { type: 'ANALYSIS_COMPLETED'; analysis: OpenDayAnalysisResponse }
  | { type: 'ANALYSIS_FAILED'; message: string }
  | { type: 'CLEAR_DATA' };

export interface ReplaySnapshotPayload {
  rows: OpenDayRawRow[];
  headers: string[];
  mappings: OpenDayFormMappings;
  config: OpenDayConfig;
  sourceName: string;
  sourceUploadId: string;
  datasetId: string;
  datasetProfileId: string;
  activeSheet: string;
  analysis: OpenDayAnalysisResponse;
  parameterPackageId: string;
  scenarioTemplateId: string;
  scenarioTemplateName: string;
  scenarioTemplateVersionId: string;
  scenarioName: string;
  statusMessage: string;
  qualityReport?: DatasetQualityReport;
}

export function openDayReducer(state: OpenDayState, action: OpenDayAction): OpenDayState {
  switch (action.type) {
    case 'SET_STAGE':
      return { ...state, stage: action.stage };
    case 'SET_CATALOG':
      return { ...state, catalog: action.catalog, config: action.config };
    case 'SET_CATALOG_MESSAGE':
      return { ...state, catalogMessage: action.message };
    case 'SET_CONFIG':
      return { ...state, config: action.config };
    case 'SET_PARAMETER_PACKAGE_ID':
      return { ...state, activeParameterPackageId: action.id };
    case 'SET_HEADERS':
      return { ...state, headers: action.headers };
    case 'SET_ROWS':
      return { ...state, rows: action.rows };
    case 'SET_DATASET_ID':
      return { ...state, datasetId: action.id };
    case 'SET_DATASET_PROFILE_ID':
      return { ...state, datasetProfileId: action.id };
    case 'SET_SOURCE_NAME':
      return { ...state, sourceName: action.name };
    case 'SET_SOURCE_UPLOAD_ID':
      return { ...state, sourceUploadId: action.id };
    case 'SET_WORKBOOK_SHEETS':
      return { ...state, workbookSheets: action.sheets };
    case 'SET_ACTIVE_SHEET':
      return { ...state, activeSheet: action.sheet };
    case 'SET_UPLOADED_FILE':
      return { ...state, uploadedFile: action.file };
    case 'SET_MAPPINGS':
      return { ...state, mappings: action.mappings };
    case 'SET_UPLOAD_ERROR':
      return { ...state, uploadError: action.error };
    case 'SET_IS_PARSING_FILE':
      return { ...state, isParsingFile: action.value };
    case 'SET_ANALYSIS':
      return { ...state, analysis: action.analysis };
    case 'SET_STATUS_MESSAGE':
      return { ...state, statusMessage: action.message };
    case 'SET_IS_BOOTSTRAPPING':
      return { ...state, isBootstrapping: action.value };
    case 'SET_IS_ANALYZING':
      return { ...state, isAnalyzing: action.value };
    case 'SET_HAS_PENDING_CHANGES':
      return { ...state, hasPendingChanges: action.value };
    case 'SET_ACTIVE_ROW':
      return { ...state, activeRow: action.row };
    case 'SET_SEARCH_TERM':
      return { ...state, searchTerm: action.term };
    case 'SET_SNAPSHOTS':
      return { ...state, snapshots: action.items };
    case 'SET_SCENARIO_SNAPSHOTS':
      return { ...state, scenarioSnapshots: action.items };
    case 'SET_REPLAYING_SNAPSHOT_ID':
      return { ...state, replayingSnapshotId: action.id };
    case 'SET_SHOW_SCENARIO_SNAPSHOTS_ONLY':
      return { ...state, showScenarioSnapshotsOnly: action.value };
    case 'SET_SCENARIOS':
      return { ...state, scenarios: action.items };
    case 'SET_SCENARIO_NAME':
      return { ...state, scenarioName: action.name };
    case 'SET_SCENARIO_MESSAGE':
      return { ...state, scenarioMessage: action.message };
    case 'SET_IS_SAVING_SCENARIO':
      return { ...state, isSavingScenario: action.value };
    case 'SET_IS_LOADING_SCENARIO':
      return { ...state, isLoadingScenario: action.id };
    case 'SET_ACTIVE_SCENARIO_TEMPLATE':
      return {
        ...state,
        activeScenarioTemplateId: action.id,
        activeScenarioTemplateName: action.name,
        activeScenarioTemplateVersionId: action.versionId || '',
      };
    case 'SET_IS_SIDEBAR_COLLAPSED':
      return { ...state, isSidebarCollapsed: action.value };
    case 'TOGGLE_FULL_SCREEN':
      return { ...state, isFullScreen: !state.isFullScreen };
    case 'SET_IS_FULL_SCREEN':
      return { ...state, isFullScreen: action.value };
    case 'TOGGLE_LIBRARY':
      return { ...state, isLibraryOpen: !state.isLibraryOpen };
    case 'SET_IS_LIBRARY_OPEN':
      return { ...state, isLibraryOpen: action.value };
    case 'SET_AUDIT_ROW':
      return { ...state, auditRow: action.row };
    case 'SET_BASELINE_ANALYSIS':
      return { ...state, baselineAnalysis: action.analysis, baselineSnapshotId: action.snapshotId, isLibraryOpen: false };
    case 'CLEAR_BASELINE':
      return { ...state, baselineAnalysis: null, baselineSnapshotId: '' };

    case 'MARK_DIRTY':
      return {
        ...state,
        hasPendingChanges: true,
        statusMessage: state.stage === 'workspace' ? (action.message || '参数已更新，请点击重新测算。') : state.statusMessage,
      };

    case 'APPLY_PRESET':
      return {
        ...state,
        config: action.config,
        activeParameterPackageId: action.packageId,
        activeScenarioTemplateId: '',
        activeScenarioTemplateName: '',
        activeScenarioTemplateVersionId: '',
        showScenarioSnapshotsOnly: false,
        hasPendingChanges: true,
        statusMessage: state.stage === 'workspace' ? '参数已更新，请点击重新测算。' : state.statusMessage,
      };

    case 'RESTORE_DEFAULTS':
      return {
        ...state,
        config: action.config,
        activeParameterPackageId: 'auto',
        activeScenarioTemplateId: '',
        activeScenarioTemplateName: '',
        activeScenarioTemplateVersionId: '',
        showScenarioSnapshotsOnly: false,
        hasPendingChanges: true,
        statusMessage: state.stage === 'workspace' ? '参数已更新，请点击重新测算。' : state.statusMessage,
      };

    case 'APPLY_PARSED_DATA':
      return {
        ...state,
        headers: action.headers,
        rows: action.rows,
        datasetId: action.datasetId || '',
        datasetProfileId: '',
        sourceName: action.sourceName,
        mappings: action.mappings,
        qualityReport: action.qualityReport,
        analysis: null,
        hasPendingChanges: true,
        uploadError: '',
        scenarioMessage: '',
        scenarioName: state.scenarioName || action.sourceName.split('/')[0].trim(),
        statusMessage: action.statusMessage,
      };

    case 'BOOTSTRAP_SUCCESS':
      return {
        ...state,
        catalog: action.catalog,
        config: action.config,
        snapshots: action.snapshots,
        scenarioSnapshots: [],
        scenarios: action.scenarios,
        activeParameterPackageId: 'auto',
        hasPendingChanges: false,
        catalogMessage: '',
        isBootstrapping: false,
      };

    case 'BOOTSTRAP_FAILURE':
      return {
        ...state,
        catalog: action.catalog,
        config: action.config,
        snapshots: [],
        scenarioSnapshots: [],
        scenarios: [],
        hasPendingChanges: false,
        catalogMessage: action.message,
        isBootstrapping: false,
      };

    case 'REPLAY_SNAPSHOT': {
      const p = action.payload;
      return {
        ...state,
        stage: 'workspace',
        rows: p.rows,
        headers: p.headers,
        datasetId: p.datasetId,
        datasetProfileId: p.datasetProfileId,
        mappings: p.mappings,
        config: p.config,
        sourceName: p.sourceName,
        sourceUploadId: p.sourceUploadId,
        workbookSheets: [],
        activeSheet: p.activeSheet,
        uploadedFile: null,
        analysis: p.analysis,
        activeParameterPackageId: p.parameterPackageId,
        activeScenarioTemplateId: p.scenarioTemplateId,
        activeScenarioTemplateName: p.scenarioTemplateName,
        activeScenarioTemplateVersionId: p.scenarioTemplateVersionId,
        scenarioName: p.scenarioName,
        hasPendingChanges: false,
        showScenarioSnapshotsOnly: Boolean(p.scenarioTemplateId),
        statusMessage: p.statusMessage,
        qualityReport: p.qualityReport || null,
      };
    }

    case 'ANALYSIS_COMPLETED':
      return {
        ...state,
        analysis: action.analysis,
        datasetId: action.analysis.meta.datasetId || state.datasetId,
        datasetProfileId: action.analysis.meta.datasetProfileId || state.datasetProfileId,
        hasPendingChanges: false,
        statusMessage: '',
        isAnalyzing: false,
      };

    case 'ANALYSIS_FAILED':
      return {
        ...state,
        analysis: null,
        statusMessage: action.message,
        isAnalyzing: false,
      };

    case 'CLEAR_DATA':
      return {
        ...state,
        rows: [],
        headers: [],
        datasetId: '',
        datasetProfileId: '',
        qualityReport: null,
      };

    default:
      return state;
  }
}
