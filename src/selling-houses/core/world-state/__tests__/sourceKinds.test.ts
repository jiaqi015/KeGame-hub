import { describe, expect, it } from 'vitest';
import {
  SOURCE_KINDS,
  isSourceKind,
  assertSourceKind,
  type SourceKind,
} from '../sourceKinds.js';

describe('sourceKinds — canonical ontology runtime', () => {
  // ── SOURCE_KINDS tuple ─────────────────────────────────────────────────

  it('SOURCE_KINDS is a const tuple with exactly 15 entries', () => {
    expect(SOURCE_KINDS).toHaveLength(15);
    expect(Array.isArray(SOURCE_KINDS)).toBe(true);
  });

  it('SOURCE_KINDS contains all 15 known source kinds', () => {
    const expected: SourceKind[] = [
      'market_signal', 'rival_action', 'customer_interaction', 'owner_interview',
      'manager_message', 'player_action_receipt', 'process_receipt',
      'comparable_transaction', 'platform_traffic', 'acn_network_signal',
      'supporting_facility_signal', 'broker_capacity_signal',
      'owner_life_event_signal', 'buyer_financing_signal', 'micro_market_signal',
    ];
    expect([...SOURCE_KINDS].sort()).toEqual([...expected].sort());
  });

  it('SourceKind type is derived from SOURCE_KINDS', () => {
    // Compile-time: if this compiles, SourceKind = typeof SOURCE_KINDS[number]
    const kind: SourceKind = SOURCE_KINDS[0];
    expect(typeof kind).toBe('string');
  });

  // ── isSourceKind() ────────────────────────────────────────────────────

  it('isSourceKind returns true for all 15 valid source kinds', () => {
    for (const kind of SOURCE_KINDS) {
      expect(isSourceKind(kind)).toBe(true);
    }
  });

  it('isSourceKind returns false for undefined', () => {
    expect(isSourceKind(undefined)).toBe(false);
  });

  it('isSourceKind returns false for empty string', () => {
    expect(isSourceKind('')).toBe(false);
  });

  it('isSourceKind returns false for legacy_case_field', () => {
    expect(isSourceKind('legacy_case_field')).toBe(false);
  });

  it('isSourceKind returns false for camelCase variant marketSignal', () => {
    expect(isSourceKind('marketSignal')).toBe(false);
  });

  it('isSourceKind returns false for non-string types', () => {
    expect(isSourceKind(42 as any)).toBe(false);
    expect(isSourceKind(null as any)).toBe(false);
    expect(isSourceKind({} as any)).toBe(false);
  });

  // ── assertSourceKind() ────────────────────────────────────────────────

  it('assertSourceKind does not throw for valid kinds', () => {
    for (const kind of SOURCE_KINDS) {
      expect(() => assertSourceKind(kind, 'test')).not.toThrow();
    }
  });

  it('assertSourceKind throws for invalid kinds with value in message', () => {
    expect(() => assertSourceKind('invalid_kind', 'test-context')).toThrow(/invalid_kind/);
    expect(() => assertSourceKind('marketSignal', 'test-context')).toThrow(/marketSignal/);
    expect(() => assertSourceKind(undefined, 'test-context')).toThrow(/undefined/);
  });
});
