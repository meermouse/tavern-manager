import { describe, expect, it } from 'vitest';
import { awardTitles, needPercent, rankTitles } from '../src/titles.js';
import { setup } from './helpers.js';

const rolls = (need: number, greed: number) => ({ 'Need rolls made on loot': need, 'Greed rolls made on loot': greed });
const cooking = (skill: number) => [{ name: 'Cooking', kind: 'secondary', skill, maxSkill: 300 }];
const standings = (key: string, chars: Parameters<typeof rankTitles>[0]) =>
  rankTitles(chars).find((t) => t.key === key)!.standings;

describe('awardTitles', () => {
  it('gives each title to the sole leader, nobody on a tie, skipping empty or missing stats', () => {
    const badges = awardTitles([
      { id: 'a', user_id: 'u1', statistics: rolls(2, 18), professions: cooking(100) },
      { id: 'b', user_id: 'u2', statistics: JSON.stringify(rolls(9, 1)), professions: cooking(250) },
      { id: 'c', user_id: 'u3', statistics: rolls(18, 2), professions: cooking(250) },
      { id: 'd', user_id: 'u4', statistics: null },
    ]);
    expect(badges.get('a')).toBeUndefined();
    // b and c tie on both, so nobody holds either.
    expect(badges.get('b')).toBeUndefined();
    expect(badges.get('c')).toBeUndefined();
    const solo = awardTitles([
      { id: 'a', user_id: 'u1', statistics: rolls(2, 18) },
      { id: 'b', user_id: 'u2', statistics: JSON.stringify(rolls(9, 1)) },
    ]);
    expect(solo.get('b')!.map((x) => [x.name, x.value])).toEqual([['The Ninja', '90.0% need rolls']]);
    expect(badges.get('d')).toBeUndefined();
  });

  it('needs enough rolls for The Ninja, and nobody wins at zero', () => {
    expect(needPercent(rolls(1, 0))).toBeNull();
    expect(needPercent({ ...rolls(3, 5), 'Disenchant rolls made on loot': 2 })).toBe(30);
    expect(awardTitles([{ id: 'a', user_id: 'u', statistics: rolls(0, 20), professions: cooking(0) }]).size).toBe(0);
  });
});

describe('rankTitles', () => {
  const tied = [
    { id: 'a', user_id: 'u1', name: 'Ann', owner_name: 'P1', statistics: rolls(1, 9) },
    { id: 'b', user_id: 'u2', name: 'Bob', owner_name: 'P2', statistics: rolls(5, 5) },
    { id: 'c', user_id: 'u3', name: 'Cid', owner_name: 'P3', statistics: rolls(5, 5) },
    { id: 'd', user_id: 'u4', name: 'Dee', owner_name: 'P4', statistics: {} },
  ];
  const ninja = (incumbents?: Parameters<typeof rankTitles>[1]) => rankTitles(tied, incumbents).find((t) => t.key === 'ninja')!;

  it('ranks everyone eligible with tied ranks, and a tie for the lead with no holder leaves it unheld', () => {
    const t = ninja();
    expect(t.standings.map((r) => [r.character!.name, r.rank, r.holder])).toEqual([
      ['Bob', 1, false],
      ['Cid', 1, false],
      ['Ann', 3, false],
    ]);
    expect(t.standings[2].player).toEqual({ userId: 'u1', displayName: 'P1' });
    expect([t.tiedLeaders, t.holderSince]).toEqual([2, null]);
  });

  it('keeps the title with the holder on a tie, first in the standings', () => {
    const since = new Date('2026-01-01T00:00:00Z');
    const t = ninja(new Map([['ninja', { subjectId: 'c', since }]]));
    expect(t.standings.map((r) => [r.character!.name, r.rank, r.holder])).toEqual([
      ['Cid', 1, true],
      ['Bob', 1, false],
      ['Ann', 3, false],
    ]);
    expect([t.tiedLeaders, t.holderSince]).toEqual([0, since.toISOString()]);
  });

  it('passes the title on when the holder is beaten or gone', () => {
    const since = new Date('2026-01-01T00:00:00Z');
    // Ann held it, but Bob and Cid both beat her: nobody gets it until one of them pulls ahead.
    expect(ninja(new Map([['ninja', { subjectId: 'a', since }]])).tiedLeaders).toBe(2);
    // A holder who's left the tavern doesn't count.
    expect(ninja(new Map([['ninja', { subjectId: 'gone', since }]])).tiedLeaders).toBe(2);
    // A sole new leader takes it now.
    const t = rankTitles(tied.slice(0, 2), new Map([['ninja', { subjectId: 'a', since }]])).find((x) => x.key === 'ninja')!;
    expect(t.standings[0]).toEqual(expect.objectContaining({ holder: true, character: expect.objectContaining({ id: 'b' }) }));
    expect(Date.parse(t.holderSince!)).toBeGreaterThan(since.getTime());
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
      'Total facepalms': 3, 'Times camped': 1, 'Duels lost': 2, 'Elixirs consumed': 14, 'Total waves': 21,
      'Quests completed': 120, 'Number of times hearthed': 1, 'Total LOLs': 9,
      "Total times playing world's smallest violin": 4, 'Creatures killed': 5000,
    };
    const ranked = rankTitles([{ id: 'a', user_id: 'u', statistics: stats }]);
    const value = (key: string) => ranked.find((t) => t.key === key)!.standings[0]?.value;
    expect(value('corpse-runner')).toBe('40 deaths');
    expect(value('gravity-tester')).toBe('1 fatal fall');
    expect(value('regular')).toBe('12 drinks');
    expect(value('bunny-slayer')).toBe('300 critters');
    expect(value('unimpressed')).toBe('3 facepalms');
    expect(value('happy-camper')).toBe('Camped 1 time');
    expect(value('punching-bag')).toBe('2 duels lost');
    expect(value('juiced')).toBe('14 elixirs');
    expect(value('hello-there')).toBe('21 waves');
    expect(value('errand-runner')).toBe('120 quests');
    expect(value('homebody')).toBe('Hearthed 1 time');
    expect(value('class-clown')).toBe('9 laughs');
    expect(value('tiny-violinist')).toBe('Played 4 times');
    expect(value('the-butcher')).toBe('5,000 kills');
    expect(value('half-decent')).toBe('125 K/D');
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
      'regular', 'bunny-slayer', 'unimpressed', 'happy-camper', 'punching-bag', 'juiced', 'hello-there',
      'errand-runner', 'homebody', 'class-clown', 'tiny-violinist', 'the-butcher', 'half-decent', 'best-dressed', 'moneybags', 'town-crier', 'gone-fishin',
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

  it('remembers the holder between requests, so matching their score doesn’t take the title', async () => {
    const { login, db } = await setup();
    const alice = await login('Alice#1234');
    const judy = (await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' })).body;
    const lowe = (await alice.post('/api/characters', { name: 'Lowe', surname: 'Rider' })).body;
    const tavern = (await alice.post('/api/taverns', { name: 'The Prancing Pony' })).body;
    await alice.put(`/api/taverns/${tavern.id}/characters/${judy.id}`);
    await alice.put(`/api/taverns/${tavern.id}/characters/${lowe.id}`);
    const setRolls = (id: string, need: number, greed: number) =>
      db.query('update characters set statistics = $2::jsonb where id = $1', [id, JSON.stringify(rolls(need, greed))]);
    const ninja = async () => {
      const detail = (await alice.get(`/api/taverns/${tavern.id}`)).body;
      const t = detail.titles.find((x: { key: string }) => x.key === 'ninja');
      return { holder: t.standings.find((s: { holder: boolean }) => s.holder)?.character.id ?? null, tied: t.tiedLeaders, since: t.holderSince };
    };

    await setRolls(judy.id, 15, 5);
    await setRolls(lowe.id, 5, 15);
    const first = await ninja();
    expect(first.holder).toBe(judy.id);
    // Lowe draws level: Judy got there first, so keeps it (and her start date).
    await setRolls(lowe.id, 15, 5);
    expect(await ninja()).toEqual({ holder: judy.id, tied: 0, since: first.since });
    // Lowe pulls ahead: the title moves.
    await setRolls(lowe.id, 18, 2);
    expect((await ninja()).holder).toBe(lowe.id);
    // Judy draws level again, but now Lowe is the holder.
    await setRolls(judy.id, 18, 2);
    expect((await ninja()).holder).toBe(lowe.id);
    // The holder leaves, so Judy takes it; when Lowe comes back level with her, she's the one who keeps it.
    await alice.del(`/api/taverns/${tavern.id}/characters/${lowe.id}`);
    expect((await ninja()).holder).toBe(judy.id);
    await alice.put(`/api/taverns/${tavern.id}/characters/${lowe.id}`);
    expect((await ninja()).holder).toBe(judy.id);
  });
});
