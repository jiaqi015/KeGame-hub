import { 
  STORAGE_KEY, CASE_STAGES 
} from '../domain/constants';
import { clamp, getOpportunityPriority, average } from '../domain/utils';
import { updateCompetitiveness, calculateUrgency } from '../domain/scoring';
import { generateInitialCases } from '../domain/generator';
import { GameState, Case, Opportunity, CompetitivenessSnapshot } from '../domain/models';

export function createInitialState(marketCells: any[], customers: any[], channels: any[]): GameState {
  const generatedCases = generateInitialCases(8).map(seedCase);
  
  const world: GameState = {
    version: 3,
    day: 1,
    maxDay: 18,
    currentDate: new Date().toISOString().split('T')[0],
    maxEnergy: 4,
    energy: 4,
    cash: 18,
    reputation: 56,
    commission: 0,
    soldCount: 0,
    withdrawnCount: 0,
    selectedCaseId: generatedCases[0].id,
    gameOver: false,
    finalResult: null,
    lastMessage: "一局已开始。你有 18 天和每天 4 点精力，目标是统筹 8 套房源实现多单成交。",
    channels: JSON.parse(JSON.stringify(channels)),
    markets: JSON.parse(JSON.stringify(marketCells)),
    customers: JSON.parse(JSON.stringify(customers)),
    cases: generatedCases,
    opportunities: [],
    eventLog: [],
    weeklyReviews: [],
    schedule: [],
    priorities: [],
    metrics: {},
    currentReport: null,
  };

  return world;
}

export function seedCase(base: any): Case {
  return {
    ...base,
    status: "active",
    stageIndex: 0,
    stageLabel: CASE_STAGES[0],
    riskFlags: [],
    actionsToday: 0,
    touchedToday: false,
    touchedOwnerToday: false,
    lastTouchedDay: 0,
    lastAction: "",
    lastPriceActionDay: -99,
    openDayCooldown: 0,
    qualityStory: 0,
    negotiationBonus: 0,
    viewings: 0,
    offers: 0,
    soldPrice: null,
    priceGapPct: 0,
    d1: 50,
    d2: 50,
    d3: 50,
    competitivenessSnapshots: [],
  };
}

export function logEvent(world: GameState, actor: string, message: string, tone: string = "accent") {
  world.eventLog.unshift({
    actor,
    message,
    tone,
    day: world.day,
    date: world.currentDate
  });
  if (world.eventLog.length > 80) {
    world.eventLog.pop();
  }
}

export function loadSavedState(): GameState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 3) return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

export function saveGameState(world: GameState) {
  try {
    const snapshot = {
      ...world,
      eventLog: world.eventLog.slice(0, 80),
      weeklyReviews: world.weeklyReviews.slice(0, 12),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.error("Save failed", error);
  }
}

export function updateDerivedState(world: GameState) {
  world.cases.forEach((caseItem) => {
    const opportunities = world.opportunities.filter(o => o.caseId === caseItem.id && o.status === 'active');
    const highestStage = opportunities.length ? Math.max(...opportunities.map((entry) => entry.stageIndex)) : 0;

    if (caseItem.status === "sold") {
      caseItem.stageLabel = "已成交";
    } else if (caseItem.status === "withdrawn") {
      caseItem.stageLabel = "已撤盘";
    } else {
      caseItem.stageIndex = Math.max(caseItem.stageIndex, highestStage);
      caseItem.stageLabel = CASE_STAGES[clamp(caseItem.stageIndex, 0, CASE_STAGES.length - 1)];
    }

    caseItem.priceGapPct = Math.round(((caseItem.askPrice - caseItem.marketPrice) / caseItem.marketPrice) * 1000) / 10;
    
    // §3.2 Update New Competitiveness Model
    updateCompetitiveness(world, caseItem);

    caseItem.riskFlags = deriveRiskFlags(world, caseItem, opportunities);
  });

  world.schedule = deriveSchedule(world);
  world.priorities = derivePriorities(world);
  world.metrics = deriveMetrics(world);
  
  if (!world.cases.some(c => c.id === world.selectedCaseId)) {
    world.selectedCaseId = world.cases.find(c => c.status === 'active')?.id || world.cases[0]?.id;
  }

  world.opportunities.sort((left, right) => getOpportunityPriority(right) - getOpportunityPriority(left));
}

function deriveRiskFlags(world: GameState, caseItem: Case, opportunities: Opportunity[]) {
  const flags = [];
  if (caseItem.status !== "active") return flags;
  if (caseItem.trust < 58) flags.push("关系脆弱");
  if (caseItem.windowDays <= 4) flags.push("窗口逼近");
  if (caseItem.askPrice > caseItem.marketPrice * 1.05) flags.push("价格锚偏高");
  if (caseItem.heat < 48) flags.push("盘面发冷");
  if (!opportunities.length) flags.push("线索断档");
  if (!flags.length) flags.push("节奏稳定");
  return flags;
}

function deriveSchedule(world: GameState) {
  const items: any[] = [];
  world.cases.forEach((caseItem) => {
    if (caseItem.status !== "active") return;
    if (caseItem.windowDays <= 4) {
      items.push({
        key: `${caseItem.id}-window`,
        title: "业主窗口逼近",
        badge: `${caseItem.windowDays} 天内`,
        note: `${caseItem.title} 需要先稳住 ${caseItem.ownerName} 的预期。`,
        urgency: 100 - caseItem.windowDays * 10,
      });
    }
  });

  world.opportunities
    .filter((entry) => entry.status === "active" && entry.daysLeft <= 2)
    .forEach((entry) => {
      const isShadow = entry.visibility === 'shadow';
      const displayName = isShadow ? `影子客 #${entry.id.split('-').pop()}` : entry.customerName;
      items.push({
        key: entry.id,
        title: isShadow ? '同步经纪人' : entry.stageLabel,
        badge: `${entry.daysLeft} 天后流失`,
        note: `${displayName} 正在从 ${world.cases.find(c => c.id === entry.caseId)!.title} 上流失，最好今天就碰一下。`,
        urgency: 86 - entry.daysLeft * 10 + entry.stageIndex * 4,
      });
    });

  return items.sort((left, right) => right.urgency - left.urgency).slice(0, 10);
}

function derivePriorities(world: GameState) {
  const items: any[] = [];
  world.cases
    .filter((entry) => entry.status === "active")
    .sort((left, right) => calculateUrgency(right) - calculateUrgency(left))
    .slice(0, 2)
    .forEach((caseItem) => {
      items.push({
        kind: "case",
        title: `先稳住 ${caseItem.title}`,
        detail: `${caseItem.ownerName} 当前信任 ${Math.round(caseItem.trust)}，D3 意愿分 ${Math.round(caseItem.d3)}。`,
        caseId: caseItem.id,
      });
    });

  world.opportunities
    .filter((entry) => entry.status === "active")
    .slice(0, 2)
    .forEach((entry) => {
      const isShadow = entry.visibility === 'shadow';
      const displayName = isShadow ? `影子客 #${entry.id.split('-').pop()}` : entry.customerName;
      items.push({
        kind: "opportunity",
        title: isShadow ? `揭晓 ${displayName}` : `推进 ${displayName}`,
        detail: isShadow ? `这是一条黑盒线索，建议先与经纪人 ${entry.brokerName} 对线。` : `${displayName} 已进入 ${entry.stageLabel}，${entry.daysLeft} 天后可能流失。`,
        caseId: entry.caseId,
      });
    });

  return items.slice(0, 5);
}

function deriveMetrics(world: GameState) {
  const activeCases = world.cases.filter((entry) => entry.status === "active");
  const activeOpportunities = world.opportunities.filter((entry) => entry.status === "active");
  return {
    activeCaseCount: activeCases.length,
    activeOpportunityCount: activeOpportunities.length,
    averageTrust: Math.round(average(activeCases.map((entry) => entry.trust))),
    averageD1: Math.round(average(activeCases.map((entry) => entry.d1))),
    averageD3: Math.round(average(activeCases.map((entry) => entry.d3))),
    topConversion: activeOpportunities.length ? `${Math.round(activeOpportunities[0].intent)}%` : "暂无",
  };
}
