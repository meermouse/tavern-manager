import { describe, expect, it } from 'vitest';
import type { LeaderboardEntry } from './api/client';
import { availableMetrics, findStat, formatMetric, metricByKey, rankBy } from './leaderboard';

function entry(over: Partial<LeaderboardEntry>): LeaderboardEntry {
  return {
    id: crypto.randomUUID(),
    region: 'eu',
    name: 'Name',
    surname: 'Surname',
    ruleset: 'Normal',
    class: 'Warrior',
    race: 'Human',
    level: 10,
    status: 'ok',
    syncError: null,
    lastSyncedAt: null,
    ownerId: 'u1',
    ownerName: 'Alice',
    gearItemLevel: null,
    gearQualities: null,
    achievementsEarned: 0,
    notableItems: 0,
    cheers: 0,
    feedPosts: 0,
    statistics: null,
    characterStats: null,
    statisticsSyncedAt: null,
    ...over,
  };
}

const metric = (key: string) => metricByKey(key)!;

describe('findStat', () => {
  it('prefers exact names, in order, before patterns', () => {
    const map = { 'Creatures killed': 50, 'Total kills': 80, 'Total kills that grant experience': 30 };
    expect(findStat(map, 'Total kills', 'Creatures killed', /kills/i)).toBe(80);
    expect(findStat(map, 'total KILLS')).toBe(80);
    expect(findStat({ 'Creatures killed': 50 }, 'Total kills', /creatures/i)).toBe(50);
    expect(findStat(null, 'Total kills')).toBeNull();
  });
});

describe('rankBy', () => {
  const a = entry({ name: 'Ann', ownerId: 'u1', gearItemLevel: 300 });
  const b = entry({ name: 'Bob', ownerId: 'u2', gearItemLevel: 450 });
  const c = entry({ name: 'Cat', ownerId: 'u1', gearItemLevel: 300 });
  const d = entry({ name: 'Dee', ownerId: 'u3', gearItemLevel: null });

  it('ranks highest first, sharing ranks on ties, no-data last and unranked', () => {
    const rows = rankBy([d, a, c, b], metric('gear-ilvl'));
    expect(rows.map((r) => [r.entry.name, r.rank])).toEqual([
      ['Bob', 1],
      ['Ann', 2],
      ['Cat', 2],
      ['Dee', null],
    ]);
  });

  it('can flip the order, still keeping no-data last', () => {
    expect(rankBy([d, a, b], metric('gear-ilvl'), { ascending: true }).map((r) => r.entry.name)).toEqual(['Ann', 'Bob', 'Dee']);
  });

  it('keeps only each player’s best character', () => {
    const lower = entry({ name: 'Ann', ownerId: 'u1', gearItemLevel: 100 });
    expect(rankBy([lower, b, c], metric('gear-ilvl'), { onePerPlayer: true }).map((r) => r.entry.name)).toEqual(['Bob', 'Cat']);
  });
});

describe('metrics', () => {
  it('reads deaths, kills and k/d from the statistics', () => {
    const e = entry({ statistics: { 'Total deaths': 4, 'Creatures killed': 10 } });
    expect(metric('deaths').value(e)).toBe(4);
    expect(metric('kills').value(e)).toBe(10);
    expect(metric('kd').value(e)).toBe(2.5);
    expect(metric('kd').value(entry({ statistics: { 'Total deaths': 0, 'Total kills': 7 } }))).toBe(7);
  });

  it('offers pinned and populated metrics, plus raw statistics nothing else shows', () => {
    const keys = availableMetrics([
      entry({ statistics: { 'Total deaths': 4, 'Deaths from falling': 1, 'Times jumped': 9000 } }),
    ]).map((m) => m.key);
    expect(keys).toContain('gear-ilvl'); // pinned, even with no gear data
    expect(keys).toContain('falling');
    expect(keys).not.toContain('health'); // nobody has a character sheet
    expect(keys).toContain('stat:Times jumped');
    expect(keys).not.toContain('stat:Total deaths');
    expect(metric('stat:Times jumped').value(entry({ statistics: { 'Times jumped': 3 } }))).toBe(3);
  });

  it('formats values', () => {
    expect(formatMetric(1234567)).toBe((1234567).toLocaleString());
    expect(formatMetric(1234567, 'gold')).toBe('123g 45s');
    expect(formatMetric(4567, 'gold')).toBe('45s 67c');
    expect(formatMetric(5.2, 'percent')).toBe('5.20%');
    expect(formatMetric(0.4, 'days')).toBe('Today');
    expect(formatMetric(3.9, 'days')).toBe('3 days');
  });
});
