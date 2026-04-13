import { X } from 'lucide-react';
import type { OpenDayAnalysisRow, OpenDayConfig } from '../../../modules/open-day/domain/openDay.types.ts';
import { formatNumber, formatPercent } from '../formatters';
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
          <button className="open-day-drawer__close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="open-day-drawer__body">
          <div className="open-day-insight-section">
            <h3>综合诊断得分</h3>
            <div className="open-day-insight-card">
              <div className="open-day-insight-card__head">
                <span className="open-day-insight-card__title">综合算力表现</span>
                <span className="open-day-insight-card__score" style={{ fontSize: 24 }}>
                  {formatNumber(row.score, 1)}
                </span>
              </div>
              <p>
                {row.isEligible
                  ? '当前小区已达到入围红线标准，具备深度分析价值。'
                  : '未达到入围红线标准，建议优先补齐核心短板（如在售或成交量）。'}
              </p>
            </div>
          </div>

          <div className="open-day-insight-section">
            <h3>规模与流量底盘</h3>
            <div className="open-day-insight-card">
              <div className="open-day-insight-card__head">
                <span className="open-day-insight-card__title">动员规模基础分</span>
                <span className={`open-day-insight-card__score ${row.scaleIdx < 60 ? 'is-low' : ''}`}>
                  {formatNumber(row.scaleIdx, 1)} / 100
                </span>
              </div>
              <p>
                在售套数 {row.inventory} 套。
                {row.scaleIdx < 60 ? '属于低动员状态，场域热度可能不足。' : '动员情况良好，规模效应明显。'}
              </p>
            </div>

            <div className="open-day-insight-card">
              <div className="open-day-insight-card__head">
                <span className="open-day-insight-card__title">带看漏斗基础分</span>
                <span className={`open-day-insight-card__score ${row.trafficIdx < 60 ? 'is-low' : ''}`}>
                  {formatNumber(row.trafficIdx, 1)} / 100
                </span>
              </div>
              <p>
                带看量 {row.traffic} 次。
                {row.trafficIdx < 60 ? '带看流量低于标杆水平，建议提优房源曝光。' : '流量优势巨大，转化漏斗基础稳固。'}
              </p>
            </div>
          </div>

          <div className="open-day-insight-section">
            <h3>货品与交互质量加成</h3>
            <div className="open-day-insight-card">
              <div className="open-day-insight-card__head">
                <span className="open-day-insight-card__title">优质货品加成</span>
                <span className={`open-day-insight-card__score ${row.productIdx < 60 ? 'is-low' : ''}`}>
                  {formatNumber(row.productIdx, 1)} / 100
                </span>
              </div>
              <p>
                好房套数 {row.premium} 套。该资产类型占比当前预设权重 {formatPercent(config.weights.product, 0)}。
              </p>
            </div>

            <div className="open-day-insight-card">
              <div className="open-day-insight-card__head">
                <span className="open-day-insight-card__title">交互转化加成</span>
                <span className={`open-day-insight-card__score ${row.interactionIdx < 60 ? 'is-low' : ''}`}>
                  {formatNumber(row.interactionIdx, 1)} / 100
                </span>
              </div>
              <p>
                目前转化率 {formatPercent(row.convRate, 2)} (成交 {row.transactions} 单)。该互动效果占比预设权重{' '}
                {formatPercent(config.weights.interaction, 0)}。
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
