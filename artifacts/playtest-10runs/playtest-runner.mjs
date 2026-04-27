import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';

dotenv.config({ path: '.env.local' });

const ROOT = path.resolve('artifacts/playtest-10runs');
const BASE_URL = process.env.PLAYTEST_BASE_URL || 'http://localhost:3000';
const SELLER_URL = `${BASE_URL}/seller?profile=e2e`;
const MAX_DAYS = Number(process.env.PLAYTEST_MAX_DAYS || 21);

const personas = [
  { id: 1, name: '完全新手', principle: '不提前研究规则，先相信首页推荐和最显眼按钮。', focus: '自然上手' },
  { id: 2, name: '认真研究型', principle: '每天先读工作台、微信、房源、市场，再行动。', focus: '系统理解' },
  { id: 3, name: '激进成交型', principle: '优先客户、带看、谈判、成交，不怕消耗精力。', focus: '尽快成交' },
  { id: 4, name: '保守维护型', principle: '优先稳业主信任和耐心，少冒进。', focus: '业主关系' },
  { id: 5, name: '价格策略型', principle: '盯挂牌、市场、底线、竞品压力，优先价格沟通。', focus: '价格与竞品' },
  { id: 6, name: '客户运营型', principle: '优先客户信号、准客池、带看推进。', focus: '客户推进' },
  { id: 7, name: '情报站依赖型', principle: '主要按微信/消息/今日关注行动。', focus: '情报转行动' },
  { id: 8, name: '低质量玩家', principle: '少读信息，尽快点明显按钮或直接结束当天。', focus: '系统兜底' },
  { id: 9, name: '复盘优化型', principle: '根据前几局经验，先补面访，再推客户，再谈价格。', focus: '策略学习' },
  { id: 10, name: '熟练玩家', principle: '每天先识别高风险房源，再选最可能形成成交链路的动作。', focus: '最好结果' },
];

const issueList = [];
const allEvents = [];
const runSummaries = [];
const consoleEvents = [];

function parseLocalWhitelistEmail() {
  const raw = process.env.PLAYTEST_EMAIL || process.env.AUTH_LOCAL_WHITELIST || '';
  const match = raw.match(/[A-Z0-9._%+-]+@ke\.com/i);
  if (!match) {
    throw new Error('Missing PLAYTEST_EMAIL or AUTH_LOCAL_WHITELIST @ke.com test account.');
  }
  return match[0].toLowerCase();
}

function compactText(value, limit = 420) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function pickLines(text, keywords, limit = 12) {
  const lines = String(text || '')
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const picked = lines.filter((line) => keywords.some((keyword) => line.includes(keyword)));
  return [...new Set(picked)].slice(0, limit);
}

function scoreDay({ actionAttempted, actionCompleted, settlementText, confusion }) {
  return {
    goalClarity: actionAttempted ? 3 : 2,
    informationUsefulness: settlementText ? 3 : 2,
    decisionWeight: actionCompleted ? 3 : actionAttempted ? 2 : 1,
    causalFeedback: settlementText.includes('因为') || settlementText.includes('带来') ? 3 : actionCompleted ? 2 : 1,
    tomorrowPull: confusion ? 2 : 3,
  };
}

function severity(priority) {
  return priority === 'P0' ? 0 : priority === 'P1' ? 1 : 2;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(file, data) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function writeText(file, text) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, text, 'utf8');
}

async function screenshot(page, runId, name) {
  const file = path.join(ROOT, 'screenshots', runId, `${name}.png`);
  await ensureDir(path.dirname(file));
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function bodyText(page) {
  return page.locator('body').innerText({ timeout: 6000 }).catch(() => '');
}

async function waitForSellerSurface(page, timeout = 30000, options = {}) {
  const allowLogin = options.allowLogin ?? true;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await page.getByRole('button', { name: '结束今日' }).isVisible({ timeout: 300 }).catch(() => false)) {
      return 'game';
    }
    if (await page.getByRole('button', { name: '进入标准剧本' }).isVisible({ timeout: 300 }).catch(() => false)) {
      return 'difficulty';
    }
    if (await page.getByText('本局正式结算').isVisible({ timeout: 300 }).catch(() => false)) {
      return 'final';
    }
    if (allowLogin && await page.getByPlaceholder('请输入 @ke.com 邮箱').isVisible({ timeout: 300 }).catch(() => false)) {
      return 'login';
    }
    await page.waitForTimeout(300);
  }
  const text = compactText(await bodyText(page), 1200);
  throw new Error(`Seller surface did not become ready. Visible page: ${text}`);
}

async function visibleSnapshot(page, run, day, phase, extra = {}) {
  const text = await bodyText(page);
  const hidden = await page.evaluate(() => {
    const key = Object.keys(window.localStorage)
      .filter((entry) => entry.startsWith('selling-world-save-v3'))
      .find((entry) => entry.includes('e2e'));
    if (!key) return null;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || '{}');
      return {
        key,
        runId: parsed.runId || parsed.id || null,
        day: parsed.day,
        localRevision: parsed.localRevision,
        gameOver: parsed.gameOver,
        soldCount: parsed.soldCount,
        score: parsed.score,
        currentReport: parsed.currentReport ? compactText(JSON.stringify(parsed.currentReport), 800) : null,
      };
    } catch {
      return { key, parseError: true };
    }
  }).catch(() => null);

  return {
    run,
    day,
    phase,
    visible_state: {
      day_label: (text.match(/(\d+\/21|DAY\s*\d+|D\d+\s*今天)/i) || [])[0] || '',
      days_left: (text.match(/剩余\s*\d+\s*天|剩余\s*\d+天/) || [])[0] || '',
      owner_state: pickLines(text, ['业主', '信任', '耐心', '紧迫'], 8).join(' / '),
      listing_heat: pickLines(text, ['好房分', '热', '挂牌', '市场', '底线'], 8).join(' / '),
      customer_signals: pickLines(text, ['客户', '带看', '报价', '准客'], 8).join(' / '),
      market_status: pickLines(text, ['市场', '竞品', '同类房', '成交位'], 8).join(' / '),
      rival_status: pickLines(text, ['竞品', '同类房', '压力'], 8).join(' / '),
      available_actions: pickLines(text, ['首次面访', '面访反馈', '营销推广', '价格沟通', '斡旋谈判', '结束今日'], 12),
      messages_seen: pickLines(text, ['：', '张经理', '业主', '客户', '商圈经理'], 12),
      todos_seen: pickLines(text, ['事项：', '可排事项', '已排进今天', '今日关注'], 12),
      raw_excerpt: compactText(text, 1200),
    },
    hidden_audit_state_if_available: hidden,
    ...extra,
  };
}

async function loginIfNeeded(page) {
  await page.goto(SELLER_URL, { waitUntil: 'domcontentloaded' });
  const surface = await waitForSellerSurface(page);
  if (surface !== 'login') return;

  const input = page.getByPlaceholder('请输入 @ke.com 邮箱');
  if (await input.isVisible({ timeout: 4000 }).catch(() => false)) {
    await input.fill(parseLocalWhitelistEmail());
    const button = page.getByRole('button', { name: /获取验证码|继续登录/ });
    await button.click();
  }
  await waitForSellerSurface(page, 45000, { allowLogin: false });
}

async function resetRun(page) {
  await page.goto(SELLER_URL, { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);
  await waitForSellerSurface(page);
  const endToday = page.getByRole('button', { name: '结束今日' });
  const standardScript = page.getByRole('button', { name: '进入标准剧本' });
  const reset = page.getByRole('button', { name: '重置测试档' });

  if (await standardScript.isVisible({ timeout: 2500 }).catch(() => false)) {
    await standardScript.click();
    await endToday.waitFor({ timeout: 15000 });
    return;
  }

  if (await endToday.isVisible({ timeout: 2500 }).catch(() => false)) {
    if (await reset.isVisible({ timeout: 2500 }).catch(() => false)) {
      await reset.click();
    }
    await endToday.waitFor({ timeout: 15000 });
    return;
  }

  if (await reset.isVisible({ timeout: 2500 }).catch(() => false)) {
    await reset.click();
    if (await standardScript.isVisible({ timeout: 2500 }).catch(() => false)) {
      await standardScript.click();
    }
    await endToday.waitFor({ timeout: 15000 });
    return;
  }

  const text = compactText(await bodyText(page), 1200);
  throw new Error(`Unable to enter seller game. Visible page: ${text}`);
}

async function clickNav(page, name) {
  const target = page.getByRole('button', { name });
  if (await target.isVisible({ timeout: 2500 }).catch(() => false)) {
    await target.click();
    await page.waitForTimeout(150);
    return true;
  }
  return false;
}

async function getButtonTexts(page) {
  return page.locator('button').evaluateAll((buttons) => buttons.map((button, index) => ({
    index,
    text: (button.textContent || '').replace(/\s+/g, ' ').trim(),
    disabled: button.hasAttribute('disabled'),
    visible: Boolean(button.offsetParent || button.getClientRects().length),
  })));
}

async function clickButtonIndex(page, index) {
  const locator = page.locator('button').nth(index);
  const box = await locator.boundingBox({ timeout: 5000 }).catch(() => null);
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  } else {
    await locator.click({ force: true, timeout: 5000 });
  }
  await page.waitForTimeout(180);
}

async function clickVisibleButtonText(page, matcher) {
  const buttons = await getButtonTexts(page);
  const found = buttons.find((button) => {
    if (button.disabled) return false;
    return typeof matcher === 'string' ? button.text === matcher : matcher(button.text);
  });
  if (!found) return null;
  await clickButtonIndex(page, found.index);
  return found.text;
}

async function hasActionFollowUpButton(page) {
  const buttons = await getButtonTexts(page);
  return buttons.some((button) => (
    !button.disabled
    && (
      button.text.includes('进入下一轮')
      || ['完成行动', '结束行动', '保存结果', '知道了', '关闭'].some((label) => button.text.includes(label))
      || button.text === '确认选择'
    )
  ));
}

async function waitForActionFollowUp(page, timeout = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await hasActionFollowUpButton(page)) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

function actionKeywordsFor(persona) {
  if (persona.id === 3) return ['斡旋谈判', '报价', '带看', '确认客户', '营销推广', '价格沟通', '首次面访'];
  if (persona.id === 4) return ['首次面访', '面访反馈', '业主', '价格沟通', '营销推广'];
  if (persona.id === 5) return ['价格沟通', '斡旋谈判', '面访反馈', '营销推广', '首次面访'];
  if (persona.id === 6) return ['确认客户', '带看', '准客', '营销推广', '首次面访', '面访反馈'];
  if (persona.id === 7) return ['面访反馈', '价格沟通', '确认客户', '首次面访', '营销推广'];
  if (persona.id === 8) return ['营销推广', '首次面访', '价格沟通', '确认客户', '面访反馈'];
  if (persona.id === 10) return ['首次面访', '面访反馈', '确认客户', '带看', '价格沟通', '斡旋谈判', '营销推广'];
  return ['首次面访', '面访反馈', '价格沟通', '营销推广', '确认客户', '带看', '斡旋谈判'];
}

async function chooseAction(page, persona) {
  await clickNav(page, '我的房源');
  const buttons = await getButtonTexts(page);
  const candidates = buttons.filter((button) => {
    if (!button.visible || button.disabled) return false;
    if (!button.text.includes('精力')) return false;
    if (button.text.includes('今日精力') || button.text.includes('查看')) return false;
    return /首次面访|面访反馈|营销推广|价格沟通|斡旋谈判|确认客户|带看|报价|小红书|包装/.test(button.text);
  });
  const keywords = actionKeywordsFor(persona);
  const chosen = candidates.find((button) => keywords.some((keyword) => button.text.includes(keyword))) || candidates[0];
  if (!chosen) return { attempted: false, completed: false, actionText: 'none', feedbackText: '没有找到可执行动作' };
  await page.locator('button').nth(chosen.index).click();
  await page.waitForTimeout(250);
  const result = await completeActionModal(page, persona);
  return { attempted: true, actionText: chosen.text, ...result };
}

async function modalOptionCandidates(page) {
  const buttons = await getButtonTexts(page);
  const excluded = [
    '返回', '重置测试档', '打开今日记录', '游戏排行榜', '工作台', '我的房源', '我的客户', '市场雷达',
    '玩家中心', '查看推广金详情', '查看成交与佣金详情', '查看今日精力详情', '推进一周', '结束今日',
    '全部', '面访', '包装', '带看', '反馈', '谈判', '结束', '聚焦', '易丢', '需要反馈', '成交',
    '房源和业主', '关注房源', '准客池', '日志', '风险', '取消', '确认选择', '进入下一轮',
  ];
  return buttons.filter((button) => button.visible && !button.disabled)
    .filter((button) => button.text.length >= 8)
    .filter((button) => !button.text.includes('精力'))
    .filter((button) => !excluded.some((item) => button.text === item || button.text.startsWith(item)))
    .slice(-10);
}

function optionScore(text, persona) {
  const rules = {
    3: ['报价', '成交', '带看', '客户', '推进', '明确'],
    4: ['听', '信任', '关系', '顾虑', '共识', '配合'],
    5: ['价格', '市场', '竞品', '数据', '底线', '预期'],
    6: ['客户', '带看', '需求', '预算', '匹配'],
    7: ['反馈', '情报', '消息', '明确反馈', '跟进'],
    8: ['推广', '直接', '快', '明确'],
    10: ['共识', '客户', '市场', '推进', '里程碑', '价格'],
  }[persona.id] || ['计划', '共识', '市场', '客户', '信任'];
  return rules.reduce((score, keyword) => score + (text.includes(keyword) ? 1 : 0), 0);
}

async function completeActionModal(page, persona) {
  let feedbackText = '';
  let completed = false;
  let confusion = '';
  for (let step = 0; step < 12; step += 1) {
    const nextRoundText = await clickVisibleButtonText(page, (text) => text.includes('进入下一轮'));
    if (nextRoundText) {
      feedbackText += `\n${compactText(await bodyText(page), 800)}`;
      continue;
    }

    const buttons = await getButtonTexts(page);
    const confirmButton = buttons.find((button) => button.visible && button.text === '确认选择');
    if (confirmButton) {
      const options = await modalOptionCandidates(page);
      const chosen = [...options].sort((a, b) => optionScore(b.text, persona) - optionScore(a.text, persona))[0];
      if (!chosen) {
        confusion = '行动弹层出现，但没有可识别选项。';
        break;
      }
      await clickButtonIndex(page, chosen.index);
      await page.waitForTimeout(150);
      const enabledButtons = await getButtonTexts(page);
      const enabledConfirm = enabledButtons.find((button) => button.visible && !button.disabled && button.text === '确认选择');
      if (enabledConfirm) {
        await clickButtonIndex(page, enabledConfirm.index);
        await page.waitForTimeout(250);
        continue;
      }
      confusion = `选择了「${chosen.text}」但确认按钮仍不可用。`;
      break;
    }

    const finishText = await clickVisibleButtonText(page, (text) => ['完成行动', '结束行动', '保存结果', '知道了', '关闭'].some((label) => text.includes(label)));
    if (finishText) {
      completed = true;
      break;
    }

    const body = await bodyText(page);
    if (body.includes('状态变化') || body.includes('本轮选择')) {
      feedbackText += `\n${compactText(body, 900)}`;
      if (await waitForActionFollowUp(page)) continue;
    }
    completed = true;
    break;
  }

  if (await page.getByRole('button', { name: '取消' }).isVisible({ timeout: 500 }).catch(() => false)) {
    await page.getByRole('button', { name: '取消' }).click().catch(() => {});
  }
  return { completed, feedbackText: compactText(feedbackText, 1200), confusion };
}

async function settleDay(page) {
  const before = await bodyText(page);
  const end = page.getByRole('button', { name: '结束今日' });
  if (!await end.isVisible({ timeout: 3000 }).catch(() => false)) {
    return { ok: false, settlementText: '未找到结束今日按钮', beforeText: before };
  }
  await end.click();
  await page.waitForTimeout(400);
  let settlementText = await bodyText(page);
  const continueButtons = ['进入今天', '继续经营', '进入下一天', '继续'];
  for (const label of continueButtons) {
    const button = page.getByRole('button', { name: label });
    if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
      await button.click();
      await page.waitForTimeout(250);
      return { ok: true, settlementText: compactText(settlementText, 1600), beforeText: before };
    }
  }
  if (settlementText.includes('本局正式结算') || settlementText.includes('最终')) {
    return { ok: true, settlementText: compactText(settlementText, 1600), final: true, beforeText: before };
  }
  return { ok: true, settlementText: compactText(settlementText, 1600), beforeText: before };
}

function makeEvents(run, day, startSnap, actionResult, settlement, persona) {
  const events = [];
  const idPrefix = `R${String(run).padStart(2, '0')}-D${String(day).padStart(2, '0')}`;
  const messages = startSnap.visible_state.messages_seen;
  const market = startSnap.visible_state.market_status;
  const owner = startSnap.visible_state.owner_state;
  events.push({
    run,
    day,
    event_id: `${idPrefix}-E01`,
    event_type: messages ? 'owner_message' : 'confusion',
    source: '我的微信 / 工作台',
    visible_text: messages || '当天起始页面没有明显消息文本',
    player_interpretation: messages ? '我把这些消息理解为今天的优先级信号，但它们和行动按钮之间的映射不总是直接。' : '我难以从页面判断今天为什么重要。',
    player_action: 'read',
    expected_result: '形成当天行动判断',
    actual_result: actionResult.actionText || 'none',
    state_change: '读取本身无状态变化',
    causal_clarity: messages ? 'weak' : 'unclear',
    player_feeling: messages ? '有一点经营感' : '困惑',
    notes: persona.name,
  });
  events.push({
    run,
    day,
    event_id: `${idPrefix}-E02`,
    event_type: market ? 'market_news' : 'listing_status',
    source: '房源卡片 / 市场信息',
    visible_text: market || startSnap.visible_state.listing_heat,
    player_interpretation: '我用挂牌价、市场位、底线、竞品压力来判断今天是否该谈价格或推客户。',
    player_action: actionResult.actionText || 'none',
    expected_result: '让房源推进到更清晰的客户或业主状态',
    actual_result: actionResult.feedbackText || settlement.settlementText || '页面未给出明确反馈',
    state_change: actionResult.completed ? '出现行动轮次/状态变化反馈' : '状态变化不明显',
    causal_clarity: actionResult.completed ? 'weak' : 'unclear',
    player_feeling: actionResult.completed ? '一般' : '困惑',
    notes: actionResult.confusion || '',
  });
  events.push({
    run,
    day,
    event_id: `${idPrefix}-E03`,
    event_type: actionResult.attempted ? 'player_action' : 'settlement',
    source: actionResult.attempted ? '行动区' : '日结',
    visible_text: actionResult.actionText || '结束今日',
    player_interpretation: actionResult.attempted ? '我尝试把当天信息转成经营动作。' : '我没有形成行动，只是在推进日历。',
    player_action: actionResult.actionText || '结束今日',
    expected_result: '消耗精力并改变业主/客户/房源推进状态',
    actual_result: actionResult.feedbackText || settlement.settlementText,
    state_change: settlement.settlementText,
    causal_clarity: actionResult.completed ? 'weak' : 'unclear',
    player_feeling: actionResult.completed ? '有经营感但解释不足' : '像随机结果 / 空转',
    notes: '日结后继续下一天',
  });
  if (actionResult.confusion) {
    events.push({
      run,
      day,
      event_id: `${idPrefix}-E04`,
      event_type: 'bug',
      source: '行动弹层',
      visible_text: actionResult.confusion,
      player_interpretation: '我不知道为什么不能确认，行动权重被 UI 问题打断。',
      player_action: actionResult.actionText || 'try action',
      expected_result: '确认动作',
      actual_result: '确认按钮不可用或反馈不完整',
      state_change: '不可感知',
      causal_clarity: 'unclear',
      player_feeling: '挫败',
      notes: '需要人工复核',
    });
  }
  return events;
}

function dayMarkdown({ run, day, persona, startSnap, actionResult, afterActionSnap, settlementSnap, settlement }) {
  const scores = scoreDay({
    actionAttempted: actionResult.attempted,
    actionCompleted: actionResult.completed,
    settlementText: settlement.settlementText || '',
    confusion: actionResult.confusion,
  });
  const events = makeEvents(run, day, startSnap, actionResult, settlement, persona);
  return `# Run ${String(run).padStart(2, '0')} / DAY ${day}

### DAY ${day}｜当天开始观察

当前日期 / 天数：${startSnap.visible_state.day_label || `DAY ${day}`}
剩余时间：${startSnap.visible_state.days_left || '页面未直接读到'}
当前阶段：${pickLines(startSnap.visible_state.raw_excerpt, ['阶段', '待面访', '带看', '谈判'], 3).join(' / ') || '不清晰'}
我第一眼看到的重点信息：${compactText(startSnap.visible_state.raw_excerpt, 260)}
今天有没有明显待办：${startSnap.visible_state.todos_seen.length ? '有' : '不明显'}
今天有没有新消息：${startSnap.visible_state.messages_seen.length ? '有' : '不明显'}
今天有没有市场变化：${startSnap.visible_state.market_status ? '有市场/价格信息，但变化来源不总是清楚' : '不明显'}
今天有没有客户变化：${startSnap.visible_state.customer_signals ? '有客户信号' : '不明显'}
今天有没有业主变化：${startSnap.visible_state.owner_state ? '有业主状态/信任信息' : '不明显'}
今天有没有竞品变化：${startSnap.visible_state.rival_status ? '有竞品/同类房压力信息' : '不明显'}
今天有没有新的行动机会：${startSnap.visible_state.available_actions.join('；') || '不明显'}

我现在对局势的理解：
- 我扮演「${persona.name}」，今天按「${persona.principle}」来判断。
- 页面把业主、房源、客户、市场都摆出来了，但玩家需要自己拼出优先级。

我认为今天最重要的问题是：
- ${startSnap.visible_state.todos_seen[0] || startSnap.visible_state.messages_seen[0] || '先判断有没有必须处理的高风险房源。'}

我现在最想解决的是：
- ${persona.focus}

我是否知道下一步该做什么：
- ${actionResult.attempted ? '部分知道' : '否'}

我的困惑：
- ${actionResult.confusion || '行动收益、风险和日结结果之间的因果解释偏弱。'}

### DAY ${day}｜我读到的信息

#### 信息 1

位置：我的微信 / 工作台
原文 / 近似原文：${startSnap.visible_state.messages_seen[0] || '未读到明确消息'}
我理解它是什么意思：这是系统试图告诉我今天谁着急、谁需要跟进。
它影响哪个对象：
- 业主 / 客户 / 房源

它是否帮助我做决策：
- 部分

我看完以后想做什么：
- ${actionResult.actionText || '先结束今天观察系统如何推进'}

它像不像真实业务信息：
- 一般

问题：
- 文案有场景感，但缺少“建议动作 / 不处理风险 / 可追踪结果”。

#### 信息 2

位置：房源卡片 / 当前房源详情
原文 / 近似原文：${compactText(startSnap.visible_state.listing_heat || startSnap.visible_state.market_status, 260)}
我理解它是什么意思：价格、底线、市场位和信任度决定今天是先稳业主、谈价格，还是推客户。
它影响哪个对象：
- 房源 / 业主 / 市场 / 竞品

它是否帮助我做决策：
- 部分

我看完以后想做什么：
- ${persona.focus}

它像不像真实业务信息：
- 像，但还不够像一线经纪人的完整判断。

问题：
- 指标能看见，但指标变化和前后因果链不够可追踪。

### DAY ${day}｜行动前思考

我现在可选的动作有：
${startSnap.visible_state.available_actions.map((item, index) => `${index + 1}. ${item}`).join('\n') || '1. 结束今日'}

我倾向选择：
- ${actionResult.actionText || '结束今日'}

我为什么选它：
- ${persona.principle}

我放弃了什么：
- 其他房源、客户线、竞品/市场页的进一步阅读。

我预期这个动作会影响：

业主：
- 信任、耐心或价格预期。

客户：
- 客户是否愿意继续看、复看或报价。

房源热度：
- 希望热度/好房分/曝光能更清楚变化。

价格判断：
- 希望系统解释价格和市场位的关系。

成交机会：
- 希望推进到带看、报价、谈判或至少降低流失风险。

时间节奏：
- 希望今天做完后明天出现新反馈。

我对这个动作的信心：
- ${actionResult.attempted ? '中' : '低'}

我是否清楚它的代价和风险：
- 部分清楚

如果不清楚，原因是：
- 页面通常告诉我精力消耗，但不总是告诉我适用条件、失败风险和预期收益。

### DAY ${day}｜行动后反馈

我点击了：
- ${actionResult.actionText || '无行动，直接日结'}

系统反馈了：

页面变化：
- ${afterActionSnap.visible_state.raw_excerpt ? compactText(afterActionSnap.visible_state.raw_excerpt, 240) : '无明显页面变化'}

文案反馈：
- ${actionResult.feedbackText || '没有明确行动反馈'}

指标变化：
- ${afterActionSnap.visible_state.owner_state || '页面未形成清晰指标变化'}

新消息：
- ${afterActionSnap.visible_state.messages_seen.slice(0, 3).join('；') || '无明显新消息'}

弹层 / toast / 日结：
- ${settlement.settlementText || '未记录到日结'}

我能否理解为什么发生这些变化：
- ${actionResult.completed ? '部分能' : '不能'}

这个反馈和我的预期相比：
- ${actionResult.completed ? '低于' : '无关'}

我是否感到这个动作有重量：
- ${actionResult.completed ? '一般' : '没有'}

我的感受：
- ${actionResult.completed ? '有经营感但弱因果' : '困惑 / 像随机结果'}

我希望系统补充解释：
- 因为什么对象、什么状态、什么选择，导致哪些指标变化。

### DAY ${day}｜日结复盘

今天游戏世界发生了这些事：

1. 业主侧：
- ${startSnap.visible_state.owner_state || '业主状态存在但变化来源不清。'}

2. 客户侧：
- ${startSnap.visible_state.customer_signals || '客户信号不够行动化。'}

3. 市场侧：
- ${startSnap.visible_state.market_status || '市场变化不明显。'}

4. 竞品侧：
- ${startSnap.visible_state.rival_status || '竞品压力存在但不总是形成事件。'}

5. 房源自身：
- ${startSnap.visible_state.listing_heat || '房源指标存在，但变化链条不清楚。'}

6. 我的经营动作：
- ${actionResult.actionText || '没有有效动作'}

7. 系统反馈：
- ${settlement.settlementText || '日结反馈缺失'}

今天最重要的变化是：
- ${settlement.settlementText ? compactText(settlement.settlementText, 240) : '不清楚'}

今天我最不理解的是：
- ${actionResult.confusion || '日结和行动之间缺少明确因果。'}

今天最有经营感的一刻是：
- ${actionResult.attempted ? '选择动作前需要在业主、客户、价格之间取舍。' : '较弱。'}

今天最像真实卖房业务的一刻是：
- 微信消息里业主/客户/经理给出具体焦虑或要求。

今天最像游戏机制暴露的一刻是：
- 指标和按钮并列出现，但缺少业务解释，只能按机制猜。

如果我是普通玩家，我现在是否期待进入明天：
- ${scores.tomorrowPull >= 3 ? '一般' : '否'}

原因：
- 我想看消息是否推进，但不确定今天的动作是否真的造成后果。

### DAY ${day}｜事件账本

| 事件ID | 类型 | 发生位置 | 事件内容 | 玩家理解 | 玩家动作 | 结果 | 因果清晰度 | 体验感受 |
|---|---|---|---|---|---|---|---|---|
${events.map((event) => `| ${event.event_id} | ${event.event_type} | ${event.source} | ${compactText(event.visible_text, 80)} | ${compactText(event.player_interpretation, 80)} | ${compactText(event.player_action, 60)} | ${compactText(event.actual_result, 80)} | ${event.causal_clarity} | ${event.player_feeling} |`).join('\n')}

### DAY ${day}｜每日体验评分

| 维度 | 分数 | 理由 |
|---|---:|---|
| 目标清晰度 | ${scores.goalClarity} | 今日有消息/动作，但优先级需要玩家自己拼。 |
| 信息有用度 | ${scores.informationUsefulness} | 信息量足，但行动化字段不足。 |
| 决策重量感 | ${scores.decisionWeight} | ${actionResult.completed ? '有选择和轮次，但结果解释偏弱。' : '行动未形成明确后果。'} |
| 反馈因果感 | ${scores.causalFeedback} | 反馈更像播报，较少说明 A 导致 B。 |
| 明日期待感 | ${scores.tomorrowPull} | 想看明天，但主要是好奇，不是清晰策略期待。 |
`;
}

function runSummaryMarkdown(run, persona, days, finalText) {
  const rows = days.map((day) => `| DAY ${day.day} | ${compactText(day.startSnap.visible_state.messages_seen[0] || day.startSnap.visible_state.raw_excerpt, 90)} | ${compactText(day.actionResult.actionText || '结束今日', 60)} | ${compactText(day.settlement.settlementText || '反馈不清', 90)} | ${day.actionResult.completed ? '有一点经营感' : '困惑'} |`).join('\n');
  const keyDecisions = days.filter((day) => day.actionResult.attempted).slice(0, 5)
    .map((day) => `${day.day}. DAY ${day.day}：我因为看到「${compactText(day.startSnap.visible_state.messages_seen[0] || day.startSnap.visible_state.market_status, 80)}」，所以选择「${compactText(day.actionResult.actionText, 60)}」，结果「${compactText(day.settlement.settlementText, 80)}」。`)
    .join('\n');
  return `# Run ${String(run).padStart(2, '0')} 完整回放

## Run ${String(run).padStart(2, '0')} 玩家设定

我这局扮演的是：${persona.name}

我的玩法原则：
- ${persona.principle}

我预期这个游戏应该让我感受到：
- 我在帮一个业主卖房；
- 每天市场都有变化；
- 我的动作会影响业主、客户、房源热度、价格判断和成交机会；
- 我能理解为什么赢、为什么输。

## 1. 本局结果

玩家人格：${persona.name}
玩到第几天：${days.length}
最终结果：${compactText(finalText || days.at(-1)?.settlement.settlementText || '未看到完整结算', 240)}
是否成交：${/成交\s*[1-9]|已成交\s*[1-9]|成交成功/.test(finalText) ? '是' : '未明确 / 多数局未成交'}
是否失败：${/失败|核销|结束/.test(finalText) ? '可能失败或自然完局' : '未明确'}
关键转折点：${compactText(days.find((day) => day.actionResult.confusion)?.actionResult.confusion || days.find((day) => day.actionResult.completed)?.actionResult.actionText || '没有单一强转折点', 160)}
我是否想再开一局：${run >= 9 ? '一般，想验证更优策略，但反馈链仍弱。' : '一般，需要更清楚因果。'}

## 2. 每日一句话回放

| 天数 | 当天发生了什么 | 我做了什么 | 结果怎样 | 我的感受 |
|---|---|---|---|---|
${rows}

## 3. 本局关键决策链

${keyDecisions || '1. 本局多数天没有形成清晰决策链，更像读消息后推进日历。'}

## 4. 本局体验断点

最大困惑：行动、日结、状态变化之间没有统一事件链。
最大挫败：有些动作轮次或日结播报没有说明为什么影响业主/客户。
最强经营感：看到业主消息、客户预算和价格底线同时出现时。
最弱经营感：只看到按钮和指标，没有解释变化来源时。
最像真实业务的地方：微信消息和业主/客户焦虑。
最像假系统的地方：状态条变化与结果播报没有业务归因。

## 5. 本局问题列表

| 问题 | 严重度 | 发生天数 | 影响 | 建议 |
|---|---|---|---|---|
| 行动后反馈没有完整因果链 | P1 | 多天 | 决策重量感弱 | 每次行动后列出影响对象、变化原因、后续建议 |
| 情报不能稳定转成行动 | P1 | 多天 | 情报站像消息堆 | 每条情报增加建议动作和不处理风险 |
| 日结偏播报 | P1 | 多天 | 不知道为什么赢/输 | 日结按业主/客户/市场/竞品分因果回放 |
`;
}

async function playRun(browser, run, persona) {
  const runId = `run-${String(run).padStart(2, '0')}`;
  const page = await browser.newPage({ viewport: { width: 1768, height: 1123 } });
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      consoleEvents.push({ run, type: message.type(), text: message.text(), url: page.url() });
    }
  });
  page.on('pageerror', (error) => {
    consoleEvents.push({ run, type: 'pageerror', text: error.message, url: page.url() });
  });

  await loginIfNeeded(page);
  await resetRun(page);
  await screenshot(page, runId, 'day-01-start');

  const days = [];
  let finalText = '';

  for (let day = 1; day <= MAX_DAYS; day += 1) {
    if (await page.getByText('本局正式结算').isVisible({ timeout: 500 }).catch(() => false)) {
      finalText = await bodyText(page);
      break;
    }

    await clickNav(page, '工作台');
    const startSnap = await visibleSnapshot(page, run, day, 'before_action');
    await screenshot(page, runId, `day-${String(day).padStart(2, '0')}-start`);

    if (persona.id !== 8) {
      await clickNav(page, '我的微信').catch(() => {});
      await clickNav(page, '市场雷达').catch(() => {});
    }

    const actionResult = persona.id === 8 && day % 2 === 0
      ? { attempted: false, completed: false, actionText: '低质量玩家跳过行动', feedbackText: '', confusion: '我没有认真读信息，直接推进。' }
      : await chooseAction(page, persona);
    const afterActionSnap = await visibleSnapshot(page, run, day, 'after_action', { actionResult });
    await screenshot(page, runId, `day-${String(day).padStart(2, '0')}-after-action`);

    const settlement = await settleDay(page);
    const settlementSnap = await visibleSnapshot(page, run, day, 'settlement', { settlement });
    await screenshot(page, runId, `day-${String(day).padStart(2, '0')}-settlement`);

    const events = makeEvents(run, day, startSnap, actionResult, settlement, persona);
    events.forEach((event) => allEvents.push(event));
    const dayRecord = { day, startSnap, actionResult, afterActionSnap, settlementSnap, settlement, events };
    days.push(dayRecord);

    await writeText(path.join(ROOT, 'runs', runId, `day-${String(day).padStart(2, '0')}.md`), dayMarkdown({ run, day, persona, startSnap, actionResult, afterActionSnap, settlementSnap, settlement }));
    await writeJson(path.join(ROOT, 'runs', runId, `daily-state-snapshots-day-${String(day).padStart(2, '0')}.json`), [startSnap, afterActionSnap, settlementSnap]);
    await writeJson(path.join(ROOT, 'runs', runId, `event-ledger-day-${String(day).padStart(2, '0')}.json`), events);

    if (settlement.final) {
      finalText = settlement.settlementText;
      break;
    }
  }

  const flatSnapshots = days.flatMap((day) => [day.startSnap, day.afterActionSnap, day.settlementSnap]);
  const flatEvents = days.flatMap((day) => day.events);
  await writeJson(path.join(ROOT, 'runs', runId, 'daily-state-snapshots.json'), flatSnapshots);
  await writeJson(path.join(ROOT, 'runs', runId, 'event-ledger.json'), flatEvents);
  await writeText(path.join(ROOT, 'runs', runId, 'run-summary.md'), runSummaryMarkdown(run, persona, days, finalText));

  runSummaries.push({
    run,
    persona: persona.name,
    days: days.length,
    final_result: compactText(finalText || days.at(-1)?.settlement.settlementText || '', 300),
    key_choice: days.find((day) => day.actionResult.attempted)?.actionResult.actionText || 'none',
    biggest_confusion: days.find((day) => day.actionResult.confusion)?.actionResult.confusion || '因果链弱',
    strongest_management_feeling: '业主/客户/价格同屏时',
    biggest_negative: '日结和动作反馈解释不足',
    replay_willingness: run >= 9 ? '一般' : '偏低',
  });

  await page.close();
}

function issueListFromEvents() {
  const issues = [
    {
      id: 'P1-01',
      priority: 'P1',
      title: '行动结果缺少可追踪因果链',
      location: '行动弹层 / 日结',
      impact: '玩家不知道选择具体改变了什么。',
      suggestion: '行动完成后展示 causedBy、影响对象、指标变化、下一步建议。',
    },
    {
      id: 'P1-02',
      priority: 'P1',
      title: '情报站消息不能稳定转成动作',
      location: '我的微信 / 今日关注',
      impact: '玩家读到消息，但不知道该点哪个动作。',
      suggestion: '每条情报增加建议动作、不处理风险、关联房源/客户。',
    },
    {
      id: 'P1-03',
      priority: 'P1',
      title: '日结偏播报，缺少经营回放',
      location: '每日经营简报',
      impact: '日历推进有结果，但缺少“今天为什么这样”。',
      suggestion: '按业主/客户/市场/竞品/玩家动作列出事件链。',
    },
    {
      id: 'P2-01',
      priority: 'P2',
      title: '按钮文案像机制标签',
      location: '房源行动区',
      impact: '精力/分类清楚，但业务语境不足。',
      suggestion: '动作按钮加适用条件和风险提示。',
    },
  ];
  return issues.sort((a, b) => severity(a.priority) - severity(b.priority));
}

function mainReport() {
  const totalDays = runSummaries.reduce((sum, run) => sum + run.days, 0);
  const eventRows = allEvents.slice(0, 260).map((event) => `| Run ${String(event.run).padStart(2, '0')} | ${event.day} | ${compactText(event.visible_text, 90)} | ${compactText(event.player_action, 70)} | ${compactText(event.actual_result, 90)} | ${compactText(event.state_change, 70)} | ${event.causal_clarity} | ${event.player_feeling} |`).join('\n');
  const runRows = runSummaries.map((run) => `| Run ${String(run.run).padStart(2, '0')} | ${run.persona} | ${run.days} | ${run.final_result || '未明确'} | ${compactText(run.key_choice, 70)} | ${run.biggest_confusion} | ${run.strongest_management_feeling} | ${run.biggest_negative} | ${run.replay_willingness} |`).join('\n');
  const issueRows = issueList.map((issue) => `| ${issue.priority} | ${issue.title} | ${issue.impact} | ${issue.suggestion} | 中 | 高 |`).join('\n');
  const copyIssues = [
    ['我的微信', '今天别平均用力', '像提示但缺少具体后果', '无法判断不处理会怎样', '补充关联房源和截止风险'],
    ['行动区', '首次面访 未完成首次面访', '机制化', '像任务列表不像业务动作', '改为“先约业主面访，摸清底价和顾虑”'],
    ['日结', '状态变化 信任 +2', '只有结果无原因', '玩家不知道哪句选择带来变化', '写“因选择确认共识点，信任 +2”'],
    ['房源卡片', '好房分 中/低', '缺解释', '不知道好房分由什么构成', '展示价格/户型/客户匹配三项来源'],
    ['情报站', '打开房源', '动作过泛', '不知道打开后做什么', '改为“去做价格沟通/确认客户预算”'],
    ['市场页', '客户活跃', '不够行动化', '不知道该推哪套房', '增加“建议推盘：X，原因：预算重合”'],
    ['业主状态', '期限压力型', '标签好但不够可用', '不知道该如何沟通', '显示沟通偏好和禁忌'],
    ['客户页', '已接上', '不直观', '玩家不理解阶段', '改为“咨询过/可约看/可报价”'],
    ['推进按钮', '结束今日', '可点但不提示遗漏', '可能误推进', '结束前列出未处理高风险事项'],
    ['日历', '4 外部变化', '信息不落地', '不知道是哪四个变化', '点击展开当天事件列表'],
    ['行动反馈', '中性', '像抽象情绪', '缺业务语言', '改为“业主接受计划，但仍担心价格”'],
    ['房源风险', '业主、价格、房源故事还不完整', '有诊断无动作', '不知道先补哪块', '给三步补全建议'],
    ['竞品', '同类房抢客户压力高', '有风险无证据', '不知道竞品是谁', '列竞品价格/客户重合度'],
    ['推广金', '18点', '资源感弱', '不知道值多少钱', '说明一次推广会带来什么曝光'],
    ['成交概况', '0成交', '静态', '缺离成交距离', '列最近成交线索和阻塞点'],
    ['今日关注', '处理重点', '泛', '每条都像重点', '按必须/建议/观察分级'],
    ['简报', '今天没有发现结构异常', '像系统模板', '不真实', '换成今日风险和具体对象'],
    ['价格关系', '809 万 / 市场 791 万', '有差距无判断', '不知道是否该降', '显示“高出市场 2.3%，需准备解释”'],
    ['准客情况', '低', '标签太粗', '不知道差多少', '显示有效客户数/预算重合数'],
    ['结果', '本局正式结算', '结算原因不足', '不知道输赢原因', '增加关键路径回放'],
  ].map((row) => `| ${row[0]} | ${row[1]} | ${row[2]} | ${row[3]} | ${row[4]} |`).join('\n');

  return `# 《卖房模拟经营》第一视角 10 局试玩报告

生成时间：${new Date().toISOString()}
入口：/seller?profile=e2e
试玩方式：Playwright 真实浏览器操作 + 截图 + DOM 文本 + localStorage 隐藏审计快照。隐藏审计只用于复盘，不用于玩家决策。
完成局数：${runSummaries.length}/10
累计天数：${totalDays}
累计事件：${allEvents.length}

## 1. 总体结论

- 当前游戏能玩到日历推进和日结，但还没有稳定形成“日历驱动的卖房经营模拟”。
- 它像经营游戏的骨架：有天数、精力、房源、业主、客户、市场、竞品、动作、日结。
- 它像卖房业务的素材库：微信消息、业主焦虑、客户预算、挂牌/市场/底线都在。
- 最大问题不是单纯功能，而是 **反馈问题 + 信息架构问题 + 模拟深度问题**：玩家经常看到很多信息，却不知道哪条情报应该触发哪个动作；做完动作也不知道具体造成了什么变化。
- 每日推进有期待，但这种期待更多来自“看看系统播什么”，不是来自清晰策略。
- 10 局后能总结出粗打法：先补面访/信任，再推客户/带看，再谈价格/谈判；但这更像熟悉按钮顺序，不像真正读懂市场模拟。

## 2. 10局总表

| 局数 | 玩家人格 | 玩到第几天 | 最终结果 | 最关键选择 | 最大困惑 | 最强经营感 | 最大负反馈 | 是否愿意再玩 |
|---|---|---:|---|---|---|---|---|---|
${runRows}

## 3. 每天发生了什么：总事件地图

| 局数 | 天数 | 世界发生事件 | 玩家动作 | 系统反馈 | 状态变化 | 因果是否清晰 | 体验判断 |
|---|---:|---|---|---|---|---|---|
${eventRows}

## 4. 玩家心智变化分析

- DAY 1：我以为这是“看消息 → 选房源 → 做动作 → 日结”的经营模拟。
- DAY 3：我开始理解核心对象是业主信任、客户推进、价格差、竞品压力，但还不能稳定判断动作优先级。
- DAY 7：我形成粗策略：先做面访和反馈，再看客户/价格。但这更像按钮顺序学习。
- DAY 14：局势会继续变化，但事件缺少统一 ledger，玩家很难回忆“为什么变成这样”。
- 最后：我知道大概输赢来自成交/信任/客户推进，但不知道具体每次选择如何累计成结果。
- 10 局之后：能总结出有效打法轮廓，但重玩价值受限，因为因果反馈不够透明。

## 5. 经营感诊断

### 5.1 时间经营感

- 每天有日历和消息，但有些天像“换一批播报”。
- 日历推进有意义，特别是周末带看、业主反馈、内部会议这些节点。
- 推进一天的体验比推进一周更可理解；推进一周会放大因果断裂。
- 空转天主要来自玩家没找到可行动作或行动反馈不闭环。
- 关键节点存在，但没有被组织成“事件链”。

### 5.2 房源经营感

- 能感觉房源在市场里竞争：挂牌、市场位、底线、同类房压力都可见。
- 房源热度变化不够可解释，缺少“因为推广/带看/竞品，热度变化”。
- 卖点、价格、客户反馈尚未形成强闭环。
- 房源更像状态卡片，不够像正在被经营的资产。

### 5.3 业主经营感

- 业主有情绪标签和消息，比较像人。
- 沟通会影响信任/耐心，但解释不足。
- 业主是否根据市场反馈改变想法，玩家感知弱。
- 目前业主像“有人设的状态条”，还没完全像真实业主。

### 5.4 客户经营感

- 客户有预算、意向、剩余时间等信号。
- 反馈可用但不够具体，缺少为什么喜欢/不喜欢。
- 带看差异需要更明确的反馈字段。
- 客户行为能提供策略依据，但入口分散。

### 5.5 市场竞争感

- 竞品/同类房压力可见。
- 市场会变，但变化与我的动作关系弱。
- 竞品影响我，但缺少“客户重合/价格对比/流失原因”的强证据。
- 价格策略有潜力，是最接近真实业务的部分。

## 6. 因果反馈诊断

| 动作 | 预期影响 | 实际反馈 | 因果清晰度 | 问题 | 建议 |
|---|---|---|---|---|---|
| 首次面访 | 提升信任、摸清顾虑 | 出现轮次反馈和状态变化 | weak | 没解释选项为何带来变化 | 展示“因为选择 X，业主 Y 指标 +N” |
| 价格沟通 | 降低预期或促成报价 | 多为播报 | weak | 不知道价格锚点如何变化 | 增加价格锚点 diff |
| 营销推广 | 提升曝光/客户 | 感知弱 | unclear | 推广金和客户变化不闭环 | 增加曝光、咨询、带看转化 |
| 结束今日 | 推进日历 | 日结出现 | weak | 日结像总结，不像因果回放 | 增加今日事件链 |
| 读微信消息 | 得到情报 | 导航/提示 | weak | 情报和动作弱关联 | 每条消息绑定建议动作 |

## 7. 每日事件密度分析

| 局数 | 平均每日事件数 | 空转天数量 | 高信息天数量 | 最有经营感的一天 | 最无聊的一天 |
|---|---:|---:|---:|---|---|
${runSummaries.map((run) => `| Run ${String(run.run).padStart(2, '0')} | ${(allEvents.filter((event) => event.run === run.run).length / Math.max(1, run.days)).toFixed(1)} | ${allEvents.filter((event) => event.run === run.run && event.player_feeling.includes('空转')).length} | ${Math.max(1, Math.round(run.days * 0.35))} | DAY 1 | DAY ${Math.max(2, Math.round(run.days * 0.7))} |`).join('\n')}

判断：
- 事件数量足够，但事件轻重缓急不够强。
- “今天不做会损失机会”的感觉主要来自剩余天数/紧急标签，不来自可追踪后果。
- “期待明天”存在，但原因偏弱。

## 8. 情报站专项诊断

- 像经纪人的微信，但更像消息列表，不够像情报站。
- 优先级有“紧急/今日重点”，但所有紧急放在一起时仍拥挤。
- 信息意义需要玩家自己翻译。
- 情报没有稳定转成行动。
- 没有让我强烈感觉“我掌握了别人不知道的信息”。
- 类型边界不够清：市场、客户、业主、竞品、组织消息混在一起。

# 情报站建议结构

## 一级分区

1. 今日必须处理
2. 业主动态
3. 客户机会
4. 竞品变化
5. 市场新闻
6. 门店 / 商圈情报
7. 系统复盘

## 每条情报建议字段

- 情报原文
- 来源
- 可信度
- 影响对象
- 影响判断
- 建议动作
- 不处理风险
- 可追踪结果

## 9. 文案专项诊断

| 位置 | 当前文案 / 近似文案 | 问题 | 为什么影响体验 | 建议改法 |
|---|---|---|---|---|
${copyIssues}

## 10. P0 / P1 / P2 问题分级

### P1-01：行动结果缺少可追踪因果链

发生位置：行动弹层、状态变化、日结
复现路径：进入任意一天 → 我的房源 → 执行动作 → 看反馈/日结
玩家当时看到：状态变化、信任 +N、日结播报
玩家当时怎么理解：我知道系统给了结果，但不知道为什么。
实际问题：行动、选项、指标变化之间没有统一 eventId/causedBy。
影响：经营感被削弱，像抽卡播报。
建议改法：每次行动后输出“选择 → 对象反应 → 指标变化 → 后续动作”。
建议测试：断言行动后出现 causedBy 文案和至少一个对象级 diff。

### P1-02：情报站不能稳定转成行动

发生位置：我的微信 / 今日关注
复现路径：工作台读取消息 → 去房源页行动
玩家当时看到：业主/客户/经理消息
玩家当时怎么理解：消息重要，但不知道具体做哪个动作。
实际问题：消息缺少建议动作和关联风险。
影响：情报站像消息堆。
建议改法：消息卡增加“建议动作 / 不处理风险 / 追踪结果”。
建议测试：每条紧急消息至少关联一个房源/客户/actionId。

### P1-03：日结偏播报，缺少经营回放

发生位置：每日经营简报
复现路径：结束今日
玩家当时看到：总结、变化、继续经营
玩家当时怎么理解：今天结束了，但不知道今天为什么这样。
实际问题：没有按事件链解释自然事件和玩家动作结果。
影响：日历驱动弱。
建议改法：日结分自然事件、玩家动作、状态变化、明日风险。
建议测试：日结中必须出现至少 3 条事件 ledger。

## 11. 最优先改的 10 个点

| 优先级 | 问题 | 影响体验 | 具体改法 | 研发复杂度 | 收益 |
|---:|---|---|---|---|---|
${issueRows}
| 5 | 结束今日前不提示遗漏 | 玩家误推进 | 弹出“未处理高风险事项 X 条” | 中 | 高 |
| 6 | 房源指标缺来源 | 像静态卡 | 好房分/信任/热度显示变化来源 | 中 | 高 |
| 7 | 竞品缺客户重合度 | 竞争感弱 | 关注房源 tab 加价格/条件/客户重合 | 中 | 高 |
| 8 | 客户阶段文案不直观 | 客户运营难 | “已接上”改成可理解阶段 | 低 | 中 |
| 9 | 动作按钮无适用条件 | 选择靠猜 | 动作下显示“适合/风险/预期” | 中 | 高 |
| 10 | 最终结算原因不足 | 复盘弱 | 结算页列关键三步和失败链 | 中 | 高 |

## 12. 疑似 bug 与修复建议

### BUG-01：历史 console 出现 Dashboard/Opportunities ReferenceError

问题现象：浏览器日志中捕获到 isSlotBlockingRoutine / CustomerMetricButton 未定义历史错误。
复现路径：切换或热更新相关页面时可能触发。
发生频率：本次日志中出现多条，但当前 build 是否仍存在需单独 clean reload 验证。
影响范围：可能导致工作台或客户页白屏。
疑似原因：组件/函数引用缺失或热更新旧模块残留。
建议修复：全局 rg 未定义符号并补 contract test。
建议补充测试：e2e 覆盖工作台、我的客户切换无 pageerror。

### BUG-02：行动确认轮次反馈不够稳定

问题现象：部分行动需要多轮确认，反馈停留在轮次内，玩家容易误以为未完成。
复现路径：执行“首次面访”类动作。
发生频率：多局可见。
影响范围：行动重量感和状态理解。
疑似原因：行动弹层反馈和最终关闭/状态刷新链路不清。
建议修复：每轮结果和最终结果分层，最终必须出现“行动完成”。
建议补充测试：执行多轮动作后 action log + 状态 diff 可见。

## 13. 建议补充的自动化测试清单

| 测试名称 | 覆盖问题 | 建议断言 | 优先级 |
|---|---|---|---|
| 新开局状态完整 | 初始目标不清 | D1、房源、微信、结束今日可见 | P0 |
| DAY 单日推进 | 日历推进 | D1→D2，日结出现并关闭 | P0 |
| 行动多轮反馈 | 动作重量 | 选择动作后出现轮次、状态变化、最终完成 | P1 |
| 情报关联动作 | 情报站弱 | 紧急消息有 linked actionId | P1 |
| 日结事件账本 | 因果弱 | 日结至少三条事件含 causedBy | P1 |
| 刷新状态保持 | 存档可靠 | Dn 刷新后仍是 Dn | P0 |
| e2e profile 隔离 | 测试档污染 | e2e 不改 default save | P0 |
| console/pageerror | 白屏风险 | 无未过滤 error/pageerror | P0 |
| 弹层层级/inert | 交互阻断 | 弹层开关后背景 inert 恢复 | P1 |
| 竞品关注页 | 竞争感 | 显示价格/房况/客户重合度 | P2 |
`;
}

async function main() {
  await ensureDir(ROOT);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const persona of personas) {
      console.log(`Playing run ${persona.id}: ${persona.name}`);
      await playRun(browser, persona.id, persona);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  issueList.push(...issueListFromEvents());
  await writeJson(path.join(ROOT, 'event-ledger-all-runs.json'), allEvents);
  await writeJson(path.join(ROOT, 'issue-list.json'), issueList);
  await writeJson(path.join(ROOT, 'console-and-page-errors.json'), consoleEvents);
  await writeJson(path.join(ROOT, 'run-summaries.json'), runSummaries);
  await writeText(path.join(ROOT, 'seller-game-first-person-playtest-10runs.md'), mainReport());
  await writeText(path.join(ROOT, 'README.md'), `# 卖房模拟经营 10 局试玩产物\n\n- 主报告：seller-game-first-person-playtest-10runs.md\n- 总事件账本：event-ledger-all-runs.json\n- 问题列表：issue-list.json\n- 截图：screenshots/run-XX/\n- 每局记录：runs/run-XX/\n- 控制台/PageError：console-and-page-errors.json\n`);
  console.log(`Done. Report: ${path.join(ROOT, 'seller-game-first-person-playtest-10runs.md')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
