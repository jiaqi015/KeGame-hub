import type { OpenDayFormulaDefinition, OpenDayConfig } from '../../../modules/open-day/domain/openDay.types.ts';
import type { OpenDayResolvedParameter, OpenDayParameterKey } from '../../../modules/open-day/domain/openDay.types.ts';
import type { OpenDayScenarioDraft } from '../../../modules/open-day/domain/openDay.types.ts';
import './FormulaBar.css';

interface FormulaBarProps {
  scenarioDraft: OpenDayScenarioDraft;
  config: OpenDayConfig;
  formulas: OpenDayFormulaDefinition[];
  waterlineDefinitions: { key: OpenDayParameterKey }[];
  getResolvedParameter: (key: OpenDayParameterKey) => OpenDayResolvedParameter | null;
  onFormulaChange: (formulaId: OpenDayConfig['formulaId']) => void;
  onWaterlineModeChange: (mode: OpenDayConfig['waterlineMode']) => void;
}

export function FormulaBar({
  scenarioDraft,
  config,
  formulas,
  waterlineDefinitions,
  getResolvedParameter,
  onFormulaChange,
  onWaterlineModeChange,
}: FormulaBarProps) {
  return (
    <div className="open-day-formula-bar">
      <div className="open-day-formula-bar__select">
        <label>核心公式</label>
        <select
          value={scenarioDraft.formulaId}
          onChange={(event) => onFormulaChange(event.target.value as OpenDayConfig['formulaId'])}
        >
          {formulas.map((formula) => (
            <option key={formula.id} value={formula.id}>
              {formula.label}
            </option>
          ))}
        </select>
      </div>

      <div className="open-day-formula-bar__divider" />

      <div className="open-day-formula-bar__select">
        <label>水位基准</label>
        <select
          value={config.waterlineMode}
          onChange={(event) => {
            const nextMode = event.target.value as OpenDayConfig['waterlineMode'];
            onWaterlineModeChange(nextMode);
          }}
        >
          <option value="percentile">按分位自动对标</option>
          <option value="absolute">按固定数值设定</option>
        </select>
      </div>

      <div className="open-day-formula-bar__divider" />

      <div className="open-day-formula-bar__math">
        <code>
          {scenarioDraft.formulaId === 'weighted_catalyst_v1' ? (
            <>综合得分 = (规模得分 × 流量得分) × (好房提权权重 + 转化率加成) × 100</>
          ) : (
            <>综合得分 = √(规模得分 × 流量衰减) × 好房门槛系数 × (基础权重 + 转化率加成) × 100</>
          )}
        </code>
      </div>
    </div>
  );
}
