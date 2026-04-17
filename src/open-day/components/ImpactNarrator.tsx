import { TrendingUp, TrendingDown, Info, Zap } from 'lucide-react';
import type { OpenDayAnalysisResponse } from '../../../modules/open-day/domain/openDay.types.ts';
import './ImpactNarrator.css';

interface ImpactNarratorProps {
  analysis: OpenDayAnalysisResponse;
  baseline: OpenDayAnalysisResponse;
}

export function ImpactNarrator({ analysis, baseline }: ImpactNarratorProps) {
  // Logic to find biggest movers
  const movers = analysis.results.map(row => {
    const baseRow = baseline.results.find(br => br.name === row.name);
    return {
      name: row.name,
      area: row.area,
      delta: baseRow ? baseRow.rank - row.rank : 0, // positive means rank improved
      currentRank: row.rank
    };
  }).filter(m => m.delta !== 0)
    .sort((a, b) => b.delta - a.delta);

  const topGainer = movers[0];
  const topLoser = [...movers].reverse()[0];

  if (!topGainer && !topLoser) return null;

  return (
    <div className="open-day-impact-narrator">
      <div className="narrator-header">
        <Zap size={14} className="text-amber-500" />
        <span>测算策略影响分析</span>
      </div>
      
      <div className="narrator-content">
        {topGainer && topGainer.delta > 0 && (
          <div className="narrator-item">
            <TrendingUp size={14} className="text-emerald-500" />
            <p>
              <strong>{topGainer.name}</strong> 表现最为亮眼，排名上升了 <strong>{topGainer.delta}</strong> 位，目前跃升至第 <strong>#{topGainer.currentRank}</strong>。
            </p>
          </div>
        )}

        {topLoser && topLoser.delta < 0 && (
          <div className="narrator-item">
            <TrendingDown size={14} className="text-rose-500" />
            <p>
              <strong>{topLoser.name}</strong> 受本次策略调整影响较大，排名下滑了 <strong>{Math.abs(topLoser.delta)}</strong> 位。
            </p>
          </div>
        )}

        <div className="narrator-footer">
          <Info size={12} />
          <span>对比基准测算结果，本次变动主要体现了权重分配对特定区域的导向作用。</span>
        </div>
      </div>
    </div>
  );
}
