import type {
  MaintainerCreateRunCommand,
  MaintainerLeaderboardEntry,
  MaintainerRunRecord,
  MaintainerSaveRunCommand,
} from '../application/cloudSync.js';
import {
  buildFinalStats,
  buildScoreBreakdown,
  deriveRankTitle,
  deriveRunScore,
  deriveRunStatus,
  normalizePlayerName,
} from '../application/cloudSync.js';
import { ACTIONS } from '../domain/actions/definitions.js';
import { withSellingHousesNeon } from './neonGameDatabase.js';

interface GameRunRow {
  run_id: string;
  user_id: string;
  player_name: string;
  status: string;
  season_id: string;
  scenario_id: string | null;
  difficulty_id: string | null;
  world_id: string | null;
  world_version: number | null;
  rng_seed: number | string | null;
  schema_version: number;
  day: number;
  cash: number | string;
  energy: number;
  reputation: number | string;
  sold_count: number;
  withdrawn_count: number;
  score: number | null;
  sync_version: number | string;
  scenario_snapshot: unknown;
  save_data: unknown;
  daily_logs: unknown;
  started_at: string;
  finished_at: string | null;
  last_played_at: string;
  client_updated_at: string | null;
  updated_at: string;
}

interface LeaderboardRow {
  run_id: string;
  user_id: string;
  player_name: string;
  season_id: string;
  score: number | string;
  rank_title: string;
  final_stats: unknown;
  score_breakdown: unknown;
  finished_at: string;
  created_at: string;
}

interface ShadowWriteSummary {
  listingCount: number;
  leadCount: number;
  leadFeedbackCount: number;
  eventCount: number;
  listingResultCount: number;
  listingFinalResultCount: number;
  sellerStateCount: number;
  competitivenessCount: number;
  matterCount: number;
  weekCycleCount: number;
  recommendationCount: number;
  listingFlagCount: number;
  focusMeetingEntryCount: number;
  matterInteractionCount: number;
}

function toNumber(value: unknown) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toJsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  return (value as T) ?? fallback;
}

function mapRunRow(row: GameRunRow): MaintainerRunRecord {
  const saveData = toJsonValue(row.save_data, null) as MaintainerRunRecord['saveData'];
  const finalStats = typeof saveData === 'object' && saveData ? (saveData as { finalResult?: unknown }).finalResult : null;
  const auxiliaryStats = typeof finalStats === 'object' && finalStats
    ? ((finalStats as { auxiliaryStats?: Record<string, unknown> }).auxiliaryStats || null)
    : null;
  const commission = toNumber(auxiliaryStats?.commission);
  const reputation = toNumber(auxiliaryStats?.reputation);
  const soldCount = toNumber(auxiliaryStats?.soldCount);
  const withdrawnCount = toNumber(auxiliaryStats?.withdrawnCount);
  return {
    runId: row.run_id,
    userId: row.user_id,
    playerName: row.player_name,
    status: row.status as MaintainerRunRecord['status'],
    seasonId: row.season_id,
    scenarioId: row.scenario_id,
    difficultyId: row.difficulty_id,
    worldId: row.world_id,
    worldVersion: row.world_version,
    rngSeed: row.rng_seed == null ? null : toNumber(row.rng_seed),
    schemaVersion: row.schema_version,
    day: row.day,
    cash: toNumber(row.cash),
    energy: row.energy,
    commission,
    reputation: auxiliaryStats && 'reputation' in auxiliaryStats ? reputation : toNumber(row.reputation),
    soldCount: auxiliaryStats && 'soldCount' in auxiliaryStats ? soldCount : row.sold_count,
    withdrawnCount: auxiliaryStats && 'withdrawnCount' in auxiliaryStats ? withdrawnCount : row.withdrawn_count,
    score: row.score,
    syncVersion: toNumber(row.sync_version),
    saveData,
    dailyLogs: toJsonValue(row.daily_logs, []),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    lastPlayedAt: row.last_played_at,
    clientUpdatedAt: row.client_updated_at,
    updatedAt: row.updated_at,
  };
}

function mapLeaderboardRow(row: LeaderboardRow): MaintainerLeaderboardEntry {
  return {
    runId: row.run_id,
    userId: row.user_id,
    playerName: row.player_name,
    seasonId: row.season_id,
    score: toNumber(row.score),
    rankTitle: row.rank_title,
    finalStats: toJsonValue(row.final_stats, {}),
    scoreBreakdown: toJsonValue(row.score_breakdown, {}),
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  };
}

function resolveClientUpdatedAt(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function resolveListingStageCode(stageLabel: string | undefined, status: string) {
  if ((stageLabel || '').includes('竞品截走') || status === 'lost_to_rival') return 'lost_to_rival';
  if (status === 'sold') return 'sold';
  if (status === 'withdrawn') return 'withdrawn';

  const normalized = (stageLabel || '').trim();
  if (normalized.includes('获客')) return 'acquire';
  if (normalized.includes('加热')) return 'warmup';
  if (normalized.includes('带看')) return 'showing';
  if (normalized.includes('意向')) return 'intent';
  if (normalized.includes('议价')) return 'negotiation';
  if (normalized.includes('冲刺')) return 'closing';
  if (normalized.includes('成交')) return 'sold';
  return 'active';
}

function resolveSellerProfileCode(ownerArchetypeId: string | undefined | null) {
  const normalized = (ownerArchetypeId || '').trim();
  return normalized || 'unknown';
}

function resolveLeadSourceType(leadSource: string | undefined) {
  if (leadSource === 'broker') return 'broker';
  return 'direct';
}

function buildRunListingId(runId: string, caseId: string) {
  return `${runId}:${caseId}`;
}

function buildShadowWriteSummary(state: MaintainerRunRecord['saveData']): ShadowWriteSummary {
  const cases = Array.isArray(state?.cases) ? state.cases : [];
  const caseResults = Array.isArray(state?.finalResult?.caseResults) ? state.finalResult.caseResults : [];
  return {
    listingCount: cases.length,
    leadCount: Array.isArray(state?.opportunities) ? state.opportunities.length : 0,
    leadFeedbackCount: Array.isArray(state?.opportunities) ? state.opportunities.length : 0,
    eventCount: Array.isArray(state?.eventLog) ? state.eventLog.length : 0,
    listingResultCount: cases.filter((caseItem) =>
      Boolean(
        caseItem?.goalTier
        || caseItem?.storylineState
        || caseItem?.relativeOutcome
        || caseItem?.ownerSatisfaction
        || caseItem?.defenseOutcome
        || caseItem?.endingType
        || caseItem?.endingSummary
        || caseItem?.soldPrice != null,
      ),
    ).length,
    listingFinalResultCount: caseResults.length,
    sellerStateCount: cases.length,
    competitivenessCount: cases.length,
    matterCount: Math.min(
      (Array.isArray(state?.priorities) ? state.priorities.length : 0)
      + (Array.isArray(state?.schedule) ? state.schedule.length : 0),
      20,
    ),
    weekCycleCount: Math.max(
      Array.isArray(state?.weeklyReviews) ? state.weeklyReviews.length : 0,
      1,
    ),
    recommendationCount: Array.isArray(state?.priorities) ? state.priorities.length : 0,
    listingFlagCount: cases.reduce((sum, caseItem) => {
      const riskFlags = Array.isArray(caseItem?.riskFlags) ? caseItem.riskFlags.length : 0;
      return sum + riskFlags + 3;
    }, 0),
    focusMeetingEntryCount: cases.filter((caseItem) => caseItem?.status === 'active' && caseItem?.isFocused).length,
    matterInteractionCount: Math.min(Array.isArray(state?.priorities) ? state.priorities.length : 0, 5),
  };
}

function clampMetric(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function resolvePriceFlexReadiness(caseItem: MaintainerRunRecord['saveData']['cases'][number]) {
  const askPrice = Number(caseItem.askPrice) || 0;
  const bottomPrice = Number(caseItem.bottomPrice) || 0;
  if (askPrice <= 0 || bottomPrice <= 0 || bottomPrice >= askPrice) {
    return 0;
  }

  return clampMetric(((askPrice - bottomPrice) / askPrice) * 1000);
}

function resolvePressureSourceCode(caseItem: MaintainerRunRecord['saveData']['cases'][number]) {
  if (Number(caseItem.windowDays) <= 3) return 'window';
  if (Number(caseItem.urgency) >= 75) return 'urgency';
  if (Number(caseItem.trust) <= 50) return 'trust';
  if (Number(caseItem.askPrice) > Number(caseItem.marketPrice) * 1.03) return 'price';
  return null;
}

function resolvePricingPositionScore(caseItem: MaintainerRunRecord['saveData']['cases'][number]) {
  const askPrice = Number(caseItem.askPrice) || 0;
  const marketPrice = Number(caseItem.marketPrice) || 0;
  if (askPrice <= 0 || marketPrice <= 0) return 0;

  const premiumPct = Math.abs((askPrice - marketPrice) / marketPrice);
  return clampMetric(100 - premiumPct * 500);
}

function buildFinalCaseResultMap(state: MaintainerRunRecord['saveData']) {
  const caseResults = Array.isArray(state?.finalResult?.caseResults) ? state.finalResult.caseResults : [];
  return new Map(caseResults.map((entry) => [entry.caseId, entry]));
}

function resolveEventSeverityCode(tone: string | undefined) {
  if (tone === 'danger') return 'danger';
  if (tone === 'success') return 'success';
  return 'accent';
}

function resolveEventSourceCode(actor: string | undefined) {
  const normalized = (actor || '').trim();
  if (!normalized) return 'system';
  if (normalized.includes('市场') || normalized.includes('宏观') || normalized.includes('竞品')) return 'market';
  if (normalized.includes('系统')) return 'system';
  if (normalized.includes('开放日') || normalized.includes('小红书') || normalized.includes('经纪人') || normalized.includes('私域')) {
    return 'action';
  }
  return 'actor';
}

function resolveEventTypeCode(actor: string | undefined, message: string | undefined) {
  const actorText = (actor || '').trim();
  const text = `${actorText} ${message || ''}`;

  if (!text.trim()) return 'system';
  if (actorText.includes('系统周结')) return 'weekly_review';
  if (actorText.includes('系统资金')) return 'budget_update';
  if (actorText.includes('房源聚焦')) return 'focus_shift';
  if (actorText.includes('竞品截走') || actorText.includes('竞品联动') || actorText.includes('市场竞争') || actorText.includes('竞品')) {
    return 'competition_pressure';
  }
  if (actorText.includes('小红书') || actorText.includes('经纪人投放') || actorText.includes('私域转介绍') || actorText.includes('开放日') || actorText.includes('活动')) {
    return 'marketing_activity';
  }
  if (actorText.includes('宏观') || actorText.includes('市场')) return 'market';
  if (actorText.includes('业主') || actorText.includes('家里') || actorText.includes('亲友') || actorText.includes('朋友') || actorText.includes('家庭')) {
    return 'owner_feedback';
  }
  if (text.includes('带看') || text.includes('兴趣升温') || text.includes('议价') || text.includes('机会进入')) {
    return 'customer_feedback';
  }
  if (text.includes('降价') || text.includes('挂牌价') || text.includes('心理价') || text.includes('定价')) {
    return 'pricing_change';
  }
  if (text.includes('成交') || text.includes('诚意卖') || text.includes('谈判')) {
    return 'deal_progress';
  }
  if (resolveEventSourceCode(actor) === 'action') return 'marketing_activity';
  return resolveEventSourceCode(actor);
}

function guessEventRunListingId(runId: string, state: MaintainerRunRecord['saveData'], actor: string | undefined, message: string | undefined) {
  const cases = Array.isArray(state?.cases) ? state.cases : [];
  const haystacks = [actor || '', message || ''];
  const matchedCase = cases.find((caseItem) => haystacks.some((text) => text.includes(caseItem.title) || text.includes(caseItem.ownerName)));
  return matchedCase ? buildRunListingId(runId, matchedCase.id) : null;
}

function resolveWeekIndex(day: unknown) {
  return Math.max(1, Math.ceil((Number(day) || 1) / 7));
}

function resolveMatterTypeCode(entry: { kind?: unknown }, fallback: 'schedule_risk' | 'case_priority' = 'case_priority') {
  if (entry.kind === 'opportunity') return 'opportunity_followup';
  if (entry.kind === 'case') return 'case_priority';
  return fallback;
}

function buildMatterId(runId: string, source: string, key: string, index: number) {
  const normalizedKey = (key || `${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || `${index + 1}`;
  return `${runId}:matter:${source}:${index + 1}:${normalizedKey}`;
}

function buildRecommendationId(runId: string, matterId: string, index: number) {
  const normalized = matterId.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(-100);
  return `${runId}:recommendation:${index + 1}:${normalized}`;
}

function buildListingFlagId(runListingId: string, flagCode: string, index: number) {
  return `${runListingId}:flag:${index + 1}:${flagCode}`;
}

function buildFocusMeetingEntryId(cycleId: string, runListingId: string, index: number) {
  return `${cycleId}:focus:${index + 1}:${runListingId.split(':').slice(-1)[0]}`;
}

function buildMatterInteractionId(matterId: string, turnIndex: number) {
  return `${matterId}:turn:${turnIndex}`;
}

function buildLeadFeedbackId(leadId: string) {
  return `${leadId}:feedback:shadow`;
}

function resolveLeadFeedbackType(
  opportunity: MaintainerRunRecord['saveData']['opportunities'][number],
) {
  if (opportunity.status === 'lost') {
    return opportunity.stageIndex >= 4 ? 'negotiation_resistance' : 'lost_interest';
  }

  if (opportunity.daysLeft <= 1) {
    return 'stale_risk';
  }

  if (Number(opportunity.intent) >= 78 && Number(opportunity.confidence) >= 68) {
    return 'strong_interest';
  }

  if (opportunity.leadSource === 'broker' && opportunity.visibility === 'revealed') {
    return 'shadow_revealed';
  }

  return 'showing_progress';
}

function resolveLeadObjectionCode(
  opportunity: MaintainerRunRecord['saveData']['opportunities'][number],
  caseItem: MaintainerRunRecord['saveData']['cases'][number] | null,
) {
  if (!caseItem) {
    return opportunity.daysLeft <= 1 ? 'timing' : 'unknown';
  }

  const askPrice = Number(caseItem.askPrice) || 0;
  const budgetMax = Number(opportunity.budgetMax) || 0;
  const priceGapRatio = askPrice > 0 && budgetMax > 0
    ? (askPrice - budgetMax) / askPrice
    : 0;

  if (priceGapRatio >= 0.04 || Number(opportunity.priceSensitivity) >= 72) {
    return 'price';
  }

  if (opportunity.daysLeft <= 1 || Number(caseItem.windowDays) <= 3) {
    return 'timing';
  }

  if (Number(opportunity.confidence) < 45) {
    return 'confidence';
  }

  if (Number(opportunity.fit) < 55) {
    return 'fit';
  }

  if (
    caseItem.status === 'lost_to_rival'
    || Number(caseItem.competitiveness) < 45
    || Array.isArray(caseItem.riskFlags) && caseItem.riskFlags.some((flag) => String(flag).includes('竞'))
  ) {
    return 'competition';
  }

  return 'unknown';
}

function resolveLeadSentimentScore(
  opportunity: MaintainerRunRecord['saveData']['opportunities'][number],
) {
  const base = Math.round(((Number(opportunity.intent) || 0) * 0.55) + ((Number(opportunity.confidence) || 0) * 0.45));

  if (opportunity.status === 'lost') {
    return Math.max(5, Math.min(40, base - 35));
  }

  if (opportunity.daysLeft <= 1) {
    return Math.max(20, Math.min(65, base - 12));
  }

  if (opportunity.status === 'won') {
    return Math.max(80, base);
  }

  return clampMetric(base);
}

function buildLeadFeedbackSummary(
  opportunity: MaintainerRunRecord['saveData']['opportunities'][number],
) {
  const visibilityLabel = opportunity.visibility === 'shadow' ? '仍为影子线索' : '需求已摸清';
  const statusLabel = opportunity.status === 'lost'
    ? '客户已流失'
    : opportunity.status === 'won'
      ? '客户已成交'
      : `处于${opportunity.stageLabel || '了解'}阶段`;

  return `${statusLabel}，${visibilityLabel}，剩余 ${Math.max(0, Number(opportunity.daysLeft) || 0)} 天，意向 ${Number(opportunity.intent) || 0}，置信 ${Number(opportunity.confidence) || 0}。`;
}

function resolveMatterRecommendedActionCodes(
  matter: { title: string; summary: string; recommended_action_payload: unknown },
) {
  const payload = toJsonValue<Record<string, unknown>>(matter.recommended_action_payload, {});
  const rawCodes = Array.isArray(payload.actionCodes)
    ? payload.actionCodes.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];

  if (rawCodes.length) {
    return rawCodes;
  }

  const text = `${matter.title} ${matter.summary}`.toLowerCase();
  const fallbackGroups = [
    { match: ['窗口', '稳住', '信任', '业主'], codes: ['weekly-feedback', 'first-visit'] },
    { match: ['诊断', '卡点', '问题'], codes: ['deep-diagnosis', 'pricing-advice'] },
    { match: ['定价', '价格', '挂牌'], codes: ['pricing-advice', 'adjust-listing-price'] },
    { match: ['开放日', '热度'], codes: ['open-day', 'xiaohongshu-boost'] },
    { match: ['经纪人', '预测客群'], codes: ['broker-broadcast', 'showing'] },
    { match: ['带看', '推进', '客户'], codes: ['showing', 'invite-customer-negotiation'] },
    { match: ['诚意', '谈判', '收口'], codes: ['sincerity-sale', 'invite-customer-negotiation'] },
  ];

  for (const group of fallbackGroups) {
    if (group.match.some((keyword) => text.includes(keyword))) {
      return group.codes;
    }
  }

  return ['weekly-feedback', 'showing'];
}

function buildMatterPromptText(
  matter: { title: string; summary: string },
  listing: {
    title: string | null;
    status: string | null;
    storyline_state: string | null;
    competitiveness_score: string | number | null;
    active_lead_count: number | null;
    high_intent_lead_count: number | null;
    shadow_lead_count: number | null;
  } | undefined,
) {
  const listingText = listing?.title
    ? `${listing.title} 当前状态 ${listing.status || 'active'}，剧情走势 ${listing.storyline_state || 'unknown'}。`
    : '当前事项没有明确绑定到单套房源。';
  const leadText = listing
    ? `活跃线索 ${Number(listing.active_lead_count) || 0}，高意向 ${Number(listing.high_intent_lead_count) || 0}，影子线索 ${Number(listing.shadow_lead_count) || 0}。`
    : '';
  const competitiveness = listing ? `竞争力 ${Number(listing.competitiveness_score) || 0}。` : '';
  return `系统识别到当前优先事项：${matter.title}。${matter.summary || '需要尽快处理。'} ${listingText} ${leadText} ${competitiveness}`.trim();
}

function buildMatterResponseText(
  matter: { title: string },
  actionNames: string[],
) {
  if (!actionNames.length) {
    return `建议先处理：${matter.title}。`;
  }

  return `建议先处理：${matter.title}。优先考虑 ${actionNames.join(' / ')}。`;
}

export class MaintainerSyncConflictError extends Error {
  latest: MaintainerRunRecord | null;

  constructor(latest: MaintainerRunRecord | null) {
    super('云端进度已更新，请先同步最新存档。');
    this.name = 'MaintainerSyncConflictError';
    this.latest = latest;
  }
}

export class NeonGameRunRepository {
  private async touchUser(userId: string, playerName?: string) {
    await withSellingHousesNeon(async (sql) => {
      await sql.query(
        `
          INSERT INTO maintainer_users (user_id, display_name, last_seen_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (user_id)
          DO UPDATE SET
            display_name = CASE
              WHEN EXCLUDED.display_name IN ('匿名维护人', '匿名资产顾问') THEN maintainer_users.display_name
              ELSE EXCLUDED.display_name
            END,
            last_seen_at = NOW()
        `,
        [userId, normalizePlayerName(playerName)],
      );
    });
  }

  private async upsertLeaderboard(run: MaintainerRunRecord) {
    if (run.status !== 'finished') {
      return;
    }

    await withSellingHousesNeon(async (sql) => {
      await sql.query(
        `
          INSERT INTO maintainer_leaderboard_entries (
            run_id,
            user_id,
            player_name,
            season_id,
            score,
            rank_title,
            final_stats,
            score_breakdown,
            finished_at,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, COALESCE($9::timestamptz, NOW()), NOW())
          ON CONFLICT (run_id)
          DO UPDATE SET
            user_id = EXCLUDED.user_id,
            player_name = EXCLUDED.player_name,
            season_id = EXCLUDED.season_id,
            score = EXCLUDED.score,
            rank_title = EXCLUDED.rank_title,
            final_stats = EXCLUDED.final_stats,
            score_breakdown = EXCLUDED.score_breakdown,
            finished_at = EXCLUDED.finished_at
        `,
        [
          run.runId,
          run.userId,
          run.playerName,
          run.seasonId,
          run.score ?? deriveRunScore(run.saveData),
          deriveRankTitle(run.saveData),
          JSON.stringify(buildFinalStats(run.saveData)),
          JSON.stringify(buildScoreBreakdown(run.saveData)),
          run.finishedAt,
        ],
      );
    });
  }

  private async upsertProgress(run: MaintainerRunRecord) {
    const scenarioId = run.scenarioId || run.saveData.runContext?.scenarioId;
    if (!scenarioId) {
      return;
    }

    await withSellingHousesNeon(async (sql) => {
      await sql.query(
        `
          INSERT INTO selling_houses_progress (
            user_id,
            scenario_id,
            best_score,
            plays_count,
            unlocked,
            last_played_at
          )
          VALUES (
            $1,
            $2,
            CASE WHEN $3 = 'finished' THEN $4 ELSE NULL END,
            1,
            TRUE,
            COALESCE($5::timestamptz, NOW())
          )
          ON CONFLICT (user_id, scenario_id)
          DO UPDATE SET
            best_score = CASE
              WHEN $3 = 'finished' THEN GREATEST(COALESCE(selling_houses_progress.best_score, 0), COALESCE(EXCLUDED.best_score, 0))
              ELSE selling_houses_progress.best_score
            END,
            plays_count = CASE
              WHEN $3 = 'finished'
                AND (
                  selling_houses_progress.last_played_at IS NULL
                  OR COALESCE($5::timestamptz, NOW()) > selling_houses_progress.last_played_at
                )
              THEN selling_houses_progress.plays_count + 1
              ELSE selling_houses_progress.plays_count
            END,
            unlocked = TRUE,
            last_played_at = GREATEST(
              COALESCE(selling_houses_progress.last_played_at, COALESCE($5::timestamptz, NOW())),
              COALESCE($5::timestamptz, NOW())
            )
        `,
        [
          run.userId,
          scenarioId,
          run.status,
          run.score ?? deriveRunScore(run.saveData),
          run.finishedAt || run.lastPlayedAt || run.updatedAt,
        ],
      );
    });
  }

  private async syncShadowTables(runId: string, state: MaintainerRunRecord['saveData']) {
    const cases = Array.isArray(state?.cases) ? state.cases : [];
    const opportunities = Array.isArray(state?.opportunities) ? state.opportunities : [];
    const eventLog = Array.isArray(state?.eventLog) ? state.eventLog : [];
    const finalCaseResultById = buildFinalCaseResultMap(state);
    const syncTime = new Date().toISOString();

    await withSellingHousesNeon(async (sql) => {
      const sellerProfileCodes = Array.from(
        new Set(cases.map((caseItem) => resolveSellerProfileCode(caseItem.ownerArchetypeId))),
      );

      for (const sellerProfileCode of sellerProfileCodes) {
        await sql.query(
          `
            INSERT INTO seller_profile_definitions (
              seller_profile_code,
              name,
              description,
              default_traits
            )
            VALUES ($1, $2, $3, '{}'::jsonb)
            ON CONFLICT (seller_profile_code)
            DO NOTHING
          `,
          [sellerProfileCode, sellerProfileCode === 'unknown' ? '未知画像' : sellerProfileCode, '运行时补齐的业主画像定义。'],
        );
      }

      await sql.query(`DELETE FROM maintainer_events WHERE run_id = $1`, [runId]);
      await sql.query(
        `
          DELETE FROM maintainer_lead_feedbacks
          WHERE run_listing_id IN (
            SELECT run_listing_id
            FROM maintainer_run_listings
            WHERE run_id = $1
          )
        `,
        [runId],
      );
      await sql.query(`DELETE FROM maintainer_listing_leads WHERE run_id = $1`, [runId]);
      await sql.query(`DELETE FROM maintainer_matters WHERE run_id = $1`, [runId]);
      await sql.query(`DELETE FROM maintainer_recommendations WHERE run_id = $1`, [runId]);
      await sql.query(`DELETE FROM maintainer_week_cycles WHERE run_id = $1`, [runId]);
      await sql.query(
        `
          DELETE FROM maintainer_listing_flags
          WHERE run_listing_id IN (
            SELECT run_listing_id
            FROM maintainer_run_listings
            WHERE run_id = $1
          )
        `,
        [runId],
      );
      await sql.query(
        `
          DELETE FROM maintainer_focus_meeting_entries
          WHERE cycle_id IN (
            SELECT cycle_id
            FROM maintainer_week_cycles
            WHERE run_id = $1
          )
        `,
        [runId],
      );
      await sql.query(
        `
          DELETE FROM maintainer_matter_interactions
          WHERE matter_id IN (
            SELECT matter_id
            FROM maintainer_matters
            WHERE run_id = $1
          )
        `,
        [runId],
      );
      await sql.query(
        `
          DELETE FROM maintainer_listing_sellers
          WHERE run_listing_id IN (
            SELECT run_listing_id
            FROM maintainer_run_listings
            WHERE run_id = $1
          )
        `,
        [runId],
      );
      await sql.query(
        `
          DELETE FROM maintainer_listing_competitiveness
          WHERE run_listing_id IN (
            SELECT run_listing_id
            FROM maintainer_run_listings
            WHERE run_id = $1
          )
        `,
        [runId],
      );
      await sql.query(`DELETE FROM maintainer_run_listings WHERE run_id = $1`, [runId]);

      if (cases.length) {
        const values: unknown[] = [];
        const placeholders = cases.map((caseItem, index) => {
          const activeOpportunities = opportunities.filter((entry) => entry.caseId === caseItem.id && entry.status === 'active');
          const highIntentOpportunities = activeOpportunities.filter((entry) => entry.stageIndex >= 3 || Number(entry.intent) >= 75);
          const shadowOpportunities = activeOpportunities.filter((entry) => entry.visibility === 'shadow');
          const finalCaseResult = finalCaseResultById.get(caseItem.id);
          const offset = index * 33;
          values.push(
            buildRunListingId(runId, caseItem.id),
            runId,
            caseItem.housePrototypeId || null,
            caseItem.title || '未命名房源',
            caseItem.community || '未知小区',
            caseItem.district || '未知片区',
            caseItem.layout || '',
            Number(caseItem.area) || 0,
            caseItem.status || 'active',
            resolveListingStageCode(caseItem.stageLabel, caseItem.status),
            resolveSellerProfileCode(caseItem.ownerArchetypeId),
            Number(caseItem.competitiveness) || 0,
            Number(caseItem.d1) || 0,
            Number(caseItem.d2) || 0,
            Number(caseItem.qualityStory) || 0,
            Number(caseItem.heat) || 0,
            Number(caseItem.negotiationBonus) || 0,
            Number(caseItem.heat) || 0,
            Number(activeOpportunities.length > 0 ? Math.min(100, Math.round((highIntentOpportunities.length / activeOpportunities.length) * 100)) : 0),
            finalCaseResult?.goalTier || caseItem.goalTier || null,
            caseItem.storylineState || null,
            finalCaseResult?.relativeOutcome || caseItem.relativeOutcome || null,
            finalCaseResult?.ownerSatisfaction || caseItem.ownerSatisfaction || null,
            finalCaseResult?.defenseOutcome || caseItem.defenseOutcome || null,
            finalCaseResult?.endingType || caseItem.endingType || null,
            finalCaseResult?.endingSummary || caseItem.endingSummary || null,
            finalCaseResult?.soldPrice == null
              ? caseItem.soldPrice == null ? null : Number(caseItem.soldPrice)
              : Number(finalCaseResult.soldPrice),
            Number(caseItem.isFocused ? caseItem.competitiveness : 0) || 0,
            activeOpportunities.length,
            highIntentOpportunities.length,
            shadowOpportunities.length,
            null,
            syncTime,
          );
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}, $${offset + 17}, $${offset + 18}, $${offset + 19}, $${offset + 20}, $${offset + 21}, $${offset + 22}, $${offset + 23}, $${offset + 24}, $${offset + 25}, $${offset + 26}, $${offset + 27}, $${offset + 28}, $${offset + 29}, $${offset + 30}, $${offset + 31}, $${offset + 32}::timestamptz, $${offset + 33}::timestamptz)`;
        }).join(',\n');

        await sql.query(
          `
            INSERT INTO maintainer_run_listings (
              run_listing_id,
              run_id,
              template_listing_id,
              title,
              community,
              district,
              layout,
              area,
              status,
              listing_stage_code,
              seller_profile_code,
              competitiveness_score,
              pricing_power,
              product_power,
              story_power,
              traffic_power,
              conversion_power,
              listing_heat,
              showing_readiness,
              goal_tier,
              storyline_state,
              relative_outcome,
              owner_satisfaction,
              defense_outcome,
              ending_type,
              ending_summary,
              sold_price,
              focus_score,
              active_lead_count,
              high_intent_lead_count,
              shadow_lead_count,
              last_major_event_at,
              updated_at
            )
            VALUES ${placeholders}
          `,
          values,
        );
      }

      if (cases.length) {
        try {
          const values: unknown[] = [];
          const placeholders = cases.map((caseItem, index) => {
            const offset = index * 18;
            values.push(
              `${runId}:${caseItem.id}:seller`,
              buildRunListingId(runId, caseItem.id),
              resolveSellerProfileCode(caseItem.ownerArchetypeId),
              caseItem.ownerName || '匿名业主',
              resolvePressureSourceCode(caseItem),
              Number(caseItem.trust) || 0,
              Number(caseItem.d3) || 0,
              Number(caseItem.patience) || 0,
              resolvePriceFlexReadiness(caseItem),
              clampMetric(((Number(caseItem.trust) || 0) + (Number(caseItem.patience) || 0)) / 2),
              Number(caseItem.urgency) || 0,
              clampMetric(100 - (Number(caseItem.trust) || 0)),
              null,
              null,
              Number(caseItem.trust) || 0,
              null,
              null,
              syncTime,
            );
            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}::timestamptz, $${offset + 17}::timestamptz, $${offset + 18}::timestamptz)`;
          }).join(',\n');

          await sql.query(
            `
              INSERT INTO maintainer_listing_sellers (
                seller_state_id,
                run_listing_id,
                seller_profile_code,
                seller_name,
                pressure_source_code,
                seller_trust,
                seller_confidence,
                seller_patience,
                price_flex_readiness,
                cooperation_level,
                emotion_level,
                communication_debt,
                feedback_preference_code,
                cooperation_style_code,
                trust_baseline,
                last_face_meeting_at,
                last_weekly_feedback_at,
                updated_at
              )
              VALUES ${placeholders}
            `,
            values,
          );
        } catch (error) {
          console.error('Failed to sync selling-houses seller shadow table:', error);
        }
      }

      if (cases.length) {
        try {
          const values: unknown[] = [];
          const placeholders = cases.map((caseItem, index) => {
            const activeOpportunities = opportunities.filter((entry) => entry.caseId === caseItem.id && entry.status === 'active');
            const averageLeadConfidence = activeOpportunities.length
              ? activeOpportunities.reduce((sum, entry) => sum + (Number(entry.confidence) || 0), 0) / activeOpportunities.length
              : 0;
            const latestSnapshot = Array.isArray(caseItem.competitivenessSnapshots)
              ? caseItem.competitivenessSnapshots[0]
              : null;
            const offset = index * 16;
            values.push(
              `${runId}:${caseItem.id}:competitiveness`,
              buildRunListingId(runId, caseItem.id),
              Number(caseItem.competitiveness) || 0,
              Number(caseItem.d1) || 0,
              Number(caseItem.d2) || 0,
              Number(caseItem.qualityStory) || 0,
              Number(caseItem.heat) || 0,
              Number(caseItem.negotiationBonus) || 0,
              resolvePricingPositionScore(caseItem),
              Number(caseItem.d1) || 0,
              clampMetric((Number(caseItem.qualityStory) || 0) * 25),
              clampMetric(((Number(caseItem.heat) || 0) + averageLeadConfidence) / 2),
              clampMetric(((Number(caseItem.d1) || 0) + (Number(caseItem.heat) || 0)) / 2),
              averageLeadConfidence,
              JSON.stringify({
                latestSnapshot,
                axisScores: caseItem.axisScores || {},
                activeLeadCount: activeOpportunities.length,
                highIntentLeadCount: activeOpportunities.filter((entry) => entry.stageIndex >= 3 || Number(entry.intent) >= 75).length,
                price: {
                  askPrice: caseItem.askPrice,
                  marketPrice: caseItem.marketPrice,
                  bottomPrice: caseItem.bottomPrice,
                },
              }),
              syncTime,
            );
            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}::jsonb, $${offset + 16}::timestamptz)`;
          }).join(',\n');

          await sql.query(
            `
              INSERT INTO maintainer_listing_competitiveness (
                competitiveness_id,
                run_listing_id,
                overall_score,
                pricing_power,
                product_power,
                story_power,
                traffic_power,
                conversion_power,
                pricing_position_score,
                market_fit_score,
                story_clarity_score,
                open_day_readiness_score,
                broker_pushability_score,
                showing_feedback_score,
                breakdown_payload,
                updated_at
              )
              VALUES ${placeholders}
            `,
            values,
          );
        } catch (error) {
          console.error('Failed to sync selling-houses competitiveness shadow table:', error);
        }
      }

      try {
        const reviews = Array.isArray(state?.weeklyReviews) ? state.weeklyReviews : [];
        const currentReport = state?.currentReport;
        const currentWeekIndex = resolveWeekIndex(state?.day);
        const cycleMap = new Map<number, { summary: string | null; payload: Record<string, unknown>; closed: boolean }>();

        reviews.forEach((review) => {
          const title = typeof review?.title === 'string' ? review.title : '';
          const weekMatch = title.match(/第\s*(\d+)\s*周/);
          const weekIndex = weekMatch ? Number(weekMatch[1]) : currentWeekIndex;
          cycleMap.set(weekIndex, {
            summary: [review?.note, review?.suggestion].filter(Boolean).join('\n') || null,
            payload: { review },
            closed: true,
          });
        });

        cycleMap.set(currentWeekIndex, {
          summary: typeof currentReport?.title === 'string' ? currentReport.title : cycleMap.get(currentWeekIndex)?.summary || null,
          payload: {
            ...(cycleMap.get(currentWeekIndex)?.payload || {}),
            schedule: state?.schedule || [],
            priorities: state?.priorities || [],
            currentReport: currentReport || null,
          },
          closed: Boolean(cycleMap.get(currentWeekIndex)?.closed),
        });

        const values: unknown[] = [];
        const placeholders = Array.from(cycleMap.entries()).map(([weekIndex, cycle], index) => {
          const offset = index * 11;
          values.push(
            `${runId}:week:${weekIndex}`,
            runId,
            weekIndex,
            `week-${weekIndex}`,
            null,
            null,
            null,
            Array.isArray(cycle.payload.priorities) ? cycle.payload.priorities.length : 0,
            Array.isArray(cycle.payload.schedule) ? cycle.payload.schedule.length : 0,
            JSON.stringify(cycle.payload),
            cycle.summary,
          );
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}::jsonb, $${offset + 11})`;
        }).join(',\n');

        if (placeholders) {
          await sql.query(
            `
              INSERT INTO maintainer_week_cycles (
                cycle_id,
                run_id,
                week_index,
                theme_code,
                focus_meeting_day,
                weekly_feedback_day,
                weekend_peak_day,
                focus_slots,
                open_day_slots,
                schedule_payload,
                summary
              )
              VALUES ${placeholders}
            `,
            values,
          );
        }
      } catch (error) {
        console.error('Failed to sync selling-houses week cycle shadow table:', error);
      }

      try {
        const priorities = Array.isArray(state?.priorities) ? state.priorities : [];
        const schedule = Array.isArray(state?.schedule) ? state.schedule : [];
        const matterEntries = [
          ...priorities.map((entry, index) => ({ ...entry, source: 'priority', sourceIndex: index, fallbackTypeCode: 'case_priority' as const })),
          ...schedule.map((entry, index) => ({ ...entry, source: 'schedule', sourceIndex: index, fallbackTypeCode: 'schedule_risk' as const })),
        ].slice(0, 20);

        const values: unknown[] = [];
        const placeholders = matterEntries.map((entry, index) => {
          const caseId = typeof entry.caseId === 'string' ? entry.caseId : null;
          const runListingId = caseId ? buildRunListingId(runId, caseId) : guessEventRunListingId(runId, state, undefined, `${entry.title || ''} ${entry.note || ''} ${entry.detail || ''}`);
          const offset = index * 16;
          values.push(
            buildMatterId(runId, entry.source, String(entry.key || entry.caseId || entry.title || ''), index),
            runId,
            runListingId,
            resolveWeekIndex(state?.day),
            Number(state?.day) || 1,
            resolveMatterTypeCode(entry, entry.fallbackTypeCode),
            entry.source === 'schedule' ? 'fixed' : 'chain',
            'open',
            caseId ? 'case' : 'system',
            Number(entry.urgency) || Number(entry.priority) || 50,
            typeof entry.deadlineDay === 'number' ? entry.deadlineDay : null,
            String(entry.title || '待处理事项'),
            String(entry.detail || entry.note || entry.badge || ''),
            JSON.stringify(entry),
            JSON.stringify({ caseId, source: entry.source }),
            null,
          );
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}::jsonb, $${offset + 15}::jsonb, $${offset + 16})`;
        }).join(',\n');

        if (placeholders) {
          await sql.query(
            `
              INSERT INTO maintainer_matters (
                matter_id,
                run_id,
                run_listing_id,
                week_index,
                day_index,
                type_code,
                source_code,
                status,
                stakeholder_code,
                priority_score,
                deadline_day,
                title,
                summary,
                context_payload,
                recommended_action_payload,
                interaction_template_code
              )
              VALUES ${placeholders}
            `,
            values,
          );
        }
      } catch (error) {
        console.error('Failed to sync selling-houses matters shadow table:', error);
      }

      try {
        const priorities = Array.isArray(state?.priorities) ? state.priorities : [];
        if (priorities.length) {
          const matterRows = await sql.query(
            `
              SELECT matter_id, run_listing_id
              FROM maintainer_matters
              WHERE run_id = $1
              ORDER BY priority_score DESC, created_at ASC
            `,
            [runId],
          ) as Array<{ matter_id: string; run_listing_id: string | null }>;

          const matterIdByCaseId = new Map<string, string>();
          for (const row of matterRows) {
            const runListingId = row.run_listing_id || '';
            const caseId = runListingId.includes(':') ? runListingId.split(':').slice(1).join(':') : '';
            if (caseId && !matterIdByCaseId.has(caseId)) {
              matterIdByCaseId.set(caseId, row.matter_id);
            }
          }

          const values: unknown[] = [];
          const placeholders = priorities.map((entry, index) => {
            const caseId = typeof entry.caseId === 'string' ? entry.caseId : '';
            const matterId = matterIdByCaseId.get(caseId) || matterRows[index]?.matter_id;
            if (!matterId) {
              return '';
            }

            const offset = values.length;
            values.push(
              buildRecommendationId(runId, matterId, index),
              runId,
              resolveWeekIndex(state?.day),
              Number(state?.day) || 1,
              matterId,
              String(entry.title || '优先推进'),
              caseId
                ? '如果不先处理这套房，局面可能继续滑向失控。'
                : '如果不尽快处理，这个推进窗口会继续缩小。',
              String(entry.detail || '优先把当前最影响结果的事项先推进掉。'),
              100 - index * 10,
            );
            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`;
          }).filter(Boolean).join(',\n');

          if (placeholders) {
            await sql.query(
              `
                INSERT INTO maintainer_recommendations (
                  recommendation_id,
                  run_id,
                  week_index,
                  day_index,
                  matter_id,
                  reason,
                  risk_if_ignored,
                  expected_outcome,
                  score
                )
                VALUES ${placeholders}
              `,
              values,
            );
          }
        }
      } catch (error) {
        console.error('Failed to sync selling-houses recommendations shadow table:', error);
      }

      try {
        const cases = Array.isArray(state?.cases) ? state.cases : [];
        const values: unknown[] = [];

        cases.forEach((caseItem) => {
          const runListingId = buildRunListingId(runId, caseItem.id);
          const derivedFlags = [
            ...(Array.isArray(caseItem.riskFlags) ? caseItem.riskFlags.map((flag) => ({
              flagCode: 'risk_flag',
              flagValue: String(flag),
            })) : []),
            {
              flagCode: 'storyline_state',
              flagValue: String(caseItem.storylineState || 'healthy'),
            },
            {
              flagCode: 'focus_state',
              flagValue: caseItem.isFocused ? 'focused' : 'normal',
            },
            {
              flagCode: 'listing_status',
              flagValue: String(caseItem.status || 'active'),
            },
          ];

          derivedFlags.forEach((flag, index) => {
            values.push(
              buildListingFlagId(runListingId, flag.flagCode, index),
              runListingId,
              flag.flagCode,
              flag.flagValue,
              null,
              null,
            );
          });
        });

        if (values.length) {
          const placeholders = values.reduce<string[]>((acc, _, index) => {
            if (index % 6 === 0) {
              acc.push(`($${index + 1}, $${index + 2}, $${index + 3}, $${index + 4}, $${index + 5}, $${index + 6}::timestamptz)`);
            }
            return acc;
          }, []).join(',\n');

          await sql.query(
            `
              INSERT INTO maintainer_listing_flags (
                flag_id,
                run_listing_id,
                flag_code,
                flag_value,
                source_matter_id,
                expires_at
              )
              VALUES ${placeholders}
            `,
            values,
          );
        }
      } catch (error) {
        console.error('Failed to sync selling-houses listing flags shadow table:', error);
      }

      try {
        const cycleRows = await sql.query(
          `
            SELECT cycle_id, week_index
            FROM maintainer_week_cycles
            WHERE run_id = $1
            ORDER BY week_index ASC
          `,
          [runId],
        ) as Array<{ cycle_id: string; week_index: number }>;
        const currentCycle = cycleRows.find((row) => row.week_index === resolveWeekIndex(state?.day)) || cycleRows[cycleRows.length - 1];
        const focusedCases = (Array.isArray(state?.cases) ? state.cases : []).filter((caseItem) => caseItem.status === 'active' && caseItem.isFocused);

        if (currentCycle && focusedCases.length) {
          const values: unknown[] = [];
          const placeholders = focusedCases.map((caseItem, index) => {
            const offset = index * 6;
            values.push(
              buildFocusMeetingEntryId(currentCycle.cycle_id, buildRunListingId(runId, caseItem.id), index),
              currentCycle.cycle_id,
              buildRunListingId(runId, caseItem.id),
              JSON.stringify({
                title: caseItem.title,
                trust: caseItem.trust,
                competitiveness: caseItem.competitiveness,
                riskFlags: caseItem.riskFlags || [],
              }),
              'approved',
              caseItem.windowDays <= 4
                ? '窗口紧，优先确保这套盘不失守。'
                : '本周聚焦盘，继续压资源最划算。',
            );
            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}::jsonb, $${offset + 5}, $${offset + 6}, '{}'::jsonb)`;
          }).join(',\n');

          await sql.query(
            `
              INSERT INTO maintainer_focus_meeting_entries (
                entry_id,
                cycle_id,
                run_listing_id,
                proposal_payload,
                decision_code,
                decision_reason,
                resource_gain_payload
              )
              VALUES ${placeholders}
            `,
            values,
          );
        }
      } catch (error) {
        console.error('Failed to sync selling-houses focus meeting shadow table:', error);
      }

      try {
        const matterRows = await sql.query(
          `
            SELECT matter_id, run_listing_id, title, summary, priority_score, deadline_day, stakeholder_code, context_payload, recommended_action_payload
            FROM maintainer_matters
            WHERE run_id = $1
            ORDER BY priority_score DESC, created_at ASC
            LIMIT 5
          `,
          [runId],
        ) as Array<{
          matter_id: string;
          run_listing_id: string | null;
          title: string;
          summary: string;
          priority_score: string | number | null;
          deadline_day: number | null;
          stakeholder_code: string;
          context_payload: unknown;
          recommended_action_payload: unknown;
        }>;

        if (matterRows.length) {
          const listingIds = Array.from(new Set(matterRows.map((matter) => matter.run_listing_id).filter(Boolean)));
          const listingRows = listingIds.length
            ? await sql.query(
              `
                SELECT
                  run_listing_id,
                  title,
                  status,
                  storyline_state,
                  competitiveness_score,
                  active_lead_count,
                  high_intent_lead_count,
                  shadow_lead_count
                FROM maintainer_run_listings
                WHERE run_listing_id = ANY($1::text[])
              `,
              [listingIds],
            ) as Array<{
              run_listing_id: string;
              title: string | null;
              status: string | null;
              storyline_state: string | null;
              competitiveness_score: string | number | null;
              active_lead_count: number | null;
              high_intent_lead_count: number | null;
              shadow_lead_count: number | null;
            }>
            : [];
          const listingById = new Map(listingRows.map((row) => [row.run_listing_id, row]));

          const values: unknown[] = [];
          const placeholders = matterRows.map((matter, index) => {
            const turnIndex = 1;
            const offset = index * 10;
            const actionCodes = resolveMatterRecommendedActionCodes(matter);
            const actionDefinitions = actionCodes
              .map((actionCode) => ACTIONS.find((action) => action.id === actionCode || action.executorId === actionCode))
              .filter((entry): entry is (typeof ACTIONS)[number] => Boolean(entry));
            const listing = matter.run_listing_id ? listingById.get(matter.run_listing_id) : undefined;
            const contextPayload = toJsonValue<Record<string, unknown>>(matter.context_payload, {});
            const recommendedPayload = toJsonValue<Record<string, unknown>>(matter.recommended_action_payload, {});
            values.push(
              buildMatterInteractionId(matter.matter_id, turnIndex),
              matter.matter_id,
              turnIndex,
              'system',
              buildMatterPromptText(matter, listing),
              JSON.stringify({
                summary: matter.summary,
                stakeholderCode: matter.stakeholder_code,
                priorityScore: Number(matter.priority_score) || 0,
                deadlineDay: matter.deadline_day,
                listing: listing || null,
                context: contextPayload,
              }),
              actionDefinitions[0]?.id || actionCodes[0] || null,
              JSON.stringify({
                source: 'shadow_sync',
                candidateActionCodes: actionCodes,
                candidateActions: actionDefinitions.map((action) => ({
                  actionId: action.id,
                  executorId: action.executorId,
                  name: action.name,
                  categoryId: action.categoryId,
                  costEnergy: action.costEnergy,
                  costPromotionBudget: action.costPromotionBudget,
                  metricFocus: action.metricFocus,
                })),
              }),
              buildMatterResponseText(matter, actionDefinitions.map((action) => action.name)),
              JSON.stringify({
                source: 'shadow_sync',
                recommendedAction: actionDefinitions[0]
                  ? {
                    actionId: actionDefinitions[0].id,
                    executorId: actionDefinitions[0].executorId,
                    name: actionDefinitions[0].name,
                  }
                  : null,
                recommendedActionPayload: recommendedPayload,
              }),
            );
            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}::jsonb, $${offset + 7}, $${offset + 8}::jsonb, $${offset + 9}, $${offset + 10}::jsonb, NULL, '{}'::jsonb)`;
          }).join(',\n');

          await sql.query(
            `
              INSERT INTO maintainer_matter_interactions (
                interaction_id,
                matter_id,
                turn_index,
                actor_code,
                prompt_text,
                prompt_payload,
                player_choice_code,
                player_choice_payload,
                response_text,
                response_payload,
                outcome_code,
                effects_payload
              )
              VALUES ${placeholders}
            `,
            values,
          );
        }
      } catch (error) {
        console.error('Failed to sync selling-houses matter interactions shadow table:', error);
      }

      if (opportunities.length) {
        const values: unknown[] = [];
        const placeholders = opportunities.map((entry, index) => {
          const offset = index * 15;
          values.push(
            entry.id,
            runId,
            buildRunListingId(runId, entry.caseId),
            entry.customerId || null,
            entry.channelId || null,
            resolveLeadSourceType(entry.leadSource),
            entry.visibility || 'revealed',
            entry.stageLabel || '了解',
            Number(entry.intent) || 0,
            Number(entry.confidence) || 0,
            Number(entry.fit) || 0,
            Number(entry.daysLeft) || 0,
            entry.brokerName || null,
            Boolean(entry.stageIndex >= 3 || entry.intent >= 75),
            syncTime,
          );
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}::timestamptz)`;
        }).join(',\n');

        await sql.query(
          `
            INSERT INTO maintainer_listing_leads (
              lead_id,
              run_id,
              run_listing_id,
              customer_template_id,
              source_channel_code,
              lead_source_type,
              visibility,
              stage_code,
              intent_score,
              confidence_score,
              budget_fit_score,
              days_to_cold,
              broker_name,
              is_key_lead,
              updated_at
            )
            VALUES ${placeholders}
          `,
          values,
        );
      }

      if (opportunities.length) {
        try {
          const caseById = new Map(cases.map((caseItem) => [caseItem.id, caseItem]));
          const values: unknown[] = [];
          const placeholders = opportunities.map((entry, index) => {
            const caseItem = caseById.get(entry.caseId) || null;
            const offset = index * 8;
            values.push(
              buildLeadFeedbackId(entry.id),
              entry.id,
              buildRunListingId(runId, entry.caseId),
              resolveLeadFeedbackType(entry),
              resolveLeadObjectionCode(entry, caseItem),
              resolveLeadSentimentScore(entry),
              buildLeadFeedbackSummary(entry),
              JSON.stringify({
                stageIndex: entry.stageIndex,
                stageLabel: entry.stageLabel || null,
                status: entry.status,
                intent: Number(entry.intent) || 0,
                confidence: Number(entry.confidence) || 0,
                fit: Number(entry.fit) || 0,
                daysLeft: Number(entry.daysLeft) || 0,
                visibility: entry.visibility || 'revealed',
                leadSource: entry.leadSource || 'direct',
                brokerName: entry.brokerName || null,
                customerName: entry.customerName || null,
                channelId: entry.channelId || null,
                history: Array.isArray(entry.history) ? entry.history : [],
                caseContext: caseItem ? {
                  status: caseItem.status || 'active',
                  trust: Number(caseItem.trust) || 0,
                  competitiveness: Number(caseItem.competitiveness) || 0,
                  askPrice: Number(caseItem.askPrice) || 0,
                  marketPrice: Number(caseItem.marketPrice) || 0,
                  bottomPrice: Number(caseItem.bottomPrice) || 0,
                  windowDays: Number(caseItem.windowDays) || 0,
                  riskFlags: Array.isArray(caseItem.riskFlags) ? caseItem.riskFlags : [],
                } : null,
              }),
            );
            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}::jsonb)`;
          }).join(',\n');

          await sql.query(
            `
              INSERT INTO maintainer_lead_feedbacks (
                feedback_id,
                lead_id,
                run_listing_id,
                feedback_type,
                objection_code,
                sentiment_score,
                feedback_summary,
                feedback_payload
              )
              VALUES ${placeholders}
            `,
            values,
          );
        } catch (error) {
          console.error('Failed to sync selling-houses lead feedback shadow table:', error);
        }
      }

      if (eventLog.length) {
        const values: unknown[] = [];
        const placeholders = eventLog.map((entry, index) => {
          const offset = index * 11;
          const actor = typeof entry?.actor === 'string' ? entry.actor : '';
          const message = typeof entry?.message === 'string' ? entry.message : '';
          values.push(
            `${runId}:event:${index + 1}`,
            runId,
            guessEventRunListingId(runId, state, actor, message),
            Number(entry?.day) || 1,
            Number(entry?.day) || 1,
            resolveEventTypeCode(actor, message),
            resolveEventSeverityCode(typeof entry?.tone === 'string' ? entry.tone : undefined),
            resolveEventSourceCode(actor),
            actor || '事件',
            message,
            JSON.stringify({
              tone: typeof entry?.tone === 'string' ? entry.tone : 'accent',
              date: typeof entry?.date === 'string' ? entry.date : null,
            }),
          );
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}::jsonb)`;
        }).join(',\n');

        await sql.query(
          `
            INSERT INTO maintainer_events (
              event_id,
              run_id,
              run_listing_id,
              week_index,
              day_index,
              event_type_code,
              severity_code,
              source_code,
              title,
              summary,
              payload
            )
            VALUES ${placeholders}
          `,
          values,
        );
      }
    });
  }

  async rebuildShadowTables(runId: string, userId: string) {
    const run = await this.getRun(runId, userId);
    if (!run) {
      throw new Error('未找到对应 run，无法重建影子表。');
    }

    await this.syncShadowTables(run.runId, run.saveData);
    return this.verifyShadowSync(run.runId, run.userId);
  }

  async createRun(command: MaintainerCreateRunCommand & { runId: string }) {
    const playerName = normalizePlayerName(command.playerName);
    const seasonId = command.seasonId || 'season-1';
    const status = deriveRunStatus(command.state);
    const score = status === 'finished' ? deriveRunScore(command.state) : null;
    const runContext = command.state.runContext;

    await this.touchUser(command.userId, playerName);

    const created = await withSellingHousesNeon(async (sql) => {
      const rows = await sql.query(
        `
          INSERT INTO maintainer_game_runs (
            run_id,
            user_id,
            player_name,
            status,
            season_id,
            scenario_id,
            difficulty_id,
            world_id,
            world_version,
            rng_seed,
            schema_version,
            day,
            cash,
            energy,
            reputation,
            sold_count,
            withdrawn_count,
            score,
            sync_version,
            scenario_snapshot,
            save_data,
            daily_logs,
            started_at,
            finished_at,
            last_played_at,
            client_updated_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15,
            $16,
            $17,
            $18,
            1,
            $19::jsonb,
            $20::jsonb,
            $21::jsonb,
            NOW(),
            CASE WHEN $4 = 'finished' THEN NOW() ELSE NULL END,
            NOW(),
            $22::timestamptz,
            NOW()
          )
          RETURNING
            run_id,
            user_id,
            player_name,
            status,
            season_id,
            scenario_id,
            difficulty_id,
            world_id,
            world_version,
            rng_seed,
            schema_version,
            day,
            cash,
            energy,
            reputation,
            sold_count,
            withdrawn_count,
            score,
            sync_version,
            scenario_snapshot,
            save_data,
            daily_logs,
            started_at,
            finished_at,
            last_played_at,
            client_updated_at,
            updated_at
        `,
        [
          command.runId,
          command.userId,
          playerName,
          status,
          seasonId,
          runContext?.scenarioId || null,
          runContext?.difficultyId || null,
          runContext?.worldId || null,
          runContext?.worldVersion || null,
          runContext?.rngSeed || null,
          command.state.version,
          command.state.day,
          command.state.cash,
          command.state.energy,
          command.state.reputation,
          command.state.soldCount,
          command.state.withdrawnCount,
          score,
          JSON.stringify(runContext?.scenarioSnapshot || null),
          JSON.stringify(command.state),
          JSON.stringify(command.state.eventLog || []),
          resolveClientUpdatedAt(command.clientUpdatedAt),
        ],
      );

      return mapRunRow((rows as GameRunRow[])[0]);
    });

    await this.upsertLeaderboard(created);
    try {
      await this.upsertProgress(created);
    } catch (error) {
      console.error('Failed to sync selling-houses progress on create:', error);
    }
    try {
      await this.syncShadowTables(created.runId, created.saveData);
    } catch (error) {
      console.error('Failed to sync selling-houses shadow tables on create:', error);
    }
    return created;
  }

  async getRun(runId: string, userId: string) {
    return withSellingHousesNeon(async (sql) => {
      const rows = (await sql.query(
        `
          SELECT
            run_id,
            user_id,
            player_name,
            status,
            season_id,
            scenario_id,
            difficulty_id,
            world_id,
            world_version,
            rng_seed,
            schema_version,
            day,
            cash,
            energy,
            reputation,
            sold_count,
            withdrawn_count,
            score,
            sync_version,
            scenario_snapshot,
            save_data,
            daily_logs,
            started_at,
            finished_at,
            last_played_at,
            client_updated_at,
            updated_at
          FROM maintainer_game_runs
          WHERE run_id = $1 AND user_id = $2
          LIMIT 1
        `,
        [runId, userId],
      )) as GameRunRow[];

      return rows[0] ? mapRunRow(rows[0]) : null;
    });
  }

  async listRuns(userId: string, limit: number) {
    return withSellingHousesNeon(async (sql) => {
      const rows = (await sql.query(
        `
          SELECT
            run_id,
            user_id,
            player_name,
            status,
            season_id,
            scenario_id,
            difficulty_id,
            world_id,
            world_version,
            rng_seed,
            schema_version,
            day,
            cash,
            energy,
            reputation,
            sold_count,
            withdrawn_count,
            score,
            sync_version,
            scenario_snapshot,
            save_data,
            daily_logs,
            started_at,
            finished_at,
            last_played_at,
            client_updated_at,
            updated_at
          FROM maintainer_game_runs
          WHERE user_id = $1
          ORDER BY updated_at DESC
          LIMIT $2
        `,
        [userId, Math.max(1, Math.min(limit, 20))],
      )) as GameRunRow[];

      return rows.map(mapRunRow);
    });
  }

  async saveRun(command: MaintainerSaveRunCommand) {
    const playerName = normalizePlayerName(command.playerName);
    const seasonId = command.seasonId || 'season-1';
    const status = deriveRunStatus(command.state);
    const score = status === 'finished' ? deriveRunScore(command.state) : null;
    const runContext = command.state.runContext;

    await this.touchUser(command.userId, playerName);

    const updatedRows = await withSellingHousesNeon(async (sql) => {
      return (await sql.query(
        `
          UPDATE maintainer_game_runs
          SET
            player_name = $3,
            status = $4,
            season_id = $5,
            scenario_id = $6,
            difficulty_id = $7,
            world_id = $8,
            world_version = $9,
            rng_seed = $10,
            schema_version = $11,
            day = $12,
            cash = $13,
            energy = $14,
            reputation = $15,
            sold_count = $16,
            withdrawn_count = $17,
            score = $18,
            sync_version = sync_version + 1,
            scenario_snapshot = $19::jsonb,
            save_data = $20::jsonb,
            daily_logs = $21::jsonb,
            finished_at = CASE
              WHEN $4 = 'finished' THEN COALESCE(finished_at, NOW())
              ELSE NULL
            END,
            last_played_at = NOW(),
            client_updated_at = $22::timestamptz,
            updated_at = NOW()
          WHERE run_id = $1
            AND user_id = $2
            AND sync_version = $23
          RETURNING
            run_id,
            user_id,
            player_name,
            status,
            season_id,
            scenario_id,
            difficulty_id,
            world_id,
            world_version,
            rng_seed,
            schema_version,
            day,
            cash,
            energy,
            reputation,
            sold_count,
            withdrawn_count,
            score,
            sync_version,
            scenario_snapshot,
            save_data,
            daily_logs,
            started_at,
            finished_at,
            last_played_at,
            client_updated_at,
            updated_at
        `,
        [
          command.runId,
          command.userId,
          playerName,
          status,
          seasonId,
          runContext?.scenarioId || null,
          runContext?.difficultyId || null,
          runContext?.worldId || null,
          runContext?.worldVersion || null,
          runContext?.rngSeed || null,
          command.state.version,
          command.state.day,
          command.state.cash,
          command.state.energy,
          command.state.reputation,
          command.state.soldCount,
          command.state.withdrawnCount,
          score,
          JSON.stringify(runContext?.scenarioSnapshot || null),
          JSON.stringify(command.state),
          JSON.stringify(command.state.eventLog || []),
          resolveClientUpdatedAt(command.clientUpdatedAt),
          command.expectedSyncVersion,
        ],
      )) as GameRunRow[];
    });

    const updated = updatedRows[0];
    if (!updated) {
      const latest = await this.getRun(command.runId, command.userId);
      throw new MaintainerSyncConflictError(latest);
    }

    const record = mapRunRow(updated);
    await this.upsertLeaderboard(record);
    try {
      await this.upsertProgress(record);
    } catch (error) {
      console.error('Failed to sync selling-houses progress on save:', error);
    }
    try {
      await this.syncShadowTables(record.runId, record.saveData);
    } catch (error) {
      console.error('Failed to sync selling-houses shadow tables on save:', error);
    }
    return record;
  }

  async listLeaderboard(seasonId = 'season-1', limit = 20) {
    return withSellingHousesNeon(async (sql) => {
      const rows = (await sql.query(
        `
          SELECT
            run_id,
            user_id,
            player_name,
            season_id,
            score,
            rank_title,
            final_stats,
            score_breakdown,
            finished_at,
            created_at
          FROM maintainer_leaderboard_entries
          WHERE season_id = $1
          ORDER BY score DESC, created_at DESC
          LIMIT $2
        `,
        [seasonId, Math.max(1, Math.min(limit, 50))],
      )) as LeaderboardRow[];

      return rows.map(mapLeaderboardRow);
    });
  }

  async verifyShadowSync(runId: string, userId: string) {
    const run = await this.getRun(runId, userId);
    if (!run) {
      throw new Error('未找到对应 run，无法校验影子表。');
    }

    const expected = buildShadowWriteSummary(run.saveData);

    return withSellingHousesNeon(async (sql) => {
      const listingRows = await sql.query(
        `SELECT COUNT(*) AS count FROM maintainer_run_listings WHERE run_id = $1`,
        [runId],
      ) as Array<{ count: string | number }>;
      const leadRows = await sql.query(
        `SELECT COUNT(*) AS count FROM maintainer_listing_leads WHERE run_id = $1`,
        [runId],
      ) as Array<{ count: string | number }>;
      const leadFeedbackRows = await sql.query(
        `
          SELECT COUNT(*) AS count
          FROM maintainer_lead_feedbacks feedbacks
          JOIN maintainer_run_listings listing
            ON listing.run_listing_id = feedbacks.run_listing_id
          WHERE listing.run_id = $1
        `,
        [runId],
      ) as Array<{ count: string | number }>;
      const eventRows = await sql.query(
        `SELECT COUNT(*) AS count FROM maintainer_events WHERE run_id = $1`,
        [runId],
      ) as Array<{ count: string | number }>;
      const resultRows = await sql.query(
        `
          SELECT COUNT(*) AS count
          FROM maintainer_run_listings
          WHERE run_id = $1
            AND (
              goal_tier IS NOT NULL
              OR storyline_state IS NOT NULL
              OR relative_outcome IS NOT NULL
              OR owner_satisfaction IS NOT NULL
              OR defense_outcome IS NOT NULL
              OR ending_type IS NOT NULL
              OR ending_summary IS NOT NULL
              OR sold_price IS NOT NULL
            )
        `,
        [runId],
      ) as Array<{ count: string | number }>;
      const finalResultRows = await sql.query(
        `
          SELECT COUNT(*) AS count
          FROM maintainer_run_listings
          WHERE run_id = $1
            AND (
              relative_outcome IS NOT NULL
              OR owner_satisfaction IS NOT NULL
              OR defense_outcome IS NOT NULL
              OR ending_type IS NOT NULL
              OR ending_summary IS NOT NULL
              OR sold_price IS NOT NULL
            )
        `,
        [runId],
      ) as Array<{ count: string | number }>;
      const sellerRows = await sql.query(
        `
          SELECT COUNT(*) AS count
          FROM maintainer_listing_sellers seller
          JOIN maintainer_run_listings listing
            ON listing.run_listing_id = seller.run_listing_id
          WHERE listing.run_id = $1
        `,
        [runId],
      ) as Array<{ count: string | number }>;
      const competitivenessRows = await sql.query(
        `
          SELECT COUNT(*) AS count
          FROM maintainer_listing_competitiveness competitiveness
          JOIN maintainer_run_listings listing
            ON listing.run_listing_id = competitiveness.run_listing_id
          WHERE listing.run_id = $1
        `,
        [runId],
      ) as Array<{ count: string | number }>;
      const matterRows = await sql.query(
        `SELECT COUNT(*) AS count FROM maintainer_matters WHERE run_id = $1`,
        [runId],
      ) as Array<{ count: string | number }>;
      const weekCycleRows = await sql.query(
        `SELECT COUNT(*) AS count FROM maintainer_week_cycles WHERE run_id = $1`,
        [runId],
      ) as Array<{ count: string | number }>;
      const recommendationRows = await sql.query(
        `SELECT COUNT(*) AS count FROM maintainer_recommendations WHERE run_id = $1`,
        [runId],
      ) as Array<{ count: string | number }>;
      const flagRows = await sql.query(
        `
          SELECT COUNT(*) AS count
          FROM maintainer_listing_flags flags
          JOIN maintainer_run_listings listing
            ON listing.run_listing_id = flags.run_listing_id
          WHERE listing.run_id = $1
        `,
        [runId],
      ) as Array<{ count: string | number }>;
      const focusMeetingRows = await sql.query(
        `
          SELECT COUNT(*) AS count
          FROM maintainer_focus_meeting_entries entries
          JOIN maintainer_week_cycles cycles
            ON cycles.cycle_id = entries.cycle_id
          WHERE cycles.run_id = $1
        `,
        [runId],
      ) as Array<{ count: string | number }>;
      const matterInteractionRows = await sql.query(
        `
          SELECT COUNT(*) AS count
          FROM maintainer_matter_interactions interactions
          JOIN maintainer_matters matters
            ON matters.matter_id = interactions.matter_id
          WHERE matters.run_id = $1
        `,
        [runId],
      ) as Array<{ count: string | number }>;

      return {
        runId,
        expected,
        actual: {
          listingCount: toNumber(listingRows[0]?.count),
          leadCount: toNumber(leadRows[0]?.count),
          leadFeedbackCount: toNumber(leadFeedbackRows[0]?.count),
          eventCount: toNumber(eventRows[0]?.count),
          listingResultCount: toNumber(resultRows[0]?.count),
          listingFinalResultCount: toNumber(finalResultRows[0]?.count),
          sellerStateCount: toNumber(sellerRows[0]?.count),
          competitivenessCount: toNumber(competitivenessRows[0]?.count),
          matterCount: toNumber(matterRows[0]?.count),
          weekCycleCount: toNumber(weekCycleRows[0]?.count),
          recommendationCount: toNumber(recommendationRows[0]?.count),
          listingFlagCount: toNumber(flagRows[0]?.count),
          focusMeetingEntryCount: toNumber(focusMeetingRows[0]?.count),
          matterInteractionCount: toNumber(matterInteractionRows[0]?.count),
        },
      };
    });
  }
}
