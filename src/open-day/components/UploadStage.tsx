import { useRef, useState } from 'react';
import {
  ArrowRight, Building2, Database, FileUp, RefreshCcw, AlertTriangle, CheckCircle, Info, X
} from 'lucide-react';
import type { OpenDayRawRow } from '../../../modules/open-day/domain/openDay.types.ts';
import {
  requiredMappingKeys,
  type DatasetQualityReport,
  type MappingKey,
  type OpenDayFormMappings,
} from '../openDayConstants.ts';
import './UploadStage.css';

interface UploadStageProps {
  rows: OpenDayRawRow[];
  headers: string[];
  mappings: OpenDayFormMappings;
  sourceName: string;
  activeSheet: string;
  isParsingFile: boolean;
  uploadError: string;
  catalogMessage: string;
  qualityReport: DatasetQualityReport | null; // Added
  onFileSelection: (file: File) => void;
  onLoadSample: () => void;
  onClearData: () => void;
  onEnterWorkspace: () => void;
  onUploadError: (error: string) => void;
}

const mappingOrder: MappingKey[] = ['area', 'name', 'inventory', 'traffic', 'transactions', 'premium'];

const mappingLabels: Record<MappingKey, string> = {
  area: '大区',
  name: '小区名称',
  inventory: '在售套数',
  traffic: '带看量',
  transactions: '成交量',
  premium: '好房数',
};

const requiredMappingKeySet: ReadonlySet<MappingKey> = new Set(requiredMappingKeys);
const blankTemplateCsv = `${mappingOrder.map((key) => mappingLabels[key]).join(',')}\n`;

type QualityIssueRow = {
  id: string;
  reason: string;
  field: string;
  count: number;
  invalidRatio: string;
  totalRatio: string;
};

function formatQualityRatio(count: number, total: number) {
  if (!total) return '0%';
  const ratio = (count / total) * 100;
  return ratio < 1 && ratio > 0 ? `${ratio.toFixed(1)}%` : `${Math.round(ratio)}%`;
}

function readQualityCount(
  bucket: Partial<Record<MappingKey, number>> | undefined,
  key: MappingKey,
) {
  return bucket?.[key] ?? 0;
}

function buildQualityIssueRows(report: DatasetQualityReport): QualityIssueRow[] {
  const invalidRows = Math.max(report.invalidRows, 1);
  const totalRows = Math.max(report.totalRows, 1);
  const issueRows: QualityIssueRow[] = [];

  mappingOrder.forEach((key) => {
    const field = mappingLabels[key];
    const missingCount = readQualityCount(report.missingFieldCounts, key);
    const typeErrorCount = readQualityCount(report.typeErrorCounts, key);

    if (missingCount > 0) {
      issueRows.push({
        id: `${key}-missing`,
        reason: `${field}为空 / 缺失`,
        field,
        count: missingCount,
        invalidRatio: formatQualityRatio(missingCount, invalidRows),
        totalRatio: formatQualityRatio(missingCount, totalRows),
      });
    }

    if (typeErrorCount > 0) {
      issueRows.push({
        id: `${key}-type`,
        reason: `${field}格式异常`,
        field,
        count: typeErrorCount,
        invalidRatio: formatQualityRatio(typeErrorCount, invalidRows),
        totalRatio: formatQualityRatio(typeErrorCount, totalRows),
      });
    }
  });

  return issueRows.sort((left, right) => right.count - left.count);
}

function downloadBlankTemplate() {
  const blob = new Blob([`\uFEFF${blankTemplateCsv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '开放日测算空白模板.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function UploadStage({
  rows,
  headers,
  mappings,
  sourceName,
  activeSheet,
  isParsingFile,
  uploadError,
  catalogMessage,
  qualityReport,
  onFileSelection,
  onLoadSample,
  onClearData,
  onEnterWorkspace,
  onUploadError,
}: UploadStageProps) {
  const [isMappingDialogOpen, setIsMappingDialogOpen] = useState(false);
  const [isQualityDialogOpen, setIsQualityDialogOpen] = useState(false);
  const [isTemplateFallbackVisible, setIsTemplateFallbackVisible] = useState(false);
  const [templateCopyStatus, setTemplateCopyStatus] = useState('');
  const templateHeaderRef = useRef<HTMLTextAreaElement>(null);
  const mappingRows = mappingOrder.map((key) => {
    const sourceField = mappings[key];
    const hasSourceColumn = sourceField ? headers.includes(sourceField) : false;
    return {
      key,
      systemField: mappingLabels[key],
      sourceField,
      isRequired: requiredMappingKeySet.has(key),
      status: !sourceField ? '未映射' : hasSourceColumn ? '已映射' : '源列缺失',
    };
  });
  const mappedFieldCount = mappingRows.filter((row) => row.sourceField && row.status === '已映射').length;
  const qualityIssueRows = qualityReport ? buildQualityIssueRows(qualityReport) : [];

  return (
    <div className="open-day-workspace">
      <div className="open-day-workspace__shell">
        {catalogMessage ? <div className="open-day-workspace__banner">{catalogMessage}</div> : null}

        <section className="open-day-upload-stage">
          <div className="open-day-upload-hero">
            <div className="open-day-upload-hero__icon-bg">
              <Building2 className="open-day-upload-hero__icon" size={28} />
            </div>
            <h1>开放日选址 skill</h1>
          </div>

          <div className="open-day-upload-card">
            {!rows.length ? (
              <div className="open-day-upload-card__panel open-day-upload-card__panel--empty">
                {isParsingFile ? (
                  <div className="open-day-upload-loading">
                    <div className="open-day-spinner-wrapper">
                      <RefreshCcw className="animate-spin" size={40} />
                    </div>
                    <h3>正在读取档案数据</h3>
                    <p>系统正在接管表格并提取测算指标，通常需要几秒钟...</p>
                  </div>
                ) : (
                  <>
                    <div
                      className="open-day-upload-drop-area"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files?.[0];
                        if (!file) return;
                        onFileSelection(file);
                      }}
                      onClick={() => document.querySelector<HTMLInputElement>('.open-day-hidden-file-input')?.click()}
                    >
                      <div className="open-day-upload-empty">
                        <div className="open-day-upload-empty__icon-wrapper">
                          <FileUp size={40} />
                        </div>
                        <strong>点击或拖拽文件至此</strong>
                        <p>支持 Excel (.xlsx) 或 CSV 格式文件，系统将智能识别表头</p>
                      </div>
                    </div>

                    <div className="open-day-upload-actions">
                      <button type="button" className="open-day-button open-day-button--secondary" onClick={onLoadSample}>
                        加载演示数据
                      </button>
                      <button
                        type="button"
                        className="open-day-button open-day-button--ghost"
                        onClick={() => {
                          setIsTemplateFallbackVisible(true);
                          setTemplateCopyStatus('');
                          downloadBlankTemplate();
                        }}
                      >
                        下载空白模板
                      </button>
                    </div>

                    {isTemplateFallbackVisible ? (
                      <div className="open-day-template-fallback">
                        <div>
                          <strong>空白模板已生成</strong>
                          <p>如果当前浏览器没有弹出下载，可先复制下面 CSV 表头。</p>
                        </div>
                        <textarea
                          ref={templateHeaderRef}
                          readOnly
                          value={blankTemplateCsv.trim()}
                          onFocus={(event) => event.currentTarget.select()}
                        />
                        <button
                          type="button"
                          className="open-day-button open-day-button--secondary open-day-button--sm"
                          onClick={() => {
                            templateHeaderRef.current?.focus();
                            templateHeaderRef.current?.select();
                            setTemplateCopyStatus('已选中，按 ⌘C 复制');
                          }}
                        >
                          选中表头
                        </button>
                        {templateCopyStatus ? <span>{templateCopyStatus}</span> : null}
                      </div>
                    ) : null}

                    {uploadError && <div className="open-day-inline-error">{uploadError}</div>}
                  </>
                )}

                <input
                  className="open-day-hidden-file-input"
                  type="file"
                  style={{ display: 'none' }}
                  accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={(e) => {
                    const nextFile = e.target.files?.[0];
                    e.currentTarget.value = '';
                    if (nextFile) {
                      onFileSelection(nextFile);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="open-day-upload-card__panel open-day-upload-card__panel--success">
                <div className="open-day-upload-success-header">
                  <div className="open-day-upload-success-icon">
                    <Database size={24} />
                  </div>
                  <div className="flex-1">
                    <h3>数据入库成功</h3>
                    <p>已载入 {sourceName || '未命名数据集'}，质量评估完成。</p>
                  </div>
                  {qualityReport && (
                    <div className={`open-day-quality-badge ${qualityReport.score >= 90 ? 'is-good' : qualityReport.score >= 60 ? 'is-warning' : 'is-error'}`}>
                      <span className="open-day-quality-badge__label">数据质量分</span>
                      <span className="open-day-quality-badge__value">{qualityReport.score}</span>
                    </div>
                  )}
                </div>

                <div className="open-day-upload-stats-grid">
                  <div className="open-day-stat-box">
                    <span>总行数</span>
                    <strong>{rows.length} <em>行</em></strong>
                  </div>
                  {qualityReport ? (
                    <button
                      type="button"
                      className="open-day-stat-box open-day-stat-box--button"
                      onClick={() => setIsQualityDialogOpen(true)}
                      aria-haspopup="dialog"
                      aria-label={`查看有效行数与无效数据原因，当前有效 ${qualityReport.validRows} 行`}
                    >
                      <span>有效行数</span>
                      <strong className={qualityReport.invalidRows ? 'has-error' : ''}>
                        {qualityReport.validRows} <em>行</em>
                      </strong>
                      <small>{qualityReport.invalidRows ? '点击查看无效原因' : '点击查看校验口径'}</small>
                    </button>
                  ) : (
                    <div className="open-day-stat-box">
                      <span>有效行数</span>
                      <strong>{rows.length} <em>行</em></strong>
                    </div>
                  )}
                  <button
                    type="button"
                    className="open-day-stat-box open-day-stat-box--button"
                    onClick={() => setIsMappingDialogOpen(true)}
                    aria-haspopup="dialog"
                  >
                    <span>字段映射</span>
                    <strong>{mappedFieldCount}/{mappingRows.length} <em>项</em></strong>
                    <small>点击查看明细</small>
                  </button>
                </div>

                {isQualityDialogOpen && qualityReport && (
                  <div className="open-day-mapping-dialog-backdrop" role="presentation" onClick={() => setIsQualityDialogOpen(false)}>
                    <div
                      className="open-day-mapping-dialog open-day-quality-dialog"
                      role="dialog"
                      aria-modal="true"
                      aria-label="有效行数与无效数据原因"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="open-day-mapping-dialog__header">
                        <div>
                          <h3>有效行数与无效数据原因</h3>
                          <p>有效行会进入候选清单测算；无效行会被自动纠正或在计算中跳过。</p>
                        </div>
                        <button type="button" className="open-day-mapping-dialog__close" onClick={() => setIsQualityDialogOpen(false)} aria-label="关闭有效行数说明">
                          <X size={16} />
                        </button>
                      </div>

                      <div className="open-day-quality-dialog__body">
                        <div className="open-day-quality-dialog__summary">
                          <div>
                            <span>总行数</span>
                            <strong>{qualityReport.totalRows}</strong>
                          </div>
                          <div>
                            <span>有效行数</span>
                            <strong>{qualityReport.validRows}</strong>
                            <em>{formatQualityRatio(qualityReport.validRows, qualityReport.totalRows)}</em>
                          </div>
                          <div>
                            <span>无效 / 待修正</span>
                            <strong>{qualityReport.invalidRows}</strong>
                            <em>{formatQualityRatio(qualityReport.invalidRows, qualityReport.totalRows)}</em>
                          </div>
                        </div>

                        <div className="open-day-quality-dialog__note">
                          <Info size={14} />
                          <p>原因占比按无效行数计算；同一行可能同时命中多个字段问题，所以各原因合计可能大于无效行数。</p>
                        </div>

                        <div className="open-day-quality-issue-table">
                          <div className="open-day-quality-issue-table__row is-head">
                            <span>原因</span>
                            <span>字段</span>
                            <span>行数</span>
                            <span>占无效行</span>
                            <span>占全表</span>
                          </div>
                          {qualityIssueRows.length ? (
                            qualityIssueRows.map((row) => (
                              <div className="open-day-quality-issue-table__row" key={row.id}>
                                <strong>{row.reason}</strong>
                                <span>{row.field}</span>
                                <span>{row.count}</span>
                                <span>{row.invalidRatio}</span>
                                <span>{row.totalRatio}</span>
                              </div>
                            ))
                          ) : (
                            <div className="open-day-quality-dialog__empty">
                              <CheckCircle size={18} />
                              <div>
                                <strong>暂无无效数据</strong>
                                <p>所有关键字段齐备，数值字段格式可正常参与测算。</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {isMappingDialogOpen && (
                  <div className="open-day-mapping-dialog-backdrop" role="presentation" onClick={() => setIsMappingDialogOpen(false)}>
                    <div
                      className="open-day-mapping-dialog"
                      role="dialog"
                      aria-modal="true"
                      aria-label="字段映射明细"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="open-day-mapping-dialog__header">
                        <div>
                          <h3>字段映射明细</h3>
                          <p>源表共 {headers.length} 列，当前识别 {mappedFieldCount} 个系统字段。</p>
                        </div>
                        <button type="button" className="open-day-mapping-dialog__close" onClick={() => setIsMappingDialogOpen(false)} aria-label="关闭字段映射明细">
                          <X size={16} />
                        </button>
                      </div>

                      <div className="open-day-mapping-dialog__table">
                        <div className="open-day-mapping-dialog__row is-head">
                          <span>系统字段</span>
                          <span>源表字段</span>
                          <span>状态</span>
                        </div>
                        {mappingRows.map((row) => (
                          <div className="open-day-mapping-dialog__row" key={row.key}>
                            <span>
                              {row.systemField}
                              {row.isRequired ? <em>必填</em> : <em>可选</em>}
                            </span>
                            <strong>{row.sourceField || '—'}</strong>
                            <i className={row.status === '已映射' ? 'is-ok' : 'is-missing'}>{row.status}</i>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {qualityReport && (
                  <div className="open-day-quality-details">
                    <div className="open-day-quality-details__header">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#86868B]">
                        <Info size={14} /> 数据质量概要
                      </div>
                    </div>
                    <div className="open-day-quality-grid">
                      {qualityReport.isCriticallyDeficient ? (
                        <div className="open-day-quality-alert is-error">
                          <AlertTriangle className="shrink-0" size={18} />
                          <div>
                            <strong>关键数据缺失严重</strong>
                            <p>大部分行缺少关键字段（如成交量或带看），这会严重影响测算精准度，请检查表头映射或原始文件。</p>
                          </div>
                        </div>
                      ) : qualityReport.invalidRows > 0 ? (
                        <div className="open-day-quality-alert is-warning">
                          <AlertTriangle className="shrink-0" size={18} />
                          <div>
                            <strong>存在待修正数据</strong>
                            <p>共有 {qualityReport.invalidRows} 行数据存在不完整或格式异常。我们将自动尝试纠正，或在计算中跳过这些行。</p>
                          </div>
                        </div>
                      ) : (
                        <div className="open-day-quality-alert is-success">
                          <CheckCircle className="shrink-0" size={18} />
                          <div>
                            <strong>数据验证通过</strong>
                            <p>所有关键字段齐备，数据格式符合测算引擎规格。</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="open-day-upload-success-actions">
                  <button
                    type="button"
                    className="open-day-button open-day-button--ghost"
                    onClick={onClearData}
                  >
                    重新上传
                  </button>
                  <button
                    type="button"
                    className="open-day-button open-day-button--primary open-day-button--lg"
                    disabled={qualityReport?.isCriticallyDeficient}
                    onClick={onEnterWorkspace}
                  >
                    <span>{qualityReport?.isCriticallyDeficient ? '数据不足，无法进入' : '进入测算工作台'}</span>
                    {!qualityReport?.isCriticallyDeficient && <ArrowRight className="open-day-button__icon" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
