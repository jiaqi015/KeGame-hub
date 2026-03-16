export type ModelChannel = 'china' | 'global';
export type ModelProvider = 'ark' | 'ikun';

export interface AIModel {
  id: string;
  name: string;
  channel: ModelChannel;
  category: string;
  description: string;
  provider: ModelProvider;
  upstreamModel: string;
  enabled: boolean;
}

export const MODEL_CONFIGS: AIModel[] = [
  {
    id: 'doubao-seed-2-0-lite-260215',
    name: 'Doubao Seed 2.0 Lite',
    channel: 'china',
    category: 'Doubao',
    description: '火山官方快速入门默认文本模型',
    provider: 'ark',
    upstreamModel: 'doubao-seed-2-0-lite-260215',
    enabled: true,
  },
  {
    id: 'deepseek-v3-2-251201',
    name: 'DeepSeek V3.2',
    channel: 'china',
    category: 'DeepSeek',
    description: '火山在售的 DeepSeek 文本模型',
    provider: 'ark',
    upstreamModel: 'deepseek-v3-2-251201',
    enabled: true,
  },
  {
    id: 'glm-4-7-251222',
    name: 'GLM 4.7',
    channel: 'china',
    category: 'Zhipu',
    description: '火山在售的智谱文本模型',
    provider: 'ark',
    upstreamModel: 'glm-4-7-251222',
    enabled: true,
  },
  {
    id: 'kimi-k2-250905',
    name: 'Kimi K2',
    channel: 'china',
    category: 'Moonshot',
    description: '火山在售的 Kimi 文本模型',
    provider: 'ark',
    upstreamModel: 'kimi-k2-250905',
    enabled: true,
  },
  {
    id: 'gpt5.4',
    name: 'GPT 5.4',
    channel: 'global',
    category: 'OpenAI',
    description: 'IKunCode 目标模型，当前 key 未返回此模型',
    provider: 'ikun',
    upstreamModel: 'gpt5.4',
    enabled: false,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    channel: 'global',
    category: 'Anthropic',
    description: 'IKunCode 目标模型，当前 key 未返回此模型',
    provider: 'ikun',
    upstreamModel: 'claude-sonnet-4-6',
    enabled: false,
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview',
    channel: 'global',
    category: 'Google',
    description: 'IKunCode 目标模型，当前 key 未返回此模型',
    provider: 'ikun',
    upstreamModel: 'gemini-3.1-pro-preview',
    enabled: false,
  },
];

export const AVAILABLE_MODELS = MODEL_CONFIGS.filter((model) => model.enabled);
export const AVAILABLE_MODEL_IDS = new Set(AVAILABLE_MODELS.map((model) => model.id));
export const MODEL_CONFIG_MAP = new Map(MODEL_CONFIGS.map((model) => [model.id, model]));
