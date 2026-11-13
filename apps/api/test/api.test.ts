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

  it('shows the owner the raw Blizzard statistics responses', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    const bob = await login('Bob#5678');
    const judy = (await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' })).body;
    const res = await alice.get(`/api/characters/${judy.id}/blizzard-stats`);
    expect(res.status).toBe(200);
    expect(res.body.live['/achievements/statistics'].categories[0].statistics.length).toBeGreaterThan(0);
    expect(res.body.live['/statistics'].health).toBeGreaterThan(0);
    expect(res.body.saved.statistics['Total deaths']).toBeGreaterThanOrEqual(0);
    expect((await bob.get(`/api/characters/${judy.id}/blizzard-stats`)).status).toBe(404);
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
});
