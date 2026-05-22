import { describe, it, expect } from 'vitest';
import {
  OWNER_ARCHETYPE_DEFINITIONS,
  CUSTOMER_ARCHETYPE_DEFINITIONS,
  CHANNEL_ARCHETYPE_DEFINITIONS,
  BROKER_NETWORK_ARCHETYPE_DEFINITIONS,
  RIVAL_LISTING_ARCHETYPE_DEFINITIONS,
  BUSINESS_ARCHETYPE_DEFINITIONS,
  BUSINESS_ARCHETYPE_BY_ID,
} from '../definitions.js';

describe('archetypeDefinitions', () => {
  it('OWNER_ARCHETYPE_DEFINITIONS is runtime immutable: push throws TypeError', () => {
    expect(() => { (OWNER_ARCHETYPE_DEFINITIONS as any[]).push({} as any); }).toThrow(TypeError);
  });

  it('CUSTOMER_ARCHETYPE_DEFINITIONS is runtime immutable: push throws TypeError', () => {
    expect(() => { (CUSTOMER_ARCHETYPE_DEFINITIONS as any[]).push({} as any); }).toThrow(TypeError);
  });

  it('CHANNEL_ARCHETYPE_DEFINITIONS is runtime immutable: push throws TypeError', () => {
    expect(() => { (CHANNEL_ARCHETYPE_DEFINITIONS as any[]).push({} as any); }).toThrow(TypeError);
  });

  it('BROKER_NETWORK_ARCHETYPE_DEFINITIONS is runtime immutable: push throws TypeError', () => {
    expect(() => { (BROKER_NETWORK_ARCHETYPE_DEFINITIONS as any[]).push({} as any); }).toThrow(TypeError);
  });

  it('RIVAL_LISTING_ARCHETYPE_DEFINITIONS is runtime immutable: push throws TypeError', () => {
    expect(() => { (RIVAL_LISTING_ARCHETYPE_DEFINITIONS as any[]).push({} as any); }).toThrow(TypeError);
  });

  it('BUSINESS_ARCHETYPE_DEFINITIONS is runtime immutable: push throws TypeError', () => {
    expect(() => { (BUSINESS_ARCHETYPE_DEFINITIONS as any[]).push({} as any); }).toThrow(TypeError);
  });

  it('BUSINESS_ARCHETYPE_BY_ID is runtime immutable: adding new key throws TypeError', () => {
    expect(() => { (BUSINESS_ARCHETYPE_BY_ID as any)['nonexistent'] = {}; }).toThrow(TypeError);
  });

  it('nested arrays in derived definitions are runtime immutable', () => {
    const firstCustomer = CUSTOMER_ARCHETYPE_DEFINITIONS[0];
    expect(firstCustomer.layouts.length).toBeGreaterThan(0);
    expect(() => { (firstCustomer.layouts as any).push('invalid'); }).toThrow(TypeError);
    expect(() => { (firstCustomer.preferences as any).push('invalid'); }).toThrow(TypeError);

    const firstRivalStore = BROKER_NETWORK_ARCHETYPE_DEFINITIONS[0];
    if (firstRivalStore.districtFocus?.length) {
      expect(() => { (firstRivalStore.districtFocus as any).push('invalid'); }).toThrow(TypeError);
    }
  });

  it('definitions.ts does not import from domain', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/selling-houses/core/business-rules/archetypes/definitions.ts'),
      'utf-8',
    );
    const importLines = source.split('\n').filter((l: string) => l.trimStart().startsWith('import '));
    expect(importLines.some((l: string) => l.includes('domain/'))).toBe(false);
  });
});
