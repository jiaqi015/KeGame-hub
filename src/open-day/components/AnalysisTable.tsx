import { useEffect, useRef } from 'react';
import { Activity, BarChart3, RotateCw, Search, X, ShieldAlert, Expand, Shrink, FileDown, AlertCircle } from 'lucide-react';
import type { OpenDayAnalysisResponse, OpenDayAnalysisRow } from '../../../modules/open-day/domain/openDay.types.ts';
import type { DatasetQualityReport } from '../openDayConstants';
import { formatNumber, formatPercent } from '../formatters';
import './AnalysisTable.css';

interface AnalysisTableProps {
  analysis: OpenDayAnalysisResponse | null;
  baselineAnalysis: OpenDayAnalysisResponse | null;
  searchTerm: string;
  activeRow: OpenDayAnalysisRow | null;
  isBootstrapping: boolean;
  isAnalyzing: boolean;
  hasPendingChanges: boolean;
  statusMessage: string;
  currentParameterLabel: string;
  currentFormulaLabel: string;
  sampleCount: number;
  qualityReport: DatasetQualityReport | null;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
  onExport: () => void;
  onSearchChange: (term: string) => void;
  onRowClick: (row: OpenDayAnalysisRow) => void;
  onExecuteAnalysis: () => void;
  onSelectNext: () => void;
  onSelectPrev: () => void;
  onAuditRow: (row: OpenDayAnalysisRow) => void;
}

export function AnalysisTable({
  analysis,
  baselineAnalysis,
  searchTerm,
  activeRow,
  isBootstrapping,
  isAnalyzing,
  hasPendingChanges,
  statusMessage,
  currentParameterLabel,
  currentFormulaLabel,
  sampleCount,
  qualityReport,
  isFullScreen,
  onToggleFullScreen,
  onExport,
  onSearchChange,
  onRowClick,
  onExecuteAnalysis,
  onSelectNext,
  onSelectPrev,
  onAuditRow,
}: AnalysisTableProps) {
  const selectedRowRef = useRef<HTMLTableRowElement>(null);
  const filteredRows = analysis?.results.filter((row) => 
    !searchTerm || row.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  useEffect(() => {
    if (activeRow && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activeRow]);

  return (
    <div 
      className={`open-day-main-card ${isFullScreen ? 'is-full-screen' : ''}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          onSelectNext();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          onSelectPrev();
        }
      }}
    >
      {statusMessage ? (
        <div className={`open-day-status-card ${isAnalyzing ? 'is-loading' : ''} ${qualityReport?.invalidRows ? 'has-issue' : ''}`}>
          <div className="flex items-center gap-2">
            {qualityReport?.invalidRows ? <ShieldAlert size={16} className="text-amber-600" /> : null}
            <span>{statusMessage}</span>
          </div>
          {qualityReport?.invalidRows ? (
            <div className="open-day-status-hint">
              {qualityReport.invalidRows} 行数据存在不完整（已自动跳过或处理）
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="open-day-table-header-group">
        {/* Row 1: Key Metrics */}
        <div className="open-day-hero-card__stats">
          <div className="open-day-hero-stat">
            <span className="open-day-hero-stat__label">策略</span>
            <strong className="open-day-hero-stat__value">{currentParameterLabel}</strong>
          </div>
          <div className="open-day-hero-stat">
            <span className="open-day-hero-stat__label">公式</span>
            <strong className="open-day-hero-stat__value">{currentFormulaLabel}</strong>
          </div>
          <div className="open-day-hero-stat">
            <span className="open-day-hero-stat__label">样本</span>
            <strong className="open-day-hero-stat__value">{analysis?.meta.totalCount ?? sampleCount}</strong>
          </div>
          <div className="open-day-hero-stat">
            <span className="open-day-hero-stat__label">入围</span>
            <strong className="open-day-hero-stat__value">{analysis ? `${analysis.meta.eligibleCount}/${analysis.meta.totalCount}` : '--'}</strong>
          </div>
        </div>

        {/* Row 2: Interactive Controls */}
        <div className="open-day-table-controls">
          <div className="open-day-search-bar">
            <Search size={16} />
            <input
              type="text"
              placeholder="按名字及编号搜索小区..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onSearchChange('');
              }}
            />
            {searchTerm && (
              <button className="open-day-search-clear" onClick={() => onSearchChange('')}>
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button 
              className="open-day-button open-day-button--secondary open-day-button--sm"
              onClick={onExport}
              disabled={!analysis || isAnalyzing}
              title="导出当前结果为 CSV"
            >
              <FileDown size={16} />
              <span>导出</span>
            </button>

            <button 
              className="open-day-button open-day-button--secondary open-day-button--sm open-day-button--icon-only"
              onClick={onToggleFullScreen}
              title={isFullScreen ? '退出全屏' : '全屏模式'}
            >
              {isFullScreen ? <Shrink size={18} /> : <Expand size={18} />}
            </button>
          </div>
        </div>
      </div>

      <div className={`open-day-table-wrap ${hasPendingChanges ? 'is-stale' : ''} ${isAnalyzing ? 'is-analyzing' : ''}`}>
        {isAnalyzing && (
          <div className="open-day-table-loading-overlay">
            <RotateCw size={32} className="animate-spin text-emerald-700" />
            <span>正在精准测算...</span>
          </div>
        )}
        <table className="open-day-table">
          <thead>
            <tr>
              <th>排名</th>
              <th>小区</th>
              <th className="is-numeric">综合分</th>
              <th>梯队</th>
              <th>状态</th>
              <th className="is-numeric">规模</th>
              <th className="is-numeric">流量</th>
              <th className="is-numeric">货品</th>
              <th className="is-numeric">交互</th>
              <th className="is-numeric">成交</th>
              <th className="is-numeric">转化</th>
            </tr>
          </thead>
          <tbody>
            {analysis ? (
              filteredRows.length > 0 ? (
                filteredRows.map((row) => (
                  <tr
                    key={`${row.rank}-${row.name}`}
                    className={activeRow?.name === row.name ? 'is-selected' : ''}
                    ref={activeRow?.name === row.name ? selectedRowRef : null}
                    onClick={() => onRowClick(row)}
                  >
                    <td>
                      <div className="flex items-center gap-2">
                        <span
                          className={`open-day-rank-chip ${
                            row.rank === 1
                              ? 'open-day-rank-chip--gold'
                              : row.rank === 2
                                ? 'open-day-rank-chip--silver'
                                : row.rank === 3
                                  ? 'open-day-rank-chip--bronze'
                                  : ''
                          }`}
                        >
                          #{row.rank}
                        </span>
                        
                        {baselineAnalysis && (() => {
                          const baselineRow = baselineAnalysis.results.find(br => br.name === row.name);
                          if (!baselineRow) return <span className="open-day-delta-rank is-new">NEW</span>;
                          const delta = baselineRow.rank - row.rank; // 比如 原本第8，现在第3，delta = 5 (提升)
                          if (delta > 0) return <span className="open-day-delta-rank is-up">↑{delta}</span>;
                          if (delta < 0) return <span className="open-day-delta-rank is-down">↓{Math.abs(delta)}</span>;
                          return null;
                        })()}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col relative group">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold">{row.name}</span>
                          {row.logicGuardTags && (
                            <div 
                              className={`open-day-logic-alert is-${row.logicGuardSeverity || 'warning'}`}
                              title={`[智能诊断报告]\n${row.logicGuardTags.map(t => '• ' + t).join('\n')}`}
                            >
                              <AlertCircle size={14} />
                            </div>
                          )}
                        </div>
                        {row.area && <span className="text-[10px] text-[#6E6E73] opacity-70 uppercase tracking-wider">{row.area}</span>}
                      </div>
                    </td>
                    <td 
                      className="open-day-table-cell--score-audit is-numeric"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAuditRow(row);
                      }}
                      title="点击查看测算推演实验室 (Audit Lab)"
                    >
                      <div className="open-day-audit-trigger">
                        <span className="open-day-audit-value">{formatNumber(row.score, 1)}</span>
                        
                        {baselineAnalysis && (() => {
                          const baselineRow = baselineAnalysis.results.find(br => br.name === row.name);
                          if (!baselineRow) return null;
                          const delta = row.score - baselineRow.score;
                          if (Math.abs(delta) < 0.05) return null;
                          return (
                            <span className={`open-day-delta-score ${delta > 0 ? 'is-plus' : 'is-minus'}`}>
                              {delta > 0 ? '+' : ''}{formatNumber(delta, 1)}
                            </span>
                          );
                        })()}

                        <Activity size={12} className="open-day-audit-icon" />
                      </div>
                    </td>
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
                    <td className="is-numeric">
                      <div className="open-day-data-bar" title={`规模基础分: ${formatNumber(row.scaleIdx, 1)}`}>
                        <div className="open-day-data-bar__bg" style={{ width: `${Math.min(100, Math.max(0, row.scaleIdx))}%` }} />
                        <span className="open-day-data-bar__value">{formatNumber(row.scaleIdx, 1)}</span>
                      </div>
                    </td>
                    <td className="is-numeric">
                      <div className="open-day-data-bar" title={`流量基础分: ${formatNumber(row.trafficIdx, 1)}`}>
                        <div className="open-day-data-bar__bg" style={{ width: `${Math.min(100, Math.max(0, row.trafficIdx))}%` }} />
                        <span className="open-day-data-bar__value">{formatNumber(row.trafficIdx, 1)}</span>
                      </div>
                    </td>
                    <td className="is-numeric">
                      <div className="open-day-data-bar" title={`货品质量分: ${formatNumber(row.productIdx, 1)}`}>
                        <div className="open-day-data-bar__bg" style={{ width: `${Math.min(100, Math.max(0, row.productIdx))}%` }} />
                        <span className="open-day-data-bar__value">{formatNumber(row.productIdx, 1)}</span>
                      </div>
                    </td>
                    <td className="is-numeric">
                      <div className="open-day-data-bar" title={`交互转化分: ${formatNumber(row.interactionIdx, 1)}`}>
                        <div className="open-day-data-bar__bg" style={{ width: `${Math.min(100, Math.max(0, row.interactionIdx))}%` }} />
                        <span className="open-day-data-bar__value">{formatNumber(row.interactionIdx, 1)}</span>
                      </div>
                    </td>
                    <td className="is-numeric">{formatNumber(row.transactions, 0)}</td>
                    <td className="is-numeric">{formatPercent(row.convRate, 2)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={12} className="open-day-table__empty">
                    <div className="open-day-table-empty-state">
                      <Search size={48} className="opacity-20" />
                      <p>未找到匹配 “{searchTerm}” 的结果</p>
                      <button className="open-day-button open-day-button--ghost open-day-button--sm" onClick={() => onSearchChange('')}>
                        清除搜索
                      </button>
                    </div>
                  </td>
                </tr>
              )
            ) : (
              <tr>
                <td colSpan={12} className="open-day-table__empty">
                  {isBootstrapping ? (
                    <div className="open-day-table-empty-state">
                      <RotateCw size={48} className="animate-spin" />
                      <p>正在初始化工作台...</p>
                    </div>
                  ) : (
                    <div className="open-day-table-empty-state">
                      <BarChart3 size={48} />
                      <p>{statusMessage}</p>
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
