import { X } from 'lucide-react';
import type { OpenDayAnalysisRow, OpenDayConfig } from '../../../modules/open-day/domain/openDay.types.ts';
import { formatNumber, formatPercent } from '../formatters';
import { RadarChart } from './RadarChart';
import './InsightDrawer.css';

interface InsightDrawerProps {
  row: OpenDayAnalysisRow;
  config: OpenDayConfig;
  onClose: () => void;
}

export function InsightDrawer({ row, config, onClose }: InsightDrawerProps) {
  return (
    <>
      <div className="open-day-drawer-overlay" onClick={onClose} />
      <aside className="open-day-drawer">
        <div className="open-day-drawer__header">
          <h2>
            <span className={`open-day-tier__code open-day-tier__code--${row.tierCode}`}>
              {row.tierCode}
            </span>
            {row.name}
          </h2>
          <button className="open-day-drawer__close" onClick={onClose} aria-label="关闭洞察抽屉">
            <X size={20} />
          </button>
        </div>

        <div className="open-day-drawer__body">
          {/* Visual Profile */}
          <div className="open-day-insight-section">
            <h3 className="text-center">综合价值画像</h3>
            <RadarChart 
              data={{
                scale: row.scaleIdx,
                traffic: row.trafficIdx,
                product: row.productIdx,
                interaction: row.interactionIdx
              }} 
            />
            <div className="open-day-insight-card text-center">
              <span className="open-day-insight-card__score" style={{ fontSize: 32 }}>
                {formatNumber(row.score, 1)}
              </span>
              <p className="mt-1">
                {row.isEligible ? '达到入围红线，建议跟进。' : '未达标，核心指标有短板。'}
              </p>
            </div>
          </div>

          <div className="open-day-insight-section">
            <h3>底盘指标</h3>
            <div className="open-day-insight-card">
              <div className="open-day-insight-card__head">
                <span className="open-day-insight-card__title">规模基座</span>
                <span className={`open-day-insight-card__score ${row.scaleIdx < 60 ? 'is-low' : ''}`}>
                  {formatNumber(row.scaleIdx, 1)}
                </span>
              </div>
              <p>在售 {row.inventory} 套。{row.scaleIdx < 60 ? '热度可能不足。' : '规模优势明显。'}</p>
            </div>

            <div className="open-day-insight-card">
              <div className="open-day-insight-card__head">
                <span className="open-day-insight-card__title">带看漏斗</span>
                <span className={`open-day-insight-card__score ${row.trafficIdx < 60 ? 'is-low' : ''}`}>
                  {formatNumber(row.trafficIdx, 1)}
                </span>
              </div>
              <p>带看 {row.traffic} 次。{row.trafficIdx < 60 ? '流量低于标杆。' : '基础稳固。'}</p>
            </div>
          </div>

          <div className="open-day-insight-section">
            <h3>质量加成</h3>
            <div className="open-day-insight-card">
              <div className="open-day-insight-card__head">
                <span className="open-day-insight-card__title">货品加成</span>
                <span className={`open-day-insight-card__score ${row.productIdx < 60 ? 'is-low' : ''}`}>
                  {formatNumber(row.productIdx, 1)}
                </span>
              </div>
              <p>好房 {row.premium} 套 (权重 {formatPercent(config.weights.product, 0)})。</p>
            </div>

            <div className="open-day-insight-card">
              <div className="open-day-insight-card__head">
                <span className="open-day-insight-card__title">交互转化</span>
                <span className={`open-day-insight-card__score ${row.interactionIdx < 60 ? 'is-low' : ''}`}>
                  {formatNumber(row.interactionIdx, 1)}
                </span>
              </div>
              <p>成交 {row.transactions} 单 (权重 {formatPercent(config.weights.interaction, 0)})。</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
