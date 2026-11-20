import { deflateSync, inflateSync } from 'node:zlib';
import { type AuctionPrice, type AuctionSnapshot, type HouseListings } from './blizzard/auctions.js';
import type { BlizzardClient, ItemInfo } from './blizzard/client.js';
import type { Region } from './config.js';
import type { Db } from './db.js';
import { recordEvent } from './feed.js';

/**
 * "Yesterday on the auction house": a daily feed post estimating what sold, from the hourly auction house fetch.
 *
 * Blizzard only shows what's listed right now, never what sold, so each fetch is compared with the one before.
 * A listing that vanished while it still had hours left probably sold (it could also have been cancelled), and a
 * commodity listing whose quantity dropped sold the difference. Listings that might simply have expired don't count.
 * Sales are added up per item per day (UTC); the morning after, each region gets one post.
 *
 * The previous fetch's listings (about 6 MB compressed for the EU houses) live in a ListingStore rather than the
 * database: reading them back every hour would cost several GB of database egress a month.
 */

// ---------------------------------------------------------------------------------------------------------------
// Where the previous fetch's listings are kept.

export interface ListingStore {
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, data: Uint8Array): Promise<void>;
}

export function memoryListingStore(): ListingStore {
  const map = new Map<string, Uint8Array>();
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, data) => void map.set(key, data),
  };
}

/** Files in a directory (the plain Node server). */
export function fileListingStore(dir: string): ListingStore {
  const path = async (key: string) => (await import('node:path')).join(dir, `${key.replace(/[^\w.-]/g, '_')}.bin`);
  return {
    async get(key) {
      const { readFile } = await import('node:fs/promises');
      try {
        return new Uint8Array(await readFile(await path(key)));
      } catch {
        return null;
      }
    },
    async set(key, data) {
      const { mkdir, rename, writeFile } = await import('node:fs/promises');
      await mkdir(dir, { recursive: true });
      const file = await path(key);
      await writeFile(`${file}.tmp`, data);
      await rename(`${file}.tmp`, file);
    },
  };
}

/** Netlify Blobs (deployed on Netlify). */
export function netlifyListingStore(): ListingStore {
  const store = import('@netlify/blobs').then(({ getStore }) => getStore('auction-listings'));
  return {
    async get(key) {
      const data = await (await store).get(key, { type: 'arrayBuffer' });
      return data ? new Uint8Array(data) : null;
    },
    async set(key, data) {
      await (await store).set(key, data.slice().buffer);
    },
  };
}

/** `netlify` for Netlify Blobs, `off` for none, otherwise a directory. */
export function createListingStore(setting: string | null): ListingStore | null {
  if (!setting || setting === 'off') return null;
  if (setting === 'netlify') return netlifyListingStore();
  return fileListingStore(setting);
}

// ---------------------------------------------------------------------------------------------------------------
// Compact encoding: a JSON header, then each column as varints (ids as gaps, sorted), deflated.

const FORMAT = 1;

function writeVarint(out: number[], n: number) {
  let v = Math.max(0, Math.floor(n));
  while (v >= 0x80) {
    out.push((v % 0x80) | 0x80);
    v = Math.floor(v / 0x80);
  }
  out.push(v);
}

export function encodeHouse(h: HouseListings): Uint8Array {
  const order = h.ids.map((_, i) => i).sort((a, b) => h.ids[a] - h.ids[b]);
  const header = new TextEncoder().encode(
    JSON.stringify({ v: FORMAT, house: h.house, name: h.name, lastModified: h.lastModified, n: order.length }),
  );
  const body: number[] = [];
  writeVarint(body, header.length);
  for (const b of header) body.push(b);
  let prev = 0;
  for (const i of order) {
    writeVarint(body, h.ids[i] - prev);
    prev = h.ids[i];
  }
  for (const col of [h.items, h.quantities, h.units]) for (const i of order) writeVarint(body, col[i]);
  for (const i of order) body.push(h.timeLeft[i] + 1);
  return new Uint8Array(deflateSync(Uint8Array.from(body)));
}

export function decodeHouse(data: Uint8Array): HouseListings | null {
  try {
    const buf = inflateSync(data);
    let pos = 0;
    const read = () => {
      let n = 0;
      let scale = 1;
      for (;;) {
        const b = buf[pos++];
        if (b === undefined) throw new Error('Truncated');
        n += (b & 0x7f) * scale;
        if (b < 0x80) return n;
        scale *= 0x80;
      }
    };
    const headerLength = read();
    const header = JSON.parse(new TextDecoder().decode(buf.subarray(pos, pos + headerLength)));
    pos += headerLength;
    if (header.v !== FORMAT) return null;
    const n: number = header.n;
    const h: HouseListings = {
      house: header.house,
      name: header.name ?? null,
      lastModified: header.lastModified ?? null,
      ids: [],
      items: [],
      quantities: [],
      units: [],
      timeLeft: [],
    };
    let id = 0;
    for (let i = 0; i < n; i++) h.ids.push((id += read()));
    for (const col of [h.items, h.quantities, h.units]) for (let i = 0; i < n; i++) col.push(read());
    for (let i = 0; i < n; i++) h.timeLeft.push(buf[pos++] - 1);
    return h;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Spotting sales.

export interface ItemSales {
  /** Listings bought (a partial buy from a commodity listing counts as one). */
  purchases: number;
  units: number;
  /** Copper spent, at the listings' prices. */
  copper: number;
}

/** Sales of one item in a post, with the average price paid per unit. */
export type PostedSales = AuctionPostItem & ItemSales & { average: number };

/** Average copper paid per unit (0 when nothing sold). */
export const averagePrice = (s: ItemSales) => (s.units > 0 ? Math.round(s.copper / s.units) : 0);

/** The least time each `time_left` band can have left, in hours: SHORT < 30m, MEDIUM < 2h, LONG < 12h, VERY_LONG < 48h. */
const MIN_HOURS_LEFT = [0, 0.5, 2, 12];

/** Longest gap between two fetches still worth comparing: past it, even VERY_LONG listings may have expired. */
const MAX_GAP_HOURS = 12;

/**
 * What probably sold between two fetches of one house. A listing that's gone counts only if it couldn't have expired
 * in the gap (it had more time left than that), and only if it doesn't look relisted: when a new listing of the same
 * item and quantity appeared at a lower price, the seller most likely cancelled it to undercut. (Not at the same
 * price: busy items get fresh listings at the going rate every hour, and those would cancel out real sales.)
 * `null` when the two can't be compared (same data, or too far apart).
 */
export function salesBetween(
  prev: HouseListings,
  cur: HouseListings,
  prices: Map<number, AuctionPrice> = new Map(),
): Map<number, ItemSales> | null {
  const gapHours = (Date.parse(cur.lastModified ?? '') - Date.parse(prev.lastModified ?? '')) / 3_600_000;
  if (!(gapHours > 0) || gapHours > MAX_GAP_HOURS) return null;

  const current = new Map<number, number>();
  cur.ids.forEach((id, i) => current.set(id, i));
  const known = new Set(prev.ids);
  // New listings by item and quantity: where a cancelled listing would have been put back up.
  const fresh = new Map<string, number[]>();
  cur.ids.forEach((id, i) => {
    if (known.has(id)) return;
    const key = `${cur.items[i]}:${cur.quantities[i]}`;
    const list = fresh.get(key);
    if (list) list.push(cur.units[i]);
    else fresh.set(key, [cur.units[i]]);
  });

  // Each item's cheapest listing in the previous fetch, for when it has no going price now.
  const cheapest = new Map<number, { unit: number; listings: number }>();
  prev.items.forEach((item, i) => {
    if (!prev.units[i]) return;
    const c = cheapest.get(item);
    cheapest.set(item, { unit: Math.min(c?.unit ?? Infinity, prev.units[i]), listings: (c?.listings ?? 0) + 1 });
  });
  /** A joke price: a "sale" at it is far more likely a troll giving up. */
  const troll = (item: number, unit: number) => {
    const going = prices.get(item);
    if (going && going.listings >= 2) return unit > going.price * SALE_TROLL_RATIO;
    const c = cheapest.get(item);
    return !!c && c.listings >= 2 && unit > c.unit * SALE_TROLL_RATIO;
  };

  const sales = new Map<number, ItemSales>();
  const add = (item: number, units: number, unit: number) => {
    const s = sales.get(item) ?? { purchases: 0, units: 0, copper: 0 };
    s.purchases += 1;
    s.units += units;
    s.copper += units * unit;
    sales.set(item, s);
  };
  for (let i = 0; i < prev.ids.length; i++) {
    const unit = prev.units[i];
    if (!unit || troll(prev.items[i], unit)) continue; // bid-only (no idea what it went for), or a joke price
    const now = current.get(prev.ids[i]);
    if (now !== undefined) {
      const bought = prev.quantities[i] - cur.quantities[now];
      if (bought > 0) add(prev.items[i], bought, unit);
      continue;
    }
    const tl = prev.timeLeft[i];
    if (tl < 0 || MIN_HOURS_LEFT[tl] < gapHours) continue; // may have expired
    const relisted = fresh.get(`${prev.items[i]}:${prev.quantities[i]}`);
    const match = relisted?.findIndex((u) => u > 0 && u < unit) ?? -1;
    if (match >= 0) {
      relisted!.splice(match, 1);
      continue;
    }
    add(prev.items[i], prev.quantities[i], unit);
  }
  return sales;
}

// ---------------------------------------------------------------------------------------------------------------
// The priciest listing, minus the trolls.

export interface PriceyListing {
  id: number;
  /** Copper per unit. */
  unit: number;
  quantity: number;
  /** The item's going price (median of each house's cheapest listing). */
  going: number;
  house: string | null;
}

/** For the priciest listing: this many times the item's going price is fishing for a misclick, not selling. */
const TROLL_RATIO = 3;

/**
 * For sales, a gentler cut-off: the going price is the cheapest listing, and plenty of honest listings sit a few
 * times above it. On real EU data, 3× dropped a tenth of all listings; 10× still drops the joke prices.
 */
const SALE_TROLL_RATIO = 10;

/**
 * The most expensive listings (per unit), one per item, highest first. Troll listings (a 9,999,999g Linen Cloth,
 * hoping for a misclick) are left out: the item must be listed at least twice across the region, so there's a going
 * price to compare with, and the listing must be within 3× of it.
 */
export function priciestListings(houses: HouseListings[], prices: Map<number, AuctionPrice>, limit = 5): PriceyListing[] {
  const best = new Map<number, PriceyListing>();
  for (const h of houses) {
    for (let i = 0; i < h.ids.length; i++) {
      const unit = h.units[i];
      const going = prices.get(h.items[i]);
      if (!unit || !going || going.listings < 2 || unit > going.price * TROLL_RATIO) continue;
      const seen = best.get(h.items[i]);
      if (!seen || unit > seen.unit) {
        best.set(h.items[i], { id: h.items[i], unit, quantity: h.quantities[i], going: going.price, house: h.name });
      }
    }
  }
  return [...best.values()].sort((a, b) => b.unit - a.unit).slice(0, limit);
}

// ---------------------------------------------------------------------------------------------------------------
// Hourly: compare with the last fetch and add up the day.

const dayOf = (iso: string | null, fallback: Date) => (iso && !Number.isNaN(Date.parse(iso)) ? iso : fallback.toISOString()).slice(0, 10);

/**
 * Compare a fresh fetch with the previous one and save the day's estimated sales and priciest listings. Returns how
 * many houses were compared.
 */
export async function recordAuctionActivity(
  db: Db,
  store: ListingStore,
  region: string,
  snapshot: AuctionSnapshot,
  now = new Date(),
): Promise<number> {
  const houses = snapshot.listings ?? [];
  if (!houses.length) return 0;
  const totals = new Map<string, Map<number, ItemSales>>();
  /** The same, by `${day}|${faction}`. */
  const byFaction = new Map<string, Map<number, ItemSales>>();
  let compared = 0;
  for (const cur of houses) {
    const key = `${region}-${cur.house}`;
    const saved = await store.get(key);
    const prev = saved && decodeHouse(saved);
    const sales = prev && salesBetween(prev, cur, snapshot.prices);
    if (sales) {
      compared++;
      const day = dayOf(cur.lastModified, now);
      addSales(totals, day, sales);
      addSales(byFaction, `${day}|${houseFaction(cur.name)}`, sales);
    }
    // Same data as last time: keep the older copy, so the gap to the next real update is measured from it.
    if (!prev || prev.lastModified !== cur.lastModified) await store.set(key, encodeHouse(cur));
  }

  const today = dayOf(houses.find((h) => h.lastModified)?.lastModified ?? null, now);
  const days = new Set([...totals.keys(), today]);
  for (const day of days) {
    const byItem = totals.get(day);
    await saveSales(db, 'auction_sales', [region, day], byItem);
    // Priciest listings are a "seen today" thing, so they go on the day of this fetch.
    const pricey = day === today ? priciestListings(houses, snapshot.prices) : [];
    const [row] = await db.query<{ priciest: unknown }>(
      `insert into auction_daily (region, day, comparisons, houses)
       values ($1, $2, $3, $4)
       on conflict (region, day) do update set
         comparisons = auction_daily.comparisons + excluded.comparisons,
         houses = greatest(auction_daily.houses, excluded.houses)
       returning priciest`,
      [region, day, byItem ? 1 : 0, byItem ? compared : 0],
    );
    if (pricey.length) {
      const seen = parseJson<PriceyListing[]>(row?.priciest) ?? [];
      const merged = new Map<number, PriceyListing>();
      for (const p of [...seen, ...pricey]) if (!merged.has(p.id) || merged.get(p.id)!.unit < p.unit) merged.set(p.id, p);
      const top = [...merged.values()].sort((a, b) => b.unit - a.unit).slice(0, 5);
      await db.query('update auction_daily set priciest = $3 where region = $1 and day = $2', [region, day, JSON.stringify(top)]);
    }
  }
  for (const [key, byItem] of byFaction) {
    const [day, faction] = key.split('|');
    await saveSales(db, 'auction_faction_sales', [region, day, faction], byItem);
  }
  // Two weeks is plenty of history; the faction split is only needed for yesterday's tavern posts.
  await db.query(`delete from auction_sales where region = $1 and day < $2`, [region, isoDay(now, -14)]);
  await db.query(`delete from auction_faction_sales where region = $1 and day < $2`, [region, isoDay(now, -4)]);
  return compared;
}

/** Which side an auction house serves, from its name ("Horde Auction House"); Blackwater and the like are neutral. */
export function houseFaction(name: string | null): 'Alliance' | 'Horde' | 'Neutral' {
  if (name && /alliance/i.test(name)) return 'Alliance';
  if (name && /horde/i.test(name)) return 'Horde';
  return 'Neutral';
}

function addSales(totals: Map<string, Map<number, ItemSales>>, key: string, sales: Map<number, ItemSales>) {
  const byItem = totals.get(key) ?? new Map<number, ItemSales>();
  for (const [item, s] of sales) {
    const t = byItem.get(item) ?? { purchases: 0, units: 0, copper: 0 };
    t.purchases += s.purchases;
    t.units += s.units;
    t.copper += s.copper;
    byItem.set(item, t);
  }
  totals.set(key, byItem);
}

/** Add sales to `auction_sales` (keyed by region, day) or `auction_faction_sales` (region, day, faction). */
async function saveSales(
  db: Db,
  table: 'auction_sales' | 'auction_faction_sales',
  keys: string[],
  byItem: Map<number, ItemSales> | undefined,
) {
  const entries = byItem ? [...byItem] : [];
  const keyColumns = table === 'auction_sales' ? 'region, day' : 'region, day, faction';
  const keyValues = keys.map((_, i) => `$${i + 1}::text`).join(', ');
  const n = keys.length;
  for (let i = 0; i < entries.length; i += 2000) {
    const chunk = entries.slice(i, i + 2000);
    await db.query(
      `insert into ${table} (${keyColumns}, item_id, purchases, units, copper)
       select ${keyValues}, u.* from unnest($${n + 1}::int[], $${n + 2}::int[], $${n + 3}::bigint[], $${n + 4}::bigint[]) as u
       on conflict (${keyColumns}, item_id) do update set
         purchases = ${table}.purchases + excluded.purchases,
         units = ${table}.units + excluded.units,
         copper = ${table}.copper + excluded.copper`,
      [
        ...keys,
        chunk.map(([id]) => id),
        chunk.map(([, s]) => s.purchases),
        chunk.map(([, s]) => s.units),
        chunk.map(([, s]) => Math.round(s.copper)),
      ],
    );
  }
}

function parseJson<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

function isoDay(now: Date, offsetDays: number): string {
  return new Date(now.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------------------------
// Daily: the post.

/** A day needs this many hourly comparisons before it's worth a post (so a half-watched first day isn't posted). */
export const MIN_COMPARISONS = 12;

export interface AuctionPostItem {
  id: number;
  name: string;
  quality: string;
}

export interface AuctionDailyData {
  region: string;
  /** YYYY-MM-DD (UTC). */
  day: string;
  /** Hourly comparisons the estimate is based on, and the most houses compared at once. */
  hours: number;
  houses: number;
  totals: ItemSales;
  /** Most bought items, by purchases. */
  hottest: PostedSales[];
  /** The item the most gold was spent on. */
  bigSpender: PostedSales | null;
  /** The most expensive believable listing seen that day. */
  priciest: (AuctionPostItem & Omit<PriceyListing, 'id'>) | null;
}

/**
 * Names for these items, from the cache or (for ones we haven't seen) the API. With `details`, items cached before
 * levels were kept are looked up again too. At most `budget` lookups (each in parallel batches); items that weren't
 * looked up are left out with `placeholders: false`, or get a placeholder name.
 */
export async function itemInfo(
  db: Db,
  blizzard: BlizzardClient,
  region: string,
  ids: number[],
  opts: { details?: boolean; budget?: number; placeholders?: boolean } = {},
): Promise<Map<number, ItemInfo>> {
  const out = new Map<number, ItemInfo>();
  if (!ids.length) return out;
  const rows = await db.query<{
    id: number;
    name: string;
    quality: string;
    item_level: number | null;
    required_level: number | null;
    item_class: string | null;
    details_at: Date | string | null;
  }>('select id, name, quality, item_level, required_level, item_class, details_at from item_names where id = any($1::int[])', [ids]);
  const stale = new Set<number>();
  for (const r of rows) {
    out.set(r.id, { id: r.id, name: r.name, quality: r.quality, itemLevel: r.item_level, requiredLevel: r.required_level, itemClass: r.item_class });
    if (opts.details && !r.details_at) stale.add(r.id);
  }
  const missing = ids.filter((id) => !out.has(id) || stale.has(id)).slice(0, opts.budget ?? Infinity);
  if (blizzard.getItem) {
    for (let i = 0; i < missing.length; i += 8) {
      await Promise.all(
        missing.slice(i, i + 8).map(async (id) => {
          try {
            const item = await blizzard.getItem!(region as Region, id);
            if (!item) return;
            out.set(id, item);
            await db.query(
              `insert into item_names (id, name, quality, item_level, required_level, item_class, details_at)
               values ($1, $2, $3, $4, $5, $6, now())
               on conflict (id) do update set name = excluded.name, quality = excluded.quality,
                 item_level = excluded.item_level, required_level = excluded.required_level,
                 item_class = excluded.item_class, details_at = now(), fetched_at = now()`,
              [id, item.name, item.quality, item.itemLevel ?? null, item.requiredLevel ?? null, item.itemClass ?? null],
            );
          } catch (err) {
            console.warn(`Item ${id} lookup failed:`, err instanceof Error ? err.message : err);
          }
        }),
      );
    }
  }
  if (opts.placeholders !== false) {
    for (const id of ids) if (!out.has(id)) out.set(id, { id, name: `Item #${id}`, quality: 'COMMON' });
  }
  return out;
}

/**
 * Post "yesterday on the auction house" for each finished day (in the last few) that hasn't been posted yet and was
 * watched for long enough. Returns the days posted.
 */
export async function postAuctionReports(db: Db, blizzard: BlizzardClient, region: string, now = new Date()): Promise<string[]> {
  const days = await db.query<{ day: string; comparisons: number; houses: number; priciest: unknown }>(
    `select day, comparisons, houses, priciest from auction_daily
     where region = $1 and posted_at is null and day < $2 and day >= $3 and comparisons >= $4
     order by day`,
    [region, isoDay(now, 0), isoDay(now, -3), MIN_COMPARISONS],
  );
  const posted: string[] = [];
  for (const d of days) {
    // Claim it first, so two overlapping runs can't both post.
    const [claimed] = await db.query(
      'update auction_daily set posted_at = now() where region = $1 and day = $2 and posted_at is null returning day',
      [region, d.day],
    );
    if (!claimed) continue;
    const data = await buildReport(db, blizzard, region, d.day, d.comparisons, d.houses, parseJson<PriceyListing[]>(d.priciest) ?? []);
    if (!data) continue;
    await recordEvent(db, { kind: 'auction_daily', data: data as unknown as Record<string, unknown> });
    posted.push(d.day);
  }
  return posted;
}

async function buildReport(
  db: Db,
  blizzard: BlizzardClient,
  region: string,
  day: string,
  hours: number,
  houses: number,
  pricey: PriceyListing[],
): Promise<AuctionDailyData | null> {
  type Row = { item_id: number; purchases: number; units: string | number; copper: string | number };
  const sales = (order: string, limit: number) =>
    db.query<Row>(
      `select item_id, purchases, units, copper from auction_sales where region = $1 and day = $2
       order by ${order} limit ${limit}`,
      [region, day],
    );
  const hottest = await sales('purchases desc, units desc, item_id', 3);
  const [spender] = await sales('copper desc, item_id', 1);
  const [totals] = await db.query<{ purchases: string | number | null; units: string | number | null; copper: string | number | null }>(
    'select sum(purchases) as purchases, sum(units) as units, sum(copper) as copper from auction_sales where region = $1 and day = $2',
    [region, day],
  );
  if (!hottest.length && !pricey.length) return null;
  const info = await itemInfo(db, blizzard, region, [
    ...new Set([...hottest.map((r) => r.item_id), ...(spender ? [spender.item_id] : []), ...pricey.map((p) => p.id)]),
  ]);
  const withSales = (r: Row): PostedSales => postedSales(info.get(r.item_id)!, r);
  // Grey items are vendor trash however they're priced.
  const top = pricey.find((p) => info.get(p.id)?.quality !== 'POOR');
  const named = (id: number) => {
    const { name, quality } = info.get(id)!;
    return { id, name, quality };
  };
  return {
    region,
    day,
    hours,
    houses,
    totals: { purchases: Number(totals?.purchases ?? 0), units: Number(totals?.units ?? 0), copper: Number(totals?.copper ?? 0) },
    hottest: hottest.map(withSales),
    bigSpender: spender ? withSales(spender) : null,
    priciest: top ? { ...named(top.id), unit: top.unit, quantity: top.quantity, going: top.going, house: top.house } : null,
  };
}

/** An item's sales as posted: its name and quality, the totals and the average price per unit. */
export function postedSales(
  item: ItemInfo,
  r: { purchases: string | number; units: string | number; copper: string | number },
): PostedSales {
  const sales = { purchases: Number(r.purchases), units: Number(r.units), copper: Number(r.copper) };
  return { id: item.id, name: item.name, quality: item.quality, ...sales, average: averagePrice(sales) };
}
