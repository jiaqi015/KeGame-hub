import { describe, it, expect } from 'vitest';
import { deepFreeze } from '../deepFreeze.js';

describe('deepFreeze', () => {
  it('nested object mutation throws', () => {
    const obj = deepFreeze({ a: { b: 1 } });
    expect(() => { (obj as any).a.b = 2; }).toThrow(TypeError);
  });

  it('nested array push throws', () => {
    const obj = deepFreeze({ items: [1, 2, 3] });
    expect(() => { (obj as any).items.push(4); }).toThrow(TypeError);
  });

  it('Map value object mutation throws', () => {
    const map = new Map([['key', { val: 1 }]]);
    const frozen = deepFreeze(map);
    const inner = frozen.get('key')!;
    expect(() => { (inner as any).val = 2; }).toThrow(TypeError);
  });

  it('Set value object mutation throws', () => {
    const inner = { val: 1 };
    const set = new Set([inner]);
    const frozen = deepFreeze(set);
    const [item] = [...frozen];
    expect(() => { (item as any).val = 2; }).toThrow(TypeError);
  });

  it('cyclic object does not infinite recurse', () => {
    const obj: Record<string, any> = { a: 1 };
    obj.self = obj;
    expect(() => deepFreeze(obj)).not.toThrow();
  });

  it('primitive values pass through', () => {
    expect(deepFreeze(42)).toBe(42);
    expect(deepFreeze('hello')).toBe('hello');
    expect(deepFreeze(null)).toBe(null);
    expect(deepFreeze(undefined)).toBe(undefined);
  });

  it('top-level mutation throws', () => {
    const obj = deepFreeze({ x: 1 });
    expect(() => { (obj as any).x = 2; }).toThrow(TypeError);
  });

  it('deeply nested mutation throws', () => {
    const obj = deepFreeze({ a: { b: { c: { d: 1 } } } });
    expect(() => { (obj as any).a.b.c.d = 2; }).toThrow(TypeError);
  });

  it('array element mutation throws', () => {
    const obj = deepFreeze({ items: [{ x: 1 }] });
    expect(() => { (obj as any).items[0].x = 2; }).toThrow(TypeError);
  });
});
