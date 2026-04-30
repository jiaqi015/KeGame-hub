import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const handlerPath = path.resolve('modules/open-day/interfaces/http/openDayDisambiguationHandler.ts');
const source = fs.readFileSync(handlerPath, 'utf8');

assert.ok(
  source.includes("authorizeRequestPersisted(req, 'open-day')"),
  'Expected open-day disambiguation handler to require explicit open-day workspace authorization',
);

console.log('open-day auth contract verification passed');
