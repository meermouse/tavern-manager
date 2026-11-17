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
    dungeonsCompleted: serializeDungeonsCompleted(row),
  };
}

/** The dungeon log: dungeon name → when it was logged (ISO). Tolerates the JSON-as-string shape. */
export function serializeDungeonsCompleted(row: CharacterRow): Record<string, string> {
  const raw = typeof row.dungeons_completed === 'string' ? JSON.parse(row.dungeons_completed) : row.dungeons_completed;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<
    string,
    string
  >;
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

/** Slots that don't count towards total gear item level: cosmetic, and usually item level 1. */
const COSMETIC_SLOTS = new Set(['shirt', 'tabard']);

/** Sum of equipped item levels (cosmetic slots excluded), and how many items of each quality are worn. */
export function gearSummary(equipment: unknown[] | null) {
  if (!equipment) return { gearItemLevel: null, gearQualities: null };
  let total = 0;
  const qualities: Record<string, number> = {};
  for (const raw of equipment) {
    const item = raw as { slot?: string | null; itemLevel?: number | null; quality?: string };
    const slot = (item.slot ?? '').toLowerCase();
    if (COSMETIC_SLOTS.has(slot)) continue;
    if (typeof item.itemLevel === 'number') total += item.itemLevel;
    if (item.quality) qualities[item.quality] = (qualities[item.quality] ?? 0) + 1;
  }
  return { gearItemLevel: total, gearQualities: qualities };
}

/** Everything the character details pane shows: profile, owner, saved gear and the given recent posts. */
export function serializeCharacterDetails(row: CharacterRow & { owner_name: string }, recent: unknown[]) {
  const equipment = serializeEquipment(row);
  return {
    ...serializeCharacter(row),
    ownerId: row.user_id,
    ownerName: row.owner_name,
    equipment,
    gearItemLevel: gearSummary(equipment).gearItemLevel,
    equipmentSyncedAt: row.equipment_synced_at,
    recent,
  };
}

export function serializeUser(row: UserRow) {
  return { id: row.id, battletag: row.battletag, displayName: row.display_name };
}
