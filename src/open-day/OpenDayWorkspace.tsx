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

export function OpenDayWorkspace({ activationKey }: OpenDayWorkspaceProps) {
  const [step, setStep] = useState<'upload' | 'result'>('upload');
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
  const [statusMessage, setStatusMessage] = useState('');
  const [catalogMessage, setCatalogMessage] = useState('');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recalculateTick, setRecalculateTick] = useState(0);
  const requestVersionRef = useRef(0);

  const presets = catalog.presets;
  const missingMappings = getMissingMappings(mappings);
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
    if (!rows.length || step === 'upload') {
      setAnalysis(null);
      setIsAnalyzing(false);
      return;
    }

    if (missingMappings.length > 0) {
      setAnalysis(null);
      setIsAnalyzing(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const currentVersion = requestVersionRef.current + 1;
      requestVersionRef.current = currentVersion;
      setIsAnalyzing(true);

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
    missingMappings.join('|'),
    recalculateTick,
    step,
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

  function handleNextStep() {
    if (!rows.length) {
      setStatusMessage('请先上传文件');
      return;
    }
    if (missingMappings.length > 0) {
      setStatusMessage(`请完成字段映射：${missingMappings.join('、')}`);
      return;
    }
    setStep('result');
  }

  function handleBackStep() {
    setStep('upload');
  }

  function handleRetryCalculation() {
    setRecalculateTick((current) => current + 1);
  }

  if (step === 'upload') {
    return (
      <div className="open-day-workspace">
        <div className="open-day-workspace__shell">
          {catalogMessage ? <div className="open-day-workspace__banner">{catalogMessage}</div> : null}

          <div className="open-day-upload-page">
            <div className="open-day-upload-card">
              <div className="open-day-upload-header">
                <h2>上传数据</h2>
                <p>支持 Excel / CSV，自动匹配字段</p>
              </div>

              <div className="open-day-upload-actions">
                <label className="open-day-upload-button">
                  <span>上传文件</span>
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
                <button type="button" className="open-day-upload-secondary" onClick={handleLoadSample}>
                  加载示例
                </button>
                <a className="open-day-upload-link" href="/open-day-sample-data.csv" download>
                  下载示例
                </a>
              </div>

              {workbookSheets.length > 0 ? (
                <div className="open-day-sheet-picker">
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

              {rows.length > 0 ? (
                <div className="open-day-data-info">
                  {sourceName}，共 {rows.length} 行
                </div>
              ) : null}

              {statusMessage ? (
                <div className="open-day-status-message">{statusMessage}</div>
              ) : null}

              <div className="open-day-mapping-grid">
                {[
                  ['area', '大区（可选）'],
                  ['name', '小区名称'],
                  ['inventory', '在售套数'],
                  ['traffic', '带看量'],
                  ['transactions', '成交量'],
                  ['premium', '好房数'],
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
                      <option value="">{key === 'area' ? '不使用' : '请选择'}</option>
                      {headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="open-day-upload-footer">
                <button
                  type="button"
                  className="open-day-next-button"
                  onClick={handleNextStep}
                  disabled={!rows.length || missingMappings.length > 0}
                >
                  下一步 → 参数调整
                </button>
              </div>
            </div>

            {snapshots.length > 0 ? (
              <div className="open-day-recent-card">
                <h3>最近测算</h3>
                <div className="open-day-recent-list">
                  {snapshots.slice(0, 4).map((snapshot) => (
                    <div key={snapshot.id} className="open-day-recent-item">
                      <div className="open-day-recent-name">{snapshot.sourceName || '未命名'}</div>
                      <div className="open-day-recent-meta">
                        {snapshot.eligibleCount}/{snapshot.totalCount} · {formatNumber(snapshot.championScore, 1)}
                      </div>
                      <div className="open-day-recent-date">{formatDateTime(snapshot.createdAt)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="open-day-workspace">
      <div className="open-day-workspace__shell">
        <div className="open-day-result-header">
          <button className="open-day-back-button" onClick={handleBackStep}>
            ← 返回上传
          </button>
          <div className="open-day-result-title">
            <h2>小区开放日测算</h2>
            <p>{sourceName} · {rows.length} 个小区</p>
          </div>
        </div>

        {catalogMessage ? <div className="open-day-workspace__banner">{catalogMessage}</div> : null}

        <div className="open-day-result-layout">
          <section className="open-day-params-block">
            <div className="open-day-params-header">
              <h3>参数调整</h3>
              <button type="button" className="open-day-reset-button" onClick={handleRestoreDefaults}>
                恢复默认
              </button>
            </div>

            <div className="open-day-preset-strip">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`open-day-preset-tag ${activePresetId === preset.id ? 'is-active' : ''}`}
                  onClick={() => handleApplyPreset(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="open-day-basic-grid">
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
              {waterlineDefinitions.map((definition) => {
                const absoluteValue = config.absolutes[definition.key];
                const percentileValue = config.percentiles[definition.key];
                const absoluteDisplay =
                  definition.key === 'R_cap'
                    ? formatPercent(absoluteValue, 2)
                    : `${formatNumber(absoluteValue, 1)}${definition.unit}`;

                return (
                  <div key={definition.key} className="open-day-waterline-card">
                    <div className="open-day-waterline-title">
                      <h4>{definition.title}</h4>
                      <span className="open-day-mode-badge">{config.waterlineMode === 'percentile' ? '分位' : '固定值'}</span>
                    </div>
                    <div className="open-day-waterline-inputs">
                      <label>
                        <span>{definition.percentileLabel}</span>
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
                    <div className="open-day-waterline-desc">{definition.description}</div>
                  </div>
                );
              })}
            </div>

            <div className="open-day-recalc-footer">
              <button
                type="button"
                className="open-day-recalc-button"
                onClick={handleRetryCalculation}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? '测算中...' : '重新测算'}
              </button>
              <div className="open-day-current-preset">
                当前：{getPresetLabel(activePresetId, presets)}
              </div>
            </div>
          </section>

          <section className="open-day-analysis-block">
            <h3>自动解读</h3>
            <div className="open-day-analysis-grid">
              <div className="open-day-analysis-item">
                <h4>头部小区</h4>
                <p>
                  {topRows.length
                    ? `${topRows.map((row) => row.name).join('、')} 名列前茅，适合优先安排开放日主会场。`
                    : '暂无数据'}
                </p>
              </div>
              <div className="open-day-analysis-item">
                <h4>流量转化</h4>
                <p>
                  {trafficLeader
                    ? `${trafficLeader.name} 带看最高，排名第 ${trafficLeader.rank}，可对比声量与转化是否匹配。`
                    : '暂无数据'}
                </p>
              </div>
              <div className="open-day-analysis-item">
                <h4>红线过滤</h4>
                <p>
                  {analysis
                    ? analysis.results.length - eligibleRows.length > 0
                      ? `${analysis.results.length - eligibleRows.length} 个小区未达标，已排除。`
                      : '全部小区通过红线过滤。'
                    : '等待测算'}
                </p>
              </div>
              <div className="open-day-analysis-item">
                <h4>策略建议</h4>
                <p>
                  {analysis
                    ? opportunity
                      ? `${opportunity.name} 互动质量突出，规模未满，适合效率型试点。`
                      : `当前使用 ${getPresetLabel(activePresetId, presets)}，观察样本结构即可。`
                    : '等待测算'}
                </p>
              </div>
            </div>

            {analysis && !isAnalyzing ? (
              <>
                <div className="open-day-stats-row">
                  <div className="open-day-stat-item">
                    <span className="open-day-stat-label">样本</span>
                    <span className="open-day-stat-value">{analysis.meta.totalCount}</span>
                  </div>
                  <div className="open-day-stat-item">
                    <span className="open-day-stat-label">入围</span>
                    <span className="open-day-stat-value">{analysis.meta.eligibleCount}/{analysis.meta.totalCount}</span>
                  </div>
                  <div className="open-day-stat-item">
                    <span className="open-day-stat-label">冠军</span>
                    <span className="open-day-stat-value">{analysis.results[0]?.name || '-'}</span>
                  </div>
                  <div className="open-day-stat-item">
                    <span className="open-day-stat-label">缓存</span>
                    <span className="open-day-stat-value">{analysis.meta.cacheHit ? '命中' : '未命中'}</span>
                  </div>
                </div>

                <div className="open-day-chart-block">
                  <h3>Top 6 评分</h3>
                  {(eligibleRows.length ? eligibleRows : analysis.results).slice(0, 6).map((row) => (
                    <div key={row.name} className="open-day-chart-row">
                      <span className="open-day-chart-label">{row.name}</span>
                      <div className="open-day-chart-bar">
                        <div
                          className="open-day-chart-fill"
                          style={{ width: `${row.score.toFixed(1)}%` }}
                        />
                      </div>
                      <span className="open-day-chart-value">{formatNumber(row.score, 1)}</span>
                    </div>
                  ))}
                </div>

                <div className="open-day-table-block">
                  <table className="open-day-result-table">
                    <thead>
                      <tr>
                        <th>排</th>
                        <th>小区</th>
                        <th>分数</th>
                        <th>分层</th>
                        <th>入围</th>
                        <th>规模</th>
                        <th>流量</th>
                        <th>商品</th>
                        <th>互动</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.results.map((row) => (
                        <tr key={`${row.rank}-${row.name}`}>
                          <td>#{row.rank}</td>
                          <td>{row.name}</td>
                          <td>{formatNumber(row.score, 1)}</td>
                          <td>{row.tierLabel}</td>
                          <td>
                            <span className={`open-day-eligibility-badge ${row.isEligible ? 'pass' : 'fail'}`}>
                              {row.isEligible ? '是' : '否'}
                            </span>
                          </td>
                          <td>{formatNumber(row.scaleIdx, 1)}</td>
                          <td>{formatNumber(row.trafficIdx, 1)}</td>
                          <td>{formatNumber(row.productIdx, 1)}</td>
                          <td>{formatNumber(row.interactionIdx, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="open-day-loading-placeholder">
                {isAnalyzing ? '正在测算，请稍候...' : statusMessage || '等待测算开始'}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
