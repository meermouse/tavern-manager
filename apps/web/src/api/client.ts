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
  /** The winning score, formatted, e.g. "23.8% need rolls". */
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
  /** Holder first, then everyone else in the running. */
  standings: TitleStanding[];
  /** When the holder took the title (ISO); `null` when nobody holds it. Optional: older API responses lack it. */
  holderSince?: string | null;
  /** How many share the lead when that tie leaves the title unheld (0 otherwise). */
  tiedLeaders?: number;
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
  /** Blizzard's average item level. The app shows `gearItemLevel` instead. */
  itemLevel?: number | null;
  /** Sum of equipped item levels (shirt and tabard excluded); `null` before gear has synced. */
  gearItemLevel?: number | null;
  achievementPoints?: number | null;
  /** Blizzard character render images (see the API's `/character-media` sync). */
  avatarUrl?: string | null;
  insetUrl?: string | null;
  renderUrl?: string | null;
  /** Party roles the owner assigned (empty when none). */
  roles?: Role[];
  /** Trained professions, primaries first; `null` before they've synced. */
  professions?: Profession[] | null;
  /** Dungeon log: dungeon name → when the owner logged it as completed (ISO). */
  dungeonsCompleted?: Record<string, string>;
}

export interface TavernCharacter extends Character {
  ownerId: string;
  /** The character's IRL name: the owner's display name, unless a tavern admin set one for this tavern. */
  ownerName: string;
  /** True when a tavern admin set `ownerName` (tavern roster only). */
  irlNameOverridden?: boolean;
  /** Titles this character holds in the tavern (tavern roster only). */
  titles?: TitleBadge[];
}

/** An equipped item with what it's worth towards net worth. */
export interface PricedItem extends FeedItem {
  /** Going auction house price in copper, `null` when it isn't listed. Optional: older API responses. */
  auctionPrice?: number | null;
  auctionListings?: number;
  /** Vendor sell price in copper. */
  sellPrice?: number | null;
  /** What it counts for: the auction price, or else the vendor price. */
  value?: number | null;
}

export interface CharacterDetails extends TavernCharacter {
  /** Everything equipped as of the last gear sync; `null` if we haven't been able to fetch it. */
  equipment: PricedItem[] | null;
  /** Equipped gear's total value (see `PricedItem.value`), `null` when nothing has a value. */
  gearValue?: number | null;
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
  /** Equipped gear at the going auction house price, in copper; `null` when none of it is priced. */
  gearValue?: number | null;
  /** How many equipped items have an auction price (soulbound gear never gets listed). */
  gearPriced?: number;
  /** Lifetime counters from Blizzard's achievement statistics, by name ("Total deaths", ...). */
  statistics: Record<string, number> | null;
  /** The character sheet: health, strength, armor, melee_crit, ... */
  characterStats: Record<string, number> | null;
  statisticsSyncedAt: string | null;
}

/** One request the auction price fetch made (see the API's AuctionTraceStep). */
export interface AuctionTraceStep {
  path: string;
  status: number | null;
  ms: number;
  bytes?: number;
  keys?: string[];
  auctions?: number;
  priced?: number;
  error?: string;
}

export interface AuctionRegionStatus {
  region: string;
  attemptedAt: string | null;
  fetchedAt: string | null;
  houses: number;
  items: number;
  error: string | null;
  priced: number;
  trace: AuctionTraceStep[];
}

export interface AuctionStatus {
  supported: boolean;
  /** Tavern admins can fetch prices on demand. */
  canRefresh: boolean;
  regions: AuctionRegionStatus[];
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
  /** Tavern admins (the owner always is one) can rename IRL names, remove characters and edit runs. */
  isAdmin?: boolean;
  joinedAt: string;
}

export interface TavernDetail {
  id: string;
  name: string;
  inviteCode: string;
  isOwner: boolean;
  /** Whether you're one of this tavern's admins. */
  isAdmin?: boolean;
  createdAt: string;
  members: TavernMember[];
  characters: TavernCharacter[];
  /** Every tavern title with its standings (Titles tab). Optional: older API responses lack it. */
  titles?: TitleStandings[];
}

export type FeedKind =
  | 'level_up'
  | 'loot'
  | 'achievement'
  | 'dungeon_cleared'
  | 'dungeon_run'
  | 'character_joined'
  | 'member_joined'
  | 'tavern_founded'
  | 'generated_image';

/** An AI painting an admin commissioned of a post, and how painting it is going. */
export interface GeneratedImage {
  id: string;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  /** Why it failed (`failed` only). */
  error: string | null;
  /** Where to load it from (`ready` only). */
  url: string | null;
}

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
    /** dungeon_cleared and dungeon_run: the dungeon's name. */
    dungeon?: string;
    /** dungeon_run: the run (deleting it takes the post down), its date (YYYY-MM-DD), outcome and party. */
    runId?: string;
    date?: string;
    cleared?: boolean;
    bosses?: string[];
    characters?: Pick<Character, 'id' | 'name' | 'surname' | 'class' | 'level' | 'avatarUrl'>[];
    /** generated_image: what it shows (e.g. "The Deadmines with Judy and Grim") and the post it's a painting of. */
    caption?: string;
    sourceEventId?: string;
    image?: GeneratedImage;
  };
  cheers: Cheers;
}

/** A dungeon run a tavern logged. */
export interface DungeonRun {
  id: string;
  dungeon: string;
  /** The day of the run, YYYY-MM-DD. */
  date: string;
  /** Bosses killed. */
  bosses: string[];
  /** Whether they finished the dungeon (which ticks it off in everyone's dungeon log). */
  cleared: boolean;
  notes: string | null;
  loggedBy: { id: string; displayName: string } | null;
  createdAt: string;
  characters: (Pick<Character, 'id' | 'name' | 'surname' | 'class' | 'level' | 'avatarUrl'> & {
    ownerId: string;
    ownerName: string;
  })[];
  /** Whoever logged it, or a tavern admin, can delete it. */
  canDelete: boolean;
  /** Tavern admins can edit it. */
  canEdit?: boolean;
}

export interface NewDungeonRun {
  dungeon: string;
  date: string;
  characterIds: string[];
  bosses: string[];
  cleared: boolean;
  notes?: string;
}

export interface Cheers {
  count: number;
  names: string[];
  cheeredByMe: boolean;
}

/** Narrow a tavern feed down. Empty fields don't filter; set fields combine (all must match). */
export interface FeedFilters {
  /** Only these kinds of post. */
  kinds?: FeedKind[];
  /** Leave out these kinds of post. */
  excludeKinds?: FeedKind[];
  /** Only posts about any of these characters (group runs and paintings they're in count). */
  characterIds?: string[];
  /** Only posts about the viewer's own characters. */
  mine?: boolean;
  /** Only posts mentioning this text (names, items, dungeons, bosses, achievements, captions). */
  search?: string;
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
  setDungeonCompleted: (id: string, dungeon: string, completed: boolean) =>
    request<Character>('POST', `/api/characters/${id}/dungeons`, { dungeon, completed }),
  deleteCharacter: (id: string) => request<{ ok: true }>('DELETE', `/api/characters/${id}`),

  taverns: () => request<TavernSummary[]>('GET', '/api/taverns'),
  createTavern: (name: string) => request<TavernDetail>('POST', '/api/taverns', { name }),
  tavern: (id: string) => request<TavernDetail>('GET', `/api/taverns/${id}`),
  renameTavern: (id: string, name: string) => request<TavernDetail>('PATCH', `/api/taverns/${id}`, { name }),
  deleteTavern: (id: string) => request<{ ok: true }>('DELETE', `/api/taverns/${id}`),
  leaveTavern: (id: string) => request<{ ok: true }>('POST', `/api/taverns/${id}/leave`),
  regenerateInvite: (id: string) => request<TavernDetail>('POST', `/api/taverns/${id}/invite-code`),
  tavernFeed: (id: string, before?: string | null, filters?: FeedFilters) => {
    const q = new URLSearchParams();
    if (before) q.set('before', before);
    if (filters?.kinds?.length) q.set('kinds', filters.kinds.join(','));
    if (filters?.excludeKinds?.length) q.set('hide', filters.excludeKinds.join(','));
    if (filters?.characterIds?.length) q.set('characters', filters.characterIds.join(','));
    if (filters?.mine) q.set('mine', '1');
    if (filters?.search?.trim()) q.set('q', filters.search.trim());
    const qs = q.toString();
    return request<FeedPage>('GET', `/api/taverns/${id}/feed${qs ? `?${qs}` : ''}`);
  },
  setCheer: (tavernId: string, eventId: string, on: boolean) =>
    request<Cheers>(on ? 'PUT' : 'DELETE', `/api/taverns/${tavernId}/feed/${eventId}/cheers`),
  /** Admin only: commission a painting of a feed post. It's painted in the background. */
  generateImage: (tavernId: string, eventId: string, prompt?: string) =>
    request<{ eventId: string; imageId: string }>('POST', `/api/taverns/${tavernId}/images`, { eventId, prompt }),
  /** Admin only: the prompt a painting of this post would be painted from (nothing is saved). */
  imagePrompt: (tavernId: string, eventId: string) =>
    request<{ prompt: string }>('POST', `/api/taverns/${tavernId}/images/preview`, { eventId }),
  retryImage: (tavernId: string, imageId: string) =>
    request<{ ok: true }>('POST', `/api/taverns/${tavernId}/images/${imageId}/retry`),
  /** Admin only: delete a post from the tavern's feed (a character's post is only hidden from this tavern). */
  deleteFeedPost: (tavernId: string, eventId: string) =>
    request<{ ok: true }>('DELETE', `/api/taverns/${tavernId}/feed/${eventId}`),
  deleteImage: (tavernId: string, imageId: string) =>
    request<{ ok: true }>('DELETE', `/api/taverns/${tavernId}/images/${imageId}`),
  characterDetails: (tavernId: string, characterId: string) =>
    request<CharacterDetails>('GET', `/api/taverns/${tavernId}/characters/${characterId}`),
  /** Details for anyone on the global leaderboard: recent posts from every tavern you share with them. */
  leaderboardCharacterDetails: (characterId: string) =>
    request<CharacterDetails>('GET', `/api/leaderboard/characters/${characterId}`),
  dungeonRuns: (tavernId: string) => request<DungeonRun[]>('GET', `/api/taverns/${tavernId}/runs`),
  logDungeonRun: (tavernId: string, run: NewDungeonRun) =>
    request<DungeonRun>('POST', `/api/taverns/${tavernId}/runs`, run),
  editDungeonRun: (tavernId: string, runId: string, run: NewDungeonRun) =>
    request<DungeonRun>('PATCH', `/api/taverns/${tavernId}/runs/${runId}`, run),
  deleteDungeonRun: (tavernId: string, runId: string) =>
    request<{ ok: true }>('DELETE', `/api/taverns/${tavernId}/runs/${runId}`),
  tavernLeaderboard: (id: string) => request<LeaderboardEntry[]>('GET', `/api/taverns/${id}/leaderboard`),
  leaderboard: () => request<LeaderboardEntry[]>('GET', '/api/leaderboard'),
  auctionStatus: () => request<AuctionStatus>('GET', '/api/auction-prices'),
  /** Tavern admins: fetch auction prices now and get back what happened. */
  refreshAuctionPrices: () => request<AuctionStatus>('POST', '/api/auction-prices/refresh'),
  refreshTavern: (id: string) => request<TavernDetail>('POST', `/api/taverns/${id}/refresh`),
  addToTavern: (tavernId: string, characterId: string) =>
    request<{ ok: true }>('PUT', `/api/taverns/${tavernId}/characters/${characterId}`),
  removeFromTavern: (tavernId: string, characterId: string) =>
    request<{ ok: true }>('DELETE', `/api/taverns/${tavernId}/characters/${characterId}`),
  /** Admin only: the IRL name this tavern shows for a character (`null` goes back to the owner's display name). */
  setIrlName: (tavernId: string, characterId: string, irlName: string | null) =>
    request<TavernDetail>('PATCH', `/api/taverns/${tavernId}/characters/${characterId}`, { irlName }),
  /** Owner only: make a member a tavern admin, or take it away. */
  setMemberAdmin: (tavernId: string, userId: string, admin: boolean) =>
    request<TavernDetail>('PUT', `/api/taverns/${tavernId}/members/${userId}/admin`, { admin }),

  invite: (code: string) => request<InvitePreview>('GET', `/api/invites/${encodeURIComponent(code)}`),
  joinInvite: (code: string) => request<{ tavernId: string }>('POST', `/api/invites/${encodeURIComponent(code)}/join`),
};
