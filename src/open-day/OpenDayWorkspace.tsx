import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Database,
  FileUp,
  History,
  RefreshCcw,
  Settings2,
  Sparkles,
} from 'lucide-react';
import type { ParsedWorkbookPayload } from '../../lib/openDayWorkbook.ts';
import type {
  OpenDayAnalysisResponse,
  OpenDayAnalysisSnapshotSummary,
  OpenDayConfig,
  OpenDayPreset,
  OpenDayRawRow,
} from '../../modules/open-day/domain/openDay.types.ts';
import { fetchOpenDayAnalysis, fetchOpenDayCatalog, fetchOpenDaySnapshots, uploadWorkbook } from './openDayClient';
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

interface MappingFieldDefinition {
  key: keyof OpenDayFormMappings;
  label: string;
  optional?: boolean;
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

const mappingFieldDefinitions: MappingFieldDefinition[] = [
  { key: 'area', label: '大区列（可选）', optional: true },
  { key: 'name', label: '小区名称列' },
  { key: 'inventory', label: '在售套数列' },
  { key: 'traffic', label: '带看量列' },
  { key: 'transactions', label: '成交量列' },
  { key: 'premium', label: '好房数列' },
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
    return '还没有载入数据。上传 Excel 或 CSV 后，系统会自动识别字段，并在下一步进入测算工作台。';
  }

  return `已载入 ${sourceName}，共 ${rowCount} 行，识别到 ${headers.length} 个字段。下一步可以检查字段映射、选择策略并查看测算结果。`;
}

export function OpenDayWorkspace({ activationKey }: OpenDayWorkspaceProps) {
  const [stage, setStage] = useState<WorkspaceStage>('upload');
  const [catalog, setCatalog] = useState(fallbackCatalog);
  const [config, setConfig] = useState<OpenDayConfig>(cloneConfig(fallbackCatalog.defaultConfig));
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<OpenDayRawRow[]>([]);
  const [sourceName, setSourceName] = useState('');
  const [workbookSheets, setWorkbookSheets] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [mappings, setMappings] = useState<OpenDayFormMappings>(createEmptyMappings());
  const [activePresetId, setActivePresetId] = useState('auto');
  const [analysis, setAnalysis] = useState<OpenDayAnalysisResponse | null>(null);
  const [snapshots, setSnapshots] = useState<OpenDayAnalysisSnapshotSummary[]>([]);
  const [statusMessage, setStatusMessage] = useState('请先上传数据，并点击下一步进入测算工作台。');
  const [catalogMessage, setCatalogMessage] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recalculateTick, setRecalculateTick] = useState(0);
  const requestVersionRef = useRef(0);

  const presets = catalog.presets;
  const missingMappings = getMissingMappings(mappings);
  const missingMappingsKey = missingMappings.join('|');
  const requiredMappingsTotal = mappingFieldDefinitions.filter((field) => !field.optional).length;
  const readyMappingsCount = mappingFieldDefinitions.filter((field) => !field.optional && mappings[field.key]).length;
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

  async function refreshSnapshots() {
    try {
      const payload = await fetchOpenDaySnapshots(activationKey, 8);
      setSnapshots(payload.items);
    } catch {
      setSnapshots([]);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setIsBootstrapping(true);

      try {
        const [nextCatalog, nextSnapshots] = await Promise.all([
          fetchOpenDayCatalog(activationKey),
          fetchOpenDaySnapshots(activationKey, 8),
        ]);

        if (cancelled) {
          return;
        }

        setCatalog(nextCatalog);
        setConfig(cloneConfig(nextCatalog.defaultConfig));
        setSnapshots(nextSnapshots.items);
        setActivePresetId('auto');
        setCatalogMessage('');
      } catch (error) {
        if (cancelled) {
          return;
        }

        setCatalog(fallbackCatalog);
        setConfig(cloneConfig(fallbackCatalog.defaultConfig));
        setSnapshots([]);
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
    if (stage !== 'workspace') {
      setIsAnalyzing(false);
      return;
    }

    if (!rows.length) {
      setAnalysis(null);
      setStatusMessage('请先回到上一步上传数据。');
      setIsAnalyzing(false);
      return;
    }

    if (missingMappings.length > 0) {
      setAnalysis(null);
      setStatusMessage(`请先完成字段映射：${missingMappings.join('、')}`);
      setIsAnalyzing(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const currentVersion = requestVersionRef.current + 1;
      requestVersionRef.current = currentVersion;
      setIsAnalyzing(true);
      setStatusMessage('正在生成测算结果...');

      void fetchOpenDayAnalysis(activationKey, {
        rows,
        mappings,
        config,
        sourceName,
        activePresetId,
      })
        .then((payload) => {
          if (requestVersionRef.current !== currentVersion) {
            return;
          }

          setAnalysis(payload);
          setStatusMessage('');
          setIsAnalyzing(false);
          void refreshSnapshots();
        })
        .catch((error) => {
          if (requestVersionRef.current !== currentVersion) {
            return;
          }

          setAnalysis(null);
          setStatusMessage(error instanceof Error ? error.message : '开放日测算失败');
          setIsAnalyzing(false);
        });
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [
    activationKey,
    stage,
    rows,
    mappings,
    config,
    sourceName,
    activePresetId,
    missingMappingsKey,
    recalculateTick,
  ]);

  function applyParsedData(payload: ParsedWorkbookPayload | { headers: string[]; rows: OpenDayRawRow[] }, nextSourceName: string) {
    setHeaders(payload.headers);
    setRows(payload.rows);
    setSourceName(nextSourceName);
    setMappings(guessMappings(payload.headers));
    setAnalysis(null);
    setUploadError('');
    setStatusMessage(
      stage === 'workspace'
        ? '已载入新数据，正在准备重新测算。'
        : '数据已准备好，点击下一步进入测算工作台。',
    );
  }

  async function handleWorkbookUpload(file: File, requestedSheet = '') {
    const payload = await uploadWorkbook(activationKey, file, requestedSheet);
    setWorkbookSheets(payload.sheets);
    setActiveSheet(payload.activeSheet);
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
    applyParsedData(parsed, file.name);
  }

  function handleLoadSample() {
    const parsed = parseCsv(sampleCsv);
    setUploadedFile(null);
    setWorkbookSheets([]);
    setActiveSheet('');
    applyParsedData(parsed, '示例数据');
  }

  function handleApplyPreset(presetId: string) {
    const preset = presets.find((item) => item.id === presetId);
    setConfig(cloneConfig(preset?.resolvedConfig || mergeConfig(catalog.defaultConfig, preset?.overrides)));
    setActivePresetId(preset?.id || 'auto');
  }

  function handleRestoreDefaults() {
    setConfig(cloneConfig(catalog.defaultConfig));
    setActivePresetId('auto');
  }

  function markCustomConfig() {
    setActivePresetId('custom');
  }

  function updateConfig(mutator: (draft: OpenDayConfig) => void) {
    setConfig((current) => {
      const next = cloneConfig(current);
      mutator(next);
      return next;
    });
    markCustomConfig();
  }

  function handleAdvanceToWorkspace() {
    if (!rows.length) {
      return;
    }

    setStage('workspace');
  }

  const dataSummary = buildUploadSummary(sourceName, rows.length, headers);

  return (
    <div className="open-day-workspace">
      <div className="open-day-workspace__shell">
        <header className="open-day-workspace__masthead">
          <div className="open-day-workspace__masthead-copy">
            <p className="open-day-workspace__eyebrow">开放日测算</p>
            <h1>{stage === 'upload' ? '先上传数据，再进入测算工作台' : '测算工作台'}</h1>
            <p className="open-day-workspace__masthead-text">
              {stage === 'upload'
                ? '第一步只做数据准备。上传文件后，点击下一步进入测算工作台，再统一查看映射、策略和结果。'
                : '左侧负责数据和策略设置，右侧专注看结果。这样操作路径更清楚，也更适合连续调参。'}
            </p>
          </div>

          <div className="open-day-workspace__stepper">
            <div className={`open-day-workspace__step-card ${stage === 'upload' ? 'is-active' : rows.length ? 'is-complete' : ''}`}>
              <span className="open-day-workspace__step-index">1</span>
              <div>
                <strong>上传数据</strong>
                <span>选择 Excel / CSV</span>
              </div>
            </div>
            <div className={`open-day-workspace__step-card ${stage === 'workspace' ? 'is-active' : ''}`}>
              <span className="open-day-workspace__step-index">2</span>
              <div>
                <strong>测算工作台</strong>
                <span>映射字段并看结果</span>
              </div>
            </div>
          </div>
        </header>

        {catalogMessage ? <div className="open-day-workspace__banner">{catalogMessage}</div> : null}

        {stage === 'upload' ? (
          <main className="open-day-workspace__upload-stage">
            <section className="open-day-workspace__upload-grid">
              <article className="open-day-workspace__surface open-day-workspace__surface--hero">
                <div className="open-day-workspace__section-head">
                  <div className="open-day-workspace__icon-badge">
                    <FileUp className="open-day-workspace__icon" />
                  </div>
                  <div>
                    <p className="open-day-workspace__section-kicker">Step 1</p>
                    <h2>上传本次楼盘数据</h2>
                    <p className="open-day-workspace__section-text">
                      支持 Excel 和 CSV。系统会自动识别常用字段，减少手工准备时间。
                    </p>
                  </div>
                </div>

                <div className="open-day-workspace__cta-row">
                  <label className="open-day-workspace__primary-button open-day-workspace__primary-button--file">
                    <FileUp className="open-day-workspace__button-icon" />
                    <span>上传 Excel / CSV</span>
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

                  <button type="button" className="open-day-workspace__secondary-button" onClick={handleLoadSample}>
                    加载示例数据
                  </button>

                  <a className="open-day-workspace__ghost-link" href="/open-day-sample-data.csv" download>
                    下载示例 CSV
                  </a>
                </div>

                {uploadError ? <div className="open-day-workspace__error-banner">{uploadError}</div> : null}

                <div className="open-day-workspace__feature-list">
                  <article className="open-day-workspace__feature-card">
                    <strong>自动识别字段</strong>
                    <span>优先识别楼盘名、在售、带看、成交和好房字段。</span>
                  </article>
                  <article className="open-day-workspace__feature-card">
                    <strong>支持多 Sheet</strong>
                    <span>如果 Excel 有多个工作表，可在下一步的工作台里切换。</span>
                  </article>
                  <article className="open-day-workspace__feature-card">
                    <strong>进入后再调参</strong>
                    <span>先把数据带进来，再集中处理映射、策略和结果查看。</span>
                  </article>
                </div>

                <div className="open-day-workspace__helper-panel">
                  <span className="open-day-workspace__helper-title">建议字段</span>
                  <span>楼盘名 / 小区名称、库存在售房源量、带看量、成交量、库存好房量。</span>
                </div>
              </article>

              <article className="open-day-workspace__surface">
                <div className="open-day-workspace__section-head">
                  <div className="open-day-workspace__icon-badge open-day-workspace__icon-badge--soft">
                    <Database className="open-day-workspace__icon" />
                  </div>
                  <div>
                    <p className="open-day-workspace__section-kicker">数据预览</p>
                    <h2>确认后进入下一步</h2>
                    <p className="open-day-workspace__section-text">{dataSummary}</p>
                  </div>
                </div>

                {rows.length ? (
                  <>
                    <div className="open-day-workspace__stat-grid">
                      <article className="open-day-workspace__stat-card">
                        <span>数据行数</span>
                        <strong>{rows.length}</strong>
                      </article>
                      <article className="open-day-workspace__stat-card">
                        <span>识别字段</span>
                        <strong>{headers.length}</strong>
                      </article>
                      <article className="open-day-workspace__stat-card">
                        <span>关键字段</span>
                        <strong>{readyMappingsCount}/{requiredMappingsTotal}</strong>
                      </article>
                    </div>

                    <div className="open-day-workspace__dataset-card">
                      <div className="open-day-workspace__dataset-head">
                        <div>
                          <strong>{sourceName || '未命名数据集'}</strong>
                          <span>{workbookSheets.length > 1 ? `共 ${workbookSheets.length} 个 Sheet，可在下一步切换` : '已准备进入测算工作台'}</span>
                        </div>
                        {activeSheet ? <span className="open-day-workspace__chip">Sheet: {activeSheet}</span> : null}
                      </div>

                      <div className="open-day-workspace__chip-list">
                        {headers.slice(0, 10).map((header) => (
                          <span key={header} className="open-day-workspace__chip open-day-workspace__chip--light">
                            {header}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="open-day-workspace__next-row">
                      <div className="open-day-workspace__next-copy">
                        {missingMappings.length
                          ? `还差 ${missingMappings.length} 个字段需要确认，下一步可在工作台内继续补齐。`
                          : '关键字段已自动识别完成，可以直接进入测算工作台。'}
                      </div>
                      <button type="button" className="open-day-workspace__primary-button" onClick={handleAdvanceToWorkspace}>
                        <span>下一步：进入测算工作台</span>
                        <ArrowRight className="open-day-workspace__button-icon" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="open-day-workspace__empty-state">
                    <FileUp className="open-day-workspace__empty-icon" />
                    <strong>先上传文件</strong>
                    <span>数据载入后，这里会显示行数、字段和下一步入口。</span>
                  </div>
                )}
              </article>
            </section>
          </main>
        ) : (
          <>
            <div className="open-day-workspace__workspace-head">
              <div className="open-day-workspace__workspace-head-left">
                <button type="button" className="open-day-workspace__ghost-link" onClick={() => setStage('upload')}>
                  <ArrowLeft className="open-day-workspace__button-icon" />
                  返回上一步
                </button>
                <div>
                  <p className="open-day-workspace__section-kicker">当前数据集</p>
                  <h2 className="open-day-workspace__workspace-title">{sourceName || '未命名数据集'}</h2>
                  <p className="open-day-workspace__workspace-subtitle">
                    共 {rows.length} 行，{headers.length} 个字段{activeSheet ? `，当前 Sheet：${activeSheet}` : ''}。
                  </p>
                </div>
              </div>

              <div className="open-day-workspace__head-actions">
                <label className="open-day-workspace__secondary-button open-day-workspace__secondary-button--file">
                  <FileUp className="open-day-workspace__button-icon" />
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
                <button
                  type="button"
                  className="open-day-workspace__primary-button"
                  onClick={() => {
                    setRecalculateTick((current) => current + 1);
                  }}
                >
                  <RefreshCcw className="open-day-workspace__button-icon" />
                  <span>重新测算</span>
                </button>
              </div>
            </div>

            <main className="open-day-workspace__workspace-grid">
              <aside className="open-day-workspace__sidebar">
                <article className="open-day-workspace__surface">
                  <div className="open-day-workspace__section-head">
                    <div className="open-day-workspace__icon-badge open-day-workspace__icon-badge--soft">
                      <Database className="open-day-workspace__icon" />
                    </div>
                    <div>
                      <p className="open-day-workspace__section-kicker">数据</p>
                      <h3>数据源设置</h3>
                    </div>
                  </div>

                  <div className="open-day-workspace__mini-stats">
                    <div>
                      <span>行数</span>
                      <strong>{rows.length}</strong>
                    </div>
                    <div>
                      <span>字段</span>
                      <strong>{headers.length}</strong>
                    </div>
                    <div>
                      <span>快照</span>
                      <strong>{snapshots.length}</strong>
                    </div>
                  </div>

                  {workbookSheets.length > 0 ? (
                    <div className="open-day-workspace__sheet-picker">
                      <label>
                        <span>Excel Sheet</span>
                        <select
                          value={activeSheet}
                          onChange={(event) => {
                            const nextSheet = event.target.value;
                            setActiveSheet(nextSheet);
                            if (!uploadedFile) {
                              return;
                            }

                            void handleWorkbookUpload(uploadedFile, nextSheet).catch((error) => {
                              setUploadError(error instanceof Error ? error.message : '切换工作表失败');
                            });
                          }}
                        >
                          {workbookSheets.map((sheet) => (
                            <option key={sheet} value={sheet}>
                              {sheet}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}

                  <div className="open-day-workspace__chip-list">
                    {headers.slice(0, 8).map((header) => (
                      <span key={header} className="open-day-workspace__chip open-day-workspace__chip--light">
                        {header}
                      </span>
                    ))}
                  </div>

                  {uploadError ? <div className="open-day-workspace__error-banner">{uploadError}</div> : null}
                </article>

                <article className="open-day-workspace__surface">
                  <div className="open-day-workspace__section-head">
                    <div className="open-day-workspace__icon-badge open-day-workspace__icon-badge--soft">
                      <Settings2 className="open-day-workspace__icon" />
                    </div>
                    <div>
                      <p className="open-day-workspace__section-kicker">字段映射</p>
                      <h3>先确认关键字段</h3>
                    </div>
                  </div>

                  <div className="open-day-workspace__mapping-grid">
                    {mappingFieldDefinitions.map((field) => (
                      <label key={field.key}>
                        <span>{field.label}</span>
                        <select
                          value={mappings[field.key]}
                          onChange={(event) => {
                            const value = event.target.value;
                            setMappings((current) => ({
                              ...current,
                              [field.key]: value,
                            }));
                          }}
                        >
                          <option value="">{field.optional ? '不使用该字段' : '请选择字段'}</option>
                          {headers.map((header) => (
                            <option key={header} value={header}>
                              {header}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>

                  <div className={`open-day-workspace__mapping-note ${missingMappings.length ? 'is-warning' : 'is-good'}`}>
                    {missingMappings.length
                      ? `还缺少：${missingMappings.join('、')}`
                      : '关键字段已齐全，系统会自动开始测算。'}
                  </div>
                </article>

                <article className="open-day-workspace__surface">
                  <div className="open-day-workspace__section-head">
                    <div className="open-day-workspace__icon-badge open-day-workspace__icon-badge--soft">
                      <Sparkles className="open-day-workspace__icon" />
                    </div>
                    <div>
                      <p className="open-day-workspace__section-kicker">策略</p>
                      <h3>选择一套测算打法</h3>
                    </div>
                  </div>

                  <div className="open-day-workspace__preset-grid">
                    {presets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`open-day-workspace__preset-card ${activePresetId === preset.id ? 'is-active' : ''}`}
                        onClick={() => handleApplyPreset(preset.id)}
                      >
                        <strong>{preset.label}</strong>
                        <span>{preset.description}</span>
                      </button>
                    ))}
                  </div>

                  <div className="open-day-workspace__preset-caption">
                    当前策略：{getPresetLabel(activePresetId, presets)}
                    {activePresetId === 'custom' ? '，你正在使用手动调整后的参数。' : '。'}
                  </div>
                </article>

                <article className="open-day-workspace__surface">
                  <div className="open-day-workspace__section-head">
                    <div className="open-day-workspace__icon-badge open-day-workspace__icon-badge--soft">
                      <BarChart3 className="open-day-workspace__icon" />
                    </div>
                    <div>
                      <p className="open-day-workspace__section-kicker">参数</p>
                      <h3>调整评分口径</h3>
                    </div>
                  </div>

                  <div className="open-day-workspace__formula-card">
                    系统会综合考虑在售规模、带看热度、好房供给和成交质量。你可以通过下面的参数调整侧重点。
                  </div>

                  <div className="open-day-workspace__engine-grid">
                    <label>
                      <span>水位线模式</span>
                      <select
                        value={config.waterlineMode}
                        onChange={(event) => {
                          updateConfig((draft) => {
                            draft.waterlineMode = event.target.value as OpenDayConfig['waterlineMode'];
                          });
                        }}
                      >
                        <option value="percentile">按分位自动推导</option>
                        <option value="absolute">按固定数值约束</option>
                      </select>
                    </label>
                    <label>
                      <span>流量平滑指数 Alpha</span>
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

                  <div className="open-day-workspace__filter-grid">
                    <label>
                      <span>最低在售要求</span>
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
                      <span>最低好房要求</span>
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
                      <span>最低成交要求</span>
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

                  <div className="open-day-workspace__param-grid">
                    {waterlineDefinitions.map((definition) => {
                      const absoluteValue = config.absolutes[definition.key];
                      const percentileValue = config.percentiles[definition.key];
                      const absoluteDisplay =
                        definition.key === 'R_cap'
                          ? formatPercent(absoluteValue, 2)
                          : `${formatNumber(absoluteValue, 1)}${definition.unit}`;

                      return (
                        <article key={definition.key} className="open-day-workspace__param-card">
                          <div className="open-day-workspace__param-topline">
                            <div>
                              <h4>{definition.title}</h4>
                              <p>{definition.description}</p>
                            </div>
                            <span className="open-day-workspace__mode-pill">
                              {config.waterlineMode === 'percentile' ? '当前按分位生效' : '当前按固定值生效'}
                            </span>
                          </div>

                          <div className="open-day-workspace__inline-pair">
                            <label>
                              <span>{definition.percentileLabel} (%)</span>
                              <input
                                type="number"
                                min="1"
                                max="99"
                                step="1"
                                value={percentileValue}
                                onChange={(event) => {
                                  updateConfig((draft) => {
                                    draft.percentiles[definition.key] = Math.min(99, Math.max(1, Number(event.target.value) || 1));
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
                                value={absoluteValue}
                                onChange={(event) => {
                                  updateConfig((draft) => {
                                    draft.absolutes[definition.key] = Math.max(0, Number(event.target.value) || 0);
                                  });
                                }}
                              />
                            </label>
                          </div>

                          <div className="open-day-workspace__param-meta">默认固定值：{absoluteDisplay}</div>
                        </article>
                      );
                    })}
                  </div>

                  <button type="button" className="open-day-workspace__secondary-button" onClick={handleRestoreDefaults}>
                    恢复默认矩阵
                  </button>
                </article>
              </aside>

              <section className="open-day-workspace__main">
                {statusMessage ? (
                  <div className={`open-day-workspace__status-card ${isAnalyzing ? 'is-loading' : ''}`}>
                    {statusMessage}
                  </div>
                ) : null}

                <div className="open-day-workspace__headline-grid">
                  <article className="open-day-workspace__metric-card">
                    <div className="open-day-workspace__metric-label">样本小区数</div>
                    <div className="open-day-workspace__metric-value">{analysis?.meta.totalCount ?? rows.length}</div>
                    <div className="open-day-workspace__metric-footnote">{sourceName || '尚未加载数据'}</div>
                  </article>
                  <article className="open-day-workspace__metric-card">
                    <div className="open-day-workspace__metric-label">达标小区数</div>
                    <div className="open-day-workspace__metric-value">
                      {analysis ? `${analysis.meta.eligibleCount}/${analysis.meta.totalCount}` : '--'}
                    </div>
                    <div className="open-day-workspace__metric-footnote">
                      当前红线：在售 ≥ {config.hardFilters.min_inventory}，好房 ≥ {config.hardFilters.min_hq_rooms}，成交 ≥ {config.hardFilters.min_transaction}
                    </div>
                  </article>
                  <article className="open-day-workspace__metric-card">
                    <div className="open-day-workspace__metric-label">优先推荐</div>
                    <div className="open-day-workspace__metric-value">
                      {analysis?.results[0] ? analysis.results[0].name : '暂无'}
                    </div>
                    <div className="open-day-workspace__metric-footnote">
                      {analysis?.results[0] ? `综合分 ${formatNumber(analysis.results[0].score, 1)}，${analysis.results[0].tierLabel}` : '等待测算结果'}
                    </div>
                  </article>
                  <article className="open-day-workspace__metric-card">
                    <div className="open-day-workspace__metric-label">当前策略</div>
                    <div className="open-day-workspace__metric-value">
                      {analysis ? getPresetLabel(activePresetId, presets) : getPresetLabel(activePresetId, presets)}
                    </div>
                    <div className="open-day-workspace__metric-footnote">
                      {analysis
                        ? `${analysis.meta.waterlines.source} · Alpha ${formatNumber(analysis.meta.requestedConfig.alpha, 2)}`
                        : '可在左侧继续调整参数'}
                    </div>
                  </article>
                </div>

                <div className="open-day-workspace__analysis-grid">
                  <article className="open-day-workspace__analysis-card">
                    <h3>推荐结论</h3>
                    <p>
                      {topRows.length
                        ? `${topRows.map((row) => row.name).join('、')}当前排在前列，更适合作为开放日优先推进的小区。`
                        : '当前还没有足够结果可供判断。'}
                    </p>
                  </article>
                  <article className="open-day-workspace__analysis-card">
                    <h3>流量观察</h3>
                    <p>
                      {trafficLeader
                        ? `${trafficLeader.name} 的带看量最高，但最终排名是第 ${trafficLeader.rank}，可以帮助判断“声量高”是否真的等于“值得重点做”。`
                        : '等待流量与转化结果。'}
                    </p>
                  </article>
                  <article className="open-day-workspace__analysis-card">
                    <h3>过滤提醒</h3>
                    <p>
                      {analysis
                        ? analysis.results.length - eligibleRows.length > 0
                          ? `当前有 ${analysis.results.length - eligibleRows.length} 个小区未通过业务红线，会被自动排除在重点名单之外。`
                          : '当前样本都通过了业务红线，可以直接在同一池子里比较。'
                        : '等待测算结果。'}
                    </p>
                  </article>
                  <article className="open-day-workspace__analysis-card">
                    <h3>动作建议</h3>
                    <p>
                      {analysis
                        ? opportunity
                          ? `${opportunity.name} 的互动质量突出但规模还没吃满，适合做效率型开放日试点。`
                          : `当前使用“${getPresetLabel(activePresetId, presets)}”策略，可以继续观察名单变化后再决定是否调参。`
                        : '上传完成后，这里会自动生成动作建议。'}
                    </p>
                  </article>
                </div>

                <article className="open-day-workspace__surface open-day-workspace__surface--chart">
                  <div className="open-day-workspace__section-head">
                    <div className="open-day-workspace__icon-badge open-day-workspace__icon-badge--soft">
                      <BarChart3 className="open-day-workspace__icon" />
                    </div>
                    <div>
                      <p className="open-day-workspace__section-kicker">Top 排名</p>
                      <h3>头部小区分数对比</h3>
                    </div>
                  </div>

                  <div className="open-day-workspace__chart">
                    {isAnalyzing ? (
                      <div className="open-day-workspace__placeholder">正在生成最新测算结果...</div>
                    ) : analysis ? (
                      chartRows.map((row) => (
                        <div key={row.name} className="open-day-workspace__bar-row">
                          <div className="open-day-workspace__bar-label">{row.name}</div>
                          <div className="open-day-workspace__bar-track">
                            <div className="open-day-workspace__bar-fill" style={{ width: `${row.score.toFixed(1)}%` }} />
                          </div>
                          <div className="open-day-workspace__bar-value">{row.score.toFixed(1)}</div>
                        </div>
                      ))
                    ) : (
                      <div className="open-day-workspace__placeholder">{statusMessage}</div>
                    )}
                  </div>
                </article>

                <article className="open-day-workspace__surface">
                  <div className="open-day-workspace__section-head">
                    <div className="open-day-workspace__icon-badge open-day-workspace__icon-badge--soft">
                      <BarChart3 className="open-day-workspace__icon" />
                    </div>
                    <div>
                      <p className="open-day-workspace__section-kicker">结果明细</p>
                      <h3>完整排名表</h3>
                    </div>
                  </div>

                  <div className="open-day-workspace__table-wrap">
                    <table className="open-day-workspace__table">
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
                              <td><span className="open-day-workspace__chip">#{row.rank}</span></td>
                              <td>{row.area || '—'}</td>
                              <td>{row.name}</td>
                              <td>{formatNumber(row.score, 1)}</td>
                              <td>
                                <div className="open-day-workspace__tier-cell">
                                  <span className={`open-day-workspace__grade open-day-workspace__grade--${row.tierCode}`}>{row.tierCode}</span>
                                  <span>{row.tierLabel}</span>
                                </div>
                              </td>
                              <td>
                                <span className={`open-day-workspace__eligibility ${row.isEligible ? 'is-on' : 'is-off'}`}>
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
                            <td colSpan={12} className="open-day-workspace__empty-cell">
                              {isBootstrapping ? '正在初始化工作台...' : statusMessage}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>

                <article className="open-day-workspace__surface">
                  <div className="open-day-workspace__section-head">
                    <div className="open-day-workspace__icon-badge open-day-workspace__icon-badge--soft">
                      <History className="open-day-workspace__icon" />
                    </div>
                    <div>
                      <p className="open-day-workspace__section-kicker">历史记录</p>
                      <h3>最近测算快照</h3>
                    </div>
                  </div>

                  <div className="open-day-workspace__snapshot-grid">
                    {snapshots.length ? (
                      snapshots.map((snapshot) => (
                        <article key={snapshot.id} className="open-day-workspace__snapshot-card">
                          <div className="open-day-workspace__snapshot-head">
                            <div>
                              <h4>{snapshot.sourceName || '未命名数据集'}</h4>
                              <p>{formatDateTime(snapshot.createdAt)}</p>
                            </div>
                            <span className="open-day-workspace__chip">#{snapshot.championName}</span>
                          </div>
                          <p>
                            冠军盘：{snapshot.championName}，综合分 {formatNumber(snapshot.championScore, 1)}。样本 {snapshot.totalCount} 个，入围 {snapshot.eligibleCount} 个。
                          </p>
                          <div className="open-day-workspace__chip-row">
                            <span className="open-day-workspace__chip">{snapshot.presetId || 'custom'}</span>
                            <span className="open-day-workspace__chip">{snapshot.waterlineSource}</span>
                            <span className="open-day-workspace__chip">{snapshot.configVersion.slice(0, 12)}</span>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="open-day-workspace__placeholder">暂未生成快照。</div>
                    )}
                  </div>
                </article>
              </section>
            </main>
          </>
        )}
      </div>
    </div>
  );
}
