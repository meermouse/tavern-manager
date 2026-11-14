import { useCallback, useState } from 'react';
import type { LeaderboardEntry } from './api/client';

export type MetricFormat = 'number' | 'gold' | 'percent' | 'ratio' | 'days' | 'hours';

export interface Metric {
  key: string;
  label: string;
  group: string;
  /** One line shown under the picker. */
  description: string;
  /** `null` = no data for this character. */
  value: ((e: LeaderboardEntry) => number | null) & { statNames?: StatName[] };
  format?: MetricFormat;
  /** Keep in the picker even when nobody has data yet (the headline stats). */
  pinned?: boolean;
  /** Belongs to the player, not the character: ranked one row per player. */
  perPlayer?: boolean;
}

/**
 * Find a statistic by name. Blizzard's names for the Forever API aren't documented, so each metric lists its
 * likely names: exact (case-insensitive) matches are tried first, in order, then patterns.
 */
type StatName = string | RegExp;

export function findStatKey(map: Record<string, number> | null | undefined, names: StatName[]): string | null {
  if (!map) return null;
  const keys = Object.keys(map);
  for (const n of names) {
    if (typeof n !== 'string') continue;
    const hit = keys.find((k) => k.toLowerCase() === n.toLowerCase());
    if (hit) return hit;
  }
  for (const n of names) {
    if (typeof n === 'string') continue;
    const hit = keys.find((k) => n.test(k));
    if (hit) return hit;
  }
  return null;
}

export function findStat(map: Record<string, number> | null | undefined, ...names: StatName[]): number | null {
  const key = findStatKey(map, names);
  return key == null ? null : map![key];
}

/** A metric value read from the achievement statistics; remembers its names so the raw list can skip them. */
function stat(...names: StatName[]) {
  return Object.assign((e: LeaderboardEntry) => findStat(e.statistics, ...names), { statNames: names });
}
const sheet =
  (...names: string[]) =>
  (e: LeaderboardEntry) =>
    findStat(e.characterStats, ...names);

const totalDeaths = stat('Total deaths', /^total deaths$/i, /^deaths$/i);
const totalKills = stat('Total kills', 'Creatures killed', /^total kills/i, /creatures killed/i);
const needRolls = stat('Need rolls made on loot', /need rolls/i);
const greedRolls = stat('Greed rolls made on loot', /greed rolls/i);
const disenchantRolls = stat('Disenchant rolls made on loot', /disenchant rolls/i);

/** Need/greed/disenchant counts; `null` unless we know at least the need and greed rolls. */
function lootRolls(e: LeaderboardEntry) {
  const need = needRolls(e);
  const greed = greedRolls(e);
  if (need == null || greed == null) return null;
  return { need, total: need + greed + (disenchantRolls(e) ?? 0) };
}

const primarySkills = (e: LeaderboardEntry) =>
  (e.professions ?? []).filter((p) => p.kind === 'primary' && p.skill != null).map((p) => p.skill!);
const professionSkill = (name: string) => (e: LeaderboardEntry) =>
  e.professions?.find((p) => p.name.toLowerCase() === name.toLowerCase())?.skill ?? null;

const quality = (...qualities: string[]) => (e: LeaderboardEntry) =>
  e.gearQualities ? qualities.reduce((n, q) => n + (e.gearQualities?.[q] ?? 0), 0) : null;

export const METRICS: Metric[] = [
  // ---- Gear & progress (always available: from data we already sync) ----
  {
    key: 'gear-ilvl', label: 'Total gear item level', group: 'Gear & progress', pinned: true,
    description: 'Every equipped item’s item level added up (shirts and tabards don’t count).',
    value: (e) => e.gearItemLevel ?? null,
  },
  {
    key: 'avg-ilvl', label: 'Average item level', group: 'Gear & progress',
    description: 'Blizzard’s equipped item level for the character.',
    value: (e) => e.itemLevel ?? null,
  },
  {
    key: 'level', label: 'Level', group: 'Gear & progress',
    description: 'Character level.',
    value: (e) => e.level,
  },
  {
    key: 'achievement-points', label: 'Achievement points', group: 'Gear & progress',
    description: 'Total achievement points.',
    value: (e) => e.achievementPoints ?? null,
  },
  {
    key: 'achievements', label: 'Achievements earned', group: 'Gear & progress',
    description: 'Achievements completed, counted since the character joined Tavern Tracker.',
    value: (e) => e.achievementsEarned,
  },
  {
    key: 'epics', label: 'Epic items equipped', group: 'Gear & progress',
    description: 'Purple (or better) items currently worn.',
    value: quality('EPIC', 'LEGENDARY', 'ARTIFACT'),
  },
  {
    key: 'notable-loot', label: 'Rare+ items ever looted', group: 'Gear & progress',
    description: 'Blue-or-better items seen on the character since it joined Tavern Tracker.',
    value: (e) => e.notableItems,
  },

  // ---- Professions ----
  {
    key: 'profession-best', label: 'Highest profession skill', group: 'Professions',
    description: 'Skill in their best primary profession.',
    value: (e) => (primarySkills(e).length ? Math.max(...primarySkills(e)) : null),
  },
  {
    key: 'profession-total', label: 'Combined profession skill', group: 'Professions',
    description: 'Both primary profession skills added up.',
    value: (e) => (primarySkills(e).length ? primarySkills(e).reduce((a, b) => a + b, 0) : null),
  },
  { key: 'cooking', label: 'Cooking skill', group: 'Professions', description: 'Who’s the tavern chef?', value: professionSkill('Cooking') },
  { key: 'first-aid', label: 'First Aid skill', group: 'Professions', description: 'Bandages at the ready.', value: professionSkill('First Aid') },
  { key: 'fishing', label: 'Fishing skill', group: 'Professions', description: 'Patience, measured in skill points.', value: professionSkill('Fishing') },

  // ---- Combat ----
  {
    key: 'deaths', label: 'Total deaths', group: 'Combat', pinned: true,
    description: 'Lifetime deaths, from every cause.',
    value: totalDeaths,
  },
  {
    key: 'kills', label: 'Total kills', group: 'Combat', pinned: true,
    description: 'Lifetime kills (creatures killed, if Blizzard doesn’t report a total).',
    value: totalKills,
  },
  {
    key: 'kd', label: 'Kill/death ratio', group: 'Combat', format: 'ratio',
    description: 'Kills per death. Never died? Your kills count as the ratio.',
    value: (e) => {
      const k = totalKills(e);
      const d = totalDeaths(e);
      return k == null || d == null ? null : k / Math.max(1, d);
    },
  },
  {
    key: 'honorable-kills', label: 'Honorable kills', group: 'Combat',
    description: 'Players of the other faction slain.', value: stat('Honorable kills', /honorable kills/i),
  },
  {
    key: 'damage-done', label: 'Total damage done', group: 'Combat',
    description: 'Lifetime damage dealt.', value: stat('Total damage done'),
  },
  {
    key: 'damage-taken', label: 'Total damage received', group: 'Combat',
    description: 'Lifetime damage soaked up.', value: stat('Total damage received', /damage (received|taken)/i),
  },
  {
    key: 'healing-done', label: 'Total healing done', group: 'Combat',
    description: 'Lifetime healing cast.', value: stat('Total healing done'),
  },
  {
    key: 'largest-hit', label: 'Largest hit dealt', group: 'Combat',
    description: 'Biggest single hit.', value: stat('Largest hit dealt', /largest hit dealt/i),
  },
  {
    key: 'largest-heal', label: 'Largest heal cast', group: 'Combat',
    description: 'Biggest single heal.', value: stat('Largest heal cast', /largest heal cast/i),
  },
  {
    key: 'dungeon-deaths', label: 'Dungeon deaths', group: 'Combat',
    description: 'Deaths inside 5-player dungeons. Who’s pulling extra packs?',
    value: stat('Total deaths in 5-player dungeons', /deaths in 5-player/i, /dungeon deaths/i),
  },
  {
    key: 'pvp-deaths', label: 'Deaths from other players', group: 'Combat',
    description: 'Ganked, and how often.', value: stat('Deaths from other players', /deaths from other players/i),
  },

  // ---- Character sheet ----
  { key: 'health', label: 'Max health', group: 'Character sheet', description: 'Health pool, gear included.', value: sheet('health') },
  { key: 'mana', label: 'Max mana / power', group: 'Character sheet', description: 'Mana, rage or energy pool.', value: sheet('power') },
  { key: 'strength', label: 'Strength', group: 'Character sheet', description: 'Effective strength.', value: sheet('strength') },
  { key: 'agility', label: 'Agility', group: 'Character sheet', description: 'Effective agility.', value: sheet('agility') },
  { key: 'stamina', label: 'Stamina', group: 'Character sheet', description: 'Effective stamina.', value: sheet('stamina') },
  { key: 'intellect', label: 'Intellect', group: 'Character sheet', description: 'Effective intellect.', value: sheet('intellect') },
  { key: 'spirit', label: 'Spirit', group: 'Character sheet', description: 'Effective spirit.', value: sheet('spirit') },
  { key: 'armor', label: 'Armor', group: 'Character sheet', description: 'Effective armor.', value: sheet('armor') },
  { key: 'attack-power', label: 'Attack power', group: 'Character sheet', description: 'Melee attack power.', value: sheet('attack_power') },
  { key: 'crit', label: 'Melee crit chance', group: 'Character sheet', format: 'percent', description: 'Chance to land a critical strike.', value: sheet('melee_crit') },
  { key: 'dodge', label: 'Dodge chance', group: 'Character sheet', format: 'percent', description: 'Chance to dodge an attack.', value: sheet('dodge') },

  // ---- Adventuring & wealth ----
  {
    key: 'played', label: 'Time played', group: 'Adventuring & wealth', format: 'hours',
    description: 'Lifetime /played.',
    value: stat('Total time played', 'Time played', /time played/i, /played time/i),
  },
  { key: 'quests', label: 'Quests completed', group: 'Adventuring & wealth', description: 'Lifetime quests turned in.', value: stat('Quests completed') },
  { key: 'flights', label: 'Flight paths taken', group: 'Adventuring & wealth', description: 'Gryphon, wyvern and hippogryph rides.', value: stat('Flight paths taken', /flight paths/i) },
  { key: 'gold-acquired', label: 'Total gold acquired', group: 'Adventuring & wealth', format: 'gold', description: 'Every coin ever earned.', value: stat('Total gold acquired') },
  { key: 'most-gold', label: 'Most gold ever owned', group: 'Adventuring & wealth', format: 'gold', description: 'Peak bank balance.', value: stat('Most gold ever owned') },
  { key: 'gold-looted', label: 'Gold looted', group: 'Adventuring & wealth', format: 'gold', description: 'Coin prised from corpses.', value: stat('Gold looted') },

  // ---- Loot rolls ----
  { key: 'need-rolls', label: 'Total need rolls', group: 'Loot rolls', description: 'Times they hit Need on loot. Ahem.', value: needRolls },
  { key: 'greed-rolls', label: 'Total greed rolls', group: 'Loot rolls', description: 'The polite way to loot.', value: greedRolls },
  {
    key: 'loot-rolls', label: 'Total loot rolls', group: 'Loot rolls',
    description: 'Need, greed and disenchant rolls added up.',
    value: (e) => lootRolls(e)?.total ?? null,
  },
  {
    key: 'need-percent', label: 'Need roll %', group: 'Loot rolls', format: 'percent',
    description: 'Share of their loot rolls that were Need. The leader (10+ rolls) holds “The Ninja”.',
    value: (e) => {
      const r = lootRolls(e);
      return r && r.total > 0 ? (r.need / r.total) * 100 : null;
    },
  },

  // ---- Just for fun ----
  { key: 'falling', label: 'Deaths from falling', group: 'Just for fun', description: 'Gravity: undefeated.', value: stat('Deaths from falling', /deaths from falling/i) },
  { key: 'drowning', label: 'Deaths from drowning', group: 'Just for fun', description: 'Forgot to breathe.', value: stat('Deaths from drowning', /deaths from drowning/i) },
  { key: 'fatigue', label: 'Deaths from fatigue', group: 'Just for fun', description: 'Swam too far out to sea.', value: stat('Deaths from fatigue', /deaths from fatigue/i) },
  { key: 'lava', label: 'Deaths from fire and lava', group: 'Just for fun', description: 'The floor is lava. Literally.', value: stat('Deaths from fire and lava', /deaths from (fire|lava)/i) },
  { key: 'critters', label: 'Critters killed', group: 'Just for fun', description: 'Rabbits, squirrels and frogs murdered.', value: stat('Critters killed', /critters killed/i) },
  { key: 'drinks', label: 'Drinks consumed', group: 'Just for fun', description: 'A proper tavern regular.', value: stat('Beverages consumed', /beverages consumed/i, /drinks consumed/i) },
  { key: 'food', label: 'Food eaten', group: 'Just for fun', description: 'Second breakfast included.', value: stat('Food eaten', /food eaten/i) },
  { key: 'potions', label: 'Health potions drunk', group: 'Just for fun', description: 'Panic-chugged in combat.', value: stat('Health potions consumed', /health potions/i) },
  { key: 'bandages', label: 'Bandages used', group: 'Just for fun', description: 'First Aid in action.', value: stat('Bandages used', /bandages/i) },
  { key: 'hearthed', label: 'Times hearthed home', group: 'Just for fun', description: 'Homesick much?', value: stat('Number of times hearthed', /hearth/i) },
  { key: 'summons', label: 'Summons accepted', group: 'Just for fun', description: 'Too lazy to walk to the dungeon.', value: stat('Summons accepted', /summons accepted/i) },
  { key: 'abandoned', label: 'Quests abandoned', group: 'Just for fun', description: 'Gave up on that escort quest.', value: stat('Quests abandoned', /quests abandoned/i) },
  { key: 'hugs', label: 'Hugs given', group: 'Just for fun', description: '/hug count. Wholesome.', value: stat('Number of hugs', /hugs/i) },
  { key: 'fish', label: 'Fish caught', group: 'Just for fun', description: 'Patience of a saint.', value: stat('Fish caught', /fish.*caught|caught.*fish/i) },
  { key: 'fashion', label: 'Fashion disasters', group: 'Just for fun', description: 'Grey and white items still being worn.', value: quality('POOR', 'COMMON') },
  {
    key: 'cheers-given', label: 'Most cheers given', group: 'Just for fun', perPlayer: true,
    description: '🍺 raised on other people’s posts. The tavern’s biggest cheerleader (one row per player).',
    value: (e) => e.cheersGiven,
  },
  { key: 'cheers', label: 'Cheers received', group: 'Just for fun', description: '🍺 raised on this character’s feed posts.', value: (e) => e.cheers },
  { key: 'posts', label: 'Feed posts', group: 'Just for fun', description: 'Level-ups, loot and achievements posted. Main character energy.', value: (e) => e.feedPosts },
  {
    key: 'absent', label: 'Days since last seen', group: 'Just for fun', format: 'days',
    description: 'Who’s been neglecting their character?',
    value: (e) => (e.lastLoginAt ? Math.max(0, (Date.now() - Date.parse(e.lastLoginAt)) / 86_400_000) : null),
  },
  {
    key: 'name-length', label: 'Longest name', group: 'Just for fun',
    description: 'Letters in first name plus surname. Typing it in party chat is a chore.',
    value: (e) => (e.name + e.surname).length,
  },
];

export const DEFAULT_METRIC = 'gear-ilvl';

const RAW_PREFIX = 'stat:';

/** A metric for any raw statistic the API returned, so new Forever stats show up without a code change. */
export function rawMetric(name: string): Metric {
  return {
    key: RAW_PREFIX + name,
    label: name,
    group: 'Every other statistic',
    description: `“${name}”, straight from the Blizzard statistics API.`,
    value: (e) => (e.statistics && name in e.statistics ? e.statistics[name] : null),
  };
}

/**
 * The metrics worth offering for these characters: the curated ones somebody has data for (plus the pinned
 * headline stats), then every raw statistic the curated list doesn't already show.
 */
export function availableMetrics(entries: LeaderboardEntry[]): Metric[] {
  const curated = METRICS.filter((m) => m.pinned || entries.some((e) => m.value(e) != null));
  // Raw statistics a curated metric already reads, for any character.
  const covered = new Set<string>();
  for (const e of entries) {
    for (const m of METRICS) {
      const key = m.value.statNames && findStatKey(e.statistics, m.value.statNames);
      if (key) covered.add(key);
    }
  }
  const raw = [...new Set(entries.flatMap((e) => Object.keys(e.statistics ?? {})))]
    .filter((name) => !covered.has(name))
    .sort((a, b) => a.localeCompare(b))
    .map(rawMetric);
  return [...curated, ...raw];
}

export function metricByKey(key: string): Metric | undefined {
  return METRICS.find((m) => m.key === key) ?? (key.startsWith(RAW_PREFIX) ? rawMetric(key.slice(RAW_PREFIX.length)) : undefined);
}

export function formatMetric(value: number, format: MetricFormat = 'number'): string {
  switch (format) {
    case 'gold': {
      // Blizzard reports money in copper.
      const gold = Math.floor(value / 10_000);
      const silver = Math.floor((value % 10_000) / 100);
      const copper = Math.round(value % 100);
      return gold ? `${gold.toLocaleString()}g ${silver}s` : silver ? `${silver}s ${copper}c` : `${copper}c`;
    }
    case 'percent':
      return `${value.toFixed(2)}%`;
    case 'ratio':
      return value.toFixed(2);
    case 'hours':
      // Blizzard reports time played in seconds.
      return `${Math.floor(value / 3600).toLocaleString()} h`;
    case 'days':
      return value < 1 ? 'Today' : `${Math.floor(value)} day${Math.floor(value) === 1 ? '' : 's'}`;
    default:
      return Math.round(value).toLocaleString();
  }
}

export interface Ranked {
  entry: LeaderboardEntry;
  value: number | null;
  /** Competition ranking (1, 2, 2, 4); `null` for characters without data. */
  rank: number | null;
}

/**
 * Rank characters by a metric, best first. Ties share a rank; characters with no data come last, unranked.
 * `onePerPlayer` (always on for per-player metrics) keeps only each player's best character.
 */
export function rankBy(
  entries: LeaderboardEntry[],
  metric: Metric,
  opts: { ascending?: boolean; onePerPlayer?: boolean } = {},
): Ranked[] {
  const dir = opts.ascending ? 1 : -1;
  let rows = entries.map((entry) => ({ entry, value: metric.value(entry) }));
  const cmp = (a: { entry: LeaderboardEntry; value: number | null }, b: typeof a) => {
    if (a.value == null || b.value == null) {
      if (a.value != null) return -1;
      if (b.value != null) return 1;
    } else if (a.value !== b.value) {
      return (a.value - b.value) * dir;
    }
    return `${a.entry.name} ${a.entry.surname}`.localeCompare(`${b.entry.name} ${b.entry.surname}`);
  };
  rows.sort(cmp);
  if (opts.onePerPlayer || metric.perPlayer) {
    const seen = new Set<string>();
    rows = rows.filter((r) => !seen.has(r.entry.ownerId) && !!seen.add(r.entry.ownerId));
  }
  return rows.map((r, i) => {
    if (r.value == null) return { ...r, rank: null };
    const first = rows.findIndex((o) => o.value === r.value);
    return { ...r, rank: (first === -1 ? i : first) + 1 };
  });
}

const STORAGE_KEY = 'leaderboard.metric';

/** The chosen metric, remembered in this browser (shared by every leaderboard). */
export function useMetricChoice(): [string, (key: string) => void] {
  const [key, setKey] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_METRIC;
    } catch {
      return DEFAULT_METRIC;
    }
  });
  const set = useCallback((next: string) => {
    setKey(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the choice just won't be remembered.
    }
  }, []);
  return [key, set];
}
