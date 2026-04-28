import type { Case, GameState } from '../../../domain/models';
import { ACTIONS } from '../../../domain/actions/definitions';
import {
  getActionTemplate,
  type ScenarioActionTemplate,
  type ScenarioChoice,
  type CharacterFeedback,
  type Settlement,
} from '../../../domain/actions/templates';
import type { ActionDecisionConfig } from '../ActionDecisionOverlay';

type QuickMatterCompletion = {
  settlement: Settlement;
  choices: ScenarioChoice[];
  feedbacks: CharacterFeedback[];
};

function isScenarioTemplate(template: ReturnType<typeof getActionTemplate>): template is ScenarioActionTemplate {
  return 'resolveOutcome' in template;
}

export function buildQuickMatterScenarioCompletion(
  config: ActionDecisionConfig,
  optionId: string,
  state?: GameState,
  caseItem?: Case,
): QuickMatterCompletion {
  const option = config.options.find((entry) => entry.id === optionId);
  const choices: ScenarioChoice[] = [{ round: 1, main: optionId, assist: '' }];
  const action = ACTIONS.find((entry) => entry.id === config.actionId);
  const template = action ? getActionTemplate(action) : null;

  if (template && isScenarioTemplate(template) && state && caseItem) {
    const feedback = template.rounds?.[0]?.getFeedback(optionId, '', state, caseItem)
      ?? template.getFeedback?.(optionId, '', state, caseItem);
    const feedbacks = feedback ? [feedback] : [];
    return {
      settlement: template.resolveOutcome(choices, feedbacks, state, caseItem),
      choices,
      feedbacks,
    };
  }

  return {
    settlement: {
      outcome: 'progress',
      title: option?.title || config.title,
      summary: option?.note || config.summary,
      details: option?.note ? [option.note] : [],
      stateDeltas: [],
      nextActionHint: '回到工作台查看今日进展。',
      finalOptionId: optionId,
    },
    choices,
    feedbacks: [],
  };
}
