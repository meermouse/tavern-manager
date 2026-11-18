import { describe, expect, it } from 'vitest';
import { createOpenAiImageGenerator, unsupportedParam, type ImageGenerator } from '../src/images/generator.js';
import { runImageJob } from '../src/images/jobs.js';
import { buildScene, type SceneCharacter } from '../src/images/scene.js';
import { setup } from './helpers.js';

/** An image generator that records what it was asked for. */
function fakeImages(opts: { fail?: string } = {}) {
  const calls: Parameters<ImageGenerator['generate']>[0][] = [];
  const images: ImageGenerator = {
    async generate(input) {
      calls.push(input);
      if (opts.fail) throw new Error(opts.fail);
      return { data: new Uint8Array([1, 2, 3, 4]), contentType: 'image/webp' };
    },
  };
  return { images, calls };
}

async function world(opts: { fail?: string; dispatch?: 'sync' | 'never' } = {}) {
  const fake = fakeImages(opts);
  const ctx = await setup({
    images: fake.images,
    // Paint before the request returns, so tests can look straight away.
    dispatchImageJob: async (id) => {
      if (opts.dispatch !== 'never') await runImageJob(ctx.db, fake.images, id);
    },
  });
  const alice = await ctx.login('Alice#1234');
  const bob = await ctx.login('Bob#5678');
  const tavern = (await alice.post('/api/taverns', { name: 'The Prancing Pony' })).body;
  await bob.post(`/api/invites/${tavern.inviteCode}/join`);
  const judy = (await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' })).body;
  const grim = (await bob.post('/api/characters', { name: 'Grimtusk', surname: 'Bones' })).body;
  await alice.put(`/api/taverns/${tavern.id}/characters/${judy.id}`);
  await bob.put(`/api/taverns/${tavern.id}/characters/${grim.id}`);
  // Real characters have Blizzard render URLs; the mock's are data: SVGs.
  await ctx.db.query(`update characters set render_url = 'https://render.example/' || name || '.png'`);
  const feed = async () => (await alice.get(`/api/taverns/${tavern.id}/feed`)).body.events;
  /** The id of the newest post of this kind. */
  const postOf = async (kind: string) => (await feed()).find((e: { kind: string }) => e.kind === kind).id as string;
  const commission = (eventId: string, as = alice) => as.post(`/api/taverns/${tavern.id}/images`, { eventId });
  return { ...ctx, ...fake, alice, bob, tavern, judy, grim, feed, postOf, commission };
}

describe('generated images', () => {
  it('lets only admins commission a painting, of a post with characters in it', async () => {
    const w = await world();
    const joined = await w.postOf('character_joined');
    expect((await w.commission(joined, w.bob)).status).toBe(403);
    expect((await w.alice.post(`/api/taverns/${w.tavern.id}/images`, {})).status).toBe(400);
    expect((await w.commission('999999')).status).toBe(404);
    expect((await w.commission(await w.postOf('tavern_founded'))).status).toBe(400);
    // Level-ups are too routine to paint.
    const [levelUp] = await w.db.query<{ id: string }>(
      `insert into feed_events (kind, character_id, data) values ('level_up', $1, '{"from": 10, "to": 11}')
       returning id::text as id`,
      [w.judy.id],
    );
    expect((await w.commission(levelUp.id)).status).toBe(400);
    expect(w.calls).toHaveLength(0);
  });

  it('paints a dungeon run post with the party’s renders as references', async () => {
    const w = await world();
    await w.alice.post(`/api/taverns/${w.tavern.id}/runs`, {
      dungeon: 'The Deadmines',
      characterIds: [w.judy.id, w.grim.id],
      bosses: ['Mr. Smite', 'Edwin VanCleef'],
      cleared: true,
    });
    const run = await w.postOf('dungeon_run');

    const res = await w.commission(run);
    expect(res.status).toBe(202);
    expect(w.calls).toHaveLength(1);
    const { prompt, references } = w.calls[0];
    expect(prompt).toContain('World of Warcraft art style');
    expect(prompt).toContain('The Deadmines');
    expect(prompt).toContain('pirate ship');
    expect(prompt).toContain('Edwin VanCleef');
    expect(prompt).toMatch(/1\. Grimtusk, a .*\. Match reference image 1/);
    expect(references.map((r) => r.url).sort()).toEqual([
      'https://render.example/Grimtusk.png',
      'https://render.example/Judgement.png',
    ]);
    // Only that post: not the characters joining, and no IRL names.
    expect(prompt).not.toContain('arrived at the tavern');
    expect(prompt).not.toContain('Alice');

    const feed = (await w.bob.get(`/api/taverns/${w.tavern.id}/feed`)).body;
    const post = feed.events[0];
    expect(post).toMatchObject({
      kind: 'generated_image',
      user: { displayName: 'Alice' },
      data: { caption: 'The Deadmines with Grimtusk and Judgement', dungeon: 'The Deadmines', sourceEventId: run },
    });
    expect(post.data.characters.map((c: { name: string }) => c.name)).toEqual(['Grimtusk', 'Judgement']);
    expect(post.data.image).toMatchObject({ id: res.body.imageId, status: 'ready', error: null });

    // Members can load the picture; it's served as an image, never as a page.
    const img = await w.app.request(post.data.image.url, {
      headers: { Cookie: await cookieOf(w, 'Bob#5678') },
    });
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/webp');
    expect(img.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));

    // Outsiders can't.
    const carol = await w.login('Carol#0001');
    expect((await carol.get(post.data.image.url)).status).toBe(404);

    // A post gets one painting, and paintings can't be painted.
    expect((await w.commission(run)).status).toBe(409);
    expect((await w.commission(post.id)).status).toBe(400);
  });

  it('paints a title post with both characters, but not a player title', async () => {
    const w = await world();
    const title = { key: 'ninja', name: 'The Ninja', icon: '🎲', value: '90.0% need rolls' };
    const insert = async (characterId: string | null, data: unknown) =>
      (
        await w.db.query<{ id: string }>(
          `insert into feed_events (kind, tavern_id, character_id, data) values ('title_gained', $1, $2, $3)
           returning id::text as id`,
          [w.tavern.id, characterId, JSON.stringify(data)],
        )
      )[0].id;
    const taken = await insert(w.grim.id, {
      title,
      characters: [{ id: w.grim.id, name: 'Grimtusk' }, { id: w.judy.id, name: 'Judgement' }],
      previous: { characterId: w.judy.id, player: { id: 'x', displayName: 'Alice' }, value: '75.0% need rolls' },
    });
    expect((await w.commission(taken)).status).toBe(202);
    const { prompt, references } = w.calls[0];
    expect(prompt).toContain('Grimtusk has just taken the tavern title “The Ninja” from Judgement, and is gloating over them');
    expect(prompt).toContain('90.0% need rolls');
    expect(prompt).not.toContain('Alice');
    expect(references).toHaveLength(2);
    const painting = (await w.feed())[0];
    expect(painting.data.caption).toBe('Grimtusk takes The Ninja from Judgement');
    expect(painting.data.characters.map((c: { name: string }) => c.name)).toEqual(['Grimtusk', 'Judgement']);

    const altaholic = await insert(null, {
      title: { key: 'altaholic', name: 'Altaholic', icon: '👥', value: '2 characters' },
      characters: [],
      previous: null,
    });
    expect((await w.commission(altaholic)).status).toBe(400);
  });

  it('shows admins the prompt first, and paints the one they edited', async () => {
    const w = await world();
    const joined = await w.postOf('character_joined');
    const preview = (as = w.alice) => as.post(`/api/taverns/${w.tavern.id}/images/preview`, { eventId: joined });
    expect((await preview(w.bob)).status).toBe(403);
    expect((await w.alice.post(`/api/taverns/${w.tavern.id}/images/preview`, { eventId: await w.postOf('tavern_founded') })).status).toBe(400);

    const res = await preview();
    expect(res.status).toBe(200);
    expect(res.body.prompt).toContain('World of Warcraft art style');
    // Previewing saves and paints nothing.
    expect(w.calls).toHaveLength(0);
    expect((await w.feed()).map((e: { kind: string }) => e.kind)).not.toContain('generated_image');

    const send = (prompt: unknown) => w.alice.post(`/api/taverns/${w.tavern.id}/images`, { eventId: joined, prompt });
    expect((await send('   ')).status).toBe(400);
    expect((await send(42)).status).toBe(400);
    expect((await send('x'.repeat(32_001))).status).toBe(400);
    expect(w.calls).toHaveLength(0);

    const edited = `${res.body.prompt}\nMake it raining.`;
    expect((await send(`  ${edited}  `)).status).toBe(202);
    expect(w.calls).toHaveLength(1);
    expect(w.calls[0].prompt).toBe(edited);
    // The renders still go along as references.
    expect(w.calls[0].references.length).toBeGreaterThan(0);
  });

  it('paints one picture at a time per tavern', async () => {
    const w = await world({ dispatch: 'never' });
    const [judyJoined, grimJoined] = (await w.feed())
      .filter((e: { kind: string }) => e.kind === 'character_joined')
      .map((e: { id: string }) => e.id);
    expect((await w.commission(judyJoined)).status).toBe(202);
    expect((await w.feed())[0].data.image).toMatchObject({ status: 'pending', url: null });
    // Only admins see it until it's finished.
    const bobFeed = (await w.bob.get(`/api/taverns/${w.tavern.id}/feed`)).body;
    expect(bobFeed.events.map((e: { kind: string }) => e.kind)).not.toContain('generated_image');
    expect((await w.commission(grimJoined)).status).toBe(409);

    // A job that never ran counts as failed after a while, and can be retried.
    await w.db.query(`update generated_images set created_at = now() - interval '1 hour'`);
    const stale = (await w.feed())[0].data.image;
    expect(stale.status).toBe('failed');
    expect((await w.alice.post(`/api/taverns/${w.tavern.id}/images/${stale.id}/retry`)).status).toBe(202);
  });

  it('records failures, which admins can retry or delete', async () => {
    const w = await world({ fail: 'Your request was rejected by the safety system' });
    const joined = await w.postOf('character_joined');
    const { imageId } = (await w.commission(joined)).body;
    const post = (await w.feed())[0];
    expect(post.data.image).toMatchObject({
      status: 'failed',
      error: 'Your request was rejected by the safety system',
      url: null,
    });

    const bobFeed = (await w.bob.get(`/api/taverns/${w.tavern.id}/feed`)).body;
    expect(bobFeed.events.map((e: { kind: string }) => e.kind)).not.toContain('generated_image');
    expect((await w.bob.post(`/api/taverns/${w.tavern.id}/images/${imageId}/retry`)).status).toBe(403);
    expect((await w.alice.post(`/api/taverns/${w.tavern.id}/images/${imageId}/retry`)).status).toBe(202);
    expect(w.calls).toHaveLength(2);
    expect(w.calls[1].prompt).toBe(w.calls[0].prompt);

    // A failed painting doesn't stop the post being commissioned again.
    expect((await w.commission(joined)).status).toBe(202);

    expect((await w.bob.del(`/api/taverns/${w.tavern.id}/images/${imageId}`)).status).toBe(403);
    expect((await w.alice.del(`/api/taverns/${w.tavern.id}/images/${imageId}`)).status).toBe(200);
    const ids = (await w.feed()).map((e: { data: { image?: { id: string } } }) => e.data.image?.id);
    expect(ids).not.toContain(imageId);
  });

  it('is unavailable without an image generator', async () => {
    const ctx = await setup({ images: null });
    const alice = await ctx.login('Alice#1234');
    const tavern = (await alice.post('/api/taverns', { name: 'Pony' })).body;
    expect((await alice.post(`/api/taverns/${tavern.id}/images`, { eventId: '1' })).status).toBe(503);
  });
});

async function cookieOf(w: Awaited<ReturnType<typeof world>>, battletag: string) {
  const res = await w.app.request('/auth/dev-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ battletag }),
  });
  return res.headers.get('set-cookie')!.split(';')[0];
}

describe('buildScene', () => {
  const ch = (over: Partial<SceneCharacter>): SceneCharacter => ({
    id: 'x', name: 'X', class: 'Warrior', race: 'Orc', gender: 'Male', faction: 'Horde', level: 30, title: null,
    render_url: null, inset_url: null, avatar_url: null, equipment: null, ...over,
  });

  it('sets a non-dungeon scene in the tavern and weaves in loot', () => {
    const thorn = ch({
      id: 't', name: 'Thorn', class: 'Rogue', race: 'Undead', gender: 'Female', level: 60,
      inset_url: 'https://render.example/thorn-inset.jpg',
      equipment: [
        { name: 'Perdition’s Blade', quality: 'EPIC', slot: 'Main Hand' },
        { name: 'Worn Ring', quality: 'RARE', slot: 'Finger' },
        { name: 'Plain Shirt', quality: 'COMMON', slot: 'Shirt' },
      ],
    });
    const scene = buildScene(
      [
        { id: '3', kind: 'loot', character: { id: 't', name: 'Thorn' }, data: { items: [{ name: 'Perdition’s Blade' }] } },
        { id: '1', kind: 'member_joined', character: null, data: {} },
      ],
      [thorn],
      'The Prancing Pony',
    );
    expect(scene.dungeon).toBeNull();
    expect(scene.caption).toBe('Thorn at the tavern');
    expect(scene.prompt).toContain('“The Prancing Pony”');
    expect(scene.prompt).toContain('Thorn, a max-level female Undead Rogue of the Horde');
    expect(scene.prompt).toContain('Carries “Perdition’s Blade” (main hand).');
    expect(scene.prompt).not.toContain('Worn Ring');
    expect(scene.prompt).toContain('proudly shows off newly won “Perdition’s Blade”');
    expect(scene.references).toEqual([
      { url: 'https://render.example/thorn-inset.jpg', label: 'Thorn, Undead Rogue' },
    ]);
  });

  it('paints a title changing hands as the winner gloating over the loser', () => {
    const grim = ch({ id: 'g', name: 'Grimtusk', render_url: 'https://r.example/g.png' });
    const judy = ch({ id: 'j', name: 'Judgement', class: 'Paladin', race: 'Human', gender: 'Female', faction: 'Alliance' });
    const post = (previous: unknown) => ({
      id: '1',
      kind: 'title_gained',
      character: { id: 'g', name: 'Grimtusk' },
      data: {
        title: { key: 'head-chef', name: 'Head Chef', icon: '🍳', value: '225 Cooking' },
        characters: previous ? [{ id: 'g' }, { id: 'j' }] : [{ id: 'g' }],
        previous,
      },
    });
    const taken = buildScene([post({ characterId: 'j', value: '200 Cooking' })], [judy, grim], 'The Prancing Pony');
    expect(taken.characterIds).toEqual(['g', 'j']);
    expect(taken.caption).toBe('Grimtusk takes Head Chef from Judgement');
    expect(taken.prompt).toContain('“The Prancing Pony”');
    expect(taken.prompt).toContain('Grimtusk has just taken the tavern title “Head Chef” from Judgement, and is gloating over them');
    expect(taken.prompt).toContain('awarded for: highest cooking skill in the tavern.');
    expect(taken.prompt).toContain('Grimtusk won it with 225 Cooking, beating Judgement’s 200 Cooking.');
    expect(taken.prompt).toContain('steaming, mouth-watering dish');
    expect(taken.prompt).toContain('2. Judgement, a female Human Paladin of the Alliance');
    expect(taken.prompt).not.toContain('celebrating their latest deeds');

    const crowned = buildScene([post(null)], [grim], 'The Prancing Pony');
    expect(crowned.caption).toBe('Grimtusk is crowned Head Chef');
    expect(crowned.prompt).toContain('crowned with the tavern title “Head Chef”');
    expect(crowned.prompt).not.toContain('gloating');
  });

  it('skips non-https renders and caps the cast', () => {
    const party = Array.from({ length: 10 }, (_, i) =>
      ch({ id: `c${i}`, name: `Hero${i}`, render_url: i === 0 ? 'data:image/svg+xml,x' : `https://r.example/${i}.png` }),
    );
    const scene = buildScene(
      [{ id: '1', kind: 'dungeon_run', character: null, data: { dungeon: 'Hall of Thanes', characters: party, cleared: false } }],
      party,
      'Pony',
    );
    expect(scene.characterIds).toHaveLength(8);
    expect(scene.references).toHaveLength(7);
    expect(scene.prompt).toContain('Hall of Thanes, a World of Warcraft dungeon');
    expect(scene.prompt).toContain('Give them armour and weapons typical of a Warrior');
  });
});

describe('OpenAI image generator', () => {
  const config = { apiKey: 'sk-test', model: 'gpt-image-1', quality: 'medium', inputFidelity: 'high' };

  it('sends the renders to the edits endpoint and decodes the picture', async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      if (url.startsWith('https://render.example/')) {
        return url.endsWith('.png')
          ? new Response(new Uint8Array([9]), { headers: { 'Content-Type': 'image/png' } })
          : new Response('nope', { status: 404 });
      }
      return Response.json({ data: [{ b64_json: WEBP.toString('base64') }] });
    }) as typeof fetch;

    const out = await createOpenAiImageGenerator(config, fetchImpl).generate({
      prompt: 'A party',
      references: [
        { url: 'https://render.example/a.png', label: 'A' },
        { url: 'https://render.example/missing.jpg', label: 'B' },
      ],
    });
    expect(Buffer.from(out.data)).toEqual(WEBP);
    expect(out.contentType).toBe('image/webp');
    const call = requests.find((r) => r.url.includes('api.openai.com'))!;
    expect(call.url).toBe('https://api.openai.com/v1/images/edits');
    expect((call.init!.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const form = call.init!.body as FormData;
    expect(form.get('model')).toBe('gpt-image-1');
    expect(form.get('prompt')).toBe('A party');
    expect(form.get('input_fidelity')).toBe('high');
    expect(form.getAll('image[]')).toHaveLength(1);
  });

  it('generates from the prompt alone without renders, and surfaces API errors', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return Response.json({ error: { message: 'Billing hard limit reached' } }, { status: 400 });
    }) as typeof fetch;
    await expect(
      createOpenAiImageGenerator(config, fetchImpl).generate({ prompt: 'A tavern', references: [] }),
    ).rejects.toThrow('Billing hard limit reached');
    expect(urls).toEqual(['https://api.openai.com/v1/images/generations']);
  });
});

/** The first bytes of a WebP file (RIFF....WEBP). */
const WEBP = Buffer.from('524946460000000057454250', 'hex');
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

describe('OpenAI models with different settings', () => {
  const config = { apiKey: 'sk-test', model: 'gpt-image-2.6-flare', quality: 'medium', inputFidelity: 'high' };
  const render = () => new Response(new Uint8Array([9]), { headers: { 'Content-Type': 'image/png' } });

  it('recognises "does not support" errors for optional settings only', () => {
    expect(unsupportedParam("The model 'gpt-image-2.6-flare' does not support the 'input_fidelity' parameter.")).toBe(
      'input_fidelity',
    );
    expect(unsupportedParam("Unsupported parameter: 'output_compression' is not supported with this model.")).toBe(
      'output_compression',
    );
    expect(unsupportedParam("The model 'x' does not support the 'prompt' parameter.")).toBeNull();
    expect(unsupportedParam('Billing hard limit reached')).toBeNull();
  });

  it('drops settings the model rejects and tries again', async () => {
    const sent: string[][] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://render.example/')) return render();
      const keys = [...new Set((init!.body as FormData).keys())];
      sent.push(keys);
      if (keys.includes('input_fidelity')) {
        return Response.json(
          { error: { message: "The model 'gpt-image-2.6-flare' does not support the 'input_fidelity' parameter." } },
          { status: 400 },
        );
      }
      if (keys.includes('output_format')) {
        return Response.json({ error: { message: 'Bad value', param: 'output_format' } }, { status: 400 });
      }
      return Response.json({ data: [{ b64_json: PNG.toString('base64') }] });
    }) as typeof fetch;

    const out = await createOpenAiImageGenerator(config, fetchImpl).generate({
      prompt: 'A party',
      references: [{ url: 'https://render.example/a.png', label: 'A' }],
    });
    expect(sent).toHaveLength(3);
    expect(sent[2]).not.toContain('input_fidelity');
    expect(sent[2]).not.toContain('output_format');
    expect(sent[2]).not.toContain('output_compression');
    expect(sent[2]).toEqual(expect.arrayContaining(['model', 'prompt', 'image[]']));
    // Without output_format, the API picks the format; the stored type follows the bytes.
    expect(out.contentType).toBe('image/png');
  });

  it('leaves input_fidelity out when set to none, and follows a picture link', async () => {
    const sent: string[][] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://render.example/')) return render();
      if (url === 'https://files.example/pic.webp') return new Response(WEBP);
      sent.push([...new Set((init!.body as FormData).keys())]);
      return Response.json({ data: [{ url: 'https://files.example/pic.webp' }] });
    }) as typeof fetch;
    const out = await createOpenAiImageGenerator({ ...config, inputFidelity: 'none' }, fetchImpl).generate({
      prompt: 'A party',
      references: [{ url: 'https://render.example/a.png', label: 'A' }],
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain('input_fidelity');
    expect(out.contentType).toBe('image/webp');
  });

  it('does not retry other errors', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return Response.json({ error: { message: "The model 'x' does not support the 'prompt' parameter." } }, { status: 400 });
    }) as typeof fetch;
    await expect(
      createOpenAiImageGenerator(config, fetchImpl).generate({ prompt: 'A tavern', references: [] }),
    ).rejects.toThrow("does not support the 'prompt' parameter");
    expect(calls).toBe(1);
  });
});
