import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { badRequest, jsonBody, requireUser, uuidParam, type AppDeps, type AppEnv } from '../context.js';
import { tavernFeed } from '../feed.js';
import { IMAGE_STATUS_SQL, runImageJob } from '../images/jobs.js';
import { buildScene, type SceneCharacter } from '../images/scene.js';
import { adminTavern, tavernMembership } from '../tavernAccess.js';

/** How many of the latest posts an admin can paint at once. */
export const MAX_IMAGE_POSTS = 20;
export const DEFAULT_IMAGE_POSTS = 5;

/**
 * Admin-only AI pictures of the latest feed posts (see docs/generated-images.md). Generating takes a minute or so,
 * so the request only saves the job and its feed post; the picture is painted in the background and the post shows
 * it once it's ready.
 */
export function imageRoutes(deps: AppDeps) {
  const { db } = deps;
  const app = new Hono<AppEnv>();

  /** Start painting a saved job: in-process by default, or a Netlify background function (see netlify/functions). */
  async function dispatch(imageId: string, origin: string) {
    try {
      if (deps.dispatchImageJob) await deps.dispatchImageJob(imageId, origin);
      else void runImageJob(db, deps.images ?? null, imageId);
    } catch (err) {
      console.error('Could not start the image job', err);
      await db.query(
        `update generated_images set status = 'failed', error = 'Could not start painting', finished_at = now()
         where id = $1 and status = 'pending'`,
        [imageId],
      );
    }
  }

  async function inFlight(tavernId: string) {
    const [row] = await db.query(
      `select 1 from generated_images gi where gi.tavern_id = $1 and ${IMAGE_STATUS_SQL} in ('pending', 'generating')`,
      [tavernId],
    );
    return !!row;
  }

  /** `{ count }`: paint the latest `count` posts (default 5). Returns the new post's id. */
  app.post('/taverns/:id/images', async (c) => {
    const user = requireUser(c);
    const tavern = await adminTavern(db, uuidParam(c, 'id'), user.id);
    if (!deps.images) throw new HTTPException(503, { message: 'Image generation is not set up on this server' });
    const body = await jsonBody(c);
    const count = body.count === undefined ? DEFAULT_IMAGE_POSTS : Number(body.count);
    if (!Number.isInteger(count) || count < 1 || count > MAX_IMAGE_POSTS) {
      badRequest(`count must be a whole number from 1 to ${MAX_IMAGE_POSTS}`);
    }
    if (await inFlight(tavern.id)) {
      throw new HTTPException(409, { message: 'A picture is already being painted — wait for it to finish' });
    }

    const { events: posts } = await tavernFeed(db, tavern.id, user.id, {
      limit: count,
      excludeKinds: ['generated_image'],
    });
    if (!posts.length) badRequest('There are no posts to paint yet');

    const ids = new Set<string>();
    for (const p of posts) {
      if (p.character) ids.add(p.character.id);
      for (const ch of (p.data.characters as { id?: string }[] | undefined) ?? []) if (ch.id) ids.add(ch.id);
    }
    const characters = await db.query<SceneCharacter & { surname: string }>(
      `select id, name, surname, class, race, gender, faction, level, title, render_url, inset_url, avatar_url, equipment
       from characters where id::text = any($1::text[])`,
      [[...ids]],
    );
    const scene = buildScene(posts, characters, tavern.name);
    const cast = scene.characterIds.map((id) => characters.find((ch) => ch.id === id)!);

    const [event] = await db.query<{ id: string }>(
      `insert into feed_events (kind, tavern_id, user_id, data) values ('generated_image', $1, $2, $3)
       returning id::text as id`,
      [
        tavern.id,
        user.id,
        JSON.stringify({
          caption: scene.caption,
          dungeon: scene.dungeon,
          postCount: posts.length,
          characters: cast.map((ch) => ({
            id: ch.id, name: ch.name, surname: ch.surname, class: ch.class, level: ch.level, avatarUrl: ch.avatar_url,
          })),
        }),
      ],
    );
    const [image] = await db.query<{ id: string }>(
      `insert into generated_images (tavern_id, event_id, requested_by, prompt, "references")
       values ($1, $2::bigint, $3, $4, $5) returning id`,
      [tavern.id, event.id, user.id, scene.prompt, JSON.stringify(scene.references)],
    );
    await dispatch(image.id, new URL(c.req.url).origin);
    return c.json({ eventId: event.id, imageId: image.id }, 202);
  });

  /** The picture itself, for members of its tavern. */
  app.get('/taverns/:id/images/:imageId', async (c) => {
    const user = requireUser(c);
    const tavern = await tavernMembership(db, uuidParam(c, 'id'), user.id);
    const [row] = await db.query<{ image: Uint8Array | null; content_type: string | null }>(
      `select image, content_type from generated_images where id = $1 and tavern_id = $2 and status = 'ready'`,
      [uuidParam(c, 'imageId'), tavern.id],
    );
    if (!row?.image) throw new HTTPException(404, { message: 'Picture not found' });
    return c.body(new Uint8Array(row.image), 200, {
      'Content-Type': row.content_type ?? 'application/octet-stream',
      // The URL carries the attempt number, so a retried picture gets a new URL.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      // The placeholder pictures are SVG: never let one run anything if it's opened directly.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    });
  });

  /** Admin-only: try a failed (or lost) picture again, with the same prompt. */
  app.post('/taverns/:id/images/:imageId/retry', async (c) => {
    const user = requireUser(c);
    const tavern = await adminTavern(db, uuidParam(c, 'id'), user.id);
    if (!deps.images) throw new HTTPException(503, { message: 'Image generation is not set up on this server' });
    const imageId = uuidParam(c, 'imageId');
    const [row] = await db.query<{ status: string }>(
      `select ${IMAGE_STATUS_SQL} as status from generated_images gi where gi.id = $1 and gi.tavern_id = $2`,
      [imageId, tavern.id],
    );
    if (!row) throw new HTTPException(404, { message: 'Picture not found' });
    if (row.status !== 'failed') badRequest('Only a picture that failed can be retried');
    if (await inFlight(tavern.id)) {
      throw new HTTPException(409, { message: 'A picture is already being painted — wait for it to finish' });
    }
    await db.query(
      // started_at restarts the clock for treating it as lost (see IMAGE_STATUS_SQL).
      `update generated_images set status = 'pending', error = null, started_at = now(), finished_at = null
       where id = $1`,
      [imageId],
    );
    await dispatch(imageId, new URL(c.req.url).origin);
    return c.json({ ok: true }, 202);
  });

  /** Admin-only: take a generated picture and its post down. */
  app.delete('/taverns/:id/images/:imageId', async (c) => {
    const user = requireUser(c);
    const tavern = await adminTavern(db, uuidParam(c, 'id'), user.id);
    const [row] = await db.query<{ event_id: string | null }>(
      'delete from generated_images where id = $1 and tavern_id = $2 returning event_id::text as event_id',
      [uuidParam(c, 'imageId'), tavern.id],
    );
    if (!row) throw new HTTPException(404, { message: 'Picture not found' });
    if (row.event_id) await db.query('delete from feed_events where id = $1::bigint', [row.event_id]);
    return c.json({ ok: true });
  });

  return app;
}
