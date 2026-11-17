// Netlify Background Function: paints one admin-requested feed picture (see docs/generated-images.md).
// The API function starts it with POST { imageId } and gets 202 straight away; this then has up to 15 minutes,
// where a normal function would time out long before the image API answers.
// It only paints pictures that are still pending, which only a tavern admin can create, so calling it directly
// can't do anything an admin didn't ask for, and a duplicate call does nothing.
import '../../apps/api/src/netlify-env.js';
import { getDeps } from '../../apps/api/src/deps.js';
import { runImageJob } from '../../apps/api/src/images/jobs.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async (req: Request) => {
  const body = (await req.json().catch(() => null)) as { imageId?: unknown } | null;
  const imageId = typeof body?.imageId === 'string' && UUID_RE.test(body.imageId) ? body.imageId : null;
  if (!imageId) return;
  const deps = await getDeps();
  await runImageJob(deps.db, deps.images ?? null, imageId);
};
