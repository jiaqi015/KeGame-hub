import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

type SellingHousesLayer = 'core' | 'runtime' | 'interface' | 'application' | 'ui';

interface ImportReference {
  specifier: string;
  line: number;
}

interface ImportViolation {
  filePath: string;
  sourceLayer: SellingHousesLayer;
  targetLayer: SellingHousesLayer;
  specifier: string;
  line: number;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sellingHousesRoot = path.join(repoRoot, 'src', 'selling-houses');
const checkedSourceLayers: SellingHousesLayer[] = ['core', 'runtime', 'interface'];
const allLayers: SellingHousesLayer[] = ['core', 'runtime', 'interface', 'application', 'ui'];

const forbiddenTargetsBySourceLayer: Record<SellingHousesLayer, Set<SellingHousesLayer>> = {
  core: new Set(['runtime', 'interface', 'application', 'ui']),
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

function collectImportReferences(filePath: string): ImportReference[] {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const references: ImportReference[] = [];

  function addReference(specifierNode: ts.StringLiteralLike) {
    const position = sourceFile.getLineAndCharacterOfPosition(specifierNode.getStart(sourceFile));
    references.push({
      specifier: specifierNode.text,
      line: position.line + 1,
    });
  }

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      addReference(node.moduleSpecifier);
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

function findViolations(): ImportViolation[] {
  const filePaths = checkedSourceLayers.flatMap((layer) => walkTsFiles(path.join(sellingHousesRoot, layer)));
  const violations: ImportViolation[] = [];

  for (const filePath of filePaths) {
    const sourceLayer = classifyPathLayer(filePath);
    if (!sourceLayer || !checkedSourceLayers.includes(sourceLayer)) continue;

    const forbiddenTargets = forbiddenTargetsBySourceLayer[sourceLayer];
    for (const reference of collectImportReferences(filePath)) {
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

console.log('selling-houses layer import verification passed');
