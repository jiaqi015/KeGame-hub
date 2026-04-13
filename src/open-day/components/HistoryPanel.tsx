import { Clock, RefreshCcw } from 'lucide-react';
import type { OpenDayAnalysisSnapshotSummary } from '../../../modules/open-day/domain/openDay.types.ts';
import { formatNumber, formatDateTime } from '../formatters';
import './HistoryPanel.css';

interface HistoryPanelProps {
  snapshots: OpenDayAnalysisSnapshotSummary[];
  activeSnapshotId?: string;
  onRefresh: () => void;
  onReplay: (id: string) => void;
}

export function HistoryPanel({ snapshots, activeSnapshotId, onRefresh, onReplay }: HistoryPanelProps) {
  return (
    <div className="open-day-sidebar-section">
      <div className="open-day-sidebar-section__header">
        <h3>3. 历史测算记录</h3>
        <button
          type="button"
          className="open-day-button open-day-button--ghost open-day-button--xs"
          onClick={onRefresh}
        >
          <RefreshCcw size={12} />
        </button>
      </div>
      <p className="open-day-sidebar-section__desc">查看并快速回放之前的测算方案，支持跨场景对标。</p>

      <div className="open-day-history-list">
        {snapshots.length > 0 ? (
          snapshots.map((item) => (
            <div
              key={item.id}
              className={`open-day-history-card ${activeSnapshotId === item.id ? 'is-active' : ''}`}
              onClick={() => onReplay(item.id)}
            >
              <div className="open-day-history-card__main">
                <Clock size={14} />
                <span className="open-day-history-card__time">{formatDateTime(item.createdAt)}</span>
                {item.scenarioTemplateId && <span className="open-day-scenario-tag">场景</span>}
              </div>
              <div className="open-day-history-card__stats">
                <strong>{item.championName}</strong>
                <span>{formatNumber(item.championScore, 1)} 分</span>
              </div>
            </div>
          ))
        ) : (
          <div className="open-day-history-empty">暂无相关历史记录</div>
        )}
      </div>
    </div>
  );
}
