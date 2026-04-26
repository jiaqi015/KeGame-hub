import type { Case } from '../../domain/models.js';

export type OwnerPersonaTone = 'accent' | 'chance' | 'risk' | 'neutral';

export interface OwnerPersonaProfile {
  label: string;
  tone: OwnerPersonaTone;
  communicationLabel: string;
  priceLabel: string;
  paceLabel: string;
}

export function buildOwnerPersonaProfile(caseItem: Case): OwnerPersonaProfile {
  const priceGapRatio = (caseItem.askPrice - caseItem.marketPrice) / Math.max(caseItem.marketPrice, 1);
  const urgentPace = caseItem.urgency >= 78 || caseItem.windowDays <= 5;
  const shortWindow = caseItem.urgency >= 70 || caseItem.windowDays <= 8;
  const longWindow = caseItem.urgency <= 62 && caseItem.windowDays >= 10;
  const anchoredPrice = priceGapRatio >= 0.035
    || caseItem.ownerArchetypeId === 'fair-value'
    || caseItem.ownerArchetypeId === 'game-player';
  const flexiblePrice = priceGapRatio <= 0.015
    || caseItem.ownerArchetypeId === 'anxious';
  const lowRelation = caseItem.trust < 56 || caseItem.patience < 45;
  const dataDriven = caseItem.personality === 'pragmatic'
    || caseItem.ownerArchetypeId === 'fair-value'
    || caseItem.ownerArchetypeId === 'game-player';
  const heatSensitive = caseItem.ownerArchetypeId === 'trial-balloon'
    || caseItem.personality === 'emotional'
    || caseItem.heat < 52;

  if (lowRelation) {
    return buildOwnerPersonaResult('信任修复型', 'risk', dataDriven, anchoredPrice, flexiblePrice, urgentPace, longWindow);
  }
  if (urgentPace && flexiblePrice) {
    return buildOwnerPersonaResult('急售好谈型', 'risk', dataDriven, anchoredPrice, flexiblePrice, urgentPace, longWindow);
  }
  if (urgentPace && anchoredPrice) {
    return buildOwnerPersonaResult('急售锚定型', 'risk', dataDriven, anchoredPrice, flexiblePrice, urgentPace, longWindow);
  }
  if (shortWindow) {
    return buildOwnerPersonaResult('期限压力型', 'accent', dataDriven, anchoredPrice, flexiblePrice, urgentPace, longWindow);
  }
  if (anchoredPrice && dataDriven) {
    return buildOwnerPersonaResult('数据锚定型', 'accent', dataDriven, anchoredPrice, flexiblePrice, urgentPace, longWindow);
  }
  if (heatSensitive) {
    return buildOwnerPersonaResult('热度敏感型', 'chance', dataDriven, anchoredPrice, flexiblePrice, urgentPace, longWindow);
  }
  if (longWindow || caseItem.ownerArchetypeId === 'trial-balloon') {
    return buildOwnerPersonaResult('观望试水型', 'neutral', dataDriven, anchoredPrice, flexiblePrice, urgentPace, longWindow);
  }
  return buildOwnerPersonaResult('稳价慢谈型', 'neutral', dataDriven, anchoredPrice, flexiblePrice, urgentPace, longWindow);
}

function buildOwnerPersonaResult(
  label: string,
  tone: OwnerPersonaTone,
  dataDriven: boolean,
  anchoredPrice: boolean,
  flexiblePrice: boolean,
  urgentPace: boolean,
  longWindow: boolean,
): OwnerPersonaProfile {
  return {
    label,
    tone,
    communicationLabel: dataDriven ? '数据沟通' : urgentPace ? '结果沟通' : '信任沟通',
    priceLabel: flexiblePrice ? '价格好谈' : anchoredPrice ? '价格有锚点' : '价格可沟通',
    paceLabel: urgentPace ? '急迫' : longWindow ? '观望' : '常规',
  };
}
