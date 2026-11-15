import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Character } from '../api/client';
import { keys } from '../api/hooks';
import { dungeons } from '../dungeons';
import { DungeonLog, completedCount } from './DungeonLog';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const judy: Character = {
  id: 'c1', region: 'eu', name: 'Judgement', surname: 'Judy', ruleset: 'Normal', class: 'Paladin', race: 'Human',
  level: 30, status: 'ok', syncError: null, lastSyncedAt: null,
  dungeonsCompleted: { 'The Deadmines': '2026-11-01T12:00:00Z', 'Not A Dungeon': '2026-11-01T12:00:00Z' },
};

describe('completedCount', () => {
  it('counts only listed dungeons', () => {
    expect(completedCount(judy)).toBe(1);
    expect(completedCount({})).toBe(0);
  });
});

describe('DungeonLog', () => {
  it('lists every dungeon, ticks the logged ones, and saves a tick', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({ ...judy, dungeonsCompleted: { ...judy.dungeonsCompleted, [body.dungeon]: '2026-11-15T00:00:00Z' } }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const qc = new QueryClient();
    qc.setQueryData(keys.characters, [judy]);
    render(
      <QueryClientProvider client={qc}>
        <DungeonLog characters={[judy]} />
      </QueryClientProvider>,
    );

    expect(screen.getAllByRole('checkbox')).toHaveLength(dungeons.length);
    expect(screen.getByLabelText(`1 of ${dungeons.length} dungeons completed`)).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: /The Deadmines/ }) as HTMLInputElement).checked).toBe(true);

    const rfc = screen.getByRole('checkbox', { name: /Ragefire Chasm/ }) as HTMLInputElement;
    expect(rfc.checked).toBe(false);
    fireEvent.click(rfc);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/characters/c1/dungeons');
    expect(JSON.parse(String(init.body))).toEqual({ dungeon: 'Ragefire Chasm', completed: true });
    // The cached character updates straight away.
    expect(qc.getQueryData<Character[]>(keys.characters)![0].dungeonsCompleted).toHaveProperty('Ragefire Chasm');
  });
});
