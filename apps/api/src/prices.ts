import type { AuctionTraceStep } from './blizzard/auctions.js';
import type { BlizzardClient } from './blizzard/client.js';
import type { Db } from './db.js';

/**
 * Auction house prices, for "net worth": what a character's equipped gear would fetch at the going price.
 * Soulbound gear that never gets listed has no price and counts for nothing.
 */

/** Auction houses refresh roughly hourly, so there's no point fetching more often. */
export const PRICES_MAX_AGE_MINUTES = 60;

/** Equipped items for character `c` with their auction price (`p.price`, null if not listed), as SQL `from` items. */
const EQUIPPED = `jsonb_array_elements(case when jsonb_typeof(c.equipment) = 'array' then c.equipment else '[]'::jsonb end) eq
  left join auction_prices p on p.region = c.region and p.item_id = (eq->>'id')::int`;

/**
 * Grey items are vendor trash: the odd one listed at a silly price shouldn't make it worth gold. SQL condition on
 * an equipped item `eq`.
 */
const AUCTION_PRICED = `p.price is not null and coalesce(eq->>'quality', '') <> 'POOR'`;

/** One equipped item's value: the auction price if it's listed (and not grey), else what a vendor pays for it. */
const ITEM_VALUE = `case when ${AUCTION_PRICED} then p.price else nullif((eq->>'sellPrice')::numeric, 0) end`;

/**
 * Copper value of character `c`'s equipped gear, as a select-list subquery: each item at its auction house price,
 * or its vendor price when it isn't listed (soulbound gear never is). `null` if nothing has a value.
 */
export const GEAR_VALUE_SQL = `(select sum(${ITEM_VALUE})::float8 from ${EQUIPPED})`;

/** How many of character `c`'s equipped items have an auction price, as a select-list subquery. */
export const GEAR_PRICED_SQL = `(select count(*) filter (where ${AUCTION_PRICED})::int from ${EQUIPPED})`;

/** Auction prices for these items in a region, by item id (for the gear breakdown). */
export async function itemPrices(db: Db, region: string, itemIds: number[]): Promise<Map<number, { price: number; listings: number }>> {
  if (!itemIds.length) return new Map();
  const rows = await db.query<{ item_id: number; price: string | number; listings: number }>(
    'select item_id, price, listings from auction_prices where region = $1 and item_id = any($2::int[])',
    [region, itemIds],
  );
  return new Map(rows.map((r) => [r.item_id, { price: Number(r.price), listings: r.listings }]));
}

/**
 * Fetch the region's auction houses and save each item's going price, unless they were fetched within
 * `maxAgeMinutes`. Returns how many items were priced (0 when skipped or unavailable).
 */
export async function refreshAuctionPrices(
  db: Db,
  blizzard: BlizzardClient,
  region: string,
  opts: { maxAgeMinutes?: number; deadline?: number; force?: boolean } = {},
): Promise<number> {
  if (!blizzard.getAuctionPrices) return 0;
  const maxAge = opts.maxAgeMinutes ?? PRICES_MAX_AGE_MINUTES;
  // Claim the slot first (by attempt, so a failing API isn't hammered), so overlapping runs don't both fetch.
  const [claimed] = await db.query(
    `insert into auction_snapshots (region, attempted_at) values ($1, now())
     on conflict (region) do update set attempted_at = now()
       where $2 or auction_snapshots.attempted_at < now() - make_interval(mins => $3::int)
     returning region`,
    [region, !!opts.force, maxAge],
  );
  if (!claimed) return 0;
  const trace: AuctionTraceStep[] = [];
  try {
    const snapshot = await blizzard.getAuctionPrices(region as never, {
      deadline: opts.deadline,
      trace: (step) => trace.push(step),
    });
    if (!snapshot || snapshot.prices.size === 0) {
      await db.query(`update auction_snapshots set error = $2, trace = $3 where region = $1`, [
        region,
        snapshot ? `${snapshot.houses} auction house(s) answered, but with no priced listings` : 'No auction house answered',
        JSON.stringify(trace),
      ]);
      return 0;
    }
    const entries = [...snapshot.prices];
    // In chunks, to keep each statement's parameter arrays a sensible size.
    for (let i = 0; i < entries.length; i += 2000) {
      const chunk = entries.slice(i, i + 2000);
      await db.query(
        `insert into auction_prices (region, item_id, price, listings, updated_at)
         select $1::text, u.*, now() from unnest($2::int[], $3::bigint[], $4::int[]) as u
         on conflict (region, item_id) do update
           set price = excluded.price, listings = excluded.listings, updated_at = excluded.updated_at`,
        [region, chunk.map(([id]) => id), chunk.map(([, p]) => p.price), chunk.map(([, p]) => p.listings)],
      );
    }
    await db.query(
      `update auction_snapshots set fetched_at = now(), houses = $2, items = $3, error = null, trace = $4 where region = $1`,
      [region, snapshot.houses, entries.length, JSON.stringify(trace)],
    );
    return entries.length;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.query(`update auction_snapshots set error = $2, trace = $3 where region = $1`, [
      region,
      message,
      JSON.stringify(trace),
    ]);
    console.error('Auction price refresh failed', err);
    return 0;
  }
}

/** Refresh prices for every region a character is in. */
export async function refreshAllAuctionPrices(
  db: Db,
  blizzard: BlizzardClient,
  opts: { maxAgeMinutes?: number; deadline?: number } = {},
): Promise<number> {
  const regions = await db.query<{ region: string }>('select distinct region from characters');
  let total = 0;
  for (const { region } of regions) total += await refreshAuctionPrices(db, blizzard, region, opts);
  return total;
}

export interface AuctionStatus {
  region: string;
  /** When the last fetch started. */
  attemptedAt: string | null;
  /** When prices were last saved. */
  fetchedAt: string | null;
  houses: number;
  items: number;
  error: string | null;
  /** Items with a saved price (including older ones not listed in the last fetch). */
  priced: number;
  trace: AuctionTraceStep[];
}

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

/** How each region's auction price fetch is doing, for the debug view. */
export async function auctionStatus(db: Db): Promise<AuctionStatus[]> {
  const rows = await db.query<{
    region: string;
    attempted_at: Date | string | null;
    fetched_at: Date | string | null;
    houses: number | null;
    items: number | null;
    error: string | null;
    trace: unknown;
    priced: number;
  }>(
    `select r.region, s.attempted_at, s.fetched_at, s.houses, s.items, s.error, s.trace,
       (select count(*)::int from auction_prices p where p.region = r.region) as priced
     from (select distinct region from characters union select region from auction_snapshots) r
       left join auction_snapshots s on s.region = r.region
     order by r.region`,
  );
  return rows.map((r) => {
    const trace = typeof r.trace === 'string' ? JSON.parse(r.trace) : r.trace;
    return {
      region: r.region,
      attemptedAt: iso(r.attempted_at),
      fetchedAt: iso(r.fetched_at),
      houses: r.houses ?? 0,
      items: r.items ?? 0,
      error: r.error,
      priced: r.priced,
      trace: Array.isArray(trace) ? trace : [],
    };
  });
}
