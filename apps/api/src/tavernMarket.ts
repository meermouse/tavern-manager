import { itemInfo, postedSales, type PostedSales } from './auctionActivity.js';
import type { BlizzardClient, ItemInfo } from './blizzard/client.js';
import type { Db } from './db.js';
import { recordEvent } from './feed.js';

/**
 * "Your local market": a daily post in each tavern, after the region's "Yesterday on the auction house". It looks at
 * the tavern's characters with the latest posts, works out roughly where they're levelling (by faction and level),
 * and shows what items for that level sold for on their side's auction houses yesterday.
 *
 * Auction houses don't say which zone anything came from, so "in their area" means items for their level: gear they
 * can just about use, and trade goods and consumables whose item level matches (Linen Cloth is level 5, Runecloth 50).
 */

export type Faction = 'Alliance' | 'Horde';

/** Classic levelling zones: who quests there (`null` = both sides) and the levels they're for. */
export const LEVELLING_ZONES: { name: string; faction: Faction | null; min: number; max: number }[] = [
  { name: 'Elwynn Forest', faction: 'Alliance', min: 1, max: 10 },
  { name: 'Dun Morogh', faction: 'Alliance', min: 1, max: 10 },
  { name: 'Teldrassil', faction: 'Alliance', min: 1, max: 10 },
  { name: 'Durotar', faction: 'Horde', min: 1, max: 10 },
  { name: 'Mulgore', faction: 'Horde', min: 1, max: 10 },
  { name: 'Tirisfal Glades', faction: 'Horde', min: 1, max: 10 },
  { name: 'Westfall', faction: 'Alliance', min: 10, max: 20 },
  { name: 'Loch Modan', faction: 'Alliance', min: 10, max: 20 },
  { name: 'Darkshore', faction: 'Alliance', min: 10, max: 20 },
  { name: 'The Barrens', faction: 'Horde', min: 10, max: 25 },
  { name: 'Silverpine Forest', faction: 'Horde', min: 10, max: 20 },
  { name: 'Redridge Mountains', faction: 'Alliance', min: 15, max: 25 },
  { name: 'Stonetalon Mountains', faction: null, min: 15, max: 27 },
  { name: 'Ashenvale', faction: null, min: 18, max: 30 },
  { name: 'Duskwood', faction: 'Alliance', min: 18, max: 30 },
  { name: 'Wetlands', faction: 'Alliance', min: 20, max: 30 },
  { name: 'Hillsbrad Foothills', faction: null, min: 20, max: 30 },
  { name: 'Thousand Needles', faction: null, min: 25, max: 35 },
  { name: 'Alterac Mountains', faction: null, min: 30, max: 40 },
  { name: 'Arathi Highlands', faction: null, min: 30, max: 40 },
  { name: 'Desolace', faction: null, min: 30, max: 40 },
  { name: 'Stranglethorn Vale', faction: null, min: 30, max: 45 },
  { name: 'Dustwallow Marsh', faction: null, min: 35, max: 45 },
  { name: 'Badlands', faction: null, min: 35, max: 45 },
  { name: 'Swamp of Sorrows', faction: null, min: 35, max: 45 },
  { name: 'Feralas', faction: null, min: 40, max: 50 },
  { name: 'Tanaris', faction: null, min: 40, max: 50 },
  { name: 'The Hinterlands', faction: null, min: 40, max: 50 },
  { name: 'Searing Gorge', faction: null, min: 43, max: 50 },
  { name: 'Azshara', faction: null, min: 45, max: 55 },
  { name: 'Blasted Lands', faction: null, min: 45, max: 55 },
  { name: "Un'Goro Crater", faction: null, min: 48, max: 55 },
  { name: 'Felwood', faction: null, min: 48, max: 55 },
  { name: 'Burning Steppes', faction: null, min: 50, max: 58 },
  { name: 'Western Plaguelands', faction: null, min: 51, max: 58 },
  { name: 'Eastern Plaguelands', faction: null, min: 53, max: 60 },
  { name: 'Winterspring', faction: null, min: 53, max: 60 },
  { name: 'Silithus', faction: null, min: 55, max: 60 },
];

const HORDE_RACES = new Set(['orc', 'undead', 'forsaken', 'tauren', 'troll', 'blood elf', 'goblin']);

/** The character's side: its saved faction, or else its race. */
export function factionOf(faction: string | null, race: string | null): Faction | null {
  const f = faction?.toLowerCase();
  if (f === 'horde' || f === 'alliance') return f === 'horde' ? 'Horde' : 'Alliance';
  if (!race) return null;
  return HORDE_RACES.has(race.toLowerCase()) ? 'Horde' : 'Alliance';
}

/** Up to three zones a character of this faction and level is likely questing in, best fit first. */
export function zonesFor(faction: Faction, level: number): string[] {
  return LEVELLING_ZONES.filter((z) => (z.faction === null || z.faction === faction) && z.min <= level && level <= z.max)
    .sort((a, b) => Math.abs((a.min + a.max) / 2 - level) - Math.abs((b.min + b.max) / 2 - level))
    .slice(0, 3)
    .map((z) => z.name);
}

export interface Traveller {
  id: string;
  name: string;
  surname: string;
  class: string | null;
  level: number;
  avatarUrl: string | null;
  faction: Faction;
}

export interface MarketGroup {
  faction: Faction;
  /** The level range items are picked for (the characters' levels, give or take a few). */
  minLevel: number;
  maxLevel: number;
  characters: Omit<Traveller, 'faction'>[];
  zones: string[];
  /** Items for that level that sold on the faction's (and neutral) auction houses, most bought first. */
  items: (PostedSales & { level: number })[];
}

export interface TavernMarketData {
  region: string;
  /** YYYY-MM-DD (UTC). */
  day: string;
  groups: MarketGroup[];
}

/** How far either side of the characters' levels an item can be and still count as "for their level". */
const LEVEL_SLACK = 3;
/** Characters in one group are within this many levels of the next. */
const GROUP_GAP = 8;
const MAX_TRAVELLERS = 5;
const MAX_GROUPS = 3;
const ITEMS_PER_GROUP = 5;
/** Best sellers on a side looked at for each group. Their details are cached for good once looked up. */
const CANDIDATES = 150;
/** Items sold fewer times than this are too thin to quote an average for. */
const MIN_PURCHASES = 2;
/** Runs to wait for item details before posting with what's known. */
const MAX_ATTEMPTS = 3;

/**
 * Split characters into groups that are levelling together: by faction, then by level wherever there's a big gap.
 * At most three groups, the ones with the most characters (then the latest) first.
 */
export function groupTravellers(travellers: Traveller[]): { faction: Faction; members: Traveller[] }[] {
  const groups: { faction: Faction; members: Traveller[]; order: number }[] = [];
  for (const faction of ['Alliance', 'Horde'] as const) {
    const sorted = travellers.filter((t) => t.faction === faction).sort((a, b) => a.level - b.level);
    let current: Traveller[] = [];
    for (const t of sorted) {
      if (current.length && t.level - current[current.length - 1].level > GROUP_GAP) {
        groups.push({ faction, members: current, order: Math.min(...current.map((c) => travellers.indexOf(c))) });
        current = [];
      }
      current.push(t);
    }
    if (current.length) groups.push({ faction, members: current, order: Math.min(...current.map((c) => travellers.indexOf(c))) });
  }
  return groups
    .sort((a, b) => b.members.length - a.members.length || a.order - b.order)
    .slice(0, MAX_GROUPS)
    .map(({ faction, members }) => ({ faction, members }));
}

/** What level an item is "for": the level needed to use it, or for items anyone can use, its item level. */
export function itemLevelFor(item: ItemInfo): number | null {
  if (item.requiredLevel && item.requiredLevel > 1) return item.requiredLevel;
  return item.itemLevel && item.itemLevel > 1 ? item.itemLevel : null;
}

/** The tavern's characters (in this region) with the latest posts, newest first; else the latest to log in. */
async function travellers(db: Db, tavernId: string, region: string, now: Date): Promise<Traveller[]> {
  const rows = await db.query<{
    id: string;
    name: string;
    surname: string;
    class: string | null;
    race: string | null;
    faction: string | null;
    level: number | null;
    avatar_url: string | null;
  }>(
    `select c.id, c.name, c.surname, c.class, c.race, c.faction, c.level, c.avatar_url
     from tavern_characters tc
       join characters c on c.id = tc.character_id
       left join lateral (
         select max(e.created_at) as latest from feed_events e
         where e.character_id = c.id and e.created_at > $3::timestamptz - interval '14 days'
       ) p on true
     where tc.tavern_id = $1 and c.region = $2 and c.level is not null
     order by p.latest desc nulls last, c.last_login_at desc nulls last, c.level desc
     limit ${MAX_TRAVELLERS}`,
    [tavernId, region, now.toISOString()],
  );
  return rows.flatMap((r) => {
    const faction = factionOf(r.faction, r.race);
    return faction
      ? [{ id: r.id, name: r.name, surname: r.surname, class: r.class, level: r.level!, avatarUrl: r.avatar_url, faction }]
      : [];
  });
}

type SalesRow = { item_id: number; purchases: string | number; units: string | number; copper: string | number };

/**
 * Build a tavern's market post. `null` when there's nothing to say, or `'wait'` when some best sellers' details
 * haven't been looked up yet (the lookup budget ran out) and it's worth trying again next run.
 */
export async function buildTavernMarket(
  db: Db,
  blizzard: BlizzardClient,
  tavernId: string,
  region: string,
  day: string,
  opts: { now?: Date; budget?: { lookups: number }; final?: boolean } = {},
): Promise<TavernMarketData | null | 'wait'> {
  const now = opts.now ?? new Date();
  const budget = opts.budget ?? { lookups: 200 };
  const groups = groupTravellers(await travellers(db, tavernId, region, now));
  if (!groups.length) return null;

  const salesBySide = new Map<Faction, SalesRow[]>();
  for (const faction of new Set(groups.map((g) => g.faction))) {
    salesBySide.set(
      faction,
      await db.query<SalesRow>(
        `select item_id, sum(purchases) as purchases, sum(units) as units, sum(copper) as copper
         from auction_faction_sales
         where region = $1 and day = $2 and faction = any($3::text[])
         group by item_id having sum(purchases) >= $4 and sum(units) > 0
         order by sum(purchases) desc, item_id limit ${CANDIDATES}`,
        [region, day, [faction, 'Neutral'], MIN_PURCHASES],
      ),
    );
  }
  const ids = [...new Set([...salesBySide.values()].flat().map((r) => r.item_id))];
  const before = await itemInfo(db, blizzard, region, ids, { details: true, budget: 0, placeholders: false });
  const needed = ids.filter((id) => !hasDetails(before.get(id)));
  const lookups = Math.min(needed.length, budget.lookups);
  budget.lookups -= lookups;
  const info = lookups
    ? await itemInfo(db, blizzard, region, ids, { details: true, budget: lookups, placeholders: false })
    : before;
  if (needed.length > lookups && !opts.final) return 'wait';

  const out: MarketGroup[] = [];
  for (const { faction, members } of groups) {
    const levels = members.map((m) => m.level);
    const minLevel = Math.max(1, Math.min(...levels) - LEVEL_SLACK);
    const maxLevel = Math.min(60, Math.max(...levels) + LEVEL_SLACK);
    const median = [...levels].sort((a, b) => a - b)[levels.length >> 1];
    const items: MarketGroup['items'] = [];
    for (const r of salesBySide.get(faction) ?? []) {
      const item = info.get(r.item_id);
      const level = item && itemLevelFor(item);
      if (!item || level == null || item.quality === 'POOR' || level < minLevel || level > maxLevel) continue;
      items.push({ ...postedSales(item, r), level });
      if (items.length >= ITEMS_PER_GROUP) break;
    }
    out.push({
      faction,
      minLevel,
      maxLevel,
      characters: members.map(({ id, name, surname, class: cls, level, avatarUrl }) => ({ id, name, surname, class: cls, level, avatarUrl })),
      zones: zonesFor(faction, median),
      items,
    });
  }
  if (!out.some((g) => g.items.length)) return null;
  return { region, day, groups: out };
}

/** Items cached with their level details (looked up since levels were kept). */
function hasDetails(item: ItemInfo | undefined): boolean {
  return !!item && item.requiredLevel != null;
}

/**
 * Post each tavern's local market for days whose region post has gone up (in the last couple of days). A tavern
 * whose best sellers aren't all looked up yet waits for the next run, up to three runs. Returns how many were posted.
 */
export async function postTavernMarkets(
  db: Db,
  blizzard: BlizzardClient,
  region: string,
  now = new Date(),
  // Item lookups per run: the scheduled function has 30 seconds, most of it spent fetching the auction houses.
  budget = { lookups: 80 },
): Promise<number> {
  const days = await db.query<{ day: string }>(
    `select day from auction_daily where region = $1 and posted_at is not null and day >= $2 order by day`,
    [region, new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10)],
  );
  if (!days.length) return 0;
  const taverns = await db.query<{ id: string }>(
    `select distinct tc.tavern_id as id from tavern_characters tc join characters c on c.id = tc.character_id
     where c.region = $1`,
    [region],
  );
  let posted = 0;
  for (const { day } of days) {
    for (const { id: tavernId } of taverns) {
      // Claim it first, so two overlapping runs can't both post; released below if it has to wait.
      await db.query(
        `insert into auction_market_posts (tavern_id, region, day) values ($1, $2, $3) on conflict do nothing`,
        [tavernId, region, day],
      );
      const [claim] = await db.query<{ attempts: number }>(
        `update auction_market_posts set attempts = attempts + 1, posted_at = now()
         where tavern_id = $1 and region = $2 and day = $3 and posted_at is null returning attempts`,
        [tavernId, region, day],
      );
      if (!claim) continue;
      try {
        const data = await buildTavernMarket(db, blizzard, tavernId, region, day, {
          now,
          budget,
          final: claim.attempts >= MAX_ATTEMPTS,
        });
        if (data === 'wait') {
          await db.query(
            'update auction_market_posts set posted_at = null where tavern_id = $1 and region = $2 and day = $3',
            [tavernId, region, day],
          );
          continue;
        }
        if (!data) continue;
        await recordEvent(db, { kind: 'auction_market', tavernId, data: data as unknown as Record<string, unknown> });
        posted++;
      } catch (err) {
        console.error(`Tavern market post failed (${tavernId}, ${day})`, err);
      }
    }
  }
  // Keep a week of claims, so a day isn't posted twice.
  await db.query(`delete from auction_market_posts where region = $1 and day < $2`, [
    region,
    new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10),
  ]);
  return posted;
}
