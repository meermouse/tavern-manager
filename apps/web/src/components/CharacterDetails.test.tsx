import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
      gearItemLevel: 57,
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
    expect(screen.getByText('Total item level')).toBeTruthy();
    expect(screen.queryByText('Item level')).toBeNull();
    expect(screen.getByText(/reached level/)).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close character details' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('values each item at its auction price, or its vendor price when it isn’t listed', async () => {
    const details: Details = {
      ...judy,
      equipment: [
        { id: 9, name: 'Hearthfire Greatblade', quality: 'EPIC', slot: 'Main Hand', itemLevel: 57, auctionPrice: null, auctionListings: 0, sellPrice: 31_250, value: 31_250 },
        { id: 10, name: 'Bracers of the Bar Brawl', quality: 'UNCOMMON', slot: 'Wrists', itemLevel: 17, auctionPrice: 45_000, auctionListings: 6, sellPrice: 900, value: 45_000 },
        { id: 11, name: 'Plain Shirt', quality: 'COMMON', slot: 'Shirt', itemLevel: 1, auctionPrice: null, auctionListings: 0, value: null },
      ],
      gearValue: 76_250,
      equipmentSyncedAt: '2026-11-12T09:00:00Z',
      recent: [],
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(details))));
    renderWithQuery(<CharacterDetails tavernId="t1" character={judy} onClose={() => {}} />);

    const table = (await screen.findByText('Hearthfire Greatblade')).closest('table')!;
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Item', 'iLvl', 'Value']);
    const cells = (name: string) =>
      within(screen.getByText(name).closest('tr')!).getAllByRole('cell').map((c) => c.textContent);
    expect(cells('Hearthfire Greatblade')).toEqual(['Hearthfire GreatbladeMain Hand', '57', '3g 12s']);
    expect(cells('Bracers of the Bar Brawl')).toEqual(['Bracers of the Bar BrawlWrists', '17', '4g 50s AH']);
    expect(cells('Plain Shirt')).toEqual(['Plain ShirtShirt', '1', '—']);
    expect(screen.getByTitle('Going auction house price, from 6 listings across the region')).toBeTruthy();
    expect(screen.getByTitle(/^Vendor price: it isn’t on the auction house/)).toBeTruthy();
    const total = screen.getByRole('rowheader', { name: 'Gear value' }).closest('tr')!;
    expect(total.textContent).toContain('7g 62s');
  });

  it('gives tavern admins tools to change the IRL name or remove the character', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url === '/api/taverns/t1') return new Response(JSON.stringify({ id: 't1', isAdmin: true, characters: [] }));
      if (url === '/api/me') return new Response(JSON.stringify({ id: 'u9' }));
      return new Response(JSON.stringify({ ...judy, equipment: [], equipmentSyncedAt: null, recent: [] }));
    }));
    vi.stubGlobal('confirm', () => true);
    const onClose = vi.fn();
    renderWithQuery(<CharacterDetails tavernId="t1" character={{ ...judy, irlNameOverridden: true }} onClose={onClose} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Change IRL name' }));
    const input = screen.getByRole('textbox', { name: 'IRL name for Judgement Judy' }) as HTMLInputElement;
    expect(input.value).toBe('Alice');
    // Esc cancels the edit without closing the pane.
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: /IRL name/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Change IRL name' }));
    fireEvent.change(screen.getByRole('textbox', { name: /IRL name/ }), { target: { value: ' Ally ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls.some(([, init]) => init?.method === 'PATCH')).toBe(true));
    const patch = calls.find(([, init]) => init?.method === 'PATCH')!;
    expect(patch[0]).toBe('/api/taverns/t1/characters/c1');
    expect(JSON.parse(String(patch[1]!.body))).toEqual({ irlName: 'Ally' });

    fireEvent.click(screen.getByRole('button', { name: 'Reset IRL name' }));
    await waitFor(() => expect(calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(2));
    expect(JSON.parse(String(calls.filter(([, init]) => init?.method === 'PATCH')[1][1]!.body))).toEqual({ irlName: null });

    fireEvent.click(screen.getByRole('button', { name: 'Remove from tavern' }));
    await waitFor(() =>
      expect(calls).toContainEqual(['/api/taverns/t1/characters/c1', expect.objectContaining({ method: 'DELETE' })]),
    );
  });

  it('hides the admin tools from other members', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      new Response(JSON.stringify(url === '/api/taverns/t1' ? { id: 't1', isAdmin: false } : { ...judy, recent: [] })),
    ));
    renderWithQuery(<CharacterDetails tavernId="t1" character={judy} onClose={() => {}} />);
    await screen.findByText('Nothing yet.');
    expect(screen.queryByRole('button', { name: 'Change IRL name' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove from tavern' })).toBeNull();
  });

  it('falls back from the full render to the headshot when the render is missing', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    renderWithQuery(<CharacterDetails tavernId="t1" character={judy} onClose={() => {}} />);
    const img = screen.getByAltText(/Judgement Judy/);
    fireEvent.error(img);
    expect(screen.getByAltText(/Judgement Judy/).getAttribute('src')).toBe(judy.avatarUrl);
  });

  it("lets the owner set roles from the pane, even when none are set yet", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    let saved: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url === '/api/me') return new Response(JSON.stringify({ id: 'u1', battletag: 'Alice#1', displayName: 'Alice', canImport: true }));
      if (init?.method === 'PATCH') saved = JSON.parse(String(init.body)).roles;
      return new Response(JSON.stringify({ ...judy, roles: saved, equipment: [], gearItemLevel: 0, equipmentSyncedAt: null, recent: [] }));
    }));
    renderWithQuery(<CharacterDetails tavernId="t1" character={judy} onClose={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Healer' }));
    await waitFor(() =>
      expect(calls.find(([, init]) => init?.method === 'PATCH')).toEqual([
        '/api/characters/c1',
        expect.objectContaining({ body: JSON.stringify({ roles: ['healer'] }) }),
      ]),
    );
    expect(screen.getByRole('button', { name: 'Healer' }).getAttribute('aria-pressed')).toBe('true');
  });

  it("only shows other players' roles, without the toggles", async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      new Response(JSON.stringify(url === '/api/me'
        ? { id: 'someone-else', battletag: 'Bob#1', displayName: 'Bob', canImport: true }
        : { ...judy, roles: ['tank'], equipment: [], equipmentSyncedAt: null, recent: [] })),
    ));
    renderWithQuery(<CharacterDetails tavernId="t1" character={judy} onClose={() => {}} />);
    expect(await screen.findByRole('listitem', { name: 'Tank' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tank' })).toBeNull();
  });
});
