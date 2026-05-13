/**
 * ActionReplay — deterministic replay of action commands.
 *
 * Architecture position:
 *   ActionCommand → ActionReceipt (original execution)
 *     → ActionCommand → ActionReceipt (replay execution)
 *       → ActionReplayReceipt (comparison)
 *
 * Replay proves:
 *   - Same command + same seed + same state → same source records
 *   - Same source records → same causal events
 *   - Same causal events → same belief refs
 *   - The chain is deterministic and replayable
 *
 * Hard constraints:
 *   - No Date.now / Math.random / LLM provider
 *   - Replay compares: commandReplayKey, sourceRecordIds, causalEventIds, beliefRefs
 *   - Mismatches are recorded, not thrown (replay is analysis, not execution)
 *   - Replay does NOT mutate any state
 *
 * Mother model alignment:
 *   - Section 13: Causal Transmission (deterministic skeleton)
 *   - Section 19: Replayability
 *     "Same seed + same events → identical records"
 */

import type {
  ActionCommand,
  ActionReceipt,
  ActionReplayReceipt,
  ActorKnowledgeSnapshot,
} from '../actorKnowledgeTypes.js';

import { buildActionCommand, buildActionReceipt } from './actionCommandReceipt.js';

// ════════════════════════════════════════════════════════════════════════════
// replayActionCommand — deterministic replay
// ════════════════════════════════════════════════════════════════════════════

/**
 * Replay an action command and compare against the original receipt.
 *
 * The replay:
 *   1. Rebuilds the ActionCommand from the same inputs
 *   2. Re-executes it through buildActionReceipt
 *   3. Compares source record IDs, causal event IDs, and belief refs
 *
 * Key property: replay is READ-ONLY. It does not modify any state.
 *
 * @param command - the original action command
 * @param knowledge - the actor's knowledge snapshot at time of command
 * @param originalReceipt - the original action receipt
 * @param day - simulation day
 * @param seed - same seed as original execution
 * @returns ActionReplayReceipt with comparison results
 */
export function replayActionCommand(
  command: ActionCommand,
  knowledge: ActorKnowledgeSnapshot,
  originalReceipt: ActionReceipt,
  day: number,
  seed: number,
): ActionReplayReceipt {
  // Step 1: Rebuild the command (should produce identical command)
  const replayedCommand = buildActionCommand(
    {
      command: {
        commandId: command.commandType === 'owner_interview' ? 'cmd-owner-visit'
          : command.commandType === 'defend_listing' ? 'cmd-defend-listing'
            : 'cmd-customer-acquisition',
        name: command.commandType,
        category: 'relationship',
        targetDomains: [],
        pressureThreshold: 0,
        allowedRoles: [command.actorRole],
      },
      reasoning: 'replay',
      confidence: 1,
      pressureSignalIds: [],
      beliefSourceIds: command.inputBeliefRefs,
      sourceRecordIds: command.inputSourceRefs,
    },
    knowledge,
    day,
    seed,
  );

  // Step 2: Re-execute the command
  const replayedReceipt = buildActionReceipt(replayedCommand, seed);

  // Step 3: Compare all evidence chains
  const sourceRecordIdsMatched = arraysEqual(
    originalReceipt.generatedSourceRecordIds,
    replayedReceipt.generatedSourceRecordIds,
  );
  const causalEventIdsMatched = arraysEqual(
    originalReceipt.generatedCausalEventIds,
    replayedReceipt.generatedCausalEventIds,
  );
  const beliefRefsMatched = arraysEqual(
    originalReceipt.affectedActorKnowledgeRefs.map((r) => `${r.actorId}:${r.beliefDomain}`),
    replayedReceipt.affectedActorKnowledgeRefs.map((r) => `${r.actorId}:${r.beliefDomain}`),
  );

  // Collect mismatches
  const mismatches: string[] = [];
  if (!sourceRecordIdsMatched) {
    mismatches.push(`sourceRecordIds: original=${originalReceipt.generatedSourceRecordIds.length}, replayed=${replayedReceipt.generatedSourceRecordIds.length}`);
  }
  if (!causalEventIdsMatched) {
    mismatches.push(`causalEventIds: original=${originalReceipt.generatedCausalEventIds.length}, replayed=${replayedReceipt.generatedCausalEventIds.length}`);
  }
  if (!beliefRefsMatched) {
    mismatches.push(`beliefRefs: original=${originalReceipt.affectedActorKnowledgeRefs.length}, replayed=${replayedReceipt.affectedActorKnowledgeRefs.length}`);
  }

  const matched = sourceRecordIdsMatched && causalEventIdsMatched && beliefRefsMatched;

  return {
    matched,
    commandReplayKey: command.replayKey,
    originalSourceRecordIds: originalReceipt.generatedSourceRecordIds,
    replayedSourceRecordIds: replayedReceipt.generatedSourceRecordIds,
    originalCausalEventIds: originalReceipt.generatedCausalEventIds,
    replayedCausalEventIds: replayedReceipt.generatedCausalEventIds,
    originalBeliefRefs: originalReceipt.affectedActorKnowledgeRefs.map((r) => `${r.actorId}:${r.beliefDomain}`),
    replayedBeliefRefs: replayedReceipt.affectedActorKnowledgeRefs.map((r) => `${r.actorId}:${r.beliefDomain}`),
    sourceRecordIdsMatched,
    causalEventIdsMatched,
    beliefRefsMatched,
    mismatches,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// verifyActionChainDeterminism — full chain replay verification
// ════════════════════════════════════════════════════════════════════════════

/**
 * Verify that the full action chain is deterministic.
 *
 * Rebuilds the command from the same inputs, re-executes it,
 * and verifies that the entire chain (command → receipt → source → causal)
 * produces identical results.
 *
 * This is the "replay" verification that the gate checks.
 *
 * @param command - original command
 * @param knowledge - knowledge snapshot
 * @param originalReceipt - original receipt
 * @param day - day
 * @param seed - seed
 * @returns true if chain is deterministic
 */
export function verifyActionChainDeterminism(
  command: ActionCommand,
  knowledge: ActorKnowledgeSnapshot,
  originalReceipt: ActionReceipt,
  day: number,
  seed: number,
): boolean {
  const replayResult = replayActionCommand(command, knowledge, originalReceipt, day, seed);
  return replayResult.matched;
}

// ════════════════════════════════════════════════════════════════════════════
// Utility: array equality
// ════════════════════════════════════════════════════════════════════════════

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
