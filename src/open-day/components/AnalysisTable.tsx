import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, BarChart3, RotateCw, Search, X, ShieldAlert, Expand, Shrink, FileDown, AlertCircle, LayoutDashboard } from 'lucide-react';
import { ScenarioDashboard } from './ScenarioDashboard';
import { ImpactNarrator } from './ImpactNarrator';
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
  const [showDashboard, setShowDashboard] = useState(true);
  const [viewMode, setViewMode] = useState<'property' | 'area'>('property');
  const selectedRowRef = useRef<HTMLTableRowElement>(null);
  const filteredRows = analysis?.results.filter((row) => 
    !searchTerm || row.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  // Aggregation Logic for Area View
  const areaAggregation = useMemo(() => {
    if (!analysis) return [];
    
    const areaMap: Record<string, {
      name: string;
      totalScore: number;
      count: number;
      sACount: number;
      eligibleCount: number;
      errorCount: number;
    }> = {};

    analysis.results.forEach(r => {
      const area = r.area || '未知区域';
      if (!areaMap[area]) {
        areaMap[area] = { name: area, totalScore: 0, count: 0, sACount: 0, eligibleCount: 0, errorCount: 0 };
      }
      areaMap[area].totalScore += r.score;
      areaMap[area].count++;
      if (r.tierCode === 'S' || r.tierCode === 'A') areaMap[area].sACount++;
      if (r.isEligible) areaMap[area].eligibleCount++;
      if (r.logicGuardSeverity === 'error') areaMap[area].errorCount++;
    });

    return Object.values(areaMap)
      .map((a, idx) => ({
        ...a,
        rank: idx + 1, // Will sort and re-rank
        avgScore: a.totalScore / a.count,
        qualityRatio: a.sACount / a.count,
        anomalyRate: a.errorCount / a.count
      }))
      .sort((v1, v2) => v2.avgScore - v1.avgScore)
      .map((a, idx) => ({ ...a, rank: idx + 1 }));
  }, [analysis]);

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
              className={`dashboard-toggle-btn ${showDashboard ? 'is-active' : ''}`}
              onClick={() => setShowDashboard(!showDashboard)}
              title={showDashboard ? '折叠看板' : '展开场景看板'}
            >
              <LayoutDashboard size={16} />
              <span>{showDashboard ? '隐藏概览' : '场景概览'}</span>
            </button>

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

      {analysis && baselineAnalysis && (
        <ImpactNarrator 
          analysis={analysis} 
          baseline={baselineAnalysis} 
        />
      )}

      <ScenarioDashboard 
        results={analysis?.results || []} 
        isVisible={showDashboard} 
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
      />

      <div className={`open-day-table-wrap ${hasPendingChanges ? 'is-stale' : ''} ${isAnalyzing ? 'is-analyzing' : ''}`}>
        {isAnalyzing && (
          <div className="open-day-table-loading-overlay">
            <RotateCw size={32} className="animate-spin text-emerald-700" />
            <span>正在精准测算...</span>
          </div>
        )}
        <table className="open-day-table">
          <thead>
            {viewMode === 'property' ? (
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
            ) : (
              <tr>
                <th>绩效排名</th>
                <th>大区名称</th>
                <th className="is-numeric">平均综合分</th>
                <th className="is-numeric">纳管小区数</th>
                <th className="is-numeric">入围率 (合规)</th>
                <th className="is-numeric">优质转化 (S/A率)</th>
                <th className="is-numeric">数据异常率</th>
                <th>战略地位</th>
              </tr>
            )}
          </thead>
          <tbody>
            {analysis ? (
              viewMode === 'property' ? (
                filteredRows.length > 0 ? (
                  <AnimatePresence mode="popLayout" initial={false}>
                    {filteredRows.map((row) => (
                      <motion.tr
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        key={`${row.name}`}
                        className={activeRow?.name === row.name ? 'is-selected' : ''}
                        ref={activeRow?.name === row.name ? selectedRowRef : null}
                        onClick={() => onRowClick(row)}
                        transition={{
                          layout: { duration: 0.4, type: "spring", stiffness: 200, damping: 25 },
                          opacity: { duration: 0.2 }
                        }}
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
                              const delta = baselineRow.rank - row.rank; 
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
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                ) : (
                  <tr>
                    <td colSpan={11} className="open-day-table__empty">
                      <div className="open-day-table-empty-state">
                        <Search size={48} className="opacity-20" />
                        <p>未找到匹配 “{searchTerm}” 的结果</p>
                      </div>
                    </td>
                  </tr>
                )
              ) : (
                /* Area Mode (Pivot) */
                areaAggregation.map((area) => (
                  <tr key={area.name} onClick={() => {
                    onSearchChange(area.name);
                    setViewMode('property');
                  }}>
                    <td>
                      <span className={`open-day-rank-chip ${area.rank <= 3 ? 'open-day-rank-chip--gold' : ''}`}>
                        #{area.rank}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm font-bold text-indigo-600 underline underline-offset-4 cursor-pointer">
                        {area.name}
                      </span>
                    </td>
                    <td className="is-numeric font-bold text-indigo-600">
                      {formatNumber(area.avgScore, 1)}
                    </td>
                    <td className="is-numeric">{area.count}</td>
                    <td className="is-numeric">
                      <div className="flex items-center justify-end gap-2">
                        <span>{formatPercent(area.eligibleCount / area.count, 0)}</span>
                        <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${(area.eligibleCount / area.count) * 100}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="is-numeric">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-indigo-600 font-bold">{formatPercent(area.qualityRatio, 0)}</span>
                        <div className="w-12 h-1.5 bg-indigo-50 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500" style={{ width: `${area.qualityRatio * 100}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="is-numeric">
                      <span className={area.anomalyRate > 0.1 ? 'text-rose-600 font-bold' : 'text-gray-500'}>
                        {formatPercent(area.anomalyRate, 1)}
                      </span>
                    </td>
                    <td>
                      {area.avgScore > 85 ? (
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded border border-indigo-100 uppercase">
                          Strategic Alpha
                        </span>
                      ) : area.qualityRatio > 0.5 ? (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded border border-emerald-100 uppercase">
                          Quality Hub
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-gray-50 text-gray-400 text-[10px] font-bold rounded border border-gray-100 uppercase">
                          Neutral
                        </span>
                      )}
                    </td>
                  </tr>
                ))
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
