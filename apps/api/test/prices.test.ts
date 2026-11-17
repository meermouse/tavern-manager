import { describe, expect, it } from 'vitest';
import { cheapestByItem, combineHouses, idsIn } from '../src/blizzard/auctions.js';
import { createBlizzardClient, type BlizzardClient } from '../src/blizzard/client.js';
import { refreshAuctionPrices } from '../src/prices.js';
import { setup } from './helpers.js';

describe('auction parsing', () => {
  it('finds ids in an index response', () => {
    expect(idsIn({ _links: {}, auctions: [{ id: 110, name: 'A' }, { id: 113 }] })).toEqual([110, 113]);
    expect(idsIn({ rulesets: [{ key: {}, id: 2 }, { id: 1 }] })).toEqual([2, 1]);
    expect(idsIn(null)).toEqual([]);
    expect(idsIn({ auctions: 'nope' })).toEqual([]);
  });

  it('takes the cheapest unit price per item, from buyouts and commodity unit prices', () => {
    const house = cheapestByItem({
      auctions: [
        { id: 1, item: { id: 7 }, quantity: 5, buyout: 5000 }, // 1000 each
        { id: 2, item: { id: 7 }, quantity: 1, buyout: 1500 },
        { id: 3, item: { id: 8 }, quantity: 20, unit_price: 40 },
        { id: 4, item: { id: 9 }, quantity: 1, bid: 100 }, // bid only: no price
        { id: 5, quantity: 1, buyout: 10 }, // no item
      ],
    });
    expect([...house]).toEqual([
      [7, { price: 1000, listings: 2 }],
      [8, { price: 40, listings: 1 }],
    ]);
  });

  it('uses the median of each house’s cheapest listing', () => {
    const h = (price: number) => new Map([[7, { price, listings: 1 }]]);
    expect(combineHouses([h(100), h(120), h(9999)]).get(7)).toEqual({ price: 120, listings: 3 });
    expect(combineHouses([h(100), h(200)]).get(7)?.price).toBe(150);
  });
});

describe('Blizzard auction client', () => {
  it('lists the houses under the first ruleset and merges listings with commodities', async () => {
    const urls: string[] = [];
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      if (url.includes('oauth.battle.net')) return json({ access_token: 't', expires_in: 3600 });
      const path = new URL(url).pathname;
      if (path === '/data/wow/ruleset/index') return json({ rulesets: [{ id: 3 }, { id: 1 }] });
      if (path === '/data/wow/ruleset/1/auctions/index') return json({ auctions: [{ id: 110 }, { id: 113 }] });
      if (path === '/data/wow/ruleset/1/auctions/110') return json({ auctions: [{ item: { id: 7 }, quantity: 1, buyout: 900 }] });
      if (path === '/data/wow/ruleset/1/auctions/110/commodities') return json({ auctions: [{ item: { id: 8 }, quantity: 3, unit_price: 50 }] });
      if (path === '/data/wow/ruleset/1/auctions/113') return json({ auctions: [{ item: { id: 7 }, quantity: 1, buyout: 1100 }] });
      return json({}, 404);
    }) as typeof fetch;
    const client = createBlizzardClient({ clientId: 'id', clientSecret: 'secret' }, fetchImpl);
    const snapshot = await client.getAuctionPrices!('eu');
    expect(snapshot?.houses).toBe(2);
    expect(snapshot?.prices.get(7)).toEqual({ price: 1000, listings: 2 });
    expect(snapshot?.prices.get(8)).toEqual({ price: 50, listings: 1 });
    expect(urls.filter((u) => u.includes('api.blizzard.com')).every((u) => u.includes('namespace=dynamic-forever-eu'))).toBe(true);
  });
});

describe('gear net worth', () => {
  it('prices equipped gear on the leaderboard, leaving out unlisted items, and awards Moneybags', async () => {
    const { db, deps, login } = await setup();
    const alice = await login('Alice#1234');
    const judy = (await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' })).body;
    const tavern = (await alice.post('/api/taverns', { name: 'The Prancing Pony' })).body;
    await alice.put(`/api/taverns/${tavern.id}/characters/${judy.id}`);

    const before = (await alice.get(`/api/taverns/${tavern.id}/leaderboard`)).body[0];
    expect(before.gearValue).toBeNull();
    expect(before.gearPriced).toBe(0);

    expect(await refreshAuctionPrices(db, deps.blizzard, 'eu')).toBeGreaterThan(0);
    // Fresh prices aren't fetched again.
    expect(await refreshAuctionPrices(db, deps.blizzard, 'eu')).toBe(0);

    const entry = (await alice.get(`/api/taverns/${tavern.id}/leaderboard`)).body[0];
    const [row] = await db.query<{ equipment: { id: number }[] }>('select equipment from characters where id = $1', [judy.id]);
    const prices = new Map(
      (await db.query<{ item_id: number; price: string }>('select item_id, price from auction_prices')).map((p) => [
        p.item_id,
        Number(p.price),
      ]),
    );
    const priced = row.equipment.filter((i) => prices.has(i.id));
    expect(entry.gearPriced).toBe(priced.length);
    expect(entry.gearValue).toBe(priced.reduce((sum, i) => sum + prices.get(i.id)!, 0));

    const detail = (await alice.get(`/api/taverns/${tavern.id}`)).body;
    const moneybags = detail.titles.find((t: { key: string }) => t.key === 'moneybags');
    expect(moneybags.standings[0]).toMatchObject({ holder: true, character: { id: judy.id } });
    expect(moneybags.standings[0].value).toMatch(/of gear$/);
  });

  it('records a failure and doesn’t retry straight away', async () => {
    const { db } = await setup();
    let calls = 0;
    const failing = {
      getAuctionPrices: async () => {
        calls++;
        throw new Error('Blizzard API error (403)');
      },
    } as unknown as BlizzardClient;
    expect(await refreshAuctionPrices(db, failing, 'eu')).toBe(0);
    const [snap] = await db.query<{ error: string; fetched_at: Date | null }>('select error, fetched_at from auction_snapshots');
    expect(snap).toMatchObject({ error: 'Blizzard API error (403)', fetched_at: null });
    expect(await refreshAuctionPrices(db, failing, 'eu')).toBe(0);
    expect(calls).toBe(1);
    expect(await refreshAuctionPrices(db, failing, 'eu', { force: true })).toBe(0);
    expect(calls).toBe(2);
  });
});
