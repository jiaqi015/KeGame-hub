export type ModelChannel = 'ark' | 'global';

export interface AIModel {
  id: string;
  name: string;
  channel: ModelChannel;
  category: string; // e.g., 'OpenAI', 'Google', 'DeepSeek'
  description: string;
}

export const AVAILABLE_MODELS: AIModel[] = [
  // Ark Channel (China - Volcengine Coding Plan)
  { id: 'doubao-seed-2.0-code', name: 'Doubao Seed 2.0 Code', channel: 'ark', category: 'Doubao', description: '最新 2.0 版代码模型' },
  { id: 'doubao-seed-2.0-pro', name: 'Doubao Seed 2.0 Pro', channel: 'ark', category: 'Doubao', description: '强逻辑推理专业版' },
  { id: 'doubao-seed-2.0-lite', name: 'Doubao Seed 2.0 Lite', channel: 'ark', category: 'Doubao', description: '极速代码补全' },
  { id: 'deepseek-v3.2', name: 'DeepSeek V3.2', channel: 'ark', category: 'DeepSeek', description: '强力开源代码模型' },
  { id: 'glm-4.7', name: 'GLM 4.7', channel: 'ark', category: 'Zhipu', description: '智谱国产之光' },
  { id: 'kimi-k2.5', name: 'Kimi K2.5', channel: 'ark', category: 'Moonshot', description: '超长上下文专家' },
  { id: 'minimax-m2.5', name: 'MiniMax M2.5', channel: 'ark', category: 'MiniMax', description: '角色扮演与逻辑' },
  
  // Global Channel (Overseas)
  { id: 'global-gpt-4o', name: 'GPT-4o', channel: 'global', category: 'OpenAI', description: '全能旗舰模型' },
  { id: 'global-claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', channel: 'global', category: 'Anthropic', description: '编程专家' },
  { id: 'global-gemini-2-0-flash', name: 'Gemini 2.0 Flash', channel: 'global', category: 'Google', description: '极速响应' },
  { id: 'global-o1-preview', name: 'OpenAI o1-preview', channel: 'global', category: 'OpenAI', description: '深度推理' },
];

export interface ComparisonResult {
  modelId: string;
  result: string;
  status: 'idle' | 'thinking' | 'completed' | 'error';
}
