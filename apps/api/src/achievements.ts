import type { Db } from './db.js';

/**
 * Tavern achievements: titles held by whichever character in a tavern currently leads a stat. They're worked
 * out from synced data on every request, so a title moves as soon as somebody overtakes the holder. Ties share it.
 * Not to be confused with Blizzard's in-game achievements (`character_achievements`).
 */

/** The bits of a character an achievement looks at. */
export interface AchievementCandidate {
  id: string;
  user_id: string;
  statistics: unknown;
}

export interface AchievementDef {
  key: string;
  name: string;
  icon: string;
  description: string;
  /** The character's score; `null` = not eligible (no data yet). Higher wins; nobody wins with 0. */
  score: (stats: Record<string, number>) => number | null;
  /** Human-readable score for tooltips. */
  format: (score: number) => string;
}

export interface AchievementBadge {
  key: string;
  name: string;
  icon: string;
  description: string;
  /** The winning score, formatted, e.g. "412 hours". */
  value: string;
}

/** Need/greed/disenchant rolls needed before the need percentage counts, so one lucky roll isn't 100%. */
export const NINJA_MIN_ROLLS = 10;

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

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    key: 'without-life',
    name: 'He Is Without Life',
    icon: '⏳',
    description: 'Most hours played in the tavern.',
    score: secondsPlayed,
    format: (s) => {
      const hours = Math.floor(s / 3600);
      return `${hours.toLocaleString('en')} hour${hours === 1 ? '' : 's'} played`;
    },
  },
  {
    key: 'ninja',
    name: 'The Ninja',
    icon: '🥷',
    description: `Highest share of loot rolls made as Need in the tavern (at least ${NINJA_MIN_ROLLS} rolls).`,
    score: needPercent,
    format: (p) => `${p.toFixed(1)}% need rolls`,
  },
];

function statMap(value: unknown): Record<string, number> | null {
  const raw = typeof value === 'string' ? JSON.parse(value) : value;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, number>) : null;
}

/** Who holds each achievement among these characters (one tavern's roster): badges by character id. */
export function awardAchievements(characters: AchievementCandidate[]): Map<string, AchievementBadge[]> {
  const badges = new Map<string, AchievementBadge[]>();
  for (const def of ACHIEVEMENTS) {
    const scored = characters
      .map((c) => {
        const stats = statMap(c.statistics);
        return { id: c.id, score: stats ? def.score(stats) : null };
      })
      .filter((s): s is { id: string; score: number } => s.score != null && Number.isFinite(s.score));
    const best = Math.max(0, ...scored.map((s) => s.score));
    if (best <= 0) continue;
    for (const s of scored) {
      if (s.score !== best) continue;
      const list = badges.get(s.id) ?? [];
      list.push({ key: def.key, name: def.name, icon: def.icon, description: def.description, value: def.format(best) });
      badges.set(s.id, list);
    }
  }
  return badges;
}

/**
 * Every achievement a user's characters hold across the taverns they belong to, for the top bar. A character in
 * two taverns can hold the same title in both; it's listed once per tavern.
 */
export async function userAchievements(db: Db, userId: string) {
  const rows = await db.query<
    AchievementCandidate & { tavern_id: string; tavern_name: string; name: string; surname: string }
  >(
    `select tc.tavern_id, t.name as tavern_name, c.id, c.user_id, c.name, c.surname, c.statistics
     from tavern_members m
     join taverns t on t.id = m.tavern_id
     join tavern_characters tc on tc.tavern_id = m.tavern_id
     join characters c on c.id = tc.character_id
     where m.user_id = $1
     order by t.created_at, t.id`,
    [userId],
  );
  const byTavern = new Map<string, typeof rows>();
  for (const r of rows) byTavern.set(r.tavern_id, [...(byTavern.get(r.tavern_id) ?? []), r]);
  const out: (AchievementBadge & {
    tavernId: string;
    tavernName: string;
    character: { id: string; name: string; surname: string };
  })[] = [];
  for (const roster of byTavern.values()) {
    const badges = awardAchievements(roster);
    for (const c of roster) {
      if (c.user_id !== userId) continue;
      for (const b of badges.get(c.id) ?? []) {
        out.push({ ...b, tavernId: c.tavern_id, tavernName: c.tavern_name, character: { id: c.id, name: c.name, surname: c.surname } });
      }
    }
  }
  return out;
}
