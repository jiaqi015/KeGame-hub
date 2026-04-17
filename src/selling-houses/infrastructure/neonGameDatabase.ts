import { neon } from '@neondatabase/serverless';
import { getBuiltInScenarios, getBuiltInWorld } from '../domain/scenarioCatalog.js';

type SellingHousesSqlClient = ReturnType<typeof neon>;

let schemaReadyPromise: Promise<void> | null = null;

function getConnectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

function getSqlClient(): SellingHousesSqlClient {
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error('缺少 DATABASE_URL / POSTGRES_URL，无法启用云端存档。');
  }

  return neon(connectionString);
}

export const SELLING_HOUSES_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS maintainer_users (
    user_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '匿名资产顾问',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS maintainer_game_runs (
    run_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES maintainer_users(user_id) ON DELETE CASCADE,
    player_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    season_id TEXT NOT NULL DEFAULT 'season-1',
    scenario_id TEXT NULL,
    difficulty_id TEXT NULL,
    world_id TEXT NULL,
    world_version INTEGER NULL,
    rng_seed BIGINT NULL,
    schema_version INTEGER NOT NULL DEFAULT 3,
    day INTEGER NOT NULL DEFAULT 1,
    cash NUMERIC(12, 2) NOT NULL DEFAULT 0,
    energy INTEGER NOT NULL DEFAULT 0,
    reputation NUMERIC(8, 2) NOT NULL DEFAULT 0,
    sold_count INTEGER NOT NULL DEFAULT 0,
    withdrawn_count INTEGER NOT NULL DEFAULT 0,
    score INTEGER NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    scenario_snapshot JSONB NULL,
    save_data JSONB NOT NULL,
    daily_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ NULL,
    last_played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    client_updated_at TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT maintainer_game_runs_status_check
      CHECK (status IN ('active', 'finished', 'abandoned'))
  );

  CREATE TABLE IF NOT EXISTS maintainer_leaderboard_entries (
    run_id TEXT PRIMARY KEY REFERENCES maintainer_game_runs(run_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES maintainer_users(user_id) ON DELETE CASCADE,
    player_name TEXT NOT NULL,
    season_id TEXT NOT NULL DEFAULT 'season-1',
    score INTEGER NOT NULL,
    rank_title TEXT NOT NULL,
    final_stats JSONB NOT NULL,
    score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS seller_profile_definitions (
    seller_profile_code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    default_traits JSONB NOT NULL DEFAULT '{}'::jsonb
  );

  CREATE TABLE IF NOT EXISTS listing_stage_definitions (
    listing_stage_code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS matter_type_definitions (
    type_code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    default_template_code TEXT NULL
  );

  CREATE TABLE IF NOT EXISTS interaction_template_definitions (
    template_code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS event_type_definitions (
    event_type_code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS selling_houses_worlds (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    world_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS selling_houses_scenarios (
    id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL REFERENCES selling_houses_worlds(id) ON DELETE RESTRICT,
    world_version INTEGER NOT NULL,
    difficulty_id TEXT NOT NULL,
    tier INTEGER NOT NULL DEFAULT 1,
    theme TEXT NOT NULL,
    name TEXT NOT NULL,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    scenario_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS selling_houses_progress (
    user_id TEXT NOT NULL,
    scenario_id TEXT NOT NULL REFERENCES selling_houses_scenarios(id) ON DELETE CASCADE,
    best_score INTEGER NULL,
    plays_count INTEGER NOT NULL DEFAULT 0,
    unlocked BOOLEAN NOT NULL DEFAULT FALSE,
    last_played_at TIMESTAMPTZ NULL,
    PRIMARY KEY (user_id, scenario_id)
  );

  CREATE TABLE IF NOT EXISTS maintainer_run_listings (
    run_listing_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES maintainer_game_runs(run_id) ON DELETE CASCADE,
    template_listing_id TEXT NULL,
    title TEXT NOT NULL,
    community TEXT NOT NULL,
    district TEXT NOT NULL,
    layout TEXT NOT NULL,
    area NUMERIC(8, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    listing_stage_code TEXT NOT NULL,
    seller_profile_code TEXT NULL REFERENCES seller_profile_definitions(seller_profile_code),
    competitiveness_score NUMERIC(8, 2) NOT NULL DEFAULT 0,
    pricing_power NUMERIC(8, 2) NOT NULL DEFAULT 0,
    product_power NUMERIC(8, 2) NOT NULL DEFAULT 0,
    story_power NUMERIC(8, 2) NOT NULL DEFAULT 0,
    traffic_power NUMERIC(8, 2) NOT NULL DEFAULT 0,
    conversion_power NUMERIC(8, 2) NOT NULL DEFAULT 0,
    listing_heat NUMERIC(8, 2) NOT NULL DEFAULT 0,
    showing_readiness NUMERIC(8, 2) NOT NULL DEFAULT 0,
    focus_score NUMERIC(8, 2) NOT NULL DEFAULT 0,
    active_lead_count INTEGER NOT NULL DEFAULT 0,
    high_intent_lead_count INTEGER NOT NULL DEFAULT 0,
    shadow_lead_count INTEGER NOT NULL DEFAULT 0,
    last_major_event_at TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT maintainer_run_listings_status_check
      CHECK (status IN ('active', 'sold', 'withdrawn', 'paused'))
  );

  CREATE TABLE IF NOT EXISTS maintainer_listing_sellers (
    seller_state_id TEXT PRIMARY KEY,
    run_listing_id TEXT NOT NULL UNIQUE REFERENCES maintainer_run_listings(run_listing_id) ON DELETE CASCADE,
    seller_profile_code TEXT NOT NULL REFERENCES seller_profile_definitions(seller_profile_code),
    seller_name TEXT NOT NULL,
    pressure_source_code TEXT NULL,
    seller_trust NUMERIC(8, 2) NOT NULL DEFAULT 0,
    seller_confidence NUMERIC(8, 2) NOT NULL DEFAULT 0,
    seller_patience NUMERIC(8, 2) NOT NULL DEFAULT 0,
    price_flex_readiness NUMERIC(8, 2) NOT NULL DEFAULT 0,
    cooperation_level NUMERIC(8, 2) NOT NULL DEFAULT 0,
    emotion_level NUMERIC(8, 2) NOT NULL DEFAULT 0,
    communication_debt NUMERIC(8, 2) NOT NULL DEFAULT 0,
    feedback_preference_code TEXT NULL,
    cooperation_style_code TEXT NULL,
    trust_baseline NUMERIC(8, 2) NOT NULL DEFAULT 0,
    last_face_meeting_at TIMESTAMPTZ NULL,
    last_weekly_feedback_at TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS maintainer_listing_competitiveness (
    competitiveness_id TEXT PRIMARY KEY,
    run_listing_id TEXT NOT NULL UNIQUE REFERENCES maintainer_run_listings(run_listing_id) ON DELETE CASCADE,
    overall_score NUMERIC(8, 2) NOT NULL DEFAULT 0,
    pricing_power NUMERIC(8, 2) NOT NULL DEFAULT 0,
    product_power NUMERIC(8, 2) NOT NULL DEFAULT 0,
    story_power NUMERIC(8, 2) NOT NULL DEFAULT 0,
    traffic_power NUMERIC(8, 2) NOT NULL DEFAULT 0,
    conversion_power NUMERIC(8, 2) NOT NULL DEFAULT 0,
    pricing_position_score NUMERIC(8, 2) NOT NULL DEFAULT 0,
    market_fit_score NUMERIC(8, 2) NOT NULL DEFAULT 0,
    story_clarity_score NUMERIC(8, 2) NOT NULL DEFAULT 0,
    open_day_readiness_score NUMERIC(8, 2) NOT NULL DEFAULT 0,
    broker_pushability_score NUMERIC(8, 2) NOT NULL DEFAULT 0,
    showing_feedback_score NUMERIC(8, 2) NOT NULL DEFAULT 0,
    breakdown_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS maintainer_listing_leads (
    lead_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES maintainer_game_runs(run_id) ON DELETE CASCADE,
    run_listing_id TEXT NOT NULL REFERENCES maintainer_run_listings(run_listing_id) ON DELETE CASCADE,
    customer_template_id TEXT NULL,
    source_channel_code TEXT NULL,
    lead_source_type TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'revealed',
    stage_code TEXT NOT NULL,
    intent_score NUMERIC(8, 2) NOT NULL DEFAULT 0,
    confidence_score NUMERIC(8, 2) NOT NULL DEFAULT 0,
    budget_fit_score NUMERIC(8, 2) NOT NULL DEFAULT 0,
    days_to_cold INTEGER NOT NULL DEFAULT 0,
    broker_name TEXT NULL,
    is_key_lead BOOLEAN NOT NULL DEFAULT FALSE,
    last_interaction_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT maintainer_listing_leads_source_type_check
      CHECK (lead_source_type IN ('direct', 'broker', 'open_day', 'referral')),
    CONSTRAINT maintainer_listing_leads_visibility_check
      CHECK (visibility IN ('shadow', 'revealed'))
  );

  CREATE TABLE IF NOT EXISTS maintainer_lead_feedbacks (
    feedback_id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL REFERENCES maintainer_listing_leads(lead_id) ON DELETE CASCADE,
    run_listing_id TEXT NOT NULL REFERENCES maintainer_run_listings(run_listing_id) ON DELETE CASCADE,
    feedback_type TEXT NOT NULL,
    objection_code TEXT NULL,
    sentiment_score NUMERIC(8, 2) NOT NULL DEFAULT 0,
    feedback_summary TEXT NOT NULL DEFAULT '',
    feedback_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS maintainer_matters (
    matter_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES maintainer_game_runs(run_id) ON DELETE CASCADE,
    run_listing_id TEXT NULL REFERENCES maintainer_run_listings(run_listing_id) ON DELETE SET NULL,
    week_index INTEGER NOT NULL DEFAULT 1,
    day_index INTEGER NOT NULL DEFAULT 1,
    type_code TEXT NOT NULL REFERENCES matter_type_definitions(type_code),
    source_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    stakeholder_code TEXT NOT NULL,
    interaction_template_code TEXT NULL REFERENCES interaction_template_definitions(template_code),
    priority_score NUMERIC(8, 2) NOT NULL DEFAULT 0,
    deadline_day INTEGER NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    context_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    recommended_action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_code TEXT NULL,
    resolution_summary TEXT NULL,
    resolved_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT maintainer_matters_source_code_check
      CHECK (source_code IN ('fixed', 'event', 'chain')),
    CONSTRAINT maintainer_matters_status_check
      CHECK (status IN ('open', 'resolved', 'expired', 'cancelled'))
  );

  CREATE TABLE IF NOT EXISTS maintainer_matter_interactions (
    interaction_id TEXT PRIMARY KEY,
    matter_id TEXT NOT NULL REFERENCES maintainer_matters(matter_id) ON DELETE CASCADE,
    turn_index INTEGER NOT NULL,
    actor_code TEXT NOT NULL,
    prompt_text TEXT NULL,
    prompt_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    player_choice_code TEXT NULL,
    player_choice_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_text TEXT NULL,
    response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    outcome_code TEXT NULL,
    effects_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (matter_id, turn_index)
  );

  CREATE TABLE IF NOT EXISTS maintainer_week_cycles (
    cycle_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES maintainer_game_runs(run_id) ON DELETE CASCADE,
    week_index INTEGER NOT NULL,
    theme_code TEXT NULL,
    focus_meeting_day INTEGER NULL,
    weekly_feedback_day INTEGER NULL,
    weekend_peak_day INTEGER NULL,
    focus_slots INTEGER NOT NULL DEFAULT 0,
    open_day_slots INTEGER NOT NULL DEFAULT 0,
    schedule_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    summary TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ NULL,
    UNIQUE (run_id, week_index)
  );

  CREATE TABLE IF NOT EXISTS maintainer_focus_meeting_entries (
    entry_id TEXT PRIMARY KEY,
    cycle_id TEXT NOT NULL REFERENCES maintainer_week_cycles(cycle_id) ON DELETE CASCADE,
    run_listing_id TEXT NOT NULL REFERENCES maintainer_run_listings(run_listing_id) ON DELETE CASCADE,
    proposal_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    decision_code TEXT NOT NULL,
    decision_reason TEXT NULL,
    resource_gain_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT maintainer_focus_meeting_entries_decision_check
      CHECK (decision_code IN ('approved', 'waitlisted', 'rejected'))
  );

  CREATE TABLE IF NOT EXISTS maintainer_events (
    event_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES maintainer_game_runs(run_id) ON DELETE CASCADE,
    run_listing_id TEXT NULL REFERENCES maintainer_run_listings(run_listing_id) ON DELETE SET NULL,
    week_index INTEGER NOT NULL DEFAULT 1,
    day_index INTEGER NOT NULL DEFAULT 1,
    event_type_code TEXT NOT NULL REFERENCES event_type_definitions(event_type_code),
    severity_code TEXT NOT NULL,
    source_code TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    caused_matter_id TEXT NULL REFERENCES maintainer_matters(matter_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS maintainer_listing_flags (
    flag_id TEXT PRIMARY KEY,
    run_listing_id TEXT NOT NULL REFERENCES maintainer_run_listings(run_listing_id) ON DELETE CASCADE,
    flag_code TEXT NOT NULL,
    flag_value TEXT NOT NULL,
    source_matter_id TEXT NULL REFERENCES maintainer_matters(matter_id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS maintainer_recommendations (
    recommendation_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES maintainer_game_runs(run_id) ON DELETE CASCADE,
    week_index INTEGER NOT NULL DEFAULT 1,
    day_index INTEGER NOT NULL DEFAULT 1,
    matter_id TEXT NOT NULL REFERENCES maintainer_matters(matter_id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    risk_if_ignored TEXT NOT NULL DEFAULT '',
    expected_outcome TEXT NOT NULL DEFAULT '',
    score NUMERIC(8, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_maintainer_game_runs_user_updated
  ON maintainer_game_runs(user_id, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_maintainer_game_runs_status_updated
  ON maintainer_game_runs(status, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_maintainer_game_runs_season_status
  ON maintainer_game_runs(season_id, status, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_maintainer_leaderboard_entries_score
  ON maintainer_leaderboard_entries(season_id, score DESC, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_maintainer_leaderboard_entries_user
  ON maintainer_leaderboard_entries(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_maintainer_game_runs_scenario
  ON maintainer_game_runs(scenario_id, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_maintainer_game_runs_difficulty
  ON maintainer_game_runs(difficulty_id, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_selling_houses_scenarios_published
  ON selling_houses_scenarios(published, difficulty_id, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_selling_houses_progress_user
  ON selling_houses_progress(user_id, last_played_at DESC);

  CREATE INDEX IF NOT EXISTS idx_maintainer_run_listings_run_status_updated
  ON maintainer_run_listings(run_id, status, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_maintainer_matters_run_status_priority
  ON maintainer_matters(run_id, status, priority_score DESC, deadline_day ASC);

  CREATE INDEX IF NOT EXISTS idx_maintainer_matters_listing_status_created
  ON maintainer_matters(run_listing_id, status, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_maintainer_matter_interactions_matter_turn
  ON maintainer_matter_interactions(matter_id, turn_index ASC);

  CREATE INDEX IF NOT EXISTS idx_maintainer_listing_leads_listing_stage_updated
  ON maintainer_listing_leads(run_listing_id, stage_code, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_maintainer_events_run_created
  ON maintainer_events(run_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_maintainer_week_cycles_run_week
  ON maintainer_week_cycles(run_id, week_index);

  CREATE INDEX IF NOT EXISTS idx_maintainer_focus_meeting_entries_cycle_decision
  ON maintainer_focus_meeting_entries(cycle_id, decision_code);

  CREATE INDEX IF NOT EXISTS idx_maintainer_listing_flags_listing_flag
  ON maintainer_listing_flags(run_listing_id, flag_code);
`;

async function seedBuiltInScenarioData(sql: SellingHousesSqlClient) {
  const world = getBuiltInWorld();
  await sql.query(
    `
      INSERT INTO selling_houses_worlds (id, version, world_json, updated_at)
      VALUES ($1, $2, $3::jsonb, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        version = EXCLUDED.version,
        world_json = EXCLUDED.world_json,
        updated_at = NOW()
    `,
    [world.id, world.version, JSON.stringify(world)],
  );

  for (const scenario of getBuiltInScenarios()) {
    const tier = scenario.difficultyId === 'easy' ? 1 : scenario.difficultyId === 'standard' ? 2 : 3;
    await sql.query(
      `
        INSERT INTO selling_houses_scenarios (
          id,
          world_id,
          world_version,
          difficulty_id,
          tier,
          theme,
          name,
          published,
          scenario_json,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          world_id = EXCLUDED.world_id,
          world_version = EXCLUDED.world_version,
          difficulty_id = EXCLUDED.difficulty_id,
          tier = EXCLUDED.tier,
          theme = EXCLUDED.theme,
          name = EXCLUDED.name,
          published = EXCLUDED.published,
          scenario_json = EXCLUDED.scenario_json,
          updated_at = NOW()
      `,
      [
        scenario.id,
        scenario.worldId,
        scenario.worldVersion,
        scenario.difficultyId,
        tier,
        scenario.theme,
        scenario.name,
        scenario.published,
        JSON.stringify(scenario),
      ],
    );
  }
}

async function ensureSchema(sql: SellingHousesSqlClient) {
  const statements = SELLING_HOUSES_SCHEMA_SQL
    .split(/;\s*\n/g)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql.query(`${statement};`);
  }

  await sql.query(`
    ALTER TABLE maintainer_game_runs
    ADD COLUMN IF NOT EXISTS sold_count INTEGER NOT NULL DEFAULT 0;
  `);

  await sql.query(`
    ALTER TABLE maintainer_game_runs
    ADD COLUMN IF NOT EXISTS withdrawn_count INTEGER NOT NULL DEFAULT 0;
  `);

  await sql.query(`
    ALTER TABLE maintainer_game_runs
    ADD COLUMN IF NOT EXISTS score INTEGER NULL;
  `);

  await sql.query(`
    ALTER TABLE maintainer_game_runs
    ADD COLUMN IF NOT EXISTS client_updated_at TIMESTAMPTZ NULL;
  `);

  await sql.query(`
    ALTER TABLE maintainer_game_runs
    ADD COLUMN IF NOT EXISTS season_id TEXT NOT NULL DEFAULT 'season-1';
  `);

  await sql.query(`
    ALTER TABLE maintainer_game_runs
    ADD COLUMN IF NOT EXISTS scenario_id TEXT NULL;
  `);

  await sql.query(`
    ALTER TABLE maintainer_game_runs
    ADD COLUMN IF NOT EXISTS difficulty_id TEXT NULL;
  `);

  await sql.query(`
    ALTER TABLE maintainer_game_runs
    ADD COLUMN IF NOT EXISTS world_id TEXT NULL;
  `);

  await sql.query(`
    ALTER TABLE maintainer_game_runs
    ADD COLUMN IF NOT EXISTS world_version INTEGER NULL;
  `);

  await sql.query(`
    ALTER TABLE maintainer_game_runs
    ADD COLUMN IF NOT EXISTS rng_seed BIGINT NULL;
  `);

  await sql.query(`
    ALTER TABLE maintainer_game_runs
    ADD COLUMN IF NOT EXISTS scenario_snapshot JSONB NULL;
  `);

  await sql.query(`
    ALTER TABLE maintainer_game_runs
    ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 3;
  `);

  await sql.query(`
    ALTER TABLE maintainer_game_runs
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await sql.query(`
    ALTER TABLE maintainer_game_runs
    ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ NULL;
  `);

  await sql.query(`
    ALTER TABLE maintainer_game_runs
    ADD COLUMN IF NOT EXISTS last_played_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await sql.query(`
    ALTER TABLE maintainer_leaderboard_entries
    ADD COLUMN IF NOT EXISTS season_id TEXT NOT NULL DEFAULT 'season-1';
  `);

  await sql.query(`
    ALTER TABLE maintainer_leaderboard_entries
    ADD COLUMN IF NOT EXISTS score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await sql.query(`
    ALTER TABLE maintainer_leaderboard_entries
    ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await seedBuiltInScenarioData(sql);
}

export async function withSellingHousesNeon<T>(
  runner: (sql: SellingHousesSqlClient) => Promise<T>,
): Promise<T> {
  const sql = getSqlClient();

  if (!schemaReadyPromise) {
    schemaReadyPromise = ensureSchema(sql);
  }

  await schemaReadyPromise;
  return runner(sql);
}
