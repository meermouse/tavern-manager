import type { CharacterProfession } from './blizzard/client.js';
import type { UserRow } from './context.js';
import type { CharacterRow } from './sync.js';

export const ROLES = ['tank', 'healer', 'damage'] as const;
export type Role = (typeof ROLES)[number];

/** Known roles only, deduplicated, in canonical tank → healer → damage order. */
export function normalizeRoles(value: unknown): Role[] {
  const list = Array.isArray(value) ? value : [];
  return ROLES.filter((r) => list.includes(r));
}

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
    roles: normalizeRoles(row.roles),
    professions: serializeProfessions(row),
  };
}

/** Saved professions, primaries first; `null` before they've synced. Tolerates the JSON-as-string shape. */
export function serializeProfessions(row: CharacterRow): CharacterProfession[] | null {
  const raw = typeof row.professions === 'string' ? JSON.parse(row.professions) : row.professions;
  if (!Array.isArray(raw)) return null;
  const list = (raw as CharacterProfession[]).filter((p) => p && typeof p.name === 'string');
  return [...list.filter((p) => p.kind === 'primary'), ...list.filter((p) => p.kind !== 'primary')];
}

/** Saved equipment (see `feed.ts`), tolerating the JSON-as-string shape some drivers return. */
export function serializeEquipment(row: CharacterRow): unknown[] | null {
  const raw = typeof row.equipment === 'string' ? JSON.parse(row.equipment) : row.equipment;
  return Array.isArray(raw) ? raw : null;
}

export function serializeUser(row: UserRow) {
  return { id: row.id, battletag: row.battletag, displayName: row.display_name };
}
