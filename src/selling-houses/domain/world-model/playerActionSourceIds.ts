/**
 * Deterministic source ID builder for player_action_receipt records.
 *
 * R14 constitutional alignment:
 *   Both actionResolvers.ts (pending tick path) and actionReceiptWiring.ts
 *   (immediate receipt path) must produce the same source identity for the
 *   same action on the same seed/day/case. This eliminates the dual-track
 *   ambiguity and enables a unified receipt trace.
 *
 * Deterministic: same inputs → same sourceId + replayKey.
 */

export interface PlayerActionSourceIds {
  readonly sourceId: string;
  readonly replayKey: string;
}

export function buildPlayerActionSourceIds(
  day: number,
  actionId: string,
  caseId: string,
  runSeed: number,
): PlayerActionSourceIds {
  return {
    sourceId: `isr-player_action_receipt-${actionId}-${caseId}-${day}-${runSeed}`,
    replayKey: `rk-player_action_receipt-${runSeed}-${day}-${actionId}-${caseId}`,
  };
}

export function buildBlockedPlayerActionSourceIds(
  day: number,
  actionId: string,
  caseId: string,
  runSeed: number,
): PlayerActionSourceIds {
  return {
    sourceId: `isr-player_action_receipt-${actionId}-${caseId}-${day}-${runSeed}`,
    replayKey: `rk-player_action_receipt_blocked-${runSeed}-${day}-${actionId}-${caseId}`,
  };
}
