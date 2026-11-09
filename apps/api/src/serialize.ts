import type { UserRow } from './context.js';
import type { CharacterRow } from './sync.js';

export function serializeCharacter(row: CharacterRow) {
  return {
    id: row.id,
    region: row.region,
    name: row.name,
    surname: row.surname,
    ruleset: row.ruleset,
    class: row.class,
    race: row.race,
    level: row.level,
    status: row.status,
    syncError: row.sync_error,
    lastSyncedAt: row.last_synced_at,
  };
}

export function serializeUser(row: UserRow) {
  return { id: row.id, battletag: row.battletag, displayName: row.display_name };
}
