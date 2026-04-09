import { useEffect, useRef, useState } from 'react';
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

function buildDataSummary(sourceName: string, rowCount: number, headers: string[]) {
  if (!rowCount) {
    return '暂未加载数据。你可以上传 Excel，或先加载示例数据查看完整测算流程。';
  }

  return `已加载 ${sourceName}，共 ${rowCount} 行。当前测算由后端领域服务执行，前端只负责上传、映射、参数仪表盘与结果展示。字段包含：${headers.join(' / ')}`;
}

export function OpenDayWorkspace({ activationKey }: OpenDayWorkspaceProps) {
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
  const [statusMessage, setStatusMessage] = useState('请先上传数据，并完成字段映射。');
  const [catalogMessage, setCatalogMessage] = useState('');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recalculateTick, setRecalculateTick] = useState(0);
  const requestVersionRef = useRef(0);

  const presets = catalog.presets;
  const missingMappings = getMissingMappings(mappings);
  const missingMappingsKey = missingMappings.join('|');
  const eligibleRows = analysis?.results.filter((row) => row.isEligible) || [];
  const topRows = (eligibleRows.length ? eligibleRows : analysis?.results || []).slice(0, 3);
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
          error instanceof Error ? `${error.message}，已自动回退到本地默认配置。` : '配置目录加载失败，已自动回退到本地默认配置。',
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
    if (!rows.length) {
      setAnalysis(null);
      setStatusMessage('请先上传数据，并完成字段映射。');
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
      setStatusMessage('正在调用后端测算服务...');

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
    setStatusMessage('');
  }

  async function handleWorkbookUpload(file: File, requestedSheet = '') {
    const payload = await uploadWorkbook(activationKey, file, requestedSheet);
    setWorkbookSheets(payload.sheets);
    setActiveSheet(payload.activeSheet);
    applyParsedData(payload, `${file.name}${payload.activeSheet ? ` / ${payload.activeSheet}` : ''}`);
  }

  async function handleFileSelection(file: File) {
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

  return (
    <div className="open-day-workspace">
      <div className="open-day-workspace__shell">
        <header className="open-day-workspace__hero">
          <div>
            <p className="open-day-workspace__eyebrow">选址测算工作台</p>
            <h1>小区开放日选址</h1>
            <p className="open-day-workspace__hero-text">
              上传 Excel 或 CSV 后，系统会自动计算规模、流量、商品、互动四维指数。默认按分位数巡航，也支持在控制台里直接覆盖 Alpha、权重、水位线和业务红线。
            </p>
          </div>
          <div className="open-day-workspace__hero-metric">
            <div className="open-day-workspace__hero-label">核心公式</div>
            <div className="open-day-workspace__hero-value">Score = Scale × Traffic^Alpha × Catalyst</div>
            <div className="open-day-workspace__hero-footnote">Catalyst = 0.65 商品 + 0.35 互动，Alpha 默认 0.8 且可调整</div>
          </div>
        </header>

        {catalogMessage ? <div className="open-day-workspace__banner">{catalogMessage}</div> : null}

        <main className="open-day-workspace__layout">
          <section className="open-day-workspace__panel">
            <div className="open-day-workspace__panel-header">
              <div>
                <p className="open-day-workspace__eyebrow">Step 1</p>
                <h2>上传文件与字段映射</h2>
              </div>
              <a className="open-day-workspace__ghost-link" href="/open-day-sample-data.csv" download>
                下载示例 CSV
              </a>
            </div>

            <div className="open-day-workspace__upload-row">
              <label className="open-day-workspace__upload-button">
                <span>上传 Excel / CSV 文件</span>
                <input
                  type="file"
                  accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0];
                    if (!nextFile) {
                      return;
                    }

                    void handleFileSelection(nextFile).catch((error) => {
                      setStatusMessage(error instanceof Error ? error.message : '文件读取失败');
                    });
                  }}
                />
              </label>
              <button type="button" className="open-day-workspace__secondary-button" onClick={handleLoadSample}>
                加载示例数据
              </button>
            </div>

            <p className="open-day-workspace__helper">
              建议字段：`楼盘名 / 小区名称`、`库存在售房源量`、`带看量`、`成交量`、`库存好房量`。互动质量会按 `成交量 / 带看量` 自动计算。
            </p>

            <div className={`open-day-workspace__summary ${rows.length ? '' : 'is-empty'}`}>
              {buildDataSummary(sourceName, rows.length, headers)}
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
                        setStatusMessage(error instanceof Error ? error.message : '切换工作表失败');
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

            <div className="open-day-workspace__mapping-grid">
              {[
                ['area', '大区列（可选）'],
                ['name', '小区名称列'],
                ['inventory', '在售套数列'],
                ['traffic', '带看量列'],
                ['transactions', '成交量列'],
                ['premium', '好房数列'],
              ].map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <select
                    value={mappings[key as keyof OpenDayFormMappings]}
                    onChange={(event) => {
                      const value = event.target.value;
                      setMappings((current) => ({
                        ...current,
                        [key]: value,
                      }));
                    }}
                  >
                    <option value="">{key === 'area' ? '不使用大区列' : '请选择字段'}</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="open-day-workspace__panel">
            <div className="open-day-workspace__panel-header">
              <div>
                <p className="open-day-workspace__eyebrow">Step 2</p>
                <h2>参数仪表盘</h2>
              </div>
              <button type="button" className="open-day-workspace__secondary-button" onClick={handleRestoreDefaults}>
                恢复默认矩阵
              </button>
            </div>

            <div className="open-day-workspace__formula-card">
              raw_score = (规模分 / 100) × (流量分 / 100) × (商品分 × 商品权重 + 互动分 × 互动权重)
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
              {activePresetId === 'custom' ? '，你正在使用手动覆写参数。' : '。'}
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
                        <h3>{definition.title}</h3>
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
          </section>

          <section className="open-day-workspace__panel open-day-workspace__panel--wide">
            <div className="open-day-workspace__panel-header">
              <div>
                <p className="open-day-workspace__eyebrow">Step 3</p>
                <h2>排名结果与自动分析</h2>
              </div>
              <button
                type="button"
                className="open-day-workspace__primary-button"
                onClick={() => {
                  setRecalculateTick((current) => current + 1);
                }}
              >
                重新测算
              </button>
            </div>

            <div className="open-day-workspace__headline-grid">
              <article className="open-day-workspace__metric-card">
                <div className="open-day-workspace__metric-label">样本小区数</div>
                <div className="open-day-workspace__metric-value">{analysis?.meta.totalCount ?? rows.length}</div>
                <div className="open-day-workspace__metric-footnote">{sourceName || '尚未加载数据'}</div>
              </article>
              <article className="open-day-workspace__metric-card">
                <div className="open-day-workspace__metric-label">入围小区数</div>
                <div className="open-day-workspace__metric-value">
                  {analysis ? `${analysis.meta.eligibleCount}/${analysis.meta.totalCount}` : '--'}
                </div>
                <div className="open-day-workspace__metric-footnote">
                  红线：在售 &gt;= {config.hardFilters.min_inventory}，好房 &gt;= {config.hardFilters.min_hq_rooms}，成交 &gt;= {config.hardFilters.min_transaction}
                </div>
              </article>
              <article className="open-day-workspace__metric-card">
                <div className="open-day-workspace__metric-label">冠军小区</div>
                <div className="open-day-workspace__metric-value">
                  {analysis?.results[0] ? analysis.results[0].name : '暂无'}
                </div>
                <div className="open-day-workspace__metric-footnote">
                  {analysis?.results[0] ? `综合分 ${formatNumber(analysis.results[0].score, 1)}，分层 ${analysis.results[0].tierLabel}` : '等待测算结果'}
                </div>
              </article>
              <article className="open-day-workspace__metric-card">
                <div className="open-day-workspace__metric-label">执行模式</div>
                <div className="open-day-workspace__metric-value">
                  {analysis ? `${analysis.meta.waterlines.source} / Alpha ${formatNumber(analysis.meta.requestedConfig.alpha, 2)}` : '--'}
                </div>
                <div className="open-day-workspace__metric-footnote">
                  {analysis
                    ? `缓存：${analysis.meta.cacheHit ? '命中' : '未命中'} | Config ${analysis.meta.configVersion.slice(0, 12)}... | Snapshot ${analysis.meta.snapshotId ? analysis.meta.snapshotId.slice(0, 12) : '--'}`
                    : '等待测算结果'}
                </div>
              </article>
            </div>

            <div className="open-day-workspace__analysis-grid">
              <article className="open-day-workspace__analysis-card">
                <h3>头部盘解读</h3>
                <p>
                  {topRows.length
                    ? `${topRows.map((row) => row.name).join('、')}位居前列，说明这些盘同时具备规模、带看和成交质量，更适合做开放日主会场。`
                    : '当前还没有可用于分析的头部盘。'}
                </p>
              </article>
              <article className="open-day-workspace__analysis-card">
                <h3>流量与转化</h3>
                <p>
                  {trafficLeader
                    ? `${trafficLeader.name} 的带看量最高，但最终排名是第 ${trafficLeader.rank}。这能帮助运营判断“声量型盘”和“转化型盘”是否发生背离。`
                    : '等待流量数据。'}
                </p>
              </article>
              <article className="open-day-workspace__analysis-card">
                <h3>红线过滤</h3>
                <p>
                  {analysis
                    ? analysis.results.length - eligibleRows.length > 0
                      ? `当前有 ${analysis.results.length - eligibleRows.length} 个小区未过业务红线，会被统一打到 D 级，避免长尾盘凭偶发数据挤占开放日资源。`
                      : '当前样本全部通过业务红线，可以放心在同一资源池内做排序。'
                    : '等待测算结果。'}
                </p>
              </article>
              <article className="open-day-workspace__analysis-card">
                <h3>策略建议</h3>
                <p>
                  {analysis
                    ? opportunity
                      ? `当前处于“${getPresetLabel(activePresetId, presets)}”配置。${opportunity.name} 没吃满规模分，但互动质量突出，适合做效率型开放日试点。`
                      : `当前处于“${getPresetLabel(activePresetId, presets)}”配置。当前水位线来源是 ${analysis.meta.waterlines.source}，适合继续观察样本结构变化。`
                    : '等待测算结果。'}
                </p>
              </article>
            </div>

            <section className="open-day-workspace__snapshot-panel">
              <div className="open-day-workspace__subsection-header">
                <div>
                  <p className="open-day-workspace__eyebrow">History</p>
                  <h3>最近测算快照</h3>
                </div>
                <p className="open-day-workspace__helper">
                  每次新的参数组合与数据集测算都会落一份快照，方便回看冠军盘、配置版本和大盘水位。
                </p>
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
            </section>

            <div className="open-day-workspace__chart">
              {isAnalyzing ? (
                <div className="open-day-workspace__placeholder">正在调用后端测算服务...</div>
              ) : analysis ? (
                (eligibleRows.length ? eligibleRows : analysis.results).slice(0, 6).map((row) => (
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
          </section>
        </main>
      </div>
    </div>
  );
}
