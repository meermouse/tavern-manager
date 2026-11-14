export type Region = 'us' | 'eu' | 'kr' | 'tw';
export type CharacterStatus = 'ok' | 'pending' | 'error';
export type Role = 'tank' | 'healer' | 'damage';

/** A trained profession and its skill level, e.g. Alchemy 225 / 300. */
export interface Profession {
  name: string;
  /** Primary professions fill the two profession slots; secondary skills (Cooking, Fishing, First Aid) are extra. */
  kind: 'primary' | 'secondary';
  skill: number | null;
  /** Cap for the current rank, e.g. 300 for Artisan. */
  maxSkill: number | null;
}

/** A tavern title: held by whoever in the tavern currently leads a stat. */
export interface TitleBadge {
  key: string;
  name: string;
  icon: string;
  description: string;
  /** The winning score, formatted, e.g. "412 hours played". */
  value: string;
}

/** A title you hold, and where. Player titles (Altaholic) have no character. */
export interface PlayerTitle extends TitleBadge {
  tavernId: string;
  tavernName: string;
  character: { id: string; name: string; surname: string } | null;
}

/** One row of a title's standings: a character, or a player for player titles. */
export interface TitleStanding {
  /** 1-based; ties share a rank. */
  rank: number;
  holder: boolean;
  score: number;
  value: string;
  player: { userId: string; displayName: string };
  character: { id: string; name: string; surname: string } | null;
}

/** A title and everyone in the running for it, best first. */
export interface TitleStandings extends Omit<TitleBadge, 'value'> {
  subject: 'character' | 'player';
  lowestWins: boolean;
  standings: TitleStanding[];
}

export interface Me {
  id: string;
  battletag: string;
  displayName: string;
  canImport: boolean;
  /** Titles you hold across your taverns. */
  titles?: PlayerTitle[];
}

export interface Character {
  id: string;
  region: Region;
  name: string;
  surname: string;
  ruleset: string | null;
  class: string | null;
  race: string | null;
  level: number | null;
  status: CharacterStatus;
  syncError: string | null;
  lastSyncedAt: string | null;
  lastLoginAt?: string | null;
  guild?: string | null;
  faction?: string | null;
  gender?: string | null;
  title?: string | null;
  itemLevel?: number | null;
  achievementPoints?: number | null;
  /** Blizzard character render images (see the API's `/character-media` sync). */
  avatarUrl?: string | null;
  insetUrl?: string | null;
  renderUrl?: string | null;
  /** Party roles the owner assigned (empty when none). */
  roles?: Role[];
  /** Trained professions, primaries first; `null` before they've synced. */
  professions?: Profession[] | null;
}

export interface TavernCharacter extends Character {
  ownerId: string;
  ownerName: string;
  /** Titles this character holds in the tavern (tavern roster only). */
  titles?: TitleBadge[];
}

export interface CharacterDetails extends TavernCharacter {
  /** Everything equipped as of the last gear sync; `null` if we haven't been able to fetch it. */
  equipment: FeedItem[] | null;
  equipmentSyncedAt: string | null;
  /** This character's latest feed posts in this tavern. */
  recent: FeedEvent[];
}

/** A character with everything the leaderboard can rank by. */
export interface LeaderboardEntry extends TavernCharacter {
  /** Sum of equipped item levels (shirt and tabard excluded); `null` before gear has synced. */
  gearItemLevel: number | null;
  /** Items worn per quality, e.g. `{ EPIC: 2, RARE: 5 }`. */
  gearQualities: Record<string, number> | null;
  achievementsEarned: number;
  notableItems: number;
  cheers: number;
  /** 🍺 the character's player has raised. The same for all their characters. */
  cheersGiven: number;
  feedPosts: number;
  /** Lifetime counters from Blizzard's achievement statistics, by name ("Total deaths", ...). */
  statistics: Record<string, number> | null;
  /** The character sheet: health, strength, armor, melee_crit, ... */
  characterStats: Record<string, number> | null;
  statisticsSyncedAt: string | null;
}

export interface TavernSummary {
  id: string;
  name: string;
  isOwner: boolean;
  memberCount: number;
  characterCount: number;
}

export interface TavernMember {
  userId: string;
  displayName: string;
  isOwner: boolean;
  joinedAt: string;
}

export interface TavernDetail {
  id: string;
  name: string;
  inviteCode: string;
  isOwner: boolean;
  createdAt: string;
  members: TavernMember[];
  characters: TavernCharacter[];
  /** Every tavern title with its standings (Titles tab). Optional: older API responses lack it. */
  titles?: TitleStandings[];
}

export type FeedKind = 'level_up' | 'loot' | 'achievement' | 'character_joined' | 'member_joined' | 'tavern_founded';

export interface FeedItem {
  id: number;
  name: string;
  quality: string;
  slot: string | null;
  itemLevel: number | null;
  // Tooltip details (optional: older items and posts only have the basics).
  itemType?: string | null;
  binding?: string | null;
  unique?: string | null;
  armor?: string | null;
  weapon?: string[] | null;
  stats?: string[] | null;
  enchantments?: string[] | null;
  effects?: string[] | null;
  requirement?: string | null;
  durability?: string | null;
  set?: string | null;
  description?: string | null;
}

export interface FeedAchievement {
  id: number;
  name: string;
  completedAt: string | null;
}

export interface FeedEvent {
  id: string;
  kind: FeedKind;
  createdAt: string;
  character: Pick<Character, 'id' | 'name' | 'surname' | 'class' | 'race' | 'level' | 'avatarUrl'> | null;
  user: { id: string; displayName: string } | null;
  data: {
    from?: number;
    to?: number;
    items?: FeedItem[];
    achievements?: FeedAchievement[];
    tavernName?: string;
  };
  cheers: Cheers;
}

export interface Cheers {
  count: number;
  names: string[];
  cheeredByMe: boolean;
}

export interface FeedPage {
  events: FeedEvent[];
  nextCursor: string | null;
}

export interface InvitePreview {
  id: string;
  name: string;
  memberCount: number;
  isMember: boolean;
}

export interface AuthConfig {
  battlenet: boolean;
  devLogin: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

export const api = {
  authConfig: () => request<AuthConfig>('GET', '/auth/config'),
  devLogin: (battletag: string) => request<{ ok: true }>('POST', '/auth/dev-login', { battletag }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),
  loginUrl: (next = '/') => `/auth/login?next=${encodeURIComponent(next)}`,

  me: () => request<Me>('GET', '/api/me'),
  updateMe: (displayName: string) => request<Me>('PATCH', '/api/me', { displayName }),

  characters: () => request<Character[]>('GET', '/api/characters'),
  addCharacter: (input: { name: string; surname: string; region: Region }) =>
    request<Character>('POST', '/api/characters', input),
  importCharacters: () =>
    request<{ found: number; imported: number; skipped: number }>('POST', '/api/characters/import'),
  refreshCharacter: (id: string) => request<Character>('POST', `/api/characters/${id}/refresh`),
  setCharacterRoles: (id: string, roles: Role[]) => request<Character>('PATCH', `/api/characters/${id}`, { roles }),
  deleteCharacter: (id: string) => request<{ ok: true }>('DELETE', `/api/characters/${id}`),

  taverns: () => request<TavernSummary[]>('GET', '/api/taverns'),
  createTavern: (name: string) => request<TavernDetail>('POST', '/api/taverns', { name }),
  tavern: (id: string) => request<TavernDetail>('GET', `/api/taverns/${id}`),
  renameTavern: (id: string, name: string) => request<TavernDetail>('PATCH', `/api/taverns/${id}`, { name }),
  deleteTavern: (id: string) => request<{ ok: true }>('DELETE', `/api/taverns/${id}`),
  leaveTavern: (id: string) => request<{ ok: true }>('POST', `/api/taverns/${id}/leave`),
  regenerateInvite: (id: string) => request<TavernDetail>('POST', `/api/taverns/${id}/invite-code`),
  tavernFeed: (id: string, before?: string | null) =>
    request<FeedPage>('GET', `/api/taverns/${id}/feed${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  setCheer: (tavernId: string, eventId: string, on: boolean) =>
    request<Cheers>(on ? 'PUT' : 'DELETE', `/api/taverns/${tavernId}/feed/${eventId}/cheers`),
  characterDetails: (tavernId: string, characterId: string) =>
    request<CharacterDetails>('GET', `/api/taverns/${tavernId}/characters/${characterId}`),
  tavernLeaderboard: (id: string) => request<LeaderboardEntry[]>('GET', `/api/taverns/${id}/leaderboard`),
  leaderboard: () => request<LeaderboardEntry[]>('GET', '/api/leaderboard'),
  refreshTavern: (id: string) => request<TavernDetail>('POST', `/api/taverns/${id}/refresh`),
  addToTavern: (tavernId: string, characterId: string) =>
    request<{ ok: true }>('PUT', `/api/taverns/${tavernId}/characters/${characterId}`),
  removeFromTavern: (tavernId: string, characterId: string) =>
    request<{ ok: true }>('DELETE', `/api/taverns/${tavernId}/characters/${characterId}`),

  invite: (code: string) => request<InvitePreview>('GET', `/api/invites/${encodeURIComponent(code)}`),
  joinInvite: (code: string) => request<{ tavernId: string }>('POST', `/api/invites/${encodeURIComponent(code)}/join`),
};
