import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

type SellingHousesLayer = 'core' | 'domain' | 'runtime' | 'interface' | 'application' | 'ui';

interface ImportReference {
  specifier: string;
  line: number;
  importedNames: readonly string[];
  hasOpaqueBinding: boolean;
  isTypeOnly: boolean;
}

interface ImportViolation {
  filePath: string;
  sourceLayer: SellingHousesLayer;
  targetLayer: SellingHousesLayer;
  specifier: string;
  line: number;
}

type LayerImportKey = `${string} -> ${string}`;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sellingHousesRoot = path.join(repoRoot, 'src', 'selling-houses');
const checkedSourceLayers: SellingHousesLayer[] = ['core', 'domain', 'runtime', 'interface'];
const allLayers: SellingHousesLayer[] = ['core', 'domain', 'runtime', 'interface', 'application', 'ui'];

const legacyAllowedLayerImports = new Map<LayerImportKey, readonly string[]>([
  // Core compatibility adapters still read legacy domain shapes until canonical core types are fully authored.
  // (removed action-specs/types.ts -> domain/models.js — ActionCategoryId/ActionMetricKey now in core actionTaxonomy.ts)
  // (removed decision-moments/types.ts -> domain/models.js — ActionMetricKey now in core actionTaxonomy.ts)
  // (removed archetypes/types.ts -> domain/models.js — 7 archetype types now in core archetypeTaxonomy.ts)
  // (removed evaluation/legacyAdapters.ts -> domain/config/balance.js — SCORING_BALANCE now in core scoringBalance.ts)
  // (removed evaluation/score-separation/legacyAdapter.ts -> domain/config/balance.js — SCORING_BALANCE now in core scoringBalance.ts)
  // (removed action-specs/legacyAdapter.ts -> domain/actions/definitions.js — ACTIONS now in core actionDefinitions.ts)
  // (removed archetypes/definitions.ts -> domain/worlds/builtinWorld.js — BUILT_IN_WORLD archetypes now in core archetypeSeeds.ts)
  // (removed evaluation/legacyAdapters.ts -> domain/models.js — Case/GameState/Opportunity replaced by LegacyEvaluation* contracts)
  // (removed evaluation/score-separation/legacyAdapter.ts -> domain/models.js — Case/GameState/Opportunity replaced by LegacyScoreSeparation* contracts)
  // (removed world-state/__tests__/legacyAdapter.test.ts -> domain/models.js — Case/GameState/Opportunity replaced by LegacyWorld* contracts)
  // (removed world-state/__tests__/legacyCaseOwnedReadModels.test.ts -> domain/models.js — Case replaced by LegacyWorldCaseLike contract)
  // (removed world-state/adapters.ts -> domain/models.js — Case/GameState/Opportunity replaced by LegacyWorld* contracts)
  // (removed world-state/legacy-case-field-ownership.ts -> domain/models.js — keyof Case replaced by keyof LegacyWorldCaseLike)
  // readModel.ts and types.ts no longer import domain — plain shapes used instead.
  // Domain debts are transitional shims while runtime/application facades are being introduced.
  // domain -> core/world-state/semantic-receipt is normal direction, no allowlist needed
  // (removed old domain -> runtime/simulation/dailySemanticReceipt allowlist entry)
  // (removed decisionMomentBridge.ts — calls moved to application layer)
  // (removed domain/engine.ts -> runtime/simulation/processes — now uses processManagerFacade DI)
  // (removed domain/config/difficultyOptions.ts -> application/difficultyPresentation — now in domain/config)
]);

const allowedCoreRuntimeDomainImports = new Set([
  'OPPORTUNITY_STAGES',
  'clamp',
]);

const forbiddenTargetsBySourceLayer: Record<SellingHousesLayer, Set<SellingHousesLayer>> = {
  core: new Set(['domain', 'runtime', 'interface', 'application', 'ui']),
  domain: new Set(['runtime', 'interface', 'application', 'ui']),
  runtime: new Set(['interface', 'ui']),
  interface: new Set(['ui']),
  application: new Set(),
  ui: new Set(),
};

function isSellingHousesLayer(value: string): value is SellingHousesLayer {
  return allLayers.includes(value as SellingHousesLayer);
}

function toPosixPath(value: string) {
  return value.split(path.sep).join('/');
}

function toLayerImportKey(filePath: string, specifier: string): LayerImportKey {
  return `${toPosixPath(path.relative(repoRoot, filePath))} -> ${specifier}`;
}

function parseLayerImportKey(key: LayerImportKey) {
  const separator = ' -> ';
  const separatorIndex = key.indexOf(separator);
  assert.notEqual(separatorIndex, -1, `Invalid layer import allowlist key ${key}`);

  return {
    relativeFilePath: key.slice(0, separatorIndex),
    specifier: key.slice(separatorIndex + separator.length),
  };
}

function walkTsFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];

  const filePaths: string[] = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      filePaths.push(...walkTsFiles(entryPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      filePaths.push(entryPath);
    }
  }

  return filePaths;
}

function classifyPathLayer(filePath: string): SellingHousesLayer | null {
  const relativePath = path.relative(sellingHousesRoot, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null;

  const [layer] = relativePath.split(path.sep);
  if (!layer || !isSellingHousesLayer(layer)) return null;
  return layer;
}

function classifyBareSpecifierLayer(specifier: string): SellingHousesLayer | null {
  const normalizedSpecifier = specifier.replace(/\\/g, '/');
  const rootMarkers = ['@/src/selling-houses/', 'src/selling-houses/', '/src/selling-houses/'];

  for (const marker of rootMarkers) {
    const index = normalizedSpecifier.indexOf(marker);
    if (index < 0) continue;

    const afterMarker = normalizedSpecifier.slice(index + marker.length);
    const [layer] = afterMarker.split('/');
    if (layer && isSellingHousesLayer(layer)) return layer;
  }

  return null;
}

function classifyTargetLayer(fromFilePath: string, specifier: string): SellingHousesLayer | null {
  if (specifier.startsWith('.')) {
    return classifyPathLayer(path.resolve(path.dirname(fromFilePath), specifier));
  }

  return classifyBareSpecifierLayer(specifier);
}

function readImportClauseNames(importClause: ts.ImportClause | undefined): {
  importedNames: string[];
  hasOpaqueBinding: boolean;
} {
  if (!importClause) {
    return { importedNames: [], hasOpaqueBinding: true };
  }

  const importedNames: string[] = [];
  let hasOpaqueBinding = false;

  if (importClause.name) {
    hasOpaqueBinding = true;
  }

  if (importClause.namedBindings) {
    if (ts.isNamespaceImport(importClause.namedBindings)) {
      hasOpaqueBinding = true;
    } else {
      importClause.namedBindings.elements.forEach((element) => {
        importedNames.push((element.propertyName || element.name).text);
      });
    }
  }

  return { importedNames, hasOpaqueBinding };
}

function isLegacyAllowedLayerImport(filePath: string, reference: ImportReference): boolean {
  const allowedNames = legacyAllowedLayerImports.get(toLayerImportKey(filePath, reference.specifier));
  if (!allowedNames) {
    return false;
  }
  if (reference.hasOpaqueBinding || reference.importedNames.length === 0) {
    return false;
  }

  return reference.importedNames.every((name) => allowedNames.includes(name));
}

function collectImportReferences(filePath: string): ImportReference[] {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const references: ImportReference[] = [];

  function addReference(specifierNode: ts.StringLiteralLike) {
    const position = sourceFile.getLineAndCharacterOfPosition(specifierNode.getStart(sourceFile));
    references.push({
      specifier: specifierNode.text,
      line: position.line + 1,
      importedNames: [],
      hasOpaqueBinding: true,
      isTypeOnly: false,
    });
  }

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const importNames = readImportClauseNames(node.importClause);
      references.push({
        specifier: node.moduleSpecifier.text,
        line: sourceFile.getLineAndCharacterOfPosition(node.moduleSpecifier.getStart(sourceFile)).line + 1,
        importedNames: importNames.importedNames,
        hasOpaqueBinding: importNames.hasOpaqueBinding,
        isTypeOnly: node.importClause?.isTypeOnly === true,
      });
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      addReference(node.moduleSpecifier);
    }

    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteralLike(node.arguments[0])
    ) {
      addReference(node.arguments[0]);
    }

    if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      if (ts.isLiteralTypeNode(argument) && ts.isStringLiteralLike(argument.literal)) {
        addReference(argument.literal);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return references;
}

function assertLayerBoundaryConfig() {
  assert.ok(
    checkedSourceLayers.includes('domain'),
    'Expected layer import verification to scan domain sources',
  );

  for (const targetLayer of ['runtime', 'application', 'interface', 'ui'] satisfies SellingHousesLayer[]) {
    assert.ok(
      forbiddenTargetsBySourceLayer.domain.has(targetLayer),
      `Expected domain imports to forbid ${targetLayer}`,
    );
  }

  assert.ok(
    forbiddenTargetsBySourceLayer.core.has('domain'),
    'Expected core imports to forbid domain unless explicitly allowlisted as compatibility debt',
  );

  for (const [allowlistKey, allowedNames] of legacyAllowedLayerImports) {
    assert.ok(allowedNames.length > 0, `Allowed layer import must declare named imports: ${allowlistKey}`);
    const { relativeFilePath, specifier } = parseLayerImportKey(allowlistKey);
    const filePath = path.join(repoRoot, relativeFilePath);

    assert.ok(fs.existsSync(filePath), `Allowed layer import source does not exist: ${allowlistKey}`);
    assert.ok(
      collectImportReferences(filePath).some((reference) =>
        reference.specifier === specifier
        && !reference.hasOpaqueBinding
        && reference.importedNames.every((name) => allowedNames.includes(name))),
      `Allowed layer import is not present in source: ${allowlistKey}`,
    );

    const sourceLayer = classifyPathLayer(filePath);
    const targetLayer = classifyTargetLayer(filePath, specifier);

    assert.ok(sourceLayer, `Allowed layer import has unknown source layer: ${allowlistKey}`);
    assert.ok(targetLayer, `Allowed layer import has unknown target layer: ${allowlistKey}`);
    assert.ok(
      sourceLayer === 'core' || sourceLayer === 'domain',
      `Allowed layer import must be core/domain debt: ${allowlistKey}`,
    );
    assert.ok(
      (sourceLayer === 'core' && targetLayer === 'domain')
      || (sourceLayer === 'domain' && (targetLayer === 'runtime' || targetLayer === 'application')),
      `Allowed layer debt has unexpected direction: ${allowlistKey}`,
    );
    assert.ok(
      forbiddenTargetsBySourceLayer[sourceLayer].has(targetLayer),
      `Allowed layer import is not a forbidden boundary debt: ${allowlistKey}`,
    );
    if (sourceLayer === 'core') {
      const references = collectImportReferences(filePath).filter((reference) => reference.specifier === specifier);
      assert.ok(
        references.every((reference) =>
          reference.isTypeOnly
          || reference.importedNames.every((name) => allowedCoreRuntimeDomainImports.has(name))),
        `Allowed core->domain import must be type-only unless it is an explicit runtime compatibility value: ${allowlistKey}`,
      );
    }
  }
}

function findViolations(): ImportViolation[] {
  const filePaths = checkedSourceLayers.flatMap((layer) => walkTsFiles(path.join(sellingHousesRoot, layer)));
  const violations: ImportViolation[] = [];

  for (const filePath of filePaths) {
    const sourceLayer = classifyPathLayer(filePath);
    if (!sourceLayer || !checkedSourceLayers.includes(sourceLayer)) continue;

    const forbiddenTargets = forbiddenTargetsBySourceLayer[sourceLayer];
    for (const reference of collectImportReferences(filePath)) {
      if (isLegacyAllowedLayerImport(filePath, reference)) continue;
      const targetLayer = classifyTargetLayer(filePath, reference.specifier);
      if (!targetLayer || !forbiddenTargets.has(targetLayer)) continue;

      violations.push({
        filePath,
        sourceLayer,
        targetLayer,
        specifier: reference.specifier,
        line: reference.line,
      });
    }
  }

  return violations;
}

assertLayerBoundaryConfig();

const violations = findViolations();

if (violations.length > 0) {
  console.error('selling-houses layer import verification failed');
  for (const violation of violations) {
    console.error(
      [
        `- ${toPosixPath(path.relative(repoRoot, violation.filePath))}:${violation.line}`,
        `${violation.sourceLayer} must not import ${violation.targetLayer}`,
        `(${violation.specifier})`,
      ].join(' '),
    );
  }
  process.exit(1);
}

// Freeze check: the allowlist must not grow without explicit review.
// If you need to add a new entry, update this count and document the reason in the allowlist comments.
const CURRENT_ALLOWLIST_ENTRY_COUNT = 0;
if (legacyAllowedLayerImports.size !== CURRENT_ALLOWLIST_ENTRY_COUNT) {
  console.error(
    `selling-houses core→domain allowlist size changed: expected ${CURRENT_ALLOWLIST_ENTRY_COUNT}, got ${legacyAllowedLayerImports.size}. ` +
    'Update CURRENT_ALLOWLIST_ENTRY_COUNT in verify-selling-houses-layer-imports.ts and document the reason.',
  );
  process.exit(1);
}

// Deleted-key re-appearance guard: these allowlist entries were intentionally removed
// during constitutional migration. If they re-appear, it means a regression.
const DELETED_ALLOWLIST_KEYS: readonly LayerImportKey[] = [
  'src/selling-houses/core/business-rules/action-specs/types.ts -> ../../../domain/models.js',
  'src/selling-houses/core/business-rules/decision-moments/types.ts -> ../../../domain/models.js',
  'src/selling-houses/core/business-rules/archetypes/types.ts -> ../../../domain/models.js',
  'src/selling-houses/core/evaluation/legacyAdapters.ts -> ../../domain/config/balance.js',
  'src/selling-houses/core/evaluation/score-separation/legacyAdapter.ts -> ../../../domain/config/balance.js',
  'src/selling-houses/core/business-rules/business-flows/types.ts -> ../../../domain/models.js',
  'src/selling-houses/core/business-rules/action-specs/legacyAdapter.ts -> ../../../domain/actions/definitions.js',
  'src/selling-houses/core/business-rules/archetypes/definitions.ts -> ../../../domain/worlds/builtinWorld.js',
  'src/selling-houses/core/world-state/models.ts -> ../../domain/models.js',
  'src/selling-houses/core/world-state/legacy-case-segments.ts -> ../../domain/models.js',
  'src/selling-houses/core/world-state/legacy-case-owned-read-models.ts -> ../../domain/models.js',
  'src/selling-houses/core/evaluation/legacyAdapters.ts -> ../../domain/models.js',
  'src/selling-houses/core/evaluation/score-separation/legacyAdapter.ts -> ../../../domain/models.js',
  'src/selling-houses/core/world-state/adapters.ts -> ../../domain/models.js',
  'src/selling-houses/core/world-state/__tests__/legacyAdapter.test.ts -> ../../../domain/models.js',
  'src/selling-houses/core/world-state/__tests__/legacyCaseOwnedReadModels.test.ts -> ../../../domain/models.js',
  'src/selling-houses/core/world-state/legacy-case-field-ownership.ts -> ../../domain/models.js',
];

for (const deletedKey of DELETED_ALLOWLIST_KEYS) {
  const { relativeFilePath, specifier } = parseLayerImportKey(deletedKey);
  const filePath = path.join(repoRoot, relativeFilePath);
  if (!fs.existsSync(filePath)) continue;

  const references = collectImportReferences(filePath);
  const match = references.find((ref) => ref.specifier === specifier);
  if (match) {
    console.error(
      `selling-houses deleted allowlist key re-appeared: ${deletedKey} (line ${match.line}). ` +
      'This is a regression — update the canonical core file instead.',
    );
    process.exit(1);
  }
}

console.log('selling-houses layer import verification passed');
