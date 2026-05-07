import {getAiAgent, listAiAgents, type AiAgentDefinition} from './aiAgents.js';
import {getAiCapability, listAiCapabilities, type AiCapability} from './aiCapabilities.js';
import type {AiCapabilityWorkspace} from './aiInvocationContracts.js';
import {getAiSkill, listAiSkills, type AiSkillManifest} from './aiSkills.js';
import {getAiTool, listAiTools, type AiToolDefinition} from './aiTools.js';

export interface AiPlatformCapabilityView extends AiCapability {
  agent: AiAgentDefinition | null;
  skills: AiSkillManifest[];
  tools: AiToolDefinition[];
}

function hydrateCapability(capability: AiCapability): AiPlatformCapabilityView {
  return {
    ...capability,
    agent: getAiAgent(capability.agentId),
    skills: capability.skillIds
      .map((skillId) => getAiSkill(skillId))
      .filter((skill): skill is AiSkillManifest => Boolean(skill)),
    tools: capability.toolIds
      .map((toolId) => getAiTool(toolId))
      .filter((tool): tool is AiToolDefinition => Boolean(tool)),
  };
}

export function getAiPlatformCapability(capabilityId: string): AiPlatformCapabilityView | null {
  const capability = getAiCapability(capabilityId);
  return capability ? hydrateCapability(capability) : null;
}

export function listAiPlatformCapabilities(workspace: AiCapabilityWorkspace = 'global'): AiPlatformCapabilityView[] {
  return listAiCapabilities(workspace).map(hydrateCapability);
}

export function getAiPlatformManifest(workspace: AiCapabilityWorkspace = 'global') {
  return {
    workspace,
    defaultCoreModelId: 'deepseek-v4-pro',
    capabilities: listAiPlatformCapabilities(workspace),
    agents: listAiAgents(workspace),
    skills: listAiSkills(workspace),
    tools: listAiTools(workspace),
  };
}
