/**
 * Runtime validation for canonical legacy compatibility contracts.
 *
 * Promotes LegacyCanonicalCaseLike/OpportunityLike/GameStateLike from
 * type-only boundaries to runtime-checked adapter boundary contracts.
 *
 * Pure functions — no domain/runtime/application imports.
 * Deterministic: same input → same validation result.
 */

import type {
  LegacyCanonicalCaseLike,
  LegacyCanonicalOpportunityLike,
  LegacyCanonicalGameStateLike,
} from './legacyCompatibilityContracts.js';

// ---------------------------------------------------------------------------
// Validation result types
// ---------------------------------------------------------------------------

export interface CompatibilityValidationIssue {
  readonly path: string;
  readonly expected: string;
  readonly actualKind: string;
  readonly actualValue: string;
  readonly severity: 'error' | 'warning';
}

export interface CompatibilityValidationResult {
  readonly ok: boolean;
  readonly issues: readonly CompatibilityValidationIssue[];
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export function validateLegacyCanonicalCaseLike(input: unknown): CompatibilityValidationResult {
  const issues: CompatibilityValidationIssue[] = [];

  if (!input || typeof input !== 'object') {
    return { ok: false, issues: [issue('', 'object', typeof input, String(input), 'error')] };
  }

  const obj = input as Record<string, unknown>;

  // Required string IDs
  requireNonEmptyString(obj, 'id', issues);
  requireNonEmptyString(obj, 'housePrototypeId', issues, 'warning');
  requireNonEmptyString(obj, 'title', issues, 'warning');
  requireNonEmptyString(obj, 'community', issues, 'warning');
  requireNonEmptyString(obj, 'district', issues, 'warning');
  requireNonEmptyString(obj, 'layout', issues, 'warning');
  requireNonEmptyString(obj, 'status', issues);
  requireNonEmptyString(obj, 'stageLabel', issues, 'warning');
  requireNonEmptyString(obj, 'storylineState', issues);
  requireNonEmptyString(obj, 'ownerArchetypeId', issues, 'warning');
  requireNonEmptyString(obj, 'ownerName', issues, 'warning');
  requireNonEmptyString(obj, 'ownerMood', issues, 'warning');
  requireNonEmptyString(obj, 'personality', issues, 'warning');
  requireNonEmptyString(obj, 'maintainerName', issues, 'warning');
  requireNonEmptyString(obj, 'marketCellId', issues, 'warning');

  // Required finite numeric fields
  requireFiniteNumber(obj, 'area', issues);
  requireFiniteNumber(obj, 'askPrice', issues);
  requireFiniteNumber(obj, 'marketPrice', issues);
  requireFiniteNumber(obj, 'bottomPrice', issues);
  requireFiniteNumber(obj, 'lastAskPrice', issues);
  requireFiniteNumber(obj, 'priceGapPct', issues);
  requireFiniteNumber(obj, 'heat', issues);
  requireFiniteNumber(obj, 'stageIndex', issues);
  requireFiniteNumber(obj, 'viewings', issues);
  requireFiniteNumber(obj, 'offers', issues);
  requireFiniteNumber(obj, 'trust', issues);
  requireFiniteNumber(obj, 'patience', issues);
  requireFiniteNumber(obj, 'urgency', issues);
  requireFiniteNumber(obj, 'windowDays', issues);
  requireFiniteNumber(obj, 'competitiveness', issues);
  requireFiniteNumber(obj, 'qualityStory', issues);
  requireFiniteNumber(obj, 'negotiationBonus', issues);
  requireFiniteNumber(obj, 'actionsToday', issues);
  requireFiniteNumber(obj, 'lastTouchedDay', issues);
  requireFiniteNumber(obj, 'lastOwnerTouchedDay', issues);
  requireFiniteNumber(obj, 'openDayCooldown', issues);
  requireFiniteNumber(obj, 'lastPriceActionDay', issues);

  // Required array fields
  requireArray(obj, 'riskFlags', issues);
  requireArray(obj, 'tags', issues);
  requireArray(obj, 'defects', issues);
  requireArray(obj, 'competitionGroupIds', issues);
  requireArray(obj, 'competitivenessSnapshots', issues);

  // Boolean fields
  requireBoolean(obj, 'touchedOwnerToday', issues);
  requireBoolean(obj, 'touchedToday', issues);
  requireBoolean(obj, 'hasCompletedFirstVisit', issues);

  // Enum-like string fields — status is error (adapter always normalizes via fallback),
  // others remain warning (may come from legacy data with different vocabularies)
  reportEnumString(obj, 'status', VALID_CASE_STATUSES, issues, 'error');
  reportEnumString(obj, 'storylineState', VALID_STORYLINE_STATES, issues);
  reportEnumString(obj, 'personality', VALID_PERSONALITIES, issues);

  return { ok: issues.filter(i => i.severity === 'error').length === 0, issues: Object.freeze(issues) };
}

export function validateLegacyCanonicalOpportunityLike(input: unknown): CompatibilityValidationResult {
  const issues: CompatibilityValidationIssue[] = [];

  if (!input || typeof input !== 'object') {
    return { ok: false, issues: [issue('', 'object', typeof input, String(input), 'error')] };
  }

  const obj = input as Record<string, unknown>;

  // Required string IDs
  requireNonEmptyString(obj, 'id', issues);
  requireNonEmptyString(obj, 'caseId', issues);
  requireNonEmptyString(obj, 'customerId', issues, 'warning');
  requireNonEmptyString(obj, 'customerName', issues, 'warning');
  requireNonEmptyString(obj, 'profile', issues, 'warning');
  requireNonEmptyString(obj, 'channelId', issues, 'warning');
  requireNonEmptyString(obj, 'channelName', issues, 'warning');
  requireNonEmptyString(obj, 'status', issues);
  requireNonEmptyString(obj, 'lifecycleStatus', issues);
  requireNonEmptyString(obj, 'leadSource', issues);
  requireNonEmptyString(obj, 'visibility', issues);

  // Required finite numeric fields
  requireFiniteNumber(obj, 'fit', issues);
  requireFiniteNumber(obj, 'intent', issues);
  requireFiniteNumber(obj, 'confidence', issues);
  requireFiniteNumber(obj, 'stageIndex', issues);
  requireFiniteNumber(obj, 'createdDay', issues);
  requireFiniteNumber(obj, 'daysLeft', issues);
  requireFiniteNumber(obj, 'budgetMax', issues);
  requireFiniteNumber(obj, 'priceSensitivity', issues);
  requireFiniteNumber(obj, 'stagnationTicks', issues);

  // Required array fields
  requireArray(obj, 'history', issues);

  // Boolean fields
  requireBoolean(obj, 'touchedToday', issues);

  // Enum-like string fields — status is error (adapter normalizes), others warning
  reportEnumString(obj, 'status', VALID_OPP_STATUSES, issues, 'error');
  reportEnumString(obj, 'lifecycleStatus', VALID_OPP_LIFECYCLE_STATUSES, issues);
  reportEnumString(obj, 'visibility', VALID_OPP_VISIBILITIES, issues);

  return { ok: issues.filter(i => i.severity === 'error').length === 0, issues: Object.freeze(issues) };
}

export function validateLegacyCanonicalGameStateLike(input: unknown): CompatibilityValidationResult {
  const issues: CompatibilityValidationIssue[] = [];

  if (!input || typeof input !== 'object') {
    return { ok: false, issues: [issue('', 'object', typeof input, String(input), 'error')] };
  }

  const obj = input as Record<string, unknown>;

  // Required string IDs
  requireNonEmptyString(obj, 'runId', issues);
  requireNonEmptyString(obj, 'currentDate', issues, 'warning');

  // Required finite numeric fields
  requireFiniteNumber(obj, 'version', issues);
  requireFiniteNumber(obj, 'day', issues);

  // Required array fields
  requireArray(obj, 'cases', issues);
  requireArray(obj, 'opportunities', issues);

  // Validate child arrays
  if (Array.isArray(obj.cases)) {
    for (let i = 0; i < obj.cases.length; i++) {
      const caseResult = validateLegacyCanonicalCaseLike(obj.cases[i]);
      for (const ci of caseResult.issues) {
        issues.push({
          ...ci,
          path: `cases[${i}].${ci.path}`,
        });
      }
    }
  }

  if (Array.isArray(obj.opportunities)) {
    for (let i = 0; i < obj.opportunities.length; i++) {
      const oppResult = validateLegacyCanonicalOpportunityLike(obj.opportunities[i]);
      for (const oi of oppResult.issues) {
        issues.push({
          ...oi,
          path: `opportunities[${i}].${oi.path}`,
        });
      }
    }
  }

  // Cross-reference: opportunity.caseId should match a case id
  if (Array.isArray(obj.cases) && Array.isArray(obj.opportunities)) {
    const caseIds = new Set((obj.cases as Array<{ id: string }>).map(c => c.id).filter(Boolean));
    for (let i = 0; i < (obj.opportunities as Array<{ caseId: string }>).length; i++) {
      const opp = obj.opportunities[i] as { caseId?: string };
      if (opp.caseId && !caseIds.has(opp.caseId)) {
        issues.push(issue(
          `opportunities[${i}].caseId`,
          'existing case id',
          'unresolved reference',
          opp.caseId,
          'warning',
        ));
      }
    }
  }

  return { ok: issues.filter(i => i.severity === 'error').length === 0, issues: Object.freeze(issues) };
}

export function assertLegacyCanonicalGameStateLike(input: unknown): LegacyCanonicalGameStateLike {
  const result = validateLegacyCanonicalGameStateLike(input);
  if (!result.ok) {
    const errorIssues = result.issues.filter(i => i.severity === 'error');
    throw new Error(
      `LegacyCanonicalGameStateLike validation failed: ${errorIssues.length} error(s) — `
      + errorIssues.slice(0, 5).map(i => `${i.path || '(root)'}: expected ${i.expected}, got ${i.actualKind}`).join('; '),
    );
  }
  return input as LegacyCanonicalGameStateLike;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function issue(
  path: string,
  expected: string,
  actualKind: string,
  actualValue: string,
  severity: 'error' | 'warning',
): CompatibilityValidationIssue {
  return Object.freeze({ path, expected, actualKind, actualValue, severity });
}

function requireNonEmptyString(
  obj: Record<string, unknown>,
  field: string,
  issues: CompatibilityValidationIssue[],
  severity: 'error' | 'warning' = 'error',
): void {
  const value = obj[field];
  if (value === undefined || value === null) {
    issues.push(issue(field, 'non-empty string', String(value), String(value), severity));
  } else if (typeof value !== 'string') {
    issues.push(issue(field, 'non-empty string', typeof value, String(value), severity));
  } else if (value.length === 0) {
    issues.push(issue(field, 'non-empty string', 'empty string', '""', severity));
  }
}

function requireFiniteNumber(
  obj: Record<string, unknown>,
  field: string,
  issues: CompatibilityValidationIssue[],
  severity: 'error' | 'warning' = 'error',
): void {
  const value = obj[field];
  if (value === undefined || value === null) {
    issues.push(issue(field, 'finite number', String(value), String(value), severity));
  } else if (typeof value !== 'number') {
    issues.push(issue(field, 'finite number', typeof value, String(value), severity));
  } else if (!Number.isFinite(value)) {
    issues.push(issue(field, 'finite number', 'non-finite', String(value), severity));
  }
}

function requireArray(
  obj: Record<string, unknown>,
  field: string,
  issues: CompatibilityValidationIssue[],
  severity: 'error' | 'warning' = 'error',
): void {
  const value = obj[field];
  if (!Array.isArray(value)) {
    issues.push(issue(field, 'array', typeof value, String(value), severity));
  }
}

function requireBoolean(
  obj: Record<string, unknown>,
  field: string,
  issues: CompatibilityValidationIssue[],
  severity: 'error' | 'warning' = 'error',
): void {
  const value = obj[field];
  if (typeof value !== 'boolean') {
    issues.push(issue(field, 'boolean', typeof value, String(value), severity));
  }
}

function reportEnumString(
  obj: Record<string, unknown>,
  field: string,
  validValues: readonly string[],
  issues: CompatibilityValidationIssue[],
  severity: 'error' | 'warning' = 'warning',
): void {
  const value = obj[field];
  if (typeof value === 'string' && value.length > 0 && !validValues.includes(value)) {
    issues.push(issue(field, `one of [${validValues.join('|')}]`, 'unrecognized', value, severity));
  }
}

// ---------------------------------------------------------------------------
// Enum value sets (sourced from caseTypeFragments/caseNarrativeTypes)
// ---------------------------------------------------------------------------

const VALID_CASE_STATUSES = [
  'active', 'sold', 'lost_to_rival', 'withdrawn',
] as const;

const VALID_STORYLINE_STATES = [
  'healthy', 'stressed', 'at_risk', 'critical',
] as const;

const VALID_PERSONALITIES = [
  'pragmatic', 'anxious', 'stubborn', 'strategic',
] as const;

const VALID_OPP_STATUSES = [
  'active', 'paused', 'closed', 'lost', 'converted',
] as const;

const VALID_OPP_LIFECYCLE_STATUSES = [
  'active', 'stale', 'cooling', 'reactivated', 'closed',
] as const;

const VALID_OPP_VISIBILITIES = [
  'shadow', 'visible', 'highlighted', 'hidden', 'no_one',
] as const;
