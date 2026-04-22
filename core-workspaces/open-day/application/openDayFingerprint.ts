import { createHash } from 'node:crypto';

export function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

export function createOpenDayHash(value: unknown, prefix = 'open-day'): string {
  const hash = createHash('sha256');
  hash.update(stableSerialize(value));
  return `${prefix}:${hash.digest('hex')}`;
}
