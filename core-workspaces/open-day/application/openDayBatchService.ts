import type { OpenDayAnalysisRow, OpenDayConfig, OpenDayScoreCommand } from '../domain/openDay.types.js';
import { scoreOpenDayDataset } from '../domain/openDayScoringEngine.js';

export interface BatchRecalculateResult {
  snapshotId: string;
  datasetId: string;
  success: boolean;
  result?: OpenDayAnalysisRow[];
  championName?: string;
  eligibleCount?: number;
  totalCount?: number;
  error?: string;
  durationMs: number;
}

export interface CrossPeriodComparisonResult {
  periodA: {
    snapshotId: string;
    timestamp: string;
    topPerformers: { name: string; score: number; rank: number }[];
  };
  periodB: {
    snapshotId: string;
    timestamp: string;
    topPerformers: { name: string; score: number; rank: number }[];
  };
  movers: {
    name: string;
    scoreChange: number;
    rankChange: number;
    direction: 'up' | 'down' | 'stable';
  }[];
  commonProjects: string[];
}

export interface TrendAnalysisResult {
  name: string;
  snapshots: {
    snapshotId: string;
    timestamp: string;
    score: number;
    rank: number;
  }[];
  trend: 'improving' | 'declining' | 'stable';
  avgScoreChange: number;
  avgRankChange: number;
}

export interface DatasetQualityReport {
  totalRows: number;
  eligibleRows: number;
  avgScore: number;
  avgScaleIdx: number;
  avgTrafficIdx: number;
  avgProductIdx: number;
  avgInteractionIdx: number;
  tierDistribution: Record<string, number>;
  logicGuardSummary: {
    hasIssue: boolean;
    issueCount: number;
    issueTypes: string[];
  };
}

export class OpenDayBatchService {
  private db: any = null;
  private initialized = false;

  private async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const duckdbModule = await import('duckdb').catch(() => null);
      if (!duckdbModule) {
        console.warn('[OpenDayBatchService] DuckDB package not installed');
        return;
      }
      this.db = new duckdbModule.Database(':memory:');
      this.initialized = true;
    } catch (error) {
      console.warn('[OpenDayBatchService] DuckDB not available, falling back to in-memory:', error);
      this.initialized = false;
    }
  }

  async recalculateMultiple(
    snapshots: Array<{
      snapshotId: string;
      datasetId: string;
      rows: any[];
      mappings: any;
      config: OpenDayConfig;
    }>,
    newConfig: OpenDayConfig,
  ): Promise<BatchRecalculateResult[]> {
    const results: BatchRecalculateResult[] = [];

    for (const snapshot of snapshots) {
      const startTime = Date.now();
      try {
        const command: OpenDayScoreCommand = {
          rows: snapshot.rows,
          mappings: snapshot.mappings,
          config: newConfig,
          scenario: null,
        };

        const result = await scoreOpenDayDataset(command);

        results.push({
          snapshotId: snapshot.snapshotId,
          datasetId: snapshot.datasetId,
          success: true,
          result: result.results,
          championName: result.results[0]?.name,
          eligibleCount: result.results.filter((r) => r.isEligible).length,
          totalCount: result.results.length,
          durationMs: Date.now() - startTime,
        });
      } catch (error) {
        results.push({
          snapshotId: snapshot.snapshotId,
          datasetId: snapshot.datasetId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs: Date.now() - startTime,
        });
      }
    }

    return results;
  }

  async comparePeriods(
    periodA: { snapshotId: string; timestamp: string; rows: OpenDayAnalysisRow[] },
    periodB: { snapshotId: string; timestamp: string; rows: OpenDayAnalysisRow[] },
    topN = 10,
  ): Promise<CrossPeriodComparisonResult> {
    const topA = periodA.rows.slice(0, topN).map((r, i) => ({ name: r.name, score: r.score, rank: i + 1 }));
    const topB = periodB.rows.slice(0, topN).map((r, i) => ({ name: r.name, score: r.score, rank: i + 1 }));

    const nameToRankA = new Map(topA.map((t) => [t.name, t.rank]));
    const nameToRankB = new Map(topB.map((t) => [t.name, t.rank]));
    const nameToScoreA = new Map(topA.map((t) => [t.name, t.score]));
    const nameToScoreB = new Map(topB.map((t) => [t.name, t.score]));

    const commonNames = [...new Set([...topA.map((t) => t.name), ...topB.map((t) => t.name)])];

    const movers = commonNames.map((name) => {
      const rankA = nameToRankA.get(name) ?? topN + 1;
      const rankB = nameToRankB.get(name) ?? topN + 1;
      const scoreA = nameToScoreA.get(name) ?? 0;
      const scoreB = nameToScoreB.get(name) ?? 0;
      const rankChange = rankA - rankB;
      const scoreChange = scoreB - scoreA;

      let direction: 'up' | 'down' | 'stable' = 'stable';
      if (Math.abs(rankChange) >= 2) {
        direction = rankChange > 0 ? 'up' : 'down';
      }

      return {
        name,
        scoreChange: Number((scoreChange * 100) / 100),
        rankChange,
        direction,
      };
    }).sort((a, b) => b.rankChange - a.rankChange);

    return {
      periodA: {
        snapshotId: periodA.snapshotId,
        timestamp: periodA.timestamp,
        topPerformers: topA,
      },
      periodB: {
        snapshotId: periodB.snapshotId,
        timestamp: periodB.timestamp,
        topPerformers: topB,
      },
      movers,
      commonProjects: commonNames,
    };
  }

  async analyzeTrends(
    historySnapshots: Array<{
      snapshotId: string;
      timestamp: string;
      rows: OpenDayAnalysisRow[];
    }>,
    topN = 20,
  ): Promise<TrendAnalysisResult[]> {
    if (historySnapshots.length < 2) return [];

    const nameHistory = new Map<string, Array<{ snapshotId: string; timestamp: string; score: number; rank: number }>>();

    historySnapshots.forEach((snapshot) => {
      snapshot.rows.forEach((row, rowIndex) => {
        if (!nameHistory.has(row.name)) {
          nameHistory.set(row.name, []);
        }
        nameHistory.get(row.name)!.push({
          snapshotId: snapshot.snapshotId,
          timestamp: snapshot.timestamp,
          score: row.score,
          rank: rowIndex + 1,
        });
      });
    });

    const results: TrendAnalysisResult[] = [];

    for (const [name, history] of nameHistory) {
      if (history.length < 2) continue;

      const sortedHistory = history.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      const scoreChanges: number[] = [];
      const rankChanges: number[] = [];

      for (let i = 1; i < sortedHistory.length; i++) {
        scoreChanges.push(sortedHistory[i].score - sortedHistory[i - 1].score);
        rankChanges.push(sortedHistory[i - 1].rank - sortedHistory[i].rank);
      }

      const avgScoreChange = scoreChanges.reduce((a, b) => a + b, 0) / scoreChanges.length;
      const avgRankChange = rankChanges.reduce((a, b) => a + b, 0) / rankChanges.length;

      let trend: 'improving' | 'declining' | 'stable' = 'stable';
      if (avgScoreChange > 0.05 && avgRankChange > 1) {
        trend = 'improving';
      } else if (avgScoreChange < -0.05 && avgRankChange < -1) {
        trend = 'declining';
      }

      results.push({
        name,
        snapshots: sortedHistory,
        trend,
        avgScoreChange: Number((avgScoreChange * 100) / 100),
        avgRankChange: Number((avgRankChange * 100) / 100),
      });
    }

    return results
      .sort((a, b) => Math.abs(b.avgRankChange) - Math.abs(a.avgRankChange))
      .slice(0, topN);
  }

  async generateQualityReport(rows: OpenDayAnalysisRow[]): Promise<DatasetQualityReport> {
    const eligibleRows = rows.filter((r) => r.isEligible);
    const rowsWithIssues = rows.filter((r) => r.logicGuardTags && r.logicGuardTags.length > 0);
    const allIssues = rowsWithIssues.flatMap((r) => r.logicGuardTags || []);
    const uniqueIssueTypes = [...new Set(allIssues)];

    const tierDistribution: Record<string, number> = {};
    rows.forEach((r) => {
      const tier = r.tierCode || 'unknown';
      tierDistribution[tier] = (tierDistribution[tier] || 0) + 1;
    });

    return {
      totalRows: rows.length,
      eligibleRows: eligibleRows.length,
      avgScore: rows.reduce((sum, r) => sum + r.score, 0) / rows.length,
      avgScaleIdx: rows.reduce((sum, r) => sum + r.scaleIdx, 0) / rows.length,
      avgTrafficIdx: rows.reduce((sum, r) => sum + r.trafficIdx, 0) / rows.length,
      avgProductIdx: rows.reduce((sum, r) => sum + r.productIdx, 0) / rows.length,
      avgInteractionIdx: rows.reduce((sum, r) => sum + r.interactionIdx, 0) / rows.length,
      tierDistribution,
      logicGuardSummary: {
        hasIssue: rowsWithIssues.length > 0,
        issueCount: rowsWithIssues.length,
        issueTypes: uniqueIssueTypes,
      },
    };
  }

  async queryWithDuckDB<T>(query: string): Promise<T[]> {
    await this.init();
    if (!this.db) {
      throw new Error('DuckDB not available');
    }

    return new Promise((resolve, reject) => {
      this.db!.all(query, (err: Error | null, result: T[]) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  async loadAnalysisRows(rows: OpenDayAnalysisRow[], tableName = 'analysis_results'): Promise<void> {
    await this.init();
    if (!this.db) return;

    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
    if (!safeTableName) {
      throw new Error('Invalid table name');
    }

    const validTableNames = ['analysis_results', 'analysis_rows', 'snapshot_rows'];
    if (!validTableNames.includes(safeTableName)) {
      throw new Error('Table name not allowed, use one of: ' + validTableNames.join(', '));
    }

    const insertBatch = (batch: OpenDayAnalysisRow[]): Promise<void> => {
      return new Promise((resolve, reject) => {
        const placeholders = batch.map(() => '?').join(', ');
        const values = batch.map((row) => JSON.stringify(row));
        
        this.db!.all(`
          INSERT INTO ${safeTableName} SELECT * FROM read_json_auto([${placeholders}])
        `, values, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    };

    await new Promise<void>((resolve, reject) => {
      this.db!.all(`
        CREATE OR REPLACE TABLE ${safeTableName} (
          name VARCHAR,
          score DOUBLE,
          rank INTEGER,
          scaleIdx INTEGER,
          trafficIdx INTEGER,
          productIdx INTEGER,
          interactionIdx INTEGER,
          catalyst DOUBLE,
          isEligible BOOLEAN,
          tierCode VARCHAR,
          tierLabel VARCHAR
        )
      `, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      await insertBatch(rows.slice(i, i + batchSize));
    }
  }
}

let batchServiceSingleton: OpenDayBatchService | null = null;

export function getOpenDayBatchService() {
  if (!batchServiceSingleton) {
    batchServiceSingleton = new OpenDayBatchService();
  }
  return batchServiceSingleton;
}
