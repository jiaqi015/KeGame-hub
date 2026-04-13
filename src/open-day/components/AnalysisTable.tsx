import { BarChart3, RefreshCcw, Search, X, AlertTriangle } from 'lucide-react';
import type { OpenDayAnalysisResponse, OpenDayAnalysisRow } from '../../../modules/open-day/domain/openDay.types.ts';
import type { DatasetQualityReport } from '../openDayConstants';
import { formatNumber, formatPercent } from '../formatters';
import './AnalysisTable.css';

interface AnalysisTableProps {
  analysis: OpenDayAnalysisResponse | null;
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
  onSearchChange: (term: string) => void;
  onRowClick: (row: OpenDayAnalysisRow) => void;
  onExecuteAnalysis: () => void;
}

export function AnalysisTable({
  analysis,
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
  onSearchChange,
  onRowClick,
  onExecuteAnalysis,
}: AnalysisTableProps) {
  return (
    <div className="open-day-main-card">
      {statusMessage ? (
        <div className={`open-day-status-card ${isAnalyzing ? 'is-loading' : ''} ${qualityReport?.invalidRows ? 'has-issue' : ''}`}>
          <div className="flex items-center gap-2">
            {qualityReport?.invalidRows ? <AlertTriangle size={16} className="text-amber-600" /> : null}
            <span>{statusMessage}</span>
          </div>
          {qualityReport?.invalidRows ? (
            <div className="open-day-status-hint">
              {qualityReport.invalidRows} 行数据存在不完整（已自动跳过或处理）
            </div>
          ) : null}
          {hasPendingChanges && !isAnalyzing && (
            <button
              type="button"
              className="open-day-button open-day-button--primary open-day-button--sm"
              onClick={onExecuteAnalysis}
              style={{ marginLeft: 'auto' }}
            >
              立即测算
            </button>
          )}
        </div>
      ) : null}

      <div className="open-day-table-controls">
        <div className="open-day-search-bar">
          <Search size={18} />
          <input
            type="text"
            placeholder="按楼盘名称搜索..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchTerm && (
            <button className="open-day-search-clear" onClick={() => onSearchChange('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="open-day-hero-card__stats">
          <div>
            <span>当前参数包</span>
            <strong>{currentParameterLabel}</strong>
          </div>
          <div>
            <span>当前公式</span>
            <strong>{currentFormulaLabel}</strong>
          </div>
          <div>
            <span>样本</span>
            <strong>{analysis?.meta.totalCount ?? sampleCount}</strong>
          </div>
          <div>
            <span>入围</span>
            <strong>{analysis ? `${analysis.meta.eligibleCount}/${analysis.meta.totalCount}` : '--'}</strong>
          </div>
        </div>
      </div>

      <div className={`open-day-table-wrap ${hasPendingChanges ? 'is-stale' : ''}`}>
        <table className="open-day-table">
          <thead>
            <tr>
              <th>排名</th>
              <th>大区</th>
              <th>小区</th>
              <th>综合分</th>
              <th>梯队</th>
              <th>状态</th>
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
              analysis.results
                .filter((row) => !searchTerm || row.name.toLowerCase().includes(searchTerm.toLowerCase()))
                .map((row) => (
                  <tr
                    key={`${row.rank}-${row.name}`}
                    className={activeRow?.name === row.name ? 'is-selected' : ''}
                    onClick={() => onRowClick(row)}
                  >
                    <td>
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
                    </td>
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
                    <td>
                      <div className="open-day-data-bar" title={`规模基础分: ${formatNumber(row.scaleIdx, 1)}`}>
                        <div className="open-day-data-bar__bg" style={{ width: `${Math.min(100, Math.max(0, row.scaleIdx))}%` }} />
                        <span className="open-day-data-bar__value">{formatNumber(row.scaleIdx, 1)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="open-day-data-bar" title={`流量基础分: ${formatNumber(row.trafficIdx, 1)}`}>
                        <div className="open-day-data-bar__bg" style={{ width: `${Math.min(100, Math.max(0, row.trafficIdx))}%` }} />
                        <span className="open-day-data-bar__value">{formatNumber(row.trafficIdx, 1)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="open-day-data-bar" title={`货品质量分: ${formatNumber(row.productIdx, 1)}`}>
                        <div className="open-day-data-bar__bg" style={{ width: `${Math.min(100, Math.max(0, row.productIdx))}%` }} />
                        <span className="open-day-data-bar__value">{formatNumber(row.productIdx, 1)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="open-day-data-bar" title={`交互转化分: ${formatNumber(row.interactionIdx, 1)}`}>
                        <div className="open-day-data-bar__bg" style={{ width: `${Math.min(100, Math.max(0, row.interactionIdx))}%` }} />
                        <span className="open-day-data-bar__value">{formatNumber(row.interactionIdx, 1)}</span>
                      </div>
                    </td>
                    <td>{formatNumber(row.transactions, 0)}</td>
                    <td>{formatPercent(row.convRate, 2)}</td>
                  </tr>
                ))
            ) : (
              <tr>
                <td colSpan={12} className="open-day-table__empty">
                  {isBootstrapping ? (
                    <div className="open-day-table-empty-state">
                      <RefreshCcw size={48} className="animate-spin" />
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
