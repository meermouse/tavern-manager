import type { Region } from '../config.js';

export const RULESETS = ['Normal', 'PvP', 'Roleplay', 'Roleplay PvP'] as const;

export interface CharacterProfile {
  name: string;
  surname: string;
  class: string | null;
  race: string | null;
  level: number | null;
  ruleset: string | null;
  /** When the character last logged in (data only updates on logout). `null` if the API doesn't say. */
  lastLoginAt: Date | null;
  // Extra profile details, shown on the character details pane. Optional: the Forever API is undocumented.
  guild?: string | null;
  faction?: string | null;
  gender?: string | null;
  /** Active title with the name filled in, e.g. "Judgement the Explorer". */
  title?: string | null;
  itemLevel?: number | null;
  achievementPoints?: number | null;
}

/** Character render images from the `/character-media` endpoint. */
export interface CharacterMedia {
  /** Small square headshot (~84px). */
  avatar: string | null;
  /** Wide bust shot (~230×116). */
  inset: string | null;
  /** Full-body render with background. */
  main: string | null;
  /** Full-body render on a transparent background. */
  mainRaw: string | null;
}

/** Blizzard item quality types, upper-case, e.g. `RARE`, `EPIC`. */
export type ItemQuality = string;

export interface EquippedItem {
  id: number;
  name: string;
  quality: ItemQuality;
  slot: string | null;
  itemLevel: number | null;
  // Tooltip details. Optional: older saved items and posts don't have them, and the API may omit any of them.
  /** e.g. "Leather", "Two-Handed Sword". */
  itemType?: string | null;
  /** e.g. "Binds when picked up". */
  binding?: string | null;
  /** e.g. "Unique". */
  unique?: string | null;
  /** e.g. "52 Armor". */
  armor?: string | null;
  /** e.g. ["12 - 23 Damage", "Speed 2.60", "(6.7 damage per second)"]. */
  weapon?: string[] | null;
  /** e.g. ["+5 Agility", "+3 Stamina"]. */
  stats?: string[] | null;
  /** Enchants, e.g. ["Enchanted: +3 Agility"]. */
  enchantments?: string[] | null;
  /** Equip / use / chance-on-hit effects, e.g. ["Equip: Improves your chance to hit by 1%."]. */
  effects?: string[] | null;
  /** e.g. "Requires Level 30". */
  requirement?: string | null;
  /** e.g. "Durability 50 / 50". */
  durability?: string | null;
  /** e.g. "Battlegear of Might (2/8)". */
  set?: string | null;
  /** Flavour text. */
  description?: string | null;
}

export interface CompletedAchievement {
  id: number;
  name: string;
  completedAt: Date | null;
}

export interface AccountCharacter {
  name: string;
  surname: string;
}

export interface BlizzardClient {
  /** Returns `null` when the character isn't (yet) visible to the API, e.g. low level or never logged out. */
  getCharacter(region: Region, name: string, surname: string): Promise<CharacterProfile | null>;
  /** Characters on the signed-in user's account. Needs a user token with the `wow.profile` scope. */
  getAccountCharacters(region: Region, userAccessToken: string): Promise<AccountCharacter[]>;
  /** Equipped items, or `null` when the endpoint isn't available for this character. Optional: best-effort. */
  getEquipment?(region: Region, name: string, surname: string): Promise<EquippedItem[] | null>;
  /** Completed achievements, or `null` when the endpoint isn't available. Optional: best-effort. */
  getAchievements?(region: Region, name: string, surname: string): Promise<CompletedAchievement[] | null>;
  /** Character render images, or `null` when not available. Optional: best-effort. */
  getMedia?(region: Region, name: string, surname: string): Promise<CharacterMedia | null>;
  /**
   * Lifetime counters from `/achievements/statistics` ("Total deaths", "Creatures killed", ...), keyed by
   * Blizzard's statistic name, or `null` when not available. Optional: best-effort.
   */
  getStatistics?(region: Region, name: string, surname: string): Promise<StatisticMap | null>;
  /** Combat stats from `/statistics` (health, strength, armor, crit, ...), or `null`. Optional: best-effort. */
  getCharacterStats?(region: Region, name: string, surname: string): Promise<StatisticMap | null>;
}

/** Statistic name → value. */
export type StatisticMap = Record<string, number>;

export class BlizzardError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

type Json = Record<string, unknown>;

/** Blizzard returns names either as a plain string or, without `locale`, as `{ en_US: '...' }`. */
function text(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const obj = value as Json;
    for (const key of ['en_US', 'en_GB', 'name']) {
      const v = text(obj[key]);
      if (v) return v;
    }
    const first = Object.values(obj).find((v) => typeof v === 'string');
    if (typeof first === 'string') return first;
  }
  return null;
}

function nameOf(value: unknown): string | null {
  if (value && typeof value === 'object') return text((value as Json).name);
  return text(value);
}

const RULESET_ALIASES: Record<string, string> = {
  normal: 'Normal',
  pve: 'Normal',
  pvp: 'PvP',
  rp: 'Roleplay',
  roleplay: 'Roleplay',
  rppvp: 'Roleplay PvP',
  roleplaypvp: 'Roleplay PvP',
};

export function normalizeRuleset(value: unknown): string | null {
  const raw = nameOf(value) ?? (value && typeof value === 'object' ? text((value as Json).type) : null);
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[^a-z]/g, '');
  return RULESET_ALIASES[key] ?? raw;
}

/**
 * The Forever character endpoint isn't documented yet, so be liberal in what we accept:
 * classic-style (`character_class`, `race`) and account-style (`playable_class`, `playable_race`) shapes.
 */
export function parseCharacterProfile(json: Json, fallback: { name: string; surname: string }): CharacterProfile {
  const level = typeof json.level === 'number' ? json.level : Number(json.level);
  const ruleset =
    normalizeRuleset(json.ruleset) ??
    normalizeRuleset(json.realm_type) ??
    normalizeRuleset(json.realm_category) ??
    (json.realm && typeof json.realm === 'object' ? normalizeRuleset((json.realm as Json).type) : null);
  return {
    name: text(json.name) ?? fallback.name,
    surname: text(json.surname) ?? text(json.last_name) ?? fallback.surname,
    class: nameOf(json.character_class) ?? nameOf(json.playable_class),
    race: nameOf(json.race) ?? nameOf(json.playable_race),
    level: Number.isFinite(level) ? level : null,
    ruleset,
    lastLoginAt: timestamp(json.last_login_timestamp),
    guild: nameOf(json.guild),
    faction: nameOf(json.faction) ?? (json.faction && typeof json.faction === 'object' ? capitalised(text((json.faction as Json).type)) : null),
    gender: nameOf(json.gender) ?? (json.gender && typeof json.gender === 'object' ? capitalised(text((json.gender as Json).type)) : null),
    title: titleOf(json.active_title, text(json.name) ?? fallback.name),
    itemLevel: int(json.equipped_item_level) ?? int(json.average_item_level),
    achievementPoints: int(json.achievement_points),
  };
}

function capitalised(s: string | null): string | null {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : null;
}

/** `{ display_string: '{name} the Explorer' }` → `Judgement the Explorer`. */
function titleOf(value: unknown, name: string): string | null {
  if (!value || typeof value !== 'object') return null;
  const display = text((value as Json).display_string);
  if (display) return display.replace('{name}', name);
  return nameOf(value);
}

/** Absolute http(s) URLs only: these end up in `<img src>`. */
function imageUrl(value: unknown): string | null {
  const s = text(value);
  return s && /^https:\/\//i.test(s) ? s : null;
}

/**
 * `/character-media` responses: `{ assets: [{ key: 'avatar', value: url }, …] }` (current), or the older
 * `avatar_url` / `bust_url` / `render_url` fields. `null` when there are no images at all.
 */
export function parseCharacterMedia(json: Json): CharacterMedia | null {
  const assets: Record<string, string | null> = {};
  if (Array.isArray(json.assets)) {
    for (const a of json.assets as Json[]) {
      const key = text(a?.key);
      if (key) assets[key.toLowerCase()] = imageUrl(a.value);
    }
  }
  const media: CharacterMedia = {
    avatar: assets.avatar ?? imageUrl(json.avatar_url),
    inset: assets.inset ?? imageUrl(json.bust_url),
    main: assets.main ?? imageUrl(json.render_url),
    mainRaw: assets['main-raw'] ?? null,
  };
  return Object.values(media).some(Boolean) ? media : null;
}

function timestamp(value: unknown): Date | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(n) && n > 0 ? new Date(n) : null;
}

function int(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(n) ? n : null;
}

/** `{ quality: { type: 'EPIC', name: 'Epic' } }`, `{ quality: 'EPIC' }` or `{ quality: 'Epic' }` → `EPIC`. */
function qualityOf(value: unknown): ItemQuality | null {
  const raw = value && typeof value === 'object' ? (text((value as Json).type) ?? nameOf(value)) : text(value);
  return raw ? raw.toUpperCase().replace(/[^A-Z]/g, '') : null;
}

/** `{ display_string: '...' }` or `{ display: { display_string: '...' } }` → the string. */
function display(value: unknown): string | null {
  if (!value || typeof value !== 'object') return text(value);
  const obj = value as Json;
  return text(obj.display_string) ?? (obj.display && typeof obj.display === 'object' ? text((obj.display as Json).display_string) : null);
}

function strings(list: unknown, pick: (v: Json) => string | null): string[] | null {
  if (!Array.isArray(list)) return null;
  const out = (list as Json[]).filter((v) => v && typeof v === 'object').map(pick).filter((v): v is string => !!v);
  return out.length ? out : null;
}

/** `{ type: { name: 'Stamina' }, value: 5 }` → "+5 Stamina", for stats without a display string. */
function statLine(stat: Json): string | null {
  const value = typeof stat.value === 'number' ? stat.value : Number(stat.value);
  const name = nameOf(stat.type) ?? text(stat.type);
  if (!Number.isFinite(value) || !name) return null;
  return `${value >= 0 ? '+' : ''}${value} ${name}`;
}

const EFFECT_PREFIX = /^(Equip|Use|Chance on hit):/i;

function parseItemDetails(it: Json): Partial<EquippedItem> {
  const weapon = it.weapon && typeof it.weapon === 'object' ? (it.weapon as Json) : null;
  const requirements = it.requirements && typeof it.requirements === 'object' ? (it.requirements as Json) : null;
  const set = it.set && typeof it.set === 'object' ? (it.set as Json) : null;
  const weaponLines = weapon
    ? [display(weapon.damage), display(weapon.attack_speed), display(weapon.dps)].filter((v): v is string => !!v)
    : [];
  return {
    itemType: nameOf(it.item_subclass) ?? nameOf(it.item_class),
    binding: nameOf(it.binding),
    unique: display(it.unique_equipped) ?? (it.is_unique_equipped === true ? 'Unique-Equipped' : null),
    armor: display(it.armor),
    weapon: weaponLines.length ? weaponLines : null,
    stats: strings(it.stats, (s) => (s.is_negated === true ? null : (display(s) ?? statLine(s)))),
    enchantments: strings(it.enchantments, (e) => display(e)),
    effects: strings(it.spells, (sp) => {
      const desc = text(sp.description);
      if (!desc) return null;
      return EFFECT_PREFIX.test(desc) ? desc : `Equip: ${desc}`;
    }),
    requirement: requirements ? display(requirements.level) : null,
    durability: display(it.durability),
    set: set ? display(set) ?? nameOf(set.item_set) : null,
    description: text(it.description),
  };
}

export function parseEquipment(json: Json): EquippedItem[] {
  const items = Array.isArray(json.equipped_items) ? (json.equipped_items as Json[]) : [];
  const out: EquippedItem[] = [];
  for (const it of items) {
    const ref = it.item && typeof it.item === 'object' ? (it.item as Json) : {};
    const id = int(ref.id) ?? int(it.id);
    const name = text(it.name) ?? text(ref.name);
    const quality = qualityOf(it.quality);
    if (id == null || !name || !quality) continue;
    const slot = it.slot && typeof it.slot === 'object' ? nameOf(it.slot) ?? text((it.slot as Json).type) : text(it.slot);
    const level = it.level && typeof it.level === 'object' ? int((it.level as Json).value) : int(it.level);
    const details = Object.fromEntries(Object.entries(parseItemDetails(it)).filter(([, v]) => v != null));
    out.push({ id, name, quality, slot, itemLevel: level, ...details });
  }
  return out;
}

export function parseAchievements(json: Json): CompletedAchievement[] {
  const list = Array.isArray(json.achievements) ? (json.achievements as Json[]) : [];
  const out: CompletedAchievement[] = [];
  for (const a of list) {
    const ref = a.achievement && typeof a.achievement === 'object' ? (a.achievement as Json) : {};
    const id = int(ref.id) ?? int(a.id);
    const name = text(ref.name) ?? text(a.name);
    const completedAt = timestamp(a.completed_timestamp);
    const criteria = a.criteria && typeof a.criteria === 'object' ? (a.criteria as Json) : null;
    // Entries without a completion time are in-progress criteria, unless explicitly marked complete.
    if (id == null || !name || (!completedAt && criteria?.is_completed !== true)) continue;
    out.push({ id, name, completedAt });
  }
  return out;
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * `/achievements/statistics`: `{ categories: [{ name, statistics: [{ id, name, quantity }], sub_categories: [...] }] }`.
 * Flattened to name → quantity, walking every level of nesting (the Forever shape isn't documented).
 * The first occurrence of a name wins. `null` when there are no statistics at all.
 */
export function parseAchievementStatistics(json: Json): StatisticMap | null {
  const out: StatisticMap = {};
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const obj = node as Json;
    if (Array.isArray(obj.statistics)) {
      for (const st of obj.statistics as Json[]) {
        const name = st && typeof st === 'object' ? text(st.name) : null;
        const value = st && typeof st === 'object' ? (num(st.quantity) ?? num(st.value)) : null;
        if (name && value != null && !(name in out)) out[name] = value;
      }
    }
    walk(obj.categories);
    walk(obj.sub_categories);
    walk(obj.subcategories);
  };
  walk(json);
  return Object.keys(out).length ? out : null;
}

/**
 * `/statistics` (the character sheet): `{ health: 4200, strength: { base, effective }, melee_crit: { value }, ... }`.
 * Flattened to field → number, preferring the effective value. `null` when there's nothing numeric.
 */
export function parseCharacterStats(json: Json): StatisticMap | null {
  const out: StatisticMap = {};
  for (const [key, value] of Object.entries(json)) {
    if (key.startsWith('_') || key === 'character') continue;
    const n =
      num(value) ??
      (value && typeof value === 'object' && !Array.isArray(value)
        ? (num((value as Json).effective) ?? num((value as Json).value) ?? num((value as Json).rating_normalized))
        : null);
    if (n != null) out[key] = n;
  }
  return Object.keys(out).length ? out : null;
}

export function parseAccountCharacters(json: Json): AccountCharacter[] {
  const accounts = Array.isArray(json.wow_accounts) ? (json.wow_accounts as Json[]) : [];
  const out: AccountCharacter[] = [];
  for (const account of accounts) {
    const chars = Array.isArray(account.characters) ? (account.characters as Json[]) : [];
    for (const c of chars) {
      const name = text(c.name);
      const surname = text(c.surname) ?? text(c.last_name);
      if (name && surname) out.push({ name, surname });
    }
  }
  return out;
}

export function characterSlug(name: string, surname: string): string {
  return `${encodeURIComponent(name.toLowerCase())}-${encodeURIComponent(surname.toLowerCase())}`;
}

export function createBlizzardClient(
  creds: { clientId: string; clientSecret: string },
  fetchImpl: typeof fetch = fetch,
): BlizzardClient {
  let appToken: { value: string; expiresAt: number } | null = null;

  async function getAppToken(): Promise<string> {
    if (appToken && appToken.expiresAt > Date.now() + 60_000) return appToken.value;
    const res = await fetchImpl('https://oauth.battle.net/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new BlizzardError(`Could not get Blizzard API token (${res.status})`, res.status);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    appToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return appToken.value;
  }

  async function get(url: string, token: string): Promise<Response> {
    return fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  }

  /** GET a character resource with the app token. `null` on 404. */
  async function getProfile(region: Region, name: string, surname: string, resource = ''): Promise<Json | null> {
    const url =
      `https://${region}.api.blizzard.com/profile/wow/character/${characterSlug(name, surname)}${resource}` +
      `?namespace=profile-forever-${region}&locale=en_US`;
    let res = await get(url, await getAppToken());
    if (res.status === 401) {
      appToken = null;
      res = await get(url, await getAppToken());
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new BlizzardError(`Blizzard API error (${res.status})`, res.status);
    return (await res.json()) as Json;
  }

  return {
    async getCharacter(region, name, surname) {
      const json = await getProfile(region, name, surname);
      return json && parseCharacterProfile(json, { name, surname });
    },

    async getEquipment(region, name, surname) {
      const json = await getProfile(region, name, surname, '/equipment');
      return json && parseEquipment(json);
    },

    async getAchievements(region, name, surname) {
      const json = await getProfile(region, name, surname, '/achievements');
      return json && parseAchievements(json);
    },

    async getMedia(region, name, surname) {
      const json = await getProfile(region, name, surname, '/character-media');
      return json && parseCharacterMedia(json);
    },

    async getStatistics(region, name, surname) {
      const json = await getProfile(region, name, surname, '/achievements/statistics');
      return json && parseAchievementStatistics(json);
    },

    async getCharacterStats(region, name, surname) {
      const json = await getProfile(region, name, surname, '/statistics');
      return json && parseCharacterStats(json);
    },

    async getAccountCharacters(region, userAccessToken) {
      const url = `https://${region}.api.blizzard.com/profile/user/wow?namespace=profile-forever-${region}&locale=en_US`;
      const res = await get(url, userAccessToken);
      if (!res.ok) throw new BlizzardError(`Blizzard account API error (${res.status})`, res.status);
      return parseAccountCharacters((await res.json()) as Json);
    },
  };
}
