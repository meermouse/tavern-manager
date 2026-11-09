// Netlify Function serving the whole backend (/api/* and /auth/*).
import { Hono } from 'hono';
import { handle } from 'hono/netlify';
import '../../apps/api/src/netlify-env.js';
import { createApp } from '../../apps/api/src/app.js';
import { getDeps } from '../../apps/api/src/deps.js';

let api: ReturnType<typeof createApp> | null = null;

const app = new Hono();
app.all('*', async (c) => {
  api ??= createApp(await getDeps());
  return api.fetch(c.req.raw);
});

export default handle(app);

export const config = {
  path: ['/api/*', '/auth/*'],
};
