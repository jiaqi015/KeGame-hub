# Selling Houses Browser Regression Checklist

Purpose: keep the browser-level happy path for “我是王牌资产顾问” from regressing when no Playwright-style e2e runner is installed in this repo.

Run target:

- Start local app: `PORT=3001 AUTH_LOCAL_WHITELIST='codex@ke.com=all' npm run dev`
- Open default profile: `http://localhost:3001/seller`
- Open non-destructive test profile: `http://localhost:3001/seller?profile=e2e`
- Use a non-production local test account only.
- Reset only inside `?profile=e2e`; do not clear default profile localStorage during regression.

## Path 1: Day 1 to Day 2 and refresh

1. Enter `http://localhost:3001/seller?profile=e2e`.
2. Confirm the header shows the `测试档` marker, then start a standard run.
3. Confirm Header and Dashboard both show `DAY 1` and today is highlighted.
4. Click `结束今日`.
5. Confirm daily summary appears.
6. Click `继续经营`.
7. Confirm Header and Dashboard both show `DAY 2`.
8. Refresh the page.
9. Confirm it still shows `DAY 2` and does not return to `DAY 1`.

Expected result: pass. Day, today highlight, today plan and energy stay aligned after refresh.

## Path 2: Week advance and refresh

1. From `DAY 2`, click `推进一周`.
2. Confirm toast says it settled 7 days and moved to `DAY 9`, or a legal final day if the run ended.
3. Confirm Header, Dashboard today highlight and today plan all match the final day.
4. Refresh the page.
5. Confirm the final day remains and does not roll back.

Expected result: pass. No stale day cell remains selected, and `http://localhost:3001/seller` keeps its separate default save.

## Path 3: Drawer isolation

1. Open `今日变化`.
2. Confirm the underlying workspace is visually dimmed and header controls are not focusable or clickable.
3. Close the drawer.
4. Open a resource drawer, such as `今日精力`.
5. Confirm the underlying `结束今日` / `推进一周` controls are not focusable or clickable.
6. Close the drawer and confirm the controls work again.

Expected result: pass. Drawer overlays own interaction; underlying workspace is inert while open.

## Path 4: Disabled action recommendation

1. Progress or load a run state where the case detail action area shows `当前可做 0 / 15`.
2. Confirm there is no primary action button that can be clicked but produces no feedback.
3. Confirm the empty state explains the case has no directly executable action.

Expected result: pass. Blocked actions appear only in `暂不可做`, not as a live recommended action.

## Path 5: Dashboard right rail My Wechat

1. Enter `http://localhost:3001/seller?profile=e2e` and reset the test profile.
2. Confirm the Dashboard right rail title is `我的微信`.
3. Confirm the default tab is `消息` and it shows owner / customer / manager or store-manager style human messages.
4. Confirm the first few messages explain today’s action pressure without exposing internal metric words.
5. Click `公众号` and confirm market, district, community, competitor, or method articles are visible.
6. Click the first message and confirm it opens the related case in the `房源` view.
7. Return to Dashboard, click the first official account article, and confirm it opens a related case or the market view.
8. Confirm the current `DAY` does not change after those clicks.
9. Confirm `localRevision` and the default `/seller` save are not changed by message/article clicks in the `e2e` profile.

Expected result: pass. The right rail behaves like a local external-world inbox, but it does not advance time, alter saves, or pollute the default profile.

## Recording

For each manual regression, record:

- Date/time:
- Browser/session/profile:
- Starting day:
- Ending day:
- Console errors/warnings:
- Result:
- Notes:
