import type { OpenDaySkillDefinition, OpenDayConfig } from '../../../modules/open-day/domain/openDay.types.ts';
import type { OpenDayResolvedParameter, OpenDayParameterKey } from '../../../modules/open-day/domain/openDay.types.ts';
import type { OpenDayScenarioDraft } from '../../../modules/open-day/domain/openDay.types.ts';
import './FormulaBar.css';

interface SkillBarProps {
  scenarioDraft: OpenDayScenarioDraft;
  config: OpenDayConfig;
  skills: OpenDaySkillDefinition[];
  waterlineDefinitions: { key: OpenDayParameterKey }[];
  getResolvedParameter: (key: OpenDayParameterKey) => OpenDayResolvedParameter | null;
  onSkillChange: (skillId: OpenDayConfig['formulaId']) => void;
  onWaterlineModeChange: (mode: OpenDayConfig['waterlineMode']) => void;
}

interface FormulaBarProps extends Omit<SkillBarProps, 'skills' | 'onSkillChange'> {
  formulas: OpenDaySkillDefinition[];
  onFormulaChange?: (formulaId: OpenDayConfig['formulaId']) => void;
}

export function SkillBar({
  scenarioDraft,
  config,
  skills,
  waterlineDefinitions,
  getResolvedParameter,
  onSkillChange,
  onWaterlineModeChange,
}: SkillBarProps) {
  return (
    <div className="open-day-formula-bar">
      <div className="open-day-formula-bar__select">
        <label>skill</label>
        <select
          value={scenarioDraft.skillId || scenarioDraft.formulaId}
          onChange={(event) => onSkillChange(event.target.value as OpenDayConfig['formulaId'])}
        >
          {skills.map((skill) => (
            <option key={skill.id} value={skill.id}>
              {skill.label}
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
          <option value="percentile">系统自动算水位</option>
          <option value="absolute">手动填写水位</option>
        </select>
      </div>

      <div className="open-day-formula-bar__divider" />

      <div className="open-day-formula-bar__math">
        <code>
          {(scenarioDraft.skillId || scenarioDraft.formulaId) === 'weighted_catalyst_v1' ? (
            <>综合得分 = (规模得分 × 流量得分) × (好房提权权重 + 转化率加成) × 100</>
          ) : (
            <>综合得分 = √(规模得分 × 流量衰减) × 好房门槛系数 × (基础权重 + 转化率加成) × 100</>
          )}
        </code>
      </div>
    </div>
  );
}

export function FormulaBar({
  formulas,
  onFormulaChange,
  ...rest
}: FormulaBarProps) {
  return (
    <SkillBar
      {...rest}
      skills={formulas}
      onSkillChange={(skillId) => onFormulaChange?.(skillId)}
    />
  );
}
