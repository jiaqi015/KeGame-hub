import { ChevronLeft, ChevronRight, RefreshCcw, Save, Upload } from 'lucide-react';
import type {
  OpenDayAnalysisSnapshotSummary,
  OpenDayConfig,
  OpenDayParameterKey,
  OpenDayParameterPackage,
  OpenDayScenarioTemplateSummary,
} from '../../../modules/open-day/domain/openDay.types.ts';
import type { NormalizedOpenDayRow } from '../../../modules/open-day/domain/openDay.types.ts';
import { deriveOpenDayPercentileForValue } from '../../../modules/open-day/domain/openDayParameterResolver.js';
import { HistoryPanel } from './HistoryPanel';
import type { WaterlineDefinition } from '../openDayConstants';
import './SidebarConfig.css';

interface SidebarConfigProps {
  config: OpenDayConfig;
  parameterPackages: OpenDayParameterPackage[];
  activeParameterPackageId: string;
  waterlineDefinitions: WaterlineDefinition[];
  normalizedPreviewRows: NormalizedOpenDayRow[];
  displayedSnapshots: OpenDayAnalysisSnapshotSummary[];
  activeSnapshotId?: string;
  isSidebarCollapsed: boolean;
  // Scenario state
  scenarios: OpenDayScenarioTemplateSummary[];
  scenarioName: string;
  scenarioMessage: string;
  isSavingScenario: boolean;
  isLoadingScenario: string;
  activeScenarioTemplateId: string;
  getDisplayedWaterlineValue: (key: OpenDayParameterKey) => number;
  onToggleCollapsed: () => void;
  onApplyPreset: (presetId: string) => void;
  onUpdateConfig: (mutator: (draft: OpenDayConfig) => void) => void;
  onRestoreDefaults: () => void;
  onRefreshSnapshots: () => void;
  onReplaySnapshot: (id: string) => void;
  // Scenario handlers
  onScenarioNameChange: (name: string) => void;
  onSaveScenario: () => void;
  onLoadScenario: (id: string) => void;
}

export function SidebarConfig({
  config,
  parameterPackages,
  activeParameterPackageId,
  waterlineDefinitions,
  normalizedPreviewRows,
  displayedSnapshots,
  activeSnapshotId,
  isSidebarCollapsed,
  scenarios,
  scenarioName,
  scenarioMessage,
  isSavingScenario,
  isLoadingScenario,
  activeScenarioTemplateId,
  getDisplayedWaterlineValue,
  onToggleCollapsed,
  onApplyPreset,
  onUpdateConfig,
  onRestoreDefaults,
  onRefreshSnapshots,
  onReplaySnapshot,
  onScenarioNameChange,
  onSaveScenario,
  onLoadScenario,
}: SidebarConfigProps) {
  return (
    <aside className="open-day-sidebar">
      <button
        type="button"
        className="open-day-sidebar-toggle"
        onClick={onToggleCollapsed}
        title={isSidebarCollapsed ? '展开配置面板' : '收起配置面板'}
      >
        {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <div className="open-day-sidebar-scrollable">
        <div className="open-day-sidebar-card">
          {/* Presets */}
          <div className="open-day-sidebar-section">
            <h3>1. 测算场景模型</h3>
            <p className="open-day-sidebar-section__desc">根据业务重心选择预设模型，系统将自动调整权重与基准水位。</p>
            <div className="open-day-preset-grid">
              {parameterPackages.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`open-day-preset-card ${activeParameterPackageId === preset.id ? 'is-active' : ''}`}
                  onClick={() => onApplyPreset(preset.id)}
                >
                  <strong>{preset.label}</strong>
                  <span>{preset.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Core Weights */}
          <div className="open-day-sidebar-section">
            <h3>2. 核心权重调整</h3>
            <div className="open-day-params-grid">
              <label>
                <span>带看敏感指数 (Alpha)</span>
                <input type="number" min="0" max="2" step="0.05" value={config.alpha}
                  onChange={(e) => onUpdateConfig((d) => { d.alpha = Math.max(0, Number(e.target.value) || 0); })} />
              </label>
              <label>
                <span>商品权重</span>
                <input type="number" min="0" max="1" step="0.05" value={config.weights.product}
                  onChange={(e) => onUpdateConfig((d) => { d.weights.product = Math.max(0, Number(e.target.value) || 0); })} />
              </label>
              <label>
                <span>互动权重</span>
                <input type="number" min="0" max="1" step="0.05" value={config.weights.interaction}
                  onChange={(e) => onUpdateConfig((d) => { d.weights.interaction = Math.max(0, Number(e.target.value) || 0); })} />
              </label>
            </div>

            <div className="open-day-filter-row">
              <label>
                <span>最低在售</span>
                <input type="number" min="0" step="1" value={config.hardFilters.min_inventory}
                  onChange={(e) => onUpdateConfig((d) => { d.hardFilters.min_inventory = Math.max(0, Number(e.target.value) || 0); })} />
              </label>
              <label>
                <span>最低好房</span>
                <input type="number" min="0" step="1" value={config.hardFilters.min_hq_rooms}
                  onChange={(e) => onUpdateConfig((d) => { d.hardFilters.min_hq_rooms = Math.max(0, Number(e.target.value) || 0); })} />
              </label>
              <label>
                <span>最低成交</span>
                <input type="number" min="0" step="1" value={config.hardFilters.min_transaction}
                  onChange={(e) => onUpdateConfig((d) => { d.hardFilters.min_transaction = Math.max(0, Number(e.target.value) || 0); })} />
              </label>
            </div>

            {/* Waterline Table */}
            <div className="open-day-sidebar-section">
              <h3>3. 测算基准线</h3>
              <table className="open-day-waterline-table">
                <thead>
                  <tr>
                    <th>指标</th>
                    <th>分位 (%)</th>
                    <th>固定值</th>
                  </tr>
                </thead>
                <tbody>
                  {waterlineDefinitions.map((def) => (
                    <tr key={def.key}>
                      <td>{def.title.replace('基准', '')}</td>
                      <td>
                        <input
                          type="number" min="1" max="99" step="1"
                          value={config.percentiles[def.key]}
                          disabled={config.waterlineMode === 'absolute'}
                          onChange={(e) => {
                            const v = Math.min(99, Math.max(1, Number(e.target.value) || 1));
                            onUpdateConfig((d) => {
                              d.percentiles[def.key] = v;
                              if (d.waterlineOverrides?.[def.key] !== undefined) {
                                delete d.waterlineOverrides[def.key];
                              }
                            });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number" min="0" step={def.absoluteStep}
                          value={Number(getDisplayedWaterlineValue(def.key)).toFixed(def.absoluteStep.includes('.') ? def.absoluteStep.split('.')[1].length : 0)}
                          disabled={config.waterlineMode === 'percentile'}
                          onChange={(e) => {
                            const v = Math.max(0, Number(e.target.value) || 0);
                            onUpdateConfig((d) => {
                              if (d.waterlineMode === 'absolute') {
                                d.absolutes[def.key] = v;
                                d.percentiles[def.key] = Math.round(
                                  deriveOpenDayPercentileForValue(normalizedPreviewRows, def.key, v),
                                );
                                if (d.waterlineOverrides?.[def.key] !== undefined) {
                                  delete d.waterlineOverrides[def.key];
                                }
                                return;
                              }
                              d.waterlineOverrides = { ...(d.waterlineOverrides || {}), [def.key]: v };
                            });
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" className="open-day-button open-day-button--ghost" onClick={onRestoreDefaults}>
                恢复默认
              </button>
            </div>
          </div>

          {/* Scenario Management */}
          <div className="open-day-sidebar-section">
            <h3>4. 测算方案管理</h3>
            <p className="open-day-sidebar-section__desc">保存当前的参数配置为方案，方便后续一键载入数据快速复测。</p>

            <div className="open-day-scenario-save-box">
              <input
                type="text"
                placeholder="输入方案名称..."
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
                <span>保存方案</span>
              </button>
            </div>

            {scenarioMessage && (
              <div className={`open-day-scenario-msg ${scenarioMessage.includes('失败') ? 'is-error' : 'is-success'}`}>
                {scenarioMessage}
              </div>
            )}

            <div className="open-day-scenario-list">
              {scenarios.map((s) => (
                <div key={s.id} className={`open-day-scenario-item ${activeScenarioTemplateId === s.id ? 'is-active' : ''}`}>
                  <div className="open-day-scenario-item__info">
                    <strong>{s.name}</strong>
                    <span>{new Date(s.updatedAt).toLocaleDateString()}</span>
                  </div>
                  <button
                    type="button"
                    className="open-day-button open-day-button--ghost open-day-button--xs"
                    onClick={() => onLoadScenario(s.id)}
                    disabled={isLoadingScenario === s.id}
                  >
                    {isLoadingScenario === s.id ? <RefreshCcw className="animate-spin" size={12} /> : <Upload size={12} />}
                  </button>
                </div>
              ))}
              {!scenarios.length && <div className="open-day-scenario-empty">暂无保存的方案</div>}
            </div>
          </div>

          {/* History */}
          <HistoryPanel
            snapshots={displayedSnapshots}
            activeSnapshotId={activeSnapshotId}
            onRefresh={onRefreshSnapshots}
            onReplay={onReplaySnapshot}
          />
        </div>
      </div>
    </aside>
  );
}
