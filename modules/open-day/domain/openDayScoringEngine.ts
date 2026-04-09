import type {
  OpenDayAnalysisResponse,
  OpenDayConfig,
  OpenDayScoreCommand,
} from './openDay.types.js';
import { defaultOpenDayConfig, mergeOpenDayConfig, normalizeWeights } from '../application/openDayConfig.js';
import { isEligibleOpenDayRow } from './openDayEligibilityPolicy.js';
import { normalizeOpenDayRows, validateMappings } from './openDayDatasetNormalizer.js';
import { evaluateOpenDayFormula } from './openDayFormula.js';
import { resolveOpenDayTier } from './openDayTierPolicy.js';
import { resolveOpenDayWaterlines } from './openDayWaterlineResolver.js';

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function scoreOpenDayDataset(command: OpenDayScoreCommand): Omit<OpenDayAnalysisResponse, 'meta'> & {
  meta: Omit<OpenDayAnalysisResponse['meta'], 'cacheHit' | 'cacheKey' | 'configVersion'>;
} {
  validateMappings(command.mappings);

  const mergedConfig = mergeOpenDayConfig(defaultOpenDayConfig, command.config) as OpenDayConfig;
  mergedConfig.alpha = Math.max(0, Number(mergedConfig.alpha) || defaultOpenDayConfig.alpha);
  mergedConfig.weights = normalizeWeights(mergedConfig.weights);

  const normalizedRows = normalizeOpenDayRows(command.rows, command.mappings);
  const waterlines = resolveOpenDayWaterlines(normalizedRows, mergedConfig);

  const scoredRows = normalizedRows.map((row) => {
    const scaleScore = clamp(row.inventory / Math.max(waterlines.I_cap, 0.00001));
    const trafficScore = clamp(Math.pow(row.traffic / Math.max(waterlines.V_cap, 0.00001), mergedConfig.alpha));
    const productScore = clamp(row.premium / Math.max(waterlines.H_cap, 0.00001));
    const interactionScore = clamp(row.convRate / Math.max(waterlines.R_cap, 0.00001));
    const formulaResult = evaluateOpenDayFormula(mergedConfig.formulaId, {
      scaleScore,
      trafficScore,
      productScore,
      interactionScore,
      weights: mergedConfig.weights,
    });
    const scaleIdx = scaleScore * 100;
    const trafficIdx = trafficScore * 100;
    const productIdx = productScore * 100;
    const interactionIdx = interactionScore * 100;
    const catalyst = formulaResult.catalystScore * 100;
    const rawScore = formulaResult.rawScore;
    const isEligible = isEligibleOpenDayRow(row, mergedConfig);

    return {
      ...row,
      scaleIdx,
      trafficIdx,
      productIdx,
      interactionIdx,
      catalyst,
      rawScore,
      isEligible,
    };
  });

  const eligibleRows = scoredRows.filter((row) => row.isEligible);

  const results = scoredRows
    .map((row) => {
      const score = row.isEligible ? row.rawScore : 0;
      const tier = resolveOpenDayTier(score, row.isEligible);

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
      waterlines,
      requestedConfig: mergedConfig,
    },
    results,
  };
}
