import type { CharacterProfession } from './blizzard/client.js';
import type { Db } from './db.js';

/**
 * Tavern titles: held by whichever character (or player) in a tavern currently leads a stat. They're worked out
 * from synced data on every request, so a title moves as soon as somebody overtakes the holder. Ties share it.
 * Not to be confused with Blizzard's in-game achievements (`character_achievements`) or a character's in-game
 * `title` ("the Explorer").
 */

/** The bits of a character a title looks at. */
export interface TitleCandidate {
  id: string;
  user_id: string;
  name?: string;
  surname?: string;
  /** The owning player's display name, for player titles and the standings table. */
  owner_name?: string;
  statistics: unknown;
  professions?: unknown;
}

/** What a title's score function sees for one character. */
export interface ScoreInput {
  stats: Record<string, number>;
  professions: CharacterProfession[];
  /** How many characters this character's player has in the tavern. */
  playerCharacterCount: number;
}

export interface TitleDef {
  key: string;
  name: string;
  icon: string;
  description: string;
  /** `character`: each character competes. `player`: each player competes (scored from any of their characters). */
  subject: 'character' | 'player';
  /** Lowest score wins rather than highest. */
  lowestWins?: boolean;
  /** The score; `null` = not eligible (no data yet). */
  score: (input: ScoreInput) => number | null;
  /** Whether the leading score is good enough to hold the title. Default: above 0. */
  holds?: (score: number) => boolean;
  /** Human-readable score. */
  format: (score: number) => string;
}

export interface TitleBadge {
  key: string;
  name: string;
  icon: string;
  description: string;
  /** The winning score, formatted, e.g. "412 hours played". */
  value: string;
}

/** One row of a title's standings: a character (character titles) or a player (player titles). */
export interface TitleStanding {
  /** 1-based, ties share a rank (1, 1, 3). */
  rank: number;
  /** Holds the title (rank 1 and good enough to hold it). */
  holder: boolean;
  score: number;
  value: string;
  player: { userId: string; displayName: string };
  /** `null` for player titles. */
  character: { id: string; name: string; surname: string } | null;
}

export interface TitleStandings extends Omit<TitleBadge, 'value'> {
  subject: TitleDef['subject'];
  lowestWins: boolean;
  /** Everyone eligible, best first. Empty when nobody has data yet. */
  standings: TitleStanding[];
}

/** Need/greed/disenchant rolls needed before the need percentage counts, so one lucky roll isn't 100%. */
export const NINJA_MIN_ROLLS = 10;
/** Characters a player needs in the tavern to be an Altaholic: one main plus at least one alt. */
export const ALTAHOLIC_MIN_CHARACTERS = 2;

/** Exact (case-insensitive) names first, then patterns, as in the web leaderboard's `findStat`. */
export function findStat(stats: Record<string, number>, ...names: (string | RegExp)[]): number | null {
  const keys = Object.keys(stats);
  for (const n of names) {
    const hit =
      typeof n === 'string' ? keys.find((k) => k.toLowerCase() === n.toLowerCase()) : undefined;
    if (hit && typeof stats[hit] === 'number') return stats[hit];
  }
  for (const n of names) {
    if (typeof n === 'string') continue;
    const hit = keys.find((k) => n.test(k));
    if (hit && typeof stats[hit] === 'number') return stats[hit];
  }
  return null;
}

/** Lifetime time played, in seconds. Blizzard's name for it in the Forever API isn't documented, so try a few. */
export function secondsPlayed(stats: Record<string, number>): number | null {
  return findStat(stats, 'Total time played', 'Time played', /time played/i, /played time/i);
}

/** Share of loot rolls that were Need (0–100), once they've made enough rolls to count. */
export function needPercent(stats: Record<string, number>): number | null {
  const need = findStat(stats, 'Need rolls made on loot', /need rolls/i);
  const greed = findStat(stats, 'Greed rolls made on loot', /greed rolls/i);
  if (need == null || greed == null) return null;
  const total = need + greed + (findStat(stats, 'Disenchant rolls made on loot', /disenchant rolls/i) ?? 0);
  return total >= NINJA_MIN_ROLLS ? (need / total) * 100 : null;
}

/** Cooking skill, or `null` if the character hasn't learned Cooking (or professions haven't synced). */
export function cookingSkill(professions: CharacterProfession[]): number | null {
  const cooking = professions.find((p) => p.name.toLowerCase() === 'cooking');
  return cooking?.skill ?? null;
}

const formatHours = (s: number) => {
  const hours = Math.floor(s / 3600);
  return `${hours.toLocaleString('en')} hour${hours === 1 ? '' : 's'} played`;
};

export const TITLES: TitleDef[] = [
  {
    key: 'without-life',
    name: 'He Is Without Life',
    icon: '⏳',
    description: 'Most hours played in the tavern.',
    subject: 'character',
    score: ({ stats }) => secondsPlayed(stats),
    format: formatHours,
  },
  {
    key: 'ninja',
    name: 'The Ninja',
    icon: '🥷',
    description: `Highest share of loot rolls made as Need in the tavern (at least ${NINJA_MIN_ROLLS} rolls).`,
    subject: 'character',
    score: ({ stats }) => needPercent(stats),
    format: (p) => `${p.toFixed(1)}% need rolls`,
  },
  {
    key: 'head-chef',
    name: 'Head Chef',
    icon: '🍳',
    description: 'Highest Cooking skill in the tavern.',
    subject: 'character',
    score: ({ professions }) => cookingSkill(professions),
    format: (s) => `${s} Cooking`,
  },
  {
    key: 'altaholic',
    name: 'Altaholic',
    icon: '👥',
    description: `The player with the most characters in the tavern (at least ${ALTAHOLIC_MIN_CHARACTERS}).`,
    subject: 'player',
    score: ({ playerCharacterCount }) => playerCharacterCount,
    holds: (n) => n >= ALTAHOLIC_MIN_CHARACTERS,
    format: (n) => `${n} character${n === 1 ? '' : 's'}`,
  },
  {
    key: 'weak',
    name: 'Weak',
    icon: '🐣',
    description: 'Least time played in the tavern.',
    subject: 'character',
    lowestWins: true,
    // 0 means the stat is missing rather than a brand-new character, so it doesn't count.
    score: ({ stats }) => {
      const s = secondsPlayed(stats);
      return s != null && s > 0 ? s : null;
    },
    format: formatHours,
  },
];

function jsonValue(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function statMap(value: unknown): Record<string, number> {
  const raw = jsonValue(value);
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, number>) : {};
}

function professionList(value: unknown): CharacterProfession[] {
  const raw = jsonValue(value);
  return Array.isArray(raw) ? raw.filter((p): p is CharacterProfession => p && typeof p.name === 'string') : [];
}

/** Every title's standings among these characters (one tavern's roster). */
export function rankTitles(characters: TitleCandidate[]): TitleStandings[] {
  const perPlayer = new Map<string, number>();
  for (const c of characters) perPlayer.set(c.user_id, (perPlayer.get(c.user_id) ?? 0) + 1);
  const inputs = characters.map((c) => ({
    c,
    input: {
      stats: statMap(c.statistics),
      professions: professionList(c.professions),
      playerCharacterCount: perPlayer.get(c.user_id) ?? 0,
    },
  }));

  return TITLES.map((def) => {
    type Row = Omit<TitleStanding, 'rank' | 'holder' | 'value'>;
    let rows: Row[] = [];
    for (const { c, input } of inputs) {
      const score = def.score(input);
      if (score == null || !Number.isFinite(score)) continue;
      rows.push({
        score,
        player: { userId: c.user_id, displayName: c.owner_name ?? '' },
        character: def.subject === 'character' ? { id: c.id, name: c.name ?? '', surname: c.surname ?? '' } : null,
      });
    }
    if (def.subject === 'player') {
      // One row per player (every character of theirs scores the same).
      const seen = new Set<string>();
      rows = rows.filter((r) => !seen.has(r.player.userId) && seen.add(r.player.userId));
    }
    const better = (a: number, b: number) => (def.lowestWins ? a - b : b - a);
    rows.sort(
      (a, b) =>
        better(a.score, b.score) ||
        (a.character?.name ?? '').localeCompare(b.character?.name ?? '') ||
        a.player.displayName.localeCompare(b.player.displayName),
    );
    const holds = def.holds ?? ((s: number) => s > 0);
    const standings = rows.map((r, i) => {
      let rank = i + 1;
      for (let j = i; j > 0 && rows[j - 1].score === r.score; j--) rank = j;
      return { ...r, rank, holder: rank === 1 && holds(r.score), value: def.format(r.score) };
    });
    return {
      key: def.key,
      name: def.name,
      icon: def.icon,
      description: def.description,
      subject: def.subject,
      lowestWins: !!def.lowestWins,
      standings,
    };
  });
}

/** The badge for a title someone holds. */
function badge(t: TitleStandings, holder: TitleStanding): TitleBadge {
  return { key: t.key, name: t.name, icon: t.icon, description: t.description, value: holder.value };
}

/**
 * Character titles held among these characters (one tavern's roster): badges by character id. Player titles
 * (Altaholic) aren't pinned to a character, so they show only on the player in the top bar and in the Titles tab.
 */
export function awardTitles(characters: TitleCandidate[], ranked = rankTitles(characters)): Map<string, TitleBadge[]> {
  const badges = new Map<string, TitleBadge[]>();
  for (const t of ranked) {
    for (const s of t.standings) {
      if (!s.holder || !s.character) continue;
      badges.set(s.character.id, [...(badges.get(s.character.id) ?? []), badge(t, s)]);
    }
  }
  return badges;
}

/**
 * Every title a user holds across the taverns they belong to, for the top bar. A character in two taverns can hold
 * the same title in both; it's listed once per tavern. Player titles have no character.
 */
export async function userTitles(db: Db, userId: string) {
  const rows = await db.query<TitleCandidate & { tavern_id: string; tavern_name: string; name: string; surname: string }>(
    `select tc.tavern_id, t.name as tavern_name, c.id, c.user_id, c.name, c.surname, c.statistics, c.professions,
       u.display_name as owner_name
     from tavern_members m
     join taverns t on t.id = m.tavern_id
     join tavern_characters tc on tc.tavern_id = m.tavern_id
     join characters c on c.id = tc.character_id
     join users u on u.id = c.user_id
     where m.user_id = $1
     order by t.created_at, t.id`,
    [userId],
  );
  const byTavern = new Map<string, typeof rows>();
  for (const r of rows) byTavern.set(r.tavern_id, [...(byTavern.get(r.tavern_id) ?? []), r]);
  const out: (TitleBadge & {
    tavernId: string;
    tavernName: string;
    character: { id: string; name: string; surname: string } | null;
  })[] = [];
  for (const roster of byTavern.values()) {
    const { tavern_id: tavernId, tavern_name: tavernName } = roster[0];
    for (const t of rankTitles(roster)) {
      for (const s of t.standings) {
        if (!s.holder || s.player.userId !== userId) continue;
        out.push({ ...badge(t, s), tavernId, tavernName, character: s.character });
      }
    }
  }
  return out;
}
