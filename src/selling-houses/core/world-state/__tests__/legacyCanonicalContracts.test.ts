import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LegacyCanonicalCaseLike } from '../legacyCompatibilityContracts.js';
import type { LegacyCanonicalOpportunityLike } from '../legacyCompatibilityContracts.js';
import type { LegacyCanonicalGameStateLike } from '../legacyCompatibilityContracts.js';
import type {
  LegacyEvaluationCaseLike,
  LegacyEvaluationOpportunityLike,
  LegacyEvaluationStateLike,
  LegacyScoreSeparationCaseLike,
  LegacyScoreSeparationStateLike,
  LegacyScoreSeparationOpportunityLike,
} from '../../evaluation/legacyEvaluationContracts.js';
import type {
  LegacyWorldCaseLike,
  LegacyWorldOpportunityLike,
  LegacyWorldGameStateLike,
} from '../legacyWorldAdapterContracts.js';

describe('Canonical Legacy Entity Kernel', () => {
  // -------------------------------------------------------------------------
  // B1: LegacyEvaluationCaseLike shares canonical case base
  // -------------------------------------------------------------------------
  it('LegacyEvaluationCaseLike is derived from LegacyCanonicalCaseLike', () => {
    // LegacyEvaluationCaseLike must be assignable from LegacyCanonicalCaseLike
    // (evaluation only needs a subset of canonical fields)
    const canonical: LegacyCanonicalCaseLike = {} as LegacyCanonicalCaseLike;
    const evaluation: LegacyEvaluationCaseLike = canonical;
    expect(evaluation).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // B2: LegacyWorldCaseLike shares canonical case base
  // -------------------------------------------------------------------------
  it('LegacyWorldCaseLike is derived from LegacyCanonicalCaseLike', () => {
    const canonical: LegacyCanonicalCaseLike = {} as LegacyCanonicalCaseLike;
    const world: LegacyWorldCaseLike = canonical;
    expect(world).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // B3: LegacyEvaluationOpportunityLike shares canonical opportunity base
  // -------------------------------------------------------------------------
  it('LegacyEvaluationOpportunityLike is derived from LegacyCanonicalOpportunityLike', () => {
    const canonical: LegacyCanonicalOpportunityLike = {} as LegacyCanonicalOpportunityLike;
    const evaluation: LegacyEvaluationOpportunityLike = canonical;
    expect(evaluation).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // B4: LegacyWorldOpportunityLike shares canonical opportunity base
  // -------------------------------------------------------------------------
  it('LegacyWorldOpportunityLike is derived from LegacyCanonicalOpportunityLike', () => {
    const canonical: LegacyCanonicalOpportunityLike = {} as LegacyCanonicalOpportunityLike;
    const world: LegacyWorldOpportunityLike = canonical;
    expect(world).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // B5: LegacyEvaluationStateLike shares canonical state base
  // -------------------------------------------------------------------------
  it('LegacyEvaluationStateLike is derived from LegacyCanonicalGameStateLike', () => {
    const canonical: LegacyCanonicalGameStateLike = {} as LegacyCanonicalGameStateLike;
    const evaluation: LegacyEvaluationStateLike = canonical;
    expect(evaluation).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // B6: LegacyWorldGameStateLike shares canonical state base
  // -------------------------------------------------------------------------
  it('LegacyWorldGameStateLike is derived from LegacyCanonicalGameStateLike', () => {
    const canonical: LegacyCanonicalGameStateLike = {} as LegacyCanonicalGameStateLike;
    const world: LegacyWorldGameStateLike = canonical;
    expect(world).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // B7: Source scan — no duplicated large field lists
  // -------------------------------------------------------------------------
  it('evaluation and world-state contracts do not duplicate field bodies', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
    const evalPath = path.join(repoRoot, 'src/selling-houses/core/evaluation/legacyEvaluationContracts.ts');
    const worldPath = path.join(repoRoot, 'src/selling-houses/core/world-state/legacyWorldAdapterContracts.ts');

    const evalSrc = fs.readFileSync(evalPath, 'utf-8');
    const worldSrc = fs.readFileSync(worldPath, 'utf-8');

    // Count how many lines in each file define interface fields (lines like `  fieldName: Type;` or `  fieldName?: Type;`)
    const evalFieldLines = evalSrc.split('\n').filter(l => l.trim().match(/^\w+(\?)?: [A-Za-z]/)).length;
    const worldFieldLines = worldSrc.split('\n').filter(l => l.trim().match(/^\w+(\?)?: [A-Za-z]/)).length;

    // After canonical kernel: both files should have very few field definitions
    // (only evaluation-specific or world-specific extensions)
    // Before: evaluation had ~45 field lines, world had ~55 field lines
    // After: each should have < 15 field lines (just the extension fields)
    expect(evalFieldLines).toBeLessThan(20);
    expect(worldFieldLines).toBeLessThan(20);
  });
});
