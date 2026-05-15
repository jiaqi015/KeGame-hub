import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

const TEST_EMAIL = 'codex@ke.com';
const EMAIL_INPUT_PLACEHOLDER = '请输入企业邮箱';

async function waitForSellerSurface(page: Page, timeout = 12_000) {
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return text.includes('选择难度')
      || text.includes('进入标准剧本')
      || text.includes('开一局')
      || text.includes('工作台')
      || text.includes('经营概览')
      || text.includes('今天')
      || text.includes('本局正式结算');
  }, undefined, { timeout });
}

async function loginIfNeeded(page: Page) {
  const surfaceAlreadyReady = await waitForSellerSurface(page, 5_000).then(() => true).catch(() => false);
  if (surfaceAlreadyReady) {
    return;
  }

  const emailInput = page.getByPlaceholder(EMAIL_INPUT_PLACEHOLDER);
  if (await emailInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    if (!(await emailInput.inputValue()).trim()) {
      await emailInput.fill(TEST_EMAIL);
    }
    const continueButton = page.getByRole('button', { name: '继续登录' });
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click();
    } else {
      await page.getByRole('button', { name: '获取验证码' }).click();
    }
  }

  await waitForSellerSurface(page);
}

async function loginToHub(page: Page) {
  await page.goto('/');
  const emailInput = page.getByPlaceholder(EMAIL_INPUT_PLACEHOLDER);
  if (await emailInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await emailInput.fill(TEST_EMAIL);
    await page.getByRole('button', { name: '获取验证码' }).click();
  }
  await expect(page.getByRole('button', { name: '退出账号' })).toBeVisible();
}

async function openSeller(page: Page, path: string) {
  await page.goto(path);
  await loginIfNeeded(page);
}

async function sellerSaveKeys(page: Page) {
  return page.evaluate(() => Object.keys(window.localStorage)
    .filter((key) => key.startsWith('selling-world-save-v3'))
    .sort());
}

async function e2eSaveSnapshot(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(window.localStorage)
      .filter((entry) => entry.startsWith('selling-world-save-v3'))
      .find((entry) => entry.includes('e2e'));
    if (!key) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { localRevision?: number; day?: number };
    return { key, localRevision: parsed.localRevision, day: parsed.day };
  });
}

function defaultSaveKeys(keys: string[]) {
  return keys.filter((key) => !key.includes('e2e') && !key.includes('dev'));
}

function defaultSaveFingerprint(keys: string[]) {
  return defaultSaveKeys(keys).join('\n');
}

async function expectUnreadRowsPinned(page: Page, selector: string) {
  const readOrder = await page.locator(selector).evaluateAll((rows) =>
    rows.map((row) => row.getAttribute('data-my-wechat-read')),
  );
  expect(readOrder.length).toBeGreaterThan(0);
  expect(readOrder).toContain('true');
  const firstReadIndex = readOrder.indexOf('true');
  const lastUnreadIndex = readOrder.lastIndexOf('false');
  if (firstReadIndex >= 0 && lastUnreadIndex >= 0) {
    expect(lastUnreadIndex).toBeLessThan(firstReadIndex);
  }
}

async function returnToWorkbench(page: Page) {
  await page.getByRole('button', { name: '工作台' }).click();
}

async function continueFromSummary(page: Page) {
  const enterTodayButton = page.getByRole('button', { name: '进入今天' });
  if (await enterTodayButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await enterTodayButton.click();
    return;
  }
  await page.getByRole('button', { name: '继续经营' }).click();
}

function isKnownConsoleNoise(message: ConsoleMessage) {
  const text = message.text();
  return text.includes('Failed to load resource: the server responded with a status of 401');
}

async function resetE2eProfileToDay1(page: Page) {
  await openSeller(page, '/seller?profile=e2e');
  await expect(page.getByText('测试档 e2e')).toBeVisible();
  await expect(page.getByRole('button', { name: '重置测试档' })).toBeVisible();
  await page.getByRole('button', { name: '重置测试档' }).click();
  await expectTodayRhythmCell(page, 1);
  await expect(page.getByRole('button', { name: '结束今日' })).toBeVisible();
}

async function expectTodayRhythmCell(page: Page, day: number) {
  await expect(page.getByRole('main')).toContainText('7天节奏');
  await expect(page.getByRole('button', { name: '14天' })).toBeVisible();
  await expect(page.getByRole('button', { name: `D${day} 今天` })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(`${day}/21`);
  await expect(page.getByRole('main')).not.toContainText('本周节奏');
}

test('selling-houses e2e profile advances safely without touching default save', async ({ page }) => {
  const consoleMessages: ConsoleMessage[] = [];
  const pageErrors: Error[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      consoleMessages.push(message);
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error));

  await openSeller(page, '/seller');
  const defaultKeysBeforeE2e = defaultSaveFingerprint(await sellerSaveKeys(page));
  await expect(page.getByText('测试档 e2e')).toHaveCount(0);
  await expect(page.getByText('重置测试档')).toHaveCount(0);

  await resetE2eProfileToDay1(page);
  const keysAfterReset = await sellerSaveKeys(page);
  expect(keysAfterReset.some((key) => key.includes('e2e'))).toBe(true);
  expect(defaultSaveFingerprint(keysAfterReset)).toBe(defaultKeysBeforeE2e);

  await expect(page.getByText('我的微信')).toBeVisible();
  await expect(page.getByRole('button', { name: '游戏排行榜' })).toBeVisible();
  await expect(page.getByText('登出账号')).toHaveCount(0);
  await expect(page.locator('[data-my-wechat-tab="消息"]')).toBeVisible();
  const firstWechatMessage = page.locator('[data-my-wechat-message-row="true"]').first();
  await expect(firstWechatMessage).toBeVisible();
  await expect(firstWechatMessage).toHaveAttribute('data-my-wechat-read', 'false');
  await expect(page.getByText(/周女士 业主|先生 业主|女士 业主|张经理|商圈经理/).first()).toBeVisible();
  const snapshotBeforeWechatClick = await e2eSaveSnapshot(page);
  expect(snapshotBeforeWechatClick?.day).toBe(1);

  await firstWechatMessage.click();
  await expect(page.getByRole('button', { name: '返回消息列表' })).toBeVisible();
  expect(await e2eSaveSnapshot(page)).toEqual(snapshotBeforeWechatClick);
  expect(defaultSaveFingerprint(await sellerSaveKeys(page))).toBe(defaultKeysBeforeE2e);

  await page.getByRole('button', { name: '返回消息列表' }).click();
  await returnToWorkbench(page);
  await expect(page.locator('[data-my-wechat-panel="true"]')).toBeVisible();
  await expectUnreadRowsPinned(page, '[data-my-wechat-message-row="true"]');
  await page.locator('[data-my-wechat-tab="公众号"]').click();
  await expect(page.locator('[data-my-wechat-official-row="true"]').first()).toBeVisible();
  await page.locator('[data-my-wechat-official-row="true"]').first().click();
  await expect(page.locator('[data-my-wechat-official-detail="true"]')).toBeVisible();
  expect(await e2eSaveSnapshot(page)).toEqual(snapshotBeforeWechatClick);
  expect(defaultSaveFingerprint(await sellerSaveKeys(page))).toBe(defaultKeysBeforeE2e);

  await page.getByRole('button', { name: '返回公众号列表' }).click();
  await returnToWorkbench(page);
  await page.locator('[data-my-wechat-tab="公众号"]').click();
  await expectUnreadRowsPinned(page, '[data-my-wechat-official-row="true"]');

  await page.getByRole('button', { name: '结束今日' }).click();
  await expect(page.getByText(/第 1 天经营简报/)).toBeVisible();
  await continueFromSummary(page);
  await expectTodayRhythmCell(page, 2);
  await expect(page.getByText(/经营简报/)).toHaveCount(0);

  await page.reload();
  await waitForSellerSurface(page);
  await expectTodayRhythmCell(page, 2);
  await expect(page.getByText(/经营简报/)).toHaveCount(0);

  const keysAfterDay2 = await sellerSaveKeys(page);
  expect(keysAfterDay2.some((key) => key.includes('e2e'))).toBe(true);
  expect(defaultSaveFingerprint(keysAfterDay2)).toBe(defaultKeysBeforeE2e);

  await openSeller(page, '/seller');
  await expect(page.getByText('测试档 e2e')).toHaveCount(0);
  await expect(page.getByText('重置测试档')).toHaveCount(0);
  expect(defaultSaveFingerprint(await sellerSaveKeys(page))).toBe(defaultKeysBeforeE2e);

  await resetE2eProfileToDay1(page);
  await expectTodayRhythmCell(page, 1);
  const advanceWeekButton = page.getByRole('button', { name: '推进一周' });
  await advanceWeekButton.dblclick();
  await expect(page.locator('body')).toContainText('8/21');
  await expect(page.getByText(/已连续结算 7 天|当前到第 8 天/)).toBeVisible();
  await continueFromSummary(page);
  await expectTodayRhythmCell(page, 8);

  await page.reload();
  await waitForSellerSurface(page);
  await expectTodayRhythmCell(page, 8);

  await page.getByRole('button', { name: '查看今日精力详情' }).click();
  await expect(page.locator('[data-seller-interaction-layer="background-inert"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '结束今日' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '推进一周' })).toHaveCount(0);

  const closeButton = page.getByRole('button', { name: '关闭' });
  await expect(closeButton).toBeVisible();
  await closeButton.focus();
  await expect(closeButton).toBeFocused();
  await closeButton.click();

  await expect(page.locator('[data-seller-interaction-layer="active"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '结束今日' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: '推进一周' })).toHaveCount(1);

  for (const day of [8, 9, 10]) {
    await page.getByRole('button', { name: '结束今日' }).click();
    await expect(page.getByText(new RegExp(`第 ${day} 天经营简报`))).toBeVisible();
    await continueFromSummary(page);
    await expectTodayRhythmCell(page, day + 1);
  }

  const morningAgenda = page.locator('[data-seller-agenda-slot="am"]');
  await expect(morningAgenda).toContainText('周四上午聚焦会');
  await expect(morningAgenda).not.toContainText('事项：确认客户需求');
  await expect(morningAgenda).not.toContainText('正在从');

  const ariaFocusWarnings = consoleMessages.filter((message) => {
    const text = message.text();
    return text.includes('aria-hidden')
      || text.includes('blocked aria-hidden')
      || text.includes('focus inside')
      || text.includes('hidden subtree')
      || (text.includes('Received an empty string for a boolean attribute') && text.includes('inert'));
  });
  const consoleErrors = consoleMessages.filter((message) => message.type() === 'error' && !isKnownConsoleNoise(message));
  expect(ariaFocusWarnings.map((message) => message.text())).toEqual([]);
  expect(consoleErrors.map((message) => message.text())).toEqual([]);
  expect(pageErrors.map((error) => error.message)).toEqual([]);
});

test('authenticated hub session restores on home reload', async ({ page }) => {
  await loginToHub(page);

  await page.reload();

  await expect(page.getByRole('button', { name: '退出账号' })).toBeVisible();
  await expect(page.getByRole('button', { name: '继续登录' })).toHaveCount(0);
  await expect(page.getByText(/工作\s*skill/i)).toBeVisible();
});
