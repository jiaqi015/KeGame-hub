export {AVAILABLE_MODELS} from '../lib/models.js';
export type {AIModel, ModelChannel} from '../lib/models.js';
export type {ActivationWorkspaceId} from '../lib/activation.js';

export interface ComparisonResult {
  modelId: string;
  result: string;
  status: 'idle' | 'thinking' | 'completed' | 'error';
  reasoning?: string;
}
