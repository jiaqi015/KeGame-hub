import {type CSSProperties, startTransition, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Cpu,
  Layers3,
  RefreshCw,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import {
  MODEL_LIBRARY,
  PROMPT_PRESETS,
  ZERO_SCORES,
  type ComparisonResult,
  type ModelProfile,
  type ScoreMap,
} from './types';

type PromptMode = 'build' | 'launch' | 'narrative' | 'research';

const SCORE_LABELS: Array<{key: keyof ScoreMap; label: string}> = [
  {key: 'structure', label: 'Structure'},
  {key: 'reasoning', label: 'Reasoning'},
  {key: 'speed', label: 'Speed'},
  {key: 'voice', label: 'Voice'},
];

const MODE_SCORE_BOOSTS: Record<PromptMode, ScoreMap> = {
  build: {structure: 4, reasoning: 3, speed: 1, voice: 0},
  launch: {structure: 2, reasoning: 1, speed: 1, voice: 4},
  narrative: {structure: 0, reasoning: 1, speed: 0, voice: 5},
  research: {structure: 1, reasoning: 5, speed: 0, voice: 1},
};

const MODE_COPY: Record<
  PromptMode,
  {label: string; framing: string; action: string; tag: string}
> = {
  build: {
    label: 'build spec',
    framing: 'translates the brief into interface blocks, delivery phases, and crisp implementation notes',
    action: 'a builder-friendly read of the scope',
    tag: 'Build-ready',
  },
  launch: {
    label: 'launch plan',
    framing: 'leans into positioning, sequencing, and audience momentum',
    action: 'a go-to-market shaped answer',
    tag: 'Launch angle',
  },
  narrative: {
    label: 'brand story',
    framing: 'amplifies tone, story, and visual character',
    action: 'a sharper creative direction',
    tag: 'Story polish',
  },
  research: {
    label: 'research brief',
    framing: 'stretches into tradeoffs, assumptions, and evidence trails',
    action: 'a more analytical synthesis',
    tag: 'Research mode',
  },
};

function clampScore(value: number) {
  return Math.max(64, Math.min(98, value));
}

function getPromptMode(prompt: string): PromptMode {
  const normalized = prompt.toLowerCase();
  if (
    normalized.includes('build') ||
    normalized.includes('spec') ||
    normalized.includes('architecture') ||
    normalized.includes('implementation') ||
    normalized.includes('react') ||
    normalized.includes('vercel')
  ) {
    return 'build';
  }
  if (
    normalized.includes('launch') ||
    normalized.includes('positioning') ||
    normalized.includes('rollout') ||
    normalized.includes('growth')
  ) {
    return 'launch';
  }
  if (
    normalized.includes('creative') ||
    normalized.includes('brand') ||
    normalized.includes('story') ||
    normalized.includes('landing page')
  ) {
    return 'narrative';
  }
  return 'research';
}

function seededOffset(input: string, divisor: number) {
  const sum = Array.from(input).reduce(
    (total, character, index) => total + character.charCodeAt(0) * (index + 1),
    0,
  );
  return (sum % divisor) - Math.floor(divisor / 2);
}

function totalScore(scores: ScoreMap) {
  return scores.structure + scores.reasoning + scores.speed + scores.voice;
}

function buildResult(model: ModelProfile, prompt: string): ComparisonResult {
  const mode = getPromptMode(prompt);
  const boost = MODE_SCORE_BOOSTS[mode];
  const voiceShift = seededOffset(`${model.id}:${prompt}`, 7);
  const speedShift = seededOffset(`${prompt}:${model.provider}`, 5);

  const scores: ScoreMap = {
    structure: clampScore(model.baseScores.structure + boost.structure + seededOffset(prompt, 5)),
    reasoning: clampScore(model.baseScores.reasoning + boost.reasoning + seededOffset(model.name, 5)),
    speed: clampScore(model.baseScores.speed + boost.speed + speedShift),
    voice: clampScore(model.baseScores.voice + boost.voice + voiceShift),
  };

  const modeCopy = MODE_COPY[mode];
  const promptPreview = prompt.trim().replace(/\s+/g, ' ').slice(0, 84);

  return {
    modelId: model.id,
    status: 'ready',
    headline: `${model.name} pushes the brief through ${model.lens}.`,
    summary: `For this ${modeCopy.label}, ${model.name} ${modeCopy.framing}. The output would feel like ${modeCopy.action}, with ${model.summary.toLowerCase()}`,
    verdict: `Use it when you want ${model.bestFor}. Prompt lens: "${promptPreview}${promptPreview.length >= 84 ? '…' : ''}"`,
    strengths: [modeCopy.tag, ...model.traits],
    scores,
    latencyLabel: `${model.latency} turnaround`,
  };
}

function createThinkingState(modelId: string): ComparisonResult {
  return {
    modelId,
    status: 'thinking',
    headline: '',
    summary: '',
    verdict: '',
    strengths: [],
    scores: ZERO_SCORES,
    latencyLabel: 'Warming up',
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function App() {
  const [prompt, setPrompt] = useState(PROMPT_PRESETS[1].prompt);
  const [activePreset, setActivePreset] = useState(PROMPT_PRESETS[1].id);
  const [selectedModels, setSelectedModels] = useState<string[]>([
    'doubao-seed-2.0-code',
    'deepseek-v3.2',
    'global-gpt-4o',
    'global-claude-3-5-sonnet',
  ]);
  const [results, setResults] = useState<Record<string, ComparisonResult>>({});
  const [isRunning, setIsRunning] = useState(false);

  const selectedProfiles = selectedModels
    .map((id) => MODEL_LIBRARY.find((model) => model.id === id))
    .filter(Boolean) as ModelProfile[];

  const completedResults = selectedProfiles
    .map((model) => results[model.id])
    .filter((result): result is ComparisonResult => Boolean(result && result.status === 'ready'));

  const leader = [...completedResults].sort(
    (left, right) => totalScore(right.scores) - totalScore(left.scores),
  )[0];

  const toggleModel = (id: string) => {
    setSelectedModels((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const applyPreset = (presetId: string) => {
    const preset = PROMPT_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setActivePreset(preset.id);
    setPrompt(preset.prompt);
    setResults({});
  };

  const runComparison = async () => {
    if (!prompt.trim() || selectedModels.length === 0 || isRunning) return;

    setIsRunning(true);
    setResults(
      Object.fromEntries(selectedModels.map((modelId) => [modelId, createThinkingState(modelId)])),
    );

    await Promise.all(
      selectedModels.map(async (modelId, index) => {
        const model = MODEL_LIBRARY.find((item) => item.id === modelId);
        if (!model) return;

        await sleep(420 + index * 180);
        const nextResult = buildResult(model, prompt);
        startTransition(() => {
          setResults((current) => ({...current, [modelId]: nextResult}));
        });
      }),
    );

    setIsRunning(false);
  };

  const resetBoard = () => {
    setResults({});
    setIsRunning(false);
  };

  return (
    <div className="page-shell">
      <div className="backdrop-glow glow-a" />
      <div className="backdrop-glow glow-b" />

      <header className="hero-grid">
        <section className="panel hero-panel">
          <div className="eyebrow">
            <Sparkles size={16} />
            Sabrina / Vercel-ready preview project
          </div>
          <div className="hero-copy">
            <h1>Design a model-comparison product that already feels deployable.</h1>
            <p>
              Sabrina is now a polished front-end concept: a prompt studio, model board, and
              scoring surface you can push to GitHub and open on Vercel immediately.
            </p>
          </div>

          <div className="hero-metrics">
            <div className="metric-card">
              <span>Project mode</span>
              <strong>Static Vite app</strong>
              <p>No server dependency. Clean Vercel deploy path.</p>
            </div>
            <div className="metric-card">
              <span>Current stack</span>
              <strong>React 19 + Motion</strong>
              <p>Optimized for preview deployments and rapid iteration.</p>
            </div>
            <div className="metric-card">
              <span>Selection</span>
              <strong>{selectedModels.length} models active</strong>
              <p>Mix China Stack and Global Stack cards in one board.</p>
            </div>
          </div>

          <div className="preset-strip">
            {PROMPT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={`preset-chip ${activePreset === preset.id ? 'is-active' : ''}`}
                onClick={() => applyPreset(preset.id)}
              >
                <span>{preset.label}</span>
                <small>{preset.note}</small>
              </button>
            ))}
          </div>
        </section>

        <aside className="panel signal-panel">
          <div className="panel-heading">
            <span className="eyebrow muted">
              <Layers3 size={16} />
              Signal board
            </span>
            <h2>Deployment-minded product shell.</h2>
          </div>

          <div className="signal-list">
            <div className="signal-item">
              <BrainCircuit size={18} />
              <div>
                <strong>Interactive demo flow</strong>
                <p>Prompt presets, model toggles, staged comparison cards.</p>
              </div>
            </div>
            <div className="signal-item">
              <Cpu size={18} />
              <div>
                <strong>Deploy-ready front end</strong>
                <p>Vite build output with explicit Vercel project config.</p>
              </div>
            </div>
            <div className="signal-item">
              <Clock3 size={18} />
              <div>
                <strong>Fast validation loop</strong>
                <p>One command to build, one command to preview on Vercel.</p>
              </div>
            </div>
          </div>

          {leader ? (
            <div className="leader-card">
              <div className="leader-header">
                <span>Current leader</span>
                <CheckCircle2 size={16} />
              </div>
              <strong>{selectedProfiles.find((model) => model.id === leader.modelId)?.name}</strong>
              <p>{leader.headline}</p>
              <div className="leader-score">{Math.round(totalScore(leader.scores) / 4)}/100 average</div>
            </div>
          ) : (
            <div className="leader-card is-empty">
              <div className="leader-header">
                <span>Current leader</span>
                <CircleDashed size={16} />
              </div>
              <strong>No run yet</strong>
              <p>Launch the board to generate scored model notes.</p>
            </div>
          )}
        </aside>
      </header>

      <section className="workspace-grid">
        <section className="panel composer-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow muted">
                <WandSparkles size={16} />
                Prompt studio
              </span>
              <h2>Shape the brief</h2>
            </div>
            <button className="ghost-button" onClick={resetBoard}>
              <RefreshCw size={15} />
              Reset board
            </button>
          </div>

          <textarea
            className="prompt-input"
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              setActivePreset('');
            }}
            placeholder="Describe the product angle you want the models to respond to."
          />

          <div className="composer-footer">
            <div className="prompt-meta">
              <span>{Array.from(prompt).length} chars</span>
              <span>{selectedModels.length} models selected</span>
            </div>
            <button
              className="primary-button"
              disabled={!prompt.trim() || selectedModels.length === 0 || isRunning}
              onClick={runComparison}
            >
              {isRunning ? <CircleDashed size={16} className="spin" /> : <ArrowUpRight size={16} />}
              Run Sabrina board
            </button>
          </div>
        </section>

        <section className="panel models-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow muted">
                <Cpu size={16} />
                Model selection
              </span>
              <h2>Pick the voices</h2>
            </div>
            <span className="selection-pill">{selectedModels.length} active</span>
          </div>

          <div className="model-grid">
            {MODEL_LIBRARY.map((model) => {
              const selected = selectedModels.includes(model.id);
              return (
                <button
                  key={model.id}
                  className={`model-card ${selected ? 'is-selected' : ''}`}
                  style={{'--accent': model.accent} as CSSProperties}
                  onClick={() => toggleModel(model.id)}
                >
                  <div className="model-card-top">
                    <span className="track-pill">{model.track}</span>
                    {selected ? <CheckCircle2 size={16} /> : <CircleDashed size={16} />}
                  </div>
                  <strong>{model.name}</strong>
                  <span className="model-provider">{model.provider}</span>
                  <p>{model.summary}</p>
                </button>
              );
            })}
          </div>
        </section>
      </section>

      <section className="results-section">
        <div className="results-head">
          <div>
            <span className="eyebrow muted">
              <Layers3 size={16} />
              Result board
            </span>
            <h2>Scores, summaries, and where each model fits.</h2>
          </div>
          <div className="results-summary">
            {leader ? (
              <>
                <span>Leading pick</span>
                <strong>{selectedProfiles.find((model) => model.id === leader.modelId)?.name}</strong>
              </>
            ) : (
              <>
                <span>Board state</span>
                <strong>Ready for first run</strong>
              </>
            )}
          </div>
        </div>

        <div className="results-grid">
          <AnimatePresence>
            {selectedProfiles.map((model, index) => {
              const result = results[model.id];
              const isLeader = leader?.modelId === model.id;
              return (
                <motion.article
                  key={model.id}
                  layout
                  initial={{opacity: 0, y: 24}}
                  animate={{opacity: 1, y: 0}}
                  transition={{delay: index * 0.04}}
                  className={`result-card ${isLeader ? 'is-leader' : ''}`}
                  style={{'--accent': model.accent} as CSSProperties}
                >
                  <div className="result-head">
                    <div>
                      <span className="result-track">{model.track}</span>
                      <h3>{model.name}</h3>
                      <p>{model.provider}</p>
                    </div>
                    <div className={`status-pill ${result?.status === 'ready' ? 'is-ready' : ''}`}>
                      {result?.status === 'ready' ? <CheckCircle2 size={14} /> : <CircleDashed size={14} />}
                      {result?.status === 'ready' ? 'Ready' : result?.status === 'thinking' ? 'Thinking' : 'Idle'}
                    </div>
                  </div>

                  {result?.status === 'thinking' ? (
                    <div className="thinking-block">
                      <div className="skeleton-line short" />
                      <div className="skeleton-line" />
                      <div className="skeleton-line medium" />
                    </div>
                  ) : result?.status === 'ready' ? (
                    <div className="result-body">
                      <div className="copy-block">
                        <strong>{result.headline}</strong>
                        <p>{result.summary}</p>
                        <p className="verdict">{result.verdict}</p>
                      </div>

                      <div className="strength-list">
                        {result.strengths.map((strength) => (
                          <span key={strength} className="strength-pill">
                            {strength}
                          </span>
                        ))}
                      </div>

                      <div className="score-list">
                        {SCORE_LABELS.map(({key, label}) => (
                          <div key={key} className="score-row">
                            <div className="score-label">
                              <span>{label}</span>
                              <strong>{result.scores[key]}</strong>
                            </div>
                            <div className="score-track">
                              <div
                                className="score-fill"
                                style={{width: `${result.scores[key]}%`}}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="result-footer">
                        <span>{result.latencyLabel}</span>
                        {isLeader ? <strong>Top score</strong> : <span>Board candidate</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="idle-block">
                      <strong>{model.bestFor}</strong>
                      <p>{model.summary}</p>
                    </div>
                  )}
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      </section>

      <footer className="footer-note">
        <span>Built to push from Git and deploy to a new Vercel project without extra backend setup.</span>
      </footer>
    </div>
  );
}
