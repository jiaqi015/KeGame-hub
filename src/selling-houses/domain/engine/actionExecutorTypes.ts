import type {
  ActionDefinition,
  Case,
  GameState,
} from '../models.js';
import type { ActionExecutionResult } from './actionExecutionResult.js';

export type ActionExecutionContext = {
  state: GameState;
  action: ActionDefinition;
  caseItem: Case;
  optionId: string | null;
  meta?: unknown;
  onMessage?: (msg: string) => void;
};

export type ActionExecutor = (ctx: ActionExecutionContext) => ActionExecutionResult;

export type ActionExecutorMap = Record<string, ActionExecutor>;
