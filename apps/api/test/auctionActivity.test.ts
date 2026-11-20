import { describe, expect, it } from 'vitest';
import {
  decodeHouse,
  encodeHouse,
  memoryListingStore,
  MIN_COMPARISONS,
  postAuctionReports,
  priciestListings,
  recordAuctionActivity,
  salesBetween,
} from '../src/auctionActivity.js';
import { addListings, emptyHouse, TIME_LEFT, type AuctionPrice, type HouseListings } from '../src/blizzard/auctions.js';
import { createMockBlizzardClient } from '../src/blizzard/mock.js';
import { setup } from './helpers.js';

type Listing = { id: number; item: number; qty?: number; unit: number; tl?: (typeof TIME_LEFT)[number] };

function house(lastModified: string, listings: Listing[], id = 110): HouseListings {
  const h = emptyHouse(id, 'Horde Auction House');
  h.lastModified = lastModified;
  addListings(h, {
    auctions: listings.map((l) => ({
      id: l.id,
      item: { id: l.item },
      quantity: l.qty ?? 1,
      unit_price: l.unit,
      time_left: l.tl ?? 'LONG',
    })),
  });
  return h;
}

const T0 = '2026-11-17T10:00:00.000Z';
const T1 = '2026-11-17T11:00:00.000Z';

describe('listing encoding', () => {
  it('round-trips a house, including big prices and unknown time left', () => {
    const h = house(T0, [
      { id: 151737599, item: 774, unit: 99_999_999_999, tl: 'SHORT' },
      { id: 137059509, item: 2581, qty: 20, unit: 20 },
    ]);
    h.timeLeft[1] = -1;
    const back = decodeHouse(encodeHouse(h))!;
    expect(back.lastModified).toBe(T0);
    expect(back.name).toBe('Horde Auction House');
    // Sorted by id.
    expect(back.ids).toEqual([137059509, 151737599]);
    expect(back.items).toEqual([2581, 774]);
    expect(back.quantities).toEqual([20, 1]);
    expect(back.units).toEqual([20, 99_999_999_999]);
    expect(back.timeLeft).toEqual([-1, 0]);
  });

  it('ignores data it cannot read', () => {
    expect(decodeHouse(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('spotting sales', () => {
  it('counts listings that vanished with time to spare, and commodity quantities that dropped', () => {
    const prev = house(T0, [
      { id: 1, item: 10, unit: 500, tl: 'LONG' }, // gone with 2h+ left: sold
      { id: 2, item: 10, unit: 600, tl: 'MEDIUM' }, // gone, but may have expired
      { id: 3, item: 20, qty: 50, unit: 30, tl: 'VERY_LONG' }, // 15 bought from it
      { id: 4, item: 30, unit: 900, tl: 'VERY_LONG' }, // still there
    ]);
    const cur = house(T1, [
      { id: 3, item: 20, qty: 35, unit: 30, tl: 'VERY_LONG' },
      { id: 4, item: 30, unit: 900, tl: 'VERY_LONG' },
    ]);
    const sales = salesBetween(prev, cur)!;
    expect(sales.get(10)).toEqual({ purchases: 1, units: 1, copper: 500 });
    expect(sales.get(20)).toEqual({ purchases: 1, units: 15, copper: 450 });
    expect(sales.has(30)).toBe(false);
  });

  it('only trusts VERY_LONG listings across a longer gap', () => {
    const prev = house(T0, [
      { id: 1, item: 10, unit: 500, tl: 'LONG' },
      { id: 2, item: 11, unit: 500, tl: 'VERY_LONG' },
    ]);
    const sales = salesBetween(prev, house('2026-11-17T13:00:00.000Z', []))!;
    expect([...sales.keys()]).toEqual([11]);
  });

  it('does not compare the same data, or fetches too far apart', () => {
    const prev = house(T0, [{ id: 1, item: 10, unit: 500 }]);
    expect(salesBetween(prev, house(T0, []))).toBeNull();
    expect(salesBetween(prev, house('2026-11-18T10:00:00.000Z', []))).toBeNull();
  });

  it('treats a listing put back up cheaper as relisted, not sold', () => {
    const prev = house(T0, [
      { id: 1, item: 10, qty: 5, unit: 500 },
      { id: 2, item: 11, unit: 500 },
    ]);
    const cur = house(T1, [
      { id: 7, item: 10, qty: 5, unit: 450 }, // same stack, undercut
      { id: 8, item: 11, unit: 900 }, // dearer: a different seller, so #2 still sold
    ]);
    const sales = salesBetween(prev, cur)!;
    expect(sales.has(10)).toBe(false);
    expect(sales.get(11)?.purchases).toBe(1);
  });

  it('ignores joke prices giving up', () => {
    const prices = new Map<number, AuctionPrice>([[774, { price: 17, listings: 2495 }]]);
    const prev = house(T0, [
      { id: 1, item: 774, unit: 99_999_999_999, tl: 'VERY_LONG' },
      { id: 2, item: 774, unit: 18, tl: 'VERY_LONG' },
    ]);
    const sales = salesBetween(prev, house(T1, []), prices)!;
    expect(sales.get(774)).toEqual({ purchases: 1, units: 1, copper: 18 });
  });
});

describe('priciest listing', () => {
  it('skips trolls and items with nothing to compare with', () => {
    const prices = new Map<number, AuctionPrice>([
      [774, { price: 17, listings: 2495 }], // Malachite at 9,999,999g: troll
      [12717, { price: 8_869_950, listings: 19 }],
      [1728, { price: 50_000_000, listings: 1 }], // only listing: can't tell
    ]);
    const h = house(T0, [
      { id: 1, item: 774, unit: 99_999_999_999 },
      { id: 2, item: 12717, unit: 15_509_998 },
      { id: 3, item: 12717, unit: 9_000_000 },
      { id: 4, item: 1728, unit: 50_000_000 },
    ]);
    expect(priciestListings([h], prices)).toEqual([
      { id: 12717, unit: 15_509_998, quantity: 1, going: 8_869_950, house: 'Horde Auction House' },
    ]);
  });
});

describe('Yesterday on the auction house', () => {
  it('adds up a day of hourly comparisons and posts it the next morning', async () => {
    const ctx = await setup();
    const alice = await ctx.login('Alice#1234');
    const tavern = (await alice.post('/api/taverns', { name: 'The Prancing Pony' })).body;
    const ch = (await alice.post('/api/characters', { name: 'Fizzle', surname: 'Sprocket' })).body;
    await alice.put(`/api/taverns/${tavern.id}/characters/${ch.id}`);
    const [{ region }] = await ctx.db.query<{ region: string }>('select region from characters where id = $1', [ch.id]);

    const store = memoryListingStore();
    // Mock gear ids, so the mock client names them.
    const POTION = 900001;
    const SWORD = 900002;
    const prices = new Map<number, AuctionPrice>([
      [POTION, { price: 100, listings: 40 }],
      [SWORD, { price: 1_000_000, listings: 3 }],
    ]);
    let id = 1;
    // Each hour, two potions and (every third hour) a sword sell; a couple of swords stay listed.
    for (let hour = 0; hour <= MIN_COMPARISONS; hour++) {
      const at = new Date(Date.UTC(2026, 10, 17, 6 + hour)).toISOString();
      const listings: Listing[] = [
        { id: 1_000_000, item: SWORD, unit: 1_200_000, tl: 'VERY_LONG' },
        { id: 1_000_001, item: SWORD, unit: 1_000_000, tl: 'VERY_LONG' },
      ];
      // New listings that will "sell" by the next hour.
      for (let i = 0; i < 2; i++) listings.push({ id: id++, item: POTION, unit: 100 });
      if (hour % 3 === 0) listings.push({ id: id++, item: SWORD, unit: 900_000 });
      await recordAuctionActivity(ctx.db, store, region, { houses: 1, prices, listings: [house(at, listings)] }, new Date(at));
    }
    const [daily] = await ctx.db.query<{ comparisons: number }>('select comparisons from auction_daily where region = $1', [region]);
    expect(daily.comparisons).toBe(MIN_COMPARISONS);
    // Also split by faction, for the tavern market posts.
    const split = await ctx.db.query<{ faction: string; purchases: number }>(
      'select faction, purchases from auction_faction_sales where region = $1 and item_id = $2',
      [region, POTION],
    );
    expect(split).toEqual([{ faction: 'Horde', purchases: 24 }]);

    // Not before the day is over.
    const blizzard = createMockBlizzardClient();
    expect(await postAuctionReports(ctx.db, blizzard, region, new Date('2026-11-17T23:00:00Z'))).toEqual([]);
    const morning = new Date('2026-11-18T00:20:00Z');
    expect(await postAuctionReports(ctx.db, blizzard, region, morning)).toEqual(['2026-11-17']);
    // Once only.
    expect(await postAuctionReports(ctx.db, blizzard, region, morning)).toEqual([]);

    const feed = (await alice.get(`/api/taverns/${tavern.id}/feed`)).body;
    const post = feed.events.find((e: { kind: string }) => e.kind === 'auction_daily');
    expect(post.data).toMatchObject({
      region,
      day: '2026-11-17',
      hours: MIN_COMPARISONS,
      totals: { purchases: 24 + 4, units: 28 },
      hottest: [
        { id: POTION, name: 'Frayed Tavern Apron', purchases: 24, units: 24, copper: 2400, average: 100 },
        { id: SWORD, purchases: 4, average: 900_000 },
      ],
      bigSpender: { id: SWORD, purchases: 4, copper: 3_600_000, average: 900_000 },
      priciest: { id: SWORD, unit: 1_200_000, going: 1_000_000, house: 'Horde Auction House' },
    });
    expect(post.cheers.count).toBe(0);
    // It can be cheered and hidden like any other post.
    expect((await alice.put(`/api/taverns/${tavern.id}/feed/${post.id}/cheers`)).status).toBe(200);
    expect((await alice.del(`/api/taverns/${tavern.id}/feed/${post.id}`)).status).toBe(200);
    const after = (await alice.get(`/api/taverns/${tavern.id}/feed`)).body;
    expect(after.events.some((e: { kind: string }) => e.kind === 'auction_daily')).toBe(false);
  });

  it('is not shown in a tavern with no characters in that region', async () => {
    const ctx = await setup();
    const alice = await ctx.login('Alice#1234');
    const tavern = (await alice.post('/api/taverns', { name: 'Empty' })).body;
    await ctx.db.query(`insert into feed_events (kind, data) values ('auction_daily', '{"region":"eu","day":"2026-11-17"}')`);
    const feed = (await alice.get(`/api/taverns/${tavern.id}/feed`)).body;
    expect(feed.events.some((e: { kind: string }) => e.kind === 'auction_daily')).toBe(false);
  });
});
