import type { BlizzardClient, CompletedAchievement, EquippedItem } from './blizzard/client.js';
import type { Db } from './db.js';
import type { CharacterRow } from './sync.js';

/** Kinds of feed post. See docs/activity-feed.md. */
export type FeedKind = 'level_up' | 'loot' | 'achievement' | 'character_joined' | 'member_joined' | 'tavern_founded';

/** Item qualities worth a post. */
export const NOTABLE_QUALITIES = new Set(['RARE', 'EPIC', 'LEGENDARY', 'ARTIFACT']);

export async function recordEvent(
  db: Db,
  event: {
    kind: FeedKind;
    tavernId?: string | null;
    characterId?: string | null;
    userId?: string | null;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await db.query('insert into feed_events (kind, tavern_id, character_id, user_id, data) values ($1, $2, $3, $4, $5)', [
    event.kind,
    event.tavernId ?? null,
    event.characterId ?? null,
    event.userId ?? null,
    JSON.stringify(event.data ?? {}),
  ]);
}

async function bestEffort<T>(label: string, fn: (() => Promise<T | null>) | undefined): Promise<T | null> {
  if (!fn) return null;
  try {
    return await fn();
  } catch (err) {
    // The Forever API is undocumented; never let a sub-endpoint break the character sync.
    console.warn(`${label} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function detectLoot(db: Db, row: CharacterRow, items: EquippedItem[]): Promise<void> {
  const notable = items.filter((i) => NOTABLE_QUALITIES.has(i.quality));
  const fresh: EquippedItem[] = [];
  for (const item of notable) {
    // Unique per character: an item is only ever posted once, and concurrent syncs can't both post it.
    const [inserted] = await db.query(
      `insert into character_items (character_id, item_id, quality) values ($1, $2, $3)
       on conflict do nothing returning item_id`,
      [row.id, item.id, item.quality],
    );
    if (inserted) fresh.push(item);
  }
  if (!row.gear_baseline_at) {
    // First look at this character's gear: remember it silently instead of posting everything they already wear.
    await db.query('update characters set gear_baseline_at = now() where id = $1', [row.id]);
    return;
  }
  if (fresh.length) {
    await recordEvent(db, {
      kind: 'loot',
      characterId: row.id,
      data: {
        items: fresh.map((i) => ({ id: i.id, name: i.name, quality: i.quality, slot: i.slot, itemLevel: i.itemLevel })),
      },
    });
  }
}

async function detectAchievements(db: Db, row: CharacterRow, achievements: CompletedAchievement[]): Promise<void> {
  const fresh: CompletedAchievement[] = [];
  for (const a of achievements) {
    const [inserted] = await db.query(
      `insert into character_achievements (character_id, achievement_id, completed_at) values ($1, $2, $3)
       on conflict do nothing returning achievement_id`,
      [row.id, a.id, a.completedAt],
    );
    if (inserted) fresh.push(a);
  }
  if (!row.achievements_baseline_at) {
    await db.query('update characters set achievements_baseline_at = now() where id = $1', [row.id]);
    return;
  }
  if (fresh.length) {
    await recordEvent(db, {
      kind: 'achievement',
      characterId: row.id,
      data: { achievements: fresh.map((a) => ({ id: a.id, name: a.name, completedAt: a.completedAt })) },
    });
  }
}

/**
 * Post feed events for what changed in a successful sync.
 * `prev` is the character as it was before the sync; `row` is after.
 */
export async function detectProgress(
  db: Db,
  blizzard: BlizzardClient,
  prev: { level: number | null; last_login_at: Date | null },
  row: CharacterRow,
): Promise<void> {
  if (prev.level != null && row.level != null && row.level > prev.level) {
    await recordEvent(db, { kind: 'level_up', characterId: row.id, data: { from: prev.level, to: row.level } });
  }

  // Equipment and achievements can only change while the character is online, so when Blizzard tells us the
  // last login and it hasn't moved, skip the extra calls (gentler on rate limits).
  // (The first sync always has no previous login, so baselines still get taken.)
  const loggedInSince =
    !row.last_login_at || !prev.last_login_at || row.last_login_at.getTime() !== prev.last_login_at.getTime();
  if (!loggedInSince) return;

  const items = await bestEffort(
    'Equipment sync',
    blizzard.getEquipment && (() => blizzard.getEquipment!(row.region, row.name, row.surname)),
  );
  if (items) await detectLoot(db, row, items);

  const achievements = await bestEffort(
    'Achievement sync',
    blizzard.getAchievements && (() => blizzard.getAchievements!(row.region, row.name, row.surname)),
  );
  if (achievements) await detectAchievements(db, row, achievements);
}

// ---- Reading the feed ----

interface FeedRow {
  id: string;
  kind: FeedKind;
  tavern_id: string | null;
  character_id: string | null;
  data: Record<string, unknown> | string;
  created_at: Date;
  name: string | null;
  surname: string | null;
  class: string | null;
  race: string | null;
  level: number | null;
  owner_id: string | null;
  owner_name: string | null;
}

export async function tavernFeed(db: Db, tavernId: string, opts: { before?: string | null; limit: number }) {
  const params: unknown[] = [tavernId, opts.limit + 1];
  let cursor = '';
  if (opts.before) {
    params.push(opts.before);
    cursor = 'and e.id < $3::bigint';
  }
  const rows = await db.query<FeedRow>(
    `select e.id::text as id, e.kind, e.tavern_id, e.character_id, e.data, e.created_at,
       c.name, c.surname, c.class, c.race, c.level,
       u.id as owner_id, u.display_name as owner_name
     from feed_events e
     left join characters c on c.id = e.character_id
     left join users u on u.id = coalesce(e.user_id, c.user_id)
     where (
       e.tavern_id = $1
       or (e.tavern_id is null and e.character_id in (select character_id from tavern_characters where tavern_id = $1))
     ) ${cursor}
     order by e.id desc
     limit $2`,
    params,
  );
  const page = rows.slice(0, opts.limit);
  return {
    events: page.map((r) => ({
      id: r.id,
      kind: r.kind,
      createdAt: r.created_at,
      character: r.character_id
        ? { id: r.character_id, name: r.name, surname: r.surname, class: r.class, race: r.race, level: r.level }
        : null,
      user: r.owner_id ? { id: r.owner_id, displayName: r.owner_name } : null,
      data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data,
    })),
    nextCursor: rows.length > opts.limit ? page[page.length - 1].id : null,
  };
}
