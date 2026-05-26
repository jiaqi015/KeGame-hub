import { CASE_STAGES, OPPORTUNITY_STAGES } from './constants.js';
import type { Case, GameState, Opportunity } from './models.js';
import { clamp, getOpportunityPriority } from './utils.js';
import { setOpportunityStageIndexOnState, setOpportunityTouchedTodayOnState, syncCaseStageMirrorFromCaseProgressionOnState } from './opportunitySplitHelper.js';
import { isCaseActiveByCanonicalStatus, readCaseLifecycleStatus } from './caseLifecycleStatusRead.js';
import { isOpportunityActiveByCanonicalState, filterActiveOpportunitiesByCanonicalState } from './opportunityLifecycleStatusRead.js';

export type CaseProgressPhase =
  | 'pre_visit'
  | 'positioning'
  | 'lead_building'
  | 'showing_validation'
  | 'feedback_offer'
  | 'closing'
  | 'sold';

export type ActionAvailabilityKind =
  | 'stage-independent'
  | 'phase-bound'
  | 'opportunity-bound';

export interface OpportunityStageWindow {
  min: number;
  max: number;
}

export interface ActionStageRelation {
  actionId: string;
  availabilityKind: ActionAvailabilityKind;
  phaseIds: CaseProgressPhase[];
  completesPhaseIds: CaseProgressPhase[];
  revealsOwnerState?: boolean;
  touchesOwner?: boolean;
  repeatableAfterCompletion?: boolean;
  opportunityStageWindow?: OpportunityStageWindow;
  opportunityStageFloor?: number;
  caseStageFloor?: number;
  caseOffersFloor?: number;
}

export interface CaseProgression {
  phase: CaseProgressPhase;
  ownerStateVisible: boolean;
  legacyStageIndex: number;
  legacyStageLabel: string;
  activeOpportunityCount: number;
  highestOpportunityStage: number;
  viewingCount: number;
  offerCount: number;
  hasPendingClosing: boolean;
  nextActionIds: string[];
}

const CASE_STAGE = {
  leadBuilding: 1,
  showing: 2,
  showingValidation: 3,
  feedbackOffer: 4,
  closing: 5,
  sold: 6,
} as const;

const OPPORTUNITY_STAGE = {
  viewingReady: 2,
  viewed: 3,
  feedbackOffer: 4,
  closing: 5,
  offer: 6,
} as const;

export const ACTION_STAGE_RELATIONS: ActionStageRelation[] = [
  {
    actionId: 'first-visit',
    availabilityKind: 'phase-bound',
    phaseIds: ['pre_visit'],
    completesPhaseIds: ['pre_visit'],
    revealsOwnerState: true,
    touchesOwner: true,
    repeatableAfterCompletion: false,
    caseStageFloor: 0,
  },
  {
    actionId: 'weekly-feedback',
    availabilityKind: 'stage-independent',
    phaseIds: ['positioning', 'lead_building', 'showing_validation', 'feedback_offer', 'closing'],
    completesPhaseIds: [],
    touchesOwner: true,
  },
  {
    actionId: 'deep-diagnosis',
    availabilityKind: 'stage-independent',
    phaseIds: ['pre_visit', 'positioning', 'lead_building', 'showing_validation', 'feedback_offer', 'closing'],
    completesPhaseIds: [],
    touchesOwner: true,
  },
  {
    actionId: 'story',
    availabilityKind: 'phase-bound',
    phaseIds: ['positioning', 'lead_building', 'showing_validation'],
    completesPhaseIds: [],
  },
  {
    actionId: 'xiaohongshu-boost',
    availabilityKind: 'stage-independent',
    phaseIds: ['positioning', 'lead_building', 'showing_validation'],
    completesPhaseIds: [],
    caseStageFloor: CASE_STAGE.leadBuilding,
  },
  {
    actionId: 'broker-broadcast',
    availabilityKind: 'stage-independent',
    phaseIds: ['positioning', 'lead_building', 'showing_validation'],
    completesPhaseIds: [],
    caseStageFloor: CASE_STAGE.leadBuilding,
  },
  {
    actionId: 'private-referral',
    availabilityKind: 'stage-independent',
    phaseIds: ['positioning', 'lead_building', 'showing_validation'],
    completesPhaseIds: [],
    caseStageFloor: CASE_STAGE.leadBuilding,
  },
  {
    actionId: 'focus-meeting-submit',
    availabilityKind: 'stage-independent',
    phaseIds: ['positioning', 'lead_building', 'showing_validation', 'feedback_offer', 'closing'],
    completesPhaseIds: [],
    touchesOwner: true,
  },
  {
    actionId: 'open-day',
    availabilityKind: 'phase-bound',
    phaseIds: ['lead_building', 'showing_validation', 'feedback_offer'],
    completesPhaseIds: [],
    caseStageFloor: CASE_STAGE.showing,
  },
  {
    actionId: 'showing',
    availabilityKind: 'opportunity-bound',
    phaseIds: ['lead_building', 'showing_validation', 'feedback_offer', 'closing'],
    completesPhaseIds: [],
    opportunityStageWindow: { min: 0, max: 2 },
    opportunityStageFloor: OPPORTUNITY_STAGE.viewingReady,
    caseStageFloor: CASE_STAGE.showing,
  },
  {
    actionId: 'pricing-advice',
    availabilityKind: 'stage-independent',
    phaseIds: ['positioning', 'lead_building', 'showing_validation', 'feedback_offer', 'closing'],
    completesPhaseIds: [],
    touchesOwner: true,
  },
  {
    actionId: 'ask-psychological-price',
    availabilityKind: 'stage-independent',
    phaseIds: ['positioning', 'lead_building', 'showing_validation', 'feedback_offer', 'closing'],
    completesPhaseIds: [],
    touchesOwner: true,
  },
  {
    actionId: 'adjust-listing-price',
    availabilityKind: 'phase-bound',
    phaseIds: ['feedback_offer', 'closing'],
    completesPhaseIds: [],
    touchesOwner: true,
    caseStageFloor: CASE_STAGE.feedbackOffer,
  },
  {
    actionId: 'sincerity-sale',
    availabilityKind: 'opportunity-bound',
    phaseIds: ['showing_validation', 'feedback_offer', 'closing'],
    completesPhaseIds: [],
    opportunityStageWindow: { min: 2, max: 6 },
    opportunityStageFloor: OPPORTUNITY_STAGE.feedbackOffer,
    caseStageFloor: CASE_STAGE.feedbackOffer,
    caseOffersFloor: 1,
  },
  {
    actionId: 'invite-customer-negotiation',
    availabilityKind: 'opportunity-bound',
    phaseIds: ['showing_validation', 'feedback_offer', 'closing'],
    completesPhaseIds: [],
    opportunityStageWindow: { min: 3, max: 6 },
    opportunityStageFloor: OPPORTUNITY_STAGE.closing,
    caseStageFloor: CASE_STAGE.closing,
    caseOffersFloor: 1,
  },
];

export const ACTION_STAGE_RELATION_BY_ID = Object.fromEntries(
  ACTION_STAGE_RELATIONS.map((entry) => [entry.actionId, entry]),
) as Record<string, ActionStageRelation>;

export function getActionStageRelation(actionId: string) {
  return ACTION_STAGE_RELATION_BY_ID[actionId] || null;
}

function getActiveCaseOpportunities(world: GameState, caseId: string) {
  return filterActiveOpportunitiesByCanonicalState(world, world.opportunities.filter((entry) => entry.caseId === caseId));
}

function getHighestOpportunityStage(opportunities: Opportunity[]) {
  return opportunities.length ? Math.max(...opportunities.map((entry) => entry.stageIndex)) : 0;
}

function deriveLegacyCaseStage(world: GameState, caseItem: Case, activeOpportunities: Opportunity[]) {
  // R41: Use canonical status instead of mirror
  const lifecycleStatus = readCaseLifecycleStatus(world, caseItem);
  if (lifecycleStatus.status === 'sold') {
    return CASE_STAGE.sold;
  }
  if (lifecycleStatus.status !== 'active') {
    return clamp(caseItem.stageIndex, 0, CASE_STAGE.closing);
  }

  const highestOpportunityStage = getHighestOpportunityStage(activeOpportunities);
  const viewingCount = Math.max(
    caseItem.viewings || 0,
    activeOpportunities.filter((entry) => entry.stageIndex >= OPPORTUNITY_STAGE.viewingReady).length,
  );
  const offerCount = Math.max(
    caseItem.offers || 0,
    activeOpportunities.filter((entry) => entry.stageIndex >= OPPORTUNITY_STAGE.offer).length,
  );
  const hasPendingClosing = activeOpportunities.some((entry) => entry.pendingClosingEvaluation);

  if (hasPendingClosing || highestOpportunityStage >= OPPORTUNITY_STAGE.closing) {
    return CASE_STAGE.closing;
  }
  if (offerCount > 0 || highestOpportunityStage >= OPPORTUNITY_STAGE.feedbackOffer) {
    return CASE_STAGE.feedbackOffer;
  }
  if (viewingCount >= 2 || highestOpportunityStage >= OPPORTUNITY_STAGE.viewed) {
    return CASE_STAGE.showingValidation;
  }
  if (viewingCount >= 1 || highestOpportunityStage >= OPPORTUNITY_STAGE.viewingReady) {
    return CASE_STAGE.showing;
  }
  if (activeOpportunities.length > 0) {
    return CASE_STAGE.leadBuilding;
  }
  return 0;
}

function derivePhase(world: GameState, caseItem: Case, legacyStageIndex: number) {
  // R41: Use canonical status instead of mirror
  const lifecycleStatus = readCaseLifecycleStatus(world, caseItem);
  if (lifecycleStatus.status === 'sold') return 'sold';
  if (!caseItem.hasCompletedFirstVisit) return 'pre_visit';
  if (legacyStageIndex >= CASE_STAGE.closing) return 'closing';
  if (legacyStageIndex >= CASE_STAGE.feedbackOffer) return 'feedback_offer';
  if (legacyStageIndex >= CASE_STAGE.showing) return 'showing_validation';
  if (legacyStageIndex >= CASE_STAGE.leadBuilding) return 'lead_building';
  return 'positioning';
}

function deriveNextActionIds(phase: CaseProgressPhase) {
  return ACTION_STAGE_RELATIONS
    .filter((entry) => entry.phaseIds.includes(phase))
    .map((entry) => entry.actionId);
}

export function deriveCaseProgression(world: GameState, caseItem: Case): CaseProgression {
  const activeOpportunities = getActiveCaseOpportunities(world, caseItem.id);
  const highestOpportunityStage = getHighestOpportunityStage(activeOpportunities);
  const legacyStageIndex = deriveLegacyCaseStage(world, caseItem, activeOpportunities);
  const phase = derivePhase(world, caseItem, legacyStageIndex);
  const viewingCount = Math.max(
    caseItem.viewings || 0,
    activeOpportunities.filter((entry) => entry.stageIndex >= OPPORTUNITY_STAGE.viewingReady).length,
  );
  const offerCount = Math.max(
    caseItem.offers || 0,
    activeOpportunities.filter((entry) => entry.stageIndex >= OPPORTUNITY_STAGE.offer).length,
  );

  return {
    phase,
    ownerStateVisible: caseItem.hasCompletedFirstVisit,
    legacyStageIndex,
    legacyStageLabel: CASE_STAGES[clamp(legacyStageIndex, 0, CASE_STAGES.length - 1)],
    activeOpportunityCount: activeOpportunities.length,
    highestOpportunityStage,
    viewingCount,
    offerCount,
    hasPendingClosing: activeOpportunities.some((entry) => entry.pendingClosingEvaluation),
    nextActionIds: deriveNextActionIds(phase),
  };
}

function findRelationOpportunity(
  world: GameState,
  caseId: string,
  relation: ActionStageRelation,
) {
  const active = getActiveCaseOpportunities(world, caseId);
  const window = relation.opportunityStageWindow;
  const candidates = window
    ? active.filter((entry) => entry.stageIndex >= window.min && entry.stageIndex <= window.max)
    : active;
  return candidates
    .sort((left, right) => getOpportunityPriority(right) - getOpportunityPriority(left))[0] || null;
}

function applyOpportunityStageFloor(world: GameState, opportunity: Opportunity, floor: number) {
  const nextStageIndex = clamp(Math.max(opportunity.stageIndex, floor), 0, OPPORTUNITY_STAGES.length - 1);
  // Always sync stageLabel via helper (even if index unchanged, label may need refresh)
  setOpportunityStageIndexOnState(world, opportunity, nextStageIndex, '阶段下限推进');
  opportunity.history.push({ day: world.day, stage: opportunity.stageLabel });
}

export function applyActionStageRelation(
  world: GameState,
  caseItem: Case,
  actionId: string,
  opportunity?: Opportunity | null,
) {
  const relation = getActionStageRelation(actionId);
  if (!relation) {
    return null;
  }

  if (relation.completesPhaseIds.includes('pre_visit') || relation.revealsOwnerState) {
    caseItem.hasCompletedFirstVisit = true;
  }
  if (relation.touchesOwner) {
    caseItem.touchedOwnerToday = true;
    caseItem.lastOwnerTouchedDay = world.day;
  }

  const targetOpportunity = opportunity || findRelationOpportunity(world, caseItem.id, relation);
  if (targetOpportunity && Number.isFinite(relation.opportunityStageFloor)) {
    applyOpportunityStageFloor(world, targetOpportunity, relation.opportunityStageFloor || 0);
    setOpportunityTouchedTodayOnState(world, targetOpportunity, true, '阶段关系推进标记触达');
  }

  if (Number.isFinite(relation.caseStageFloor)) {
    syncCaseStageMirrorFromCaseProgressionOnState(caseItem, { legacyStageIndex: Math.max(caseItem.stageIndex, relation.caseStageFloor || 0) }, 6);
  }
  if (Number.isFinite(relation.caseOffersFloor)) {
    caseItem.offers = Math.max(caseItem.offers, relation.caseOffersFloor || 0);
  }

  return {
    relation,
    opportunity: targetOpportunity,
  };
}
