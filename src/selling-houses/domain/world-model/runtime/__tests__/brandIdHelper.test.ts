import { describe, expect, it } from 'vitest';
import { deriveBrandId, resolveStoreAcnId, resolvePlayerBrokerAcnId, resolveInitialPlayerBrokerAcnId } from '../brandIdHelper.js';

describe('deriveBrandId', () => {
  it('derives brand from default ACN IDs', () => {
    expect(deriveBrandId('acn-cooperative')).toBe('acn');
    expect(deriveBrandId('acn-aggressive')).toBe('acn');
    expect(deriveBrandId('acn-local')).toBe('acn');
  });

  it('derives brand from extra ACN IDs', () => {
    expect(deriveBrandId('acn-extra-3')).toBe('acn-extra');
    expect(deriveBrandId('acn-extra-10')).toBe('acn-extra');
  });

  it('derives brand from numeric ACN IDs', () => {
    expect(deriveBrandId('acn-1')).toBe('acn');
    expect(deriveBrandId('acn-32')).toBe('acn');
  });

  it('returns the prefix for deeply nested IDs', () => {
    expect(deriveBrandId('brand-region-network-42')).toBe('brand-region-network');
  });

  it('returns the ID itself if no hyphen', () => {
    expect(deriveBrandId('noid')).toBe('noid');
  });

  it('returns undefined for falsy input', () => {
    expect(deriveBrandId(undefined)).toBeUndefined();
    expect(deriveBrandId('')).toBeUndefined();
  });

  it('returns undefined for leading hyphen input', () => {
    expect(deriveBrandId('-bad')).toBeUndefined();
  });

  it('derives brand from standard acn-cooperative', () => {
    expect(deriveBrandId('acn-cooperative')).toBe('acn');
  });

  it('derives brand from deeply nested acn-extra-3', () => {
    expect(deriveBrandId('acn-extra-3')).toBe('acn-extra');
  });

  it('returns the ID itself for nohyphen', () => {
    expect(deriveBrandId('nohyphen')).toBe('nohyphen');
  });

  it('same-brand different-ACN detection: cooperative and aggressive are same brand', () => {
    expect(deriveBrandId('acn-cooperative')).toBe(deriveBrandId('acn-aggressive'));
  });
});

describe('resolveStoreAcnId', () => {
  it('returns acnId when present', () => {
    expect(resolveStoreAcnId({ acnId: 'acn-cooperative', id: 'store-1' })).toBe('acn-cooperative');
  });

  it('falls back to fallback-acn-{id} when acnId is missing', () => {
    expect(resolveStoreAcnId({ id: 'store-1', type: 'same_company' })).toBe('fallback-acn-store-1');
  });

  it('ignores store.type — never uses acn-${store.type}', () => {
    const result = resolveStoreAcnId({ id: 'store-42', type: 'external_company' });
    expect(result).toBe('fallback-acn-store-42');
    expect(result).not.toContain('external_company');
  });

  it('falls back when acnId is explicitly undefined', () => {
    expect(resolveStoreAcnId({ acnId: undefined, id: 'store-x' })).toBe('fallback-acn-store-x');
  });
});

describe('resolvePlayerBrokerAcnId', () => {
  it('returns playerBrokerAcnId when present', () => {
    expect(resolvePlayerBrokerAcnId({ playerBrokerAcnId: 'acn-player-brand' })).toBe('acn-player-brand');
  });

  it('falls back to acn-cooperative when no runtime provided', () => {
    expect(resolvePlayerBrokerAcnId()).toBe('acn-cooperative');
  });

  it('falls back to acn-cooperative when runtime is undefined', () => {
    expect(resolvePlayerBrokerAcnId(undefined)).toBe('acn-cooperative');
  });

  it('falls back to acn-cooperative when playerBrokerAcnId is undefined', () => {
    expect(resolvePlayerBrokerAcnId({ playerBrokerAcnId: undefined })).toBe('acn-cooperative');
  });

  it('never returns bare player-broker-acn placeholder', () => {
    const result = resolvePlayerBrokerAcnId(undefined);
    expect(result).not.toBe('player-broker-acn');
  });
});

describe('resolveInitialPlayerBrokerAcnId', () => {
  it('returns acnId from bootstrap openingPOV playerBroker', () => {
    const bootstrap = {
      openingPOV: {
        playerBroker: { acnId: 'acn-cooperative' },
      },
    };
    expect(resolveInitialPlayerBrokerAcnId(bootstrap)).toBe('acn-cooperative');
  });

  it('falls back to acn-cooperative when bootstrap is undefined', () => {
    expect(resolveInitialPlayerBrokerAcnId(undefined)).toBe('acn-cooperative');
  });

  it('falls back to acn-cooperative when openingPOV is missing', () => {
    expect(resolveInitialPlayerBrokerAcnId({})).toBe('acn-cooperative');
  });

  it('falls back to acn-cooperative when playerBroker acnId is missing', () => {
    expect(resolveInitialPlayerBrokerAcnId({ openingPOV: { playerBroker: {} } })).toBe('acn-cooperative');
  });
});
