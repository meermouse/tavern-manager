import { describe, expect, it } from 'vitest';
import { setup } from './helpers.js';

describe('auth', () => {
  it('rejects anonymous requests', async () => {
    const { app } = await setup();
    const res = await app.request('/api/me');
    expect(res.status).toBe(401);
  });

  it('dev login creates a user with a display name from the battletag', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    const me = await alice.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ battletag: 'Alice#1234', displayName: 'Alice', canImport: true });

    const renamed = await alice.patch('/api/me', { displayName: 'Alice Smith' });
    expect(renamed.body.displayName).toBe('Alice Smith');
  });

  it('logout ends the session', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    await alice.post('/auth/logout');
    expect((await alice.get('/api/me')).status).toBe(401);
  });

  it('reports login options', async () => {
    const { app } = await setup();
    const res = await app.request('/auth/config');
    expect(await res.json()).toEqual({ battlenet: false, devLogin: true });
  });
});

describe('characters', () => {
  it('adds a character manually and syncs it', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    const res = await alice.post('/api/characters', { name: 'judgement', surname: 'judy' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Judgement', surname: 'Judy', status: 'ok', region: 'eu' });
    expect(res.body.level).toBeGreaterThan(0);
    expect((await alice.get('/api/characters')).body).toHaveLength(1);
  });

  it('syncs professions with their skill levels, primaries first', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    const res = await alice.post('/api/characters', { name: 'judgement', surname: 'judy' });
    const professions = res.body.professions as { name: string; kind: string; skill: number; maxSkill: number }[];
    expect(Array.isArray(professions)).toBe(true);
    expect(professions.filter((p) => p.kind === 'primary').length).toBeLessThanOrEqual(2);
    const kinds = professions.map((p) => p.kind);
    expect(kinds).toEqual([...kinds].sort((a, b) => (a === 'primary' ? 0 : 1) - (b === 'primary' ? 0 : 1)));
    for (const p of professions) {
      expect(p.skill).toBeGreaterThan(0);
      expect(p.skill).toBeLessThanOrEqual(p.maxSkill);
    }
  });

  it('marks characters the API cannot see yet as pending', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    const res = await alice.post('/api/characters', { name: 'Pendingly', surname: 'Lowbie' });
    expect(res.body.status).toBe('pending');
    expect(res.body.level).toBeNull();
  });

  it('prevents claiming a character someone else owns', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    const bob = await login('Bob#5678');
    await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' });
    const dupe = await bob.post('/api/characters', { name: 'JUDGEMENT', surname: 'judy' });
    expect(dupe.status).toBe(409);
    expect(dupe.body.error).toMatch(/another player/);
  });

  it('validates names', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    expect((await alice.post('/api/characters', { name: 'a b', surname: 'x1' })).status).toBe(400);
  });

  it('imports account characters', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    const res = await alice.post('/api/characters/import');
    expect(res.body).toEqual({ found: 3, imported: 3, skipped: 0 });
    const again = await alice.post('/api/characters/import');
    expect(again.body).toEqual({ found: 3, imported: 0, skipped: 3 });
  });

  it("can't touch other people's characters", async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    const bob = await login('Bob#5678');
    const ch = (await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' })).body;
    expect((await bob.del(`/api/characters/${ch.id}`)).status).toBe(404);
    expect((await bob.post(`/api/characters/${ch.id}/refresh`)).status).toBe(404);
    expect((await alice.del(`/api/characters/${ch.id}`)).status).toBe(200);
  });

  it('lets the owner set roles, shown everywhere the character is', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    const bob = await login('Bob#5678');
    const ch = (await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' })).body;
    expect(ch.roles).toEqual([]);

    const set = await alice.patch(`/api/characters/${ch.id}`, { roles: ['damage', 'tank', 'tank'] });
    expect(set.status).toBe(200);
    expect(set.body.roles).toEqual(['tank', 'damage']);
    expect((await alice.get('/api/characters')).body[0].roles).toEqual(['tank', 'damage']);

    const tavern = (await alice.post('/api/taverns', { name: 'The Pig' })).body;
    await alice.put(`/api/taverns/${tavern.id}/characters/${ch.id}`);
    expect((await alice.get(`/api/taverns/${tavern.id}`)).body.characters[0].roles).toEqual(['tank', 'damage']);
    expect((await alice.get(`/api/taverns/${tavern.id}/characters/${ch.id}`)).body.roles).toEqual(['tank', 'damage']);

    expect((await alice.patch(`/api/characters/${ch.id}`, { roles: ['bard'] })).status).toBe(400);
    expect((await alice.patch(`/api/characters/${ch.id}`, {})).status).toBe(400);
    expect((await bob.patch(`/api/characters/${ch.id}`, { roles: ['healer'] })).status).toBe(404);
    expect((await alice.patch(`/api/characters/${ch.id}`, { roles: [] })).body.roles).toEqual([]);
  });

  it('lets the owner log completed dungeons, shown to the tavern', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    const bob = await login('Bob#5678');
    const ch = (await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' })).body;
    expect(ch.dungeonsCompleted).toEqual({});

    const done = await alice.post(`/api/characters/${ch.id}/dungeons`, { dungeon: 'The Deadmines', completed: true });
    expect(done.status).toBe(200);
    const loggedAt = done.body.dungeonsCompleted['The Deadmines'];
    expect(new Date(loggedAt).toString()).not.toBe('Invalid Date');
    // Logging again keeps the original date.
    const again = await alice.post(`/api/characters/${ch.id}/dungeons`, { dungeon: 'The Deadmines', completed: true });
    expect(again.body.dungeonsCompleted).toEqual({ 'The Deadmines': loggedAt });
    await alice.post(`/api/characters/${ch.id}/dungeons`, { dungeon: "Zul'Farrak", completed: true });
    expect(Object.keys((await alice.get('/api/characters')).body[0].dungeonsCompleted).sort()).toEqual([
      'The Deadmines',
      "Zul'Farrak",
    ]);

    const tavern = (await alice.post('/api/taverns', { name: 'The Pig' })).body;
    await alice.put(`/api/taverns/${tavern.id}/characters/${ch.id}`);
    expect((await alice.get(`/api/taverns/${tavern.id}`)).body.characters[0].dungeonsCompleted).toHaveProperty(
      'The Deadmines',
    );

    // Each new tick is one feed post (logging The Deadmines twice posted once).
    const posts = async () =>
      (await alice.get(`/api/taverns/${tavern.id}/feed`)).body.events
        .filter((e: { kind: string }) => e.kind === 'dungeon_cleared')
        .map((e: { data: { dungeon: string }; character: { id: string } }) => [e.character.id, e.data.dungeon]);
    expect(await posts()).toEqual([
      [ch.id, "Zul'Farrak"],
      [ch.id, 'The Deadmines'],
    ]);

    const undone = await alice.post(`/api/characters/${ch.id}/dungeons`, { dungeon: 'The Deadmines', completed: false });
    expect(undone.body.dungeonsCompleted).toEqual({ "Zul'Farrak": expect.any(String) });
    // Unticking takes its post down; unticking again changes nothing.
    expect(await posts()).toEqual([[ch.id, "Zul'Farrak"]]);
    expect(
      (await alice.post(`/api/characters/${ch.id}/dungeons`, { dungeon: 'The Deadmines', completed: false })).status,
    ).toBe(200);

    expect((await alice.post(`/api/characters/${ch.id}/dungeons`, { dungeon: '', completed: true })).status).toBe(400);
    expect((await alice.post(`/api/characters/${ch.id}/dungeons`, { dungeon: 'Uldaman' })).status).toBe(400);
    expect(
      (await bob.post(`/api/characters/${ch.id}/dungeons`, { dungeon: 'Uldaman', completed: true })).status,
    ).toBe(404);
  });
});

describe('taverns', () => {
  it('create, invite, join, add characters, and view the table', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    const bob = await login('Bob#5678');

    const tavern = (await alice.post('/api/taverns', { name: 'The Prancing Pony' })).body;
    expect(tavern).toMatchObject({ name: 'The Prancing Pony', isOwner: true });
    expect(tavern.inviteCode).toMatch(/^[A-Z2-9]{8}$/);

    // Bob can't see it before joining.
    expect((await bob.get(`/api/taverns/${tavern.id}`)).status).toBe(404);

    const preview = await bob.get(`/api/invites/${tavern.inviteCode.toLowerCase()}`);
    expect(preview.body).toMatchObject({ name: 'The Prancing Pony', memberCount: 1, isMember: false });
    expect((await bob.post(`/api/invites/${tavern.inviteCode}/join`)).body).toEqual({ tavernId: tavern.id });

    const a = (await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' })).body;
    const b = (await bob.post('/api/characters', { name: 'Grimble', surname: 'Thornwick' })).body;
    expect((await alice.put(`/api/taverns/${tavern.id}/characters/${a.id}`)).status).toBe(200);
    expect((await bob.put(`/api/taverns/${tavern.id}/characters/${b.id}`)).status).toBe(200);
    // Can't add someone else's character.
    expect((await bob.put(`/api/taverns/${tavern.id}/characters/${a.id}`)).status).toBe(404);

    const detail = (await bob.get(`/api/taverns/${tavern.id}`)).body;
    expect(detail.isOwner).toBe(false);
    expect(detail.members.map((m: { displayName: string }) => m.displayName)).toEqual(['Alice', 'Bob']);
    expect(detail.characters).toHaveLength(2);
    expect(detail.characters.find((c: { id: string }) => c.id === a.id).ownerName).toBe('Alice');

    const list = (await bob.get('/api/taverns')).body;
    expect(list).toEqual([
      expect.objectContaining({ name: 'The Prancing Pony', memberCount: 2, characterCount: 2, isOwner: false }),
    ]);

    // Leaving removes your characters from the tavern.
    expect((await bob.post(`/api/taverns/${tavern.id}/leave`)).status).toBe(200);
    expect((await alice.get(`/api/taverns/${tavern.id}`)).body.characters).toHaveLength(1);
  });

  it('only the owner can rename, regenerate invites, or delete', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    const bob = await login('Bob#5678');
    const tavern = (await alice.post('/api/taverns', { name: 'Pony' })).body;
    await bob.post(`/api/invites/${tavern.inviteCode}/join`);

    expect((await bob.patch(`/api/taverns/${tavern.id}`, { name: 'Mine' })).status).toBe(403);
    expect((await bob.post(`/api/taverns/${tavern.id}/invite-code`)).status).toBe(403);
    expect((await bob.del(`/api/taverns/${tavern.id}`)).status).toBe(403);

    const regenerated = (await alice.post(`/api/taverns/${tavern.id}/invite-code`)).body;
    expect(regenerated.inviteCode).not.toBe(tavern.inviteCode);
    expect((await bob.get(`/api/invites/${tavern.inviteCode}`)).status).toBe(404);

    expect((await alice.post(`/api/taverns/${tavern.id}/leave`)).status).toBe(400);
    expect((await alice.del(`/api/taverns/${tavern.id}`)).status).toBe(200);
    expect((await bob.get('/api/taverns')).body).toEqual([]);
  });

  it('returns 404 for malformed ids', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    expect((await alice.get('/api/taverns/not-a-uuid')).status).toBe(404);
  });

  it('serves character details with portraits, gear and recent posts to tavern members only', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    const bob = await login('Bob#5678');
    const carol = await login('Carol#9999');
    const tavern = (await alice.post('/api/taverns', { name: 'Pony' })).body;
    await bob.post(`/api/invites/${tavern.inviteCode}/join`);
    const ch = (await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' })).body;
    expect(ch.avatarUrl).toMatch(/^data:image\/svg\+xml,/);
    expect(ch.renderUrl).toMatch(/^data:image\/svg\+xml,/);
    expect(ch.faction).toMatch(/Alliance|Horde/);

    const path = `/api/taverns/${tavern.id}/characters/${ch.id}`;
    expect((await bob.get(path)).status).toBe(404); // not in the tavern yet
    await alice.put(`/api/taverns/${tavern.id}/characters/${ch.id}`);

    const details = await bob.get(path);
    expect(details.status).toBe(200);
    expect(details.body).toMatchObject({ id: ch.id, ownerName: 'Alice', avatarUrl: ch.avatarUrl });
    expect(Array.isArray(details.body.equipment)).toBe(true);
    expect(details.body.equipment.length).toBeGreaterThan(0);
    expect(details.body.gearItemLevel).toBeGreaterThan(0);
    expect(details.body.recent.map((e: { kind: string }) => e.kind)).toEqual(['character_joined']);
    expect(details.body.recent[0].character.avatarUrl).toBe(ch.avatarUrl);

    expect((await carol.get(path)).status).toBe(404); // not a member
  });

  it('refreshes tavern characters on demand', async () => {
    const { login, db } = await setup();
    const alice = await login('Alice#1234');
    const tavern = (await alice.post('/api/taverns', { name: 'Pony' })).body;
    const ch = (await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' })).body;
    await alice.put(`/api/taverns/${tavern.id}/characters/${ch.id}`);
    await db.query(`update characters set level = 1, last_attempt_at = now() - interval '1 hour'`);
    const refreshed = (await alice.post(`/api/taverns/${tavern.id}/refresh`)).body;
    expect(refreshed.characters[0].level).toBe(ch.level);
  });
});

describe('leaderboard', () => {
  it('ranks tavern characters by gear and statistics, for members only', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    const bob = await login('Bob#5678');
    const carol = await login('Carol#0001');
    const judy = (await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' })).body;
    const grim = (await bob.post('/api/characters', { name: 'Grimble', surname: 'Thornwick' })).body;
    const tavern = (await alice.post('/api/taverns', { name: 'The Prancing Pony' })).body;
    await bob.post(`/api/invites/${tavern.inviteCode}/join`);
    await alice.put(`/api/taverns/${tavern.id}/characters/${judy.id}`);
    await bob.put(`/api/taverns/${tavern.id}/characters/${grim.id}`);

    const res = await alice.get(`/api/taverns/${tavern.id}/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const entry = res.body.find((e: { id: string }) => e.id === judy.id);
    expect(entry).toMatchObject({ ownerName: 'Alice', cheers: 0, cheersGiven: 0 });
    expect(entry.gearItemLevel).toBeGreaterThan(0);
    expect(entry.statistics['Total deaths']).toBeGreaterThanOrEqual(0);
    expect(entry.statistics['Creatures killed']).toBeGreaterThan(0);
    expect(entry.characterStats.health).toBeGreaterThan(0);

    expect((await carol.get(`/api/taverns/${tavern.id}/leaderboard`)).status).toBe(404);

    // Bob cheers a post: it counts as given for Bob's characters and received for the character posted about.
    const feed = (await bob.get(`/api/taverns/${tavern.id}/feed`)).body.events;
    const post = feed.find((e: { character: { id: string } | null }) => e.character?.id === judy.id);
    await bob.put(`/api/taverns/${tavern.id}/feed/${post.id}/cheers`);
    const after = (await alice.get(`/api/taverns/${tavern.id}/leaderboard`)).body;
    expect(after.find((e: { id: string }) => e.id === grim.id).cheersGiven).toBe(1);
    expect(after.find((e: { id: string }) => e.id === judy.id)).toMatchObject({ cheers: 1, cheersGiven: 0 });
  });

  it('outside a tavern, covers your characters and everyone in your taverns', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    const bob = await login('Bob#5678');
    const carol = await login('Carol#0001');
    await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' });
    const grim = (await bob.post('/api/characters', { name: 'Grimble', surname: 'Thornwick' })).body;
    await carol.post('/api/characters', { name: 'Stranger', surname: 'Danger' });
    const tavern = (await alice.post('/api/taverns', { name: 'The Prancing Pony' })).body;
    await bob.post(`/api/invites/${tavern.inviteCode}/join`);
    await bob.put(`/api/taverns/${tavern.id}/characters/${grim.id}`);

    const names = (await alice.get('/api/leaderboard')).body.map((e: { name: string }) => e.name).sort();
    expect(names).toEqual(['Grimble', 'Judgement']);
    expect((await carol.get('/api/leaderboard')).body.map((e: { name: string }) => e.name)).toEqual(['Stranger']);
  });

  it('shows details for anyone on your global leaderboard', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    const bob = await login('Bob#5678');
    const carol = await login('Carol#0001');
    const judy = (await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' })).body;
    const grim = (await bob.post('/api/characters', { name: 'Grimble', surname: 'Thornwick' })).body;
    const tavern = (await alice.post('/api/taverns', { name: 'The Prancing Pony' })).body;
    await bob.post(`/api/invites/${tavern.inviteCode}/join`);
    await bob.put(`/api/taverns/${tavern.id}/characters/${grim.id}`);

    const own = await alice.get(`/api/leaderboard/characters/${judy.id}`);
    expect(own.status).toBe(200); // in no tavern, but yours
    expect(own.body).toMatchObject({ id: judy.id, ownerName: 'Alice', recent: [] });

    const other = await alice.get(`/api/leaderboard/characters/${grim.id}`);
    expect(other.status).toBe(200);
    expect(other.body).toMatchObject({ id: grim.id, ownerName: 'Bob' });
    expect(Array.isArray(other.body.equipment)).toBe(true);
    expect(other.body.recent.map((e: { kind: string }) => e.kind)).toEqual(['character_joined']);

    expect((await carol.get(`/api/leaderboard/characters/${grim.id}`)).status).toBe(404); // no shared tavern
    expect((await bob.get(`/api/leaderboard/characters/${judy.id}`)).status).toBe(404); // Judy is in no tavern
  });
});

describe('dungeon runs', () => {
  async function party() {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    const bob = await login('Bob#5678');
    const carol = await login('Carol#9012');
    const tavern = (await alice.post('/api/taverns', { name: 'The Pig' })).body;
    await bob.post(`/api/invites/${tavern.inviteCode}/join`);
    await carol.post(`/api/invites/${tavern.inviteCode}/join`);
    const a = (await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' })).body;
    const b = (await bob.post('/api/characters', { name: 'Grimble', surname: 'Thornwick' })).body;
    const outsider = (await carol.post('/api/characters', { name: 'Loner', surname: 'Wolf' })).body;
    await alice.put(`/api/taverns/${tavern.id}/characters/${a.id}`);
    await bob.put(`/api/taverns/${tavern.id}/characters/${b.id}`);
    return { alice, bob, carol, tavern, a, b, outsider };
  }

  it('logs a run for the whole group: one post, and a tick in everyone’s dungeon log', async () => {
    const { alice, bob, tavern, a, b } = await party();
    const res = await bob.post(`/api/taverns/${tavern.id}/runs`, {
      dungeon: 'Ragefire Chasm',
      date: '2026-11-15',
      characterIds: [a.id, b.id, a.id],
      bosses: ['Oggleflint', ' taragaman the hungerer ', 'Taragaman the Hungerer', '', 'Bazzalan'],
      cleared: true,
      notes: 'Wiped once on Bazzalan',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      dungeon: 'Ragefire Chasm',
      date: '2026-11-15',
      bosses: ['Oggleflint', 'taragaman the hungerer', 'Bazzalan'],
      cleared: true,
      notes: 'Wiped once on Bazzalan',
      loggedBy: { displayName: 'Bob' },
      canDelete: true,
    });
    expect(res.body.characters.map((c: { name: string }) => c.name)).toEqual(['Grimble', 'Judgement']);

    // Bob logged Alice's character too.
    expect((await alice.get('/api/characters')).body[0].dungeonsCompleted).toEqual({
      'Ragefire Chasm': '2026-11-15T00:00:00Z',
    });

    const feed = (await alice.get(`/api/taverns/${tavern.id}/feed`)).body.events;
    const posts = feed.filter((e: { kind: string }) => e.kind === 'dungeon_run');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ user: { displayName: 'Bob' }, data: { dungeon: 'Ragefire Chasm', cleared: true } });
    expect(posts[0].data.characters.map((c: { name: string }) => c.name)).toEqual(['Grimble', 'Judgement']);
    // No per-character "cleared" posts on top.
    expect(feed.some((e: { kind: string }) => e.kind === 'dungeon_cleared')).toBe(false);

    const runs = (await alice.get(`/api/taverns/${tavern.id}/runs`)).body;
    expect(runs).toHaveLength(1);
    // Alice owns the tavern, so she can delete Bob's run.
    expect(runs[0].canDelete).toBe(true);
  });

  it('keeps an earlier tick date, and a partial run ticks nothing', async () => {
    const { alice, tavern, a } = await party();
    await alice.post(`/api/taverns/${tavern.id}/runs`, {
      dungeon: 'The Deadmines', date: '2026-11-01', characterIds: [a.id], bosses: [], cleared: true,
    });
    await alice.post(`/api/taverns/${tavern.id}/runs`, {
      dungeon: 'The Deadmines', date: '2026-11-10', characterIds: [a.id], bosses: [], cleared: true,
    });
    await alice.post(`/api/taverns/${tavern.id}/runs`, {
      dungeon: 'Uldaman', characterIds: [a.id], bosses: ['Revelosh'], cleared: false,
    });
    expect((await alice.get('/api/characters')).body[0].dungeonsCompleted).toEqual({
      'The Deadmines': '2026-11-01T00:00:00Z',
    });
    const runs = (await alice.get(`/api/taverns/${tavern.id}/runs`)).body;
    expect(runs.map((r: { dungeon: string; date: string }) => [r.dungeon, r.date])).toEqual([
      ['Uldaman', new Date().toISOString().slice(0, 10)],
      ['The Deadmines', '2026-11-10'],
      ['The Deadmines', '2026-11-01'],
    ]);
  });

  it('filters the feed by character, owner, post type and text', async () => {
    const { alice, bob, tavern, a, b } = await party();
    await bob.post(`/api/taverns/${tavern.id}/runs`, {
      dungeon: 'Ragefire Chasm', characterIds: [a.id, b.id], bosses: ['Bazzalan'], cleared: true,
    });
    await bob.post(`/api/taverns/${tavern.id}/runs`, {
      dungeon: 'Wailing Caverns', characterIds: [b.id], bosses: [], cleared: false,
    });
    const feed = async (who: typeof alice, query: string) => {
      const res = await who.get(`/api/taverns/${tavern.id}/feed?${query}`);
      expect(res.status).toBe(200);
      return res.body.events as { kind: string; character: { id: string } | null; data: { dungeon?: string } }[];
    };
    const runs = (events: Awaited<ReturnType<typeof feed>>) =>
      events.filter((e) => e.kind === 'dungeon_run').map((e) => e.data.dungeon);

    // Post type.
    const onlyRuns = await feed(alice, 'kinds=dungeon_run');
    expect(onlyRuns.every((e) => e.kind === 'dungeon_run')).toBe(true);
    expect(runs(onlyRuns)).toEqual(['Wailing Caverns', 'Ragefire Chasm']);
    expect((await alice.get(`/api/taverns/${tavern.id}/feed?kinds=nonsense`)).status).toBe(400);
    const noRuns = await feed(alice, 'hide=dungeon_run,character_joined');
    expect(noRuns.length).toBeGreaterThan(0);
    expect(noRuns.some((e) => e.kind === 'dungeon_run' || e.kind === 'character_joined')).toBe(false);
    expect((await alice.get(`/api/taverns/${tavern.id}/feed?hide=nonsense`)).status).toBe(400);

    // A character: their own posts plus group runs they were in.
    const judys = await feed(alice, `characters=${a.id}`);
    expect(runs(judys)).toEqual(['Ragefire Chasm']);
    expect(judys.filter((e) => e.kind !== 'dungeon_run').every((e) => e.character?.id === a.id)).toBe(true);
    expect(judys.some((e) => e.kind === 'character_joined')).toBe(true);
    expect(runs(await feed(alice, `characters=${a.id},${b.id}`))).toEqual(['Wailing Caverns', 'Ragefire Chasm']);

    // Just my characters: no member/founding posts, and only runs my characters were in.
    const mine = await feed(alice, 'mine=1');
    expect(runs(mine)).toEqual(['Ragefire Chasm']);
    expect(mine.some((e) => e.kind === 'member_joined' || e.kind === 'tavern_founded')).toBe(false);
    expect(runs(await feed(bob, 'mine=1'))).toEqual(['Wailing Caverns', 'Ragefire Chasm']);

    // Text: dungeon, boss, character and player names, case-insensitively; wildcards are literal.
    expect(runs(await feed(alice, 'q=wailing'))).toEqual(['Wailing Caverns']);
    expect(runs(await feed(alice, 'q=bazzalan'))).toEqual(['Ragefire Chasm']);
    expect((await feed(alice, 'q=judgement')).length).toBeGreaterThan(0);
    expect((await feed(alice, 'q=bob')).some((e) => e.kind === 'member_joined')).toBe(true);
    expect(await feed(alice, 'q=%25')).toEqual([]);

    // Filters combine.
    expect(runs(await feed(alice, `kinds=dungeon_run&mine=1&q=chasm`))).toEqual(['Ragefire Chasm']);
    expect(await feed(alice, `kinds=dungeon_run&mine=1&q=wailing`)).toEqual([]);
  });

  it('validates the run and who can log or delete it', async () => {
    const { alice, bob, carol, tavern, a, outsider } = await party();
    expect(outsider.id).toBeTruthy();
    const url = `/api/taverns/${tavern.id}/runs`;
    const ok = { dungeon: 'Ragefire Chasm', characterIds: [a.id], bosses: [], cleared: true };
    expect((await alice.post(url, { ...ok, characterIds: [] })).status).toBe(400);
    expect((await alice.post(url, { ...ok, characterIds: [outsider.id] })).status).toBe(400);
    expect((await alice.post(url, { ...ok, dungeon: '' })).status).toBe(400);
    expect((await alice.post(url, { ...ok, cleared: undefined })).status).toBe(400);
    expect((await alice.post(url, { ...ok, date: '2026-02-30' })).status).toBe(400);
    expect((await alice.post(url, { ...ok, date: '2999-01-01' })).status).toBe(400);
    expect((await alice.post(url, { ...ok, bosses: 'Oggleflint' })).status).toBe(400);

    const stranger = await (await setup()).login('Dave#3456');
    expect((await stranger.get(url)).status).toBe(404);

    const run = (await carol.post(url, ok)).body;
    expect((await bob.get(url)).body[0].canDelete).toBe(false);
    // Bob (a member, not the logger or owner) can't delete it; the tavern owner can.
    expect((await bob.del(`${url}/${run.id}`)).status).toBe(403);
    expect((await alice.del(`${url}/${run.id}`)).status).toBe(200);
    expect((await alice.get(url)).body).toEqual([]);
    const kinds = (await alice.get(`/api/taverns/${tavern.id}/feed`)).body.events.map((e: { kind: string }) => e.kind);
    expect(kinds).not.toContain('dungeon_run');
    // The tick stays: the dungeon log is the character's own checklist.
    expect((await alice.get('/api/characters')).body[0].dungeonsCompleted).toHaveProperty('Ragefire Chasm');
    expect((await alice.del(`${url}/${run.id}`)).status).toBe(404);
  });
});

describe('tavern admins', () => {
  async function tavernWithFriends() {
    const { login, db } = await setup();
    const alice = await login('Alice#1234');
    const bob = await login('Bob#5678');
    const carol = await login('Carol#9012');
    const tavern = (await alice.post('/api/taverns', { name: 'The Pig' })).body;
    await bob.post(`/api/invites/${tavern.inviteCode}/join`);
    await carol.post(`/api/invites/${tavern.inviteCode}/join`);
    const a = (await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' })).body;
    const b = (await bob.post('/api/characters', { name: 'Grimble', surname: 'Thornwick' })).body;
    const cc = (await carol.post('/api/characters', { name: 'Loner', surname: 'Wolf' })).body;
    await alice.put(`/api/taverns/${tavern.id}/characters/${a.id}`);
    await bob.put(`/api/taverns/${tavern.id}/characters/${b.id}`);
    await carol.put(`/api/taverns/${tavern.id}/characters/${cc.id}`);
    const ids = Object.fromEntries(
      (await alice.get(`/api/taverns/${tavern.id}`)).body.members.map((m: { displayName: string; userId: string }) => [
        m.displayName,
        m.userId,
      ]),
    );
    return { db, alice, bob, carol, tavern, a, b, cc, ids };
  }

  it("lets admins delete feed posts: the tavern's own outright, a character's only from this tavern", async () => {
    const { db, alice, bob, tavern, a } = await tavernWithFriends();
    const feed = async () => (await alice.get(`/api/taverns/${tavern.id}/feed`)).body.events as { id: string; kind: string }[];
    const joined = (await feed()).find((e) => e.kind === 'member_joined')!;
    await bob.put(`/api/taverns/${tavern.id}/feed/${joined.id}/cheers`);

    // Members can't delete posts; admins can.
    expect((await bob.call('DELETE', `/api/taverns/${tavern.id}/feed/${joined.id}`)).status).toBe(403);
    expect((await alice.call('DELETE', `/api/taverns/${tavern.id}/feed/${joined.id}`)).status).toBe(200);
    expect((await feed()).some((e) => e.id === joined.id)).toBe(false);
    expect(await db.query('select 1 from feed_events where id = $1::bigint', [joined.id])).toHaveLength(0);
    expect((await alice.call('DELETE', `/api/taverns/${tavern.id}/feed/${joined.id}`)).status).toBe(404);

    // A character's post shows in every tavern the character is in: deleting it here leaves it in the other one.
    const other = (await alice.post('/api/taverns', { name: 'The Other Place' })).body;
    await alice.put(`/api/taverns/${other.id}/characters/${a.id}`);
    await alice.post(`/api/characters/${a.id}/dungeons`, { dungeon: 'The Deadmines', completed: true });
    const cleared = (await feed()).find((e) => e.kind === 'dungeon_cleared')!;
    expect((await alice.call('DELETE', `/api/taverns/${tavern.id}/feed/${cleared.id}`)).status).toBe(200);
    expect((await feed()).some((e) => e.id === cleared.id)).toBe(false);
    const elsewhere = (await alice.get(`/api/taverns/${other.id}/feed`)).body.events as { id: string }[];
    expect(elsewhere.some((e) => e.id === cleared.id)).toBe(true);
    // Hidden posts can't be cheered either.
    expect((await bob.put(`/api/taverns/${tavern.id}/feed/${cleared.id}/cheers`)).status).toBe(404);

    // Posts from another tavern can't be deleted from here.
    const founded = (elsewhere as { id: string; kind?: string }[]).find((e) => e.kind === 'tavern_founded')!;
    expect((await alice.call('DELETE', `/api/taverns/${tavern.id}/feed/${founded.id}`)).status).toBe(404);
  });

  it('makes the owner an admin, and lets the owner make other members admins', async () => {
    const { db, alice, bob, carol, tavern, ids } = await tavernWithFriends();
    expect((await alice.get(`/api/taverns/${tavern.id}`)).body.isAdmin).toBe(true);
    expect((await bob.get(`/api/taverns/${tavern.id}`)).body.isAdmin).toBe(false);
    const [row] = await db.query<{ is_admin: boolean }>(
      'select is_admin from tavern_members where tavern_id = $1 and user_id = $2',
      [tavern.id, ids.Alice],
    );
    expect(row.is_admin).toBe(true);

    const url = (who: string) => `/api/taverns/${tavern.id}/members/${ids[who]}/admin`;
    // Only the owner hands out admin, even to an admin.
    expect((await bob.call('PUT', url('Carol'), { admin: true })).status).toBe(403);
    const updated = await alice.call('PUT', url('Bob'), { admin: true });
    expect(updated.status).toBe(200);
    expect(updated.body.members.map((m: { displayName: string; isAdmin: boolean }) => [m.displayName, m.isAdmin])).toEqual([
      ['Alice', true],
      ['Bob', true],
      ['Carol', false],
    ]);
    expect((await bob.get(`/api/taverns/${tavern.id}`)).body.isAdmin).toBe(true);
    expect((await bob.call('PUT', url('Carol'), { admin: true })).status).toBe(403);
    expect((await alice.call('PUT', url('Alice'), { admin: false })).status).toBe(400);
    expect((await alice.call('PUT', url('Bob'), { admin: 'yes' })).status).toBe(400);
    expect((await carol.get(`/api/taverns/${tavern.id}`)).body.isAdmin).toBe(false);

    await alice.call('PUT', url('Bob'), { admin: false });
    expect((await bob.get(`/api/taverns/${tavern.id}`)).body.isAdmin).toBe(false);
  });

  it("lets admins change a character's IRL name in this tavern only", async () => {
    const { alice, bob, tavern, b } = await tavernWithFriends();
    const url = `/api/taverns/${tavern.id}/characters/${b.id}`;
    expect((await bob.patch(url, { irlName: 'Bobby' })).status).toBe(403);

    const res = await alice.patch(url, { irlName: '  Robert   the Bold ' });
    expect(res.status).toBe(200);
    const char = res.body.characters.find((c: { id: string }) => c.id === b.id);
    expect(char).toMatchObject({ ownerName: 'Robert the Bold', irlNameOverridden: true });
    // Shown everywhere the tavern shows the character...
    expect((await bob.get(url)).body.ownerName).toBe('Robert the Bold');
    const board = (await bob.get(`/api/taverns/${tavern.id}/leaderboard`)).body;
    expect(board.find((c: { id: string }) => c.id === b.id).ownerName).toBe('Robert the Bold');
    const run = (
      await bob.post(`/api/taverns/${tavern.id}/runs`, { dungeon: 'Ragefire Chasm', characterIds: [b.id], bosses: [], cleared: false })
    ).body;
    expect(run.characters[0].ownerName).toBe('Robert the Bold');
    // ...but Bob's own name and the global leaderboard keep his display name.
    expect((await bob.get('/api/me')).body.displayName).toBe('Bob');
    expect((await bob.get('/api/leaderboard')).body.find((c: { id: string }) => c.id === b.id).ownerName).toBe('Bob');

    expect((await alice.patch(url, { irlName: 'x'.repeat(41) })).status).toBe(400);
    expect((await alice.patch(url, { irlName: 5 })).status).toBe(400);
    const reset = (await alice.patch(url, { irlName: null })).body;
    expect(reset.characters.find((c: { id: string }) => c.id === b.id)).toMatchObject({
      ownerName: 'Bob',
      irlNameOverridden: false,
    });

    // Only characters in the tavern.
    const loose = (await bob.post('/api/characters', { name: 'Spare', surname: 'Alt' })).body;
    expect((await alice.patch(`/api/taverns/${tavern.id}/characters/${loose.id}`, { irlName: 'Bob' })).status).toBe(404);
  });

  it("lets admins remove anyone's character from the tavern", async () => {
    const { alice, bob, carol, tavern, b, cc, ids } = await tavernWithFriends();
    const count = async () => (await alice.get(`/api/taverns/${tavern.id}`)).body.characters.length;
    // A plain member's removal of someone else's character does nothing.
    await carol.del(`/api/taverns/${tavern.id}/characters/${b.id}`);
    expect(await count()).toBe(3);

    await alice.call('PUT', `/api/taverns/${tavern.id}/members/${ids.Bob}/admin`, { admin: true });
    expect((await bob.del(`/api/taverns/${tavern.id}/characters/${cc.id}`)).status).toBe(200);
    expect(await count()).toBe(2);
    // The character itself stays with its owner.
    expect((await carol.get('/api/characters')).body).toHaveLength(1);
  });

  it('lets admins edit a run, updating its feed post and ticking a new clear', async () => {
    const { alice, bob, carol, tavern, a, b, cc } = await tavernWithFriends();
    const url = `/api/taverns/${tavern.id}/runs`;
    const run = (
      await carol.post(url, { dungeon: 'Ragefire Chasm', date: '2026-11-01', characterIds: [b.id, cc.id], bosses: ['Oggleflint'], cleared: false })
    ).body;
    expect(run).toMatchObject({ canEdit: false, canDelete: true });
    expect((await alice.get(url)).body[0]).toMatchObject({ canEdit: true, canDelete: true });

    const edit = {
      dungeon: 'Wailing Caverns',
      date: '2026-11-02',
      characterIds: [a.id, b.id],
      bosses: ['Lady Anacondra'],
      cleared: true,
      notes: 'Fixed up',
    };
    // Not even whoever logged it, unless they're an admin.
    expect((await carol.patch(`${url}/${run.id}`, edit)).status).toBe(403);
    expect((await alice.patch(`${url}/${run.id}`, { ...edit, characterIds: [] })).status).toBe(400);
    expect((await alice.patch(`${url}/00000000-0000-0000-0000-000000000000`, edit)).status).toBe(404);

    const res = await alice.patch(`${url}/${run.id}`, edit);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: run.id,
      dungeon: 'Wailing Caverns',
      date: '2026-11-02',
      bosses: ['Lady Anacondra'],
      cleared: true,
      notes: 'Fixed up',
      loggedBy: { displayName: 'Carol' },
    });
    expect(res.body.characters.map((c: { name: string }) => c.name)).toEqual(['Grimble', 'Judgement']);
    expect((await bob.get('/api/characters')).body[0].dungeonsCompleted).toEqual({
      'Wailing Caverns': '2026-11-02T00:00:00Z',
    });

    const posts = (await bob.get(`/api/taverns/${tavern.id}/feed`)).body.events.filter(
      (e: { kind: string }) => e.kind === 'dungeon_run',
    );
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ user: { displayName: 'Carol' }, data: { dungeon: 'Wailing Caverns', cleared: true } });
    expect(posts[0].data.characters.map((c: { name: string }) => c.name)).toEqual(['Grimble', 'Judgement']);

    // Someone who has since left can stay in the party, but can't be added back.
    await bob.post(`/api/taverns/${tavern.id}/leave`);
    expect((await alice.patch(`${url}/${run.id}`, { ...edit, notes: 'Bob left' })).status).toBe(200);
    expect((await alice.patch(`${url}/${run.id}`, { ...edit, characterIds: [a.id] })).status).toBe(200);
    expect((await alice.patch(`${url}/${run.id}`, edit)).status).toBe(400);
  });
});
