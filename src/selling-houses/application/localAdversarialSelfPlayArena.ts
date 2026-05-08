import { createInitialState } from './gameState.js';
import { updateDerivedState } from '../domain/runtimeState.js';
import { advanceDays, executeAction, findBestOpportunity, getActionAvailability, seedInitialOpportunities } from '../domain/engine.js';
import { getScenarioSnapshotById } from '../domain/scenarioCatalog.js';
import type { Case, FinalResult, GameState, Opportunity, ScenarioSnapshot } from '../domain/models.js';
import { getPromotionBudget, resolveFormalSoldCount } from '../domain/runtimeStats.js';
import { readCaseRelationBusinessContextFromRuntime } from '../core/world-state/relationReadProjection.js';
import { readOwnerBehaviorDimensions } from '../domain/ownerDecisionProfileHelper.js';

type Severity = 'critical' | 'major' | 'minor';

export interface SelfPlayDecision {
  day: number;
  caseId: string;
  caseTitle: string;
  actionId: string;
  optionId: string | null;
  rationale: string;
  energyBefore: number;
  energyAfter: number;
  cashAfter: number;
}

export interface SelfPlayFinding {
  severity: Severity;
  title: string;
  detail: string;
  day?: number;
}

export interface SelfPlayEvaluation {
  score: number;
  verdict: string;
  strengths: string[];
  weaknesses: string[];
  balancingNotes: string[];
}

export interface SelfPlayReport {
  scenarioId: string;
  scenarioName: string;
  seed: number;
  finalResult: GameState['finalResult'];
  soldCount: number;
  withdrawnCount: number;
  commission: number;
  wordOfMouth: number;
  remainingActiveCases: number;
  remainingActiveOpportunities: number;
  shadowStats: SelfPlayShadowStats;
  decisions: SelfPlayDecision[];
  findings: SelfPlayFinding[];
  evaluation: SelfPlayEvaluation;
}

export interface SelfPlayShadowStats {
  activeRivalListings: number;
  totalRivalListings: number;
  marketSignals: number;
  inboundCount: number;
  dailyEventCount: number;
  rivalPressureEvents: number;
  companyPressureEvents: number;
}

export interface SelfPlayRunSnapshot {
  score: number;
  abilityScore: number;
  defenseScore: number;
  satisfactionScore: number;
  endingGood: number;
  endingNeutral: number;
  endingBad: number;
  coreBadCount: number;
  lostToRivalCount: number;
}

interface CandidateDecision {
  actionId: string;
  optionId: string | null;
  rationale: string;
  weight: number;
}

interface PlannedMove {
  caseItem: Case;
  decision: CandidateDecision;
  combinedWeight: number;
}

interface ArenaOptions {
  scenarioId?: string;
  snapshot?: ScenarioSnapshot;
  seed?: number;
}

export class LocalAdversarialSelfPlayArena {
  private readonly snapshot: ScenarioSnapshot;
  private readonly seed: number;
  private readonly findings: SelfPlayFinding[] = [];
  private readonly decisions: SelfPlayDecision[] = [];

  constructor(options: ArenaOptions) {
    const snapshot = options.snapshot || (options.scenarioId ? getScenarioSnapshotById(options.scenarioId) : null);
    if (!snapshot) {
      throw new Error(`未找到剧本 ${options.scenarioId || 'unknown'}`);
    }

    this.snapshot = snapshot;
    this.seed = options.seed ?? 20260417;
  }

  playOneGame() {
    this.findings.length = 0;
    this.decisions.length = 0;

    const state = createInitialState(this.snapshot, this.seed);
    seedInitialOpportunities(state);
    updateDerivedState(state);
    this.collectInvariantFindings(state);

    while (!state.gameOver && state.day <= state.maxDay) {
      this.playOneDay(state);
      this.collectInvariantFindings(state);
    }

    updateDerivedState(state);
    const soldCount = resolveFormalSoldCount(state);

    return {
      scenarioId: this.snapshot.scenario.id,
      scenarioName: this.snapshot.scenario.name,
      seed: this.seed,
      finalResult: state.finalResult,
      soldCount,
      withdrawnCount: state.auxiliaryStats.withdrawnCount,
      commission: state.auxiliaryStats.commission,
      wordOfMouth: state.auxiliaryStats.wordOfMouth,
      remainingActiveCases: state.cases.filter((entry) => entry.status === 'active').length,
      remainingActiveOpportunities: state.opportunities.filter((entry) => entry.status === 'active').length,
      shadowStats: buildShadowStats(state),
      decisions: this.decisions,
      findings: this.dedupeFindings(),
      evaluation: this.buildEvaluation(state),
    } satisfies SelfPlayReport;
  }

  private playOneDay(state: GameState) {
    let safetyCounter = 0;

    while (!state.gameOver && state.energy > 0 && safetyCounter < 20) {
      updateDerivedState(state);
      const plannedMove = this.pickPlannedMove(state);
      if (!plannedMove) {
        break;
      }

      const { caseItem, decision } = plannedMove;
      const energyBefore = state.energy;
      const ok = executeAction(state, decision.actionId, caseItem, decision.optionId);
      if (!ok) {
        this.findings.push({
          severity: 'major',
          title: '动作执行失败',
          detail: `第 ${state.day} 天尝试执行 ${decision.actionId} 失败，说明可用性判断和执行链存在分歧。`,
          day: state.day,
        });
        break;
      }

      this.decisions.push({
        day: state.day,
        caseId: caseItem.id,
        caseTitle: caseItem.title,
        actionId: decision.actionId,
        optionId: decision.optionId,
        rationale: decision.rationale,
        energyBefore,
        energyAfter: state.energy,
        cashAfter: getPromotionBudget(state),
      });

      this.collectInvariantFindings(state);
      safetyCounter += 1;
    }

    if (!state.gameOver) {
      advanceDays(state, 1);
    }
  }

  private scoreCase(caseItem: Case, state: GameState) {
    const activeOpps = state.opportunities.filter((entry) => entry.caseId === caseItem.id && entry.status === 'active');
    const shadowCount = activeOpps.filter((entry) => entry.visibility === 'shadow').length;
    const lateStageCount = activeOpps.filter((entry) => entry.stageIndex >= 3).length;
    const pricePressure = Math.max(0, caseItem.askPrice - caseItem.marketPrice) / 2;

    const relationTrust = readCaseRelationBusinessContextFromRuntime(state, caseItem).trustValue;
    return (100 - caseItem.windowDays * 8)
      + (65 - relationTrust)
      + (58 - caseItem.heat)
      + pricePressure
      + shadowCount * 8
      + lateStageCount * 10;
  }

  private pickPlannedMove(state: GameState) {
    const activeCases = state.cases
      .filter((entry) => entry.status === 'active')
      .sort((left, right) => this.scoreCase(right, state) - this.scoreCase(left, state));

    let bestMove: PlannedMove | null = null;

    activeCases.forEach((caseItem) => {
      const decision = this.pickDecision(state, caseItem);
      if (!decision) {
        return;
      }

      const combinedWeight = this.scoreCase(caseItem, state) + decision.weight;
      if (!bestMove || combinedWeight > bestMove.combinedWeight) {
        bestMove = { caseItem, decision, combinedWeight };
      }
    });

    return bestMove;
  }

  private pickDecision(state: GameState, caseItem: Case) {
    const candidates: CandidateDecision[] = [];
    const shadowLead = state.opportunities.find((entry) => entry.caseId === caseItem.id && entry.status === 'active' && entry.visibility === 'shadow');
    const lateOpportunity = findBestOpportunity(state, caseItem.id, 3);
    const showingOpportunity = findBestOpportunity(state, caseItem.id, 0, 2);

    if (shadowLead) {
      candidates.push({
        actionId: 'deep-diagnosis',
        optionId: null,
        rationale: '把待确认客户和真实卡点讲透，避免后面动作都打偏。',
        weight: 98,
      });
    }

    if (lateOpportunity) {
      candidates.push({
        actionId: 'invite-customer-negotiation',
        optionId: this.pickNegotiationOption(state, caseItem, lateOpportunity),
        rationale: '已经接近成交区间，优先收口高阶段机会。',
        weight: 95,
      });
    }

    const relationTrust = readCaseRelationBusinessContextFromRuntime(state, caseItem).trustValue;
    if (caseItem.windowDays <= 4 || relationTrust < 56) {
      candidates.push({
        actionId: caseItem.hasCompletedFirstVisit ? 'weekly-feedback' : 'first-visit',
        optionId: null,
        rationale: '推进和关系都在吃紧，先保盘。',
        weight: 90,
      });
    }

    if (caseItem.askPrice > caseItem.marketPrice * 1.04 || caseItem.priceGapPct > 5) {
      candidates.push({
        actionId: 'adjust-listing-price',
        optionId: this.pickPriceOption(state, caseItem),
        rationale: '价格锚偏高，先处理成交确定性。',
        weight: 88,
      });
    }

    if (caseItem.askPrice > caseItem.marketPrice * 1.02 && caseItem.d3 < 68) {
      candidates.push({
        actionId: 'pricing-advice',
        optionId: null,
        rationale: '先让业主理解竞争、客户和当前进程，再推进后续价格动作。',
        weight: 80,
      });
    }

    if (showingOpportunity) {
      candidates.push({
        actionId: 'showing',
        optionId: null,
        rationale: '当前存在可推进线索，带看是最直接的转化动作。',
        weight: 82,
      });
    }

    if (caseItem.heat < 52 && caseItem.openDayCooldown === 0 && getPromotionBudget(state) >= 5 && state.energy >= 2) {
      candidates.push({
        actionId: 'open-day',
        optionId: null,
        rationale: '盘面发冷但仍有推广金，适合用开放日拉热度。',
        weight: 72,
      });
    }

    if (caseItem.competitiveness < 68) {
      candidates.push({
        actionId: 'story',
        optionId: null,
        rationale: '基础竞争力不足，先补讲法。',
        weight: 64,
      });
    }

    if (getPromotionBudget(state) >= 2 && caseItem.heat < 58) {
      candidates.push({
        actionId: 'xiaohongshu-boost',
        optionId: null,
        rationale: '用小红书补一轮公开进线，避免漏斗断层。',
        weight: 54,
      });
    }

    if (getPromotionBudget(state) >= 3 && !state.opportunities.some((entry) => entry.caseId === caseItem.id && entry.status === 'active' && entry.visibility === 'shadow')) {
      candidates.push({
        actionId: 'broker-broadcast',
        optionId: null,
        rationale: '盘源适合扩给经纪人网络，补一批待确认客户。',
        weight: 51,
      });
    }

    if (getPromotionBudget(state) >= 2 && relationTrust >= 62 && caseItem.qualityStory >= 1) {
      candidates.push({
        actionId: 'private-referral',
        optionId: null,
        rationale: '业主关系和讲法都不错，适合用私域关系链换更高质量客户。',
        weight: 49,
      });
    }

    if (state.opportunities.some((entry) => entry.caseId === caseItem.id && entry.status === 'active' && entry.stageIndex >= 2 && entry.visibility !== 'shadow')) {
      candidates.push({
        actionId: 'sincerity-sale',
        optionId: null,
        rationale: '已有成熟客户时，适合先搭起桌子，换更高确定性。',
        weight: 66,
      });
    }

    candidates.push({
      actionId: caseItem.hasCompletedFirstVisit ? 'weekly-feedback' : 'first-visit',
      optionId: null,
      rationale: '默认保底动作是继续稳住业主预期。',
      weight: 20,
    });

    return candidates
      .filter((entry, index, list) => {
        return list.findIndex((candidate) => candidate.actionId === entry.actionId && candidate.optionId === entry.optionId) === index;
      })
      .sort((left, right) => right.weight - left.weight)
      .find((entry) => getActionAvailability(state, caseItem, entry.actionId).enabled);
  }

  private pickPriceOption(state: GameState, caseItem: Case) {
    const priceGap = caseItem.askPrice - caseItem.marketPrice;
    const relationTrust = readCaseRelationBusinessContextFromRuntime(state, caseItem).trustValue;
    const ownerBehavior = readOwnerBehaviorDimensions(caseItem);
    if (caseItem.windowDays <= 4 || relationTrust < 45 || priceGap > 35) {
      return 'deep-cut';
    }
    if (priceGap > 10 || ownerBehavior.priceSensitivity >= 68 || ownerBehavior.timePressure >= 72) {
      return 'small-cut';
    }
    return 'hold-story';
  }

  private pickNegotiationOption(state: GameState, caseItem: Case, opportunity: Opportunity) {
    if (opportunity.intent >= 90 && opportunity.confidence >= 85) {
      return 'hold';
    }
    const relationTrust = readCaseRelationBusinessContextFromRuntime(state, caseItem).trustValue;
    if (caseItem.windowDays <= 3 || relationTrust < 52) {
      return 'close';
    }
    return 'balanced';
  }

  private collectInvariantFindings(state: GameState) {
    state.opportunities
      .filter((entry) => entry.status === 'active')
      .forEach((entry) => {
        if (entry.daysLeft <= 0) {
          this.findings.push({
            severity: 'critical',
            title: '活跃线索天数越界',
            detail: `${entry.customerName} 仍然是 active，但 daysLeft 已经降到 ${entry.daysLeft}。`,
            day: state.day,
          });
        }

        if (entry.stageIndex < 0 || entry.stageIndex > 6) {
          this.findings.push({
            severity: 'critical',
            title: '线索阶段越界',
            detail: `${entry.customerName} 的阶段索引变成 ${entry.stageIndex}，已经超出定义范围。`,
            day: state.day,
          });
        }
      });

    state.cases
      .filter((entry) => entry.status === 'active')
      .forEach((entry) => {
        if (entry.windowDays <= 0 && entry.status === 'active') {
          this.findings.push({
            severity: 'critical',
            title: '房源推进未正确收口',
            detail: `${entry.title} 仍然 active，但 windowDays 已经是 ${entry.windowDays}。`,
            day: state.day,
          });
        }

        if (entry.askPrice < entry.bottomPrice) {
          this.findings.push({
            severity: 'major',
            title: '报价跌破预期',
            detail: `${entry.title} 当前报价 ${entry.askPrice} 低于业主预期 ${entry.bottomPrice}。`,
            day: state.day,
          });
        }
      });
  }

  private dedupeFindings() {
    return this.findings.filter((entry, index, list) => {
      return list.findIndex((candidate) => {
        return candidate.title === entry.title && candidate.detail === entry.detail && candidate.day === entry.day;
      }) === index;
    });
  }

  private buildEvaluation(state: GameState): SelfPlayEvaluation {
    const finalResult = state.finalResult;
    const endingStats = finalResult?.endingStats;
    const score = finalResult?.score ?? 0;

    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const balancingNotes: string[] = [];

    if (endingStats) {
      if (endingStats.good >= endingStats.bad + 2) {
        strengths.push('自玩局里好收尾明显多于坏收尾，房源主线能闭环。');
      } else {
        weaknesses.push('坏收尾占比偏高，说明房源主线还容易被盘面或关系拖崩。');
      }

      if (endingStats.coreBadCount > 0) {
        weaknesses.push('核心盘出现坏收尾，守盘压力需要继续调锋利。');
      }
    }

    if (finalResult && finalResult.dimensions.satisfaction.score >= 18) {
      strengths.push('满意分能站住，业主感受不是纯装饰动作。');
    } else {
      weaknesses.push('满意分偏弱，关系动作对中后期收尾还不够稳。');
    }

    if (finalResult && finalResult.dimensions.defense.score < 20) {
      weaknesses.push('守盘分偏低，说明竞争和推进压力已经能造成实际后果。');
    }

    if (getPromotionBudget(state) <= 4) {
      balancingNotes.push('推广金资源偏紧，投放和开放日已经能形成真实取舍。');
    } else {
      balancingNotes.push('推广金压力还不算强，后续可以继续加大高价值动作的现金权重。');
    }

    if (endingStats && endingStats.bad === 0) {
      balancingNotes.push('坏收尾目前没有出现，hard 以上剧本可能还需要更锋利的失守压力。');
    }

    if (this.dedupeFindings().some((entry) => entry.severity === 'critical')) {
      balancingNotes.push('运行时仍存在 critical 级异常，正式上线前应先收敛状态机风险。');
    }

    let verdict = '可玩，但还需要继续打磨';
    if (score >= 65) {
      verdict = '主循环已经成立';
    } else if (score < 45) {
      verdict = '系统张力还不够稳定';
    }

    return {
      score,
      verdict,
      strengths,
      weaknesses,
      balancingNotes,
    };
  }
}

export function buildSelfPlayRunSnapshot(finalResult: FinalResult | null): SelfPlayRunSnapshot {
  return {
    score: finalResult?.score ?? 0,
    abilityScore: finalResult?.dimensions.ability.score ?? 0,
    defenseScore: finalResult?.dimensions.defense.score ?? 0,
    satisfactionScore: finalResult?.dimensions.satisfaction.score ?? 0,
    endingGood: finalResult?.endingStats.good ?? 0,
    endingNeutral: finalResult?.endingStats.neutral ?? 0,
    endingBad: finalResult?.endingStats.bad ?? 0,
    coreBadCount: finalResult?.endingStats.coreBadCount ?? 0,
    lostToRivalCount: finalResult?.caseResults.filter((entry) => entry.defenseOutcome === 'lost_to_rival').length ?? 0,
  };
}

function buildShadowStats(state: GameState): SelfPlayShadowStats {
  const logEntries = state.eventLog || [];
  return {
    activeRivalListings: state.marketShadow.rivalListings.filter((entry) => entry.status === 'active').length,
    totalRivalListings: state.marketShadow.rivalListings.length,
    marketSignals: state.marketShadow.marketSignals.length,
    inboundCount: state.marketShadow.inboundQueue.length,
    dailyEventCount: logEntries.filter((entry) => entry.actor === '商圈动态').length,
    rivalPressureEvents: logEntries.filter((entry) => entry.actor === '竞品压制' || entry.actor === '竞品房源').length,
    companyPressureEvents: logEntries.filter((entry) => entry.actor === '公司资源').length,
  };
}
