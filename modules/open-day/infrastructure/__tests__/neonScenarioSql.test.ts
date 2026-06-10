import { describe, it, expect } from 'vitest';

describe('neonOpenDayScenarioRepository — SQL parameter count', () => {
  it('INSERT into open_day_scenario_templates has 11 columns and 11 placeholders', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.resolve(__dirname, '../neonOpenDayScenarioRepository.ts'),
      'utf8',
    );

    const insertMatch = content.match(
      /INSERT INTO open_day_scenario_templates \(([^)]+)\)\s+VALUES \(([^)]+)\)/,
    );
    expect(insertMatch).not.toBeNull();

    const columns = insertMatch![1].split(',').map((c: string) => c.trim());
    const placeholders = insertMatch![2].split(',').map((p: string) => p.trim());

    expect(columns.length).toBe(11);
    expect(placeholders.length).toBe(11);
    expect(columns.length).toBe(placeholders.length);
  });

  it('all placeholders are numbered sequentially without gaps', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.resolve(__dirname, '../neonOpenDayScenarioRepository.ts'),
      'utf8',
    );

    const insertMatch = content.match(
      /INSERT INTO open_day_scenario_templates \(([^)]+)\)\s+VALUES \(([^)]+)\)/,
    );
    const placeholders = insertMatch![2].split(',').map((p: string) => p.trim());

    placeholders.forEach((ph: string, i: number) => {
      const expected = i < placeholders.length - 1 ? `$${i + 1}` : `$${i + 1}::jsonb`;
      expect(ph).toBe(expected);
    });
  });
});
