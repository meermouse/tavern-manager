import type { BlizzardClient, CompletedAchievement, EquippedItem } from './blizzard/client.js';
import type { Db } from './db.js';
import type { CharacterRow } from './sync.js';

/** Kinds of feed post. See docs/activity-feed.md. */
export type FeedKind = 'level_up' | 'loot' | 'achievement' | 'character_joined' | 'member_joined' | 'tavern_founded';

/**
 * Bump when `parseEquipment` starts keeping more detail, so gear saved by an older version is re-fetched once
 * instead of waiting for the character's next login. 2 = tooltip details (stats, effects, ...).
 */
export const EQUIPMENT_VERSION = 2;

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

export async function bestEffort<T>(label: string, fn: (() => Promise<T | null>) | undefined): Promise<T | null> {
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
      // The whole item, so the post's tooltip still works after it's swapped out.
      data: { items: fresh },
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
  const gearOutdated = (row.equipment_version ?? 0) < EQUIPMENT_VERSION;
  if (!loggedInSince && !gearOutdated) return;

  const items = await bestEffort(
    'Equipment sync',
    blizzard.getEquipment && (() => blizzard.getEquipment!(row.region, row.name, row.surname)),
  );
  if (items) {
    // Keep the full set for the character details pane.
    await db.query(
      'update characters set equipment = $2::jsonb, equipment_synced_at = now(), equipment_version = $3 where id = $1',
      [row.id, JSON.stringify(items), EQUIPMENT_VERSION],
    );
    await detectLoot(db, row, items);
  }
  if (!loggedInSince) return; // Only the gear needed refreshing.

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
  avatar_url: string | null;
  equipment: unknown;
  owner_id: string | null;
  owner_name: string | null;
  cheer_names: string[] | string;
  cheered: boolean;
}

/** Which events a tavern can see: its own posts, plus posts about characters currently in it. */
const VISIBLE_IN_TAVERN = `(
  e.tavern_id = $1
  or (e.tavern_id is null and e.character_id in (select character_id from tavern_characters where tavern_id = $1))
)`;

export async function eventVisibleInTavern(db: Db, tavernId: string, eventId: string): Promise<boolean> {
  const [row] = await db.query(`select 1 from feed_events e where e.id = $2::bigint and ${VISIBLE_IN_TAVERN}`, [
    tavernId,
    eventId,
  ]);
  return !!row;
}

export async function tavernFeed(
  db: Db,
  tavernId: string,
  viewerId: string,
  opts: { before?: string | null; limit: number; characterId?: string },
) {
  const params: unknown[] = [tavernId, opts.limit + 1, viewerId];
  let cursor = '';
  if (opts.before) {
    params.push(opts.before);
    cursor += ` and e.id < $${params.length}::bigint`;
  }
  if (opts.characterId) {
    params.push(opts.characterId);
    cursor += ` and e.character_id = $${params.length}`;
  }
  const rows = await db.query<FeedRow>(
    `select e.id::text as id, e.kind, e.tavern_id, e.character_id, e.data, e.created_at,
       c.name, c.surname, c.class, c.race, c.level, c.avatar_url,
       case when e.kind = 'loot' then c.equipment end as equipment,
       u.id as owner_id, u.display_name as owner_name,
       (select coalesce(json_agg(ru.display_name order by r.created_at), '[]'::json)
          from feed_reactions r join users ru on ru.id = r.user_id
          where r.event_id = e.id and r.tavern_id = $1) as cheer_names,
       exists(select 1 from feed_reactions r where r.event_id = e.id and r.tavern_id = $1 and r.user_id = $3) as cheered
     from feed_events e
     left join characters c on c.id = e.character_id
     left join users u on u.id = coalesce(e.user_id, c.user_id)
     where ${VISIBLE_IN_TAVERN} ${cursor}
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
        ? {
            id: r.character_id,
            name: r.name,
            surname: r.surname,
            class: r.class,
            race: r.race,
            level: r.level,
            avatarUrl: r.avatar_url,
          }
        : null,
      user: r.owner_id ? { id: r.owner_id, displayName: r.owner_name } : null,
      data: withItemDetails(typeof r.data === 'string' ? JSON.parse(r.data) : r.data, r.equipment),
      cheers: cheersOf(r),
    })),
    nextCursor: rows.length > opts.limit ? page[page.length - 1].id : null,
  };
}

type SavedItem = { id: number } & Record<string, unknown>;

/**
 * Loot posts made before items kept tooltip details only have the basics. Fill them in from the character's
 * current saved gear when they still have the same item.
 */
export function withItemDetails(data: Record<string, unknown>, equipment: unknown): Record<string, unknown> {
  const raw = typeof equipment === 'string' ? JSON.parse(equipment) : equipment;
  if (!Array.isArray(data.items) || !Array.isArray(raw)) return data;
  const byId = new Map((raw as SavedItem[]).map((i) => [i.id, i]));
  return {
    ...data,
    items: (data.items as SavedItem[]).map((item) => {
      const saved = byId.get(item.id);
      // The post's own fields win; the saved copy only adds what the post is missing.
      return saved ? { ...saved, ...item } : item;
    }),
  };
}

function cheersOf(r: Pick<FeedRow, 'cheer_names' | 'cheered'>) {
  const names: string[] = typeof r.cheer_names === 'string' ? JSON.parse(r.cheer_names) : r.cheer_names;
  return { count: names.length, names, cheeredByMe: r.cheered };
}

/** Add or remove the viewer's cheer, returning the post's updated cheers. */
export async function setCheer(db: Db, tavernId: string, eventId: string, userId: string, on: boolean) {
  if (on) {
    await db.query(
      'insert into feed_reactions (event_id, tavern_id, user_id) values ($1::bigint, $2, $3) on conflict do nothing',
      [eventId, tavernId, userId],
    );
  } else {
    await db.query('delete from feed_reactions where event_id = $1::bigint and tavern_id = $2 and user_id = $3', [
      eventId,
      tavernId,
      userId,
    ]);
  }
  const [row] = await db.query<Pick<FeedRow, 'cheer_names' | 'cheered'>>(
    `select
       (select coalesce(json_agg(ru.display_name order by r.created_at), '[]'::json)
          from feed_reactions r join users ru on ru.id = r.user_id
          where r.event_id = $1::bigint and r.tavern_id = $2) as cheer_names,
       exists(select 1 from feed_reactions where event_id = $1::bigint and tavern_id = $2 and user_id = $3) as cheered`,
    [eventId, tavernId, userId],
  );
  return cheersOf(row);
}
