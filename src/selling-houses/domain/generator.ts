import { 
  MARKET_CELLS, 
  COMMUNITY_TEMPLATES, 
  OWNER_NAMES, 
  MAINTAINER_NAMES, 
  LAYOUT_TEMPLATES, 
  STORY_TEMPLATES, 
  DEFECT_POOL, 
  TAG_POOL 
} from './constants';
import { Case } from './models';

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateInitialCases(count: number = 8): Case[] {
  const cases: Case[] = [];
  
  for (let i = 0; i < count; i++) {
    // 1. Pick a market (alternating to ensure balance)
    const market = MARKET_CELLS[i % MARKET_CELLS.length];
    
    // 2. Pick a layout template
    const layoutTpt = getRandomItem(LAYOUT_TEMPLATES);
    const area = getRandomRange(layoutTpt.areaRange[0], layoutTpt.areaRange[1]);
    
    // 3. Calculate Prices (with some random variance)
    const basePrice = area * layoutTpt.pricePerSqm; // in 万
    const marketPrice = Math.round(basePrice * (0.95 + Math.random() * 0.1)); // +/- 5%
    const askPrice = Math.round(marketPrice * (1.02 + Math.random() * 0.05)); // 2-7% markup
    const bottomPrice = Math.round(marketPrice * (0.92 + Math.random() * 0.05)); // 3-8% discount
    
    // 4. Initial Scores
    const trust = getRandomRange(40, 75);
    const patience = getRandomRange(30, 85);
    const urgency = getRandomRange(30, 90);
    const windowDays = getRandomRange(5, 30);
    
    // 5. Assets Axis (D2)
    const axisScores = {
      layout: getRandomRange(50, 90),
      light: getRandomRange(40, 95),
      floor: getRandomRange(30, 95),
      decor: getRandomRange(20, 90),
      amenity: getRandomRange(50, 95),
      neighborhood: getRandomRange(60, 98),
      structure: getRandomRange(50, 95),
    };

    const districtName = market.name.split(' | ')[0];
    const community = getRandomItem(COMMUNITY_TEMPLATES[market.id] || ["未知小区"]);

    const caseItem: Case = {
      id: `rcase-${1000 + i}`,
      title: `${community} ${area}㎡ ${layoutTpt.layout.slice(0, 2)}`,
      community,
      district: districtName,
      layout: layoutTpt.layout,
      area,
      askPrice,
      marketPrice,
      bottomPrice,
      patience,
      trust,
      heat: getRandomRange(30, 70),
      competitiveness: 0, // Will be calculated by updateDerivedState
      urgency,
      windowDays,
      ownerName: getRandomItem(OWNER_NAMES),
      ownerMood: "待观察",
      maintainerName: getRandomItem(MAINTAINER_NAMES),
      marketCellId: market.id,
      story: getRandomItem(STORY_TEMPLATES),
      tags: [getRandomItem(TAG_POOL), getRandomItem(TAG_POOL)],
      defects: [getRandomItem(DEFECT_POOL)],
      d1: 50,
      d2: 50,
      d3: 50,
      axisScores,
      competitivenessSnapshots: [],
      stageIndex: 0,
      stageLabel: "获客启动",
      status: "active",
      riskFlags: [],
      actionsToday: 0,
      touchedToday: true,
      touchedOwnerToday: true,
      lastTouchedDay: 0,
      lastAction: "init",
      lastPriceActionDay: 0,
      openDayCooldown: 0,
      qualityStory: 0,
      negotiationBonus: 0,
      viewings: 0,
      offers: 0,
      soldPrice: null,
      priceGapPct: 0,
    };

    cases.push(caseItem);
  }

  return cases;
}
