import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, ApiError, type Character, type NewDungeonRun, type Role } from './client';

export const keys = {
  me: ['me'] as const,
  characters: ['characters'] as const,
  taverns: ['taverns'] as const,
  tavern: (id: string) => ['taverns', id] as const,
  // Nested under the tavern key, so invalidating a tavern refetches its feed too.
  feed: (id: string) => ['taverns', id, 'feed'] as const,
  // Nested under the tavern key too, so a tavern refresh updates an open details pane.
  characterDetails: (tavernId: string, characterId: string) => ['taverns', tavernId, 'characters', characterId] as const,
  // Nested under the tavern key, so a tavern refresh re-ranks it.
  tavernLeaderboard: (id: string) => ['taverns', id, 'leaderboard'] as const,
  // Under `taverns` too: joining, leaving or a refresh changes who's on it.
  leaderboard: ['taverns', 'leaderboard'] as const,
  // Under the global leaderboard, so anything that refetches it updates an open details pane too.
  leaderboardCharacterDetails: (characterId: string) => ['taverns', 'leaderboard', 'characters', characterId] as const,
  // Nested under the tavern key, so a tavern refresh refetches it too.
  dungeonRuns: (id: string) => ['taverns', id, 'runs'] as const,
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

/** A character's details pane data, as seen from a tavern, or (no id) from the global leaderboard. */
export function useCharacterDetails(tavernId: string | undefined, characterId: string) {
  return useQuery({
    queryKey: tavernId ? keys.characterDetails(tavernId, characterId) : keys.leaderboardCharacterDetails(characterId),
    queryFn: () =>
      tavernId ? api.characterDetails(tavernId, characterId) : api.leaderboardCharacterDetails(characterId),
  });
}

/** A tavern's leaderboard, or (no id) everyone in your taverns plus your own characters. */
export function useLeaderboard(tavernId?: string) {
  return useQuery({
    queryKey: tavernId ? keys.tavernLeaderboard(tavernId) : keys.leaderboard,
    queryFn: () => (tavernId ? api.tavernLeaderboard(tavernId) : api.leaderboard()),
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

/** Apply a change to one character inside any cached tavern or character-details data. */
function withCharacter(data: unknown, characterId: string, change: (c: Character) => Character): unknown {
  if (!data || typeof data !== 'object') return data;
  const d = data as { id?: unknown; ownerId?: unknown; characters?: unknown };
  if (Array.isArray(d.characters)) {
    return { ...d, characters: d.characters.map((c: Character) => (c.id === characterId ? change(c) : c)) };
  }
  if (d.id === characterId && 'ownerId' in d) return change(d as Character);
  return data;
}

/** Apply a change to one character in every cached view of it (My characters, taverns, details panes). */
function updateCachedCharacter(qc: QueryClient, characterId: string, change: (c: Character) => Character) {
  qc.setQueryData<Character[]>(keys.characters, (list) => list?.map((c) => (c.id === characterId ? change(c) : c)));
  qc.setQueriesData({ queryKey: keys.taverns }, (data) => withCharacter(data, characterId, change));
}

function refetchCharacters(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: keys.characters }),
    qc.invalidateQueries({ queryKey: keys.taverns }),
  ]);
}

/** Set a character's roles (owner only), updating every cached view of it straight away. */
export function useSetRoles(characterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roles: Role[]) => api.setCharacterRoles(characterId, roles),
    onMutate: (roles) => updateCachedCharacter(qc, characterId, (c) => ({ ...c, roles })),
    // Refetch either way, which also undoes the optimistic change if the save failed.
    onSettled: () => refetchCharacters(qc),
  });
}

/** Tick a dungeon off in a character's dungeon log, or untick it (owner only), updating every cached view. */
export function useSetDungeonCompleted(characterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dungeon, completed }: { dungeon: string; completed: boolean }) =>
      api.setDungeonCompleted(characterId, dungeon, completed),
    onMutate: ({ dungeon, completed }) =>
      updateCachedCharacter(qc, characterId, (c) => {
        const log = { ...c.dungeonsCompleted };
        if (completed) log[dungeon] ??= new Date().toISOString();
        else delete log[dungeon];
        return { ...c, dungeonsCompleted: log };
      }),
    onSettled: () => refetchCharacters(qc),
  });
}

/** A tavern's logged dungeon runs, newest first. */
export function useDungeonRuns(tavernId: string) {
  return useQuery({ queryKey: keys.dungeonRuns(tavernId), queryFn: () => api.dungeonRuns(tavernId) });
}

/** Log or delete a run. Either changes the run list, the feed and (for a clear) everyone's dungeon log. */
export function useDungeonRunMutations(tavernId: string) {
  const qc = useQueryClient();
  const refetch = () => refetchCharacters(qc);
  return {
    log: useMutation({ mutationFn: (run: NewDungeonRun) => api.logDungeonRun(tavernId, run), onSuccess: refetch }),
    remove: useMutation({ mutationFn: (runId: string) => api.deleteDungeonRun(tavernId, runId), onSuccess: refetch }),
  };
}
