import { X, History, Save, RefreshCcw, Upload } from 'lucide-react';
import { HistoryPanel } from './HistoryPanel';
import type { 
  OpenDayAnalysisSnapshotSummary, 
  OpenDayScenarioTemplateSummary 
} from '../../../modules/open-day/domain/openDay.types.ts';
import './LibraryOverlay.css';

interface LibraryOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  // Scenario state
  scenarios: OpenDayScenarioTemplateSummary[];
  scenarioName: string;
  scenarioMessage: string;
  isSavingScenario: boolean;
  isLoadingScenario: string;
  activeScenarioTemplateId: string;
  onScenarioNameChange: (name: string) => void;
  onSaveScenario: () => void;
  onLoadScenario: (id: string) => void;
  // History state
  snapshots: OpenDayAnalysisSnapshotSummary[];
  activeSnapshotId?: string;
  onRefreshSnapshots: () => void;
  onReplaySnapshot: (id: string) => void;
}

export function LibraryOverlay({
  isOpen,
  onClose,
  scenarios,
  scenarioName,
  scenarioMessage,
  isSavingScenario,
  isLoadingScenario,
  activeScenarioTemplateId,
  onScenarioNameChange,
  onSaveScenario,
  onLoadScenario,
  snapshots,
  activeSnapshotId,
  onRefreshSnapshots,
  onReplaySnapshot,
}: LibraryOverlayProps) {
  if (!isOpen) return null;

  return (
    <>
      <div className="open-day-library-backdrop" onClick={onClose} />
      <aside className="open-day-library-drawer">
        <div className="open-day-library-header">
          <h2>
            <History className="text-emerald-700" size={20} />
            档案与方案库
          </h2>
          <button className="open-day-library-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="open-day-library-content">
          {/* Section: Scenario Management */}
          <section className="open-day-library-section">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2">
                <Save size={16} />
                测算方案
              </h3>
            </div>

            <div className="open-day-library-save-box mb-4">
              <input
                type="text"
                placeholder="方案名称..."
                className="open-day-library-input"
                value={scenarioName}
                onChange={(e) => onScenarioNameChange(e.target.value)}
              />
              <button
                type="button"
                className="open-day-button open-day-button--primary open-day-button--sm"
                onClick={onSaveScenario}
                disabled={isSavingScenario}
              >
                {isSavingScenario ? <RefreshCcw className="animate-spin" size={14} /> : <Save size={14} />}
                <span>保存当前配置</span>
              </button>
            </div>

            {scenarioMessage && (
              <div className={`open-day-scenario-msg mb-4 ${scenarioMessage.includes('失败') ? 'is-error' : 'is-success'}`}>
                {scenarioMessage}
              </div>
            )}

            <div className="open-day-library-grid">
              {scenarios.map((s) => (
                <div key={s.id} className={`open-day-library-item ${activeScenarioTemplateId === s.id ? 'is-active' : ''}`}>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{s.name}</div>
                    <div className="text-xs text-[#6E6E73] mt-1">{new Date(s.updatedAt).toLocaleDateString()}</div>
                  </div>
                  <button
                    type="button"
                    className="open-day-button open-day-button--secondary open-day-button--xs"
                    onClick={() => onLoadScenario(s.id)}
                    disabled={isLoadingScenario === s.id}
                  >
                    {isLoadingScenario === s.id ? <RefreshCcw className="animate-spin" size={12} /> : <Upload size={12} />}
                    <span>载入</span>
                  </button>
                </div>
              ))}
              {!scenarios.length && <div className="text-center py-8 text-sm text-[#6E6E73]">暂无方案</div>}
            </div>
          </section>

          <div className="open-day-library-divider" />

          {/* Section: History Snapshots */}
          <section className="open-day-library-section">
            <HistoryPanel
              snapshots={snapshots}
              activeSnapshotId={activeSnapshotId}
              onRefresh={onRefreshSnapshots}
              onReplay={onReplaySnapshot}
            />
          </section>
        </div>
      </aside>
    </>
  );
}
