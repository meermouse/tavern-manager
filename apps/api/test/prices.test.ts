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
    const trace: { path: string; status: number | null; priced?: number }[] = [];
    const snapshot = await client.getAuctionPrices!('eu', { trace: (s) => trace.push(s) });
    expect(snapshot?.houses).toBe(2);
    expect(snapshot?.prices.get(7)).toEqual({ price: 1000, listings: 2 });
    expect(snapshot?.prices.get(8)).toEqual({ price: 50, listings: 1 });
    expect(urls.filter((u) => u.includes('api.blizzard.com')).every((u) => u.includes('namespace=dynamic-forever-eu'))).toBe(true);
    expect(trace.find((s) => s.path === '/data/wow/ruleset/1/auctions/110')).toMatchObject({ status: 200, priced: 1 });
    expect(trace.find((s) => s.path === '/data/wow/ruleset/1/auctions/113/commodities')).toMatchObject({ status: 404 });
  });

  it('reports why, when no auction house answers', async () => {
    const fetchImpl = (async (url: string) =>
      url.includes('oauth.battle.net')
        ? new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }))
        : new Response('Forbidden', { status: 403 })) as typeof fetch;
    const client = createBlizzardClient({ clientId: 'id', clientSecret: 'secret' }, fetchImpl);
    const trace: { status: number | null; error?: string }[] = [];
    await expect(client.getAuctionPrices!('eu', { trace: (s) => trace.push(s) })).rejects.toThrow(/403/);
    // Both index calls, then listings and commodities for each known house.
    expect(trace.length).toBeGreaterThan(2);
    expect(trace.every((s) => s.status === 403 && s.error === 'Forbidden')).toBe(true);
  });

  it('gives up on a request that takes too long', async () => {
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (url.includes('oauth.battle.net')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }));
      return new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)),
      );
    }) as typeof fetch;
    const client = createBlizzardClient({ clientId: 'id', clientSecret: 'secret' }, fetchImpl);
    const trace: { status: number | null; error?: string }[] = [];
    // A deadline already passed: index calls get the 1s minimum, and no house is started.
    const result = await client.getAuctionPrices!('eu', { deadline: Date.now() - 10_000, trace: (s) => trace.push(s) });
    expect(result).toBeNull();
    expect(trace).toHaveLength(2);
    expect(trace[0]).toMatchObject({ status: null, error: 'Timed out after 1s' });
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
    // Before any auction prices, gear is worth what a vendor pays.
    expect(before.gearValue).toBeGreaterThan(0);
    expect(before.gearPriced).toBe(0);

    expect(await refreshAuctionPrices(db, deps.blizzard, 'eu')).toBeGreaterThan(0);
    // Fresh prices aren't fetched again.
    expect(await refreshAuctionPrices(db, deps.blizzard, 'eu')).toBe(0);

    const entry = (await alice.get(`/api/taverns/${tavern.id}/leaderboard`)).body[0];
    const [row] = await db.query<{ equipment: { id: number; sellPrice: number }[] }>('select equipment from characters where id = $1', [judy.id]);
    const prices = new Map(
      (await db.query<{ item_id: number; price: string }>('select item_id, price from auction_prices')).map((p) => [
        p.item_id,
        Number(p.price),
      ]),
    );
    const priced = row.equipment.filter((i) => prices.has(i.id));
    expect(entry.gearPriced).toBe(priced.length);
    // Listed items at their auction price, the rest (the unlisted Crown) at their vendor price.
    const value = (i: { id: number; sellPrice: number }) => prices.get(i.id) ?? i.sellPrice;
    expect(entry.gearValue).toBe(row.equipment.reduce((sum, i) => sum + value(i), 0));

    // The details pane breaks it down per item.
    const details = (await alice.get(`/api/taverns/${tavern.id}/characters/${judy.id}`)).body;
    expect(details.gearValue).toBe(entry.gearValue);
    for (const item of details.equipment) {
      expect(item.auctionPrice).toBe(prices.get(item.id) ?? null);
      expect(item.value).toBe(prices.get(item.id) ?? item.sellPrice);
    }

    const detail = (await alice.get(`/api/taverns/${tavern.id}`)).body;
    const moneybags = detail.titles.find((t: { key: string }) => t.key === 'moneybags');
    expect(moneybags.standings[0]).toMatchObject({ holder: true, character: { id: judy.id } });
    expect(moneybags.standings[0].value).toMatch(/of gear$/);
  });

  it('values grey items at their vendor price, whatever the auction house asks', async () => {
    const { db, login } = await setup();
    const alice = await login('Alice#1234');
    const judy = (await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' })).body;
    const tavern = (await alice.post('/api/taverns', { name: 'The Prancing Pony' })).body;
    await alice.put(`/api/taverns/${tavern.id}/characters/${judy.id}`);
    await db.query('update characters set equipment = $2::jsonb where id = $1', [
      judy.id,
      JSON.stringify([
        { id: 1, name: 'Ragged Leather Pants', quality: 'POOR', slot: 'Legs', itemLevel: 2, sellPrice: 3 },
        { id: 2, name: 'Wolfskin Bracers', quality: 'UNCOMMON', slot: 'Wrist', itemLevel: 8, sellPrice: 6 },
      ]),
    ]);
    // Someone's asking 5g for the grey pants; the bracers really do sell for 20s.
    await db.query(`insert into auction_prices (region, item_id, price, listings) values ('eu', 1, 50000, 1), ('eu', 2, 2000, 4)`);

    const entry = (await alice.get(`/api/taverns/${tavern.id}/leaderboard`)).body[0];
    expect(entry).toMatchObject({ gearValue: 2003, gearPriced: 1 });
    const details = (await alice.get(`/api/taverns/${tavern.id}/characters/${judy.id}`)).body;
    expect(details.equipment.map((i: { auctionPrice: number | null; value: number }) => [i.auctionPrice, i.value])).toEqual([
      [null, 3],
      [2000, 2000],
    ]);
    expect(details.gearValue).toBe(2003);
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

describe('auction price status routes', () => {
  it('shows the status to members and lets tavern admins fetch now, with a trace', async () => {
    const { login } = await setup();
    const alice = await login('Alice#1234');
    const bob = await login('Bob#5678');
    await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' });

    const before = (await bob.get('/api/auction-prices')).body;
    expect(before).toMatchObject({ supported: true, canRefresh: false });
    expect(before.regions).toEqual([expect.objectContaining({ region: 'eu', priced: 0, fetchedAt: null })]);
    expect((await bob.post('/api/auction-prices/refresh')).status).toBe(403);

    await alice.post('/api/taverns', { name: 'The Prancing Pony' });
    expect((await alice.get('/api/auction-prices')).body.canRefresh).toBe(true);
    const res = await alice.post('/api/auction-prices/refresh');
    expect(res.status).toBe(200);
    const [eu] = res.body.regions;
    expect(eu.priced).toBeGreaterThan(0);
    expect(eu.fetchedAt).not.toBeNull();
    expect(eu.error).toBeNull();
  });

  it('keeps the trace of a failed fetch', async () => {
    const failing = {
      async getAuctionPrices(_region: string, opts: { trace?: (s: object) => void }) {
        opts.trace?.({ path: '/data/wow/ruleset/index', status: 403, ms: 12, error: 'Forbidden' });
        throw new Error('Blizzard API error (403)');
      },
    };
    const { db, login } = await setup();
    const alice = await login('Alice#1234');
    await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' });
    await refreshAuctionPrices(db, failing as unknown as BlizzardClient, 'eu');
    const [eu] = (await alice.get('/api/auction-prices')).body.regions;
    expect(eu).toMatchObject({ error: 'Blizzard API error (403)', fetchedAt: null });
    expect(eu.trace).toEqual([{ path: '/data/wow/ruleset/index', status: 403, ms: 12, error: 'Forbidden' }]);
  });
});
