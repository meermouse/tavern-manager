import type { BlizzardClient } from './blizzard/client.js';
import type { Region } from './config.js';
import type { Db } from './db.js';
import { bestEffort, detectProgress } from './feed.js';

export interface CharacterRow {
  id: string;
  user_id: string;
  region: Region;
  name: string;
  surname: string;
  ruleset: string | null;
  class: string | null;
  race: string | null;
  level: number | null;
  status: 'ok' | 'pending' | 'error';
  sync_error: string | null;
  last_synced_at: Date | null;
  last_attempt_at: Date | null;
  last_login_at: Date | null;
  gear_baseline_at: Date | null;
  achievements_baseline_at: Date | null;
  guild: string | null;
  faction: string | null;
  gender: string | null;
  title: string | null;
  item_level: number | null;
  achievement_points: number | null;
  avatar_url: string | null;
  inset_url: string | null;
  render_url: string | null;
  media_synced_at: Date | null;
  equipment: unknown;
  equipment_synced_at: Date | null;
  created_at: Date;
}

/** Refetch portraits at least this often, even if Blizzard doesn't tell us the character logged in. */
const MEDIA_MAX_AGE_MS = 24 * 60 * 60_000;

/**
 * Fetch character render images when we have none, Blizzard reports a new login since the previous sync
 * (appearance only changes in game), or they're more than a day old. Best-effort: keeps old images on failure.
 */
export async function syncMedia(
  db: Db,
  blizzard: BlizzardClient,
  row: CharacterRow,
  prevLogin: Date | null,
): Promise<CharacterRow> {
  if (!blizzard.getMedia) return row;
  const last = row.media_synced_at?.getTime();
  const loggedIn = row.last_login_at != null && row.last_login_at.getTime() !== prevLogin?.getTime();
  const due = last == null || Date.now() - last > MEDIA_MAX_AGE_MS || loggedIn;
  if (!due) return row;
  const media = await bestEffort('Media sync', () => blizzard.getMedia!(row.region, row.name, row.surname));
  if (!media) return row;
  const [updated] = await db.query<CharacterRow>(
    `update characters set avatar_url = $2, inset_url = $3, render_url = $4, media_synced_at = now()
     where id = $1 returning *`,
    // Prefer the transparent render: it sits nicely on our own background.
    [row.id, media.avatar, media.inset, media.mainRaw ?? media.main],
  );
  return updated ?? row;
}

export async function syncCharacter(db: Db, blizzard: BlizzardClient, row: CharacterRow): Promise<CharacterRow> {
  try {
    const profile = await blizzard.getCharacter(row.region, row.name, row.surname);
    if (!profile) {
      const [updated] = await db.query<CharacterRow>(
        `update characters set
           status = case when status = 'ok' then 'ok' else 'pending' end,
           sync_error = 'Not visible in the Blizzard API yet (low-level characters may not appear until they log out above level 10).',
           last_attempt_at = now()
         where id = $1 returning *`,
        [row.id],
      );
      return updated;
    }
    // Read the previous level under a row lock in the same statement, so overlapping syncs
    // can't both see the old level and post the same level-up twice. (Joining `old` via FROM makes it
    // run before the update; a subquery in RETURNING would run after and find the row already changed.)
    const [updated] = await db.query<CharacterRow & { prev_level: number | null; prev_login: Date | null }>(
      `with old as (select level, last_login_at from characters where id = $1 for update)
       update characters set
         name = $2, surname = $3, class = $4, race = $5, level = $6, ruleset = $7,
         last_login_at = coalesce($8, characters.last_login_at),
         guild = $9, faction = coalesce($10, characters.faction), gender = coalesce($11, characters.gender),
         title = $12, item_level = coalesce($13, characters.item_level),
         achievement_points = coalesce($14, characters.achievement_points),
         status = 'ok', sync_error = null, last_synced_at = now(), last_attempt_at = now()
       from old where characters.id = $1
       returning characters.*, old.level as prev_level, old.last_login_at as prev_login`,
      [
        row.id,
        profile.name,
        profile.surname,
        profile.class,
        profile.race,
        profile.level,
        profile.ruleset,
        profile.lastLoginAt,
        profile.guild ?? null,
        profile.faction ?? null,
        profile.gender ?? null,
        profile.title ?? null,
        profile.itemLevel ?? null,
        profile.achievementPoints ?? null,
      ],
    );
    const { prev_level, prev_login, ...synced } = updated;
    try {
      await detectProgress(db, blizzard, { level: prev_level, last_login_at: prev_login }, synced);
    } catch (err) {
      console.error('Feed detection failed', err);
    }
    try {
      return await syncMedia(db, blizzard, synced, prev_login);
    } catch (err) {
      console.error('Media sync failed', err);
      return synced;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const [updated] = await db.query<CharacterRow>(
      `update characters set
         status = case when status = 'ok' then 'ok' else 'error' end,
         sync_error = $2, last_attempt_at = now()
       where id = $1 returning *`,
      [row.id, message],
    );
    return updated;
  }
}

/** Refresh characters not attempted within `staleMinutes`, oldest first. */
export async function refreshStale(
  db: Db,
  blizzard: BlizzardClient,
  opts: { staleMinutes: number; limit: number; tavernId?: string; deadline?: number },
): Promise<number> {
  const params: unknown[] = [opts.staleMinutes, opts.limit];
  let filter = '';
  if (opts.tavernId) {
    params.push(opts.tavernId);
    filter = 'and id in (select character_id from tavern_characters where tavern_id = $3)';
  }
  const rows = await db.query<CharacterRow>(
    `select * from characters
     where (last_attempt_at is null or last_attempt_at < now() - make_interval(mins => $1::int)) ${filter}
     order by last_attempt_at asc nulls first
     limit $2`,
    params,
  );
  let count = 0;
  // Sequential on purpose: gentle on Blizzard's rate limits.
  for (const row of rows) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    await syncCharacter(db, blizzard, row);
    count++;
  }
  return count;
}
