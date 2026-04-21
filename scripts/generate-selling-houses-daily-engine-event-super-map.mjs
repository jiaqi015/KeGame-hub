import fs from 'fs';
import path from 'path';

const width = 3840;
const height = 2160;

const outSvg = path.resolve('docs/assets/selling-houses-daily-engine-event-super-map-2026-04-21.svg');

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function linesText(x, y, lines, className, lineHeight = 22) {
  const safe = Array.isArray(lines) ? lines : [lines];
  return `<text class="${className}" x="${x}" y="${y}">${safe.map((line, index) => (
    `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`
  )).join('')}</text>`;
}

function panel({ x, y, w, h, title, kicker, note }) {
  return `
    <g filter="url(#panelShadow)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="34" fill="#171B16" fill-opacity="0.94" stroke="#4B6C52" stroke-width="2"/>
      ${kicker ? `<text class="kicker" x="${x + 38}" y="${y + 48}">${esc(kicker)}</text>` : ''}
      ${title ? `<text class="panelTitle" x="${x + 38}" y="${y + 92}">${esc(title)}</text>` : ''}
      ${note ? linesText(x + 38, y + 124, note, 'panelNote', 26) : ''}
    </g>
  `;
}

function box({ x, y, w, h, title, lines = [], fill = '#1F2A22', stroke = '#84D29A', dashed = false, badge = '' }) {
  return `
    <g filter="url(#boxShadow)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="${fill}" stroke="${stroke}" stroke-width="2" ${dashed ? 'stroke-dasharray="12 10"' : ''}/>
      ${badge ? `<rect x="${x + 18}" y="${y + 16}" width="${Math.max(84, badge.length * 14)}" height="24" rx="12" fill="${stroke}" fill-opacity="0.92"/>` : ''}
      ${badge ? `<text class="badgeDark" x="${x + 32}" y="${y + 33}">${esc(badge)}</text>` : ''}
      <text class="boxTitle" x="${x + 20}" y="${y + (badge ? 60 : 34)}">${esc(title)}</text>
      ${linesText(x + 20, y + (badge ? 88 : 62), lines, 'boxBody', 22)}
    </g>
  `;
}

function pill({ x, y, text, fill = '#84D29A', dark = true }) {
  const w = Math.max(92, text.length * 13 + 28);
  return `
    <rect x="${x}" y="${y}" width="${w}" height="26" rx="13" fill="${fill}" fill-opacity="0.95"/>
    <text class="${dark ? 'badgeDark' : 'badgeLight'}" x="${x + 14}" y="${y + 18}">${esc(text)}</text>
  `;
}

function arrow({ x1, y1, x2, y2, color = '#FFC58A', dash = false, marker = 'arrowGold', width: strokeWidth = 4 }) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${strokeWidth}" ${dash ? 'stroke-dasharray="12 10"' : ''} marker-end="url(#${marker})"/>`;
}

function bracket({ x, y, w, h, label }) {
  return `
    <path d="M${x} ${y} L${x - 12} ${y} L${x - 12} ${y + h} L${x} ${y + h}" stroke="#6F8F76" stroke-width="3" fill="none"/>
    <path d="M${x + w} ${y} L${x + w + 12} ${y} L${x + w + 12} ${y + h} L${x + w} ${y + h}" stroke="#6F8F76" stroke-width="3" fill="none"/>
    <text class="sectionLabel" x="${x + w / 2}" y="${y - 10}" text-anchor="middle">${esc(label)}</text>
  `;
}

const actionNames = [
  '首次面访',
  '周度反馈',
  '深度诊断',
  '精修卖点',
  '小红书推广',
  '经纪人投放',
  '私域转介绍',
  '开放日',
  '安排带看',
  '定价建议',
  '询问心理价',
  '商讨挂牌价调整',
  '建议参与诚意卖',
  '邀请和客户谈判',
];

const tickSteps = [
  ['01 updateMarkets', 'markets.demandHeat / supplyPressure / sentiment', '同步 case.marketPrice'],
  ['02 tickSeasonality', '月份因子加到 marketCell', '季节热度偏移'],
  ['03 rollDailyMarketEvent', '抽取 DailyMarketEvent', '先写 marketShadow.dailyMarketEvent'],
  ['04 applyDailyMarketEvent', 'heat_wave / rival inflow / company shift', '或转 inbound / signal'],
  ['05 tickRivalStores', '竞店 activityHeat 波动', '风格脉冲'],
  ['06 tickRivalListings', '竞品 listing freshness / status', '可能触发 case_lost_to_rival'],
  ['07 applyRivalPressure', '压 heat / trust / opportunity', '市场内同类盘分流'],
  ['08 tickCompanyPressure', 'sharedLeadPressure / referral chance', '组织内部分流'],
  ['09 applyCompanyPressure', 'shadow 线索降温 / 转客进入', '公司资源竞争'],
  ['10 updateCustomers', 'customer.activity / urgency 波动', '客户总体脉冲'],
  ['11 progressCustomerDemand', 'customerState.caseStates 重算', '可能反推新 opportunity'],
  ['12 applyRivalPullOnCustomers', '客户被竞品吸走注意力', 'comparing / churnRisk 上升'],
  ['13 tickOpportunities', 'daysLeft / intent / confidence / stage', '可能升阶段或流失'],
  ['14 applyCustomerFeedbackToCases', '客户反馈回灌 case', 'heat / trust / offers / case.stage'],
  ['15 tickCompetition', '竞争组联动 / 丢盘概率', '更像系统级守盘检查'],
  ['16 fireScheduledEvents', '剧本脚本事件入场', 'market / case / relation 外力'],
  ['17 settlePendingDealClosings', '报价桌结算', 'DealClosingEvaluation -> ClosedDealRecord'],
  ['18 tickCases', 'windowDays / trust / patience / urgency', '续窗或撤盘'],
  ['19 spawnPassiveLeads', '被动获客', '按 heat + d1 加厚池子'],
  ['20 triggerRandomEvent', '宏观 / 商圈随机事件', 'market_event'],
  ['21 settleMarketSignals', 'marketSignals 衰减/生成', 'ambient signal'],
  ['22 weekly branch', 'weeklyReview / weeklyBudget', '仅 state.day % 7 === 0'],
  ['23 updateDerivedState', 'updateCompetitiveness / riskFlags / matters', '重建 schedule/priorities'],
  ['24 finish / next day', '形成 DailyReport / lastDailyTickResult', 'day+1 / energy reset / focus cases'],
];

const eventKinds = [
  'journal',
  'action_executed',
  'budget_changed',
  'opportunity_advanced',
  'opportunity_closed',
  'case_sold',
  'case_withdrawn',
  'case_lost_to_rival',
  'window_extended',
  'market_event',
];

const targetTaxonomy = [
  'marketEvent.started / ended',
  'case.heat.changed / exposure.changed',
  'owner.anxiety.changed',
  'ownerCase.trust.changed / patience.changed / priceWindow.opened',
  'customer.activity.changed / fatigue.changed / urgency.changed',
  'relation.intent.changed / confidence.changed / stage.advanced / stagnated / lost',
  'price.marketEstimate.changed / ownerPsych.changed / pressure.changed',
  'goodHouse.d1.changed / d2.changed / d3.changed / score.changed',
  'deal.closed / relation.closed-by-deal / case.closed',
  'tick.invariant.warning / error',
];

const dirtyScopes = [
  'cases[]',
  'opportunities[]',
  'customers[]',
  'owners[]',
  'districts[]',
  'marketCells[]',
  'matters[]',
  'market:boolean',
  'dashboard:boolean',
  'result:boolean',
];

const erBoxes = [
  { title: 'GameState / World', lines: ['day / currentDate / rngState / rules', 'cases / opportunities / customers / markets', 'eventStore / closedDeals / matters / marketShadow'], x: 92, y: 96, w: 290, h: 110, badge: 'ROOT', fill: '#213225' },
  { title: 'MarketCell', lines: ['demandHeat / supplyPressure / competitivePressure', 'sentiment / monthlyFactors[]'], x: 420, y: 96, w: 250, h: 98, fill: '#1E2E2A' },
  { title: 'Case', lines: ['profile: district / layout / area / axisScores', 'runtime: askPrice / marketPrice / bottomPrice', 'trust / patience / urgency / heat / competitiveness', 'd1 / d2 / d3 / stage / status / snapshots[]'], x: 708, y: 78, w: 330, h: 156, fill: '#22352A' },
  { title: 'Opportunity', lines: ['caseId / customerId / channelId', 'fit / intent / confidence / stageIndex', 'status / lifecycleStatus / daysLeft', 'leadSource / visibility / pendingClosing*'], x: 1078, y: 88, w: 306, h: 140, fill: '#21312A' },
  { title: 'CustomerProfile', lines: ['budgetMin/max / targetDistrict / layouts[]', 'activity / urgency / priceSensitivity / preferences[]'], x: 1420, y: 96, w: 286, h: 110, fill: '#1E2F2B' },
  { title: 'CustomerRuntimeState', lines: ['status / decisionStyle / advisorTrust', 'fatigue / churnRisk / activeCaseIds[]', 'caseStates[caseId]'], x: 1738, y: 96, w: 286, h: 110, fill: '#1E2F2B' },
  { title: 'MatterEntry', lines: ['source / scene / template / presentation', 'stage / caseId / sourceKey / kind', 'openedAt / updatedAt / resolvedAt'], x: 2062, y: 96, w: 264, h: 112, fill: '#21312A' },
  { title: 'DomainEventEntry', lines: ['kind / actor / title / detail / tone', 'caseId? / opportunityId? / customerId?', 'payload{} / day / date'], x: 2362, y: 96, w: 294, h: 114, fill: '#263225' },
  { title: 'ClosedDealRecord', lines: ['caseId / customerId / sourceRelationId', 'dealPrice / closeReadiness / closeProbability', 'marketSnapshot / priceSnapshot'], x: 2690, y: 96, w: 306, h: 114, fill: '#283621' },
  { title: 'ShadowMarketState', lines: ['rivalStores[] / rivalListings[]', 'companyPressure / marketSignals[]', 'dailyMarketEvent / inboundQueue[]'], x: 3030, y: 96, w: 290, h: 114, fill: '#24312B' },
  { title: 'DailyTickResult', lines: ['day / nextDay / report', 'emittedEvents[] / closedDeals[]', 'dirtyScopes / invariantAlerts[]'], x: 3354, y: 96, w: 286, h: 110, fill: '#2E3121' },
];

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="220" y1="80" x2="3600" y2="2120" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0C110D"/>
      <stop offset="0.48" stop-color="#0F1611"/>
      <stop offset="1" stop-color="#131A15"/>
    </linearGradient>
    <radialGradient id="glow1" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(460 260) rotate(18) scale(980 760)">
      <stop stop-color="#92FFB8" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#92FFB8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(3040 320) rotate(20) scale(1140 680)">
      <stop stop-color="#B8F9FF" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#B8F9FF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow3" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1980 1890) rotate(-10) scale(1440 780)">
      <stop stop-color="#FFC58A" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#FFC58A" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
      <path d="M44 0L0 0 0 44" stroke="#D6F4DD" stroke-opacity="0.05" stroke-width="1"/>
    </pattern>
    <filter id="panelShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#000000" flood-opacity="0.32"/>
    </filter>
    <filter id="boxShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000000" flood-opacity="0.26"/>
    </filter>
    <marker id="arrowGold" markerWidth="16" markerHeight="16" refX="12" refY="6" orient="auto">
      <path d="M0 0L12 6L0 12Z" fill="#FFC58A"/>
    </marker>
    <marker id="arrowLight" markerWidth="16" markerHeight="16" refX="12" refY="6" orient="auto">
      <path d="M0 0L12 6L0 12Z" fill="#D9ECFF"/>
    </marker>
    <marker id="arrowGreen" markerWidth="16" markerHeight="16" refX="12" refY="6" orient="auto">
      <path d="M0 0L12 6L0 12Z" fill="#84D29A"/>
    </marker>
    <style>
      .title {
        fill: #F8FFF9;
        font-family: "Avenir Next", "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif;
        font-size: 72px;
        font-weight: 700;
        letter-spacing: -0.05em;
      }
      .subtitle {
        fill: #C8D8CC;
        font-family: "Avenir Next", "PingFang SC", sans-serif;
        font-size: 28px;
        font-weight: 500;
      }
      .kicker {
        fill: #FFC58A;
        font-family: "Avenir Next", sans-serif;
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 0.18em;
      }
      .panelTitle {
        fill: #F7FFF9;
        font-family: "Avenir Next", "PingFang SC", sans-serif;
        font-size: 34px;
        font-weight: 700;
        letter-spacing: -0.03em;
      }
      .panelNote {
        fill: #B7CABC;
        font-family: "Avenir Next", "PingFang SC", sans-serif;
        font-size: 20px;
        font-weight: 500;
      }
      .boxTitle {
        fill: #FAFFF9;
        font-family: "Avenir Next", "PingFang SC", sans-serif;
        font-size: 22px;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      .boxBody {
        fill: #D4E2D8;
        font-family: "Avenir Next", "PingFang SC", sans-serif;
        font-size: 16px;
        font-weight: 500;
      }
      .badgeDark {
        fill: #0E1610;
        font-family: "Avenir Next", sans-serif;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.08em;
      }
      .badgeLight {
        fill: #F8FFF9;
        font-family: "Avenir Next", sans-serif;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.08em;
      }
      .sectionLabel {
        fill: #90B39B;
        font-family: "Avenir Next", sans-serif;
        font-size: 15px;
        font-weight: 800;
        letter-spacing: 0.08em;
      }
      .legend {
        fill: #F4FFF6;
        font-family: "Avenir Next", "PingFang SC", sans-serif;
        font-size: 18px;
        font-weight: 600;
      }
      .small {
        fill: #BFD0C2;
        font-family: "Avenir Next", "PingFang SC", sans-serif;
        font-size: 14px;
        font-weight: 500;
      }
    </style>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#grid)"/>
  <rect width="${width}" height="${height}" fill="url(#glow1)"/>
  <rect width="${width}" height="${height}" fill="url(#glow2)"/>
  <rect width="${width}" height="${height}" fill="url(#glow3)"/>

  <g>
    <text class="title" x="86" y="102">我是王牌资产管理顾问 · 全景 ER + 日结引擎 + 事件系统超级总图</text>
    <text class="subtitle" x="86" y="146">重点补齐：每日到引擎、事件产生、事件类型、好房模型、Dirty Scope、Projection、正式成交事实</text>
    <text class="subtitle" x="86" y="184">收口依据：2026-04-21 当前代码与设计文档并排对齐。实线 = 当前代码主链，虚线 = 文档已定义但尚未完全细粒度落地。</text>
    <rect x="2960" y="56" width="776" height="150" rx="26" fill="#162019" fill-opacity="0.92" stroke="#45634C" stroke-width="2"/>
    ${arrow({ x1: 2998, y1: 98, x2: 3086, y2: 98, color: '#FFC58A', marker: 'arrowGold' })}
    <text class="legend" x="3112" y="105">当前代码真实链路</text>
    ${arrow({ x1: 2998, y1: 136, x2: 3086, y2: 136, color: '#D9ECFF', marker: 'arrowLight', dash: true })}
    <text class="legend" x="3112" y="143">文档目标事件粒度 / 后续迁移口径</text>
    ${pill({ x: 2998, y: 164, text: 'MODEL', fill: '#84D29A' })}
    <text class="legend" x="3110" y="181">评估器或投影，不是原始世界真相</text>
  </g>

  ${panel({
    x: 42, y: 232, w: 838, h: 552,
    kicker: 'PLAYER / APP LAYER',
    title: '玩家入口与应用承接',
    note: [
      '这不是单纯前端页面图。这里把“玩家动作怎么进入引擎、引擎结果怎么回到页面和持久化”完整挂上去。',
      '当前核心承接：SellingHousesWorkspace -> useGame -> transitionGameState -> executeAction / advanceDays -> saveGameState / cloud sync。',
    ],
  })}

  ${box({ x: 84, y: 386, w: 176, h: 112, title: 'SellingHousesWorkspace', lines: ['overview / cases / customers', 'market / review / results / profile'], badge: 'UI', fill: '#24352B' })}
  ${box({ x: 292, y: 386, w: 150, h: 112, title: 'useGame', lines: ['hydrate / resume', 'start run / sync'], badge: 'HOOK', fill: '#23342A' })}
  ${box({ x: 474, y: 386, w: 156, h: 112, title: 'gameTransitions', lines: ['cloneGameState', 'advanceGameDays', 'executeGameAction'], badge: 'APP', fill: '#233127' })}
  ${box({ x: 662, y: 386, w: 176, h: 112, title: 'Local + Cloud Save', lines: ['saveGameState', 'maintainer_run', 'conflict hydrate'], badge: 'SAVE', fill: '#243025' })}
  ${arrow({ x1: 260, y1: 442, x2: 292, y2: 442 })}
  ${arrow({ x1: 442, y1: 442, x2: 474, y2: 442 })}
  ${arrow({ x1: 630, y1: 442, x2: 662, y2: 442 })}

  ${box({ x: 84, y: 542, w: 350, h: 188, title: '页面职责', lines: [
    'Dashboard: 今日优先级 + 事件流 + triage',
    'Cases: 房源经营 + 行动入口 + case detail',
    'Opportunities: 只看客户线推进',
    'Market: 商圈/竞品/信号/受影响房源',
    'Review: 昨日摘要 + turning points',
    'Results: 正式结算结果，不吃局内预估分',
  ], fill: '#1F2B24' })}
  ${box({ x: 468, y: 542, w: 370, h: 188, title: '应用层关键对象', lines: [
    'playerContext: accountId / playerProfileId / storageScope',
    'scenarioOpening: 剧本解析 / generated opening / snapshot',
    'buildWorkspaceShellProjection / buildOperatingProjection',
    'resultProjection / reviewProjection / leaderboardProjection',
    '平台存储: NeonGameRunRepository / FileMaintainerRunRepository',
  ], fill: '#1F2B24' })}

  ${panel({
    x: 904, y: 232, w: 2920, h: 484,
    kicker: 'WORLD ER + CORE FACTS',
    title: '世界层 ER 与正式事实层',
    note: [
      '核心原则：GameState/World 是真相，Projection 是读模型。Case / Opportunity / CustomerState / MarketShadow / EventStore / ClosedDealRecord 构成当前运行骨架。',
      'OwnershipEntrust / BrokerOwnerRelation / 更细粒度事件 taxonomy 已在文档口径里明确，但当前代码仍以内嵌 case 字段和 opportunity 为主。',
    ],
  })}

  ${erBoxes.map((item) => box(item)).join('\n')}
  ${arrow({ x1: 382, y1: 146, x2: 420, y2: 146, color: '#84D29A', marker: 'arrowGreen', width: 3 })}
  ${arrow({ x1: 670, y1: 146, x2: 708, y2: 146, color: '#84D29A', marker: 'arrowGreen', width: 3 })}
  ${arrow({ x1: 1038, y1: 146, x2: 1078, y2: 146, color: '#84D29A', marker: 'arrowGreen', width: 3 })}
  ${arrow({ x1: 1384, y1: 146, x2: 1420, y2: 146, color: '#84D29A', marker: 'arrowGreen', width: 3 })}
  ${arrow({ x1: 1706, y1: 146, x2: 1738, y2: 146, color: '#84D29A', marker: 'arrowGreen', width: 3 })}
  ${arrow({ x1: 2024, y1: 146, x2: 2062, y2: 146, color: '#84D29A', marker: 'arrowGreen', width: 3 })}
  ${arrow({ x1: 2326, y1: 146, x2: 2362, y2: 146, color: '#84D29A', marker: 'arrowGreen', width: 3 })}
  ${arrow({ x1: 2656, y1: 146, x2: 2690, y2: 146, color: '#84D29A', marker: 'arrowGreen', width: 3 })}
  ${arrow({ x1: 2996, y1: 146, x2: 3030, y2: 146, color: '#84D29A', marker: 'arrowGreen', width: 3 })}
  ${arrow({ x1: 3320, y1: 146, x2: 3354, y2: 146, color: '#84D29A', marker: 'arrowGreen', width: 3 })}
  ${arrow({ x1: 2310, y1: 244, x2: 2440, y2: 244, color: '#D9ECFF', marker: 'arrowLight', dash: true })}
  ${linesText(2454, 250, ['文档目标：Owner / OwnershipEntrust / BrokerOwnerRelation', '后续应从 case 内嵌字段拆出'], 'small', 18)}

  ${panel({
    x: 42, y: 808, w: 1090, h: 1270,
    kicker: 'DAYTIME ACTION PATH',
    title: '白天即时动作链',
    note: [
      '白天不是跑全世界，而是围绕一个 case 局部更新。动作入口来自 Cases 页面，落点在 actionResolvers。',
      '动作普遍同时改 4 层：case 字段、opportunity/customerState、budget/auxiliary、eventLog/eventStore。最后统一 updateDerivedState。',
    ],
  })}

  ${box({ x: 84, y: 962, w: 200, h: 120, title: 'Cases 页面', lines: ['选中房源', '动作按钮 / 策略 option'], badge: 'UI', fill: '#23352A' })}
  ${box({ x: 318, y: 962, w: 196, h: 120, title: 'getActionAvailability', lines: ['精力/推广金/冷却', 'owner touch / stage 门槛'], badge: 'GATE', fill: '#2A3022' })}
  ${box({ x: 548, y: 962, w: 184, h: 120, title: 'executeAction', lines: ['spendResources', '分发 executor'], badge: 'ENTRY', fill: '#24322A' })}
  ${box({ x: 766, y: 962, w: 320, h: 120, title: 'Action Executors / actionResolvers', lines: ['first-visit / weekly-feedback / deep-diagnosis', 'story / xiaohongshu / broker-broadcast / private-referral', 'open-day / showing / pricing-advice / adjust-listing-price', 'sincerity-sale / invite-customer-negotiation'], badge: 'CORE', fill: '#253827' })}
  ${arrow({ x1: 284, y1: 1022, x2: 318, y2: 1022 })}
  ${arrow({ x1: 514, y1: 1022, x2: 548, y2: 1022 })}
  ${arrow({ x1: 732, y1: 1022, x2: 766, y2: 1022 })}

  ${box({ x: 84, y: 1114, w: 476, h: 198, title: '动作直接改写的运行时状态', lines: [
    'Case: trust / patience / urgency / heat / askPrice / bottomPrice / windowDays / openDayCooldown / viewings / offers',
    'Opportunity: intent / confidence / stageIndex / touchedToday / visibility / pendingClosing*',
    'CustomerState: advisorTrust / lastTouchDay / lastActionNote / caseStates[caseId]',
    'Budget/Aux: promotionBudget / wordOfMouth / commission / soldCount / withdrawnCount',
  ], fill: '#1E2C24' })}
  ${box({ x: 592, y: 1114, w: 494, h: 198, title: '动作伴随事件', lines: [
    'logEvent(...) -> EventLogEntry + recordDomainEvent(kind=journal)',
    'action_executed: 每次成功动作额外结构化写一条',
    'budget_changed: spend/refund/rebate 独立入账',
    '谈判动作只 queueDealClosingEvaluation，不在白天直接成交',
  ], fill: '#1F2D26' })}

  ${arrow({ x1: 548, y1: 1188, x2: 592, y2: 1188, color: '#84D29A', marker: 'arrowGreen' })}
  ${box({ x: 84, y: 1344, w: 1002, h: 232, title: '动作库全量', lines: [
    `当前动作共 ${actionNames.length} 个：${actionNames.slice(0, 5).join(' / ')}`,
    `${actionNames.slice(5, 10).join(' / ')}`,
    `${actionNames.slice(10).join(' / ')}`,
    '分类维度：面访反馈 / 营销推广 / 定价建议 / 斡旋谈判',
    '动作真正的意义不是按钮，而是把 owner side、customer side、pricing side、resource side 联动起来。',
  ], fill: '#1D2A24' })}

  ${box({ x: 84, y: 1610, w: 476, h: 176, title: 'updateDerivedState', lines: [
    'updateCompetitiveness -> d1 / d2 / d3 / competitiveness',
    'deriveRiskFlags / deriveStorylineState',
    'deriveSchedule / derivePriorities / deriveMatters / deriveMetrics',
    '同步 selectedCase / 排序 opportunities',
  ], badge: 'AFTER ACTION', fill: '#253029' })}
  ${box({ x: 592, y: 1610, w: 494, h: 176, title: '白天动作的本质', lines: [
    '它是“局部即时更新”，不是跑全局市场模拟。',
    '但动作已经会写入 eventStore，所以复盘与结果页能用事件流解释发生过什么。',
    '这也是为什么 eventStore 不能只做 UI 日志，它已经是结果归因的基础输入之一。',
  ], fill: '#202B24' })}

  ${panel({
    x: 1158, y: 744, w: 1544, h: 1334,
    kicker: 'NIGHTLY DAILY TICK',
    title: '夜间日结引擎 resolveOneDay 全序列',
    note: [
      '这是你指出缺的地方：不是“有个 daily tick”就完，而是要把引擎推进顺序、每一步改什么、哪里产生事件、哪里改变事实，都完整挂出来。',
      '当前真实顺序直接来自 src/selling-houses/domain/engine.ts。下面 24 个步骤是当前代码里的执行链，不是猜的。',
    ],
  })}

  ${bracket({ x: 1200, y: 878, w: 1420, h: 1048, label: 'resolveOneDay(state) current sequence' })}
  ${tickSteps.map((step, index) => {
    const col = index < 8 ? 0 : index < 16 ? 1 : 2;
    const row = index % 8;
    const x = 1226 + col * 456;
    const y = 908 + row * 124;
    return box({
      x,
      y,
      w: 412,
      h: 102,
      title: step[0],
      lines: [step[1], step[2]],
      fill: col === 0 ? '#223228' : col === 1 ? '#24302B' : '#2A2F22',
      stroke: col === 2 ? '#FFC58A' : '#84D29A',
    });
  }).join('\n')}

  ${arrow({ x1: 1638, y1: 959, x2: 1682, y2: 959 })}
  ${arrow({ x1: 1638, y1: 1083, x2: 1682, y2: 1083 })}
  ${arrow({ x1: 1638, y1: 1207, x2: 1682, y2: 1207 })}
  ${arrow({ x1: 1638, y1: 1331, x2: 1682, y2: 1331 })}
  ${arrow({ x1: 1638, y1: 1455, x2: 1682, y2: 1455 })}
  ${arrow({ x1: 1638, y1: 1579, x2: 1682, y2: 1579 })}
  ${arrow({ x1: 1638, y1: 1703, x2: 1682, y2: 1703 })}
  ${arrow({ x1: 1638, y1: 1827, x2: 1682, y2: 1827 })}

  ${arrow({ x1: 2094, y1: 959, x2: 2138, y2: 959 })}
  ${arrow({ x1: 2094, y1: 1083, x2: 2138, y2: 1083 })}
  ${arrow({ x1: 2094, y1: 1207, x2: 2138, y2: 1207 })}
  ${arrow({ x1: 2094, y1: 1331, x2: 2138, y2: 1331 })}
  ${arrow({ x1: 2094, y1: 1455, x2: 2138, y2: 1455 })}
  ${arrow({ x1: 2094, y1: 1579, x2: 2138, y2: 1579 })}
  ${arrow({ x1: 2094, y1: 1703, x2: 2138, y2: 1703 })}
  ${arrow({ x1: 2094, y1: 1827, x2: 2138, y2: 1827 })}

  ${box({ x: 1210, y: 1948, w: 710, h: 110, title: 'DailyTickResult 输出', lines: [
    'day / nextDay / report / emittedEvents[] / closedDeals[]',
    'dirtyScopes / invariantAlerts[] / state.lastDailyTickResult',
  ], badge: 'OUTPUT', fill: '#253327' })}
  ${box({ x: 1952, y: 1948, w: 718, h: 110, title: '次日准备动作', lines: [
    'finishGame? -> finalResult',
    '否则 day+1 / currentDate+1 / maxEnergy reset / Thursday focus cases / currentReport 构造',
  ], badge: 'NEXT DAY', fill: '#2D3022' })}

  ${panel({
    x: 2724, y: 744, w: 1100, h: 1334,
    kicker: 'EVENT SYSTEM',
    title: '事件产生、事件类型、事实沉淀',
    note: [
      '这里明确区分三层：UI 短日志 eventLog；结构化 eventStore；正式结果事实 closedDeals / finalResult。',
      '你点名的“每日到引擎推动事件产生、事件类型”这次都落这里。',
    ],
  })}

  ${box({ x: 2764, y: 886, w: 310, h: 122, title: 'eventLog', lines: ['UI 日志流', '最多 120 条', '每条 logEvent 都会双写 journal'], badge: 'UI LOG', fill: '#23322A' })}
  ${box({ x: 3102, y: 886, w: 324, h: 122, title: 'recordDomainEvent', lines: ['kind / actor / title / detail / payload', 'unshift 到 eventStore'], badge: 'DOMAIN EVENT', fill: '#253029' })}
  ${box({ x: 3454, y: 886, w: 326, h: 122, title: 'eventStore', lines: ['结构化事件流', '结果页/复盘/dirty scope/归因消费'], badge: 'EVENT STORE', fill: '#283126' })}
  ${arrow({ x1: 3074, y1: 946, x2: 3102, y2: 946, color: '#84D29A', marker: 'arrowGreen' })}
  ${arrow({ x1: 3426, y1: 946, x2: 3454, y2: 946, color: '#84D29A', marker: 'arrowGreen' })}

  ${box({ x: 2764, y: 1038, w: 510, h: 286, title: '当前代码已落地 DomainEventKind', lines: eventKinds.map((item) => `• ${item}`), fill: '#1E2C24' })}
  ${box({ x: 3298, y: 1038, w: 482, h: 286, title: '文档目标细粒度 taxonomy', lines: targetTaxonomy.map((item) => `• ${item}`), fill: '#1F2925', dashed: true, stroke: '#D9ECFF' })}

  ${box({ x: 2764, y: 1356, w: 510, h: 218, title: '事件主要来源点', lines: [
    'logEvent: 所有 UI/journal 事件入口',
    'executeAction: action_executed',
    'recordBudgetChange: budget_changed',
    'tickOpportunities: opportunity_advanced / closeOpportunity -> opportunity_closed',
    'dealClosing: case_sold',
    'withdrawCase / loseCaseToRival / tickCases: case_withdrawn / case_lost_to_rival / window_extended',
    'eventEngine / scripted events: market_event',
  ], fill: '#1E2B23' })}
  ${box({ x: 3298, y: 1356, w: 482, h: 218, title: '正式事实层', lines: [
    'ClosedDealRecord: 成交事实，不混在 DailyReport',
    'FinalResult / RunResult: 正式结算，不吃局内预估分',
    '结果页只消费正式结算结果，排行榜也只看正式结果',
  ], fill: '#2A2F22' })}

  ${box({ x: 2764, y: 1606, w: 1016, h: 182, title: 'DirtyScopeSet 与投影失效范围', lines: [
    dirtyScopes.join(' / '),
    'buildDirtyScopes 会从 emittedEvents、closedDeals、matters 三个来源推导受影响对象。',
    '这意味着事件不只是叙事，还承担 projection invalidation 的最小增量刷新依据。',
  ], badge: 'INVALIDATION', fill: '#203028' })}

  ${box({ x: 2764, y: 1820, w: 1016, h: 212, title: 'Invariant Alerts', lines: [
    'duplicate_closed_deal',
    'active_opportunity_after_case_closed',
    'opportunity_stage_out_of_range',
    'negative_window_days',
    '当前只是第一版守门。文档里要求的“已关闭 matter 还写事件 / 价格关系自相矛盾 / stage 非法跳跃”后续可继续补。',
  ], badge: 'CHECK', fill: '#2A2620', stroke: '#FFC58A' })}

  ${panel({
    x: 904, y: 1608, w: 1166, h: 470,
    kicker: 'GOOD HOUSE MODEL',
    title: '好房模型：文档定义 vs 当前实现',
    note: [
      '这里特意分成上下两层：上面是设计文档想表达的业务意义，下面是 scoring.ts + balance.ts 当前真实公式。',
      '重点不是评判谁对，而是避免“页面说一套、代码算一套”。',
    ],
  })}

  ${box({ x: 944, y: 1750, w: 532, h: 272, title: '文档业务定义', lines: [
    'D1 = 准客池厚度：预算覆盖 / 需求匹配 / 平台匹配规模 / 有效关系量 / 关系质量 / 注意力稳定度',
    'D2 = 房屋吸引力：区域吸引力 / 房型适销性 / 产品力 / 卖点强度 / 曝光到访 / 缺点与竞品惩罚',
    'D3 = 业主意愿：信任 / 耐心 / 紧迫度 / 价格松动度 / 配合度 / 路线认同度',
    '综合分建议：0.40*D1 + 0.35*D2 + 0.25*D3',
  ], dashed: true, stroke: '#D9ECFF', fill: '#1F2925' })}
  ${box({ x: 1514, y: 1750, w: 516, h: 272, title: '当前 scoring.ts 实现', lines: [
    'Competitiveness = 0.50*D1 + 0.25*D2 + 0.25*D3',
    'D1: poolSize / activeContacts / funnel late-stage thickness / advanceSpeed - stagnationRisk',
    'D2: axisScores(layout/light/floor/decor/amenity/neighborhood/structure) 按权重求和',
    'D3: priceFlex / patience / urgency / recentCooperation(trust代理) / consistencyBaseline',
  ], badge: 'CURRENT CODE', fill: '#223328' })}

  ${box({ x: 944, y: 2036, w: 1086, h: 78, title: '关键理解', lines: [
    '当前实现里 D1 更偏“机会漏斗厚度”，D2 更偏“房屋静态轴分”，D3 更偏“业主配合度 + 价格弹性”。如果后续要完全贴文档，需要继续把平台匹配规模、缺点惩罚、路线认同等因子补进来。',
  ], fill: '#1E2A24' })}

  ${panel({
    x: 2094, y: 1608, w: 592, h: 470,
    kicker: 'PROJECTION LAYER',
    title: '页面投影与视图职责',
    note: [
      '这一层回答的是：事件和事实产生后，页面真正看见的是什么。',
      '当前投影主干：buildOperatingProjection / buildWorkspaceShellProjection / buildReviewProjection / buildResultProjection。',
    ],
  })}

  ${box({ x: 2134, y: 1750, w: 240, h: 254, title: 'Dashboard', lines: ['todayPriority', 'yesterdayIntel', 'marketBrief', 'triageCards', 'resourceSnapshot'], fill: '#24352A' })}
  ${box({ x: 2404, y: 1750, w: 242, h: 254, title: 'Cases / Opportunities', lines: ['case detail', 'customerPoolSummary', 'factChain', 'bucket summaries'], fill: '#24352A' })}
  ${box({ x: 2134, y: 2030, w: 240, h: 150, title: 'Market / Review', lines: ['signalFeed', 'districtBoards', 'dailyBrief', 'turning points'], fill: '#24352A' })}
  ${box({ x: 2404, y: 2030, w: 242, h: 150, title: 'Results', lines: ['hero / summaryCards', 'settlementNotes', 'tierGroups', 'careerNotes'], fill: '#2B3022' })}

  ${panel({
    x: 42, y: 86, w: 780, h: 118,
    kicker: 'THIS MAP',
    title: '怎么看这张图',
    note: [
      '左下看白天动作，中央看夜间日结顺序，右侧看事件/事实/dirty scope，底部看好房模型和投影。',
      '如果后续你要继续补程序设计，这张图基本就是“开发主骨架”。',
    ],
  })}

  ${arrow({ x1: 844, y1: 1080, x2: 1140, y2: 1080, color: '#FFC58A', marker: 'arrowGold', width: 5 })}
  ${linesText(892, 1060, ['白天动作沉淀到 world，', '晚上统一进 resolveOneDay'], 'legend', 18)}
  ${arrow({ x1: 2710, y1: 1398, x2: 2750, y2: 1398, color: '#84D29A', marker: 'arrowGreen', width: 4 })}
  ${linesText(2560, 1378, ['日结每一步都可能写事件，', '但只有正式事实才进入 closedDeals / finalResult'], 'legend', 18)}

  <text class="small" x="86" y="2140">Generated from current code/doc alignment for 卖房 / 资产顾问 workspace · 4K editable SVG source retained for later expansion.</text>
</svg>`;

fs.writeFileSync(outSvg, svg, 'utf8');
console.log(`Wrote ${outSvg}`);
