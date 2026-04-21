import assert from 'node:assert/strict';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { Dashboard } from '../src/selling-houses/ui/features/Dashboard.js';
import { Market } from '../src/selling-houses/ui/features/Market.js';
import { Cases } from '../src/selling-houses/ui/features/Cases.js';
import { Opportunities } from '../src/selling-houses/ui/features/Opportunities.js';
import { ProfilePanel } from '../src/selling-houses/ui/features/ProfilePanel.js';

function buildWorld() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
  const world = createInitialState(snapshot, 20260419);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

function render(component: React.ReactElement) {
  return renderToStaticMarkup(component);
}

function expectIncludes(markup: string, expected: string[], page: string) {
  for (const token of expected) {
    assert.ok(markup.includes(token), `Expected ${page} to include "${token}"`);
  }
}

function expectExcludes(markup: string, blocked: string[], page: string) {
  for (const token of blocked) {
    assert.ok(!markup.includes(token), `Expected ${page} not to include "${token}"`);
  }
}

const world = buildWorld();

const dashboardMarkup = render(
  React.createElement(Dashboard, {
    state: world,
    onSelectCase: () => {},
    onSetView: () => {},
    onOpenMarket: () => {},
  }),
);

expectIncludes(
  dashboardMarkup,
  ['data-selling-houses-page="overview"', '总览', '今天先去哪', '本周节奏', '今日事项', '更多', '主房源', '去向', '当前主房源'],
  'overview',
);
expectExcludes(dashboardMarkup, ['市场雷达', '房源筛选', '单房结果', '去复盘'], 'overview');

const marketMarkup = render(
  React.createElement(Market, {
    state: world,
    onSelectCase: () => {},
    onOpenCases: () => {},
  }),
);

expectIncludes(
  marketMarkup,
  ['data-selling-houses-page="market"', '市场雷达', '全部', '政策', '板块', '成交', '客户', '房源', '简讯', '指标', '在场竞品', '受影响房源'],
  'market',
);
expectExcludes(marketMarkup, ['今日事项', '当前主房源', '房源筛选'], 'market');

const casesMarkup = render(
  React.createElement(Cases, {
    state: world,
    onSelectCase: () => {},
    onExecuteAction: () => false,
  }),
);

expectIncludes(
  casesMarkup,
  [
    'data-selling-houses-page="cases"',
    '房源筛选',
    '快捷筛选',
    '当前对象',
    '当前问题',
    '挂牌价',
    '市场成交位',
    '业主底线',
    '当前判断',
    '可做动作',
    '更多信息',
    '概况',
    '客户',
    '变化',
    '依据',
    '这套房卡在哪',
    '受阻动作',
    '执行清单',
  ],
  'cases',
);
expectExcludes(casesMarkup, ['市场雷达', '经营回看', '单房结果'], 'cases');

const opportunitiesMarkup = render(
  React.createElement(Opportunities, {
    state: world,
    onSelectCase: () => {},
    onSetView: () => {},
  }),
);

expectIncludes(
  opportunitiesMarkup,
  ['data-selling-houses-page="customers"', '客户', '分区', '已接上', '快成交', '掉线', '潜在', '已见过面', '只接上话'],
  'customers',
);
expectExcludes(opportunitiesMarkup, ['房源筛选', '市场雷达', '单房结果'], 'customers');

const profileMarkup = render(
  React.createElement(ProfilePanel, {
    state: world,
    currentUserNickname: 'preview',
  }),
);

expectIncludes(
  profileMarkup,
  [
    'data-selling-houses-page="profile"',
    '我的经营状态',
    '当前进度',
    '今日精力',
    '推广金',
    '在场房源',
    '活跃客户',
    '关系网络',
    '我现在在守谁、接着谁',
    '战绩与记录',
    '这局记录',
    '已成交',
    '平均信任',
  ],
  'profile',
);
expectExcludes(profileMarkup, ['单房结果', '市场雷达', '房源筛选'], 'profile');

console.log('selling-houses page responsibility contract verification passed');
