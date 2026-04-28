import { useMemo, type FC } from 'react';
import { TrendingUp, Flag, GitCompare } from 'lucide-react';
import type { OpenDayAnalysisRow, OpenDayHardFilters, OpenDayTierThresholds } from '../../../modules/open-day/domain/openDay.types.ts';
import './ScenarioDashboard.css';

interface ScenarioDashboardProps {
  results: OpenDayAnalysisRow[];
  hardFilters?: OpenDayHardFilters;
  tierThresholds?: OpenDayTierThresholds;
  isVisible: boolean;
  viewMode: 'property' | 'area';
  onToggleViewMode: (mode: 'property' | 'area') => void;
}

export const ScenarioDashboard: FC<ScenarioDashboardProps> = ({ results, hardFilters, tierThresholds, isVisible, viewMode, onToggleViewMode }) => {
  // 1. Tier Distribution
  const tierStats = useMemo(() => {
    const counts = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    results.forEach(r => {
      if (r.tierCode in counts) {
        const tier = r.tierCode as keyof typeof counts;
        counts[tier] += 1;
      }
    });
    return counts;
  }, [results]);

  // 2. Regional Leaderboard
  const regionalStats = useMemo(() => {
    const areaMap: Record<string, { totalScore: number; count: number }> = {};
    results.forEach(r => {
      const area = r.area || '未知区域';
      if (!areaMap[area]) areaMap[area] = { totalScore: 0, count: 0 };
      areaMap[area].totalScore += r.score;
      areaMap[area].count++;
    });

    return Object.entries(areaMap)
      .map(([name, stats]) => ({
        name,
        avgScore: stats.totalScore / stats.count,
        count: stats.count
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 5);
  }, [results]);

  const total = results.length;
  const tierEntries = Object.entries(tierStats) as Array<[string, number]>;
  const qualifiedTierEntries = tierEntries.filter(([tier]) => tier !== 'D');
  const qualifiedTierTotal = qualifiedTierEntries.reduce((sum, [, count]) => sum + count, 0);
  const eligibleCount = results.filter((row) => row.isEligible).length;
  const tierRuleRows = [
    ['S', `达标且分数 ≥ ${tierThresholds?.s ?? '—'}`],
    ['A', `达标且分数 ≥ ${tierThresholds?.a ?? '—'}`],
    ['B', `达标且分数 ≥ ${tierThresholds?.b ?? '—'}`],
    ['C', `达标且分数 ≥ ${tierThresholds?.c ?? '—'}`],
  ];

  if (!isVisible || !results.length) return null;

  return (
    <div className="open-day-scenario-dashboard">
      {/* Tier Distribution Section */}
      <div className="dashboard-item is-tier-split">
        <div className="dashboard-item-header">
          <TrendingUp size={14} />
          <span>达标梯度画像</span>
        </div>
        <div className="tier-ratio-track">
          {qualifiedTierEntries.map(([tier, count]) => {
            if (count === 0) return null;
            const width = qualifiedTierTotal > 0 ? (count / qualifiedTierTotal) * 100 : 0;
            return (
              <div
                key={tier}
                className={`tier-segment is-${tier}`}
                style={{ width: `${width}%` }}
                title={`${tier}级: ${count}个 (${Math.round(width)}%)`}
              >
                <span className="segment-label">{tier}</span>
              </div>
            );
          })}
        </div>
        <div className="tier-legend">
          {qualifiedTierEntries.map(([tier, count]) => (
            <div key={tier} className="legend-item">
              <span className={`dot is-${tier}`} />
              <span className="label">{tier}:</span>
              <span className="value">{count}</span>
            </div>
          ))}
        </div>
        <div className="tier-eligibility-rule">
          <strong>达标口径</strong>
          <span>
            在售 ≥ {hardFilters?.min_inventory ?? '—'} · 好房 ≥ {hardFilters?.min_hq_rooms ?? '—'} · 成交 ≥ {hardFilters?.min_transaction ?? '—'}
          </span>
          <em>{eligibleCount}/{total} 达标</em>
        </div>
        <div className="tier-grade-rule">
          <strong>梯队口径</strong>
          <div>
            {tierRuleRows.map(([tier, rule]) => (
              <span key={tier}>
                <b>{tier}</b>{rule}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard-item is-regions">
        <div className="dashboard-item-header">
          <div className="header-left">
            <Flag size={14} />
            <span>大区对比</span>
          </div>
          <button
            className={`pivot-toggle-trigger ${viewMode === 'area' ? 'is-active' : ''}`}
            onClick={() => onToggleViewMode(viewMode === 'area' ? 'property' : 'area')}
            title={viewMode === 'area' ? '返回小区列表' : '进入大区透视模式'}
          >
            <GitCompare size={14} />
            <span>按照大区查看，可下钻</span>
          </button>
        </div>
        <div className="region-list">
          {regionalStats.map((reg, idx) => (
            <div key={reg.name} className="region-card">
              <div className="region-rank">#{idx + 1}</div>
              <div className="region-info">
                <div className="region-name">{reg.name}</div>
                <div className="region-meta">{reg.count} 小区</div>
              </div>
              <div className="region-score">{reg.avgScore.toFixed(1)}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
