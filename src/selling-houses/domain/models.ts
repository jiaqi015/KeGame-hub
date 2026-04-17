export interface Case {
  id: string;
  title: string;
  community: string;
  district: string;
  layout: string;
  area: number;
  askPrice: number;
  marketPrice: number;
  bottomPrice: number;
  patience: number;
  trust: number;
  heat: number;
  competitiveness: number;
  d1: number;
  d2: number;
  d3: number;
  axisScores: Record<string, number>;
  urgency: number;
  windowDays: number;
  ownerName: string;
  ownerMood: string;
  maintainerName: string;
  marketCellId: string;
  story: string;
  tags: string[];
  defects: string[];
  status: 'active' | 'sold' | 'withdrawn';
  stageIndex: number;
  stageLabel: string;
  riskFlags: string[];
  actionsToday: number;
  touchedToday: boolean;
  touchedOwnerToday: boolean;
  lastTouchedDay: number;
  lastAction: string;
  lastPriceActionDay: number;
  openDayCooldown: number;
  qualityStory: number;
  negotiationBonus: number;
  viewings: number;
  offers: number;
  soldPrice: number | null;
  priceGapPct: number;
  competitivenessSnapshots: CompetitivenessSnapshot[];
}

export interface Opportunity {
  id: string;
  caseId: string;
  customerId: string;
  customerName: string;
  profile: string;
  channelId: string;
  channelName: string;
  fit: number;
  intent: number;
  confidence: number;
  stageIndex: number;
  stageLabel: string;
  status: 'active' | 'won' | 'lost' | 'closed';
  daysLeft: number;
  touchedToday: boolean;
  budgetMax: number;
  priceSensitivity: number;
  stagnationTicks: number;
  history: { day: number; stage: string }[];
}

export interface CompetitivenessSnapshot {
  day: number;
  total: number;
  d1: number;
  d2: number;
  d3: number;
  delta: number;
  breakdown: {
    d1_delta: number;
    d1_drivers: { signal: string; contribution: number; reason: string }[];
    d2_delta: number;
    d3_delta: number;
    d3_drivers: { signal: string; contribution: number; reason: string }[];
  };
}

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
  cases: Case[];
  opportunities: Opportunity[];
  eventLog: any[];
  weeklyReviews: any[];
  markets: any[];
  customers: any[];
  channels: any[];
  schedule: any[];
  priorities: any[];
  metrics: any;
}
