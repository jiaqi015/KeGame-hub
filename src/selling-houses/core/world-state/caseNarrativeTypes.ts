export const TONES = ['accent', 'danger', 'success'] as const;
export type Tone = (typeof TONES)[number];

export const STORYLINE_STATES = ['healthy', 'fragile', 'sliding', 'critical'] as const;
export type StorylineState = (typeof STORYLINE_STATES)[number];

export const GOAL_TIERS = ['core', 'important', 'normal'] as const;
export type GoalTier = (typeof GOAL_TIERS)[number];

const TONE_SET: ReadonlySet<string> = new Set(TONES);
export function isTone(value: unknown): value is Tone {
  return typeof value === 'string' && TONE_SET.has(value);
}

const STORYLINE_STATE_SET: ReadonlySet<string> = new Set(STORYLINE_STATES);
export function isStorylineState(value: unknown): value is StorylineState {
  return typeof value === 'string' && STORYLINE_STATE_SET.has(value);
}

const GOAL_TIER_SET: ReadonlySet<string> = new Set(GOAL_TIERS);
export function isGoalTier(value: unknown): value is GoalTier {
  return typeof value === 'string' && GOAL_TIER_SET.has(value);
}
