import { describe, it, expect } from 'vitest';
import {
  DOMAIN_EVENT_KINDS,
  isDomainEventKind,
} from '../eventTypes.js';

describe('eventTypes', () => {
  it('DOMAIN_EVENT_KINDS has 12 values', () => {
    expect(DOMAIN_EVENT_KINDS).toHaveLength(12);
  });

  it('isDomainEventKind validates correctly', () => {
    expect(isDomainEventKind('journal')).toBe(true);
    expect(isDomainEventKind('action_executed')).toBe(true);
    expect(isDomainEventKind('business_flow_step_advanced')).toBe(true);
    expect(isDomainEventKind('unknown')).toBe(false);
    expect(isDomainEventKind(null)).toBe(false);
  });

  it('eventTypes.ts does not import from domain', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/selling-houses/core/world-state/eventTypes.ts'),
      'utf-8',
    );
    const importLines = source.split('\n').filter(l => l.trimStart().startsWith('import '));
    expect(importLines.some(l => l.includes('domain/'))).toBe(false);
  });
});
