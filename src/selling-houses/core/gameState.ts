import { 
  STORAGE_KEY, INITIAL_CASES, CASE_STAGES 
} from './constants';
import { clamp, getOpportunityPriority, average } from './utils';

export interface GameState {
  version: number;
  day: number;
  maxDay: number;
  currentDate: string;
  maxEnergy: number;
  energy: number;
  cash: number;
  reputation: number;
  commission: number;
  soldCount: number;
  withdrawnCount: number;
  selectedCaseId: string | null;
  gameOver: boolean;
  finalResult: any;
  lastMessage: string;
  cases: any[];
  opportunities: any[];
  eventLog: any[];
  weeklyReviews: any[];
  markets: any[];
  customers: any[];
  channels: any[];
  schedule: any[];
  priorities: any[];
  metrics: any;
}

export function createInitialState(marketCells: any[], customers: any[], channels: any[]): GameState {
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
    selectedCaseId: INITIAL_CASES[0].id,
    gameOver: false,
    finalResult: null,
    lastMessage: "一局已开始。你有 18 天和每天 4 点精力，目标至少做成 2 单。",
    channels: JSON.parse(JSON.stringify(channels)),
    markets: JSON.parse(JSON.stringify(marketCells)),
    customers: JSON.parse(JSON.stringify(customers)),
    cases: INITIAL_CASES.map(seedCase),
    opportunities: [],
    eventLog: [],
    weeklyReviews: [],
    schedule: [],
    priorities: [],
    metrics: {},
  };

  return world;
}

export function seedCase(base: any) {
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

function deriveRiskFlags(world: GameState, caseItem: any, opportunities: any[]) {
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
    if (caseItem.openDayCooldown === 1) {
      items.push({
        key: `${caseItem.id}-cooldown`,
        title: "开放日冷却结束",
        badge: "明天",
        note: `${caseItem.title} 的开放日动作会在明天重新可用。`,
        urgency: 52,
      });
    }
  });

  world.opportunities
    .filter((entry) => entry.status === "active" && entry.daysLeft <= 2)
    .forEach((entry) => {
      items.push({
        key: entry.id,
        title: entry.stageLabel,
        badge: `${entry.daysLeft} 天后流失`,
        note: `${entry.customerName} 正在从 ${world.cases.find(c => c.id === entry.caseId).title} 上流失，最好今天就碰一下。`,
        urgency: 86 - entry.daysLeft * 10 + entry.stageIndex * 4,
      });
    });

  if (world.day % 7 === 6) {
    items.push({
      key: `week-${world.day}`,
      title: "周结算即将到来",
      badge: "明日周结",
      note: "检查你的机会池、关系分和成交推进，不要把风险拖进下周。",
      urgency: 60,
    });
  }
  return items.sort((left, right) => right.urgency - left.urgency).slice(0, 10);
}

function derivePriorities(world: GameState) {
  const items: any[] = [];
  world.cases
    .filter((entry) => entry.status === "active")
    .sort((left, right) => getCaseRiskScore(right) - getCaseRiskScore(left))
    .slice(0, 2)
    .forEach((caseItem) => {
      items.push({
        kind: "case",
        title: `先稳住 ${caseItem.title}`,
        detail: `${caseItem.ownerName} 当前信任 ${Math.round(caseItem.trust)}，窗口还剩 ${caseItem.windowDays} 天。`,
        caseId: caseItem.id,
      });
    });

  world.opportunities
    .filter((entry) => entry.status === "active")
    .slice(0, 2)
    .forEach((entry) => {
      items.push({
        kind: "opportunity",
        title: `推进 ${entry.customerName}`,
        detail: `${entry.customerName} 已进入 ${entry.stageLabel}，${entry.daysLeft} 天后可能流失。`,
        caseId: entry.caseId,
      });
    });

  if (world.energy <= 1) {
    items.push({
      kind: "resource",
      title: "精力只剩最后一点",
      detail: "如果你今天已经没有把握，就收盘进入明天，不要把动作浪费在低价值盘上。",
      caseId: null,
    });
  }
  return items.slice(0, 5);
}

function deriveMetrics(world: GameState) {
  const activeCases = world.cases.filter((entry) => entry.status === "active");
  const activeOpportunities = world.opportunities.filter((entry) => entry.status === "active");
  return {
    activeCaseCount: activeCases.length,
    activeOpportunityCount: activeOpportunities.length,
    averageTrust: Math.round(average(activeCases.map((entry) => entry.trust))),
    topConversion: activeOpportunities.length ? `${Math.round(activeOpportunities[0].intent)}%` : "暂无",
  };
}

function getCaseRiskScore(c: any) {
  return (100 - c.trust) * 1.2 + (15 - c.windowDays) * 4 + (c.askPrice / c.marketPrice - 1) * 200;
}
