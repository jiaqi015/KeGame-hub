import { 
  ArrowRight, Database, FileUp, RefreshCcw, Sparkles, AlertTriangle, CheckCircle, Info
} from 'lucide-react';
import type { OpenDayRawRow } from '../../domain/openDay.types.ts';
import type { DatasetQualityReport } from '../openDayConstants.ts';
import './UploadStage.css';

interface UploadStageProps {
  rows: OpenDayRawRow[];
  headers: string[];
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

export function UploadStage({
  rows,
  headers,
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
  return (
    <div className="open-day-workspace">
      <div className="open-day-workspace__shell">
        {catalogMessage ? <div className="open-day-workspace__banner">{catalogMessage}</div> : null}

        <section className="open-day-upload-stage">
          <div className="open-day-upload-hero">
            <div className="open-day-upload-hero__icon-bg">
              <Sparkles className="open-day-upload-hero__icon" size={28} />
            </div>
            <h1>楼盘测算中心</h1>
            <p>导入你的带看与房源数据档案，引擎将自动演算每个小区的梯队潜力与破局归因。</p>
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
                      <a className="open-day-button open-day-button--ghost" href="/open-day-sample-data.csv" download>
                        下载空白模板
                      </a>
                    </div>

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
                      <span className="open-day-quality-badge__label">质量分</span>
                      <span className="open-day-quality-badge__value">{qualityReport.score}</span>
                    </div>
                  )}
                </div>

                <div className="open-day-upload-stats-grid">
                  <div className="open-day-stat-box">
                    <span>总行数</span>
                    <strong>{rows.length} <em>行</em></strong>
                  </div>
                  <div className="open-day-stat-box">
                    <span>有效行数</span>
                    <strong className={qualityReport?.invalidRows ? 'has-error' : ''}>
                      {qualityReport?.validRows ?? rows.length} <em>行</em>
                    </strong>
                  </div>
                  <div className="open-day-stat-box">
                    <span>字段映射</span>
                    <strong>{headers.length} <em>列</em></strong>
                  </div>
                </div>

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
