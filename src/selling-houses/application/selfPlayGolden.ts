import fs from 'node:fs';
import path from 'node:path';
import {
  buildSelfPlayRunSnapshot,
  type SelfPlayDecision,
  type SelfPlayFinding,
  type SelfPlayReport,
} from './localAdversarialSelfPlayArena.js';

export interface SelfPlayGoldenReport {
  schemaVersion: 1;
  scenarioId: string;
  scenarioName: string;
  seed: number;
  runSnapshot: ReturnType<typeof buildSelfPlayRunSnapshot>;
  auxiliaryStats: {
    soldCount: number;
    withdrawnCount: number;
    commission: number;
    wordOfMouth: number;
  };
  remaining: {
    activeCases: number;
    activeOpportunities: number;
  };
  shadowStats: SelfPlayReport['shadowStats'];
  evaluation: SelfPlayReport['evaluation'];
  decisions: Pick<SelfPlayDecision, 'day' | 'caseId' | 'actionId' | 'optionId' | 'energyBefore' | 'energyAfter' | 'cashAfter'>[];
  findings: SelfPlayFinding[];
  finalCaseResults: Array<{
    caseId: string;
    status: string;
    endingType: string;
    defenseOutcome: string;
    ownerSatisfaction: string;
    endingBucket: string;
  }>;
}

export interface SelfPlayGoldenDiff {
  equal: boolean;
  differences: string[];
}

export function buildSelfPlayGoldenReport(report: SelfPlayReport): SelfPlayGoldenReport {
  return {
    schemaVersion: 1,
    scenarioId: report.scenarioId,
    scenarioName: report.scenarioName,
    seed: report.seed,
    runSnapshot: buildSelfPlayRunSnapshot(report.finalResult),
    auxiliaryStats: {
      soldCount: report.soldCount,
      withdrawnCount: report.withdrawnCount,
      commission: round(report.commission),
      wordOfMouth: round(report.wordOfMouth),
    },
    remaining: {
      activeCases: report.remainingActiveCases,
      activeOpportunities: report.remainingActiveOpportunities,
    },
    shadowStats: report.shadowStats,
    evaluation: report.evaluation,
    decisions: report.decisions.map((entry) => ({
      day: entry.day,
      caseId: entry.caseId,
      actionId: entry.actionId,
      optionId: entry.optionId,
      energyBefore: entry.energyBefore,
      energyAfter: entry.energyAfter,
      cashAfter: round(entry.cashAfter),
    })),
    findings: report.findings,
    finalCaseResults: (report.finalResult?.caseResults || []).map((entry) => ({
      caseId: entry.caseId,
      status: entry.status,
      endingType: entry.endingType,
      defenseOutcome: entry.defenseOutcome,
      ownerSatisfaction: entry.ownerSatisfaction,
      endingBucket: entry.endingBucket,
    })),
  };
}

export function saveSelfPlayGoldenReport(report: SelfPlayGoldenReport, filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${stableStringify(report)}\n`, 'utf8');
}

export function loadSelfPlayGoldenReport(filePath: string): SelfPlayGoldenReport {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as SelfPlayGoldenReport;
}

export function diffSelfPlayGoldenReports(
  expected: SelfPlayGoldenReport,
  actual: SelfPlayGoldenReport,
): SelfPlayGoldenDiff {
  const differences: string[] = [];
  collectDiffs('', expected, actual, differences);
  return {
    equal: differences.length === 0,
    differences,
  };
}

export function stableStringify(value: unknown) {
  return `${JSON.stringify(sortDeep(value), null, 2)}`;
}

function collectDiffs(pathName: string, expected: unknown, actual: unknown, differences: string[]) {
  if (Object.is(expected, actual)) {
    return;
  }

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      differences.push(`${pathName || '<root>'}: type changed`);
      return;
    }

    if (expected.length !== actual.length) {
      differences.push(`${pathName || '<root>'}: length ${expected.length} -> ${actual.length}`);
    }

    const maxLength = Math.max(expected.length, actual.length);
    for (let index = 0; index < maxLength && differences.length < 50; index += 1) {
      collectDiffs(`${pathName}[${index}]`, expected[index], actual[index], differences);
    }
    return;
  }

  if (isRecord(expected) || isRecord(actual)) {
    if (!isRecord(expected) || !isRecord(actual)) {
      differences.push(`${pathName || '<root>'}: type changed`);
      return;
    }

    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) {
      if (differences.length >= 50) {
        return;
      }
      collectDiffs(pathName ? `${pathName}.${key}` : key, expected[key], actual[key], differences);
    }
    return;
  }

  differences.push(`${pathName || '<root>'}: ${String(expected)} -> ${String(actual)}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortDeep(value[key])]),
  );
}
