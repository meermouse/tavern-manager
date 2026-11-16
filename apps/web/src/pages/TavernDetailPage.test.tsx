import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TavernDetail } from '../api/client';
import { keys } from '../api/hooks';
import { TavernDetailPage } from './TavernDetailPage';

const tavern: TavernDetail = {
  id: 't1',
  name: 'The Prancing Pony',
  inviteCode: 'abc',
  isOwner: true,
  createdAt: '2026-01-01T00:00:00Z',
  members: [],
  characters: [],
  titles: [],
};

let location = '';
function Where() {
  const loc = useLocation();
  location = loc.pathname + loc.search;
  return null;
}

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(keys.tavern('t1'), tavern);
  qc.setQueryData(keys.me, null);
  qc.setQueryData(keys.characters, []);
  qc.setQueryData(keys.feed('t1'), { pages: [{ events: [], nextCursor: null }], pageParams: [null] });
  qc.setQueryData(keys.dungeonRuns('t1'), []);
  qc.setQueryData(keys.tavernLeaderboard('t1'), []);
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/taverns/:id/:view?/:sub?" element={<><TavernDetailPage /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const pressed = (name: string | RegExp) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

beforeEach(() => vi.stubGlobal('fetch', vi.fn(async () => new Response('[]'))));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('TavernDetailPage routing', () => {
  it('opens on the feed by default', () => {
    renderAt('/taverns/t1');
    expect(pressed('Feed')).toBe('true');
  });

  it('restores the tab and dungeon sub-tab from the URL', () => {
    renderAt('/taverns/t1/dungeons/runs');
    expect(pressed('Dungeons')).toBe('true');
    expect(pressed(/^Runs/)).toBe('true');
  });

  it('puts tab changes in the URL', () => {
    renderAt('/taverns/t1');
    fireEvent.click(screen.getByRole('button', { name: 'Leaderboard' }));
    expect(location).toBe('/taverns/t1/leaderboard');
    fireEvent.click(screen.getByRole('button', { name: 'Dungeons' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bosses' }));
    expect(location).toBe('/taverns/t1/dungeons/bosses');
    fireEvent.click(screen.getByRole('button', { name: 'Feed' }));
    expect(location).toBe('/taverns/t1');
  });

  it('falls back to the feed for an unknown tab', () => {
    renderAt('/taverns/t1/nonsense');
    expect(location).toBe('/taverns/t1');
    expect(pressed('Feed')).toBe('true');
  });
});
