export function freezeProjection<T>(value: T): Readonly<T> {
  if (!value || typeof value !== 'object') {
    return value as Readonly<T>;
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
    const nested = (value as Record<string, unknown>)[key];
    if (nested && typeof nested === 'object' && !Object.isFrozen(nested)) {
      freezeProjection(nested);
    }
  }

  return Object.freeze(value);
}
