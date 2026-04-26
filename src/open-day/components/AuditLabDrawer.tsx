import { X, Activity, ChevronRight, Info, ShieldCheck, Zap, AlertTriangle, AlertOctagon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { OpenDayAnalysisRow, OpenDayConfig } from '../../../modules/open-day/domain/openDay.types.ts';
import { formatNumber } from '../formatters';
import './AuditLabDrawer.css';

interface AuditLabDrawerProps {
  row: OpenDayAnalysisRow;
  config: OpenDayConfig;
  onClose: () => void;
}

export function AuditLabDrawer({ row, config, onClose }: AuditLabDrawerProps) {
  const isGeometric = (config.skillId || config.formulaId) === 'geometric_catalyst_v2';
  const skillLabel = isGeometric ? '几何体量 + 商品门控' : '线性加权催化';
  
  // 指标映射关系
  const metrics = [
    { label: '规模 (Inventory)', raw: row.inventory, idx: row.scaleIdx, color: '#BF623B', icon: '🏠' },
    { label: '流量 (Traffic)', raw: row.traffic, idx: row.trafficIdx, color: '#37826D', icon: '👥' },
    { label: '货品 (Premium)', raw: row.premium, idx: row.productIdx, color: '#C35A20', icon: '📦' },
    { label: '转化 (Conversion)', raw: row.convRate, idx: row.interactionIdx, color: '#E57D3B', icon: '📈' },
  ];

  return (
    <div className="open-day-audit-overlay" onClick={onClose}>
      <motion.div 
        className="open-day-audit-drawer"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="open-day-audit-header">
          <div className="open-day-audit-header__title">
            <div className="open-day-audit-icon-wrap">
              <Activity size={20} />
            </div>
            <div>
              <h3>测算推演实验室</h3>
              <p>{row.name}</p>
            </div>
          </div>
          <button className="open-day-audit-close" onClick={onClose} aria-label="关闭实验室抽屉">
            <X size={20} />
          </button>
        </div>

        <div className="open-day-audit-content">
          {/* Section 1: Final Score Highlight */}
          <div className="open-day-audit-summary-card">
            <div className="open-day-audit-summary-score">
              <span className="label">综合评分</span>
              <span className="value">{row.score}</span>
            </div>
            <div className="open-day-audit-summary-divider" />
            <div className="open-day-audit-summary-tier">
              <span className="label">当前评级</span>
              <span className={`tier-code tier-${row.tierCode}`}>{row.tierCode}级</span>
              <span className="tier-label">{row.tierLabel}</span>
            </div>
          </div>

          {/* Section 2: Raw to Index (Normalization) */}
          <div className="open-day-audit-section">
            <div className="open-day-audit-section-header">
              <Info size={14} />
              <h4>Step 1: 指标归一化 (Raw → Index)</h4>
            </div>
            <div className="open-day-audit-metrics-grid">
              {metrics.map((m) => (
                <div key={m.label} className="open-day-audit-metric-card">
                  <div className="metric-info">
                    <span className="metric-icon">{m.icon}</span>
                    <span className="metric-label">{m.label}</span>
                  </div>
                  <div className="metric-math">
                    <span className="raw-val">{formatNumber(m.raw, m.label.includes('转化') ? 4 : 0)}</span>
                    <ChevronRight size={12} className="math-arrow" />
                    <span className="idx-val" style={{ color: m.color }}>{formatNumber(m.idx, 1)}</span>
                  </div>
                  <div className="metric-progress-wrap">
                    <div 
                      className="metric-progress-bar" 
                      style={{ width: `${m.idx}%`, backgroundColor: m.color }} 
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="open-day-audit-hint">※ 归一化逻辑：指标得分 = Clamp(原始值 / 水准线) * 100</p>
          </div>

          {/* Section 3: Formula Lab */}
          <div className="open-day-audit-section">
            <div className="open-day-audit-section-header">
              <Zap size={14} />
              <h4>Step 2: 测算引擎实验室 (Logic Engine)</h4>
            </div>
            
            <div className="open-day-audit-formula-box">
              <div className="formula-badge">测算技能：{skillLabel}</div>
              <div className="formula-visual">
                <div className="formula-node">
                  <span className="node-label">体量得分 (Volume)</span>
                  <span className="node-value">
                    {isGeometric 
                      ? `sqrt(${row.scaleIdx} * ${row.trafficIdx})` 
                      : `(${row.scaleIdx} * ${row.trafficIdx})`}
                  </span>
                </div>
                <div className="formula-operator">×</div>
                <div className="formula-node">
                  <span className="node-label">催化因子 (Catalyst)</span>
                  <span className="node-value">{row.catalyst}</span>
                </div>
                <div className="formula-operator">=</div>
                <div className="formula-node is-result">
                  <span className="node-label">原始总分</span>
                  <span className="node-value">{row.rawScore.toFixed(1)}</span>
                </div>
              </div>
              <p className="formula-desc">
                {isGeometric 
                  ? "采用几何平均计算体量，能有效抑制单一指标过大导致的权重倾斜。同时引入商品分作为门控乘子。" 
                  : "采用线性加权催化逻辑，规模与流量构成基础盘，商品与互动按预设权重产生线性加成。"}
              </p>
            </div>
          </div>

          {/* Section 4: Logic Guard & Quality Audit */}
          <div className="open-day-audit-section">
            <div className="open-day-audit-section-header">
              <ShieldCheck size={14} />
              <h4>Step 3: 数据质量与准入 (Logic Guard)</h4>
            </div>

            {row.logicGuardTags && (
              <div className={`open-day-audit-anomaly-list is-${row.logicGuardSeverity}`}>
                <div className="anomaly-header">
                  {row.logicGuardSeverity === 'error' ? <AlertOctagon size={16} /> : <AlertTriangle size={16} />}
                  <span>检测到数据逻辑异常</span>
                </div>
                <ul className="anomaly-tags">
                  {row.logicGuardTags.map((tag, idx) => (
                    <li key={idx}>• {tag}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className={`open-day-audit-guard-card ${row.isEligible ? 'is-passed' : 'is-failed'}`}>
              <div className="guard-status">
                {row.isEligible ? '✅ 已通过准入校验' : '❌ 未通过准入校验'}
              </div>
              <p className="guard-detail">
                {row.isEligible 
                  ? "该小区满足所有硬性配置要求（如最小库存、最小成交量等），测算结果有效。" 
                  : "由于未满足当前策略中的硬性过滤条件，该小区被判定为无效测算，综合分已强制归零。"}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
