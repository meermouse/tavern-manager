// Netlify Function serving the whole backend (/api/* and /auth/*).
import { Hono } from 'hono';
import { handle } from 'hono/netlify';
import '../../apps/api/src/netlify-env.js';
import { createApp } from '../../apps/api/src/app.js';
import { getDeps } from '../../apps/api/src/deps.js';

let api: ReturnType<typeof createApp> | null = null;

/** Pictures take longer to paint than this function may run, so a background function does it. */
async function dispatchImageJob(imageId: string, origin: string) {
  const res = await fetch(`${origin}/.netlify/functions/generate-image-background`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageId }),
  });
  if (!res.ok) throw new Error(`Background function answered ${res.status}`);
}

const app = new Hono();
app.all('*', async (c) => {
  api ??= createApp({ ...(await getDeps()), dispatchImageJob });
  return api.fetch(c.req.raw);
});

export default handle(app);

export const config = {
  path: ['/api/*', '/auth/*'],
};
