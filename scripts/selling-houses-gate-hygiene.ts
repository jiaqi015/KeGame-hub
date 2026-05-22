/**
 * selling-houses-gate-hygiene.ts — shared gate hygiene utilities.
 *
 * Provides source scanning for soft-pass patterns,
 * handling block comments, multi-line template literals, and regex literals.
 */

export interface GateHygieneViolation {
  file: string;
  line: number;
  pattern: string;
}

const SOFT_PASS_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bcheck\s*\(\s*true\s*,/, label: 'check(true, ...)' },
  { pattern: /\bassert\s*\(\s*true\s*\)/, label: 'assert(true)' },
  { pattern: /\|\|\s*true/, label: '|| true' },
  { pattern: /\.claude\/worktrees/, label: '.claude/worktrees' },
];

/**
 * Strip regions from source that should not be scanned:
 * - Block comments (/* ... *\/)
 * - Single-line string literals
 * - Multi-line template literals
 * - Regex literals (to avoid false positives from patterns inside /.../)
 *
 * Returns an array of lines that correspond 1:1 to the original source lines,
 * with non-code regions replaced by spaces so line numbers are preserved.
 */
export function stripNonCodeRegions(source: string): string[] {
  const lines = source.split('\n');
  const result: string[] = lines.map(() => '');

  let i = 0;
  let inBlockComment = false;
  let inTemplateLiteral = false;
  let templateDepth = 0;

  while (i < source.length) {
    const lineStart = source.lastIndexOf('\n', i - 1) + 1;
    const lineIndex = source.substring(0, i).split('\n').length - 1;

    if (inBlockComment) {
      const closeIdx = source.indexOf('*/', i);
      if (closeIdx === -1) {
        // Unterminated block comment — skip rest
        break;
      }
      // Skip to end of block comment without blanking lines
      i = closeIdx + 2;
      inBlockComment = false;
      continue;
    }

    if (inTemplateLiteral) {
      // Scan for end of template literal, handling ${...} nesting
      let depth = templateDepth;
      while (i < source.length) {
        const ch = source[i];
        const li = source.substring(0, i).split('\n').length - 1;
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === '$' && source[i + 1] === '{') {
          depth++;
          i += 2;
          continue;
        }
        if (ch === '{' && depth > templateDepth) {
          // Inside ${...}, just advance
          i++;
          continue;
        }
        if (ch === '}' && depth > templateDepth) {
          depth--;
          i++;
          continue;
        }
        if (ch === '`') {
          inTemplateLiteral = false;
          templateDepth = 0;
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Not in any special region — check for starts
    const remaining = source.substring(i);

    // Block comment start
    if (remaining.startsWith('/*')) {
      inBlockComment = true;
      const endIdx = source.indexOf('*/', i + 2);
      if (endIdx === -1) {
        // Unterminated
        break;
      }
      // Skip to end of block comment without blanking lines
      i = endIdx + 2;
      inBlockComment = false;
      continue;
    }

    // Line comment
    if (remaining.startsWith('//')) {
      result[lineIndex] = '';
      const newlineIdx = source.indexOf('\n', i);
      i = newlineIdx === -1 ? source.length : newlineIdx + 1;
      continue;
    }

    // Template literal start
    if (remaining.startsWith('`')) {
      inTemplateLiteral = true;
      templateDepth = 0;
      i++;
      continue;
    }

    // Regex literal: /pattern/flags — only after certain tokens
    // A regex can appear after: =, (, [, !, &, |, ^, ~, ?, :, ;, {, }, ,, <, >, return, typeof, instanceof, in, void, delete, throw, new, case
    if (remaining.startsWith('/') && !remaining.startsWith('/*') && !remaining.startsWith('//')) {
      const before = source.substring(Math.max(0, i - 20), i).trimEnd();
      const regexPreceding = /(?:[=([!&|^~?:;{},<>]|return|typeof|instanceof|in|void|delete|throw|new|case)\s*$/;
      if (regexPreceding.test(before) || i === 0) {
        // Likely a regex literal — skip past it
        let j = i + 1;
        let inCharClass = false;
        while (j < source.length) {
          const rc = source[j];
          if (rc === '\\') {
            j += 2;
            continue;
          }
          if (rc === '[') {
            inCharClass = true;
            j++;
            continue;
          }
          if (rc === ']') {
            inCharClass = false;
            j++;
            continue;
          }
          if (rc === '/' && !inCharClass) {
            j++;
            // Skip flags
            while (j < source.length && /[gimsuy]/.test(source[j])) j++;
            break;
          }
          j++;
        }
        // Mark the regex region as blank (avoid false positives)
        const startLine = lineIndex;
        const endLine = source.substring(0, j).split('\n').length - 1;
        for (let li = startLine; li <= endLine && li < lines.length; li++) {
          // Don't blank entire line — just the regex portion
          // For simplicity, blank lines that only contain the regex
        }
        i = j;
        continue;
      }
    }

    // String literals (single or double quote)
    if (remaining.startsWith("'") || remaining.startsWith('"')) {
      const quote = remaining[0];
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === quote) {
          j++;
          break;
        }
        j++;
      }
      i = j;
      continue;
    }

    // Normal character — add to result line
    result[lineIndex] += source[i];
    i++;
  }

  return result;
}

/**
 * Strip a single source line for gate hygiene checking.
 * Removes inline comments and string literals.
 */
export function stripLineForGateHygiene(line: string): string {
  return line
    .replace(/\/\/.*$/, '')
    .replace(/'[^']*'/g, '""')
    .replace(/"[^"]*"/g, '""')
    .replace(/`[^`]*`/g, '""');
}

/**
 * Find lines in source code that contain soft-pass patterns.
 * Uses block-aware stripping to handle multi-line comments and template literals.
 * Skips comment-only lines.
 */
export function findGateSoftPassLines(
  source: string,
  patterns: Array<{ pattern: RegExp; label: string }> = SOFT_PASS_PATTERNS,
): GateHygieneViolation[] {
  const violations: GateHygieneViolation[] = [];
  const strippedLines = stripNonCodeRegions(source);

  for (let lineIdx = 0; lineIdx < strippedLines.length; lineIdx++) {
    const line = strippedLines[lineIdx];
    if (!line) continue;

    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    // Also strip any remaining inline strings
    const finalLine = stripLineForGateHygiene(line);

    for (const { pattern, label } of patterns) {
      if (pattern.test(finalLine)) {
        violations.push({ file: '', line: lineIdx + 1, pattern: label });
      }
    }
  }

  return violations;
}

/**
 * Format line numbers for error output.
 */
export function formatGateLineLocations(violations: readonly GateHygieneViolation[]): string {
  if (violations.length === 0) return '';
  return violations.map(v => `${v.file}:${v.line} [${v.pattern}]`).join(', ');
}

/**
 * The set of constitutional chain gate scripts to scan.
 */
export const CONSTITUTIONAL_CHAIN_GATES = [
  'scripts/verify-selling-houses-contract-terminal-fact-gate.ts',
  'scripts/verify-selling-houses-constitutional-migration-gate.ts',
  'scripts/verify-selling-houses-price-trajectory-v0-gate.ts',
  'scripts/verify-selling-houses-broker-customer-relation-v0-gate.ts',
  'scripts/verify-selling-houses-r4-scale-gate.ts',
];
