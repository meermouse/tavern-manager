// Local / self-hosted Node server. On Netlify the same app runs as a function (see /netlify/functions).
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createApp } from './app.js';
import { createDeps } from './deps.js';
import { refreshStale } from './sync.js';

const deps = await createDeps();
const { config } = deps;
const api = createApp(deps);

const server = new Hono();
server.route('/', api);

// In production, also serve the built web app (single-process deploys).
const webDist = resolve(process.env.WEB_DIST ?? '../web/dist');
if (existsSync(webDist)) {
  server.use('/*', serveStatic({ root: webDist }));
  server.get('*', serveStatic({ root: webDist, path: 'index.html' }));
}

serve({ fetch: server.fetch, port: config.port }, (info) => {
  console.log(`Tavern Tracker API on http://localhost:${info.port}`);
  if (config.devLogin) console.log('  Dev login enabled (no Battle.net credentials needed)');
  if (config.blizzardMock) console.log('  Using mock Blizzard character data');
  if (!config.databaseUrl) console.log(`  Using embedded PGlite database at ${config.pgliteDir}`);
});

// Scheduled refresh.
let running = false;
const intervalMs = config.refreshIntervalMinutes * 60_000;
setInterval(async () => {
  if (running) return;
  running = true;
  try {
    const n = await refreshStale(deps.db, deps.blizzard, { staleMinutes: config.refreshIntervalMinutes, limit: 200 });
    if (n) console.log(`Scheduled refresh: synced ${n} character(s)`);
  } catch (err) {
    console.error('Scheduled refresh failed', err);
  } finally {
    running = false;
  }
}, Math.min(intervalMs, 5 * 60_000));
