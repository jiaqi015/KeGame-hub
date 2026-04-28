import { ChevronLeft, ChevronRight, RotateCw, Save, FileUp, Archive } from 'lucide-react';
import type {
  OpenDayAnalysisSnapshotSummary,
  OpenDayConfig,
  OpenDayParameterKey,
  OpenDayParameterPackage,
  OpenDayScenarioTemplateSummary,
} from '../../domain/openDay.types.ts';
import type { NormalizedOpenDayRow } from '../../domain/openDay.types.ts';
import { deriveOpenDayPercentileForValue } from '../../domain/openDayParameterResolver.js';
import { formatWaterlineValue } from '../openDayUtils';
import type { WaterlineDefinition } from '../openDayConstants';
import { DebouncedNumberInput } from './DebouncedNumberInput';
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
  onScenarioNameChange: (name: string) => void;
  onSaveScenario: () => void;
  onLoadScenario: (id: string) => void;
  onToggleLibrary: () => void;
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
  onToggleLibrary,
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
          {/* Library Entry */}
          <div className="open-day-sidebar-section">
            <button
              className="open-day-button open-day-button--secondary w-full justify-start px-3 py-2"
              onClick={onToggleLibrary}
            >
              <Archive size={16} className="text-emerald-700" />
              <span className="font-bold text-sm">个性化配置和测算历史</span>
            </button>
          </div>
          <div className="open-day-sidebar-divider" />
          {/* Presets */}
          <div className="open-day-sidebar-section">
            <h3>参数调整模式</h3>
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
            <h3>权重分布</h3>
            <div className="open-day-params-grid">
              <label>
                <span>带看幂等指数</span>
                <DebouncedNumberInput min={0} max={2} step={0.05} value={config.alpha}
                  onChange={(v) => onUpdateConfig((d) => { d.alpha = Math.max(0, v); })} />
              </label>
              <label>
                <span>好房指数权重</span>
                <DebouncedNumberInput min={0} max={1} step={0.05} value={config.weights.product}
                  onChange={(v) => onUpdateConfig((d) => { d.weights.product = Math.max(0, v); })} />
              </label>
              <label>
                <span>转化指数权重</span>
                <DebouncedNumberInput min={0} max={1} step={0.05} value={config.weights.interaction}
                  onChange={(v) => onUpdateConfig((d) => { d.weights.interaction = Math.max(0, v); })} />
              </label>
            </div>
          </div>

          {/* Hard Filters */}
          <div className="open-day-sidebar-section">
            <h3>达标线调整</h3>
            <div className="open-day-filter-row">
              <label>
                <span>最低在售</span>
                <DebouncedNumberInput min={0} step={1} value={config.hardFilters.min_inventory}
                  onChange={(v) => onUpdateConfig((d) => { d.hardFilters.min_inventory = Math.max(0, v); })} />
              </label>
              <label>
                <span>最低好房</span>
                <DebouncedNumberInput min={0} step={1} value={config.hardFilters.min_hq_rooms}
                  onChange={(v) => onUpdateConfig((d) => { d.hardFilters.min_hq_rooms = Math.max(0, v); })} />
              </label>
              <label>
                <span>最低成交</span>
                <DebouncedNumberInput min={0} step={1} value={config.hardFilters.min_transaction}
                  onChange={(v) => onUpdateConfig((d) => { d.hardFilters.min_transaction = Math.max(0, v); })} />
              </label>
            </div>
          </div>

            {/* Waterline Table */}
            <div className="open-day-sidebar-section">
              <h3>满分水位调整</h3>
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
                        <DebouncedNumberInput
                          min={1} max={99} step={1}
                          value={config.percentiles[def.key]}
                          disabled={config.waterlineMode === 'absolute'}
                          onChange={(v) => {
                            const val = Math.min(99, Math.max(1, v));
                            onUpdateConfig((d) => {
                              d.percentiles[def.key] = val;
                              if (d.waterlineOverrides?.[def.key] !== undefined) {
                                delete d.waterlineOverrides[def.key];
                              }
                            });
                          }}
                        />
                      </td>
                      <td>
                        <DebouncedNumberInput
                          min={0} step={Number(def.absoluteStep)}
                          value={formatWaterlineValue(String(def.key), Number(getDisplayedWaterlineValue(def.key)))}
                          disabled={config.waterlineMode === 'percentile'}
                          onChange={(v) => {
                            const val = Math.max(0, v);
                            onUpdateConfig((d) => {
                              if (d.waterlineMode === 'absolute') {
                                d.absolutes[def.key] = val;
                                d.percentiles[def.key] = Math.round(
                                  deriveOpenDayPercentileForValue(normalizedPreviewRows, def.key, val),
                                );
                                if (d.waterlineOverrides?.[def.key] !== undefined) {
                                  delete d.waterlineOverrides[def.key];
                                }
                                return;
                              }
                              d.waterlineOverrides = { ...(d.waterlineOverrides || {}), [def.key]: val };
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
        </div>
    </aside>
  );
}
