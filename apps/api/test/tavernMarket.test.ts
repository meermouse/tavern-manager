import { describe, expect, it } from 'vitest';
import { averagePrice, houseFaction } from '../src/auctionActivity.js';
import { createMockBlizzardClient } from '../src/blizzard/mock.js';
import {
  factionOf,
  groupTravellers,
  itemLevelFor,
  postTavernMarkets,
  zonesFor,
  type Traveller,
} from '../src/tavernMarket.js';
import { setup } from './helpers.js';

const traveller = (id: string, faction: 'Alliance' | 'Horde', level: number): Traveller => ({
  id,
  name: id,
  surname: 'X',
  class: 'Warrior',
  level,
  avatarUrl: null,
  faction,
});

describe('working out where a tavern is levelling', () => {
  it('reads the faction, or falls back to race', () => {
    expect(factionOf('Horde', 'Human')).toBe('Horde');
    expect(factionOf('ALLIANCE', null)).toBe('Alliance');
    expect(factionOf(null, 'Undead')).toBe('Horde');
    expect(factionOf(null, 'Gnome')).toBe('Alliance');
    expect(factionOf(null, null)).toBeNull();
  });

  it('suggests zones for the faction and level', () => {
    expect(zonesFor('Horde', 15)).toContain('The Barrens');
    expect(zonesFor('Horde', 15)).not.toContain('Westfall');
    expect(zonesFor('Alliance', 15)).toContain('Westfall');
    expect(zonesFor('Alliance', 58)).toContain('Eastern Plaguelands');
    expect(zonesFor('Alliance', 30).length).toBeLessThanOrEqual(3);
  });

  it('groups characters by faction and nearby levels, biggest group first', () => {
    const groups = groupTravellers([
      traveller('a', 'Horde', 52),
      traveller('b', 'Alliance', 20),
      traveller('c', 'Alliance', 24),
      traveller('d', 'Alliance', 45),
    ]);
    expect(groups.map((g) => [g.faction, g.members.map((m) => m.id)])).toEqual([
      ['Alliance', ['b', 'c']],
      ['Horde', ['a']],
      ['Alliance', ['d']],
    ]);
  });

  it('uses the level needed, or for anyone-can-use items the item level', () => {
    expect(itemLevelFor({ id: 1, name: 'Helm', quality: 'RARE', requiredLevel: 40, itemLevel: 45 })).toBe(40);
    expect(itemLevelFor({ id: 2, name: 'Silk Cloth', quality: 'COMMON', requiredLevel: 0, itemLevel: 25 })).toBe(25);
    expect(itemLevelFor({ id: 3, name: 'Oddity', quality: 'COMMON', requiredLevel: 0, itemLevel: 1 })).toBeNull();
  });

  it('tells the auction houses apart', () => {
    expect(houseFaction('Horde Auction House')).toBe('Horde');
    expect(houseFaction('Alliance Auction House')).toBe('Alliance');
    expect(houseFaction('Blackwater Auction House')).toBe('Neutral');
    expect(averagePrice({ purchases: 2, units: 40, copper: 1000 })).toBe(25);
    expect(averagePrice({ purchases: 0, units: 0, copper: 0 })).toBe(0);
  });
});

describe('local market post', () => {
  it('shows what sold for the levelling characters on their side', async () => {
    const ctx = await setup();
    const alice = await ctx.login('Alice#1234');
    const tavern = (await alice.post('/api/taverns', { name: 'The Prancing Pony' })).body;
    const ch = (await alice.post('/api/characters', { name: 'Fizzle', surname: 'Sprocket' })).body;
    await alice.put(`/api/taverns/${tavern.id}/characters/${ch.id}`);
    await ctx.db.query(`update characters set level = 24, faction = 'Horde' where id = $1`, [ch.id]);
    const [{ region }] = await ctx.db.query<{ region: string }>('select region from characters where id = $1', [ch.id]);

    const day = '2026-11-17';
    // Mock items: 900003 needs level 22 (in range), 900006 level 52 (too high); other ids are trade goods with
    // item level id % 60 + 1, so 1044 is level 25 (in range) and 1025 is level 6 (too low).
    const sales: [string, number, number, number, number][] = [
      ['Horde', 900003, 3, 3, 3_000_000],
      ['Neutral', 900003, 1, 1, 1_400_000],
      ['Horde', 900006, 50, 50, 50_000_000],
      ['Horde', 1044, 20, 400, 80_000],
      ['Horde', 1025, 90, 900, 9_000],
      ['Alliance', 1044, 500, 5000, 1],
    ];
    for (const [faction, item, purchases, units, copper] of sales) {
      await ctx.db.query(
        `insert into auction_faction_sales (region, day, faction, item_id, purchases, units, copper)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [region, day, faction, item, purchases, units, copper],
      );
    }
    const blizzard = createMockBlizzardClient();
    const morning = new Date('2026-11-18T01:20:00Z');
    // Not until the region's post is up.
    expect(await postTavernMarkets(ctx.db, blizzard, region, morning)).toBe(0);
    await ctx.db.query(`insert into auction_daily (region, day, comparisons, posted_at) values ($1, $2, 24, now())`, [region, day]);
    expect(await postTavernMarkets(ctx.db, blizzard, region, morning)).toBe(1);
    expect(await postTavernMarkets(ctx.db, blizzard, region, morning)).toBe(0);

    const feed = (await alice.get(`/api/taverns/${tavern.id}/feed`)).body;
    const post = feed.events.find((e: { kind: string }) => e.kind === 'auction_market');
    expect(post.data).toMatchObject({
      region,
      day,
      groups: [
        {
          faction: 'Horde',
          minLevel: 21,
          maxLevel: 27,
          characters: [{ id: ch.id, level: 24 }],
          items: [
            { id: 1044, name: 'Mock Item 1044', purchases: 20, units: 400, copper: 80_000, average: 200, level: 25 },
            { id: 900003, name: 'Stoutheart Pauldrons', purchases: 4, units: 4, average: 1_100_000, level: 22 },
          ],
        },
      ],
    });
    expect(post.data.groups[0].items).toHaveLength(2);
    expect(post.data.groups[0].zones).toContain('Ashenvale');
    // Searchable by item and zone.
    const search = (await alice.get(`/api/taverns/${tavern.id}/feed?q=ashenvale`)).body;
    expect(search.events.some((e: { kind: string }) => e.kind === 'auction_market')).toBe(true);
  });

  it('waits for item details when the lookup budget runs out, then posts what it knows', async () => {
    const ctx = await setup();
    const alice = await ctx.login('Alice#1234');
    const tavern = (await alice.post('/api/taverns', { name: 'Pony' })).body;
    const ch = (await alice.post('/api/characters', { name: 'Fizzle', surname: 'Sprocket' })).body;
    await alice.put(`/api/taverns/${tavern.id}/characters/${ch.id}`);
    await ctx.db.query(`update characters set level = 24, faction = 'Horde' where id = $1`, [ch.id]);
    const [{ region }] = await ctx.db.query<{ region: string }>('select region from characters where id = $1', [ch.id]);
    const day = '2026-11-17';
    await ctx.db.query(
      `insert into auction_faction_sales (region, day, faction, item_id, purchases, units, copper)
       values ($1, $2, 'Horde', 1044, 20, 400, 80000)`,
      [region, day],
    );
    await ctx.db.query(`insert into auction_daily (region, day, comparisons, posted_at) values ($1, $2, 24, now())`, [region, day]);
    const blizzard = createMockBlizzardClient();
    const morning = new Date('2026-11-18T01:20:00Z');
    expect(await postTavernMarkets(ctx.db, blizzard, region, morning, { lookups: 0 })).toBe(0);
    expect(await postTavernMarkets(ctx.db, blizzard, region, morning, { lookups: 5 })).toBe(1);
  });
});
