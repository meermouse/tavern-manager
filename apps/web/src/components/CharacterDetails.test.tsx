import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CharacterDetails as Details, TavernCharacter } from '../api/client';
import { CharacterAvatar } from './CharacterAvatar';
import { CharacterDetails, sortGear } from './CharacterDetails';
import { CharacterTable } from './CharacterTable';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const judy: TavernCharacter = {
  id: 'c1',
  region: 'eu',
  name: 'Judgement',
  surname: 'Judy',
  ruleset: 'PvP',
  class: 'Paladin',
  race: 'Human',
  level: 42,
  status: 'ok',
  syncError: null,
  lastSyncedAt: '2026-11-12T09:00:00Z',
  ownerId: 'u1',
  ownerName: 'Alice',
  avatarUrl: 'https://render.example/avatar.jpg',
  renderUrl: 'https://render.example/main-raw.png',
};

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('CharacterAvatar', () => {
  it('shows the Blizzard headshot, falling back to the initial if it fails to load', () => {
    const { container } = render(<CharacterAvatar character={judy} />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://render.example/avatar.jpg');
    expect(img.className).toContain('class-bg-paladin');
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('J');
  });

  it('uses the initial when there is no image yet', () => {
    const { container } = render(<CharacterAvatar character={{ name: 'grimble', class: null }} />);
    expect(container.textContent).toBe('G');
  });
});

describe('CharacterTable selection', () => {
  it('selects a row on click or Enter and deselects on a second click', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<CharacterTable characters={[judy]} onSelect={onSelect} />);
    const row = within(screen.getAllByRole('rowgroup')[1]).getAllByRole('row')[0];
    fireEvent.click(row);
    expect(onSelect).toHaveBeenLastCalledWith(judy);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(2);

    rerender(<CharacterTable characters={[judy]} onSelect={onSelect} selectedId="c1" />);
    const selected = within(screen.getAllByRole('rowgroup')[1]).getAllByRole('row')[0];
    expect(selected.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(selected);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});

describe('sortGear', () => {
  it('orders items like a paper doll', () => {
    const item = (slot: string | null) => ({ id: 1, name: slot ?? '?', quality: 'RARE', slot, itemLevel: null });
    expect(sortGear([item('Main Hand'), item(null), item('Feet'), item('Head'), item('Finger 2')]).map((i) => i.slot))
      .toEqual(['Head', 'Feet', 'Finger 2', 'Main Hand', null]);
  });
});

describe('CharacterDetails', () => {
  it('shows the render, profile details, gear and recent posts', async () => {
    const details: Details = {
      ...judy,
      guild: 'Last Orders',
      faction: 'Alliance',
      title: 'Judgement the Explorer',
      itemLevel: 44,
      achievementPoints: 40,
      equipment: [{ id: 9, name: 'Hearthfire Greatblade', quality: 'EPIC', slot: 'Main Hand', itemLevel: 57 }],
      equipmentSyncedAt: '2026-11-12T09:00:00Z',
      recent: [
        {
          id: '7',
          kind: 'level_up',
          createdAt: '2026-11-12T09:00:00Z',
          character: judy,
          user: { id: 'u1', displayName: 'Alice' },
          data: { from: 41, to: 42 },
          cheers: { count: 0, names: [], cheeredByMe: false },
        },
      ],
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(details)));
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();
    renderWithQuery(<CharacterDetails tavernId="t1" character={judy} onClose={onClose} />);

    // Table data renders straight away…
    expect(screen.getByRole('heading', { name: 'Judgement Judy' })).toBeTruthy();
    expect(screen.getByAltText(/Judgement Judy, Human Paladin/).getAttribute('src')).toBe(judy.renderUrl);
    // …then the details request fills in the rest.
    expect(await screen.findByText('Hearthfire Greatblade')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/taverns/t1/characters/c1', expect.anything());
    expect(screen.getByText('Judgement the Explorer')).toBeTruthy();
    expect(screen.getByText('<Last Orders>')).toBeTruthy();
    expect(screen.getByText('Alliance')).toBeTruthy();
    expect(screen.getByText(/reached level/)).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close character details' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('falls back from the full render to the headshot when the render is missing', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    renderWithQuery(<CharacterDetails tavernId="t1" character={judy} onClose={() => {}} />);
    const img = screen.getByAltText(/Judgement Judy/);
    fireEvent.error(img);
    expect(screen.getByAltText(/Judgement Judy/).getAttribute('src')).toBe(judy.avatarUrl);
  });
});
