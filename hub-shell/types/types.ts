export {AVAILABLE_MODELS} from '../../core-workspaces/sabrina/lib/models.js';
export type {AIModel, ModelChannel} from '../../core-workspaces/sabrina/lib/models.js';
export type {ActivationWorkspaceId} from '../lib/workspaces.js';

export interface ComparisonResult {
  modelId: string;
  result: string;
  status: 'idle' | 'thinking' | 'completed' | 'error';
  reasoning?: string;
}
