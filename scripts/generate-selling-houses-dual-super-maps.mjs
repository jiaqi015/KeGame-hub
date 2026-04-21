import fs from 'fs';
import path from 'path';

const WIDTH = 3840;
const HEIGHT = 2160;

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textLines(x, y, lines, className, lineHeight = 22) {
  const items = Array.isArray(lines) ? lines : [lines];
  return `<text class="${className}" x="${x}" y="${y}">${items.map((line, index) => (
    `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`
  )).join('')}</text>`;
}

function baseDefs() {
  return `
    <defs>
      <linearGradient id="bg" x1="180" y1="40" x2="3620" y2="2120" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#0B110D"/>
        <stop offset="0.48" stop-color="#101813"/>
        <stop offset="1" stop-color="#141E17"/>
      </linearGradient>
      <radialGradient id="glowA" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(520 260) rotate(16) scale(1040 760)">
        <stop stop-color="#97F7B5" stop-opacity="0.16"/>
        <stop offset="1" stop-color="#97F7B5" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glowB" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(3120 300) rotate(18) scale(1180 760)">
        <stop stop-color="#B6F5FF" stop-opacity="0.10"/>
        <stop offset="1" stop-color="#B6F5FF" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glowC" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(2040 1840) rotate(-10) scale(1460 820)">
        <stop stop-color="#FFC991" stop-opacity="0.14"/>
        <stop offset="1" stop-color="#FFC991" stop-opacity="0"/>
      </radialGradient>
      <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
        <path d="M44 0L0 0 0 44" stroke="#D3F1D9" stroke-opacity="0.05" stroke-width="1"/>
      </pattern>
      <filter id="panelShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#000000" flood-opacity="0.34"/>
      </filter>
      <filter id="boxShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000000" flood-opacity="0.26"/>
      </filter>
      <marker id="arrowGold" markerWidth="16" markerHeight="16" refX="12" refY="6" orient="auto">
        <path d="M0 0L12 6L0 12Z" fill="#FFC991"/>
      </marker>
      <marker id="arrowMint" markerWidth="16" markerHeight="16" refX="12" refY="6" orient="auto">
        <path d="M0 0L12 6L0 12Z" fill="#85D29A"/>
      </marker>
      <marker id="arrowIce" markerWidth="16" markerHeight="16" refX="12" refY="6" orient="auto">
        <path d="M0 0L12 6L0 12Z" fill="#D8ECFF"/>
      </marker>
      <style>
        .title {
          fill: #F7FFF8;
          font-family: "Avenir Next", "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif;
          font-size: 68px;
          font-weight: 700;
          letter-spacing: -0.05em;
        }
        .subtitle {
          fill: #C6D5C9;
          font-family: "Avenir Next", "PingFang SC", sans-serif;
          font-size: 27px;
          font-weight: 500;
        }
        .kicker {
          fill: #FFC991;
          font-family: "Avenir Next", sans-serif;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 0.18em;
        }
        .panelTitle {
          fill: #F8FFF8;
          font-family: "Avenir Next", "PingFang SC", sans-serif;
          font-size: 34px;
          font-weight: 700;
          letter-spacing: -0.03em;
        }
        .panelNote {
          fill: #B7C8BA;
          font-family: "Avenir Next", "PingFang SC", sans-serif;
          font-size: 20px;
          font-weight: 500;
        }
        .boxTitle {
          fill: #F8FFF8;
          font-family: "Avenir Next", "PingFang SC", sans-serif;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.02em;
        }
        .boxBody {
          fill: #D8E5DA;
          font-family: "Avenir Next", "PingFang SC", sans-serif;
          font-size: 16px;
          font-weight: 500;
        }
        .small {
          fill: #BED0C1;
          font-family: "Avenir Next", "PingFang SC", sans-serif;
          font-size: 14px;
          font-weight: 500;
        }
        .badgeDark {
          fill: #0B120D;
          font-family: "Avenir Next", sans-serif;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }
        .legend {
          fill: #F4FFF5;
          font-family: "Avenir Next", "PingFang SC", sans-serif;
          font-size: 18px;
          font-weight: 600;
        }
        .sectionLabel {
          fill: #90B59B;
          font-family: "Avenir Next", sans-serif;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }
        .linkLabel {
          fill: #DCE9DE;
          font-family: "Avenir Next", "PingFang SC", sans-serif;
          font-size: 14px;
          font-weight: 600;
        }
      </style>
    </defs>
  `;
}

function canvas(title, subtitle1, subtitle2, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${baseDefs()}
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glowA)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glowB)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glowC)"/>
  <text class="title" x="84" y="100">${esc(title)}</text>
  <text class="subtitle" x="84" y="144">${esc(subtitle1)}</text>
  <text class="subtitle" x="84" y="180">${esc(subtitle2)}</text>
  ${body}
  <text class="small" x="84" y="2138">Generated for 卖房 / 资产顾问 workspace on 2026-04-21 · 4K editable SVG retained for regeneration.</text>
</svg>`;
}

function panel({ x, y, w, h, kicker, title, note }) {
  return `
    <g filter="url(#panelShadow)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="34" fill="#161C17" fill-opacity="0.94" stroke="#45624C" stroke-width="2"/>
      ${kicker ? `<text class="kicker" x="${x + 36}" y="${y + 48}">${esc(kicker)}</text>` : ''}
      ${title ? `<text class="panelTitle" x="${x + 36}" y="${y + 92}">${esc(title)}</text>` : ''}
      ${note ? textLines(x + 36, y + 124, note, 'panelNote', 26) : ''}
    </g>
  `;
}

function box({ x, y, w, h, title, lines = [], fill = '#223229', stroke = '#85D29A', dashed = false, badge = '' }) {
  const badgeW = Math.max(88, badge.length * 14 + 22);
  return `
    <g filter="url(#boxShadow)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${fill}" stroke="${stroke}" stroke-width="2" ${dashed ? 'stroke-dasharray="12 10"' : ''}/>
      ${badge ? `<rect x="${x + 18}" y="${y + 14}" width="${badgeW}" height="24" rx="12" fill="${stroke}" fill-opacity="0.95"/>` : ''}
      ${badge ? `<text class="badgeDark" x="${x + 30}" y="${y + 31}">${esc(badge)}</text>` : ''}
      <text class="boxTitle" x="${x + 18}" y="${y + (badge ? 58 : 34)}">${esc(title)}</text>
      ${textLines(x + 18, y + (badge ? 84 : 62), lines, 'boxBody', 21)}
    </g>
  `;
}

function arrow({ x1, y1, x2, y2, color = '#FFC991', dash = false, marker = 'arrowGold', width = 4 }) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${dash ? 'stroke-dasharray="12 10"' : ''} marker-end="url(#${marker})"/>`;
}

function label(x, y, value) {
  return `<text class="linkLabel" x="${x}" y="${y}">${esc(value)}</text>`;
}

function pill(x, y, text, fill = '#85D29A') {
  const w = Math.max(92, text.length * 13 + 28);
  return `
    <rect x="${x}" y="${y}" width="${w}" height="26" rx="13" fill="${fill}" fill-opacity="0.95"/>
    <text class="badgeDark" x="${x + 14}" y="${y + 18}">${esc(text)}</text>
  `;
}

function bracket({ x, y, w, h, labelText }) {
  return `
    <path d="M${x} ${y} L${x - 12} ${y} L${x - 12} ${y + h} L${x} ${y + h}" stroke="#6E9077" stroke-width="3" fill="none"/>
    <path d="M${x + w} ${y} L${x + w + 12} ${y} L${x + w + 12} ${y + h} L${x + w} ${y + h}" stroke="#6E9077" stroke-width="3" fill="none"/>
    <text class="sectionLabel" x="${x + w / 2}" y="${y - 10}" text-anchor="middle">${esc(labelText)}</text>
  `;
}

function buildErMap() {
  const body = `
    <rect x="2942" y="54" width="790" height="148" rx="24" fill="#152019" fill-opacity="0.92" stroke="#46644D" stroke-width="2"/>
    ${arrow({ x1: 2982, y1: 96, x2: 3070, y2: 96, color: '#FFC991', marker: 'arrowGold' })}
    <text class="legend" x="3098" y="103">当前代码已形成的实体 / 关系</text>
    ${arrow({ x1: 2982, y1: 136, x2: 3070, y2: 136, color: '#D8ECFF', marker: 'arrowIce', dash: true })}
    <text class="legend" x="3098" y="143">文档已定义、但仍待继续拆分的正式实体</text>
    ${pill(2982, 162, 'MODEL')}
    <text class="legend" x="3094" y="179">评估器或投影，不应混成原始世界字段</text>

    ${panel({
      x: 42, y: 230, w: 920, h: 512,
      kicker: 'ACTOR / ORG',
      title: '角色、组织、视角绑定',
      note: [
        '玩家不是直接操作数据库记录，而是绑定到“经纪人/资产顾问”视角进入 world。',
        '组织层、角色层、房源经营层要分开，否则后续同世界多视角玩法会纠缠。',
      ],
    })}
    ${box({ x: 82, y: 382, w: 180, h: 110, title: 'Player', lines: ['accountId', 'playerProfileId', 'workspace identity'], badge: 'VIEWER', fill: '#23352B' })}
    ${box({ x: 300, y: 382, w: 192, h: 110, title: 'Broker Actor', lines: ['maintainerName', 'resource owner', 'action executor'], badge: 'ROLE', fill: '#24352A' })}
    ${box({ x: 530, y: 382, w: 184, h: 110, title: 'Owner', lines: ['ownerName', 'ownerArchetype', 'sell intent'], badge: 'ROLE', fill: '#243129' })}
    ${box({ x: 752, y: 382, w: 166, h: 110, title: 'Customer', lines: ['profile', 'budget', 'district intent'], badge: 'ROLE', fill: '#243129' })}
    ${arrow({ x1: 262, y1: 436, x2: 300, y2: 436, color: '#85D29A', marker: 'arrowMint' })}
    ${arrow({ x1: 492, y1: 436, x2: 530, y2: 436, color: '#85D29A', marker: 'arrowMint' })}
    ${arrow({ x1: 714, y1: 436, x2: 752, y2: 436, color: '#85D29A', marker: 'arrowMint' })}
    ${label(274, 426, 'controls')}
    ${label(500, 426, 'serves')}
    ${label(722, 426, 'matches')}

    ${box({ x: 82, y: 544, w: 238, h: 154, title: 'Company / Brand / ACN', lines: [
      '平台与组织协作层',
      '共享客户池 / 协同规则 / store network',
      '当前代码只部分投到 companyPressure + broker leads',
    ], dashed: true, stroke: '#D8ECFF', fill: '#1F2925', badge: 'TARGET' })}
    ${box({ x: 352, y: 544, w: 252, h: 154, title: 'Store / RivalStore', lines: [
      '同公司门店 / 外部门店',
      'leadCapturePower / pricingPressurePower',
      '当前运行时落在 marketShadow.rivalStores[]',
    ], fill: '#213028', badge: 'CURRENT' })}
    ${box({ x: 636, y: 544, w: 282, h: 154, title: 'OwnerSide Formalization', lines: [
      'OwnershipEntrust',
      'BrokerOwnerRelation',
      '当前仍主要内嵌到 case.trust/patience/urgency',
      '后续建议从 case 内字段正式拆出',
    ], dashed: true, stroke: '#D8ECFF', fill: '#1F2925', badge: 'TARGET' })}

    ${panel({
      x: 992, y: 230, w: 2792, h: 1118,
      kicker: 'WORLD ER',
      title: '核心领域实体关系全景',
      note: [
        '当前系统真正的骨架是：GameState/World -> Case -> Opportunity -> ClosedDealRecord / DomainEventEntry，同时配套 CustomerRuntimeState、MatterEntry、ShadowMarketState。',
        '下面同时画“当前已落地对象”和“文档目标拆分对象”。',
      ],
    })}
    ${box({ x: 1034, y: 374, w: 288, h: 128, title: 'GameState / World', lines: [
      'day / currentDate / rngState / rules',
      'cases / opportunities / customers / markets',
      'eventStore / matters / closedDeals / marketShadow',
    ], badge: 'ROOT', fill: '#243629' })}
    ${box({ x: 1380, y: 374, w: 252, h: 116, title: 'ScenarioSnapshot', lines: [
      'world / scenario / opening / difficulty',
      'runContext holds immutable scenario truth',
    ], fill: '#223026', badge: 'SNAPSHOT' })}
    ${box({ x: 1684, y: 374, w: 240, h: 116, title: 'MarketCell', lines: [
      'demandHeat / supplyPressure',
      'competitivePressure / sentiment',
    ], fill: '#21312B', badge: 'MARKET' })}
    ${box({ x: 1968, y: 356, w: 366, h: 166, title: 'Case', lines: [
      'profile: district / layout / area / axisScores / tags / defects',
      'runtime: askPrice / marketPrice / bottomPrice / heat',
      'trust / patience / urgency / windowDays / stage / status',
      'd1 / d2 / d3 / competitiveness / competitivenessSnapshots[]',
    ], fill: '#23372A', badge: 'LISTING' })}
    ${box({ x: 2380, y: 374, w: 334, h: 126, title: 'Opportunity', lines: [
      'caseId / customerId / channelId',
      'fit / intent / confidence / stageIndex',
      'status / lifecycleStatus / daysLeft / visibility',
    ], fill: '#22332A', badge: 'RELATION' })}
    ${box({ x: 2760, y: 374, w: 300, h: 126, title: 'CustomerRuntimeState', lines: [
      'status / decisionStyle / advisorTrust',
      'fatigue / churnRisk / activeCaseIds[] / caseStates{}',
    ], fill: '#21312B', badge: 'RUNTIME' })}
    ${box({ x: 3104, y: 374, w: 292, h: 126, title: 'MatterEntry', lines: [
      'source / scene / stage / template / presentation',
      'caseId / sourceKey / resolutionSummary',
    ], fill: '#223129', badge: 'MATTER' })}
    ${box({ x: 1034, y: 568, w: 274, h: 120, title: 'DomainEventEntry', lines: [
      'kind / actor / title / detail / tone',
      'caseId? / opportunityId? / customerId? / payload{}',
    ], fill: '#253228', badge: 'EVENT' })}
    ${box({ x: 1350, y: 568, w: 292, h: 120, title: 'ClosedDealRecord', lines: [
      'caseId / customerId / sourceRelationId',
      'dealPrice / readiness / probability / snapshots',
    ], fill: '#2B3222', badge: 'FACT' })}
    ${box({ x: 1690, y: 568, w: 282, h: 120, title: 'ShadowMarketState', lines: [
      'rivalStores[] / rivalListings[]',
      'companyPressure / marketSignals[] / inboundQueue[]',
    ], fill: '#24312B', badge: 'SHADOW' })}
    ${box({ x: 2012, y: 568, w: 322, h: 120, title: 'CustomerProfile', lines: [
      'budgetMin/max / targetDistrict / layouts[]',
      'activity / urgency / priceSensitivity / preferences[]',
    ], fill: '#21312B', badge: 'MASTER' })}
    ${box({ x: 2380, y: 568, w: 334, h: 120, title: 'Owner Archetype / HousePrototype', lines: [
      'world master data',
      'ownerArchetypes[] / housePrototypes[]',
      'instantiateScenarioCases 的输入',
    ], fill: '#213026', badge: 'MASTER' })}
    ${box({ x: 2760, y: 568, w: 300, h: 120, title: 'FinalResult / RunResult', lines: [
      '正式结算结果',
      'caseResults[] / scoreBreakdown / customerReview',
    ], fill: '#2D3022', badge: 'RESULT' })}
    ${box({ x: 3104, y: 568, w: 292, h: 120, title: 'DailyTickResult', lines: [
      'report / emittedEvents[] / closedDeals[]',
      'dirtyScopes / invariantAlerts[]',
    ], fill: '#283126', badge: 'TICK OUT' })}

    ${arrow({ x1: 1322, y1: 438, x2: 1380, y2: 438, color: '#85D29A', marker: 'arrowMint' })}
    ${label(1332, 428, 'initialized from')}
    ${arrow({ x1: 1632, y1: 432, x2: 1684, y2: 432, color: '#85D29A', marker: 'arrowMint' })}
    ${label(1640, 422, 'contains')}
    ${arrow({ x1: 1924, y1: 432, x2: 1968, y2: 432, color: '#85D29A', marker: 'arrowMint' })}
    ${label(1912, 422, 'prices / influences')}
    ${arrow({ x1: 2334, y1: 432, x2: 2380, y2: 432, color: '#85D29A', marker: 'arrowMint' })}
    ${label(2342, 422, '1 case -> n')}
    ${arrow({ x1: 2714, y1: 432, x2: 2760, y2: 432, color: '#85D29A', marker: 'arrowMint' })}
    ${label(2720, 422, 'per customer')}
    ${arrow({ x1: 3060, y1: 432, x2: 3104, y2: 432, color: '#85D29A', marker: 'arrowMint' })}
    ${label(3066, 422, 'spawns / updates')}

    ${arrow({ x1: 1150, y1: 568, x2: 1150, y2: 510, color: '#85D29A', marker: 'arrowMint' })}
    ${label(1116, 544, 'world emits')}
    ${arrow({ x1: 1452, y1: 568, x2: 2120, y2: 522, color: '#FFC991', marker: 'arrowGold' })}
    ${label(1650, 540, '1 sold case -> 0 or 1 formal deal fact')}
    ${arrow({ x1: 1832, y1: 568, x2: 1848, y2: 500, color: '#85D29A', marker: 'arrowMint' })}
    ${label(1796, 546, 'market pressure')}
    ${arrow({ x1: 2162, y1: 568, x2: 2460, y2: 500, color: '#85D29A', marker: 'arrowMint' })}
    ${label(2200, 544, 'matched into')}
    ${arrow({ x1: 2930, y1: 568, x2: 2930, y2: 500, color: '#FFC991', marker: 'arrowGold' })}
    ${label(2882, 544, 'settlement')}
    ${arrow({ x1: 3248, y1: 568, x2: 3248, y2: 500, color: '#85D29A', marker: 'arrowMint' })}
    ${label(3198, 544, 'per day output')}

    ${box({ x: 1034, y: 742, w: 804, h: 214, title: '关系规则（当前骨架最关键的 cardinality）', lines: [
      '1 个 GameState / World 运行时拥有 N 个 Case、N 个 Opportunity、N 个 DomainEvent、N 个 Matter。',
      '1 个 Case 可同时对应 N 个 Opportunity，但正式成交后同 case 不应出现重复 ClosedDealRecord。',
      '1 个 CustomerRuntimeState 可并行比较多套房，但 activeCaseIds / caseStates[] 会收缩到有限注意力窗口。',
      '1 个 Case 当前把部分 owner relation 状态内嵌在自己身上；文档目标是拆成 OwnershipEntrust / BrokerOwnerRelation。',
      'ShadowMarketState 是“平行市场环境层”，不应直接替代正式 case/customer 事实。',
    ], fill: '#1F2A24' })}

    ${box({ x: 1870, y: 742, w: 640, h: 214, title: '好房模型 / 价格模型 / 客户关系 边界', lines: [
      'GoodHouseModel 回答：这套房整体好不好卖。',
      'PriceModel 回答：价格站不站得住、离成交区有多远。',
      'Opportunity / CustomerCaseRelation 回答：这个客户与这套房推进到哪一步。',
      '三者不能混。Case 上保留 d1/d2/d3/competitiveness 只代表当前评估结果，不代表完整的原始事实。',
    ], fill: '#203028' })}
    ${box({ x: 2546, y: 742, w: 850, h: 214, title: '文档目标拆分（建议继续演进）', lines: [
      'Owner 实体独立：ownerId / owner archetype / anxiety / market understanding',
      'OwnershipEntrust：ownerId + caseId + primaryBrokerId + exclusive status + signed window',
      'BrokerOwnerRelation：brokerId + ownerId + trust / cadence / alignment / route agreement',
      'PriceModelOutput / GoodHouseScoreProjection / DealStatsProjection 作为独立 projection，不回写原始世界真相',
      'eventStore 后续可继续细化到 relation.* / price.* / goodHouse.* / marketEvent.* taxonomy',
    ], dashed: true, stroke: '#D8ECFF', fill: '#1F2925' })}

    ${panel({
      x: 992, y: 1376, w: 1620, h: 666,
      kicker: 'GOOD HOUSE MODEL',
      title: '好房模型、价格模型、关系推进的完整输入输出',
      note: [
        '这部分放在 ER 图里，是因为它决定 Case 上哪些字段是“源事实”，哪些字段只是评估结果。',
        '后续开发时，模型一定要继续和世界实体分层，不要把 projection 再塞回实体定义。',
      ],
    })}
    ${box({ x: 1034, y: 1520, w: 300, h: 194, title: 'Case Profile 输入', lines: [
      'district / layout / area / tags / defects',
      'axisScores(layout/light/floor/decor/amenity/neighborhood/structure)',
      'housePrototype / story / product quality',
    ], fill: '#21312A', badge: 'INPUT' })}
    ${box({ x: 1364, y: 1520, w: 294, h: 194, title: 'Case Runtime 输入', lines: [
      'heat / exposure proxy / competitiveness',
      'competitionGroupIds / marketCellId',
      'viewings / offers / stage / status',
    ], fill: '#21312A', badge: 'INPUT' })}
    ${box({ x: 1688, y: 1520, w: 296, h: 194, title: 'Owner / Price Side 输入', lines: [
      'trust / patience / urgency',
      'askPrice / marketPrice / bottomPrice / priceGapPct',
      'current code 用 case 字段代理 owner relation',
    ], fill: '#21312A', badge: 'INPUT' })}
    ${box({ x: 2014, y: 1520, w: 286, h: 194, title: 'Customer / Opportunity 输入', lines: [
      'active opportunities / stage history',
      'intent / confidence / stagnationTicks',
      'customerState.comparing / fatigue / churnRisk',
    ], fill: '#21312A', badge: 'INPUT' })}
    ${box({ x: 2330, y: 1520, w: 242, h: 194, title: 'Market 输入', lines: [
      'marketCell demand/supply/sentiment',
      'rival listings / company pressure',
      'seasonality / daily event / signals',
    ], fill: '#21312A', badge: 'INPUT' })}

    ${box({ x: 1034, y: 1758, w: 472, h: 230, title: '文档业务语义', lines: [
      'D1 = 准客池厚度',
      'D2 = 房屋吸引力',
      'D3 = 业主意愿 / 配合度',
      'goodHouseScore / level / positiveReasons / negativeReasons',
      '边界：不替代价格模型，不替代成交概率，不直接替代玩家行动建议',
    ], dashed: true, stroke: '#D8ECFF', fill: '#1F2925', badge: 'DOC' })}
    ${box({ x: 1540, y: 1758, w: 512, h: 230, title: '当前 scoring.ts 实际实现', lines: [
      'D1: poolSize + activeContacts + lateStageThickness + advanceSpeed - stagnationRisk',
      'D2: axisScores 按权重求和',
      'D3: priceFlex + patience + urgency + recentCooperation(trust proxy) + consistencyBaseline',
      'competitiveness = 0.50*D1 + 0.25*D2 + 0.25*D3',
    ], fill: '#23342A', badge: 'CURRENT CODE' })}
    ${box({ x: 2086, y: 1758, w: 484, h: 230, title: '开发注意点', lines: [
      '页面文案可讲业务意义，但代码要明确目前只是“近似实现”。',
      '如果补平台匹配规模、可触达规模、缺点惩罚、路线认同度，应优先补到模型层，不要散落到页面条件判断。',
      'reason tags 建议沉淀成稳定 projection，而不是页面临时拼接。',
    ], fill: '#202C24', badge: 'NOTE' })}

    ${panel({
      x: 2640, y: 1376, w: 1144, h: 666,
      kicker: 'RESULT / EVENT / VIEW',
      title: '正式结果、事件层、视图层的边界',
      note: [
        '这块是后续开发最容易混的地方，所以放在 ER 图收口：DailyReport != ClosedDealRecord != FinalResult。',
        'eventStore 是过程事实流，ClosedDealRecord 是成交事实，FinalResult / RunResult 是结算结果。',
      ],
    })}
    ${box({ x: 2684, y: 1520, w: 324, h: 180, title: 'DailyReport / currentReport', lines: [
      '日内/次日摘要',
      'majorEvents / metricsDelta / marketNews / todayPlan',
      '服务 Review / Dashboard，不是正式成绩',
    ], fill: '#21312A', badge: 'SUMMARY' })}
    ${box({ x: 3042, y: 1520, w: 324, h: 180, title: 'eventStore', lines: [
      '结构化过程事件',
      '用于复盘、归因、dirty scope、结果叙事',
      '当前 kind 仍偏粗粒度',
    ], fill: '#23342A', badge: 'PROCESS FACT' })}
    ${box({ x: 2684, y: 1736, w: 324, h: 180, title: 'ClosedDealRecord', lines: [
      '正式成交事实',
      'priceSnapshot / marketSnapshot',
      '一个 case 一局内不应重复成交',
    ], fill: '#2C3223', badge: 'FORMAL FACT' })}
    ${box({ x: 3042, y: 1736, w: 324, h: 180, title: 'FinalResult / RunResult', lines: [
      '正式结算结果',
      'score / grade / dimensions / caseResults',
      '排行榜与生涯只看这层',
    ], fill: '#2D3022', badge: 'SETTLEMENT' })}
    ${box({ x: 3400, y: 1520, w: 338, h: 396, title: 'Projection Layer', lines: [
      'buildOperatingProjection',
      'buildWorkspaceShellProjection',
      'buildReviewProjection',
      'buildResultProjection',
      '规则：Projection 只读 World/Fact，不反向成为世界真相',
    ], fill: '#202C24', badge: 'READ MODEL' })}

    ${arrow({ x1: 3008, y1: 1610, x2: 3042, y2: 1610, color: '#85D29A', marker: 'arrowMint' })}
    ${arrow({ x1: 3008, y1: 1826, x2: 3042, y2: 1826, color: '#FFC991', marker: 'arrowGold' })}
    ${arrow({ x1: 3366, y1: 1826, x2: 3400, y2: 1826, color: '#85D29A', marker: 'arrowMint' })}
    ${label(3014, 1600, 'feeds')}
    ${label(3014, 1816, 'settles')}
    ${label(3372, 1816, 'projects')}
  `;

  return canvas(
    '我是王牌资产管理顾问 · 全景领域 ER 超级总图',
    '聚焦：世界实体、关系边界、好房模型、正式事实层、结果层、投影层。',
    '目标：让后续开发先看清“谁是原始真相，谁是运行态，谁是评估器，谁是正式结算结果”。',
    body,
  );
}

function buildEngineMap() {
  const tickSteps = [
    ['01 updateMarkets', 'marketCell demand/supply/sentiment 波动', '同步 case.marketPrice'],
    ['02 tickSeasonality', '月份因子叠加到 marketCell', '季节热度偏移'],
    ['03 rollDailyMarketEvent', '抽 DailyMarketEvent', '先写入 marketShadow.dailyMarketEvent'],
    ['04 applyDailyMarketEvent', 'heat_wave / rival inflow / company shift', '或转 inbound opportunity'],
    ['05 tickRivalStores', '竞店 activityHeat 浮动', '风格脉冲'],
    ['06 tickRivalListings', 'freshness / daysLeft / status', '可能引发 case_lost_to_rival'],
    ['07 applyRivalPressure', '压 case heat/trust 与 opportunity', '竞品分流'],
    ['08 tickCompanyPressure', 'sharedLeadPressure / referralChance', '组织内竞争'],
    ['09 applyCompanyPressure', 'shadow broker leads 降温 / 转客进入', '内部资源压力'],
    ['10 updateCustomers', 'customer.activity / urgency', '总体脉冲'],
    ['11 progressCustomerDemand', 'customerState.caseStates 重算', '反推新 opportunity'],
    ['12 applyRivalPullOnCustomers', '客户转去比较 / churnRisk 抬升', '竞品拉扯'],
    ['13 tickOpportunities', 'daysLeft / intent / confidence / stage', '机会升格或流失'],
    ['14 applyCustomerFeedbackToCases', '客户反馈回灌 case', '改 heat / trust / offers'],
    ['15 tickCompetition', '竞争组联动 / 丢盘检查', '系统守盘逻辑'],
    ['16 fireScheduledEvents', '脚本事件结算', '外力进入 world'],
    ['17 settlePendingDealClosings', '报价桌结算', 'DealClosingEvaluation -> ClosedDealRecord'],
    ['18 tickCases', 'windowDays / trust / patience / urgency', '续窗或撤盘'],
    ['19 spawnPassiveLeads', '按 heat+d1 被动加线索', '厚池子'],
    ['20 triggerRandomEvent', '宏观/商圈随机事件', 'market_event'],
    ['21 settleMarketSignals', 'signal 衰减与 ambient signal 生成', 'marketSignals'],
    ['22 weekly branch', 'weeklyReview / weeklyBudget', '只在 day%7===0'],
    ['23 updateDerivedState', 'd1/d2/d3 / riskFlags / matters / metrics', '统一投影前状态'],
    ['24 finish / next day', 'DailyReport / lastDailyTickResult', 'day+1 / energy reset / focus'],
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

  const targetEvents = [
    'marketEvent.started / marketEvent.ended',
    'case.heat.changed / case.exposure.changed',
    'owner.anxiety.changed',
    'ownerCase.trust.changed / patience.changed / priceWindow.opened',
    'customer.activity.changed / fatigue.changed / urgency.changed',
    'relation.intent.changed / confidence.changed / stage.advanced / stagnated / lost',
    'price.marketEstimate.changed / ownerPsych.changed / pressure.changed',
    'goodHouse.d1.changed / d2.changed / d3.changed / score.changed',
    'deal.closed / relation.closed-by-deal / case.closed',
    'tick.invariant.warning / tick.invariant.error',
  ];

  const body = `
    <rect x="2940" y="54" width="794" height="148" rx="24" fill="#152019" fill-opacity="0.92" stroke="#46644D" stroke-width="2"/>
    ${arrow({ x1: 2980, y1: 96, x2: 3068, y2: 96, color: '#FFC991', marker: 'arrowGold' })}
    <text class="legend" x="3096" y="103">当前代码真实调用链 / 写入链</text>
    ${arrow({ x1: 2980, y1: 136, x2: 3068, y2: 136, color: '#D8ECFF', marker: 'arrowIce', dash: true })}
    <text class="legend" x="3096" y="143">文档目标粒度 / 继续细化的事件总线口径</text>
    ${pill(2980, 162, 'CHECK')}
    <text class="legend" x="3094" y="179">本图专门解决“每日到引擎、事件产生、事件类型”问题</text>

    ${panel({
      x: 42, y: 226, w: 918, h: 672,
      kicker: 'DAYTIME ACTION PATH',
      title: '白天动作：局部即时更新链',
      note: [
        '白天动作不是跑全世界，而是围绕一个 case 局部修改世界状态。',
        '当前入口：SellingHousesWorkspace/Cases -> useGame -> executeGameAction -> executeAction -> actionResolvers。',
      ],
    })}

    ${box({ x: 84, y: 380, w: 188, h: 112, title: 'Cases 页面', lines: ['选房源 / 选动作 / 策略 option'], badge: 'UI', fill: '#23352B' })}
    ${box({ x: 302, y: 380, w: 172, h: 112, title: 'useGame', lines: ['transitionGameState', 'onMessage / save'], badge: 'HOOK', fill: '#233229' })}
    ${box({ x: 504, y: 380, w: 190, h: 112, title: 'getActionAvailability', lines: ['精力 / 推广金 / 冷却 / stage 门槛'], badge: 'GATE', fill: '#2A3022' })}
    ${box({ x: 724, y: 380, w: 198, h: 112, title: 'executeAction', lines: ['spendResources', 'dispatch executor', 'record action_executed'], badge: 'ENTRY', fill: '#24322A' })}
    ${arrow({ x1: 272, y1: 436, x2: 302, y2: 436 })}
    ${arrow({ x1: 474, y1: 436, x2: 504, y2: 436 })}
    ${arrow({ x1: 694, y1: 436, x2: 724, y2: 436 })}

    ${box({ x: 84, y: 534, w: 838, h: 146, title: 'Action Executors / actionResolvers（当前全部动作都在这里）', lines: [
      'first-visit / weekly-feedback / deep-diagnosis / story / xiaohongshu-boost / broker-broadcast / private-referral',
      'open-day / showing / pricing-advice / ask-psychological-price / adjust-listing-price / sincerity-sale / invite-customer-negotiation',
      '动作普遍同时改写 case、opportunity、customerState、budget/auxiliary，并写 eventLog/eventStore。',
    ], badge: 'CORE', fill: '#24372A' })}

    ${box({ x: 84, y: 718, w: 404, h: 140, title: '动作直接修改的状态面', lines: [
      'Case: trust / patience / urgency / heat / askPrice / bottomPrice / windowDays',
      'Opportunity: intent / confidence / stage / visibility / pendingClosing*',
      'CustomerState: advisorTrust / lastTouchDay / lastActionNote / caseStates[]',
      'Budget/Aux: promotionBudget / wordOfMouth / commission',
    ], fill: '#1F2C24', badge: 'STATE' })}
    ${box({ x: 518, y: 718, w: 404, h: 140, title: '动作事件与后置', lines: [
      'logEvent -> eventLog + journal',
      'recordBudgetChange -> budget_changed',
      'executeAction 成功后 -> action_executed',
      '最后统一 updateDerivedState',
    ], fill: '#1F2C24', badge: 'EVENT' })}

    ${panel({
      x: 992, y: 226, w: 1742, h: 1832,
      kicker: 'NIGHTLY DAILY TICK',
      title: '夜间日结：resolveOneDay 当前完整顺序',
      note: [
        '这一块严格按 src/selling-houses/domain/engine.ts 当前真实顺序展开。',
        '重点是把“谁先算、谁后算、哪里产事件、哪里形成正式事实”全部挂出来。',
      ],
    })}
    ${bracket({ x: 1032, y: 358, w: 1620, h: 1428, labelText: 'resolveOneDay(state) current code path' })}
    ${tickSteps.map((step, index) => {
      const col = index < 8 ? 0 : index < 16 ? 1 : 2;
      const row = index % 8;
      const x = 1056 + col * 536;
      const y = 388 + row * 166;
      return box({
        x,
        y,
        w: 492,
        h: 142,
        title: step[0],
        lines: [step[1], step[2]],
        fill: col === 0 ? '#223228' : col === 1 ? '#243029' : '#2B3022',
        stroke: col === 2 ? '#FFC991' : '#85D29A',
      });
    }).join('\n')}
    ${Array.from({ length: 8 }).map((_, idx) => arrow({ x1: 1548, y1: 459 + idx * 166, x2: 1592, y2: 459 + idx * 166 })).join('\n')}
    ${Array.from({ length: 8 }).map((_, idx) => arrow({ x1: 2084, y1: 459 + idx * 166, x2: 2128, y2: 459 + idx * 166 })).join('\n')}

    ${box({ x: 1044, y: 1820, w: 768, h: 178, title: 'DailyTickResult 输出', lines: [
      'day / nextDay / report / emittedEvents[] / closedDeals[]',
      'dirtyScopes / invariantAlerts[]',
      'state.lastDailyTickResult = result',
    ], badge: 'OUTPUT', fill: '#24322A' })}
    ${box({ x: 1848, y: 1820, w: 844, h: 178, title: '次日准备与结算边界', lines: [
      'finishGame? -> finalResult；否则 day+1 / currentDate+1 / energy reset',
      'Thursday focus cases / currentReport 构造 / onMessage / logEvent("第N天开始")',
      '当前代码是“先完成今天结算，再把状态推到明天”。',
    ], badge: 'NEXT DAY', fill: '#2C3022' })}

    ${panel({
      x: 2762, y: 226, w: 1022, h: 936,
      kicker: 'EVENT SYSTEM',
      title: '事件产生、事件类型、事实沉淀',
      note: [
        '这里把 eventLog、eventStore、closedDeals、finalResult 四层分开。',
        '过程日志、结构化事件、正式事实、正式结算结果，不是一回事。',
      ],
    })}
    ${box({ x: 2802, y: 380, w: 266, h: 116, title: 'eventLog', lines: ['UI 滚动日志', '最多 120 条', '所有 logEvent 都会双写 journal'], badge: 'UI LOG', fill: '#233229' })}
    ${box({ x: 3096, y: 380, w: 292, h: 116, title: 'recordDomainEvent', lines: ['kind / actor / title / detail / payload', 'unshift eventStore'], badge: 'EVENT WRITER', fill: '#24312A' })}
    ${box({ x: 3416, y: 380, w: 326, h: 116, title: 'eventStore', lines: ['结构化过程事件流', '复盘 / 结果归因 / dirty scope 消费'], badge: 'STORE', fill: '#273127' })}
    ${arrow({ x1: 3068, y1: 438, x2: 3096, y2: 438, color: '#85D29A', marker: 'arrowMint' })}
    ${arrow({ x1: 3388, y1: 438, x2: 3416, y2: 438, color: '#85D29A', marker: 'arrowMint' })}

    ${box({ x: 2802, y: 526, w: 448, h: 286, title: '当前代码已落地 DomainEventKind', lines: eventKinds.map((item) => `• ${item}`), fill: '#1F2B24' })}
    ${box({ x: 3280, y: 526, w: 462, h: 286, title: '文档目标细粒度 taxonomy', lines: targetEvents.map((item) => `• ${item}`), dashed: true, stroke: '#D8ECFF', fill: '#1F2925' })}

    ${box({ x: 2802, y: 842, w: 940, h: 278, title: '事件主要来源点（当前代码）', lines: [
      'logEvent: 所有 journal 类叙事入口',
      'executeAction: action_executed',
      'recordBudgetChange: budget_changed',
      'tickOpportunities / closeOpportunity: opportunity_advanced / opportunity_closed',
      'dealClosing: case_sold；withdrawCase / loseCaseToRival / tickCases: case_withdrawn / case_lost_to_rival / window_extended',
      'eventEngine / scriptedEvents / random events: market_event',
      '结论：事件已是运行时第一公民，不再只是 UI 日志。',
    ], fill: '#202D24', badge: 'SOURCE MAP' })}

    ${panel({
      x: 2762, y: 1194, w: 1022, h: 864,
      kicker: 'OUTPUT / PROJECTION / CHECK',
      title: '结果输出、投影刷新、健壮性检查',
      note: [
        '这部分回答：事件与事实出来以后，页面怎么知道刷新什么、结果页拿什么、系统怎么防脏状态。',
      ],
    })}
    ${box({ x: 2802, y: 1350, w: 452, h: 262, title: 'DirtyScopeSet', lines: [
      'cases[] / opportunities[] / customers[] / owners[]',
      'districts[] / marketCells[] / matters[]',
      'market:boolean / dashboard:boolean / result:boolean',
      'buildDirtyScopes 来源 = emittedEvents + closedDeals + matters',
    ], badge: 'INVALIDATION', fill: '#213028' })}
    ${box({ x: 3284, y: 1350, w: 458, h: 262, title: 'Invariant Alerts', lines: [
      'duplicate_closed_deal',
      'active_opportunity_after_case_closed',
      'opportunity_stage_out_of_range',
      'negative_window_days',
      '后续还可补：price contradiction / invalid matter writes / illegal stage jump',
    ], badge: 'CHECK', fill: '#2A2620', stroke: '#FFC991' })}
    ${box({ x: 2802, y: 1642, w: 452, h: 362, title: 'Projection Layer', lines: [
      'buildOperatingProjection',
      'Dashboard -> todayPriority / yesterdayIntel / triageCards',
      'Cases -> case detail / customerPoolSummary / factChain',
      'Market -> signalFeed / districtBoards / competition boards',
      'Review -> dailyBrief / turningPoints / customer summary',
      'Results -> finalResult only，不吃局内预估分',
    ], badge: 'READ MODEL', fill: '#1F2B24' })}
    ${box({ x: 3284, y: 1642, w: 458, h: 362, title: 'Formal Fact vs Formal Result', lines: [
      'ClosedDealRecord = 正式成交事实',
      'FinalResult / RunResult = 正式结算结果',
      'DailyReport / currentReport = 过程摘要，不进排行榜',
      '结果页与排行榜只看正式结果，不能把 daily tick 中间值当最终成绩。',
    ], badge: 'SETTLEMENT', fill: '#2D3022' })}

    ${panel({
      x: 42, y: 940, w: 918, h: 1118,
      kicker: 'ENGINE MODULES',
      title: '关键子引擎与程序骨架',
      note: [
        '这块把真正影响开发质量的“关键程序”集中列出来，方便你后面继续拆程序图或补设计文档。',
      ],
    })}
    ${box({ x: 84, y: 1094, w: 404, h: 164, title: 'marketEngine.ts', lines: [
      'updateMarkets / tickSeasonality / updateCustomers / tickCases / createWeeklyReview',
      '偏“自然世界脉冲 + case/owner 日衰减”',
    ], fill: '#223229' })}
    ${box({ x: 518, y: 1094, w: 404, h: 164, title: 'customerEngine.ts', lines: [
      'progressCustomerDemand / applyRivalPullOnCustomers / applyCustomerFeedbackToCases / touchCustomersForCase',
      '偏“客户总态 -> 客房关系 -> 反哺 case”',
    ], fill: '#223229' })}
    ${box({ x: 84, y: 1288, w: 404, h: 164, title: 'opportunityEngine.ts', lines: [
      'createOpportunity / tickOpportunities / closeOpportunity / spawnPassiveLeads',
      '偏“机会漏斗、阶段推进、流失与加厚”',
    ], fill: '#223229' })}
    ${box({ x: 518, y: 1288, w: 404, h: 164, title: 'dealClosing.ts', lines: [
      'queueDealClosingEvaluation / settlePendingDealClosings / buildDealClosingEvaluation / buildClosedDealRecord',
      '偏“报价桌 -> 正式成交事实”',
    ], fill: '#2B3022' })}
    ${box({ x: 84, y: 1482, w: 404, h: 164, title: 'rivals + company + signal', lines: [
      'rivalStoreEngine / rivalListingEngine / companyPressureEngine / signalEngine / dailyEventDirector',
      '偏“外部世界、组织压力、商圈信号”',
    ], fill: '#223229' })}
    ${box({ x: 518, y: 1482, w: 404, h: 164, title: 'runtimeState.ts + scoring.ts', lines: [
      'recordDomainEvent / logEvent / updateDerivedState',
      'updateCompetitiveness / d1-d2-d3 / riskFlags / matters / metrics',
    ], fill: '#223229' })}
    ${box({ x: 84, y: 1676, w: 838, h: 284, title: '当前最该继续吃透的程序主链', lines: [
      '1. executeAction 如何改局部 world，并把 pendingClosing 留到 nightly settlePendingDealClosings。',
      '2. progressCustomerDemand -> tickOpportunities -> applyCustomerFeedbackToCases 这条 customer/opportunity/case 的三段回路。',
      '3. tickCases / loseCaseToRival / withdrawCase / finalizeClosedDeal 这四类 case 结局入口。',
      '4. updateDerivedState 如何把原始 world 变成页面看得懂的稳定状态。',
      '5. eventStore / ClosedDealRecord / FinalResult 三层事实边界。',
    ], fill: '#1F2B24' })}
  `;

  return canvas(
    '我是王牌资产管理顾问 · 日结引擎与事件系统超级总图',
    '聚焦：白天动作链、夜间 resolveOneDay、事件产生、事件类型、Dirty Scope、Projection、正式事实层。',
    '目标：把“每日到引擎推动事件产生”彻底讲清，方便后续继续补程序设计、文档和实现。',
    body,
  );
}

function writeFile(relPath, content) {
  const target = path.resolve(relPath);
  fs.writeFileSync(target, content, 'utf8');
  console.log(`Wrote ${target}`);
}

writeFile('docs/assets/selling-houses-er-super-map-2026-04-21.svg', buildErMap());
writeFile('docs/assets/selling-houses-engine-event-super-map-2026-04-21.svg', buildEngineMap());
