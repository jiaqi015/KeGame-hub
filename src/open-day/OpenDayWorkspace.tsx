import { useEffect, useMemo, useReducer, useRef } from 'react';
import {
  ArrowLeft,
  FileDown,
  FileUp,
  RotateCw,
  Activity,
} from 'lucide-react';

import type { ParsedWorkbookPayload } from '../../lib/openDayWorkbook.ts';
import type {
  OpenDayConfig,
  OpenDayParameterKey,
  OpenDayParameterPackage,
  OpenDayRawRow,
  OpenDayScenarioDraft,
} from '../../modules/open-day/domain/openDay.types.ts';

import { normalizeOpenDayRows } from '../../modules/open-day/domain/openDayDatasetNormalizer.js';
import { resolveOpenDayWaterlineContext } from '../../modules/open-day/domain/openDayParameterResolver.js';
import { resolveOpenDayScenarioDraft } from '../../modules/open-day/application/openDayScenarioDraft.js';

import {
  fetchOpenDayAnalysis,
  fetchOpenDayCatalog,
  fetchOpenDaySnapshotDetail,
  fetchOpenDayScenarioDetail,
  fetchOpenDayScenarios,
  fetchOpenDaySnapshots,
  saveOpenDayScenario,
  uploadWorkbook,
} from './openDayClient';

import {
  cloneConfig,
  createEmptyMappings,
  fallbackCatalog,
  getMissingMappings,
  guessMappings,
  mergeConfig,
  sampleCsv,
  type OpenDayFormMappings,
  waterlineDefinitions,
  type OpenDayDatasetDraft,
  generateDatasetQualityReport,
} from './openDayConstants';

import {
  getParameterPackageLabel,
  buildScenarioDraftName,
  extractHeadersFromRows,
} from './openDayUtils';

import { parseCsv } from './openDayCsv';
import { openDayReducer, type OpenDayState } from './openDayReducer';
import { formatNumber, formatPercent, formatDateTime } from './formatters';

// Sub-components
import { UploadStage } from './components/UploadStage';
import { FormulaBar } from './components/FormulaBar';
import { AnalysisTable } from './components/AnalysisTable';
import { InsightDrawer } from './components/InsightDrawer';
import { LibraryOverlay } from './components/LibraryOverlay';
import { SidebarConfig } from './components/SidebarConfig';

import './open-day-workspace.css';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface OpenDayWorkspaceProps {
  activationKey: string;
}

// ─── Initial State ──────────────────────────────────────────────────────────────

function createInitialState(): OpenDayState {
  return {
    stage: 'upload',
    catalog: fallbackCatalog,
    catalogMessage: '',
    config: cloneConfig(fallbackCatalog.defaultConfig),
    activeParameterPackageId: 'auto',
    headers: [],
    rows: [],
    sourceName: '',
    sourceUploadId: '',
    workbookSheets: [],
    activeSheet: '',
    uploadedFile: null,
    mappings: createEmptyMappings(),
    uploadError: '',
    isParsingFile: false,
    analysis: null,
    statusMessage: '请先上传数据。',
    isBootstrapping: true,
    isAnalyzing: false,
    hasPendingChanges: false,
    activeRow: null,
    searchTerm: '',
    snapshots: [],
    scenarioSnapshots: [],
    replayingSnapshotId: '',
    showScenarioSnapshotsOnly: false,
    scenarios: [],
    scenarioName: '',
    scenarioMessage: '',
    isSavingScenario: false,
    isLoadingScenario: '',
    activeScenarioTemplateId: '',
    activeScenarioTemplateName: '',
    isSidebarCollapsed: false,
    isFullScreen: false,
    isLibraryOpen: false,
    qualityReport: null,
  };
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export function OpenDayWorkspace({ activationKey }: OpenDayWorkspaceProps) {
  const [state, dispatch] = useReducer(openDayReducer, undefined, createInitialState);
  const requestVersionRef = useRef(0);

  const {
    stage,
    catalog,
    catalogMessage,
    config,
    activeParameterPackageId,
    headers,
    rows,
    sourceName,
    sourceUploadId,
    workbookSheets,
    activeSheet,
    mappings,
    uploadError,
    isParsingFile,
    analysis,
    statusMessage,
    isBootstrapping,
    isAnalyzing,
    hasPendingChanges,
    activeRow,
    searchTerm,
    snapshots,
    scenarioSnapshots,
    scenarios,
    scenarioName,
    scenarioMessage,
    isSavingScenario,
    isLoadingScenario,
    activeScenarioTemplateId,
    activeScenarioTemplateName,
    showScenarioSnapshotsOnly,
    isSidebarCollapsed,
    isFullScreen,
    isLibraryOpen,
    qualityReport,
  } = state;

  const parameterPackages = (catalog.parameterPackages?.length ? catalog.parameterPackages : (catalog.presets || [])) as OpenDayParameterPackage[];

  // ─── Derived ──────────────────────────────────────────────────────────────────

  const datasetDraft = useMemo<OpenDayDatasetDraft>(
    () => ({
      headers,
      rows,
      mappings,
      sourceName,
      sourceUploadId,
      workbookSheets,
      activeSheet,
    }),
    [headers, rows, mappings, sourceName, sourceUploadId, workbookSheets, activeSheet],
  );

  const scenarioDraft = useMemo(
    () =>
      resolveOpenDayScenarioDraft({
        scenario: {
          formulaId: config.formulaId,
          parameterPackageId: activeParameterPackageId === 'custom' ? null : activeParameterPackageId,
          config,
        },
        activeParameterPackageId: activeParameterPackageId === 'custom' ? '' : activeParameterPackageId,
      }),
    [activeParameterPackageId, config],
  );

  const activeFormula = useMemo(
    () => (catalog.formulas || []).find((f) => f.id === scenarioDraft.formulaId) || fallbackCatalog.formulas[0],
    [catalog.formulas, scenarioDraft.formulaId],
  ) || fallbackCatalog.formulas[0];

  const missingMappings = getMissingMappings(mappings);
  const normalizedPreviewRows =
    datasetDraft.rows.length && missingMappings.length === 0 ? normalizeOpenDayRows(datasetDraft.rows, datasetDraft.mappings) : [];
  const waterlinePreview =
    normalizedPreviewRows.length > 0 ? resolveOpenDayWaterlineContext(normalizedPreviewRows, scenarioDraft.config) : null;

  const displayedSnapshots = showScenarioSnapshotsOnly && activeScenarioTemplateId ? scenarioSnapshots : snapshots;

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function getResolvedParameter(key: OpenDayParameterKey) {
    return waterlinePreview?.resolvedParameters.find((p) => p.key === key) || null;
  }

  function getDisplayedWaterlineValue(key: OpenDayParameterKey) {
    return getResolvedParameter(key)?.finalValue ?? config.absolutes[key];
  }

  const filteredResults = useMemo(() => {
    if (!analysis) return [];
    return analysis.results.filter((row) => 
      !searchTerm || row.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [analysis, searchTerm]);

  function handleSelectNext() {
    if (!filteredResults.length) return;
    const currentIndex = activeRow ? filteredResults.findIndex((r) => r.name === activeRow.name) : -1;
    const nextIndex = (currentIndex + 1) % filteredResults.length;
    dispatch({ type: 'SET_ACTIVE_ROW', row: filteredResults[nextIndex] });
  }

  function handleSelectPrev() {
    if (!filteredResults.length) return;
    const currentIndex = activeRow ? filteredResults.findIndex((r) => r.name === activeRow.name) : -1;
    const prevIndex = currentIndex <= 0 ? filteredResults.length - 1 : currentIndex - 1;
    dispatch({ type: 'SET_ACTIVE_ROW', row: filteredResults[prevIndex] });
  }

  function updateConfig(mutator: (draft: OpenDayConfig) => void) {
    const next = cloneConfig(config);
    mutator(next);
    dispatch({ type: 'SET_CONFIG', config: next });
    dispatch({ type: 'SET_ACTIVE_SCENARIO_TEMPLATE', id: '', name: '' });
    dispatch({ type: 'SET_SHOW_SCENARIO_SNAPSHOTS_ONLY', value: false });
    dispatch({ type: 'MARK_DIRTY' });
  }

  // ─── Async Actions ────────────────────────────────────────────────────────────

  async function refreshSnapshots() {
    try {
      const payload = await fetchOpenDaySnapshots(activationKey, 8);
      dispatch({ type: 'SET_SNAPSHOTS', items: payload.items });
    } catch {
      dispatch({ type: 'SET_SNAPSHOTS', items: [] });
    }
  }

  async function refreshScenarioSnapshots(scenarioTemplateId: string) {
    if (!scenarioTemplateId) {
      dispatch({ type: 'SET_SCENARIO_SNAPSHOTS', items: [] });
      return;
    }
    try {
      const payload = await fetchOpenDaySnapshots(activationKey, 8, scenarioTemplateId);
      dispatch({ type: 'SET_SCENARIO_SNAPSHOTS', items: payload.items });
    } catch {
      dispatch({ type: 'SET_SCENARIO_SNAPSHOTS', items: [] });
    }
  }

  async function refreshScenarios() {
    try {
      const payload = await fetchOpenDayScenarios(activationKey, 8);
      dispatch({ type: 'SET_SCENARIOS', items: payload.items });
    } catch {
      dispatch({ type: 'SET_SCENARIOS', items: [] });
    }
  }

  function applyParsedData(payload: ParsedWorkbookPayload | { headers: string[]; rows: OpenDayRawRow[] }, nextSourceName: string) {
    const nextMappings = guessMappings(payload.headers);
    const qualityReport = generateDatasetQualityReport(payload.rows, nextMappings);
    
    dispatch({
      type: 'APPLY_PARSED_DATA',
      headers: payload.headers,
      rows: payload.rows,
      sourceName: nextSourceName,
      mappings: nextMappings,
      qualityReport,
      statusMessage: stage === 'workspace' ? '已载入新数据，准备重新测算。' : '数据已准备好，可以进入下一步。',
    });
  }

  async function handleWorkbookUpload(file: File, requestedSheet = '') {
    const payload = await uploadWorkbook(activationKey, file, requestedSheet);
    dispatch({ type: 'SET_WORKBOOK_SHEETS', sheets: payload.sheets });
    dispatch({ type: 'SET_ACTIVE_SHEET', sheet: payload.activeSheet });
    if (!requestedSheet) {
      dispatch({ type: 'SET_SOURCE_UPLOAD_ID', id: payload.uploadArtifact?.id || '' });
    } else if (payload.uploadArtifact?.id) {
      dispatch({ type: 'SET_SOURCE_UPLOAD_ID', id: payload.uploadArtifact.id });
    }
    applyParsedData(payload, `${file.name}${payload.activeSheet ? ` / ${payload.activeSheet}` : ''}`);
  }

  async function handleFileSelection(file: File) {
    dispatch({ type: 'SET_UPLOAD_ERROR', error: '' });
    dispatch({ type: 'SET_IS_PARSING_FILE', value: true });

    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        dispatch({ type: 'SET_UPLOADED_FILE', file });
        await handleWorkbookUpload(file);
        return;
      }

      const text = await file.text();
      const parsed = parseCsv(text);
      dispatch({ type: 'SET_UPLOADED_FILE', file: null });
      dispatch({ type: 'SET_WORKBOOK_SHEETS', sheets: [] });
      dispatch({ type: 'SET_ACTIVE_SHEET', sheet: '' });
      dispatch({ type: 'SET_SOURCE_UPLOAD_ID', id: '' });
      applyParsedData(parsed, file.name);
    } finally {
      dispatch({ type: 'SET_IS_PARSING_FILE', value: false });
    }
  }

  function handleLoadSample() {
    const parsed = parseCsv(sampleCsv);
    dispatch({ type: 'SET_UPLOADED_FILE', file: null });
    dispatch({ type: 'SET_WORKBOOK_SHEETS', sheets: [] });
    dispatch({ type: 'SET_ACTIVE_SHEET', sheet: '' });
    dispatch({ type: 'SET_SOURCE_UPLOAD_ID', id: '' });
    applyParsedData(parsed, '示例数据');
  }

  function handleApplyPreset(presetId: string) {
    const pp = parameterPackages.find((p) => p.id === presetId);
    dispatch({
      type: 'APPLY_PRESET',
      config: cloneConfig(pp?.resolvedConfig || mergeConfig(catalog.defaultConfig, pp?.overrides)),
      packageId: pp?.id || 'auto',
    });
  }

  function handleRestoreDefaults() {
    dispatch({ type: 'RESTORE_DEFAULTS', config: cloneConfig(catalog.defaultConfig) });
  }

  async function handleSaveScenario() {
    const name = scenarioName.trim() || buildScenarioDraftName(datasetDraft.sourceName, scenarioDraft, parameterPackages, catalog.formulas);
    dispatch({ type: 'SET_IS_SAVING_SCENARIO', value: true });
    dispatch({ type: 'SET_SCENARIO_MESSAGE', message: '' });

    try {
      const record = await saveOpenDayScenario(activationKey, {
        name,
        description: datasetDraft.sourceName ? `来源：${datasetDraft.sourceName}` : '',
        scenario: scenarioDraft,
        activePresetId: activeParameterPackageId,
        activeParameterPackageId: scenarioDraft.parameterPackageId || '',
      });

      dispatch({ type: 'SET_ACTIVE_SCENARIO_TEMPLATE', id: record.summary.id, name: record.summary.name });
      dispatch({ type: 'SET_SCENARIO_NAME', name: record.summary.name });
      dispatch({ type: 'SET_SCENARIO_MESSAGE', message: `已保存方案：${record.summary.name}` });
      await refreshScenarios();
      await refreshScenarioSnapshots(record.summary.id);
    } catch (error) {
      dispatch({ type: 'SET_SCENARIO_MESSAGE', message: error instanceof Error ? error.message : '方案保存失败' });
    } finally {
      dispatch({ type: 'SET_IS_SAVING_SCENARIO', value: false });
    }
  }

  async function handleLoadScenario(id: string) {
    dispatch({ type: 'SET_IS_LOADING_SCENARIO', id });
    dispatch({ type: 'SET_SCENARIO_MESSAGE', message: '' });

    try {
      const record = await fetchOpenDayScenarioDetail(activationKey, id);
      dispatch({ type: 'SET_CONFIG', config: cloneConfig(record.scenario.config) });
      dispatch({ type: 'SET_PARAMETER_PACKAGE_ID', id: record.scenario.parameterPackageId || 'custom' });
      dispatch({ type: 'SET_ACTIVE_SCENARIO_TEMPLATE', id: record.summary.id, name: record.summary.name });
      dispatch({ type: 'SET_SCENARIO_NAME', name: record.summary.name });
      dispatch({ type: 'MARK_DIRTY', message: `已加载方案"${record.summary.name}"，请点击重新测算。` });
      dispatch({ type: 'SET_SCENARIO_MESSAGE', message: `已载入方案：${record.summary.name}` });
      await refreshScenarioSnapshots(record.summary.id);
    } catch (error) {
      dispatch({ type: 'SET_SCENARIO_MESSAGE', message: error instanceof Error ? error.message : '方案加载失败' });
    } finally {
      dispatch({ type: 'SET_IS_LOADING_SCENARIO', id: '' });
    }
  }

  async function handleReplaySnapshot(id: string) {
    dispatch({ type: 'SET_REPLAYING_SNAPSHOT_ID', id });
    dispatch({ type: 'SET_SCENARIO_MESSAGE', message: '' });
    dispatch({ type: 'SET_UPLOAD_ERROR', error: '' });
    dispatch({ type: 'SET_STATUS_MESSAGE', message: '正在回放历史测算...' });

    try {
      const record = await fetchOpenDaySnapshotDetail(activationKey, id);
      const restoredMappings: OpenDayFormMappings = {
        area: record.command.mappings.area || '',
        name: record.command.mappings.name || '',
        inventory: record.command.mappings.inventory || '',
        traffic: record.command.mappings.traffic || '',
        transactions: record.command.mappings.transactions || '',
        premium: record.command.mappings.premium || '',
      };
      const restoredRows = Array.isArray(record.command.rows) ? record.command.rows : [];
      const restoredScenario = record.response.meta.scenario || resolveOpenDayScenarioDraft(record.command);
      const restoredScenarioTemplateId = record.command.activeScenarioTemplateId || record.summary.scenarioTemplateId || '';
      const restoredScenarioTemplateName = record.command.activeScenarioTemplateName || record.summary.scenarioTemplateName || '';
      const restoredParameterPackageId = restoredScenario.parameterPackageId || 'custom';
      const restoredSourceName = record.command.sourceName || record.summary.sourceName || '未命名数据集';

      dispatch({
        type: 'REPLAY_SNAPSHOT',
        payload: {
          rows: restoredRows,
          headers: extractHeadersFromRows(restoredRows, restoredMappings),
          mappings: restoredMappings,
          config: cloneConfig(restoredScenario.config),
          sourceName: restoredSourceName,
          sourceUploadId: record.command.sourceUploadId || record.summary.sourceUploadId || '',
          analysis: record.response,
          parameterPackageId: restoredParameterPackageId,
          scenarioTemplateId: restoredScenarioTemplateId,
          scenarioTemplateName: restoredScenarioTemplateName,
          scenarioName:
            restoredScenarioTemplateName
            || buildScenarioDraftName(restoredSourceName, restoredScenario, parameterPackages, catalog.formulas),
          statusMessage: `已回放 ${formatDateTime(record.summary.createdAt)} 的测算结果。`,
        },
      });

      void refreshSnapshots();
      if (restoredScenarioTemplateId) {
        void refreshScenarioSnapshots(restoredScenarioTemplateId);
      } else {
        dispatch({ type: 'SET_SCENARIO_SNAPSHOTS', items: [] });
      }
    } catch (error) {
      dispatch({ type: 'SET_STATUS_MESSAGE', message: error instanceof Error ? error.message : '快照回放失败' });
    } finally {
      dispatch({ type: 'SET_REPLAYING_SNAPSHOT_ID', id: '' });
    }
  }

  function handleExportCsv() {
    if (!analysis || !analysis.results.length) return;

    const headersList = ['排名', '大区', '小区名称', '综合得分', '梯队', '状态', '规模得分', '流量得分', '商品得分', '互动得分', '成交量(单)', '转化率'];
    const rowsList = analysis.results.map((row) => [
      row.rank,
      row.area,
      row.name,
      formatNumber(row.score, 1),
      row.tierCode,
      row.isEligible ? '达标' : '未达标',
      formatNumber(row.scaleIdx, 1),
      formatNumber(row.trafficIdx, 1),
      formatNumber(row.productIdx, 1),
      formatNumber(row.interactionIdx, 1),
      row.transactions,
      formatPercent(row.convRate, 2),
    ]);

    const csvContent = '\uFEFF' + [headersList.join(','), ...rowsList.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${datasetDraft.sourceName || '开放日测算结果'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Effect to handle Esc key for full screen and library
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (state.isFullScreen) dispatch({ type: 'SET_IS_FULL_SCREEN', value: false });
        if (state.isLibraryOpen) dispatch({ type: 'SET_IS_LIBRARY_OPEN', value: false });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.isFullScreen, state.isLibraryOpen]);

  async function executeAnalysis() {
    if (stage !== 'workspace') {
      dispatch({ type: 'SET_STATUS_MESSAGE', message: '请先进入测算工作台。' });
      return;
    }

    if (!rows.length) {
      dispatch({ type: 'SET_ANALYSIS', analysis: null });
      dispatch({ type: 'SET_STATUS_MESSAGE', message: '请先回到上一步上传数据。' });
      return;
    }

    if (missingMappings.length > 0) {
      dispatch({ type: 'SET_ANALYSIS', analysis: null });
      dispatch({ type: 'SET_STATUS_MESSAGE', message: `请先完成字段映射：${missingMappings.join('、')}` });
      return;
    }

    const currentVersion = requestVersionRef.current + 1;
    requestVersionRef.current = currentVersion;
    dispatch({ type: 'SET_IS_ANALYZING', value: true });
    dispatch({ type: 'SET_STATUS_MESSAGE', message: '正在生成测算结果...' });

    try {
      const payload = await fetchOpenDayAnalysis(activationKey, {
        rows: datasetDraft.rows,
        mappings: datasetDraft.mappings,
        scenario: scenarioDraft,
        sourceName: datasetDraft.sourceName,
        sourceUploadId: datasetDraft.sourceUploadId,
        activeScenarioTemplateId,
        activeScenarioTemplateName,
        activePresetId: activeParameterPackageId,
        activeParameterPackageId: scenarioDraft.parameterPackageId || '',
      });

      if (requestVersionRef.current !== currentVersion) return;

      dispatch({ type: 'ANALYSIS_COMPLETED', analysis: payload });
      void refreshSnapshots();
      if (activeScenarioTemplateId) {
        void refreshScenarioSnapshots(activeScenarioTemplateId);
      }
    } catch (error) {
      if (requestVersionRef.current !== currentVersion) return;

      dispatch({ type: 'ANALYSIS_FAILED', message: error instanceof Error ? error.message : '开放日测算失败' });
    }
  }

  // ─── Effects ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      dispatch({ type: 'SET_IS_BOOTSTRAPPING', value: true });

      try {
        const [nextCatalog, nextSnapshots, nextScenarios] = await Promise.all([
          fetchOpenDayCatalog(activationKey),
          fetchOpenDaySnapshots(activationKey, 8),
          fetchOpenDayScenarios(activationKey, 8),
        ]);

        if (cancelled) return;

        dispatch({
          type: 'BOOTSTRAP_SUCCESS',
          catalog: nextCatalog,
          config: cloneConfig(nextCatalog.defaultConfig),
          snapshots: nextSnapshots.items,
          scenarios: nextScenarios.items,
        });
      } catch (error) {
        if (cancelled) return;

        dispatch({
          type: 'BOOTSTRAP_FAILURE',
          catalog: fallbackCatalog,
          config: cloneConfig(fallbackCatalog.defaultConfig),
          message: error instanceof Error ? `${error.message}，已自动回退到默认策略。` : '策略目录加载失败，已自动回退到默认策略。',
        });
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [activationKey]);

  useEffect(() => {
    if (!activeScenarioTemplateId) {
      dispatch({ type: 'SET_SCENARIO_SNAPSHOTS', items: [] });
      return;
    }

    void refreshScenarioSnapshots(activeScenarioTemplateId);
  }, [activationKey, activeScenarioTemplateId]);

  // ─── Upload Stage ─────────────────────────────────────────────────────────────

  if (stage === 'upload') {
    return (
      <UploadStage
        rows={rows}
        headers={headers}
        sourceName={sourceName}
        activeSheet={activeSheet}
        isParsingFile={isParsingFile}
        uploadError={uploadError}
        catalogMessage={catalogMessage}
        qualityReport={qualityReport}
        onFileSelection={(file) => {
          void handleFileSelection(file).catch((err) =>
            dispatch({ type: 'SET_UPLOAD_ERROR', error: err.message }),
          );
        }}
        onLoadSample={handleLoadSample}
        onClearData={() => dispatch({ type: 'CLEAR_DATA' })}
        onEnterWorkspace={() => {
          dispatch({ type: 'SET_STAGE', stage: 'workspace' });
          dispatch({ type: 'SET_HAS_PENDING_CHANGES', value: true });
          dispatch({ type: 'SET_STATUS_MESSAGE', message: '参数配置已就绪，请点击右上角测算。' });
        }}
        onUploadError={(error) => dispatch({ type: 'SET_UPLOAD_ERROR', error })}
      />
    );
  }

  // ─── Workspace Stage ──────────────────────────────────────────────────────────

  return (
    <div className="open-day-workspace">
      <div className="open-day-workspace__shell">
        {catalogMessage ? <div className="open-day-workspace__banner">{catalogMessage}</div> : null}

        {/* Header */}
        <div className="open-day-workspace-header">
          <div className="open-day-workspace-header__main">
            <button type="button" className="open-day-button open-day-button--secondary open-day-button--xs" onClick={() => dispatch({ type: 'SET_STAGE', stage: 'upload' })}>
              <ArrowLeft className="open-day-button__icon" />
              <span>返回上传</span>
            </button>
            <div className="open-day-workspace-header__title-group">
              <h2>测算工作台</h2>
              <div className="open-day-workspace-header__meta-sep" />
              <p className="open-day-workspace-header__meta">
                {datasetDraft.sourceName || '未命名数据集'}
                {datasetDraft.activeSheet ? ` · ${datasetDraft.activeSheet}` : ''}
              </p>
            </div>
          </div>

          <div className="open-day-workspace-header__actions">
            <div className="open-day-header-secondary-group">
              <label className="open-day-button open-day-button--secondary open-day-button--sm open-day-button--file" title="更换数据文件">
                <FileUp size={16} />
                <input
                  type="file"
                  className="open-day-hidden-file-input"
                  accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0];
                    event.currentTarget.value = '';
                    if (!nextFile) return;
                    void handleFileSelection(nextFile).catch((err) =>
                      dispatch({ type: 'SET_UPLOAD_ERROR', error: err.message }),
                    );
                  }}
                />
              </label>
            </div>
            <button
              type="button"
              className={`open-day-button open-day-button--lg ${hasPendingChanges ? 'open-day-button--primary open-day-button--pulse' : 'open-day-button--primary'}`}
              disabled={isAnalyzing}
              onClick={() => void executeAnalysis()}
            >
              {isAnalyzing ? <RotateCw className="open-day-button__icon animate-spin" /> : <Activity className="open-day-button__icon" />}
              <span>{isAnalyzing ? '测算中...' : '开始测算'}</span>
            </button>
          </div>
        </div>

        {/* Formula Bar */}
        <FormulaBar
          scenarioDraft={scenarioDraft}
          config={config}
          formulas={catalog.formulas || []}
          waterlineDefinitions={waterlineDefinitions}
          getResolvedParameter={getResolvedParameter}
          onFormulaChange={(formulaId) => updateConfig((draft) => { draft.formulaId = formulaId; })}
          onWaterlineModeChange={(nextMode) => {
            updateConfig((draft) => {
              draft.waterlineMode = nextMode;
              if (nextMode === 'absolute') {
                waterlineDefinitions.forEach((def) => {
                  const resolved = getResolvedParameter(def.key);
                  draft.absolutes[def.key] = resolved?.finalValue ?? draft.absolutes[def.key];
                });
              }
              draft.waterlineOverrides = {};
            });
          }}
        />

        {/* Main Layout */}
        <div className={`open-day-workspace-layout ${isSidebarCollapsed || isFullScreen ? 'is-sidebar-collapsed' : ''}`}>
          {/* Sidebar */}
          <SidebarConfig
            config={config}
            parameterPackages={parameterPackages}
            activeParameterPackageId={activeParameterPackageId}
            waterlineDefinitions={waterlineDefinitions}
            normalizedPreviewRows={normalizedPreviewRows}
            displayedSnapshots={displayedSnapshots}
            activeSnapshotId={analysis?.meta.snapshotId}
            isSidebarCollapsed={isSidebarCollapsed}
            scenarios={scenarios}
            scenarioName={scenarioName}
            scenarioMessage={scenarioMessage}
            isSavingScenario={isSavingScenario}
            isLoadingScenario={isLoadingScenario}
            activeScenarioTemplateId={activeScenarioTemplateId}
            getDisplayedWaterlineValue={getDisplayedWaterlineValue}
            onToggleCollapsed={() => dispatch({ type: 'SET_IS_SIDEBAR_COLLAPSED', value: !isSidebarCollapsed })}
            onApplyPreset={handleApplyPreset}
            onUpdateConfig={updateConfig}
            onRestoreDefaults={handleRestoreDefaults}
            onRefreshSnapshots={() => void refreshSnapshots()}
            onReplaySnapshot={(id) => void handleReplaySnapshot(id)}
            onScenarioNameChange={(name) => dispatch({ type: 'SET_SCENARIO_NAME', name })}
            onSaveScenario={() => void handleSaveScenario()}
            onLoadScenario={(id) => void handleLoadScenario(id)}
            onToggleLibrary={() => dispatch({ type: 'TOGGLE_LIBRARY' })}
          />

          {/* Main Content */}
          <main>
            <AnalysisTable
              analysis={analysis}
              searchTerm={searchTerm}
              activeRow={activeRow}
              isBootstrapping={isBootstrapping}
              isAnalyzing={isAnalyzing}
              hasPendingChanges={hasPendingChanges}
              statusMessage={statusMessage}
              qualityReport={qualityReport}
              currentParameterLabel={getParameterPackageLabel(activeParameterPackageId, parameterPackages)}
              currentFormulaLabel={activeFormula?.label || '默认公式'}
              sampleCount={datasetDraft.rows.length}
              onSearchChange={(term) => dispatch({ type: 'SET_SEARCH_TERM', term })}
              onRowClick={(row) => dispatch({ type: 'SET_ACTIVE_ROW', row })}
              onExecuteAnalysis={() => void executeAnalysis()}
              isFullScreen={isFullScreen}
              onSelectNext={handleSelectNext}
              onSelectPrev={handleSelectPrev}
              onToggleFullScreen={() => dispatch({ type: 'TOGGLE_FULL_SCREEN' })}
              onExport={handleExportCsv}
            />
          </main>
        </div>
      </div>

      {/* Insight Drawer */}
      {activeRow && (
        <InsightDrawer
          row={activeRow}
          config={config}
          onClose={() => dispatch({ type: 'SET_ACTIVE_ROW', row: null })}
        />
      )}
      {/* Library Overlay */}
      <LibraryOverlay
        isOpen={isLibraryOpen}
        onClose={() => dispatch({ type: 'SET_IS_LIBRARY_OPEN', value: false })}
        scenarios={scenarios}
        scenarioName={scenarioName}
        scenarioMessage={scenarioMessage}
        isSavingScenario={isSavingScenario}
        isLoadingScenario={isLoadingScenario}
        activeScenarioTemplateId={activeScenarioTemplateId}
        onScenarioNameChange={(name) => dispatch({ type: 'SET_SCENARIO_NAME', name })}
        onSaveScenario={() => void handleSaveScenario()}
        onLoadScenario={(id) => void handleLoadScenario(id)}
        snapshots={displayedSnapshots}
        activeSnapshotId={analysis?.meta.snapshotId}
        onRefreshSnapshots={() => void refreshSnapshots()}
        onReplaySnapshot={(id) => void handleReplaySnapshot(id)}
      />
    </div>
  );
}
