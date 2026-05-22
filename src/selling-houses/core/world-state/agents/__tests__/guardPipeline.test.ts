import { describe, expect, it } from 'vitest';
import {
  type GuardHook,
  type GuardResult,
  type GuardContext,
  runGuardPipeline,
} from '../guardPipeline.js';

describe('guardPipeline — short-circuit waterfall', () => {
  const emptyContext: GuardContext = {};

  function makeHook(
    id: string,
    result: GuardResult,
    sideEffect?: () => void,
  ): GuardHook {
    return Object.freeze({
      hookId: id,
      execute: () => {
        sideEffect?.();
        return result;
      },
    });
  }

  it('runs all hooks when all return allow', async () => {
    const visited: string[] = [];
    const hooks: GuardHook[] = [
      makeHook('a', { behavior: 'allow' }, () => visited.push('a')),
      makeHook('b', { behavior: 'allow' }, () => visited.push('b')),
      makeHook('c', { behavior: 'allow' }, () => visited.push('c')),
    ];
    const result = await runGuardPipeline(hooks, emptyContext);
    expect(result.behavior).toBe('allow');
    expect(visited).toEqual(['a', 'b', 'c']);
  });

  it('short-circuits on deny — subsequent hooks do not run', async () => {
    const visited: string[] = [];
    const hooks: GuardHook[] = [
      makeHook('a', { behavior: 'allow' }, () => visited.push('a')),
      makeHook('b', { behavior: 'deny', reason: 'redline' }, () => visited.push('b')),
      makeHook('c', { behavior: 'allow' }, () => visited.push('c')),
    ];
    const result = await runGuardPipeline(hooks, emptyContext);
    expect(result.behavior).toBe('deny');
    expect(result.reason).toBe('redline');
    expect(visited).toEqual(['a', 'b']);
  });

  it('continues on ask — does not short-circuit', async () => {
    const visited: string[] = [];
    const hooks: GuardHook[] = [
      makeHook('a', { behavior: 'ask' }, () => visited.push('a')),
      makeHook('b', { behavior: 'allow' }, () => visited.push('b')),
      makeHook('c', { behavior: 'allow' }, () => visited.push('c')),
    ];
    const result = await runGuardPipeline(hooks, emptyContext);
    expect(result.behavior).toBe('allow');
    expect(visited).toEqual(['a', 'b', 'c']);
  });

  it('returns first deny when multiple deny hooks exist', async () => {
    const visited: string[] = [];
    const hooks: GuardHook[] = [
      makeHook('a', { behavior: 'allow' }, () => visited.push('a')),
      makeHook('b', { behavior: 'deny', reason: 'first-deny' }, () => visited.push('b')),
      makeHook('c', { behavior: 'deny', reason: 'second-deny' }, () => visited.push('c')),
    ];
    const result = await runGuardPipeline(hooks, emptyContext);
    expect(result.behavior).toBe('deny');
    expect(result.reason).toBe('first-deny');
    expect(visited).toEqual(['a', 'b']);
  });

  it('returns last result when no deny encountered', async () => {
    const hooks: GuardHook[] = [
      makeHook('a', { behavior: 'allow' }),
      makeHook('b', { behavior: 'ask' }),
      makeHook('c', { behavior: 'allow' }),
    ];
    const result = await runGuardPipeline(hooks, emptyContext);
    expect(result.behavior).toBe('allow');
  });

  it('returns deny with reason from the denying hook', async () => {
    const hooks: GuardHook[] = [
      makeHook('a', { behavior: 'deny', reason: '红线输入检测: 辱骂' }),
    ];
    const result = await runGuardPipeline(hooks, emptyContext);
    expect(result).toEqual({ behavior: 'deny', reason: '红线输入检测: 辱骂' });
  });

  it('returns allow with no reason when all hooks allow', async () => {
    const hooks: GuardHook[] = [
      makeHook('a', { behavior: 'allow' }),
    ];
    const result = await runGuardPipeline(hooks, emptyContext);
    expect(result).toEqual({ behavior: 'allow' });
  });

  it('returns allow for empty hook list', async () => {
    const result = await runGuardPipeline([], emptyContext);
    expect(result.behavior).toBe('allow');
  });

  it('supports async hooks', async () => {
    const visited: string[] = [];
    const hooks: GuardHook[] = [
      {
        hookId: 'async-a',
        execute: async () => {
          await Promise.resolve();
          visited.push('a');
          return { behavior: 'allow' } as GuardResult;
        },
      },
      {
        hookId: 'async-b',
        execute: async () => {
          await Promise.resolve();
          visited.push('b');
          return { behavior: 'deny', reason: 'async-deny' } as GuardResult;
        },
      },
      {
        hookId: 'async-c',
        execute: async () => {
          visited.push('c');
          return { behavior: 'allow' } as GuardResult;
        },
      },
    ];
    const result = await runGuardPipeline(hooks, emptyContext);
    expect(result.behavior).toBe('deny');
    expect(result.reason).toBe('async-deny');
    expect(visited).toEqual(['a', 'b']);
  });

  // ── CaseAgentOS integration scenario ─────────────────────────────────

  it('simulates CaseAgentOS: before_agent deny skips before_settle', async () => {
    const visited: string[] = [];
    const hooks: GuardHook[] = [
      makeHook('before_prompt', { behavior: 'allow' }, () => visited.push('before_prompt')),
      makeHook('before_agent', { behavior: 'deny', reason: 'redline: 辱骂' }, () => visited.push('before_agent')),
      makeHook('before_settle', { behavior: 'allow' }, () => visited.push('before_settle')),
      makeHook('after_settle', { behavior: 'allow' }, () => visited.push('after_settle')),
      makeHook('after_turn', { behavior: 'allow' }, () => visited.push('after_turn')),
    ];
    const result = await runGuardPipeline(hooks, emptyContext);
    expect(result.behavior).toBe('deny');
    expect(result.reason).toBe('redline: 辱骂');
    expect(visited).toEqual(['before_prompt', 'before_agent']);
  });

  it('simulates CaseAgentOS: all 5 hooks run when all allow', async () => {
    const visited: string[] = [];
    const hooks: GuardHook[] = [
      makeHook('before_prompt', { behavior: 'allow' }, () => visited.push('before_prompt')),
      makeHook('before_agent', { behavior: 'allow' }, () => visited.push('before_agent')),
      makeHook('before_settle', { behavior: 'allow' }, () => visited.push('before_settle')),
      makeHook('after_settle', { behavior: 'allow' }, () => visited.push('after_settle')),
      makeHook('after_turn', { behavior: 'allow' }, () => visited.push('after_turn')),
    ];
    const result = await runGuardPipeline(hooks, emptyContext);
    expect(result.behavior).toBe('allow');
    expect(visited).toEqual(['before_prompt', 'before_agent', 'before_settle', 'after_settle', 'after_turn']);
  });
});
