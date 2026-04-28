import { useState } from 'react';
import { X, History, Save, RotateCw, FileUp, Trash2 } from 'lucide-react';
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
  isDeletingScenario: string;
  activeScenarioTemplateId: string;
  onScenarioNameChange: (name: string) => void;
  onSaveScenario: () => void;
  onLoadScenario: (id: string) => void;
  onDeleteScenario: (id: string) => void;
  // History state
  snapshots: OpenDayAnalysisSnapshotSummary[];
  activeSnapshotId?: string;
  baselineSnapshotId?: string;
  onRefreshSnapshots: () => void;
  onReplaySnapshot: (id: string) => void;
  onSetBaseline: (id: string) => void;
  onClearBaseline: () => void;
}

export function LibraryOverlay({
  isOpen,
  onClose,
  scenarios,
  scenarioName,
  scenarioMessage,
  isSavingScenario,
  isLoadingScenario,
  isDeletingScenario,
  activeScenarioTemplateId,
  onScenarioNameChange,
  onSaveScenario,
  onLoadScenario,
  onDeleteScenario,
  snapshots,
  activeSnapshotId,
  baselineSnapshotId,
  onRefreshSnapshots,
  onReplaySnapshot,
  onSetBaseline,
  onClearBaseline,
}: LibraryOverlayProps) {
  const [confirmingDeleteId, setConfirmingDeleteId] = useState('');

  if (!isOpen) return null;

  return (
    <>
      <div className="open-day-library-backdrop" onClick={onClose} aria-label="关闭个性化配置和测算历史" />
      <aside className="open-day-library-drawer">
        <div className="open-day-library-header">
          <h2>
            <History className="text-emerald-700" size={20} />
            个性化配置和测算历史
          </h2>
          <button className="open-day-library-close" onClick={onClose} aria-label="关闭个性化配置和测算历史">
            <X size={20} />
          </button>
        </div>

        <div className="open-day-library-content">
          {/* Section: Scenario Management */}
          <section className="open-day-library-section open-day-library-section--scenarios">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2">
                <Save size={16} />
                个性化参数模版保存
              </h3>
            </div>
            <p className="open-day-library-section-desc">
              保存当前参数、权重、水位和达标线，后续可一键载入复用。
            </p>

            <div className="open-day-library-save-box mb-4">
              <div className="open-day-library-name-field">
                <input
                  type="text"
                  placeholder="例如：4月浦东开放日｜标准参数｜高转化优先"
                  className="open-day-library-input"
                  value={scenarioName}
                  onChange={(e) => onScenarioNameChange(e.target.value)}
                />
                <p>建议按「时间/区域 + 测算目标 + 参数模式」命名，避免直接用原始文件名。</p>
              </div>
              <button
                type="button"
                className="open-day-button open-day-button--primary open-day-button--sm"
                onClick={onSaveScenario}
                disabled={isSavingScenario}
              >
                {isSavingScenario ? <RotateCw className="animate-spin" size={14} /> : <Save size={14} />}
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
                  <div className="open-day-library-item__actions">
                    {confirmingDeleteId === s.id ? (
                      <div className="open-day-library-delete-confirm">
                        <span>确认删除？</span>
                        <button
                          type="button"
                          className="open-day-library-delete-confirm__cancel"
                          onClick={() => setConfirmingDeleteId('')}
                          disabled={isDeletingScenario === s.id}
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          className="open-day-library-delete-confirm__danger"
                          onClick={() => {
                            onDeleteScenario(s.id);
                            setConfirmingDeleteId('');
                          }}
                          disabled={isDeletingScenario === s.id}
                        >
                          {isDeletingScenario === s.id ? <RotateCw className="animate-spin" size={12} /> : null}
                          删除
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="open-day-button open-day-button--secondary open-day-button--xs"
                          onClick={() => onLoadScenario(s.id)}
                          disabled={isLoadingScenario === s.id || isDeletingScenario === s.id}
                        >
                          {isLoadingScenario === s.id ? <RotateCw className="animate-spin" size={12} /> : <FileUp size={12} />}
                          <span>载入</span>
                        </button>
                        <button
                          type="button"
                          className="open-day-button open-day-button--secondary open-day-button--xs open-day-library-delete-button"
                          onClick={() => setConfirmingDeleteId(s.id)}
                          disabled={isLoadingScenario === s.id || isDeletingScenario === s.id}
                          aria-label={`删除方案 ${s.name}`}
                        >
                          {isDeletingScenario === s.id ? <RotateCw className="animate-spin" size={12} /> : <Trash2 size={12} />}
                          <span>删除</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {!scenarios.length && <div className="text-center py-8 text-sm text-[#6E6E73]">暂无方案</div>}
            </div>
          </section>

          <div className="open-day-library-divider" />

          {/* Section: History Snapshots */}
          <section className="open-day-library-section open-day-library-section--history">
            <HistoryPanel
              snapshots={snapshots}
              activeSnapshotId={activeSnapshotId}
              baselineSnapshotId={baselineSnapshotId}
              onRefresh={onRefreshSnapshots}
              onReplay={onReplaySnapshot}
              onSetBaseline={onSetBaseline}
              onClearBaseline={onClearBaseline}
            />
          </section>
        </div>
      </aside>
    </>
  );
}
