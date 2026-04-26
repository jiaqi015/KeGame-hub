import type { OpenDaySkillDefinition, OpenDayConfig } from '../../domain/openDay.types.ts';
import type { OpenDayResolvedParameter, OpenDayParameterKey } from '../../domain/openDay.types.ts';
import type { OpenDayScenarioDraft } from '../../domain/openDay.types.ts';
import './FormulaBar.css';

interface SkillBarProps {
  scenarioDraft: OpenDayScenarioDraft;
  config: OpenDayConfig;
  skills: OpenDaySkillDefinition[];
  waterlineDefinitions: { key: OpenDayParameterKey }[];
  getResolvedParameter: (key: OpenDayParameterKey) => OpenDayResolvedParameter | null;
  onSkillChange: (skillId: OpenDayConfig['skillId']) => void;
  onWaterlineModeChange: (mode: OpenDayConfig['waterlineMode']) => void;
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
        <label>测算技能</label>
        <select
          value={scenarioDraft.skillId || scenarioDraft.formulaId}
          onChange={(event) => onSkillChange(event.target.value as OpenDayConfig['skillId'])}
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
          <option value="percentile">按分位自动对标</option>
          <option value="absolute">按固定数值设定</option>
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

export function FormulaBar(props: Omit<SkillBarProps, 'onSkillChange'> & {
  onFormulaChange?: (formulaId: OpenDayConfig['formulaId']) => void;
}) {
  const { onFormulaChange, ...rest } = props;
  return (
    <SkillBar
      {...rest}
      skills={rest.skills}
      onSkillChange={(skillId) => onFormulaChange?.(skillId)}
    />
  );
}
