import type { BlizzardClient } from './blizzard/client.js';
import type { Region } from './config.js';
import type { Db } from './db.js';

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
  zone: string | null;
  zone_source: 'api' | 'manual' | null;
  zone_updated_at: Date | null;
  status: 'ok' | 'pending' | 'error';
  sync_error: string | null;
  last_synced_at: Date | null;
  last_attempt_at: Date | null;
  created_at: Date;
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
    const [updated] = await db.query<CharacterRow>(
      `update characters set
         name = $2, surname = $3, class = $4, race = $5, level = $6, ruleset = $7,
         zone = coalesce($8, zone),
         zone_source = case when $8::text is null then zone_source else 'api' end,
         zone_updated_at = case when $8::text is null then zone_updated_at else now() end,
         status = 'ok', sync_error = null, last_synced_at = now(), last_attempt_at = now()
       where id = $1 returning *`,
      [row.id, profile.name, profile.surname, profile.class, profile.race, profile.level, profile.ruleset, profile.zone],
    );
    return updated;
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
