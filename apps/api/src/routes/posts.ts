import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { badRequest, jsonBody, requireUser, uuidParam, type AppDeps, type AppEnv } from '../context.js';
import { tavernFeed } from '../feed.js';
import { tavernMembership } from '../tavernAccess.js';

/** The longest a post's text may be. */
export const MAX_POST_TEXT = 2000;
/** Pictures a post can have. */
export const MAX_POST_IMAGES = 4;
/**
 * Largest picture, in bytes. The web app shrinks photos before sending them, and the whole request has to fit in a
 * Netlify function's 6 MB body limit (base64 makes it a third bigger).
 */
export const MAX_POST_IMAGE_BYTES = 1_500_000;
/** All of a post's pictures together, so the base64 request stays under that 6 MB limit. */
export const MAX_POST_TOTAL_BYTES = 4_200_000;

/** Image types we accept, recognised by their first bytes rather than what the browser claims. */
function sniffImageType(bytes: Uint8Array): string | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  // RIFF....WEBP
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }
  return null;
}

/** A `data:image/...;base64,...` URL (or bare base64) as bytes and a checked content type. */
function decodeImage(value: unknown): { bytes: Uint8Array; contentType: string } {
  if (typeof value !== 'string') badRequest('Each picture must be a base64 data URL');
  const base64 = value.replace(/^data:[^,]*;base64,/, '');
  // Rough size check before decoding, so a huge body isn't decoded for nothing.
  if (base64.length > Math.ceil((MAX_POST_IMAGE_BYTES * 4) / 3) + 4) {
    badRequest(`Pictures can be at most ${Math.round(MAX_POST_IMAGE_BYTES / 1_000_000 * 10) / 10} MB`);
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) badRequest('A picture could not be read');
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
  if (!bytes.length) badRequest('A picture was empty');
  if (bytes.length > MAX_POST_IMAGE_BYTES) {
    badRequest(`Pictures can be at most ${Math.round(MAX_POST_IMAGE_BYTES / 1_000_000 * 10) / 10} MB`);
  }
  const contentType = sniffImageType(bytes);
  if (!contentType) badRequest('Pictures must be PNG, JPEG, GIF or WebP');
  return { bytes, contentType };
}

/**
 * Players' own feed posts: some text and/or pictures, posted in one tavern as themselves (IRL) or as one of their
 * characters in that tavern. The author or a tavern admin can delete one (see DELETE /taverns/:id/feed/:eventId).
 */
export function postRoutes({ db }: AppDeps) {
  const app = new Hono<AppEnv>();

  /**
   * `{ text?, images?: string[], characterId?: string | null }`: post to the tavern's feed. `images` are base64 data
   * URLs; `characterId` posts as that character (yours, and in this tavern), otherwise as you. Returns the new post.
   */
  app.post('/taverns/:id/posts', async (c) => {
    const user = requireUser(c);
    const tavern = await tavernMembership(db, uuidParam(c, 'id'), user.id);
    const body = await jsonBody(c);

    if (body.text !== undefined && body.text !== null && typeof body.text !== 'string') badRequest('text must be text');
    // Keep line breaks, but not runs of blank lines or trailing spaces.
    const text = typeof body.text === 'string' ? body.text.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim() : '';
    if (text.length > MAX_POST_TEXT) badRequest(`Posts can be at most ${MAX_POST_TEXT} characters`);

    if (body.images !== undefined && !Array.isArray(body.images)) badRequest('images must be a list of pictures');
    const raw = (body.images as unknown[] | undefined) ?? [];
    if (raw.length > MAX_POST_IMAGES) badRequest(`A post can have at most ${MAX_POST_IMAGES} pictures`);
    const images = raw.map(decodeImage);
    if (images.reduce((sum, img) => sum + img.bytes.length, 0) > MAX_POST_TOTAL_BYTES) {
      badRequest('Those pictures are too big together — try fewer or smaller ones');
    }
    if (!text && !images.length) badRequest('Write something or add a picture');

    let characterId: string | null = null;
    if (body.characterId !== undefined && body.characterId !== null) {
      if (typeof body.characterId !== 'string') badRequest('characterId must be a character id');
      const [owned] = await db.query<{ id: string }>(
        `select c.id from characters c join tavern_characters tc on tc.character_id = c.id
         where c.id::text = $1 and c.user_id = $2 and tc.tavern_id = $3`,
        [body.characterId, user.id, tavern.id],
      );
      if (!owned) badRequest('You can only post as one of your characters in this tavern');
      characterId = owned.id;
    }

    const [event] = await db.query<{ id: string }>(
      `insert into feed_events (kind, tavern_id, character_id, user_id, data) values ('user_post', $1, $2, $3, $4)
       returning id::text as id`,
      [tavern.id, characterId, user.id, JSON.stringify({ text })],
    );
    const ids: { id: string }[] = [];
    for (const [position, img] of images.entries()) {
      const [row] = await db.query<{ id: string }>(
        `insert into post_images (tavern_id, event_id, position, content_type, image) values ($1, $2::bigint, $3, $4, $5)
         returning id`,
        [tavern.id, event.id, position, img.contentType, img.bytes],
      );
      ids.push({ id: row.id });
    }
    if (ids.length) {
      await db.query('update feed_events set data = $2 where id = $1::bigint', [event.id, JSON.stringify({ text, images: ids })]);
    }

    const { events } = await tavernFeed(db, tavern.id, user.id, { limit: 1, eventId: event.id });
    return c.json(events[0], 201);
  });

  /** A picture from a post, for members of its tavern. */
  app.get('/taverns/:id/posts/images/:imageId', async (c) => {
    const user = requireUser(c);
    const tavern = await tavernMembership(db, uuidParam(c, 'id'), user.id);
    const [row] = await db.query<{ image: Uint8Array; content_type: string }>(
      'select image, content_type from post_images where id = $1 and tavern_id = $2',
      [uuidParam(c, 'imageId'), tavern.id],
    );
    if (!row) throw new HTTPException(404, { message: 'Picture not found' });
    return c.body(new Uint8Array(row.image), 200, {
      'Content-Type': row.content_type,
      // A post's pictures never change (editing isn't possible), so the URL can be cached for good.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
  });

  return app;
}
