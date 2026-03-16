export type ModelTrack = 'China Stack' | 'Global Stack';

export interface ScoreMap {
  structure: number;
  reasoning: number;
  speed: number;
  voice: number;
}

export interface ModelProfile {
  id: string;
  name: string;
  provider: string;
  track: ModelTrack;
  accent: string;
  latency: string;
  summary: string;
  lens: string;
  bestFor: string;
  traits: string[];
  baseScores: ScoreMap;
}

export interface PromptPreset {
  id: string;
  label: string;
  note: string;
  prompt: string;
}

export interface ComparisonResult {
  modelId: string;
  status: 'thinking' | 'ready';
  headline: string;
  summary: string;
  verdict: string;
  strengths: string[];
  scores: ScoreMap;
  latencyLabel: string;
}

export const ZERO_SCORES: ScoreMap = {
  structure: 0,
  reasoning: 0,
  speed: 0,
  voice: 0,
};

export const MODEL_LIBRARY: ModelProfile[] = [
  {
    id: 'doubao-seed-2.0-code',
    name: 'Doubao Seed 2.0 Code',
    provider: 'Doubao',
    track: 'China Stack',
    accent: '#ff7a45',
    latency: 'Fast',
    summary: 'Leans into executable plans and code-aware scaffolding.',
    lens: 'practical implementation',
    bestFor: 'shipping ideas into concrete scopes',
    traits: ['Implementation-first', 'Tidy scaffolds', 'Strong handoff'],
    baseScores: {structure: 88, reasoning: 84, speed: 91, voice: 74},
  },
  {
    id: 'deepseek-v3.2',
    name: 'DeepSeek V3.2',
    provider: 'DeepSeek',
    track: 'China Stack',
    accent: '#ef4444',
    latency: 'Measured',
    summary: 'Systematic and analytical, with a bias toward edge-case coverage.',
    lens: 'risk mapping',
    bestFor: 'stress-testing plans before implementation',
    traits: ['Edge cases', 'Structured depth', 'Engineering mindset'],
    baseScores: {structure: 86, reasoning: 92, speed: 77, voice: 70},
  },
  {
    id: 'kimi-k2.5',
    name: 'Kimi K2.5',
    provider: 'Moonshot',
    track: 'China Stack',
    accent: '#f59e0b',
    latency: 'Balanced',
    summary: 'Comfortable with long narratives, research synthesis, and context stitching.',
    lens: 'long-context synthesis',
    bestFor: 'turning scattered material into a single story',
    traits: ['Long context', 'Research blend', 'Audience framing'],
    baseScores: {structure: 82, reasoning: 85, speed: 80, voice: 86},
  },
  {
    id: 'global-gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    track: 'Global Stack',
    accent: '#10b981',
    latency: 'Fast',
    summary: 'Balanced generalist with strong product instinct and concise framing.',
    lens: 'product synthesis',
    bestFor: 'high-signal drafts that need minimal cleanup',
    traits: ['Product sense', 'Clean framing', 'Reliable balance'],
    baseScores: {structure: 89, reasoning: 88, speed: 89, voice: 83},
  },
  {
    id: 'global-claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    track: 'Global Stack',
    accent: '#8b5cf6',
    latency: 'Measured',
    summary: 'Calm, nuanced, and especially good at editorial polish.',
    lens: 'editorial clarity',
    bestFor: 'refining fuzzy requests into articulate directions',
    traits: ['Nuance', 'Polished writing', 'Thoughtful tradeoffs'],
    baseScores: {structure: 85, reasoning: 89, speed: 78, voice: 92},
  },
  {
    id: 'global-gemini-2-0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'Google',
    track: 'Global Stack',
    accent: '#0ea5e9',
    latency: 'Instant',
    summary: 'High-tempo responses with a bias for breadth and quick ideation.',
    lens: 'rapid ideation',
    bestFor: 'getting many directions on the table quickly',
    traits: ['High tempo', 'Breadth first', 'Creative spread'],
    baseScores: {structure: 80, reasoning: 79, speed: 95, voice: 84},
  },
];

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'launch',
    label: 'Launch Plan',
    note: 'Positioning and GTM',
    prompt:
      'Design a launch strategy for Sabrina: define positioning, target users, a landing page narrative, and a two-week rollout plan for developer communities.',
  },
  {
    id: 'build',
    label: 'Build Spec',
    note: 'Execution blueprint',
    prompt:
      'Turn Sabrina into a build-ready spec: define the product architecture, the homepage sections, key states, and an implementation checklist for a Vercel-ready React app.',
  },
  {
    id: 'story',
    label: 'Brand Story',
    note: 'Narrative direction',
    prompt:
      'Write a crisp creative direction for Sabrina that makes AI model comparison feel premium, human, and visually memorable across desktop and mobile.',
  },
];
