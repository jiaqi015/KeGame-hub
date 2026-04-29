import type { ActionCategoryId, ActionMetricKey } from '../../../domain/models.js';
import type { BusinessFlowId } from '../business-flows/types.js';
import type { DecisionMomentId } from '../decision-moments/types.js';

export interface ActionSpecDefinition {
  id: string;
  legacyActionId: string;
  executorId: string;
  categoryId?: ActionCategoryId;
  name: string;
  summary?: string;
  templateId?: string;
  executionMode: 'direct' | 'scenario';
  durationHours?: number;
  costEnergy: number;
  costPromotionBudget: number;
  metricFocus: ActionMetricKey[];
  decisionMomentIds: DecisionMomentId[];
  businessFlowIds: BusinessFlowId[];
}
