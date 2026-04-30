import { describe, expect, it } from 'vitest';
import { LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES } from '../legacy-case-field-ownership.js';
import {
  buildLegacyCaseMigrationPlan,
  LEGACY_CASE_MIGRATION_PLAN,
} from '../legacy-case-migration-plan.js';

describe('legacy Case migration plan', () => {
  it('derives a frozen migration plan from the ownership registry', () => {
    const plan = buildLegacyCaseMigrationPlan();

    expect(plan.source).toBe('legacy-case-field-ownership-registry');
    expect(plan.fieldCount).toBe(LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.length);
    expect(plan.byCanonicalOwner.assetCase.fieldNames).toContain('title');
    expect(plan.byCanonicalOwner.evaluationMirror.fieldNames).toContain('competitiveness');
    expect(plan.byMigrationWave['first-read-model-only'].fieldNames).toEqual(
      plan.firstWaveFieldNames,
    );
    expect(plan.firstWaveFieldNames).toEqual(
      expect.arrayContaining(['id', 'title', 'community', 'ownerName', 'personality']),
    );
    expect(plan.firstWaveFieldNames).not.toEqual(
      expect.arrayContaining(['stageLabel', 'viewings', 'offers', 'actionsApplied', 'riskFlags']),
    );
    expect(plan.blockedFieldNames).toEqual(
      expect.arrayContaining([
        'competitiveness',
        'd1',
        'd2',
        'd3',
        'stageLabel',
        'viewings',
        'offers',
        'actionsApplied',
        'riskFlags',
        'qualityStory',
      ]),
    );
    expect(plan.riskNotes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('trust'),
        expect.stringContaining('D1/D2/D3/competitiveness'),
        expect.stringContaining('stage/viewings/offers'),
      ]),
    );
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.firstWaveFieldNames)).toBe(true);
    expect(Object.isFrozen(plan.byCanonicalOwner.assetCase.fieldNames)).toBe(true);
    expect(Object.isFrozen(plan.byMigrationWave['requires-process-owner'])).toBe(true);
  });

  it('exports the prebuilt plan with the same field count as the builder', () => {
    expect(LEGACY_CASE_MIGRATION_PLAN.fieldCount).toBe(buildLegacyCaseMigrationPlan().fieldCount);
    expect(Object.isFrozen(LEGACY_CASE_MIGRATION_PLAN)).toBe(true);
  });
});
