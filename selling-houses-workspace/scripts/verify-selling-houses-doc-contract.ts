import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const responsibilityMatrix = readFileSync(
  new URL('../docs/selling-houses-page-responsibility-matrix.md', import.meta.url),
  'utf8',
);
const designSystem = readFileSync(
  new URL('../docs/selling-houses-design-system.md', import.meta.url),
  'utf8',
);

assert.ok(
  responsibilityMatrix.includes('workspaceShellProjection.sidebar'),
  'Expected responsibility matrix to document the shell sidebar as the cross-page subject',
);
assert.ok(
  responsibilityMatrix.includes('房源页负责“单房决策与执行”'),
  'Expected responsibility matrix to document cases as single-house decision/execution',
);
assert.ok(
  responsibilityMatrix.includes('客户页负责“关系推进池”'),
  'Expected responsibility matrix to document customers as relationship pool',
);
assert.ok(
  designSystem.includes('Canonical projection 规则'),
  'Expected design system to document canonical projection rules',
);
assert.ok(
  designSystem.includes('seller-tablet') && designSystem.includes('seller-empty'),
  'Expected design system to document shared secondary page surfaces',
);

console.log('selling-houses documentation contract verification passed');
