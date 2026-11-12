import { describe, expect, it } from 'vitest';
import type { BlizzardClient, CompletedAchievement, EquippedItem } from '../src/blizzard/client.js';
import { syncCharacter, type CharacterRow } from '../src/sync.js';
import { setup } from './helpers.js';

interface FakeState {
  level: number;
  items: EquippedItem[] | null;
  achievements: CompletedAchievement[] | null;
  lastLoginAt: Date | null;
  equipmentError?: boolean;
  mediaError?: boolean;
}

/** A Blizzard client whose answers the test controls. */
function fakeBlizzard(state: FakeState) {
  const calls = { equipment: 0, achievements: 0, media: 0 };
  const client: BlizzardClient = {
    async getCharacter(_region, name, surname) {
      return { name, surname, class: 'Mage', race: 'Gnome', level: state.level, ruleset: 'Normal', lastLoginAt: state.lastLoginAt };
    },
    async getAccountCharacters() {
      return [];
    },
    async getEquipment() {
      calls.equipment++;
      if (state.equipmentError) throw new Error('boom');
      return state.items;
    },
    async getAchievements() {
      calls.achievements++;
      return state.achievements;
    },
    async getMedia() {
      calls.media++;
      if (state.mediaError) throw new Error('boom');
      return { avatar: `https://render.example/${calls.media}-avatar.jpg`, inset: null, main: 'https://render.example/main.jpg', mainRaw: null };
    },
  };
  return { client, calls };
}

const item = (id: number, quality: string, name = `Item ${id}`): EquippedItem => ({
  id,
  name,
  quality,
  slot: 'Head',
  itemLevel: 60,
});

async function world(state: FakeState) {
  const { client, calls } = fakeBlizzard(state);
  const ctx = await setup({ blizzard: client });
  const alice = await ctx.login('Alice#1234');
  const tavern = (await alice.post('/api/taverns', { name: 'The Prancing Pony' })).body;
  const ch = (await alice.post('/api/characters', { name: 'Fizzle', surname: 'Sprocket' })).body;
  await alice.put(`/api/taverns/${tavern.id}/characters/${ch.id}`);
  const resync = async () => {
    const [row] = await ctx.db.query<CharacterRow>('select * from characters where id = $1', [ch.id]);
    return syncCharacter(ctx.db, client, row);
  };
  const feed = async () => (await alice.get(`/api/taverns/${tavern.id}/feed`)).body;
  const kinds = async () => (await feed()).events.map((e: { kind: string }) => e.kind);
  return { ...ctx, alice, tavern, ch, resync, feed, kinds, calls };
}

describe('activity feed', () => {
  it('starts with founding and character posts, no spam from the first sync', async () => {
    const w = await world({
      level: 60,
      items: [item(1, 'EPIC'), item(2, 'RARE'), item(3, 'COMMON')],
      achievements: [{ id: 10, name: 'Level 10', completedAt: null }],
      lastLoginAt: null,
    });
    const feed = await w.feed();
    expect(feed.events.map((e: { kind: string }) => e.kind)).toEqual(['character_joined', 'tavern_founded']);
    expect(feed.nextCursor).toBeNull();
    expect(feed.events[0]).toMatchObject({
      character: { name: 'Fizzle', surname: 'Sprocket', class: 'Mage', level: 60 },
      user: { displayName: 'Alice' },
    });
    expect(feed.events[1]).toMatchObject({ data: { tavernName: 'The Prancing Pony' }, character: null });
  });

  it('posts level-ups, combining multiple levels, but not for the same level twice', async () => {
    const state: FakeState = { level: 20, items: [], achievements: [], lastLoginAt: null };
    const w = await world(state);
    state.level = 23;
    await w.resync();
    await w.resync();
    const feed = await w.feed();
    expect(feed.events[0]).toMatchObject({ kind: 'level_up', data: { from: 20, to: 23 } });
    expect(feed.events.filter((e: { kind: string }) => e.kind === 'level_up')).toHaveLength(1);
  });

  it('posts newly equipped rare+ gear once, ignoring common items and re-equips', async () => {
    const state: FakeState = { level: 40, items: [item(1, 'RARE')], achievements: [], lastLoginAt: null };
    const w = await world(state);
    state.items = [item(1, 'RARE'), item(2, 'EPIC', 'Hearthfire Greatblade'), item(3, 'UNCOMMON'), item(4, 'RARE')];
    await w.resync();
    const [loot] = (await w.feed()).events;
    expect(loot).toMatchObject({ kind: 'loot' });
    expect(loot.data.items.map((i: { id: number }) => i.id)).toEqual([2, 4]);
    expect(loot.data.items[0]).toMatchObject({ name: 'Hearthfire Greatblade', quality: 'EPIC', slot: 'Head' });

    // Unequip and re-equip: no new post.
    state.items = [item(1, 'RARE')];
    await w.resync();
    state.items = [item(1, 'RARE'), item(2, 'EPIC')];
    await w.resync();
    expect((await w.kinds()).filter((k: string) => k === 'loot')).toHaveLength(1);
  });

  it('posts new achievements after the baseline', async () => {
    const state: FakeState = {
      level: 40,
      items: [],
      achievements: [{ id: 10, name: 'Level 10', completedAt: null }],
      lastLoginAt: null,
    };
    const w = await world(state);
    state.achievements = [...state.achievements!, { id: 20, name: 'Level 20', completedAt: null }];
    await w.resync();
    const [post] = (await w.feed()).events;
    expect(post).toMatchObject({ kind: 'achievement', data: { achievements: [{ id: 20, name: 'Level 20' }] } });
  });

  it('takes the baseline later if the endpoint was unavailable at first', async () => {
    const state: FakeState = { level: 40, items: null, achievements: null, lastLoginAt: null };
    const w = await world(state);
    state.items = [item(1, 'EPIC')];
    await w.resync(); // baseline, silent
    expect(await w.kinds()).not.toContain('loot');
    state.items = [item(1, 'EPIC'), item(2, 'EPIC')];
    await w.resync();
    expect(await w.kinds()).toContain('loot');
  });

  it("doesn't let equipment errors break the sync", async () => {
    const state: FakeState = { level: 40, items: [], achievements: [], lastLoginAt: null, equipmentError: true };
    const w = await world(state);
    state.level = 41;
    const synced = await w.resync();
    expect(synced).toMatchObject({ status: 'ok', level: 41 });
    expect(await w.kinds()).toContain('level_up');
  });

  it('skips gear and achievement calls when the character has not logged in since', async () => {
    const login = new Date('2026-11-01T00:00:00Z');
    const state: FakeState = { level: 40, items: [], achievements: [], lastLoginAt: login };
    const w = await world(state);
    expect(w.calls).toEqual({ equipment: 1, achievements: 1, media: 1 });
    await w.resync();
    expect(w.calls).toEqual({ equipment: 1, achievements: 1, media: 1 });
    state.lastLoginAt = new Date('2026-11-02T00:00:00Z');
    await w.resync();
    expect(w.calls).toEqual({ equipment: 2, achievements: 2, media: 2 });
  });

  it('shows member joins, scopes character posts to taverns they are in, and is members-only', async () => {
    const state: FakeState = { level: 20, items: [], achievements: [], lastLoginAt: null };
    const w = await world(state);
    const bob = await w.login('Bob#5678');
    const carol = await w.login('Carol#1111');
    await bob.post(`/api/invites/${w.tavern.inviteCode}/join`);
    await bob.post(`/api/invites/${w.tavern.inviteCode}/join`); // already a member: no second post
    expect((await carol.get(`/api/taverns/${w.tavern.id}/feed`)).status).toBe(404);

    // A second tavern without the character doesn't see its level-ups.
    const other = (await w.alice.post('/api/taverns', { name: 'Elsewhere' })).body;
    state.level = 21;
    await w.resync();
    const otherKinds = (await w.alice.get(`/api/taverns/${other.id}/feed`)).body.events.map(
      (e: { kind: string }) => e.kind,
    );
    expect(otherKinds).toEqual(['tavern_founded']);

    const kinds = await w.kinds();
    expect(kinds).toEqual(['level_up', 'member_joined', 'character_joined', 'tavern_founded']);
    const memberPost = (await w.feed()).events[1];
    expect(memberPost).toMatchObject({ user: { displayName: 'Bob' }, character: null });

    // Removing the character from the tavern hides its character posts there.
    await w.alice.del(`/api/taverns/${w.tavern.id}/characters/${w.ch.id}`);
    expect(await w.kinds()).toEqual(['member_joined', 'character_joined', 'tavern_founded']);
  });

  it('paginates newest first', async () => {
    const state: FakeState = { level: 10, items: [], achievements: [], lastLoginAt: null };
    const w = await world(state);
    for (let l = 11; l <= 15; l++) {
      state.level = l;
      await w.resync();
    }
    const page1 = (await w.alice.get(`/api/taverns/${w.tavern.id}/feed?limit=3`)).body;
    expect(page1.events.map((e: { data: { to?: number } }) => e.data.to)).toEqual([15, 14, 13]);
    const page2 = (await w.alice.get(`/api/taverns/${w.tavern.id}/feed?limit=3&before=${page1.nextCursor}`)).body;
    expect(page2.events.map((e: { data: { to?: number } }) => e.data.to)).toEqual([12, 11, undefined]);
    const page3 = (await w.alice.get(`/api/taverns/${w.tavern.id}/feed?limit=3&before=${page2.nextCursor}`)).body;
    expect(page3.events.map((e: { kind: string }) => e.kind)).toEqual(['tavern_founded']);
    expect(page3.nextCursor).toBeNull();
    expect((await w.alice.get(`/api/taverns/${w.tavern.id}/feed?before=abc`)).status).toBe(400);
  });

  it('lets members cheer posts, scoped to the tavern', async () => {
    const state: FakeState = { level: 20, items: [], achievements: [], lastLoginAt: null };
    const w = await world(state);
    const bob = await w.login('Bob#5678');
    const carol = await w.login('Carol#1111');
    await bob.post(`/api/invites/${w.tavern.inviteCode}/join`);
    state.level = 21;
    await w.resync();
    const [levelUp] = (await w.feed()).events;
    expect(levelUp.cheers).toEqual({ count: 0, names: [], cheeredByMe: false });

    const url = `/api/taverns/${w.tavern.id}/feed/${levelUp.id}/cheers`;
    expect((await bob.put(url)).body).toEqual({ count: 1, names: ['Bob'], cheeredByMe: true });
    expect((await bob.put(url)).body.count).toBe(1); // idempotent
    expect((await w.alice.put(url)).body).toEqual({ count: 2, names: ['Bob', 'Alice'], cheeredByMe: true });
    expect((await w.feed()).events[0].cheers).toEqual({ count: 2, names: ['Bob', 'Alice'], cheeredByMe: true });
    expect((await bob.del(url)).body).toEqual({ count: 1, names: ['Alice'], cheeredByMe: false });

    // Non-members, unknown posts, and posts from another tavern are off limits.
    expect((await carol.put(url)).status).toBe(404);
    expect((await bob.put(`/api/taverns/${w.tavern.id}/feed/999999/cheers`)).status).toBe(404);
    expect((await bob.put(`/api/taverns/${w.tavern.id}/feed/abc/cheers`)).status).toBe(404);
    const other = (await w.alice.post('/api/taverns', { name: 'Elsewhere' })).body;
    const otherPost = (await w.alice.get(`/api/taverns/${other.id}/feed`)).body.events[0];
    expect((await w.alice.put(`/api/taverns/${w.tavern.id}/feed/${otherPost.id}/cheers`)).status).toBe(404);

    // The same character post in another tavern has its own cheers.
    await w.alice.put(`/api/taverns/${other.id}/characters/${w.ch.id}`);
    const shared = (await w.alice.get(`/api/taverns/${other.id}/feed`)).body.events.find(
      (e: { id: string }) => e.id === levelUp.id,
    );
    expect(shared.cheers.count).toBe(0);

    // Leaving the tavern removes your cheers there.
    await bob.put(url);
    await bob.post(`/api/taverns/${w.tavern.id}/leave`);
    expect((await w.feed()).events.find((e: { id: string }) => e.id === levelUp.id).cheers.names).toEqual(['Alice']);
  });

  it('stores portraits and full equipment, refetching portraits only after a login or when stale', async () => {
    const state: FakeState = { level: 40, items: [item(1, 'COMMON')], achievements: [], lastLoginAt: new Date(1000) };
    const w = await world(state);
    expect(w.calls.media).toBe(1);
    expect(w.ch).toMatchObject({ avatarUrl: 'https://render.example/1-avatar.jpg', renderUrl: 'https://render.example/main.jpg' });
    const details = (await w.alice.get(`/api/taverns/${w.tavern.id}/characters/${w.ch.id}`)).body;
    expect(details.equipment).toEqual([item(1, 'COMMON')]);

    await w.resync();
    expect(w.calls.media).toBe(1); // no login since: keep the images we have

    state.lastLoginAt = new Date(2000);
    expect((await w.resync()).avatar_url).toBe('https://render.example/2-avatar.jpg');

    // A failing media call keeps the old images and doesn't break the sync.
    state.mediaError = true;
    await w.db.query(`update characters set media_synced_at = now() - interval '2 days'`);
    const row = await w.resync();
    expect(row).toMatchObject({ status: 'ok', avatar_url: 'https://render.example/2-avatar.jpg' });
  });
});
