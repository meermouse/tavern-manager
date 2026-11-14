import { describe, expect, it } from 'vitest';
import { awardTitles, needPercent, rankTitles } from '../src/titles.js';
import { setup } from './helpers.js';

const rolls = (need: number, greed: number) => ({ 'Need rolls made on loot': need, 'Greed rolls made on loot': greed });
const cooking = (skill: number) => [{ name: 'Cooking', kind: 'secondary', skill, maxSkill: 300 }];
const standings = (key: string, chars: Parameters<typeof rankTitles>[0]) =>
  rankTitles(chars).find((t) => t.key === key)!.standings;

describe('awardTitles', () => {
  it('gives each title to the leader, sharing ties and skipping empty or missing stats', () => {
    const badges = awardTitles([
      { id: 'a', user_id: 'u1', statistics: rolls(2, 18), professions: cooking(100) },
      { id: 'b', user_id: 'u2', statistics: JSON.stringify(rolls(9, 1)), professions: cooking(250) },
      { id: 'c', user_id: 'u3', statistics: rolls(18, 2), professions: cooking(250) },
      { id: 'd', user_id: 'u4', statistics: null },
    ]);
    expect(badges.get('a')).toBeUndefined();
    expect(badges.get('b')!.map((x) => x.name)).toEqual(['The Ninja', 'Head Chef']);
    expect(badges.get('b')![0].value).toBe('90.0% need rolls');
    expect(badges.get('c')!.map((x) => x.key)).toEqual(['ninja', 'head-chef']);
    expect(badges.get('d')).toBeUndefined();
  });

  it('needs enough rolls for The Ninja, and nobody wins at zero', () => {
    expect(needPercent(rolls(1, 0))).toBeNull();
    expect(needPercent({ ...rolls(3, 5), 'Disenchant rolls made on loot': 2 })).toBe(30);
    expect(awardTitles([{ id: 'a', user_id: 'u', statistics: rolls(0, 20), professions: cooking(0) }]).size).toBe(0);
  });
});

describe('rankTitles', () => {
  it('ranks everyone eligible, best first, with tied ranks', () => {
    const rows = standings('ninja', [
      { id: 'a', user_id: 'u1', name: 'Ann', owner_name: 'P1', statistics: rolls(1, 9) },
      { id: 'b', user_id: 'u2', name: 'Bob', owner_name: 'P2', statistics: rolls(5, 5) },
      { id: 'c', user_id: 'u3', name: 'Cid', owner_name: 'P3', statistics: rolls(5, 5) },
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
});

describe('new titles', () => {
  const day = 86_400_000;
  const keysHeld = (c: Parameters<typeof rankTitles>[0][number]) =>
    (awardTitles([c, { id: 'z', user_id: 'uz', statistics: null }]).get(c.id) ?? []).map((b) => b.key);

  it('scores Fishing and First Aid separately from Cooking', () => {
    const professions = [
      { name: 'Cooking', kind: 'secondary', skill: 50, maxSkill: 75 },
      { name: 'Fishing', kind: 'secondary', skill: 120, maxSkill: 150 },
      { name: 'First Aid', kind: 'secondary', skill: 80, maxSkill: 150 },
    ];
    const ranked = rankTitles([{ id: 'a', user_id: 'u', statistics: null, professions }]);
    const value = (key: string) => ranked.find((t) => t.key === key)!.standings[0].value;
    expect([value('head-chef'), value('old-man-sea'), value('field-medic')]).toEqual(['50 Cooking', '120 Fishing', '80 First Aid']);
  });

  it('reads Blizzard statistics for the stat titles', () => {
    const stats = {
      'Total deaths': 40, 'Deaths from falling': 1, 'Beverages consumed': 12, 'Critters killed': 300,
      'Most gold ever owned': 1_234_5678,
    };
    const ranked = rankTitles([{ id: 'a', user_id: 'u', statistics: stats }]);
    const value = (key: string) => ranked.find((t) => t.key === key)!.standings[0]?.value;
    expect(value('corpse-runner')).toBe('40 deaths');
    expect(value('gravity-tester')).toBe('1 fatal fall');
    expect(value('regular')).toBe('12 drinks');
    expect(value('bunny-slayer')).toBe('300 critters');
    expect(value('dragons-hoard')).toBe('1,234g at peak');
  });

  it('uses item level, feed posts and last login', () => {
    expect(keysHeld({ id: 'a', user_id: 'u', statistics: null, item_level: 62, feed_posts: 3 })).toEqual([
      'best-dressed',
      'town-crier',
    ]);
    const away = rankTitles([
      { id: 'a', user_id: 'u1', statistics: null, last_login_at: new Date(Date.now() - 10 * day) },
      { id: 'b', user_id: 'u2', statistics: null, last_login_at: new Date(Date.now() - 2 * day).toISOString() },
      { id: 'c', user_id: 'u3', statistics: null, last_login_at: null },
    ]).find((t) => t.key === 'gone-fishin')!.standings;
    expect(away.map((s) => [s.character!.id, s.value, s.holder])).toEqual([
      ['a', '10 days since last seen', true],
      ['b', '2 days since last seen', false],
    ]);
    // Seen today: not really gone.
    expect(keysHeld({ id: 'a', user_id: 'u', statistics: null, last_login_at: new Date() })).toEqual([]);
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
    // Only the stats under test: clear the gear, logins and feed posts the mock sync filled in.
    const setStats = async (id: string, stats: Record<string, number>, professions: unknown) => {
      await db.query(
        `update characters set statistics = $2::jsonb, professions = $3::jsonb, item_level = null, last_login_at = null
         where id = $1`,
        [id, JSON.stringify(stats), professions && JSON.stringify(professions)],
      );
      await db.query('delete from feed_events where character_id = $1', [id]);
    };
    await setStats(judy.id, rolls(1, 19), cooking(200));
    await setStats(grim.id, rolls(15, 5), null);

    const detail = (await alice.get(`/api/taverns/${tavern.id}`)).body;
    const byId = (id: string) => detail.characters.find((c: { id: string }) => c.id === id);
    expect(byId(judy.id).titles.map((a: { name: string }) => a.name)).toEqual(['Head Chef']);
    expect(byId(grim.id).titles.map((a: { name: string }) => a.name)).toEqual(['The Ninja']);
    const titleKeys = detail.titles.map((t: { key: string }) => t.key);
    expect(titleKeys).toEqual([
      'ninja', 'head-chef', 'old-man-sea', 'field-medic', 'altaholic', 'corpse-runner', 'gravity-tester',
      'regular', 'bunny-slayer', 'dragons-hoard', 'best-dressed', 'town-crier', 'gone-fishin',
    ]);
    // Feed posts are counted (none left), so both are in the running but nobody holds Town Crier at 0.
    const crier = detail.titles.find((t: { key: string }) => t.key === 'town-crier');
    expect(crier.standings.map((s: { score: number; holder: boolean }) => [s.score, s.holder])).toEqual([[0, false], [0, false]]);
    const ninja = detail.titles.find((t: { key: string }) => t.key === 'ninja');
    expect(ninja.standings).toEqual([
      expect.objectContaining({ rank: 1, holder: true, character: { id: grim.id, name: 'Grimble', surname: 'Thornwick' } }),
      expect.objectContaining({ rank: 2, holder: false, player: { userId: expect.any(String), displayName: expect.any(String) } }),
    ]);

    const me = (await bob.get('/api/me')).body;
    expect(me.titles.map((t: { key: string }) => t.key)).toEqual(['ninja']);
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
    expect((await alice.get('/api/me')).body.titles.map((a: { key: string }) => a.key).sort()).toEqual(['head-chef', 'ninja']);
  });
});
