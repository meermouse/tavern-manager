import { describe, expect, it } from 'vitest';
import { MAX_POST_IMAGES, MAX_POST_TEXT } from '../src/routes/posts.js';
import { setup } from './helpers.js';

/** A 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const PNG_URL = `data:image/png;base64,${PNG.toString('base64')}`;

async function world() {
  const ctx = await setup();
  const alice = await ctx.login('Alice#1234');
  const bob = await ctx.login('Bob#5678');
  const carol = await ctx.login('Carol#9999');
  const tavern = (await alice.post('/api/taverns', { name: 'The Prancing Pony' })).body;
  await bob.post(`/api/invites/${tavern.inviteCode}/join`);
  const fizzle = (await bob.post('/api/characters', { name: 'Fizzle', surname: 'Sprocket' })).body;
  await bob.put(`/api/taverns/${tavern.id}/characters/${fizzle.id}`);
  const outsider = (await bob.post('/api/characters', { name: 'Grim', surname: 'Stone' })).body;
  const posts = `/api/taverns/${tavern.id}/posts`;
  const feed = async (as = alice, qs = '') => (await as.get(`/api/taverns/${tavern.id}/feed${qs}`)).body.events;
  return { ...ctx, alice, bob, carol, tavern, fizzle, outsider, posts, feed };
}

describe('player posts', () => {
  it('posts text as yourself', async () => {
    const w = await world();
    const res = await w.bob.post(w.posts, { text: '  Who is up for Deadmines tonight?\r\n\n\n\nBring snacks  ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      kind: 'user_post',
      character: null,
      user: { displayName: 'Bob' },
      data: { text: 'Who is up for Deadmines tonight?\n\nBring snacks' },
    });
    const [first] = await w.feed();
    expect(first).toMatchObject({ id: res.body.id, kind: 'user_post' });
    // Searchable and filterable like any other post.
    expect((await w.feed(w.alice, '?q=deadmines')).map((e: { id: string }) => e.id)).toEqual([res.body.id]);
    expect((await w.feed(w.alice, '?kinds=user_post')).length).toBe(1);
  });

  it('posts as one of your characters in the tavern, with pictures', async () => {
    const w = await world();
    const res = await w.bob.post(w.posts, { text: 'New hat!', characterId: w.fizzle.id, images: [PNG_URL, PNG_URL] });
    expect(res.status).toBe(201);
    expect(res.body.character).toMatchObject({ id: w.fizzle.id, name: 'Fizzle' });
    expect(res.body.user).toMatchObject({ displayName: 'Bob' });
    const images = res.body.data.images;
    expect(images).toHaveLength(2);
    expect(images[0].url).toBe(`/api/taverns/${w.tavern.id}/posts/images/${images[0].id}`);

    // Signed out: no picture.
    expect((await w.app.request(images[0].url)).status).toBe(401);
  });

  it('serves pictures only to members, with a sniffed content type', async () => {
    const w = await world();
    const res = await w.bob.post(w.posts, { images: [PNG.toString('base64')] });
    expect(res.status).toBe(201);
    expect(res.body.data.text).toBe('');
    const url = res.body.data.images[0].url;
    const login = await w.app.request('/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ battletag: 'Alice#1234' }),
    });
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const ok = await w.app.request(url, { headers: { Cookie: cookie } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await ok.arrayBuffer()).equals(PNG)).toBe(true);
    // Carol isn't in the tavern.
    expect((await w.carol.get(url)).status).toBe(404);
  });

  it('rejects bad posts', async () => {
    const w = await world();
    expect((await w.bob.post(w.posts, { text: '   ' })).status).toBe(400);
    expect((await w.bob.post(w.posts, { text: 'x'.repeat(MAX_POST_TEXT + 1) })).status).toBe(400);
    expect((await w.bob.post(w.posts, { images: Array(MAX_POST_IMAGES + 1).fill(PNG_URL) })).status).toBe(400);
    // Too big, one picture or all together.
    const big = (n: number) => `data:image/png;base64,${Buffer.concat([PNG, Buffer.alloc(n)]).toString('base64')}`;
    expect((await w.bob.post(w.posts, { images: [big(1_600_000)] })).status).toBe(400);
    expect((await w.bob.post(w.posts, { images: Array(3).fill(big(1_450_000)) })).status).toBe(400);
    // Not an image (an SVG could run script if opened directly).
    const svg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`;
    expect((await w.bob.post(w.posts, { images: [svg] })).status).toBe(400);
    // Someone else's character, or yours but not in this tavern.
    expect((await w.alice.post(w.posts, { text: 'hi', characterId: w.fizzle.id })).status).toBe(400);
    expect((await w.bob.post(w.posts, { text: 'hi', characterId: w.outsider.id })).status).toBe(400);
    // Not a member.
    expect((await w.carol.post(w.posts, { text: 'hi' })).status).toBe(404);
    expect((await w.feed()).some((e: { kind: string }) => e.kind === 'user_post')).toBe(false);
  });

  it('can be deleted by its author or an admin, not other members', async () => {
    const w = await world();
    const mine = (await w.bob.post(w.posts, { text: 'one', images: [PNG_URL] })).body;
    const another = (await w.bob.post(w.posts, { text: 'two' })).body;
    const alices = (await w.alice.post(w.posts, { text: 'three' })).body;

    expect((await w.bob.del(`/api/taverns/${w.tavern.id}/feed/${alices.id}`)).status).toBe(403);
    expect((await w.bob.del(`/api/taverns/${w.tavern.id}/feed/${mine.id}`)).status).toBe(200);
    expect((await w.alice.del(`/api/taverns/${w.tavern.id}/feed/${another.id}`)).status).toBe(200);
    const ids = (await w.feed()).map((e: { id: string }) => e.id);
    expect(ids).toContain(alices.id);
    expect(ids).not.toContain(mine.id);
    expect(ids).not.toContain(another.id);
    // The pictures went with it.
    const [{ n }] = await w.db.query<{ n: number }>('select count(*)::int as n from post_images');
    expect(n).toBe(0);
  });
});
