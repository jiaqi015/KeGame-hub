import { describe, expect, it } from 'vitest';
import {
  OWNER_ACTION_EXECUTORS,
  OWNER_ACTION_EXECUTOR_IDS,
} from '../ownerActionExecutors.js';
import {
  PRICING_ACTION_EXECUTORS,
  PRICING_ACTION_EXECUTOR_IDS,
} from '../pricingActionExecutors.js';
import {
  MARKETING_ACTION_EXECUTORS,
  MARKETING_ACTION_EXECUTOR_IDS,
} from '../marketingActionExecutors.js';
import {
  SHOWING_ACTION_EXECUTORS,
  SHOWING_ACTION_EXECUTOR_IDS,
} from '../showingActionExecutors.js';
import {
  OPEN_DAY_ACTION_EXECUTORS,
  OPEN_DAY_ACTION_EXECUTOR_IDS,
} from '../openDayActionExecutors.js';
import {
  SINCERITY_SALE_ACTION_EXECUTORS,
  SINCERITY_SALE_ACTION_EXECUTOR_IDS,
} from '../sinceritySaleActionExecutors.js';
import {
  NEGOTIATION_ACTION_EXECUTORS,
  NEGOTIATION_ACTION_EXECUTOR_IDS,
} from '../negotiationActionExecutors.js';
import {
  ACTION_CONCURRENCY_ANNOTATIONS,
  canRunInParallel,
  getActionConcurrencyAnnotation,
} from '../actionConcurrency.js';
import { ACTIONS } from '../../constants.js';
import { LEGACY_ACTION_EXECUTOR_IDS } from '../actionResolvers.js';

describe('actionConcurrency — executor safety annotations', () => {
  const ALL_EXECUTOR_IDS = [
    ...OWNER_ACTION_EXECUTOR_IDS,
    ...PRICING_ACTION_EXECUTOR_IDS,
    ...MARKETING_ACTION_EXECUTOR_IDS,
    ...SHOWING_ACTION_EXECUTOR_IDS,
    ...OPEN_DAY_ACTION_EXECUTOR_IDS,
    ...SINCERITY_SALE_ACTION_EXECUTOR_IDS,
    ...NEGOTIATION_ACTION_EXECUTOR_IDS,
  ];

  it('every executor has an annotation entry', () => {
    for (const id of ALL_EXECUTOR_IDS) {
      expect(ACTION_CONCURRENCY_ANNOTATIONS).toHaveProperty(id);
    }
  });

  it('every action id that maps to an executor also has an annotation', () => {
    const executorIds = new Set(ALL_EXECUTOR_IDS);
    for (const action of ACTIONS) {
      const key = action.executorId || action.id;
      if (executorIds.has(key)) {
        expect(ACTION_CONCURRENCY_ANNOTATIONS).toHaveProperty(key);
      }
    }
  });

  it('each annotation has isConcurrencySafe, isReadOnly, isDestructive', () => {
    for (const id of ALL_EXECUTOR_IDS) {
      const ann = ACTION_CONCURRENCY_ANNOTATIONS[id];
      expect(ann).toHaveProperty('isConcurrencySafe');
      expect(ann).toHaveProperty('isReadOnly');
      expect(ann).toHaveProperty('isDestructive');
      expect(typeof ann.isConcurrencySafe).toBe('boolean');
      expect(typeof ann.isReadOnly).toBe('boolean');
      expect(typeof ann.isDestructive).toBe('boolean');
    }
  });

  // ── Invariant constraints ────────────────────────────────────────────

  it('isReadOnly implies isConcurrencySafe', () => {
    for (const id of ALL_EXECUTOR_IDS) {
      const ann = ACTION_CONCURRENCY_ANNOTATIONS[id];
      if (ann.isReadOnly) {
        expect(ann.isConcurrencySafe).toBe(true);
      }
    }
  });

  it('isDestructive implies !isConcurrencySafe', () => {
    for (const id of ALL_EXECUTOR_IDS) {
      const ann = ACTION_CONCURRENCY_ANNOTATIONS[id];
      if (ann.isDestructive) {
        expect(ann.isConcurrencySafe).toBe(false);
      }
    }
  });

  // ── Family-level annotations ─────────────────────────────────────────

  it('OWNER actions: not concurrency-safe, not read-only, not destructive', () => {
    for (const id of OWNER_ACTION_EXECUTOR_IDS) {
      const ann = ACTION_CONCURRENCY_ANNOTATIONS[id];
      expect(ann.isConcurrencySafe).toBe(false);
      expect(ann.isReadOnly).toBe(false);
      expect(ann.isDestructive).toBe(false);
    }
  });

  it('PRICING actions: not concurrency-safe (mutates askPrice), not read-only, not destructive', () => {
    for (const id of PRICING_ACTION_EXECUTOR_IDS) {
      const ann = ACTION_CONCURRENCY_ANNOTATIONS[id];
      expect(ann.isConcurrencySafe).toBe(false);
      expect(ann.isReadOnly).toBe(false);
      expect(ann.isDestructive).toBe(false);
    }
  });

  it('MARKETING actions: concurrency-safe (independent), not read-only, not destructive', () => {
    for (const id of MARKETING_ACTION_EXECUTOR_IDS) {
      const ann = ACTION_CONCURRENCY_ANNOTATIONS[id];
      expect(ann.isConcurrencySafe).toBe(true);
      expect(ann.isReadOnly).toBe(false);
      expect(ann.isDestructive).toBe(false);
    }
  });

  it('SHOWING actions: concurrency-safe, not read-only, not destructive', () => {
    for (const id of SHOWING_ACTION_EXECUTOR_IDS) {
      const ann = ACTION_CONCURRENCY_ANNOTATIONS[id];
      expect(ann.isConcurrencySafe).toBe(true);
      expect(ann.isReadOnly).toBe(false);
      expect(ann.isDestructive).toBe(false);
    }
  });

  it('OPEN_DAY actions: not concurrency-safe (major event), not read-only, not destructive', () => {
    for (const id of OPEN_DAY_ACTION_EXECUTOR_IDS) {
      const ann = ACTION_CONCURRENCY_ANNOTATIONS[id];
      expect(ann.isConcurrencySafe).toBe(false);
      expect(ann.isReadOnly).toBe(false);
      expect(ann.isDestructive).toBe(false);
    }
  });

  it('SINCERITY_SALE actions: not concurrency-safe, not read-only, destructive (commits to sale path)', () => {
    for (const id of SINCERITY_SALE_ACTION_EXECUTOR_IDS) {
      const ann = ACTION_CONCURRENCY_ANNOTATIONS[id];
      expect(ann.isConcurrencySafe).toBe(false);
      expect(ann.isReadOnly).toBe(false);
      expect(ann.isDestructive).toBe(true);
    }
  });

  it('NEGOTIATION actions: not concurrency-safe, not read-only, destructive (irreversible commitment)', () => {
    for (const id of NEGOTIATION_ACTION_EXECUTOR_IDS) {
      const ann = ACTION_CONCURRENCY_ANNOTATIONS[id];
      expect(ann.isConcurrencySafe).toBe(false);
      expect(ann.isReadOnly).toBe(false);
      expect(ann.isDestructive).toBe(true);
    }
  });

  // ── canRunInParallel helper ──────────────────────────────────────────

  it('canRunInParallel returns true only when both actions are concurrency-safe', () => {
    expect(canRunInParallel('story', 'showing')).toBe(true); // both safe
    expect(canRunInParallel('story', 'first-visit')).toBe(false); // owner not safe
    expect(canRunInParallel('first-visit', 'showing')).toBe(false); // owner not safe
    expect(canRunInParallel('sincerity-sale', 'invite-customer-negotiation')).toBe(false); // both destructive
  });

  it('getActionConcurrencyAnnotation returns annotation for valid id', () => {
    const ann = getActionConcurrencyAnnotation('first-visit');
    expect(ann).toBeDefined();
    expect(ann.isConcurrencySafe).toBe(false);
  });

  it('getActionConcurrencyAnnotation throws for unknown id', () => {
    expect(() => getActionConcurrencyAnnotation('nonexistent-action')).toThrow();
  });
});
