import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  FileUp,
} from 'lucide-react';
import type { ParsedWorkbookPayload } from '../../lib/openDayWorkbook.ts';
import type {
  OpenDayAnalysisResponse,
  OpenDayAnalysisSnapshotSummary,
  OpenDayConfig,
  OpenDayParameterKey,
  OpenDayPreset,
  OpenDayRawRow,
  OpenDayScenarioTemplateSummary,
} from '../../modules/open-day/domain/openDay.types.ts';
import { normalizeOpenDayRows } from '../../modules/open-day/domain/openDayDatasetNormalizer.js';
import {
  deriveOpenDayPercentileForValue,
  resolveOpenDayWaterlineContext,
} from '../../modules/open-day/domain/openDayParameterResolver.js';
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
} from './openDayConstants';
import { parseCsv } from './openDayCsv';
import './open-day-workspace.css';

interface OpenDayWorkspaceProps {
  activationKey: string;
}

type WorkspaceStage = 'upload' | 'workspace';

interface WaterlineDefinition {
  key: keyof OpenDayConfig['absolutes'];
  title: string;
  description: string;
  percentileLabel: string;
  absoluteLabel: string;
  absoluteStep: string;
  unit: string;
}

const waterlineDefinitions: WaterlineDefinition[] = [
  {
    key: 'I_cap',
    title: '规模水位线',
    description: '在售规模达到这个刻度后，视为开放日场域动员饱和。',
    percentileLabel: '规模分位',
    absoluteLabel: '满分套数',
    absoluteStep: '1',
    unit: '套',
  },
  {
    key: 'V_cap',
    title: '流量水位线',
    description: '带看达到标杆后视为人气饱和，再高主要靠 Alpha 做平滑。',
    percentileLabel: '流量分位',
    absoluteLabel: '标杆带看',
    absoluteStep: '1',
    unit: '次',
  },
  {
    key: 'H_cap',
    title: '商品水位线',
    description: '好房达到这个刻度后，单场活动已具备横向对比的货品密度。',
    percentileLabel: '商品分位',
    absoluteLabel: '好房套数',
    absoluteStep: '1',
    unit: '套',
  },
  {
    key: 'R_cap',
    title: '互动水位线',
    description: '按成交量 / 带看量计算的互动质量健康线，用来衡量逼定氛围。',
    percentileLabel: '互动分位',
    absoluteLabel: '健康转化率',
    absoluteStep: '0.001',
    unit: '%',
  },
];

function formatNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  return Number(value).toFixed(digits);
}

function formatPercent(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  return `${(value * 100).toFixed(digits)}%`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getPresetLabel(activePresetId: string, presets: OpenDayPreset[]) {
  return presets.find((preset) => preset.id === activePresetId)?.label || (activePresetId === 'custom' ? '自定义参数' : '自动巡航');
}

function buildUploadSummary(sourceName: string, rowCount: number, headers: string[]) {
  if (!rowCount) {
    return '上传 Excel 或 CSV 后，系统会自动识别字段。确认数据无误后，再进入测算工作台。';
  }

  return `已载入 ${sourceName}，共 ${rowCount} 行，识别到 ${headers.length} 个字段。下一步可以调整策略并查看结果。`;
}

function buildScenarioDraftName(sourceName: string, activePresetId: string, presets: OpenDayPreset[]) {
  const label = getPresetLabel(activePresetId, presets);
  const baseName = sourceName ? sourceName.split('/')[0].trim() : '开放日方案';
  const timestamp = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date())
    .replace(/\//g, '-')
    .replace(/\s+/g, ' ');

  return `${baseName} ${label} ${timestamp}`;
}

function extractHeadersFromRows(rows: OpenDayRawRow[], mappings: OpenDayFormMappings) {
  const seen = new Set<string>();
  const ordered: string[] = [];

  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(key);
      }
    });
  });

  Object.values(mappings).forEach((value) => {
    if (value && !seen.has(value)) {
      seen.add(value);
      ordered.push(value);
    }
  });

  return ordered;
}

export function OpenDayWorkspace({ activationKey }: OpenDayWorkspaceProps) {
  const [stage, setStage] = useState<WorkspaceStage>('upload');
  const [catalog, setCatalog] = useState(fallbackCatalog);
  const [config, setConfig] = useState<OpenDayConfig>(cloneConfig(fallbackCatalog.defaultConfig));
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<OpenDayRawRow[]>([]);
  const [sourceName, setSourceName] = useState('');
  const [sourceUploadId, setSourceUploadId] = useState('');
  const [workbookSheets, setWorkbookSheets] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [mappings, setMappings] = useState<OpenDayFormMappings>(createEmptyMappings());
  const [activePresetId, setActivePresetId] = useState('auto');
  const [analysis, setAnalysis] = useState<OpenDayAnalysisResponse | null>(null);
  const [snapshots, setSnapshots] = useState<OpenDayAnalysisSnapshotSummary[]>([]);
  const [scenarioSnapshots, setScenarioSnapshots] = useState<OpenDayAnalysisSnapshotSummary[]>([]);
  const [scenarios, setScenarios] = useState<OpenDayScenarioTemplateSummary[]>([]);
  const [catalogMessage, setCatalogMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('请先上传数据。');
  const [scenarioMessage, setScenarioMessage] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSavingScenario, setIsSavingScenario] = useState(false);
  const [isLoadingScenario, setIsLoadingScenario] = useState('');
  const [replayingSnapshotId, setReplayingSnapshotId] = useState('');
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [activeScenarioTemplateId, setActiveScenarioTemplateId] = useState('');
  const [activeScenarioTemplateName, setActiveScenarioTemplateName] = useState('');
  const [showScenarioSnapshotsOnly, setShowScenarioSnapshotsOnly] = useState(false);
  const requestVersionRef = useRef(0);

  const presets = catalog.parameterPackages.length ? catalog.parameterPackages : catalog.presets;
  const missingMappings = getMissingMappings(mappings);
  const normalizedPreviewRows = rows.length && missingMappings.length === 0 ? normalizeOpenDayRows(rows, mappings) : [];
  const waterlinePreview =
    normalizedPreviewRows.length > 0 ? resolveOpenDayWaterlineContext(normalizedPreviewRows, config) : null;
  const eligibleRows = analysis?.results.filter((row) => row.isEligible) || [];
  const topRows = (eligibleRows.length ? eligibleRows : analysis?.results || []).slice(0, 3);
  const chartRows = (eligibleRows.length ? eligibleRows : analysis?.results || []).slice(0, 6);
  const trafficLeader = analysis?.results.reduce<typeof analysis.results[number] | null>((leader, row) => {
    if (!leader || row.traffic > leader.traffic) {
      return row;
    }
    return leader;
  }, null) || null;
  const opportunity =
    eligibleRows
      .filter((row) => row.score >= 40 && row.inventory < (analysis?.meta.waterlines.I_cap || 0))
      .sort((left, right) => right.interactionIdx - left.interactionIdx)[0] || null;
  const relevantScenarioSnapshots =
    activeScenarioTemplateId
      ? scenarioSnapshots.filter((item) => item.id !== analysis?.meta.snapshotId)
      : [];
  const previousScenarioSnapshot = relevantScenarioSnapshots[0] || null;
  const previousScenarioDelta =
    previousScenarioSnapshot && analysis
      ? Number((analysis.results[0]?.score || 0) - previousScenarioSnapshot.championScore)
      : null;
  const displayedSnapshots = showScenarioSnapshotsOnly && activeScenarioTemplateId ? scenarioSnapshots : snapshots;

  async function refreshSnapshots() {
    try {
      const payload = await fetchOpenDaySnapshots(activationKey, 8);
      setSnapshots(payload.items);
    } catch {
      setSnapshots([]);
    }
  }

  async function refreshScenarioSnapshots(scenarioTemplateId: string) {
    if (!scenarioTemplateId) {
      setScenarioSnapshots([]);
      return;
    }

    try {
      const payload = await fetchOpenDaySnapshots(activationKey, 8, scenarioTemplateId);
      setScenarioSnapshots(payload.items);
    } catch {
      setScenarioSnapshots([]);
    }
  }

  async function refreshScenarios() {
    try {
      const payload = await fetchOpenDayScenarios(activationKey, 8);
      setScenarios(payload.items);
    } catch {
      setScenarios([]);
    }
  }

  function getResolvedParameter(key: OpenDayParameterKey) {
    return waterlinePreview?.resolvedParameters.find((parameter) => parameter.key === key) || null;
  }

  function getDisplayedWaterlineValue(key: OpenDayParameterKey) {
    return getResolvedParameter(key)?.finalValue ?? config.absolutes[key];
  }

  function markDraftDirty(message = '参数已更新，请点击重新测算。') {
    setAnalysis(null);
    setHasPendingChanges(true);
    if (stage === 'workspace') {
      setStatusMessage(message);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setIsBootstrapping(true);

      try {
        const [nextCatalog, nextSnapshots, nextScenarios] = await Promise.all([
          fetchOpenDayCatalog(activationKey),
          fetchOpenDaySnapshots(activationKey, 8),
          fetchOpenDayScenarios(activationKey, 8),
        ]);

        if (cancelled) {
          return;
        }

        setCatalog(nextCatalog);
        setConfig(cloneConfig(nextCatalog.defaultConfig));
        setSnapshots(nextSnapshots.items);
        setScenarioSnapshots([]);
        setScenarios(nextScenarios.items);
        setActivePresetId('auto');
        setHasPendingChanges(false);
        setCatalogMessage('');
      } catch (error) {
        if (cancelled) {
          return;
        }

        setCatalog(fallbackCatalog);
        setConfig(cloneConfig(fallbackCatalog.defaultConfig));
        setSnapshots([]);
        setScenarioSnapshots([]);
        setScenarios([]);
        setHasPendingChanges(false);
        setCatalogMessage(
          error instanceof Error ? `${error.message}，已自动回退到默认策略。` : '策略目录加载失败，已自动回退到默认策略。',
        );
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [activationKey]);

  useEffect(() => {
    if (!activeScenarioTemplateId) {
      setScenarioSnapshots([]);
      return;
    }

    void refreshScenarioSnapshots(activeScenarioTemplateId);
  }, [activationKey, activeScenarioTemplateId]);

  function applyParsedData(payload: ParsedWorkbookPayload | { headers: string[]; rows: OpenDayRawRow[] }, nextSourceName: string) {
    setHeaders(payload.headers);
    setRows(payload.rows);
    setSourceName(nextSourceName);
    setMappings(guessMappings(payload.headers));
    setAnalysis(null);
    setHasPendingChanges(true);
    setUploadError('');
    setScenarioMessage('');
    setScenarioName((current) => current || nextSourceName.split('/')[0].trim());
    setStatusMessage(stage === 'workspace' ? '已载入新数据，准备重新测算。' : '数据已准备好，可以进入下一步。');
  }

  async function handleWorkbookUpload(file: File, requestedSheet = '') {
    const payload = await uploadWorkbook(activationKey, file, requestedSheet);
    setWorkbookSheets(payload.sheets);
    setActiveSheet(payload.activeSheet);
    if (!requestedSheet) {
      setSourceUploadId(payload.uploadArtifact?.id || '');
    } else if (payload.uploadArtifact?.id) {
      setSourceUploadId(payload.uploadArtifact.id);
    }
    applyParsedData(payload, `${file.name}${payload.activeSheet ? ` / ${payload.activeSheet}` : ''}`);
  }

  async function handleFileSelection(file: File) {
    setUploadError('');

    if (/\.(xlsx|xls)$/i.test(file.name)) {
      setUploadedFile(file);
      await handleWorkbookUpload(file);
      return;
    }

    const text = await file.text();
    const parsed = parseCsv(text);
    setUploadedFile(null);
    setWorkbookSheets([]);
    setActiveSheet('');
    setSourceUploadId('');
    applyParsedData(parsed, file.name);
  }

  function handleLoadSample() {
    const parsed = parseCsv(sampleCsv);
    setUploadedFile(null);
    setWorkbookSheets([]);
    setActiveSheet('');
    setSourceUploadId('');
    applyParsedData(parsed, '示例数据');
  }

  function handleApplyPreset(presetId: string) {
    const preset = presets.find((item) => item.id === presetId);
    setConfig(cloneConfig(preset?.resolvedConfig || mergeConfig(catalog.defaultConfig, preset?.overrides)));
    setActivePresetId(preset?.id || 'auto');
    setActiveScenarioTemplateId('');
    setActiveScenarioTemplateName('');
    setShowScenarioSnapshotsOnly(false);
    markDraftDirty();
  }

  function handleRestoreDefaults() {
    setConfig(cloneConfig(catalog.defaultConfig));
    setActivePresetId('auto');
    setActiveScenarioTemplateId('');
    setActiveScenarioTemplateName('');
    setShowScenarioSnapshotsOnly(false);
    markDraftDirty();
  }

  async function handleSaveScenario() {
    const name = scenarioName.trim() || buildScenarioDraftName(sourceName, activePresetId, presets);
    setIsSavingScenario(true);
    setScenarioMessage('');

    try {
      const record = await saveOpenDayScenario(activationKey, {
        name,
        description: sourceName ? `来源：${sourceName}` : '',
        scenario: {
          formulaId: config.formulaId,
          parameterPackageId: activePresetId === 'custom' ? null : activePresetId,
          config,
        },
        activePresetId,
        activeParameterPackageId: activePresetId === 'custom' ? '' : activePresetId,
      });

      setActiveScenarioTemplateId(record.summary.id);
      setActiveScenarioTemplateName(record.summary.name);
      setScenarioName(record.summary.name);
      setScenarioMessage(`已保存方案：${record.summary.name}`);
      await refreshScenarios();
      await refreshScenarioSnapshots(record.summary.id);
    } catch (error) {
      setScenarioMessage(error instanceof Error ? error.message : '方案保存失败');
    } finally {
      setIsSavingScenario(false);
    }
  }

  async function handleLoadScenario(id: string) {
    setIsLoadingScenario(id);
    setScenarioMessage('');

    try {
      const record = await fetchOpenDayScenarioDetail(activationKey, id);
      setConfig(cloneConfig(record.scenario.config));
      setActivePresetId(record.scenario.parameterPackageId || 'custom');
      setActiveScenarioTemplateId(record.summary.id);
      setActiveScenarioTemplateName(record.summary.name);
      setScenarioName(record.summary.name);
      markDraftDirty(`已加载方案“${record.summary.name}”，请点击重新测算。`);
      setScenarioMessage(`已载入方案：${record.summary.name}`);
      await refreshScenarioSnapshots(record.summary.id);
    } catch (error) {
      setScenarioMessage(error instanceof Error ? error.message : '方案加载失败');
    } finally {
      setIsLoadingScenario('');
    }
  }

  async function handleReplaySnapshot(id: string) {
    setReplayingSnapshotId(id);
    setScenarioMessage('');
    setUploadError('');
    setStatusMessage('正在回放历史测算...');

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
      const restoredScenarioTemplateId = record.command.activeScenarioTemplateId || record.summary.scenarioTemplateId || '';
      const restoredScenarioTemplateName =
        record.command.activeScenarioTemplateName || record.summary.scenarioTemplateName || '';
      const restoredPresetId =
        record.command.activeParameterPackageId || record.command.activePresetId || record.summary.parameterPackageId || 'custom';
      const restoredSourceName = record.command.sourceName || record.summary.sourceName || '未命名数据集';

      setStage('workspace');
      setRows(restoredRows);
      setMappings(restoredMappings);
      setHeaders(extractHeadersFromRows(restoredRows, restoredMappings));
      setConfig(cloneConfig(record.response.meta.requestedConfig));
      setSourceName(restoredSourceName);
      setSourceUploadId(record.command.sourceUploadId || record.summary.sourceUploadId || '');
      setWorkbookSheets([]);
      setActiveSheet('');
      setUploadedFile(null);
      setAnalysis(record.response);
      setActivePresetId(restoredPresetId);
      setActiveScenarioTemplateId(restoredScenarioTemplateId);
      setActiveScenarioTemplateName(restoredScenarioTemplateName);
      setScenarioName(restoredScenarioTemplateName || buildScenarioDraftName(restoredSourceName, restoredPresetId, presets));
      setHasPendingChanges(false);
      setShowScenarioSnapshotsOnly(Boolean(restoredScenarioTemplateId));
      setStatusMessage(`已回放 ${formatDateTime(record.summary.createdAt)} 的测算结果。`);

      void refreshSnapshots();
      if (restoredScenarioTemplateId) {
        void refreshScenarioSnapshots(restoredScenarioTemplateId);
      } else {
        setScenarioSnapshots([]);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '快照回放失败');
    } finally {
      setReplayingSnapshotId('');
    }
  }

  function updateConfig(mutator: (draft: OpenDayConfig) => void) {
    setConfig((current) => {
      const next = cloneConfig(current);
      mutator(next);
      return next;
    });
    setActivePresetId('custom');
    setActiveScenarioTemplateId('');
    setActiveScenarioTemplateName('');
    setShowScenarioSnapshotsOnly(false);
    markDraftDirty();
  }

  async function executeAnalysis() {
    if (stage !== 'workspace') {
      setStatusMessage('请先进入测算工作台。');
      return;
    }

    if (!rows.length) {
      setAnalysis(null);
      setStatusMessage('请先回到上一步上传数据。');
      return;
    }

    if (missingMappings.length > 0) {
      setAnalysis(null);
      setStatusMessage(`请先完成字段映射：${missingMappings.join('、')}`);
      return;
    }

    const currentVersion = requestVersionRef.current + 1;
    requestVersionRef.current = currentVersion;
    setIsAnalyzing(true);
    setStatusMessage('正在生成测算结果...');

    try {
      const payload = await fetchOpenDayAnalysis(activationKey, {
        rows,
        mappings,
        config,
        sourceName,
        sourceUploadId,
        activeScenarioTemplateId,
        activeScenarioTemplateName,
        activePresetId,
        activeParameterPackageId: activePresetId,
      });

      if (requestVersionRef.current !== currentVersion) {
        return;
      }

      setAnalysis(payload);
      setHasPendingChanges(false);
      setStatusMessage('');
      void refreshSnapshots();
      if (activeScenarioTemplateId) {
        void refreshScenarioSnapshots(activeScenarioTemplateId);
      }
    } catch (error) {
      if (requestVersionRef.current !== currentVersion) {
        return;
      }

      setAnalysis(null);
      setStatusMessage(error instanceof Error ? error.message : '开放日测算失败');
    } finally {
      if (requestVersionRef.current === currentVersion) {
        setIsAnalyzing(false);
      }
    }
  }

  const uploadSummary = buildUploadSummary(sourceName, rows.length, headers);

  if (stage === 'upload') {
    return (
      <div className="open-day-workspace">
        <div className="open-day-workspace__shell">
          {catalogMessage ? <div className="open-day-workspace__banner">{catalogMessage}</div> : null}

          <section className="open-day-upload-stage">
            <div className="open-day-upload-simple-head">
              <h2>先上传数据</h2>
              <p>支持 Excel / CSV，系统会自动识别常用字段。确认后再进入下一步测算。</p>
            </div>

            <div className="open-day-upload-card">
              <div className="open-day-upload-card__panel">
                <div className="open-day-upload-card__head">
                  <div>
                    <h3>上传数据文件</h3>
                    <p>{uploadSummary}</p>
                  </div>
                </div>

                <div className="open-day-upload-actions">
                  <label className="open-day-button open-day-button--primary open-day-button--file">
                    <FileUp className="open-day-button__icon" />
                    <span>上传文件</span>
                    <input
                      type="file"
                      accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      onChange={(event) => {
                        const nextFile = event.target.files?.[0];
                        event.currentTarget.value = '';
                        if (!nextFile) {
                          return;
                        }

                        void handleFileSelection(nextFile).catch((error) => {
                          setUploadError(error instanceof Error ? error.message : '文件读取失败');
                        });
                      }}
                    />
                  </label>

                  <button type="button" className="open-day-button open-day-button--secondary" onClick={handleLoadSample}>
                    加载示例
                  </button>

                  <a className="open-day-button open-day-button--ghost" href="/open-day-sample-data.csv" download>
                    下载示例
                  </a>
                </div>

                {uploadError ? <div className="open-day-inline-error">{uploadError}</div> : null}

                {rows.length ? (
                  <>
                    <div className="open-day-upload-stats">
                      <div>
                        <span>数据行数</span>
                        <strong>{rows.length}</strong>
                      </div>
                      <div>
                        <span>字段数量</span>
                        <strong>{headers.length}</strong>
                      </div>
                      <div>
                        <span>工作表</span>
                        <strong>{workbookSheets.length || 1}</strong>
                      </div>
                    </div>

                    <div className="open-day-upload-file">
                      <div className="open-day-upload-file__name">{sourceName || '未命名数据集'}</div>
                      <div className="open-day-upload-file__meta">
                        {activeSheet ? `当前 Sheet：${activeSheet}` : '数据已准备完成'}
                      </div>
                      <div className="open-day-upload-file__chips">
                        {headers.slice(0, 8).map((header) => (
                          <span key={header}>{header}</span>
                        ))}
                      </div>
                    </div>

                    <div className="open-day-upload-footer">
                      <button
                        type="button"
                        className="open-day-button open-day-button--primary"
                        onClick={() => {
                          setStage('workspace');
                          setHasPendingChanges(true);
                          setStatusMessage('参数准备完成，请点击重新测算。');
                        }}
                      >
                        <span>下一步</span>
                        <ArrowRight className="open-day-button__icon" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="open-day-upload-empty">
                    <FileUp className="open-day-upload-empty__icon" />
                    <strong>先上传一个文件</strong>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="open-day-workspace">
      <div className="open-day-workspace__shell">
        {catalogMessage ? <div className="open-day-workspace__banner">{catalogMessage}</div> : null}

        <div className="open-day-workspace-header">
          <div className="open-day-workspace-header__main">
            <button type="button" className="open-day-button open-day-button--ghost" onClick={() => setStage('upload')}>
              <ArrowLeft className="open-day-button__icon" />
              <span>返回上传</span>
            </button>
            <div>
              <h2>测算工作台</h2>
              <p>
                {sourceName || '未命名数据集'} · 共 {rows.length} 行，{headers.length} 个字段
                {activeSheet ? `，当前 Sheet：${activeSheet}` : ''}。
              </p>
            </div>
          </div>

          <div className="open-day-workspace-header__actions">
            <label className="open-day-button open-day-button--secondary open-day-button--file">
              <span>更换文件</span>
              <input
                type="file"
                accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0];
                  event.currentTarget.value = '';
                  if (!nextFile) {
                    return;
                  }

                  void handleFileSelection(nextFile).catch((error) => {
                    setUploadError(error instanceof Error ? error.message : '文件读取失败');
                  });
                }}
              />
            </label>

            <button type="button" className="open-day-button open-day-button--primary" onClick={() => void executeAnalysis()}>
              <span>{isAnalyzing ? '测算中...' : '测算'}</span>
            </button>
          </div>
        </div>

        <div className="open-day-workspace-layout">
          <aside className="open-day-sidebar">
            <section className="open-day-panel">
              <div className="open-day-panel__head">
                <div>
                  <h3>策略选择</h3>
                </div>
              </div>

              <div className="open-day-preset-grid">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`open-day-preset-card ${activePresetId === preset.id ? 'is-active' : ''}`}
                    onClick={() => handleApplyPreset(preset.id)}
                  >
                    <strong>{preset.label}</strong>
                    <span>{preset.description}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="open-day-panel">
              <div className="open-day-panel__head">
                <div>
                  <h3>参数调整</h3>
                </div>
              </div>

              <div className="open-day-params-grid">
                <label>
                  <span>水位线模式</span>
                  <select
                    value={config.waterlineMode}
                    onChange={(event) => {
                      const nextMode = event.target.value as OpenDayConfig['waterlineMode'];
                      updateConfig((draft) => {
                        draft.waterlineMode = nextMode;
                        if (nextMode === 'absolute') {
                          waterlineDefinitions.forEach((definition) => {
                            const resolved = getResolvedParameter(definition.key);
                            draft.absolutes[definition.key] = resolved?.finalValue ?? draft.absolutes[definition.key];
                          });
                        }
                        draft.waterlineOverrides = {};
                      });
                    }}
                  >
                    <option value="percentile">按分位自动</option>
                    <option value="absolute">按固定数值</option>
                  </select>
                </label>
                <label>
                  <span>流量 Alpha</span>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.05"
                    value={config.alpha}
                    onChange={(event) => {
                      updateConfig((draft) => {
                        draft.alpha = Math.max(0, Number(event.target.value) || 0);
                      });
                    }}
                  />
                </label>
                <label>
                  <span>商品权重</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={config.weights.product}
                    onChange={(event) => {
                      updateConfig((draft) => {
                        draft.weights.product = Math.max(0, Number(event.target.value) || 0);
                      });
                    }}
                  />
                </label>
                <label>
                  <span>互动权重</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={config.weights.interaction}
                    onChange={(event) => {
                      updateConfig((draft) => {
                        draft.weights.interaction = Math.max(0, Number(event.target.value) || 0);
                      });
                    }}
                  />
                </label>
              </div>

              <div className="open-day-filter-row">
                <label>
                  <span>最低在售</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={config.hardFilters.min_inventory}
                    onChange={(event) => {
                      updateConfig((draft) => {
                        draft.hardFilters.min_inventory = Math.max(0, Number(event.target.value) || 0);
                      });
                    }}
                  />
                </label>
                <label>
                  <span>最低好房</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={config.hardFilters.min_hq_rooms}
                    onChange={(event) => {
                      updateConfig((draft) => {
                        draft.hardFilters.min_hq_rooms = Math.max(0, Number(event.target.value) || 0);
                      });
                    }}
                  />
                </label>
                <label>
                  <span>最低成交</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={config.hardFilters.min_transaction}
                    onChange={(event) => {
                      updateConfig((draft) => {
                        draft.hardFilters.min_transaction = Math.max(0, Number(event.target.value) || 0);
                      });
                    }}
                  />
                </label>
              </div>

              <div className="open-day-waterline-grid">
                {waterlineDefinitions.map((definition) => (
                  <div key={definition.key} className="open-day-waterline-card">
                    <div className="open-day-waterline-card__head">
                      <h4>{definition.title}</h4>
                      <span>{config.waterlineMode === 'percentile' ? '分位' : '固定值'}</span>
                    </div>
                    <p>{definition.description}</p>
                    <div className="open-day-waterline-card__inputs">
                      <label>
                        <span>{definition.percentileLabel}</span>
                        <input
                          type="number"
                          min="1"
                          max="99"
                          step="1"
                          value={config.percentiles[definition.key]}
                          onChange={(event) => {
                            const nextPercentile = Math.min(99, Math.max(1, Number(event.target.value) || 1));
                            updateConfig((draft) => {
                              draft.percentiles[definition.key] = nextPercentile;
                              if (draft.waterlineOverrides?.[definition.key] !== undefined) {
                                delete draft.waterlineOverrides[definition.key];
                              }
                            });
                          }}
                        />
                      </label>
                      <label>
                        <span>{definition.absoluteLabel}</span>
                        <input
                          type="number"
                          min="0"
                          step={definition.absoluteStep}
                          value={getDisplayedWaterlineValue(definition.key)}
                          onChange={(event) => {
                            const nextValue = Math.max(0, Number(event.target.value) || 0);
                            updateConfig((draft) => {
                              if (draft.waterlineMode === 'absolute') {
                                draft.absolutes[definition.key] = nextValue;
                                draft.percentiles[definition.key] = Math.round(
                                  deriveOpenDayPercentileForValue(normalizedPreviewRows, definition.key, nextValue),
                                );
                                if (draft.waterlineOverrides?.[definition.key] !== undefined) {
                                  delete draft.waterlineOverrides[definition.key];
                                }
                                return;
                              }

                              draft.waterlineOverrides = {
                                ...(draft.waterlineOverrides || {}),
                                [definition.key]: nextValue,
                              };
                            });
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <button type="button" className="open-day-button open-day-button--ghost open-day-button--block" onClick={handleRestoreDefaults}>
                恢复默认
              </button>
            </section>
          </aside>

          <main className="open-day-main">
            {statusMessage ? <div className={`open-day-status-card ${isAnalyzing ? 'is-loading' : ''}`}>{statusMessage}</div> : null}

            <section className="open-day-hero-card">
              <div className="open-day-hero-card__copy">
                <h3>结果总览</h3>
                <p>
                  当前策略：{getPresetLabel(activePresetId, presets)}
                  {analysis
                    ? hasPendingChanges
                      ? '，当前参数已变更，结果待重新测算。'
                      : `，已完成 ${analysis.meta.totalCount} 个小区测算。`
                    : '，等待测算结果。'}
                </p>
              </div>
              <div className="open-day-hero-card__stats">
                <div>
                  <span>样本</span>
                  <strong>{analysis?.meta.totalCount ?? rows.length}</strong>
                </div>
                <div>
                  <span>入围</span>
                  <strong>{analysis ? `${analysis.meta.eligibleCount}/${analysis.meta.totalCount}` : '--'}</strong>
                </div>
                <div>
                  <span>冠军</span>
                  <strong>{analysis?.results[0]?.name || '--'}</strong>
                </div>
                <div>
                  <span>缓存</span>
                  <strong>{analysis ? (analysis.meta.cacheHit ? '命中' : '未命中') : '--'}</strong>
                </div>
              </div>
            </section>

            <section className="open-day-panel open-day-panel--flat">
              <div className="open-day-panel__head">
                <div>
                  <h3>完整排名</h3>
                </div>
              </div>

              <div className="open-day-table-wrap">
                <table className="open-day-table">
                  <thead>
                    <tr>
                      <th>排名</th>
                      <th>大区</th>
                      <th>小区</th>
                      <th>综合分</th>
                      <th>分层</th>
                      <th>入围</th>
                      <th>规模分</th>
                      <th>流量分</th>
                      <th>商品分</th>
                      <th>互动分</th>
                      <th>成交量</th>
                      <th>转化率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis ? (
                      analysis.results.map((row) => (
                        <tr key={`${row.rank}-${row.name}`}>
                          <td><span className="open-day-rank-chip">#{row.rank}</span></td>
                          <td>{row.area || '—'}</td>
                          <td>{row.name}</td>
                          <td>{formatNumber(row.score, 1)}</td>
                          <td>
                            <div className="open-day-tier">
                              <span className={`open-day-tier__code open-day-tier__code--${row.tierCode}`}>{row.tierCode}</span>
                              <span>{row.tierLabel}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`open-day-eligibility ${row.isEligible ? 'is-on' : 'is-off'}`}>
                              {row.isEligible ? '达标' : '未达标'}
                            </span>
                          </td>
                          <td>{formatNumber(row.scaleIdx, 1)}</td>
                          <td>{formatNumber(row.trafficIdx, 1)}</td>
                          <td>{formatNumber(row.productIdx, 1)}</td>
                          <td>{formatNumber(row.interactionIdx, 1)}</td>
                          <td>{formatNumber(row.transactions, 0)}</td>
                          <td>{formatPercent(row.convRate, 2)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={12} className="open-day-table__empty">
                          {isBootstrapping ? '正在初始化工作台...' : statusMessage}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

          </main>
        </div>
      </div>
    </div>
  );
}
