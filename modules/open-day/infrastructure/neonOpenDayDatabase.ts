import { neon } from '@neondatabase/serverless';

type OpenDaySqlClient = ReturnType<typeof neon>;

let schemaReadyPromise: Promise<void> | null = null;

function getConnectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

function getSqlClient(): OpenDaySqlClient {
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error('缺少 DATABASE_URL / POSTGRES_URL，无法启用 Neon 持久化。');
  }

  return neon(connectionString);
}

async function ensureSchema(sql: OpenDaySqlClient) {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS open_day_scenario_templates (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      formula_id TEXT NOT NULL,
      parameter_package_id TEXT NULL,
      config_version TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      latest_version_id TEXT NULL,
      current_version_no INTEGER NOT NULL DEFAULT 1,
      scenario_json JSONB NOT NULL
    );
  `);

  await sql.query(`
    ALTER TABLE open_day_scenario_templates
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await sql.query(`
    ALTER TABLE open_day_scenario_templates
    ADD COLUMN IF NOT EXISTS latest_version_id TEXT NULL;
  `);

  await sql.query(`
    ALTER TABLE open_day_scenario_templates
    ADD COLUMN IF NOT EXISTS current_version_no INTEGER NOT NULL DEFAULT 1;
  `);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS open_day_scenario_template_versions (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES open_day_scenario_templates(id) ON DELETE CASCADE,
      version_no INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      formula_id TEXT NOT NULL,
      parameter_package_id TEXT NULL,
      config_version TEXT NOT NULL,
      scenario_json JSONB NOT NULL,
      change_note TEXT NOT NULL DEFAULT ''
    );
  `);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS open_day_datasets (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_upload_id TEXT NULL,
      source_name TEXT NOT NULL,
      sheet_name TEXT NOT NULL DEFAULT '',
      row_count INTEGER NOT NULL,
      header_count INTEGER NOT NULL,
      dataset_fingerprint TEXT NOT NULL,
      headers_json JSONB NOT NULL,
      rows_json JSONB NOT NULL
    );
  `);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS open_day_dataset_profiles (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      dataset_id TEXT NOT NULL REFERENCES open_day_datasets(id) ON DELETE CASCADE,
      profile_fingerprint TEXT NOT NULL,
      source_name TEXT NOT NULL,
      sheet_name TEXT NOT NULL DEFAULT '',
      headers_json JSONB NOT NULL,
      mappings_json JSONB NOT NULL,
      quality_report_json JSONB NULL
    );
  `);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS open_day_analysis_snapshots (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_name TEXT NOT NULL,
      source_upload_id TEXT NULL,
      scenario_template_id TEXT NULL,
      scenario_template_name TEXT NULL,
      preset_id TEXT NULL,
      parameter_package_id TEXT NULL,
      config_version TEXT NOT NULL,
      waterline_source TEXT NOT NULL,
      total_count INTEGER NOT NULL,
      eligible_count INTEGER NOT NULL,
      champion_name TEXT NOT NULL,
      champion_score NUMERIC NOT NULL,
      command_json JSONB NOT NULL,
      response_json JSONB NOT NULL
    );
  `);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS open_day_analysis_runs (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_name TEXT NOT NULL,
      source_upload_id TEXT NULL,
      scenario_template_id TEXT NULL,
      scenario_template_name TEXT NULL,
      preset_id TEXT NULL,
      parameter_package_id TEXT NULL,
      config_version TEXT NOT NULL,
      waterline_source TEXT NOT NULL,
      total_count INTEGER NOT NULL,
      eligible_count INTEGER NOT NULL,
      champion_name TEXT NOT NULL,
      champion_score NUMERIC NOT NULL,
      cache_key TEXT NOT NULL,
      cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
      command_json JSONB NOT NULL,
      response_json JSONB NOT NULL
    );
  `);

  await sql.query(`
    ALTER TABLE open_day_analysis_snapshots
    ADD COLUMN IF NOT EXISTS source_upload_id TEXT NULL;
  `);

  await sql.query(`
    ALTER TABLE open_day_analysis_snapshots
    ADD COLUMN IF NOT EXISTS scenario_template_id TEXT NULL;
  `);

  await sql.query(`
    ALTER TABLE open_day_analysis_snapshots
    ADD COLUMN IF NOT EXISTS scenario_template_name TEXT NULL;
  `);

  await sql.query(`
    ALTER TABLE open_day_analysis_snapshots
    ADD COLUMN IF NOT EXISTS scenario_template_version_id TEXT NULL;
  `);

  await sql.query(`
    ALTER TABLE open_day_analysis_runs
    ADD COLUMN IF NOT EXISTS scenario_template_version_id TEXT NULL;
  `);

  await sql.query(`
    ALTER TABLE open_day_analysis_snapshots
    ADD COLUMN IF NOT EXISTS dataset_id TEXT NULL;
  `);

  await sql.query(`
    ALTER TABLE open_day_analysis_snapshots
    ADD COLUMN IF NOT EXISTS dataset_profile_id TEXT NULL;
  `);

  await sql.query(`
    ALTER TABLE open_day_analysis_runs
    ADD COLUMN IF NOT EXISTS dataset_id TEXT NULL;
  `);

  await sql.query(`
    ALTER TABLE open_day_analysis_runs
    ADD COLUMN IF NOT EXISTS dataset_profile_id TEXT NULL;
  `);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS open_day_analysis_snapshot_rows (
      snapshot_id TEXT NOT NULL REFERENCES open_day_analysis_snapshots(id) ON DELETE CASCADE,
      rank INTEGER NOT NULL,
      area TEXT NULL,
      name TEXT NOT NULL,
      score NUMERIC NOT NULL,
      raw_score NUMERIC NOT NULL,
      tier_code TEXT NOT NULL,
      is_eligible BOOLEAN NOT NULL,
      scale_idx NUMERIC NOT NULL,
      traffic_idx NUMERIC NOT NULL,
      product_idx NUMERIC NOT NULL,
      interaction_idx NUMERIC NOT NULL,
      conv_rate NUMERIC NOT NULL,
      transactions NUMERIC NOT NULL,
      inventory NUMERIC NOT NULL,
      traffic NUMERIC NOT NULL,
      premium NUMERIC NOT NULL,
      PRIMARY KEY (snapshot_id, rank)
    );
  `);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS open_day_analysis_run_rows (
      analysis_run_id TEXT NOT NULL REFERENCES open_day_analysis_runs(id) ON DELETE CASCADE,
      rank INTEGER NOT NULL,
      area TEXT NULL,
      name TEXT NOT NULL,
      score NUMERIC NOT NULL,
      raw_score NUMERIC NOT NULL,
      tier_code TEXT NOT NULL,
      is_eligible BOOLEAN NOT NULL,
      scale_idx NUMERIC NOT NULL,
      traffic_idx NUMERIC NOT NULL,
      product_idx NUMERIC NOT NULL,
      interaction_idx NUMERIC NOT NULL,
      conv_rate NUMERIC NOT NULL,
      transactions NUMERIC NOT NULL,
      inventory NUMERIC NOT NULL,
      traffic NUMERIC NOT NULL,
      premium NUMERIC NOT NULL,
      PRIMARY KEY (analysis_run_id, rank)
    );
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_scenario_templates_updated_at
    ON open_day_scenario_templates(updated_at DESC);
  `);

  await sql.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_open_day_scenario_template_versions_unique
    ON open_day_scenario_template_versions(template_id, version_no);
  `);

  await sql.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_open_day_datasets_fingerprint
    ON open_day_datasets(dataset_fingerprint);
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_datasets_source_upload_id
    ON open_day_datasets(source_upload_id, created_at DESC);
  `);

  await sql.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_open_day_dataset_profiles_fingerprint
    ON open_day_dataset_profiles(profile_fingerprint);
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_dataset_profiles_dataset_id
    ON open_day_dataset_profiles(dataset_id, created_at DESC);
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_scenario_template_versions_template_created_at
    ON open_day_scenario_template_versions(template_id, created_at DESC);
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_analysis_snapshots_created_at
    ON open_day_analysis_snapshots(created_at DESC);
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_analysis_snapshots_scenario_template_id
    ON open_day_analysis_snapshots(scenario_template_id);
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_analysis_snapshots_scenario_template_version_id
    ON open_day_analysis_snapshots(scenario_template_version_id);
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_analysis_snapshots_source_upload_id
    ON open_day_analysis_snapshots(source_upload_id, created_at DESC);
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_analysis_snapshots_dataset_id
    ON open_day_analysis_snapshots(dataset_id, created_at DESC);
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_analysis_snapshots_dataset_profile_id
    ON open_day_analysis_snapshots(dataset_profile_id, created_at DESC);
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_analysis_runs_created_at
    ON open_day_analysis_runs(created_at DESC);
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_analysis_runs_scenario_template_id
    ON open_day_analysis_runs(scenario_template_id, created_at DESC);
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_analysis_runs_scenario_template_version_id
    ON open_day_analysis_runs(scenario_template_version_id, created_at DESC);
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_analysis_runs_source_upload_id
    ON open_day_analysis_runs(source_upload_id, created_at DESC);
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_analysis_runs_dataset_id
    ON open_day_analysis_runs(dataset_id, created_at DESC);
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_analysis_runs_dataset_profile_id
    ON open_day_analysis_runs(dataset_profile_id, created_at DESC);
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_analysis_runs_cache_key
    ON open_day_analysis_runs(cache_key);
  `);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS open_day_upload_artifacts (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      original_filename TEXT NOT NULL,
      byte_size BIGINT NOT NULL,
      content_type TEXT NOT NULL,
      checksum_sha256 TEXT NOT NULL,
      storage_backend TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      url TEXT NULL,
      download_url TEXT NULL,
      artifact_json JSONB NOT NULL
    );
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_upload_artifacts_created_at
    ON open_day_upload_artifacts(created_at DESC);
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_open_day_upload_artifacts_checksum
    ON open_day_upload_artifacts(checksum_sha256);
  `);
}

export async function withOpenDayNeon<T>(runner: (sql: OpenDaySqlClient) => Promise<T>): Promise<T> {
  const sql = getSqlClient();

  if (!schemaReadyPromise) {
    schemaReadyPromise = ensureSchema(sql).catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  await schemaReadyPromise;
  return runner(sql);
}
