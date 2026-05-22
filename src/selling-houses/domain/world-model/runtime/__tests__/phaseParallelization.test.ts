import { describe, expect, it } from 'vitest';
import {
  getDefaultPhaseGroups,
  type PhaseGroup,
} from '../phaseGroups.js';
import { TICK_PHASE_ORDER } from '../phases.js';
import type { BigWorldTickPhaseId } from '../types.js';

describe('phaseGroups — parallelizable phase execution', () => {
  it('defines 6 groups that cover all 8 phases', () => {
    const groups = getDefaultPhaseGroups();
    const flatPhases = groups.flat();
    expect(flatPhases).toHaveLength(8);
  });

  it('every phase appears exactly once across all groups', () => {
    const groups = getDefaultPhaseGroups();
    const flatPhases = groups.flat();
    const uniquePhases = new Set(flatPhases);
    expect(uniquePhases.size).toBe(8);
    for (const phase of TICK_PHASE_ORDER) {
      expect(uniquePhases.has(phase)).toBe(true);
    }
  });

  it('groups are: [Env,Rival] [Supply] [Customer] [Owner,OppPressure] [Rec] [Compact]', () => {
    const groups = getDefaultPhaseGroups();
    expect(groups).toHaveLength(6);
    expect(groups[0]).toEqual(['EnvironmentPhase', 'RivalBrokerPhase']);
    expect(groups[1]).toEqual(['ListingSupplyPhase']);
    expect(groups[2]).toEqual(['CustomerDemandPhase']);
    expect(groups[3]).toEqual(['OwnerPerceptionPhase', 'OpportunityPressurePhase']);
    expect(groups[4]).toEqual(['RecommendationPressurePhase']);
    expect(groups[5]).toEqual(['CompactionPhase']);
  });

  it('preserves overall phase ordering: no phase appears before its dependencies', () => {
    const groups = getDefaultPhaseGroups();
    const flatPhases = groups.flat();

    // Dependency pairs: [depends_on, dependent]
    const dependencies: [BigWorldTickPhaseId, BigWorldTickPhaseId][] = [
      ['EnvironmentPhase', 'ListingSupplyPhase'],     // Supply reads Env heat events
      ['RivalBrokerPhase', 'CustomerDemandPhase'],     // Customer reads rival events
      ['ListingSupplyPhase', 'CustomerDemandPhase'],   // Customer reads reprice events
      ['CustomerDemandPhase', 'OwnerPerceptionPhase'], // Owner reads customer events
      ['OwnerPerceptionPhase', 'RecommendationPressurePhase'], // Rec reads owner events
    ];

    for (const [dep, dependent] of dependencies) {
      const depIdx = flatPhases.indexOf(dep);
      const dependentIdx = flatPhases.indexOf(dependent);
      expect(depIdx).toBeLessThan(dependentIdx);
    }
  });

  it('each group with >1 phase contains independent phases (no intra-group dependencies)', () => {
    const groups = getDefaultPhaseGroups();

    // Known dependency edges
    const dependsOn = new Map<BigWorldTickPhaseId, Set<BigWorldTickPhaseId>>([
      ['ListingSupplyPhase', new Set(['EnvironmentPhase'])],
      ['CustomerDemandPhase', new Set(['RivalBrokerPhase', 'ListingSupplyPhase'])],
      ['OwnerPerceptionPhase', new Set(['CustomerDemandPhase'])],
      ['RecommendationPressurePhase', new Set(['OwnerPerceptionPhase'])],
    ]);

    for (const group of groups) {
      if (group.length <= 1) continue;
      for (const phase of group) {
        const deps = dependsOn.get(phase);
        if (!deps) continue;
        // No dependency should be in the same group
        for (const dep of deps) {
          expect(group).not.toContain(dep);
        }
      }
    }
  });

  it('group count (6) is less than phase count (8) — demonstrating parallelism benefit', () => {
    const groups = getDefaultPhaseGroups();
    expect(groups.length).toBeLessThan(TICK_PHASE_ORDER.length);
  });
});
