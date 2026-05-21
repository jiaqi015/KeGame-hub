import { describe, expect, it } from 'vitest';
import {
  listAgentPromptPresets,
  resolveAgentPromptPreset,
} from '../agents/promptCatalog.js';

describe('agent prompt catalog', () => {
  it('preloads reusable prompt presets for dialogue, scenario, and world agents', () => {
    expect(resolveAgentPromptPreset('wechat.ownerDialogue')?.channel).toBe('wechat');
    expect(resolveAgentPromptPreset('wechat.brokerDialogue')?.roleLabel).toContain('经纪人');
    expect(resolveAgentPromptPreset('scenario.openDay')?.channel).toBe('open_day');
    expect(resolveAgentPromptPreset('scenario.sincereSale')?.requiredToolsets).toContain('scenario-simulation');
    expect(resolveAgentPromptPreset('world.dailyTick')?.requiredToolsets).toContain('world-engine');
  });

  it('filters presets by channel without losing the dual-mode contract', () => {
    const wechatPresets = listAgentPromptPresets({ channel: 'wechat' });
    const names = wechatPresets.map((preset) => preset.presetId);

    expect(names).toContain('wechat.ownerDialogue');
    expect(names).toContain('wechat.customerDialogue');
    expect(names).not.toContain('scenario.openDay');
    expect(wechatPresets.every((preset) => preset.outputContractLines.join('\n').includes('proposal'))).toBe(true);
  });
});
