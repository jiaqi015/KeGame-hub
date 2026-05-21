import { describe, expect, it } from 'vitest';

import {
  buildAgentPersonaPromptPack,
  listAgentPersonaCatalogEntries,
  resolveAgentPersonaCatalogEntry,
} from '../agents/agentPersonaCatalog.js';

describe('agent persona catalog', () => {
  it('exposes the five canonical personas in stable order', () => {
    const roles = listAgentPersonaCatalogEntries().map((entry) => entry.roleId);

    expect(roles).toEqual(['owner', 'customer', 'manager', 'broker', 'world']);
  });

  it('maps role aliases to the canonical persona entry', () => {
    const manager = resolveAgentPersonaCatalogEntry('store_manager');
    const broker = resolveAgentPersonaCatalogEntry('agent');
    const aliasPack = buildAgentPersonaPromptPack('store_manager');

    expect(manager.roleId).toBe('manager');
    expect(manager.roleLabel).toContain('经理');
    expect(broker.roleId).toBe('broker');
    expect(broker.replyStyleLines.join('\n')).toContain('微信');
    expect(aliasPack.resolvedRoleId).toBe('manager');
    expect(aliasPack.fallbackApplied).toBe(false);
  });

  it('falls back to broker for unknown roles and keeps the prompt pack usable', () => {
    const pack = buildAgentPersonaPromptPack('mystery-role');

    expect(pack.resolvedRoleId).toBe('broker');
    expect(pack.fallbackApplied).toBe(true);
    expect(pack.persona.roleId).toBe('broker');
    expect(pack.systemPromptLines.join('\n')).toContain('经纪人');
    expect(pack.recoveryRulesLines.join('\n')).toContain('下一步');
  });
});
