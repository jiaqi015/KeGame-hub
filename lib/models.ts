export type ModelChannel = 'china' | 'global';
export type ModelProvider = 'ark' | 'ikun' | 'hunyuan' | 'dashscope';

export interface AIModel {
  id: string;
  name: string;
  channel: ModelChannel;
  category: string;
  description: string;
  provider: ModelProvider;
  upstreamModel: string;
  enabled: boolean;
  visible?: boolean;
}

export const MODEL_CONFIGS: AIModel[] = [
  {
    id: 'doubao-seed-2-0-lite-260215',
    name: 'Doubao Seed 2.0 Lite',
    channel: 'china',
    category: '豆包',
    description: '字节豆包通用文本模型，适合日常问答与改写',
    provider: 'ark',
    upstreamModel: 'doubao-seed-2-0-lite-260215',
    enabled: true,
  },
  {
    id: 'doubao-seed-2-0-pro-260215',
    name: 'Doubao-Seed-2.0-pro',
    channel: 'china',
    category: '豆包',
    description: '豆包高阶版本，用于更强总结与深度分析',
    provider: 'ark',
    upstreamModel: 'doubao-seed-2-0-pro-260215',
    enabled: true,
    visible: false,
  },
  {
    id: 'deepseek-v3-2-251201',
    name: 'DeepSeek V3.2',
    channel: 'china',
    category: 'DeepSeek',
    description: 'DeepSeek 通用模型，代码与推理表现突出',
    provider: 'ark',
    upstreamModel: 'deepseek-v3-2-251201',
    enabled: true,
  },
  {
    id: 'glm-4-7-251222',
    name: 'GLM 4.7',
    channel: 'china',
    category: '智谱',
    description: '智谱旗舰通用模型，中文表达自然稳定',
    provider: 'ark',
    upstreamModel: 'glm-4-7-251222',
    enabled: true,
  },
  {
    id: 'hunyuan-2-0-thinking-20251109',
    name: 'Hunyuan 2.0 Thinking',
    channel: 'china',
    category: '元宝',
    description: '腾讯混元深度推理模型，适合复杂逻辑任务',
    provider: 'hunyuan',
    upstreamModel: 'hunyuan-2.0-thinking-20251109',
    enabled: true,
  },
  {
    id: 'qwen3-5-plus-2026-02-15',
    name: 'Qwen 3.5 Plus',
    channel: 'china',
    category: '千问',
    description: '阿里千问增强模型，综合能力更均衡',
    provider: 'dashscope',
    upstreamModel: 'qwen3.5-plus-2026-02-15',
    enabled: true,
  },
  {
    id: 'gpt5.4',
    name: 'GPT 5.4',
    channel: 'global',
    category: 'OpenAI',
    description: 'OpenAI 主力模型，需要对应渠道 Key',
    provider: 'ikun',
    upstreamModel: 'gpt5.4',
    enabled: false,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    channel: 'global',
    category: 'Claude',
    description: 'Claude 系列主力模型，需要对应渠道 Key',
    provider: 'ikun',
    upstreamModel: 'claude-sonnet-4-6',
    enabled: false,
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview',
    channel: 'global',
    category: 'Gemini',
    description: 'Gemini Pro 预览模型，需要对应渠道 Key',
    provider: 'ikun',
    upstreamModel: 'gemini-3.1-pro-preview',
    enabled: false,
  },
];

export const AVAILABLE_MODELS = MODEL_CONFIGS.filter((model) => model.enabled && model.visible !== false);
export const AVAILABLE_MODEL_IDS = new Set(AVAILABLE_MODELS.map((model) => model.id));
export const MODEL_CONFIG_MAP = new Map(MODEL_CONFIGS.map((model) => [model.id, model]));
