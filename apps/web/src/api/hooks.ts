import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, ApiError } from './client';

export const keys = {
  me: ['me'] as const,
  characters: ['characters'] as const,
  taverns: ['taverns'] as const,
  tavern: (id: string) => ['taverns', id] as const,
  // Nested under the tavern key, so invalidating a tavern refetches its feed too.
  feed: (id: string) => ['taverns', id, 'feed'] as const,
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

export function useTavernFeed(id: string) {
  return useInfiniteQuery({
    queryKey: keys.feed(id),
    queryFn: ({ pageParam }) => api.tavernFeed(id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}
