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
  /** Blizzard's equipped item level. */
  item_level?: number | null;
  last_login_at?: Date | string | null;
  /** Level-ups, loot and achievement posts in the feed. */
  feed_posts?: number | null;
}

/** What a title's score function sees for one character. */
export interface ScoreInput {
  stats: Record<string, number>;
  professions: CharacterProfession[];
  /** How many characters this character's player has in the tavern. */
  playerCharacterCount: number;
  itemLevel: number | null;
  /** Days since the character last logged in, or `null` if Blizzard hasn't said. */
  daysSinceSeen: number | null;
  feedPosts: number | null;
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
  /** The winning score, formatted, e.g. "23.8% need rolls". */
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
  /** Everyone eligible, best first (the holder first of all). Empty when nobody has data yet. */
  standings: TitleStanding[];
  /** When the current holder took the title; `null` when nobody holds it. */
  holderSince: string | null;
  /** How many share the lead when that tie leaves the title unheld (0 otherwise). */
  tiedLeaders: number;
}

/** Who holds a title in a tavern: a character id, or a user id for player titles. */
export interface Incumbent {
  subjectId: string;
  since: Date;
}

/** Feed posts for character `c`, as a select-list subquery (the same count as the leaderboard's). */
export const FEED_POSTS_SQL = `(select count(*)::int from feed_events e
  where e.character_id = c.id and e.kind in ('level_up', 'loot', 'achievement'))`;

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

/** Share of loot rolls that were Need (0–100), once they've made enough rolls to count. */
export function needPercent(stats: Record<string, number>): number | null {
  const need = findStat(stats, 'Need rolls made on loot', /need rolls/i);
  const greed = findStat(stats, 'Greed rolls made on loot', /greed rolls/i);
  if (need == null || greed == null) return null;
  const total = need + greed + (findStat(stats, 'Disenchant rolls made on loot', /disenchant rolls/i) ?? 0);
  return total >= NINJA_MIN_ROLLS ? (need / total) * 100 : null;
}

/** A profession's skill, or `null` if the character hasn't learned it (or professions haven't synced). */
export function professionSkill(professions: CharacterProfession[], name: string): number | null {
  return professions.find((p) => p.name.toLowerCase() === name.toLowerCase())?.skill ?? null;
}

const plural = (n: number, word: string) => `${Math.round(n).toLocaleString('en')} ${word}${Math.round(n) === 1 ? '' : 's'}`;

/** A title for whoever has the most of a Blizzard statistic. */
function statTitle(
  key: string,
  name: string,
  icon: string,
  description: string,
  names: (string | RegExp)[],
  format: (n: number) => string,
): TitleDef {
  return { key, name, icon, description, subject: 'character', score: ({ stats }) => findStat(stats, ...names), format };
}

export const TITLES: TitleDef[] = [
  {
    key: 'ninja',
    name: 'The Ninja',
    icon: '🎲',
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
    score: ({ professions }) => professionSkill(professions, 'Cooking'),
    format: (s) => `${s} Cooking`,
  },
  {
    key: 'old-man-sea',
    name: 'Old Man and the Sea',
    icon: '🎣',
    description: 'Highest Fishing skill in the tavern.',
    subject: 'character',
    score: ({ professions }) => professionSkill(professions, 'Fishing'),
    format: (s) => `${s} Fishing`,
  },
  {
    key: 'field-medic',
    name: 'Field Medic',
    icon: '🩹',
    description: 'Highest First Aid skill in the tavern.',
    subject: 'character',
    score: ({ professions }) => professionSkill(professions, 'First Aid'),
    format: (s) => `${s} First Aid`,
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
  statTitle('corpse-runner', 'Corpse Runner', '💀', 'Most deaths in the tavern.',
    ['Total deaths', /^total deaths$/i, /^deaths$/i], (n) => plural(n, 'death')),
  statTitle('gravity-tester', 'Gravity Tester', '🪂', 'Most deaths from falling in the tavern.',
    ['Deaths from falling', /deaths from falling/i], (n) => `${plural(n, 'fatal fall')}`),
  statTitle('regular', 'Regular', '🍺', 'Most drinks consumed in the tavern.',
    ['Beverages consumed', /beverages consumed/i, /drinks consumed/i], (n) => plural(n, 'drink')),
  statTitle('bunny-slayer', 'Bunny Slayer', '🐇', 'Most critters killed in the tavern.',
    ['Critters killed', /critters killed/i], (n) => plural(n, 'critter')),
  // Blizzard reports money in copper.
  statTitle('unimpressed', 'Unimpressed', '🤦', 'Most facepalms in the tavern.',
    ['Total facepalms', /facepalms/i], (n) => plural(n, 'facepalm')),
  statTitle('happy-camper', 'Happy Camper', '🏕️', 'Most times camped in the tavern.',
    ['Times camped', /times camped/i], (n) => `Camped ${plural(n, 'time')}`),
  statTitle('punching-bag', 'Punching Bag', '🥊', 'Most duels lost in the tavern.',
    ['Duels lost', /duels lost/i], (n) => plural(n, 'duel') + ' lost'),
  statTitle('juiced', 'Juiced', '🧪', 'Most elixirs consumed in the tavern.',
    ['Elixirs consumed', /elixirs consumed/i], (n) => plural(n, 'elixir')),
  statTitle('hello-there', 'Hello There', '👋', 'Most waves in the tavern.',
    ['Total waves', /total waves/i], (n) => plural(n, 'wave')),
  {
    key: 'best-dressed',
    name: 'Best Dressed',
    icon: '✨',
    description: 'Highest average item level in the tavern.',
    subject: 'character',
    score: ({ itemLevel }) => itemLevel,
    format: (n) => `Item level ${n}`,
  },
  {
    key: 'town-crier',
    name: 'Town Crier',
    icon: '📣',
    description: 'Most feed posts (level-ups, loot and achievements) in the tavern.',
    subject: 'character',
    score: ({ feedPosts }) => feedPosts,
    format: (n) => plural(n, 'feed post'),
  },
  {
    key: 'gone-fishin',
    name: 'Gone Fishin’',
    icon: '👻',
    description: 'Longest since last logging in, in the tavern.',
    subject: 'character',
    score: ({ daysSinceSeen }) => daysSinceSeen,
    // Under a day away isn't really gone.
    holds: (d) => d >= 1,
    format: (d) => `${plural(Math.floor(d), 'day')} since last seen`,
  },
];

function jsonValue(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function statMap(value: unknown): Record<string, number> {
  const raw = jsonValue(value);
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, number>) : {};
}

function daysSince(when: Date | string | null | undefined): number | null {
  if (!when) return null;
  const t = new Date(when).getTime();
  return Number.isFinite(t) ? Math.max(0, (Date.now() - t) / 86_400_000) : null;
}

function professionList(value: unknown): CharacterProfession[] {
  const raw = jsonValue(value);
  return Array.isArray(raw) ? raw.filter((p): p is CharacterProfession => p && typeof p.name === 'string') : [];
}

/**
 * Every title's standings among these characters (one tavern's roster). A title is held by the sole leader. The
 * current holder (`incumbents`, by title key) keeps it until someone strictly beats them, so a tie goes to whoever
 * got there first; a tie for the lead with no holder among it leaves the title unheld.
 */
export function rankTitles(characters: TitleCandidate[], incumbents: ReadonlyMap<string, Incumbent> = new Map()): TitleStandings[] {
  const perPlayer = new Map<string, number>();
  for (const c of characters) perPlayer.set(c.user_id, (perPlayer.get(c.user_id) ?? 0) + 1);
  const inputs = characters.map((c) => ({
    c,
    input: {
      stats: statMap(c.statistics),
      professions: professionList(c.professions),
      playerCharacterCount: perPlayer.get(c.user_id) ?? 0,
      itemLevel: c.item_level ?? null,
      daysSinceSeen: daysSince(c.last_login_at),
      feedPosts: c.feed_posts ?? null,
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
    const subjectId = (r: Row) => r.character?.id ?? r.player.userId;
    const leaders = rows.filter((r) => r.score === rows[0].score);
    const incumbent = incumbents.get(def.key);
    let holderId: string | null = null;
    if (rows.length && holds(rows[0].score)) {
      if (incumbent && leaders.some((r) => subjectId(r) === incumbent.subjectId)) holderId = incumbent.subjectId;
      else if (leaders.length === 1) holderId = subjectId(leaders[0]);
    }
    // The holder is always a leader: put them first, ahead of anyone they're tied with.
    if (holderId) rows.unshift(...rows.splice(rows.findIndex((r) => subjectId(r) === holderId), 1));
    const standings = rows.map((r, i) => {
      let rank = i + 1;
      for (let j = i; j > 0 && rows[j - 1].score === r.score; j--) rank = j;
      return { ...r, rank, holder: subjectId(r) === holderId, value: def.format(r.score) };
    });
    const keptSince = holderId && incumbent?.subjectId === holderId ? incumbent.since : null;
    return {
      key: def.key,
      name: def.name,
      icon: def.icon,
      description: def.description,
      subject: def.subject,
      lowestWins: !!def.lowestWins,
      standings,
      holderSince: holderId ? (keptSince ?? new Date()).toISOString() : null,
      tiedLeaders: !holderId && rows.length && holds(rows[0].score) && leaders.length > 1 ? leaders.length : 0,
    };
  });
}

/** The subject id (character, or user for player titles) holding a title, if anyone. */
const holderOf = (t: TitleStandings) => {
  const h = t.standings.find((s) => s.holder);
  return h ? (h.character?.id ?? h.player.userId) : null;
};

/**
 * Rank a tavern's titles against its saved holders, and save any change of holder: a new holder starts their
 * reign now, and a title nobody holds any more (left the tavern, tie with no holder, dropped below the bar) is
 * cleared.
 */
export async function tavernTitles(db: Db, tavernId: string, characters: TitleCandidate[]): Promise<TitleStandings[]> {
  const saved = await db.query<{ title_key: string; subject_id: string; since: Date | string }>(
    'select title_key, subject_id, since from tavern_title_holders where tavern_id = $1',
    [tavernId],
  );
  const incumbents = new Map(saved.map((r) => [r.title_key, { subjectId: r.subject_id, since: new Date(r.since) }]));
  const ranked = rankTitles(characters, incumbents);
  for (const t of ranked) {
    const holder = holderOf(t);
    const was = incumbents.get(t.key)?.subjectId ?? null;
    if (holder === was) continue;
    if (holder) {
      await db.query(
        `insert into tavern_title_holders (tavern_id, title_key, subject_id, since) values ($1, $2, $3, $4)
         on conflict (tavern_id, title_key) do update set subject_id = excluded.subject_id, since = excluded.since`,
        [tavernId, t.key, holder, t.holderSince],
      );
    } else {
      await db.query('delete from tavern_title_holders where tavern_id = $1 and title_key = $2', [tavernId, t.key]);
    }
  }
  return ranked;
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
       c.item_level, c.last_login_at, u.display_name as owner_name, ${FEED_POSTS_SQL} as feed_posts
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
    for (const t of await tavernTitles(db, tavernId, roster)) {
      for (const s of t.standings) {
        if (!s.holder || s.player.userId !== userId) continue;
        out.push({ ...badge(t, s), tavernId, tavernName, character: s.character });
      }
    }
  }
  return out;
}
