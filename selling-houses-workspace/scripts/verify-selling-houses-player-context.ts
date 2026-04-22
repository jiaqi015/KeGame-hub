import assert from 'node:assert/strict';

import { buildSellingHousesPlayerContext } from '../src/selling-houses/application/playerContext.js';

{
  const context = buildSellingHousesPlayerContext({
    accountId: 'acct_123',
    email: 'yangjiaqi015@ke.com',
    nickname: '杨佳琦',
  });

  assert.equal(context.accountScopeKey, 'acct_123', 'expected accountId to be the primary storage scope');
  assert.equal(context.displayName, '杨佳琦', 'expected nickname to stay as the player display name');
  assert.equal(context.emailScopeKey, 'yangjiaqi015@ke.com', 'expected email to remain available as a secondary scope');
}

{
  const context = buildSellingHousesPlayerContext({
    email: 'yangjiaqi015@ke.com',
    nickname: 'yangjiaqi015',
  });

  assert.equal(context.accountScopeKey, 'yangjiaqi015@ke.com', 'expected email to be used when accountId is missing');
  assert.equal(context.displayName, 'yangjiaqi015', 'expected nickname fallback to remain user-facing only');
}

{
  const context = buildSellingHousesPlayerContext({
    nickname: '临时顾问',
  });

  assert.equal(context.accountScopeKey, 'guest', 'expected guest scope when account identity is unavailable');
  assert.equal(context.displayName, '临时顾问', 'expected nickname-only sessions to still render a player label');
}

console.log('selling-houses player context verification passed');
