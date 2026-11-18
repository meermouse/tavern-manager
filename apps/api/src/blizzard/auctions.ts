/**
 * Auction house data for WoW Forever. Undocumented: these are the paths and shapes the community has found
 * (`dynamic-forever-{region}` namespace, houses listed under a ruleset), so parsing is defensive throughout.
 *
 *   /data/wow/ruleset/index                               rulesets
 *   /data/wow/ruleset/{ruleset}/auctions/index            auction houses (the ruleset in the path is ignored)
 *   /data/wow/ruleset/{ruleset}/auctions/{house}          listings for one house
 *   /data/wow/ruleset/{ruleset}/auctions/{house}/commodities
 *
 * Listings don't say who is selling, so this can price items but never credit a seller.
 */

type Json = Record<string, unknown>;

/** House ids the community has reported for EU (pvp, g2, g3, g4, g5 groups × Alliance/Horde/Blackwater). */
export const KNOWN_AUCTION_HOUSES = [110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 123, 124, 125];

/** The going price of one item across a region's auction houses. */
export interface AuctionPrice {
  /** Copper per unit: the median of each house's cheapest listing, so one silly listing can't set it. */
  price: number;
  /** How many listings (not units) were seen. */
  listings: number;
}

export interface AuctionSnapshot {
  /** Auction houses that answered. */
  houses: number;
  prices: Map<number, AuctionPrice>;
  /** Every listing, house by house, for spotting sales between fetches (see auctionActivity.ts). */
  listings?: HouseListings[];
}

/** One request made while fetching prices, for the debug view. */
export interface AuctionTraceStep {
  path: string;
  /** HTTP status, or `null` when the request never got an answer (timeout, network error). */
  status: number | null;
  ms: number;
  /** Size of the response body. */
  bytes?: number;
  /** The response's top-level keys, to spot a shape we don't parse. */
  keys?: string[];
  /** Entries in its `auctions` array, if it has one. */
  auctions?: number;
  /** Items priced from it (listings responses only). */
  priced?: number;
  error?: string;
}

/** The ids in the first array of `{ id }` objects in a response, e.g. `{ auctions: [{ id: 110, ... }] }`. */
export function idsIn(json: unknown): number[] {
  if (!json || typeof json !== 'object') return [];
  const lists = Array.isArray(json) ? [json] : Object.values(json as Json).filter(Array.isArray);
  for (const list of lists as unknown[][]) {
    const ids = list
      .map((e) => (e && typeof e === 'object' ? (e as Json).id : null))
      .filter((id): id is number => typeof id === 'number' && Number.isInteger(id));
    if (ids.length) return ids;
  }
  return [];
}

/** House id → name ("Horde Auction House") from the auction house index. */
export function houseNames(json: unknown): Map<number, string> {
  const out = new Map<number, string>();
  const list = json && typeof json === 'object' ? (json as Json).auctions : null;
  if (!Array.isArray(list)) return out;
  for (const h of list) {
    if (h && typeof h === 'object' && typeof (h as Json).id === 'number' && typeof (h as Json).name === 'string') {
      out.set((h as Json).id as number, (h as Json).name as string);
    }
  }
  return out;
}

/** Cheapest copper-per-unit for each item in one house's listings (auctions and commodities responses alike). */
export function cheapestByItem(json: unknown): Map<number, { price: number; listings: number }> {
  const out = new Map<number, { price: number; listings: number }>();
  const auctions = json && typeof json === 'object' ? (json as Json).auctions : null;
  if (!Array.isArray(auctions)) return out;
  for (const raw of auctions) {
    if (!raw || typeof raw !== 'object') continue;
    const a = raw as Json;
    const item = a.item as Json | undefined;
    const id = typeof item?.id === 'number' ? item.id : null;
    if (id == null) continue;
    const quantity = typeof a.quantity === 'number' && a.quantity > 0 ? a.quantity : 1;
    // Commodities have a unit price; other listings a buyout for the whole stack (bid-only ones have neither).
    const unit =
      typeof a.unit_price === 'number' ? a.unit_price : typeof a.buyout === 'number' ? a.buyout / quantity : null;
    if (unit == null || !(unit > 0)) continue;
    const seen = out.get(id);
    out.set(id, { price: Math.min(seen?.price ?? Infinity, unit), listings: (seen?.listings ?? 0) + 1 });
  }
  return out;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Combine each house's cheapest prices into one going price per item. */
export function combineHouses(houses: Map<number, { price: number; listings: number }>[]): Map<number, AuctionPrice> {
  const byItem = new Map<number, { prices: number[]; listings: number }>();
  for (const house of houses) {
    for (const [id, { price, listings }] of house) {
      const entry = byItem.get(id) ?? { prices: [], listings: 0 };
      entry.prices.push(price);
      entry.listings += listings;
      byItem.set(id, entry);
    }
  }
  const out = new Map<number, AuctionPrice>();
  for (const [id, { prices, listings }] of byItem) out.set(id, { price: Math.round(median(prices)), listings });
  return out;
}

/** `time_left` codes, shortest first. */
export const TIME_LEFT = ['SHORT', 'MEDIUM', 'LONG', 'VERY_LONG'] as const;

/**
 * Every listing in one auction house (its auctions and commodities together), kept compactly so the next hourly
 * fetch can be compared with it to spot what sold. Parallel arrays, one entry per listing.
 */
export interface HouseListings {
  house: number;
  /** e.g. "Horde Auction House". */
  name: string | null;
  /** When Blizzard last rebuilt this house's data (ISO), from `Last-Modified`. */
  lastModified: string | null;
  ids: number[];
  items: number[];
  quantities: number[];
  /** Copper per unit, rounded; 0 for bid-only listings. */
  units: number[];
  /** Index into TIME_LEFT, or -1 if unknown. */
  timeLeft: number[];
}

export function emptyHouse(house: number, name: string | null = null): HouseListings {
  return { house, name, lastModified: null, ids: [], items: [], quantities: [], units: [], timeLeft: [] };
}

/** Add one listings or commodities response to a house's listings. */
export function addListings(house: HouseListings, json: unknown): void {
  const auctions = json && typeof json === 'object' ? (json as Json).auctions : null;
  if (!Array.isArray(auctions)) return;
  for (const raw of auctions) {
    if (!raw || typeof raw !== 'object') continue;
    const a = raw as Json;
    const item = a.item as Json | undefined;
    if (typeof a.id !== 'number' || typeof item?.id !== 'number') continue;
    const quantity = typeof a.quantity === 'number' && a.quantity > 0 ? a.quantity : 1;
    const unit =
      typeof a.unit_price === 'number' ? a.unit_price : typeof a.buyout === 'number' ? a.buyout / quantity : 0;
    house.ids.push(a.id);
    house.items.push(item.id);
    house.quantities.push(quantity);
    house.units.push(unit > 0 ? Math.round(unit) : 0);
    house.timeLeft.push(TIME_LEFT.indexOf(a.time_left as (typeof TIME_LEFT)[number]));
  }
}
