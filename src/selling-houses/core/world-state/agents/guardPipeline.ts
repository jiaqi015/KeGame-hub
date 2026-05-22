export type GuardBehavior = 'allow' | 'deny' | 'ask';

export interface GuardResult {
  readonly behavior: GuardBehavior;
  readonly reason?: string;
}

export interface GuardContext {
  readonly [key: string]: unknown;
}

export interface GuardHook {
  readonly hookId: string;
  execute(context: GuardContext): GuardResult | Promise<GuardResult>;
}

const ALLOW: GuardResult = Object.freeze({ behavior: 'allow' });

export async function runGuardPipeline(
  hooks: readonly GuardHook[],
  context: GuardContext,
): Promise<GuardResult> {
  if (hooks.length === 0) return ALLOW;

  let lastResult: GuardResult = ALLOW;
  for (const hook of hooks) {
    const result = await hook.execute(context);
    if (result.behavior === 'deny') return result;
    lastResult = result;
  }
  return lastResult;
}
