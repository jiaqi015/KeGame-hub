/**
 * contractFactFixtures.ts — fixture-only helpers for creating contract facts
 * without PriceConsensusProof and marking cases sold without ContractFact.
 *
 * *** FORBIDDEN IN PRODUCTION RUNTIME ***
 * These helpers exist ONLY for test/script/fixture construction.
 * Production code must use:
 *   - createContractFactFromPriceConsensusOnState (domain state path)
 *   - createContractFactFromProof (core pure path)
 *   - markCaseSoldFromContract (sold mirror path)
 *
 * Importing this file from production src/selling-houses/** (outside /testing/)
 * will cause the R28 gate to fail.
 */

export {
  createContractFactForFixtureOnlyOnState,
} from '../domain/consensusFormationHelper.js';

export {
  createContractFactForFixtureOnlyState,
} from '../core/world-state/consensus/writeSource.js';

export {
  markCaseSoldForFixtureOnly,
} from '../domain/caseOutcome.js';
