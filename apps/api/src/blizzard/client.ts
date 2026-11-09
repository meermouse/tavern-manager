import type { Region } from '../config.js';

export const RULESETS = ['Normal', 'PvP', 'Roleplay', 'Roleplay PvP'] as const;

export interface CharacterProfile {
  name: string;
  surname: string;
  class: string | null;
  race: string | null;
  level: number | null;
  ruleset: string | null;
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
}

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
  };
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

  return {
    async getCharacter(region, name, surname) {
      const url =
        `https://${region}.api.blizzard.com/profile/wow/character/${characterSlug(name, surname)}` +
        `?namespace=profile-forever-${region}&locale=en_US`;
      let res = await get(url, await getAppToken());
      if (res.status === 401) {
        appToken = null;
        res = await get(url, await getAppToken());
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new BlizzardError(`Blizzard API error (${res.status})`, res.status);
      return parseCharacterProfile((await res.json()) as Json, { name, surname });
    },

    async getAccountCharacters(region, userAccessToken) {
      const url = `https://${region}.api.blizzard.com/profile/user/wow?namespace=profile-forever-${region}&locale=en_US`;
      const res = await get(url, userAccessToken);
      if (!res.ok) throw new BlizzardError(`Blizzard account API error (${res.status})`, res.status);
      return parseAccountCharacters((await res.json()) as Json);
    },
  };
}
