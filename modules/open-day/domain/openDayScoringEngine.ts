import type {
  OpenDayAnalysisResponse,
  OpenDayScoreCommand,
} from './openDay.types.js';
import { resolveOpenDayScenarioDraft } from '../application/openDayScenarioDraft.js';
import { isEligibleOpenDayRow } from './openDayEligibilityPolicy.js';
import { normalizeOpenDayRows, validateMappings } from './openDayDatasetNormalizer.js';
import { evaluateOpenDayFormula, getOpenDayFormulaDefinition } from './openDayFormula.js';
import { resolveOpenDayWaterlineContext } from './openDayParameterResolver.js';
import { resolveOpenDayTier } from './openDayTierPolicy.js';

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function calculateRatio(value: number, waterline: number): number {
  if (waterline <= 0) {
    return value > 0 ? 1 : 0;
  }
  return value / waterline;
}

export function scoreOpenDayDataset(command: OpenDayScoreCommand): Omit<OpenDayAnalysisResponse, 'meta'> & {
  meta: Omit<OpenDayAnalysisResponse['meta'], 'cacheHit' | 'cacheKey' | 'configVersion'>;
} {
  validateMappings(command.mappings);

  const scenario = resolveOpenDayScenarioDraft(command);
  const mergedConfig = scenario.config;

  const normalizedRows = normalizeOpenDayRows(command.rows, command.mappings);
  const { waterlines, resolvedParameters } = resolveOpenDayWaterlineContext(normalizedRows, mergedConfig);
  const formula = getOpenDayFormulaDefinition(mergedConfig.formulaId);

  const scoredRows = normalizedRows.map((row) => {
    const scaleScore = clamp(calculateRatio(row.inventory, waterlines.I_cap));
    const trafficScore = clamp(Math.pow(calculateRatio(row.traffic, waterlines.V_cap), mergedConfig.alpha));
    const productScore = clamp(calculateRatio(row.premium, waterlines.H_cap));
    const interactionScore = clamp(calculateRatio(row.convRate, waterlines.R_cap));
    const formulaResult = evaluateOpenDayFormula(mergedConfig.formulaId, {
      scaleScore,
      trafficScore,
      productScore,
      interactionScore,
      weights: mergedConfig.weights,
    });
    const scaleIdx = Number((scaleScore * 100).toFixed(1));
    const trafficIdx = Number((trafficScore * 100).toFixed(1));
    const productIdx = Number((productScore * 100).toFixed(1));
    const interactionIdx = Number((interactionScore * 100).toFixed(1));
    const catalyst = Number((formulaResult.catalystScore * 100).toFixed(1));
    const rawScore = formulaResult.rawScore;
    const isEligible = isEligibleOpenDayRow(row, mergedConfig);

    // Logic Guard Scanning
    const logicGuardTags: string[] = [];
    let logicGuardSeverity: 'error' | 'warning' | null = null;

    // Rule 1: Ghost Transactions (Transactions > 0 but Traffic == 0)
    if (row.transactions > 0 && row.traffic === 0) {
      logicGuardTags.push('有成交无带看 (数据存在严重逻辑矛盾)');
      logicGuardSeverity = 'error';
    }

    // Rule 2: Hyper Conversion (convRate > 0.8)
    if (row.convRate > 0.8 && row.transactions > 0) {
      logicGuardTags.push('转化率异常高 (可能存在统计口径偏差)');
      logicGuardSeverity = logicGuardSeverity === 'error' ? 'error' : 'warning';
    }

    // Rule 3: Extreme Scale Outlier (Inventory > Avg * 5)
    // NOTE: For simplicity in this functional mapper, we'll use a fixed threshold or a more complex pass.
    // We'll stick to local rules for now.

    return {
      ...row,
      scaleIdx,
      trafficIdx,
      productIdx,
      interactionIdx,
      catalyst,
      rawScore,
      isEligible,
      logicGuardTags: logicGuardTags.length > 0 ? logicGuardTags : undefined,
      logicGuardSeverity,
    };
  });

  const eligibleRows = scoredRows.filter((row) => row.isEligible);

  const results = scoredRows
    .map((row) => {
      const score = row.isEligible ? row.rawScore : 0;
      const tier = resolveOpenDayTier(score, row.isEligible, mergedConfig.tierThresholds);

      return {
        ...row,
        score: Number(score.toFixed(1)),
        tierCode: tier.code,
        tierLabel: tier.label,
      };
    })
    .sort(
      (left, right) =>
        Number(right.isEligible) - Number(left.isEligible) ||
        right.score - left.score ||
        right.rawScore - left.rawScore,
    )
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }));

  return {
    meta: {
      totalCount: results.length,
      eligibleCount: eligibleRows.length,
      weights: mergedConfig.weights,
      skill: { id: formula.id, label: formula.label, description: formula.description },
      formula,
      scenario,
      waterlines,
      resolvedParameters,
      requestedConfig: mergedConfig,
    },
    results,
  };
}
