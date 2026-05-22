type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/**
 * Compile-time deep readonly: makes all properties and nested arrays/objects
 * recursively readonly. Functions and primitives are left as-is.
 */
export type DeepReadonly<T> =
  T extends Primitive ? T
    : T extends (...args: any[]) => unknown ? T
      : T extends readonly (infer Item)[] ? readonly DeepReadonly<Item>[]
        : T extends Map<infer K, infer V> ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
          : T extends Set<infer V> ? ReadonlySet<DeepReadonly<V>>
            : T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
              : T;

/**
 * deepFreeze — recursively freezes an object and all nested objects/arrays.
 *
 * After calling deepFreeze, any attempt to mutate the object or its nested
 * properties will throw TypeError at runtime. The return type is DeepReadonly<T>
 * so TypeScript also enforces compile-time immutability.
 */
export function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value as DeepReadonly<T>;
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }

  return Object.freeze(value) as DeepReadonly<T>;
}
