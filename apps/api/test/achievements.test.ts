import { describe, expect, it } from 'vitest';
import { awardAchievements, needPercent } from '../src/achievements.js';
import { setup } from './helpers.js';

const hours = (h: number) => h * 3600;
const rolls = (need: number, greed: number) => ({ 'Need rolls made on loot': need, 'Greed rolls made on loot': greed });

describe('awardAchievements', () => {
  it('gives each title to the leader, sharing ties and skipping empty or missing stats', () => {
    const badges = awardAchievements([
      { id: 'a', user_id: 'u1', statistics: { 'Total time played': hours(100), ...rolls(2, 18) } },
      { id: 'b', user_id: 'u2', statistics: JSON.stringify({ 'Total time played': hours(250), ...rolls(9, 1) }) },
      { id: 'c', user_id: 'u3', statistics: { 'Total time played': hours(250) } },
      { id: 'd', user_id: 'u4', statistics: null },
    ]);
    expect(badges.get('a')).toBeUndefined();
    expect(badges.get('b')!.map((x) => x.name)).toEqual(['He Is Without Life', 'The Ninja']);
    expect(badges.get('b')![0].value).toBe('250 hours played');
    expect(badges.get('b')![1].value).toBe('90.0% need rolls');
    expect(badges.get('c')!.map((x) => x.key)).toEqual(['without-life']);
    expect(badges.get('d')).toBeUndefined();
  });

  it('needs enough rolls for The Ninja, and nobody wins at zero', () => {
    expect(needPercent(rolls(1, 0))).toBeNull();
    expect(needPercent({ ...rolls(3, 5), 'Disenchant rolls made on loot': 2 })).toBe(30);
    expect(awardAchievements([{ id: 'a', user_id: 'u', statistics: { 'Total time played': 0, ...rolls(0, 20) } }]).size).toBe(0);
  });
});

describe('achievement routes', () => {
  it('shows titles on tavern characters and on the holder’s profile', async () => {
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
      db.query('update characters set statistics = $2::jsonb where id = $1', [id, JSON.stringify(stats)]);
    await setStats(judy.id, { 'Total time played': hours(500), ...rolls(1, 19) });
    await setStats(grim.id, { 'Total time played': hours(40), ...rolls(15, 5) });

    const detail = (await alice.get(`/api/taverns/${tavern.id}`)).body;
    const byId = (id: string) => detail.characters.find((c: { id: string }) => c.id === id);
    expect(byId(judy.id).achievements.map((a: { name: string }) => a.name)).toEqual(['He Is Without Life']);
    expect(byId(grim.id).achievements.map((a: { name: string }) => a.name)).toEqual(['The Ninja']);

    const me = (await bob.get('/api/me')).body;
    expect(me.achievements).toEqual([
      expect.objectContaining({
        key: 'ninja',
        tavernId: tavern.id,
        tavernName: 'The Prancing Pony',
        character: { id: grim.id, name: 'Grimble', surname: 'Thornwick' },
      }),
    ]);

    // Leaving the tavern takes the title with it.
    await bob.del(`/api/taverns/${tavern.id}/characters/${grim.id}`);
    expect((await bob.get('/api/me')).body.achievements).toEqual([]);
    expect((await alice.get('/api/me')).body.achievements.map((a: { key: string }) => a.key).sort()).toEqual([
      'ninja',
      'without-life',
    ]);
  });
});
