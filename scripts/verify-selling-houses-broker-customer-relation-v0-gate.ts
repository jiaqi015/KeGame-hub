// BrokerCustomerRelation v0 Gate
//
// Verifies:
// 1. BrokerCustomerRelation type exists and has required fields
// 2. Builder functions exist (buildBrokerCustomerRelationId, createBrokerCustomerRelation)
// 3. Adapter can generate relations from real createInitialState
// 4. Each relation has relationId
// 5. Each relation has source + evidenceRefs
// 6. Gate source has no soft-pass patterns

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const results: Array<{ check: string; pass: boolean; detail?: string }> = [];

function pass(check: string, detail?: string): void {
  results.push({ check, pass: true, detail });
  console.log(`  PASS: ${check}${detail ? ` — ${detail}` : ''}`);
}

function fail(check: string, detail?: string): void {
  results.push({ check, pass: false, detail });
  console.log(`  FAIL: ${check}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// Gate 1: BrokerCustomerRelation type exists with required fields
// ---------------------------------------------------------------------------

console.log('\n=== BrokerCustomerRelation Gate: 1. Type exists ===\n');

try {
  const mod = await import(
    '../src/selling-houses/core/world-state/customer/brokerCustomerRelation.js'
  );

  const requiredFields = [
    'relationId', 'brokerId', 'customerId', 'trust', 'familiarity', 'influence',
    'firstContactDay', 'lastInteractionDay', 'evidenceRefs', 'sourceRecordIds', 'source',
  ];

  // Build a test relation to verify fields exist
  const testRelation = mod.createBrokerCustomerRelation('b-1', 'c-1', 1);
  const missingFields = requiredFields.filter((f) => !(f in testRelation));

  if (missingFields.length > 0) {
    fail('type-fields', `missing: ${missingFields.join(', ')}`);
  } else {
    pass('type-fields', `all ${requiredFields.length} fields present`);
  }
} catch (err: any) {
  fail('type-fields', err.message);
}

// ---------------------------------------------------------------------------
// Gate 2: Builder functions exist
// ---------------------------------------------------------------------------

console.log('\n=== BrokerCustomerRelation Gate: 2. Builders exist ===\n');

try {
  const mod = await import(
    '../src/selling-houses/core/world-state/customer/brokerCustomerRelation.js'
  );

  const requiredExports = [
    'buildBrokerCustomerRelationId',
    'createBrokerCustomerRelation',
  ];

  const missing = requiredExports.filter((name) => typeof (mod as any)[name] !== 'function');
  if (missing.length > 0) {
    fail('builders-exist', `missing: ${missing.join(', ')}`);
  } else {
    pass('builders-exist', `all ${requiredExports.length} builders present`);
  }

  // Test buildBrokerCustomerRelationId
  const id = mod.buildBrokerCustomerRelationId('broker-1', 'customer-1');
  if (!id || !id.includes('broker-1') || !id.includes('customer-1')) {
    fail('relation-id-format', `unexpected id: "${id}"`);
  } else {
    pass('relation-id-format', `id = "${id}"`);
  }

  // Test createBrokerCustomerRelation
  const relation = mod.createBrokerCustomerRelation('broker-1', 'customer-1', 5, {
    trust: 60,
    familiarity: 40,
    influence: 50,
    source: 'canonical',
    evidenceRefs: ['evt-1'],
    sourceRecordIds: ['src-1'],
  });

  if (relation.relationId !== id) {
    fail('create-relation-id', `expected "${id}", got "${relation.relationId}"`);
  } else {
    pass('create-relation-id');
  }

  if (relation.source !== 'canonical') {
    fail('create-relation-source', `expected "canonical", got "${relation.source}"`);
  } else {
    pass('create-relation-source');
  }

  if (relation.trust !== 60) {
    fail('create-relation-trust', `expected 60, got ${relation.trust}`);
  } else {
    pass('create-relation-trust');
  }
} catch (err: any) {
  fail('builders-exist', err.message);
}

// ---------------------------------------------------------------------------
// Gate 3: Adapter exists and generates relations from real state
// ---------------------------------------------------------------------------

console.log('\n=== BrokerCustomerRelation Gate: 3. Adapter from real state ===\n');

try {
  const { createInitialState } = await import(
    '../src/selling-houses/application/gameState.js'
  );
  const { getScenarioSnapshotById } = await import(
    '../src/selling-houses/domain/scenarioCatalog.js'
  );
  const adapter = await import(
    '../src/selling-houses/domain/brokerCustomerRelationAdapter.js'
  );

  const snapshot = getScenarioSnapshotById('warmup-clean-handoff');
  if (!snapshot) {
    fail('adapter-real-state', 'warmup-clean-handoff scenario not found');
  } else {
    const state = createInitialState(snapshot, 42);

    // Check that runtimeBrokerCustomerRelations was populated during init
    const relations = state.runtimeBrokerCustomerRelations;
    if (!relations || relations.length === 0) {
      fail('adapter-init-populated', `runtimeBrokerCustomerRelations is ${relations ? 'empty' : 'undefined'}`);
    } else {
      pass('adapter-init-populated', `${relations.length} relations created`);
    }

    // Test buildBrokerCustomerRelationsFromGameState
    const fromGameState = adapter.buildBrokerCustomerRelationsFromGameState(state);
    if (!fromGameState || fromGameState.length === 0) {
      fail('adapter-from-gamestate', 'buildBrokerCustomerRelationsFromGameState returned empty');
    } else {
      pass('adapter-from-gamestate', `${fromGameState.length} relations from GameState`);
    }

    // Test buildLegacyBrokerCustomerRelationFromOpportunity (if opportunities exist)
    if (state.opportunities.length > 0) {
      const fromOpp = adapter.buildLegacyBrokerCustomerRelationFromOpportunity(
        state,
        state.opportunities[0],
      );
      if (!fromOpp) {
        fail('adapter-from-opportunity', 'returned null/undefined');
      } else {
        pass('adapter-from-opportunity', `relation for customer ${fromOpp.customerId}`);
      }
    } else {
      pass('adapter-from-opportunity', 'skipped — no opportunities in state');
    }
  }
} catch (err: any) {
  fail('adapter-real-state', err.message);
}

// ---------------------------------------------------------------------------
// Gate 4: Relations have relationId
// ---------------------------------------------------------------------------

console.log('\n=== BrokerCustomerRelation Gate: 4. relationId present ===\n');

try {
  const { createInitialState } = await import(
    '../src/selling-houses/application/gameState.js'
  );
  const { getScenarioSnapshotById } = await import(
    '../src/selling-houses/domain/scenarioCatalog.js'
  );

  const snapshot = getScenarioSnapshotById('warmup-clean-handoff')!;
  const state = createInitialState(snapshot, 42);
  const relations = state.runtimeBrokerCustomerRelations ?? [];

  const missingId = relations.filter((r) => !r.relationId);
  if (missingId.length > 0) {
    fail('relation-id-present', `${missingId.length} relations missing relationId`);
  } else {
    pass('relation-id-present', `all ${relations.length} have relationId`);
  }
} catch (err: any) {
  fail('relation-id-present', err.message);
}

// ---------------------------------------------------------------------------
// Gate 5: Relations have source + evidenceRefs
// ---------------------------------------------------------------------------

console.log('\n=== BrokerCustomerRelation Gate: 5. source + evidence present ===\n');

try {
  const { createInitialState } = await import(
    '../src/selling-houses/application/gameState.js'
  );
  const { getScenarioSnapshotById } = await import(
    '../src/selling-houses/domain/scenarioCatalog.js'
  );

  const snapshot = getScenarioSnapshotById('warmup-clean-handoff')!;
  const state = createInitialState(snapshot, 42);
  const relations = state.runtimeBrokerCustomerRelations ?? [];

  const missingSource = relations.filter((r) => !r.source);
  if (missingSource.length > 0) {
    fail('source-present', `${missingSource.length} relations missing source`);
  } else {
    pass('source-present', `all ${relations.length} have source`);
  }

  const missingEvidence = relations.filter((r) => !r.evidenceRefs);
  if (missingEvidence.length > 0) {
    fail('evidence-present', `${missingEvidence.length} relations missing evidenceRefs`);
  } else {
    pass('evidence-present', `all ${relations.length} have evidenceRefs`);
  }

  // All legacy projections should have source = 'legacy_compatibility_projection'
  const wrongSource = relations.filter(
    (r) => r.source !== 'legacy_compatibility_projection' && r.source !== 'canonical',
  );
  if (wrongSource.length > 0) {
    fail('source-valid', `${wrongSource.length} have invalid source`);
  } else {
    pass('source-valid', 'all sources are valid');
  }
} catch (err: any) {
  fail('source-evidence', err.message);
}

// ---------------------------------------------------------------------------
// Gate 6: BCR flows into dealClosing evaluation (real consumption)
// ---------------------------------------------------------------------------

console.log('\n=== BrokerCustomerRelation Gate: 6. Consumption in evaluation ===\n');

try {
  const { createInitialState } = await import(
    '../src/selling-houses/application/gameState.js'
  );
  const { getScenarioSnapshotById } = await import(
    '../src/selling-houses/domain/scenarioCatalog.js'
  );
  const { buildDealClosingEvaluation } = await import(
    '../src/selling-houses/domain/dealClosing.js'
  );
  const { createBrokerCustomerRelation } = await import(
    '../src/selling-houses/core/world-state/customer/brokerCustomerRelation.js'
  );

  const snapshot = getScenarioSnapshotById('warmup-clean-handoff');
  if (!snapshot) {
    fail('bcr-consumption', 'warmup-clean-handoff scenario not found');
  } else {
    const state = createInitialState(snapshot, 42);
    const brokerId = state.bigWorldRuntime?.playerBrokerAcnId ?? 'player-broker';

    if (!state.runtimeBrokerCustomerRelations || state.runtimeBrokerCustomerRelations.length === 0) {
      fail('bcr-consumption-setup', 'no BCR to test consumption');
    } else {
      // 6a: Populate a customer state with an active case, then verify evaluation reads BCR
      const targetRelation = state.runtimeBrokerCustomerRelations[0];
      const customerId = targetRelation.customerId;

      // Ensure a customer state exists for this customer with advisorTrust
      const cs = state.customerStates.find((c) => c.customerId === customerId);
      if (!cs) {
        fail('bcr-consumption-setup', `no customerState for ${customerId}`);
      } else {
        // Inject a synthetic opportunity for this customer bound to first active case
        const activeCase = state.cases.find((c) => c.status === 'active');
        if (!activeCase) {
          fail('bcr-consumption-setup', 'no active case in state');
        } else {
          const testOpp: any = {
            id: `test-opp-${customerId}`,
            caseId: activeCase.id,
            customerId,
            customerName: '测试客户',
            profile: 'test',
            channelId: 'ch-1',
            channelName: '线上',
            fit: 60,
            intent: 65,
            confidence: 55,
            stageIndex: 3,
            stageLabel: '深度面谈',
            status: 'active' as const,
            lifecycleStatus: 'active' as const,
            leadSource: 'direct' as const,
            visibility: 'revealed' as const,
            createdDay: state.day,
            daysLeft: 5,
            touchedToday: false,
            budgetMax: activeCase.askPrice + 20,
            priceSensitivity: 50,
            stagnationTicks: 0,
            history: [],
          };

          // 6a-1: Evaluation with current BCR trust
          const eval1 = buildDealClosingEvaluation(state, activeCase, testOpp, activeCase.askPrice, 'balanced');
          if (!eval1.evidenceChain.brokerCustomerTrust || eval1.evidenceChain.brokerCustomerTrust < 0) {
            fail('bcr-consumption-trust-in-evidence', `brokerCustomerTrust is ${eval1.evidenceChain.brokerCustomerTrust}`);
          } else {
            pass('bcr-consumption-trust-in-evidence', `trust=${eval1.evidenceChain.brokerCustomerTrust}`);
          }

          const expectedSource =
            targetRelation.source === 'canonical' ? 'relation' : 'legacy-customer-runtime-fallback';
          if (eval1.evidenceChain.brokerCustomerRelationSource !== expectedSource) {
            fail('bcr-consumption-source-in-evidence', `expected ${expectedSource}, got ${eval1.evidenceChain.brokerCustomerRelationSource}`);
          } else {
            pass('bcr-consumption-source-in-evidence', `source=${eval1.evidenceChain.brokerCustomerRelationSource}`);
          }

          if (!eval1.evidenceChain.brokerCustomerRelationId) {
            fail('bcr-consumption-relation-id', 'brokerCustomerRelationId is empty');
          } else {
            pass('bcr-consumption-relation-id', `relationId=${eval1.evidenceChain.brokerCustomerRelationId}`);
          }

          // 6a-2: Verify sourceTrace carries customerTrustSource
          if (!eval1.sourceTrace.customerTrustSource) {
            fail('bcr-consumption-source-trace', 'sourceTrace.customerTrustSource is missing');
          } else {
            pass('bcr-consumption-source-trace', `customerTrustSource=${eval1.sourceTrace.customerTrustSource}`);
          }

          // 6a-3: Verify supportingReasons includes customer-side evidence
          const hasCustomerEvidence = eval1.supportingReasons.some(
            (r) => r.includes('客户对你信任') || r.includes('愿意继续谈'),
          );
          if (!hasCustomerEvidence) {
            fail('bcr-consumption-supporting-reasons', 'supportingReasons missing customer-side evidence');
          } else {
            pass('bcr-consumption-supporting-reasons', 'customer-side evidence present');
          }

          // 6b: Modify BCR trust and verify evaluation changes
          const bcrIndex = state.runtimeBrokerCustomerRelations!.findIndex(
            (r) => r.brokerId === brokerId && r.customerId === customerId,
          );
          if (bcrIndex < 0) {
            fail('bcr-consumption-trust-change', 'BCR not found for modification test');
          } else {
            const origTrust = state.runtimeBrokerCustomerRelations![bcrIndex].trust;
            const newTrust = Math.min(100, origTrust + 20);

            state.runtimeBrokerCustomerRelations = state.runtimeBrokerCustomerRelations!.map((r, i) =>
              i === bcrIndex ? { ...r, trust: newTrust } : r,
            );
            const eval2 = buildDealClosingEvaluation(state, activeCase, testOpp, activeCase.askPrice, 'balanced');

            if (eval2.evidenceChain.brokerCustomerTrust !== newTrust) {
              fail('bcr-consumption-trust-change', `expected brokerCustomerTrust=${newTrust}, got ${eval2.evidenceChain.brokerCustomerTrust}`);
            } else {
              pass('bcr-consumption-trust-change', `trust ${origTrust}→${newTrust} reflected in evaluation`);
            }
          }

          // 6c: Fallback when no BCR — remove all BCR and verify evaluation doesn't crash
          const stateWithoutBcr = { ...state, runtimeBrokerCustomerRelations: undefined };
          const eval3 = buildDealClosingEvaluation(stateWithoutBcr as any, activeCase, testOpp, activeCase.askPrice, 'balanced');
          if (eval3.evidenceChain.brokerCustomerRelationSource !== 'legacy-customer-runtime-fallback') {
            fail('bcr-consumption-fallback-source', `expected legacy-customer-runtime-fallback, got ${eval3.evidenceChain.brokerCustomerRelationSource}`);
          } else {
            pass('bcr-consumption-fallback-source', 'fallback source is correct');
          }
          if (!eval3.evidenceChain.brokerCustomerRelationId || !eval3.evidenceChain.brokerCustomerRelationId.includes('fallback')) {
            fail('bcr-consumption-fallback-id', `expected fallback relationId, got ${eval3.evidenceChain.brokerCustomerRelationId}`);
          } else {
            pass('bcr-consumption-fallback-id', 'fallback relationId generated');
          }
        }
      }
    }
  }
} catch (err: any) {
  fail('bcr-consumption', err.message);
}

// ---------------------------------------------------------------------------
// Gate 7: BCR does not directly write ContractFact
// ---------------------------------------------------------------------------

console.log('\n=== BrokerCustomerRelation Gate: 7. BCR does not write ContractFact ===\n');

try {
   const dealClosingSrc = readFileSync(
     resolve(import.meta.dirname ?? '.', '../src/selling-houses/domain/dealClosing.ts'),
     'utf-8',
   );

  const finalizeFn = dealClosingSrc.slice(
    dealClosingSrc.indexOf('function finalizeClosedDeal('),
    dealClosingSrc.indexOf('function resolveFailedPendingClosing('),
  );
  const syncFn = dealClosingSrc.slice(
    dealClosingSrc.indexOf('function syncLegacyCaseDealMirrorsFromContractFact('),
    dealClosingSrc.indexOf('function resolveNegotiationStrategy('),
  );

  const bcrRefInFinalize = finalizeFn.includes('runtimeBrokerCustomerRelations');
  const bcrRefInSync = syncFn.includes('runtimeBrokerCustomerRelations');

  if (bcrRefInFinalize) {
    fail('bcr-no-contract-write', 'finalizeClosedDeal references runtimeBrokerCustomerRelations');
  } else if (bcrRefInSync) {
    fail('bcr-no-contract-write', 'syncLegacyCaseDealMirrorsFromContractFact references runtimeBrokerCustomerRelations');
  } else {
    pass('bcr-no-contract-write', 'BCR does not directly write ContractFact or legacy mirrors');
  }

  const createContractFn = dealClosingSrc.slice(
    dealClosingSrc.indexOf('createContractFactOnState('),
    dealClosingSrc.indexOf('createContractFactOnState(') + 500,
  );

  if (typeof dealClosingSrc.indexOf('createContractFactOnState(') === 'number') {
    const bcrNearContract = dealClosingSrc.slice(
      Math.max(0, dealClosingSrc.indexOf('createContractFactOnState(') - 100),
      dealClosingSrc.indexOf('createContractFactOnState(') + 600,
    ).includes('runtimeBrokerCustomerRelations');
    if (bcrNearContract) {
      fail('bcr-no-contract-write', 'ContractFact creation area references runtimeBrokerCustomerRelations');
    } else {
      pass('bcr-no-contract-write-near-create', 'ContractFact creation does not reference BCR');
    }
  } else {
    pass('bcr-no-contract-write-near-create', 'ContractFact creation scan skipped');
  }
} catch (err: any) {
  fail('bcr-no-contract-write', err.message);
}

// ---------------------------------------------------------------------------
// Gate 8: Self-audit — no soft-pass patterns
// ---------------------------------------------------------------------------

console.log('\n=== BrokerCustomerRelation Gate: 8. Self-audit ===\n');

const gateSrc = readFileSync(
  resolve(import.meta.dirname ?? '.', 'verify-selling-houses-broker-customer-relation-v0-gate.ts'),
  'utf-8',
);

const auditMarker = 'Gate 6: Self-audit';
const markerIdx = gateSrc.indexOf(auditMarker);
const businessLogicSrc = markerIdx > 0 ? gateSrc.slice(0, markerIdx) : gateSrc;

const stripped = businessLogicSrc
  .replace(/\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/'[^']*'/g, '""')
  .replace(/"[^"]*"/g, '""')
  .replace(/`[^`]*`/g, '``');

const hasCheckTrue = /check\s*\(\s*true\s*[,\)]/.test(stripped);
const hasAssertTrue = /assert\s*\(\s*true\s*\)/.test(stripped);
const hasOrTrue = stripped.includes('|| true');

function findPatternLines(source: string, pattern: RegExp): string {
  const lines = source.split('\n');
  const hits: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) hits.push(`L${i + 1}`);
  }
  return hits.length > 0 ? ` at ${hits.join(', ')}` : '';
}

if (hasCheckTrue) {
  const loc = findPatternLines(stripped, /check\s*\(\s*true\s*[,\)]/);
  fail('no-check-true', `gate source contains check(true)${loc}`);
} else {
  pass('no-check-true');
}

if (hasAssertTrue) {
  const loc = findPatternLines(stripped, /assert\s*\(\s*true\s*\)/);
  fail('no-assert-true', `gate source contains assert(true)${loc}`);
} else {
  pass('no-assert-true');
}

if (hasOrTrue) {
  const loc = findPatternLines(stripped, /\|\|\s*true/);
  fail('no-or-true', `gate source contains || true${loc}`);
} else {
  pass('no-or-true');
}

const hasWarnOnly = /console\.log\s*\(\s*['"`]\s*WARN/.test(businessLogicSrc);
if (hasWarnOnly) {
  const loc = findPatternLines(businessLogicSrc, /console\.log\s*\(\s*['"`]\s*WARN/);
  fail('no-warn-soft-pass', `gate source has WARN-only pattern${loc}`);
} else {
  pass('no-warn-soft-pass');
}

// ---------------------------------------------------------------------------
// Final verdict
// ---------------------------------------------------------------------------

console.log('\n=== BrokerCustomerRelation Gate: Summary ===\n');

const passCount = results.filter((r) => r.pass).length;
const failCount = results.filter((r) => !r.pass).length;

console.log(`  Total checks: ${results.length}`);
console.log(`  Passed: ${passCount}`);
console.log(`  Failed: ${failCount}`);

if (failCount > 0) {
  console.log('\n  FAILED checks:');
  for (const r of results.filter((r) => !r.pass)) {
    console.log(`    - ${r.check}: ${r.detail ?? 'failed'}`);
  }
  console.log('\n  GATE FAILED');
  process.exit(1);
}

console.log('\n  GATE PASSED — BrokerCustomerRelation v0 invariants hold');
process.exit(0);
