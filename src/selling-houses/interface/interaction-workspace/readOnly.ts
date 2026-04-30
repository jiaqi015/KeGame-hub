type Primitive = string | number | boolean | bigint | symbol | null | undefined;

export type ReadonlyDeep<T> =
  T extends Primitive ? T
    : T extends (...args: any[]) => unknown ? T
      : T extends readonly (infer Item)[] ? readonly ReadonlyDeep<Item>[]
        : T extends object ? { readonly [Key in keyof T]: ReadonlyDeep<T[Key]> }
          : T;

// Plain DTO freeze helper for workspace projections. It is intentionally small
// and scoped to projection objects, not a general-purpose immutable engine.
export function freezeProjection<T>(value: T): ReadonlyDeep<T> {
  if (!value || typeof value !== 'object') {
    return value as ReadonlyDeep<T>;
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
    const nested = (value as Record<string, unknown>)[key];
    if (nested && typeof nested === 'object') {
      freezeProjection(nested);
    }
  }

  return Object.freeze(value) as ReadonlyDeep<T>;
}
