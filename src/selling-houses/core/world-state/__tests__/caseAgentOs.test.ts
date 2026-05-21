import { describe, expect, it } from 'vitest';
import { buildCaseAgentOsRunPlan } from '../agents/caseAgentOs.js';

describe('CaseAgentOS', () => {
  it('preconfigures Claude-Code-style tools, hooks, and settlement boundaries', () => {
    const plan = buildCaseAgentOsRunPlan({ channel: 'wechat' });

    expect(plan.mode).toBe('hybrid');
    expect(plan.contextPackRequired).toBe(true);
    expect(plan.tools.find((tool) => tool.toolId === 'case.getFullContext')?.permission).toBe('read');
    expect(plan.tools.find((tool) => tool.toolId === 'dialogue.proposeEffect')?.permission).toBe('proposal');
    expect(plan.tools.find((tool) => tool.toolId === 'state.writeDirectly')?.permission).toBe('forbidden');
    expect(plan.hooks.map((hook) => hook.hookId)).toContain('dialogue-redline-guard');
    expect(plan.hooks.map((hook) => hook.hookId)).toContain('engine-settlement-only');
    expect(plan.outputContract.join('\n')).toContain('GameState 写入只能发生在 domain/application settlement');
  });
});
