import { describe, expect, it } from 'vitest';
import { awardTitles, needPercent, rankTitles } from '../src/titles.js';
import { setup } from './helpers.js';

const hours = (h: number) => h * 3600;
const rolls = (need: number, greed: number) => ({ 'Need rolls made on loot': need, 'Greed rolls made on loot': greed });
const cooking = (skill: number) => [{ name: 'Cooking', kind: 'secondary', skill, maxSkill: 300 }];
const standings = (key: string, chars: Parameters<typeof rankTitles>[0]) =>
  rankTitles(chars).find((t) => t.key === key)!.standings;

describe('awardTitles', () => {
  it('gives each title to the leader, sharing ties and skipping empty or missing stats', () => {
    const badges = awardTitles([
      { id: 'a', user_id: 'u1', statistics: { 'Total time played': hours(100), ...rolls(2, 18) } },
      { id: 'b', user_id: 'u2', statistics: JSON.stringify({ 'Total time played': hours(250), ...rolls(9, 1) }) },
      { id: 'c', user_id: 'u3', statistics: { 'Total time played': hours(250) } },
      { id: 'd', user_id: 'u4', statistics: null },
    ]);
    expect(badges.get('a')!.map((x) => x.key)).toEqual(['weak']);
    expect(badges.get('b')!.map((x) => x.name)).toEqual(['He Is Without Life', 'The Ninja']);
    expect(badges.get('b')![0].value).toBe('250 hours played');
    expect(badges.get('b')![1].value).toBe('90.0% need rolls');
    expect(badges.get('c')!.map((x) => x.key)).toEqual(['without-life']);
    expect(badges.get('d')).toBeUndefined();
  });

  it('needs enough rolls for The Ninja, and nobody wins at zero', () => {
    expect(needPercent(rolls(1, 0))).toBeNull();
    expect(needPercent({ ...rolls(3, 5), 'Disenchant rolls made on loot': 2 })).toBe(30);
    expect(awardTitles([{ id: 'a', user_id: 'u', statistics: { 'Total time played': 0, ...rolls(0, 20) } }]).size).toBe(0);
  });
});

describe('rankTitles', () => {
  it('ranks everyone eligible, best first, with tied ranks', () => {
    const rows = standings('without-life', [
      { id: 'a', user_id: 'u1', name: 'Ann', owner_name: 'P1', statistics: { 'Total time played': hours(10) } },
      { id: 'b', user_id: 'u2', name: 'Bob', owner_name: 'P2', statistics: { 'Total time played': hours(30) } },
      { id: 'c', user_id: 'u3', name: 'Cid', owner_name: 'P3', statistics: { 'Total time played': hours(30) } },
      { id: 'd', user_id: 'u4', name: 'Dee', owner_name: 'P4', statistics: {} },
    ]);
    expect(rows.map((r) => [r.character!.name, r.rank, r.holder])).toEqual([
      ['Bob', 1, true],
      ['Cid', 1, true],
      ['Ann', 3, false],
    ]);
    expect(rows[2].player).toEqual({ userId: 'u1', displayName: 'P1' });
  });

  it('Head Chef goes to the best cook; characters without Cooking are left out', () => {
    const rows = standings('head-chef', [
      { id: 'a', user_id: 'u1', statistics: null, professions: cooking(150) },
      { id: 'b', user_id: 'u2', statistics: null, professions: JSON.stringify(cooking(275)) },
      { id: 'c', user_id: 'u3', statistics: null, professions: [{ name: 'Mining', kind: 'primary', skill: 300, maxSkill: 300 }] },
      { id: 'd', user_id: 'u4', statistics: null, professions: null },
    ]);
    expect(rows.map((r) => [r.character!.id, r.value, r.holder])).toEqual([
      ['b', '275 Cooking', true],
      ['a', '150 Cooking', false],
    ]);
  });

  it('Altaholic ranks players by character count, and needs an alt to hold it', () => {
    const roster = [
      { id: 'a1', user_id: 'u1', owner_name: 'Alice', statistics: null },
      { id: 'a2', user_id: 'u1', owner_name: 'Alice', statistics: null },
      { id: 'a3', user_id: 'u1', owner_name: 'Alice', statistics: null },
      { id: 'b1', user_id: 'u2', owner_name: 'Bob', statistics: null },
    ];
    const rows = standings('altaholic', roster);
    expect(rows.map((r) => [r.player.displayName, r.value, r.character, r.holder])).toEqual([
      ['Alice', '3 characters', null, true],
      ['Bob', '1 character', null, false],
    ]);
    // Player titles aren't pinned to a character.
    expect(awardTitles(roster).size).toBe(0);
    expect(standings('altaholic', roster.slice(3))[0].holder).toBe(false);
  });

  it('Weak goes to the least time played, ignoring missing (zero) time', () => {
    const rows = standings('weak', [
      { id: 'a', user_id: 'u1', statistics: { 'Total time played': hours(100) } },
      { id: 'b', user_id: 'u2', statistics: { 'Total time played': hours(2) } },
      { id: 'c', user_id: 'u3', statistics: { 'Total time played': 0 } },
    ]);
    expect(rows.map((r) => [r.character!.id, r.rank, r.holder])).toEqual([
      ['b', 1, true],
      ['a', 2, false],
    ]);
  });
});

describe('title routes', () => {
  it('shows titles on tavern characters, the tavern’s standings and the holder’s profile', async () => {
    const { login, db } = await setup();
    const alice = await login('Alice#1234');
    const bob = await login('Bob#5678');
    const judy = (await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' })).body;
    const grim = (await bob.post('/api/characters', { name: 'Grimble', surname: 'Thornwick' })).body;
    const tavern = (await alice.post('/api/taverns', { name: 'The Prancing Pony' })).body;
    await bob.post(`/api/invites/${tavern.inviteCode}/join`);
    await alice.put(`/api/taverns/${tavern.id}/characters/${judy.id}`);
    await bob.put(`/api/taverns/${tavern.id}/characters/${grim.id}`);
    const setStats = (id: string, stats: Record<string, number>) =>
      db.query('update characters set statistics = $2::jsonb, professions = null where id = $1', [id, JSON.stringify(stats)]);
    await setStats(judy.id, { 'Total time played': hours(500), ...rolls(1, 19) });
    await setStats(grim.id, { 'Total time played': hours(40), ...rolls(15, 5) });

    const detail = (await alice.get(`/api/taverns/${tavern.id}`)).body;
    const byId = (id: string) => detail.characters.find((c: { id: string }) => c.id === id);
    expect(byId(judy.id).titles.map((a: { name: string }) => a.name)).toEqual(['He Is Without Life']);
    expect(byId(grim.id).titles.map((a: { name: string }) => a.name)).toEqual(['The Ninja', 'Weak']);
    const titleKeys = detail.titles.map((t: { key: string }) => t.key);
    expect(titleKeys).toEqual(['without-life', 'ninja', 'head-chef', 'altaholic', 'weak']);
    const ninja = detail.titles.find((t: { key: string }) => t.key === 'ninja');
    expect(ninja.standings).toEqual([
      expect.objectContaining({ rank: 1, holder: true, character: { id: grim.id, name: 'Grimble', surname: 'Thornwick' } }),
      expect.objectContaining({ rank: 2, holder: false, player: { userId: expect.any(String), displayName: expect.any(String) } }),
    ]);

    const me = (await bob.get('/api/me')).body;
    expect(me.titles.map((t: { key: string }) => t.key)).toEqual(['ninja', 'weak']);
    expect(me.titles[0]).toEqual(
      expect.objectContaining({
        tavernId: tavern.id,
        tavernName: 'The Prancing Pony',
        character: { id: grim.id, name: 'Grimble', surname: 'Thornwick' },
      }),
    );

    // Leaving the tavern takes the title with it.
    await bob.del(`/api/taverns/${tavern.id}/characters/${grim.id}`);
    expect((await bob.get('/api/me')).body.titles).toEqual([]);
    expect((await alice.get('/api/me')).body.titles.map((a: { key: string }) => a.key).sort()).toEqual([
      'ninja',
      'weak',
      'without-life',
    ]);
  });
});
