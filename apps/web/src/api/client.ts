export type Region = 'us' | 'eu' | 'kr' | 'tw';
export type CharacterStatus = 'ok' | 'pending' | 'error';

export interface Me {
  id: string;
  battletag: string;
  displayName: string;
  canImport: boolean;
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
}

export interface TavernCharacter extends Character {
  ownerId: string;
  ownerName: string;
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
}

export type FeedKind = 'level_up' | 'loot' | 'achievement' | 'character_joined' | 'member_joined' | 'tavern_founded';

export interface FeedItem {
  id: number;
  name: string;
  quality: string;
  slot: string | null;
  itemLevel: number | null;
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
  character: Pick<Character, 'id' | 'name' | 'surname' | 'class' | 'race' | 'level'> | null;
  user: { id: string; displayName: string } | null;
  data: {
    from?: number;
    to?: number;
    items?: FeedItem[];
    achievements?: FeedAchievement[];
    tavernName?: string;
  };
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
  refreshTavern: (id: string) => request<TavernDetail>('POST', `/api/taverns/${id}/refresh`),
  addToTavern: (tavernId: string, characterId: string) =>
    request<{ ok: true }>('PUT', `/api/taverns/${tavernId}/characters/${characterId}`),
  removeFromTavern: (tavernId: string, characterId: string) =>
    request<{ ok: true }>('DELETE', `/api/taverns/${tavernId}/characters/${characterId}`),

  invite: (code: string) => request<InvitePreview>('GET', `/api/invites/${encodeURIComponent(code)}`),
  joinInvite: (code: string) => request<{ tavernId: string }>('POST', `/api/invites/${encodeURIComponent(code)}/join`),
};
