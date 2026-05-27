/**
 * R42 Constitutional Write Boundary Root Cause Gate
 *
 * This is the META-GATE for write boundaries. It scans ALL field assignment
 * writes in the codebase and classifies them according to constitutional rules.
 *
 * Constitutional principle:
 * SourceRecord -> CausalEvent -> ActorKnowledge/Belief/Pressure -> Command/Receipt
 * -> PriceTrajectory/Consensus -> ContractFact -> Projection
 *
 * Gate fails if any truth field is written outside canonical write boundary.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';

type WriteCategory =
  | 'blocked_truth_write'
  | 'canonical_store_write'
  | 'legacy_mirror_sync_allowed'
  | 'separate_domain_status_or_actor_state'
  | 'object_initialization_or_hydration'
  | 'test_or_fixture'
  | 'unknown';

interface WriteCandidate {
  file: string;
  line: number;
  snippet: string;
  field: string;
  category: WriteCategory;
  allowed: boolean;
  reason: string;
}

interface AllowlistEntry {
  file: string;
  snippet: string;
  field: string;
  category: 'canonical_store_write' | 'legacy_mirror_sync_allowed' | 'separate_domain_status_or_actor_state' | 'object_initialization_or_hydration' | 'test_or_fixture';
  canonicalSource: string;
  reason: string;
}

let passed = 0;
let failed = 0;
const errors: string[] = [];
const candidates: WriteCandidate[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    errors.push(message);
    console.error(`  [FAIL] ${message}`);
  }
}

function readFileSafe(path: string): string | null {
  try {
    return readFileSync(resolve(path), 'utf-8');
  } catch {
    return null;
  }
}

// Recursively find all .ts/.tsx files in a directory
function findTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(resolve(dir));
    for (const entry of entries) {
      const fullPath = resolve(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (entry === '__tests__' || entry === 'node_modules' || entry === '.git') continue;
        files.push(...findTypeScriptFiles(fullPath));
      } else if (stat.isFile() && (extname(entry) === '.ts' || extname(entry) === '.tsx')) {
        if (entry.includes('.test.') || entry.includes('.spec.')) continue;
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist, skip
  }
  return files;
}

// ════════════════════════════════════════════════════════════════════════════
// EXPLICIT ALLOWLIST - Each entry must have file + snippet + field + reason
// ════════════════════════════════════════════════════════════════════════════

const WRITE_ALLOWLIST: AllowlistEntry[] = [
  // Terminal fact mirror sync - ONLY inside named helper
  {
    file: 'src/selling-houses/domain/dealClosing.ts',
    snippet: "asWritableCase(caseItem).status = 'sold'",
    field: 'status',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'ContractFactState',
    reason: 'terminal status mirror sync inside syncLegacyCaseDealMirrorsFromContractFact',
  },
  {
    file: 'src/selling-houses/domain/dealClosing.ts',
    snippet: 'asWritableCase(caseItem).soldPrice = contract.dealPrice',
    field: 'soldPrice',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'ContractFactState',
    reason: 'sold price mirror sync inside syncLegacyCaseDealMirrorsFromContractFact',
  },
  {
    file: 'src/selling-houses/domain/dealClosing.ts',
    snippet: "caseItem.stageLabel = '已成交'",
    field: 'stageLabel',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'ContractFactState',
    reason: 'terminal stage label mirror sync inside syncLegacyCaseDealMirrorsFromContractFact',
  },
  {
    file: 'src/selling-houses/domain/dealClosing.ts',
    snippet: 'asWritableGameState(state).closedDeals.unshift(closedDeal)',
    field: 'closedDeals',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'ContractFactState',
    reason: 'closed deals mirror prepend inside prependClosedDealMirrorFromContractFact',
  },
  {
    file: 'src/selling-houses/domain/caseOutcome.ts',
    snippet: 'caseItem.stageLabel = input.stageLabel',
    field: 'stageLabel',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'OwnerCaseReadinessState',
    reason: 'stage label mirror sync inside markCaseSoldFromContract',
  },
  {
    file: 'src/selling-houses/domain/caseOutcome.ts',
    snippet: 'asWritableCase(caseItem).soldPrice = contractFact.dealPrice',
    field: 'soldPrice',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'ContractFactState',
    reason: 'sold price mirror sync inside markCaseSoldFromContract',
  },
  {
    file: 'src/selling-houses/domain/caseOutcome.ts',
    snippet: 'asWritableCase(caseItem).soldPrice = soldPrice',
    field: 'soldPrice',
    category: 'test_or_fixture',
    canonicalSource: 'TestFixture',
    reason: 'sold price write inside markCaseSoldForFixtureOnly (test-only)',
  },
  {
    file: 'src/selling-houses/domain/caseOutcome.ts',
    snippet: 'asWritableCase(caseItem).status = input.kind',
    field: 'status',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'CaseTerminalOutcomeState',
    reason: 'status mirror sync inside syncLegacyCaseOutcomeMirrorsFromTerminalFact',
  },

  // Trust/patience/urgency mirror sync - ONLY inside named helper
  {
    file: 'src/selling-houses/domain/trustWriteHelper.ts',
    snippet: 'asWritableCase(caseItem).trust = deriveCaseTrustMirror(canonicalState)',
    field: 'trust',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'BrokerOwnerRelationTrustState',
    reason: 'trust mirror sync inside syncLegacyCaseTrustMirror',
  },
  {
    file: 'src/selling-houses/domain/ownerCaseReadinessWriteHelper.ts',
    snippet: 'asWritableCase(caseItem).patience = deriveCasePatienceMirror(canonicalState)',
    field: 'patience',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'OwnerCaseReadinessState',
    reason: 'patience mirror sync inside syncLegacyCaseReadinessMirrors',
  },
  {
    file: 'src/selling-houses/domain/ownerCaseReadinessWriteHelper.ts',
    snippet: 'asWritableCase(caseItem).urgency = deriveCaseUrgencyMirror(canonicalState)',
    field: 'urgency',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'OwnerCaseReadinessState',
    reason: 'urgency mirror sync inside syncLegacyCaseReadinessMirrors',
  },

  // Opportunity stage/status mirror sync - ONLY inside named helper
  {
    file: 'src/selling-houses/domain/opportunitySplitHelper.ts',
    snippet: 'asWritableOpportunity(legacyOpp).stageIndex = mirror.stageIndex',
    field: 'stageIndex',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'BrokeredOpportunityState',
    reason: 'opportunity stage mirror sync inside syncOpportunityStageMirrorFromTrajectoryOnState',
  },
  {
    file: 'src/selling-houses/domain/opportunitySplitHelper.ts',
    snippet: 'legacyOpp.stageLabel = mirror.stageLabel',
    field: 'stageLabel',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'BrokeredOpportunityState',
    reason: 'opportunity stage label mirror sync inside syncOpportunityStageMirrorFromTrajectoryOnState',
  },
  {
    file: 'src/selling-houses/domain/opportunitySplitHelper.ts',
    snippet: "legacyOpp.status = mirror.status as Opportunity['status']",
    field: 'status',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'BrokeredOpportunityState',
    reason: 'opportunity status mirror sync inside ensureBrokeredOpportunityState',
  },
  {
    file: 'src/selling-houses/domain/opportunitySplitHelper.ts',
    snippet: 'opportunity.status = value',
    field: 'status',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'OpportunityLifecycle',
    reason: 'deprecated but explicitly marked opportunity status write in deprecatedUnsafeLegacyMirrorOnly_setOpportunityStatus',
  },
  {
    file: 'src/selling-houses/domain/opportunitySplitHelper.ts',
    snippet: 'asWritableOpportunity(opportunity).stageIndex = clamp(newStageIndex, clampMin, clampMax)',
    field: 'stageIndex',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'PriceTrajectory',
    reason: 'opportunity stage progression inside setOpportunityStageOnState',
  },
  {
    file: 'src/selling-houses/domain/opportunitySplitHelper.ts',
    snippet: "opportunity.stageLabel = OPPORTUNITY_STAGES[opportunity.stageIndex]",
    field: 'stageLabel',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'PriceTrajectory',
    reason: 'opportunity stage label derivation inside setOpportunityStageOnState',
  },
  {
    file: 'src/selling-houses/domain/opportunitySplitHelper.ts',
    snippet: 'caseItem.stageIndex = progression.legacyStageIndex',
    field: 'stageIndex',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'OpportunityLifecycle',
    reason: 'case stage mirror sync inside syncCaseStageMirrorFromOpportunity',
  },
  {
    file: 'src/selling-houses/domain/opportunitySplitHelper.ts',
    snippet: 'caseItem.stageIndex = Math.max(Math.min(caseItem.stageIndex, maxStage), progression.legacyStageIndex)',
    field: 'stageIndex',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'OpportunityLifecycle',
    reason: 'case stage mirror clamp inside syncCaseStageMirrorFromOpportunity',
  },

  // Customer runtime stage index - separate domain
  {
    file: 'src/selling-houses/domain/dealClosing.ts',
    snippet: 'runtime.stageIndex = convertedStageIndex',
    field: 'stageIndex',
    category: 'separate_domain_status_or_actor_state',
    canonicalSource: 'CustomerJourneyRuntimeState',
    reason: 'customer stage conversion mirror inside syncCustomerJourneyStageMirrorFromDealClose',
  },
  {
    file: 'src/selling-houses/domain/opportunitySplitHelper.ts',
    snippet: 'runtime.stageIndex = synced',
    field: 'stageIndex',
    category: 'separate_domain_status_or_actor_state',
    canonicalSource: 'CustomerJourneyRuntimeState',
    reason: 'customer stage sync inside syncCustomerRuntimeStageMirrorFromOpportunityOnState',
  },

  // Customer profile urgency - separate domain
  {
    file: 'src/selling-houses/domain/engine/marketEngine.ts',
    snippet: 'customer.urgency = clamp(',
    field: 'urgency',
    category: 'separate_domain_status_or_actor_state',
    canonicalSource: 'CustomerProfileState',
    reason: 'customer profile urgency in market engine (separate domain)',
  },
  {
    file: 'src/selling-houses/domain/world-model/bigWorldBootstrap.ts',
    snippet: 'customer.urgency = Math.min(100, customer.urgency + seededInt(',
    field: 'urgency',
    category: 'separate_domain_status_or_actor_state',
    canonicalSource: 'CustomerProfileState',
    reason: 'customer profile urgency initialization in world bootstrap (separate domain)',
  },
  {
    file: 'src/selling-houses/domain/world-model/bigWorldBootstrap.ts',
    snippet: 'customer.urgency = Math.max(0, customer.urgency - seededInt(',
    field: 'urgency',
    category: 'separate_domain_status_or_actor_state',
    canonicalSource: 'CustomerProfileState',
    reason: 'customer profile urgency initialization in world bootstrap (separate domain)',
  },

  // Rival listing status - separate domain
  {
    file: 'src/selling-houses/domain/rivals/rivalListingEngine.ts',
    snippet: "existingListing.status = 'sold'",
    field: 'status',
    category: 'separate_domain_status_or_actor_state',
    canonicalSource: 'RivalListingState',
    reason: 'rival listing status in rival listing engine (separate domain)',
  },
  {
    file: 'src/selling-houses/domain/rivals/rivalListingEngine.ts',
    snippet: "listing.status = claimResult.claimed ? 'sold' : 'withdrawn'",
    field: 'status',
    category: 'separate_domain_status_or_actor_state',
    canonicalSource: 'RivalListingState',
    reason: 'rival listing status claim in rival listing engine (separate domain)',
  },
  {
    file: 'src/selling-houses/domain/rivals/rivalListingEngine.ts',
    snippet: "listing.status = 'sold'",
    field: 'status',
    category: 'separate_domain_status_or_actor_state',
    canonicalSource: 'RivalListingState',
    reason: 'rival listing status sold in rival listing engine (separate domain)',
  },

  // Customer state status - separate domain
  {
    file: 'src/selling-houses/domain/dealClosing.ts',
    snippet: "customerState.status = 'converted'",
    field: 'status',
    category: 'separate_domain_status_or_actor_state',
    canonicalSource: 'CustomerState',
    reason: 'customer state status in deal closing (separate domain)',
  },
  {
    file: 'src/selling-houses/domain/dealClosing.ts',
    snippet: "customerState.status = customerState.status === 'lost' ? 'lost' : 'idle'",
    field: 'status',
    category: 'separate_domain_status_or_actor_state',
    canonicalSource: 'CustomerState',
    reason: 'customer state status fallback in deal closing (separate domain)',
  },

  // Product run status - separate domain
  {
    file: 'src/selling-houses/domain/productRuns.ts',
    snippet: "run.status = 'completed'",
    field: 'status',
    category: 'separate_domain_status_or_actor_state',
    canonicalSource: 'ProductRunState',
    reason: 'product run status in product runs (separate domain)',
  },

  // Action transaction status - separate domain
  {
    file: 'src/selling-houses/domain/engine/actionTransaction.ts',
    snippet: "transaction.status = 'committed'",
    field: 'status',
    category: 'separate_domain_status_or_actor_state',
    canonicalSource: 'ActionTransactionState',
    reason: 'action transaction status in transaction manager (separate domain)',
  },
  {
    file: 'src/selling-houses/domain/engine/actionTransaction.ts',
    snippet: "transaction.status = 'rolled_back'",
    field: 'status',
    category: 'separate_domain_status_or_actor_state',
    canonicalSource: 'ActionTransactionState',
    reason: 'action transaction rollback status (separate domain)',
  },

  // Today plan item status - separate domain
  {
    file: 'src/selling-houses/application/todayPlan.ts',
    snippet: "item.status = 'completed'",
    field: 'status',
    category: 'separate_domain_status_or_actor_state',
    canonicalSource: 'TodayPlanItemState',
    reason: 'today plan item completion (separate domain)',
  },

  // Rival listing bootstrap status - separate domain
  {
    file: 'src/selling-houses/domain/world-model/bigWorldBootstrap.ts',
    snippet: "(listing as any).status = 'withdrawn'",
    field: 'status',
    category: 'separate_domain_status_or_actor_state',
    canonicalSource: 'RivalListingState',
    reason: 'rival listing status in world bootstrap (separate domain)',
  },

  // Runtime state stage label derivation - display-only
  {
    file: 'src/selling-houses/domain/runtimeState.ts',
    snippet: "caseItem.stageLabel = '已成交'",
    field: 'stageLabel',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'CaseLifecycleStatus',
    reason: 'terminal stage label derivation in runtime state',
  },
  {
    file: 'src/selling-houses/domain/runtimeState.ts',
    snippet: "caseItem.stageLabel = '他处成交'",
    field: 'stageLabel',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'CaseLifecycleStatus',
    reason: 'lost-to-rival stage label derivation in runtime state',
  },
  {
    file: 'src/selling-houses/domain/runtimeState.ts',
    snippet: "caseItem.stageLabel = '已核销'",
    field: 'stageLabel',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'CaseLifecycleStatus',
    reason: 'withdrawn stage label derivation in runtime state',
  },
  {
    file: 'src/selling-houses/domain/runtimeState.ts',
    snippet: 'caseItem.stageLabel = CASE_STAGES[clamp(caseItem.stageIndex, 0, CASE_STAGES.length - 1)]',
    field: 'stageLabel',
    category: 'legacy_mirror_sync_allowed',
    canonicalSource: 'CaseStageIndex',
    reason: 'stage label derivation from stage index in runtime state',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// Classification logic
// ════════════════════════════════════════════════════════════════════════════

function classifyWrite(
  file: string,
  line: string,
  lineNum: number,
  match: RegExpMatchArray,
  lines: string[],
): { field: string; category: WriteCategory } {
  const snippet = line.trim();

  // Extract field name from assignment
  let field = 'unknown';
  const fieldMatch = line.match(/\.(\w+)\s*=/);
  if (fieldMatch) {
    field = fieldMatch[1];
  }
  // Special case for closedDeals.unshift/push
  if (line.includes('closedDeals.unshift') || line.includes('closedDeals.push')) {
    field = 'closedDeals';
  }

  // Check if test/fixture
  if (file.includes('__tests__') || file.includes('.test.') || file.includes('.spec.')) {
    return { field, category: 'test_or_fixture' };
  }

  // Check if object initialization (in object literal or return statement)
  const prevLine = lines[lineNum - 1]?.trim() || '';
  const nextLine = lines[lineNum + 1]?.trim() || '';
  if (prevLine.endsWith('{') || prevLine.endsWith('(') || nextLine.startsWith('}') || line.includes('{ status:')) {
    // Might be object initialization - check for patterns like { status: 'active' }
    if (line.match(/^\s*(status|stageIndex|stageLabel|trust|patience|urgency|soldPrice):\s*['"\w]/)) {
      return { field, category: 'object_initialization_or_hydration' };
    }
  }
  // Also check for inline object literals
  if (line.match(/\{\s*(status|stageIndex|stageLabel|trust|patience|urgency|soldPrice):\s*['"\w]/)) {
    return { field, category: 'object_initialization_or_hydration' };
  }

  // Check against explicit allowlist
  for (const entry of WRITE_ALLOWLIST) {
    // R43: Exact file path match (not file.includes())
    const fileMatches = file === entry.file || file.endsWith('/' + entry.file);
    // R43: Full snippet match (not substring(0, 50))
    const snippetMatches = snippet === entry.snippet || snippet.includes(entry.snippet);

    if (fileMatches && snippetMatches) {
      // Verify field matches
      if (field === entry.field || entry.field === '*') {
        return { field, category: entry.category };
      }
    }
  }

  // Classify by field type and context
  const lowerLine = line.toLowerCase();
  const lowerFile = file.toLowerCase();

  // R43: Remove file-level fallback - must be explicit allowlist match
  // Case/Opportunity truth fields that must use canonical boundary
  if (field === 'status' && (line.includes('caseItem') || line.includes('opportunity'))) {
    return { field, category: 'blocked_truth_write' };
  }

  if (field === 'soldPrice') {
    return { field, category: 'blocked_truth_write' };
  }

  if (field === 'stageIndex' || field === 'stageLabel') {
    // Check if it's customer/runtime stage (separate domain)
    if (lowerLine.includes('runtime.stageindex') || lowerFile.includes('customerengine')) {
      return { field, category: 'separate_domain_status_or_actor_state' };
    }
    // R43: No file-level fallback - must match allowlist explicitly
    return { field, category: 'blocked_truth_write' };
  }

  if (field === 'trust' || field === 'patience' || field === 'urgency') {
    // Check if it's customer profile (separate domain)
    if (lowerLine.includes('customer.') || lowerFile.includes('marketengine') || lowerFile.includes('bigworldbootstrap')) {
      return { field, category: 'separate_domain_status_or_actor_state' };
    }
    return { field, category: 'blocked_truth_write' };
  }

  if (field === 'closedDeals') {
    return { field, category: 'blocked_truth_write' };
  }

  // Separate domain status fields
  if (lowerLine.includes('customerstate') || lowerLine.includes('customerruntime')) {
    return { field, category: 'separate_domain_status_or_actor_state' };
  }

  if (lowerLine.includes('rivallisting') || lowerLine.includes('listing.status')) {
    return { field, category: 'separate_domain_status_or_actor_state' };
  }

  if (lowerLine.includes('productrun') || lowerLine.includes('run.status')) {
    return { field, category: 'separate_domain_status_or_actor_state' };
  }

  return { field, category: 'unknown' };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. Global Write Pattern Scan
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R42-1: Global Write Boundary Scan ===\n');

const scanDirs = [
  'src/selling-houses/domain',
  'src/selling-houses/application',
  'src/selling-houses/core',
  'src/selling-houses/runtime',
  'src/selling-houses/ui',
];

const allFiles: string[] = [];
for (const dir of scanDirs) {
  allFiles.push(...findTypeScriptFiles(dir));
}

console.log(`  Scanning ${allFiles.length} files...`);

// Patterns to detect field assignment writes
const writePatterns = [
  // Case/Opportunity truth field writes
  /\.status\s*=\s*['"\w]/g,
  /\.soldPrice\s*=\s*/g,
  /\.stageIndex\s*=\s*\w/g,
  /\.stageLabel\s*=\s*['"\w]/g,
  /\.trust\s*=\s*[\w\d(]/g,  // Allow both numbers and function calls
  /\.patience\s*=\s*[\w\d(]/g,  // Allow both numbers and function calls
  /\.urgency\s*=\s*[\w\d(]/g,  // Allow both numbers and function calls
  /closedDeals\.unshift\(/g,
  /closedDeals\.push\(/g,
];

for (const file of allFiles) {
  const src = readFileSafe(file);
  if (!src) continue;

  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comment lines
    if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('/*')) continue;

    // Check all patterns
    for (const pattern of writePatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      if (match) {
        const classification = classifyWrite(file, line, i, match, lines);
        const relativePath = file.replace('/Users/jiaqi/Documents/开放日测算/', '');

        const candidate: WriteCandidate = {
          file: relativePath,
          line: i + 1,
          snippet: line.trim(),
          field: classification.field,
          category: classification.category,
          allowed: classification.category !== 'blocked_truth_write' && classification.category !== 'unknown',
          reason: '',
        };

        candidates.push(candidate);
      }
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 2. Report Findings
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R42-2: Write Boundary Audit Findings ===\n');

const blockedWrites = candidates.filter(c => c.category === 'blocked_truth_write');
const unknownWrites = candidates.filter(c => c.category === 'unknown');
const canonicalWrites = candidates.filter(c => c.category === 'canonical_store_write');
const mirrorWrites = candidates.filter(c => c.category === 'legacy_mirror_sync_allowed');
const separateDomainWrites = candidates.filter(c => c.category === 'separate_domain_status_or_actor_state');
const initializationWrites = candidates.filter(c => c.category === 'object_initialization_or_hydration');
const testWrites = candidates.filter(c => c.category === 'test_or_fixture');

// Count allowlist hits
const allowlistHits = candidates.filter(c =>
  WRITE_ALLOWLIST.some(entry =>
    (c.file === entry.file || c.file.endsWith('/' + entry.file)) &&
    (c.snippet === entry.snippet || c.snippet.includes(entry.snippet)) &&
    c.field === entry.field
  )
);
const unusedAllowlistEntries = WRITE_ALLOWLIST.filter(entry =>
  !candidates.some(c =>
    (c.file === entry.file || c.file.endsWith('/' + entry.file)) &&
    (c.snippet === entry.snippet || c.snippet.includes(entry.snippet)) &&
    c.field === entry.field
  )
);

// Debug: print unused entries
if (unusedAllowlistEntries.length > 0) {
  console.log('\n  Debug: Unused allowlist entries:');
  for (const entry of unusedAllowlistEntries) {
    console.log(`    ${entry.file}: ${entry.snippet.substring(0, 60)} (field: ${entry.field})`);
  }
}

console.log(`  Total write candidates: ${candidates.length}`);
console.log(`  Blocked truth writes: ${blockedWrites.length}`);
console.log(`  Unknown writes: ${unknownWrites.length}`);
console.log(`  Canonical store writes: ${canonicalWrites.length}`);
console.log(`  Legacy mirror sync writes: ${mirrorWrites.length}`);
console.log(`  Separate domain/actor state writes: ${separateDomainWrites.length}`);
console.log(`  Object initialization writes: ${initializationWrites.length}`);
console.log(`  Test/fixture writes: ${testWrites.length}`);
console.log(`  Allowlist entries: ${WRITE_ALLOWLIST.length}`);
console.log(`  Allowlist hits: ${allowlistHits.length}`);
console.log(`  Unused allowlist entries: ${unusedAllowlistEntries.length}`);

if (blockedWrites.length > 0) {
  console.error(`\n  BLOCKED TRUTH WRITES - Must migrate or explicitly allowlist:`);
  // R43: Print ALL violations, not just first 10
  for (const c of blockedWrites) {
    console.error(`    ${c.file}:${c.line}: ${c.snippet.substring(0, 80)}`);
  }
}

if (unknownWrites.length > 0) {
  console.error(`\n  UNKNOWN WRITES - Must classify:`);
  for (const c of unknownWrites) {
    console.error(`    ${c.file}:${c.line}: ${c.snippet.substring(0, 80)}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 3. Gate Checks
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R42-3: Gate Checks ===\n');

check(blockedWrites.length === 0, `no blocked truth writes (found ${blockedWrites.length})`);
check(unknownWrites.length === 0, `no unknown writes (found ${unknownWrites.length})`);
check(unusedAllowlistEntries.length === 0, `no unused allowlist entries (found ${unusedAllowlistEntries.length})`);

// ════════════════════════════════════════════════════════════════════════════
// 4. Adversarial Self-Test
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R42-4: Adversarial Classifier Self-Test ===\n');

// Test blocked patterns
const testCases = [
  { snippet: 'caseItem.trust = 80', expected: 'blocked_truth_write', description: 'direct trust write should be blocked' },
  { snippet: "asWritableCase(caseItem).status = 'sold'", file: 'src/selling-houses/domain/engine.ts', expected: 'blocked_truth_write', description: 'status write outside mirror helper should be blocked' },
  { snippet: 'state.closedDeals.unshift(deal)', file: 'src/selling-houses/domain/engine.ts', expected: 'blocked_truth_write', description: 'closedDeals write outside mirror helper should be blocked' },
  { snippet: 'opportunity.stageIndex = 4', file: 'src/selling-houses/domain/engine.ts', expected: 'blocked_truth_write', description: 'opportunity stageIndex outside helper should be blocked' },

  // Test allowed patterns
  { snippet: "runtime.stageIndex = newStage", file: 'src/selling-houses/domain/customerEngine.ts', expected: 'separate_domain_status_or_actor_state', description: 'customer journey stage should be separate domain' },
  { snippet: "customerState.status = 'negotiating'", expected: 'separate_domain_status_or_actor_state', description: 'customer state status should be separate domain' },
  { snippet: "run.status = 'completed'", expected: 'separate_domain_status_or_actor_state', description: 'product run status should be separate domain' },
  { snippet: "{ status: 'active', stageIndex: 1 }", expected: 'object_initialization_or_hydration', description: 'object literal initialization should be allowed' },
  { snippet: 'caseItem.status = "active"', file: 'src/selling-houses/__tests__/test.ts', expected: 'test_or_fixture', description: 'test file should be classified as fixture' },

  // Test allowlist entries
  { snippet: "asWritableCase(caseItem).status = 'sold'", file: 'src/selling-houses/domain/dealClosing.ts', expected: 'legacy_mirror_sync_allowed', description: 'status write in mirror helper should be allowed' },
  { snippet: 'asWritableCase(caseItem).trust = deriveCaseTrustMirror(canonicalState)', file: 'src/selling-houses/domain/trustWriteHelper.ts', expected: 'legacy_mirror_sync_allowed', description: 'trust write in mirror helper should be allowed' },
];

let selfTestPassed = 0;
let selfTestFailed = 0;

for (const test of testCases) {
  const lines = [test.snippet];
  const result = classifyWrite(test.file || 'src/selling-houses/domain/test.ts', test.snippet, 0, [] as any, lines);

  if (result.category === test.expected) {
    selfTestPassed++;
    console.log(`  [PASS] ${test.description}: got ${result.category}`);
  } else {
    selfTestFailed++;
    console.error(`  [FAIL] ${test.description}: expected ${test.expected}, got ${result.category}`);
  }
}

check(selfTestFailed === 0, `adversarial self-test passed (${selfTestPassed}/${testCases.length})`);

// ════════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R42 Constitutional Write Boundary Gate Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error(`\nGATE FAILED: ${failed} checks did not pass.`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  console.log(`\nRun the following to see all violations:`);
  console.log(`  npx tsx scripts/verify-selling-houses-r42-constitutional-write-boundary-root-cause-gate.ts`);
  process.exit(1);
}

console.log(`\nGATE PASSED: All ${passed} checks passed.`);
console.log('Verified: constitutional write boundary, no unclassified writes, explicit allowlist.');
