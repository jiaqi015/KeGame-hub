#!/usr/bin/env npx tsx
/**
 * generate-field-ownership-matrix.ts
 *
 * 从 legacy-case-field-ownership.ts 读取字段归属注册表，
 * 生成 docs/selling-houses-field-ownership-matrix.md 的 §1 归属总表。
 *
 * 用法：npx tsx scripts/generate-field-ownership-matrix.ts
 *
 * 设计意图：
 * - TS registry 是唯一 SOT（single source of truth）
 * - markdown 表格由脚本生成，不再手动维护
 * - 加新字段时只改 TS，markdown 自动同步
 */

import {
  LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES,
  type LegacyCaseFieldOwnershipEntry,
} from '../src/selling-houses/core/world-state/legacy-case-field-ownership.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.join(repoRoot, 'docs', 'selling-houses-field-ownership-matrix.md');

// ---------------------------------------------------------------------------
// 分组：按 domainFacet 聚合
// ---------------------------------------------------------------------------

const FACET_ORDER: readonly string[] = [
  'asset-profile',
  'asset-pricing',
  'owner-profile',
  'owner-decision',
  'broker-relationship',
  'evaluation',
  'lifecycle',
  'runtime',
  'projection',
  'legacy',
];

const FACET_LABELS: Record<string, string> = {
  'asset-profile': '资产画像',
  'asset-pricing': '价格模型',
  'owner-profile': '业主画像',
  'owner-decision': '业主决策',
  'broker-relationship': '经纪关系',
  'evaluation': '评估模型',
  'lifecycle': '生命周期',
  'runtime': '运行时',
  'projection': '投影/UI',
  'legacy': '历史遗留',
};

const OWNER_LABELS: Record<string, string> = {
  'asset-case': 'Case',
  'owner': 'Owner',
  'owner-case-relation': 'OwnerCaseRelation',
  'broker-owner-relation': 'BrokerOwnerRelation',
  'evaluation-mirror': 'PriceModelOutput / AssetScoreSnapshot',
  'process-mirror': 'ListingLifecycle',
  'runtime-scratch': 'DayScratch',
  'projection-ui': 'Projection',
  'deprecated-legacy': '（已废弃）',
};

// ---------------------------------------------------------------------------
// 生成 markdown
// ---------------------------------------------------------------------------

function generateMarkdown(): string {
  const lines: string[] = [];

  lines.push('# 卖房（资产顾问）字段归属表');
  lines.push('');
  lines.push('> **本文件由 `scripts/generate-field-ownership-matrix.ts` 自动生成。**');
  lines.push('> 唯一 SOT 是 `src/selling-houses/core/world-state/legacy-case-field-ownership.ts`。');
  lines.push('> 如需修改字段归属，请改 TS registry 后运行 `npx tsx scripts/generate-field-ownership-matrix.ts`。');
  lines.push('');
  lines.push(`最后生成：${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 按 facet 分组
  const grouped = new Map<string, LegacyCaseFieldOwnershipEntry[]>();
  for (const entry of LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES) {
    const facet = entry.domainFacet;
    if (!grouped.has(facet)) grouped.set(facet, []);
    grouped.get(facet)!.push(entry);
  }

  for (const facet of FACET_ORDER) {
    const entries = grouped.get(facet);
    if (!entries || entries.length === 0) continue;

    lines.push(`## ${FACET_LABELS[facet] || facet}`);
    lines.push('');
    lines.push('| 字段 | 归属 | 角色 | 目标概念 | 迁移说明 |');
    lines.push('| ---- | ---- | ---- | -------- | -------- |');

    for (const entry of entries.sort((a, b) => a.field.localeCompare(b.field))) {
      const owner = OWNER_LABELS[entry.canonicalOwner] || entry.canonicalOwner;
      const role = entry.legacyRole === 'canonical-temporary' ? 'canonical'
        : entry.legacyRole === 'compatibility-mirror' ? 'mirror'
        : 'migrate';
      const target = entry.targetConcept || '—';
      const note = entry.migrationNote || '—';
      lines.push(`| \`${entry.field}\` | ${owner} | ${role} | ${target} | ${note} |`);
    }

    lines.push('');
  }

  // 价格术语对照
  lines.push('---');
  lines.push('');
  lines.push('## 价格术语对照');
  lines.push('');
  lines.push('文档（price-model.md）和代码（models.ts Case 字段）使用不同命名。对照表：');
  lines.push('');
  lines.push('| 语义 | 文档命名 | 代码字段 | 归属 | 说明 |');
  lines.push('| ---- | -------- | -------- | ---- | ---- |');
  lines.push('| 挂牌价 | `listingPrice` | `askPrice` | OwnerCaseRelation | 当前对外挂价 |');
  lines.push('| 市场估价 | `marketEstimatedPrice` | `marketPrice` | PriceModelOutput | 模型评估的市场价 |');
  lines.push('| 底价 | — | `bottomPrice` | OwnerCaseRelation | 业主能接受的最低成交价 |');
  lines.push('| 业主心理价 | `ownerPsychPrice` | — | PriceModelOutput | 业主认为合理的价格（≠底价） |');
  lines.push('| 价差 | `priceGapToMarket` | `priceGapPct` | PriceModelOutput | 挂牌价与市场价的差距百分比 |');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 写入
// ---------------------------------------------------------------------------

const markdown = generateMarkdown();
fs.writeFileSync(outputPath, markdown, 'utf-8');
console.log(`✅ Generated ${outputPath}`);
console.log(`   ${LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.length} fields mapped`);
