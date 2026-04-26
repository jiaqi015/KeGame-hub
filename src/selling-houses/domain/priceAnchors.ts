import type { Case } from './models.js';

const OWNER_BOTTOM_ABOVE_MARKET_SPREAD = 5;
const ASK_ABOVE_BOTTOM_SPREAD = 1;

function normalizePrice(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function normalizeOwnerPriceAnchors(input: Pick<Case, 'askPrice' | 'marketPrice' | 'bottomPrice'>) {
  const marketPrice = normalizePrice(input.marketPrice);
  const minimumBottomPrice = marketPrice > 0 ? marketPrice + OWNER_BOTTOM_ABOVE_MARKET_SPREAD : 0;
  const bottomPrice = Math.max(normalizePrice(input.bottomPrice), minimumBottomPrice);
  const askPrice = Math.max(normalizePrice(input.askPrice), bottomPrice + ASK_ABOVE_BOTTOM_SPREAD);

  return {
    askPrice,
    marketPrice,
    bottomPrice,
  };
}
