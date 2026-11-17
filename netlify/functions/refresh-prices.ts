// Netlify Scheduled Function: fetch auction house prices for gear net worth (see apps/api/src/prices.ts).
import '../../apps/api/src/netlify-env.js';
import { getDeps } from '../../apps/api/src/deps.js';
import { refreshAllAuctionPrices } from '../../apps/api/src/prices.js';

export default async () => {
  const deps = await getDeps();
  // Scheduled functions have a 30s limit: stop starting new auction houses after 20s and save what we have.
  const priced = await refreshAllAuctionPrices(deps.db, deps.blizzard, { maxAgeMinutes: 50, deadline: Date.now() + 20_000 });
  console.log(`Auction prices: ${priced} item(s) priced`);
  return new Response(JSON.stringify({ priced }), { headers: { 'Content-Type': 'application/json' } });
};

export const config = {
  schedule: '17 * * * *',
};
