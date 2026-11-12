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
    lastLoginAt: row.last_login_at,
    guild: row.guild,
    faction: row.faction,
    gender: row.gender,
    title: row.title,
    itemLevel: row.item_level,
    achievementPoints: row.achievement_points,
    avatarUrl: row.avatar_url,
    insetUrl: row.inset_url,
    renderUrl: row.render_url,
  };
}

/** Saved equipment (see `feed.ts`), tolerating the JSON-as-string shape some drivers return. */
export function serializeEquipment(row: CharacterRow): unknown[] | null {
  const raw = typeof row.equipment === 'string' ? JSON.parse(row.equipment) : row.equipment;
  return Array.isArray(raw) ? raw : null;
}

export function serializeUser(row: UserRow) {
  return { id: row.id, battletag: row.battletag, displayName: row.display_name };
}
