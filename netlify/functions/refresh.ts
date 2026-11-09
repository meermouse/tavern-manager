// Netlify Scheduled Function: refresh stale characters from the Blizzard API.
import '../../apps/api/src/netlify-env.js';
import { getDeps } from '../../apps/api/src/deps.js';
import { refreshStale } from '../../apps/api/src/sync.js';

export default async () => {
  const deps = await getDeps();
  // Scheduled functions have a 30s limit, so stop early and pick up the rest next run.
  const synced = await refreshStale(deps.db, deps.blizzard, {
    staleMinutes: deps.config.refreshIntervalMinutes,
    limit: 150,
    deadline: Date.now() + 20_000,
  });
  console.log(`Scheduled refresh: synced ${synced} character(s)`);
  return new Response(JSON.stringify({ synced }), { headers: { 'Content-Type': 'application/json' } });
};

export const config = {
  schedule: '*/30 * * * *',
};
