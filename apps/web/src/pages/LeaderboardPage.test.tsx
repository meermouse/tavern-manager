import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterDetails, LeaderboardEntry } from '../api/client';
import { keys } from '../api/hooks';
import { LeaderboardPage } from './LeaderboardPage';

const grim: LeaderboardEntry = {
  id: 'c1', region: 'eu', name: 'Grimble', surname: 'Thornwick', ruleset: 'Normal', class: 'Warrior', race: 'Orc',
  level: 20, status: 'ok', syncError: null, lastSyncedAt: null, ownerId: 'u2', ownerName: 'Bob',
  gearItemLevel: 300, gearQualities: null, achievementsEarned: 0, notableItems: 0, cheers: 0, cheersGiven: 0,
  feedPosts: 0, statistics: null, characterStats: null, statisticsSyncedAt: null,
};

let location = '';
function Where() {
  location = useLocation().search;
  return null;
}

beforeEach(() => vi.stubGlobal('fetch', vi.fn(async () => new Response('{}'))));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('LeaderboardPage', () => {
  it('opens the character details pane when a row is clicked', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(keys.leaderboard, [grim]);
    qc.setQueryData(keys.me, null);
    qc.setQueryData<CharacterDetails>(keys.leaderboardCharacterDetails(grim.id), {
      ...grim, equipment: [], equipmentSyncedAt: null, recent: [],
    });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/leaderboard']}>
          <LeaderboardPage />
          <Where />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.queryByRole('heading', { name: 'Grimble Thornwick' })).toBeNull();
    fireEvent.click(screen.getByText('Grimble Thornwick').closest('tr')!);
    expect(screen.getByRole('heading', { name: 'Grimble Thornwick' })).toBeTruthy();
    expect(location).toBe('?character=c1');

    fireEvent.click(screen.getByRole('button', { name: 'Close character details' }));
    expect(screen.queryByRole('heading', { name: 'Grimble Thornwick' })).toBeNull();
  });
});
