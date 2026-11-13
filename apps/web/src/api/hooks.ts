import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Character, type Role } from './client';

export const keys = {
  me: ['me'] as const,
  characters: ['characters'] as const,
  taverns: ['taverns'] as const,
  tavern: (id: string) => ['taverns', id] as const,
  // Nested under the tavern key, so invalidating a tavern refetches its feed too.
  feed: (id: string) => ['taverns', id, 'feed'] as const,
  // Nested under the tavern key too, so a tavern refresh updates an open details pane.
  characterDetails: (tavernId: string, characterId: string) => ['taverns', tavernId, 'characters', characterId] as const,
  invite: (code: string) => ['invite', code] as const,
};

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api.me();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

export function useCharacters() {
  return useQuery({ queryKey: keys.characters, queryFn: api.characters });
}

export function useTaverns() {
  return useQuery({ queryKey: keys.taverns, queryFn: api.taverns });
}

export function useTavern(id: string) {
  return useQuery({ queryKey: keys.tavern(id), queryFn: () => api.tavern(id) });
}

export function useCharacterDetails(tavernId: string, characterId: string) {
  return useQuery({
    queryKey: keys.characterDetails(tavernId, characterId),
    queryFn: () => api.characterDetails(tavernId, characterId),
  });
}

export function useTavernFeed(id: string) {
  return useInfiniteQuery({
    queryKey: keys.feed(id),
    queryFn: ({ pageParam }) => api.tavernFeed(id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Swap in new roles for one character inside any cached tavern or character-details data. */
function withRoles(data: unknown, characterId: string, roles: Role[]): unknown {
  if (!data || typeof data !== 'object') return data;
  const d = data as { id?: unknown; ownerId?: unknown; characters?: unknown };
  if (Array.isArray(d.characters)) {
    return { ...d, characters: d.characters.map((c: Character) => (c.id === characterId ? { ...c, roles } : c)) };
  }
  if (d.id === characterId && 'ownerId' in d) return { ...d, roles };
  return data;
}

/** Set a character's roles (owner only), updating every cached view of it straight away. */
export function useSetRoles(characterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roles: Role[]) => api.setCharacterRoles(characterId, roles),
    onMutate: (roles) => {
      qc.setQueryData<Character[]>(keys.characters, (list) =>
        list?.map((c) => (c.id === characterId ? { ...c, roles } : c)),
      );
      qc.setQueriesData({ queryKey: keys.taverns }, (data) => withRoles(data, characterId, roles));
    },
    // Refetch either way, which also undoes the optimistic change if the save failed.
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.characters }),
        qc.invalidateQueries({ queryKey: keys.taverns }),
      ]),
  });
}
