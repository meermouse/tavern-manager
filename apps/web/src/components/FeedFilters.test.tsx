import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TavernCharacter } from '../api/client';
import { FeedFilterBar, isFiltering, toFeedFilters, useFeedFilters, type FeedFilterState } from './FeedFilters';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const none: FeedFilterState = { types: [], characterIds: [], mine: false, search: '' };

function character(id: string, name: string, ownerId: string): TavernCharacter {
  return {
    id, name, surname: 'X', ownerId, ownerName: ownerId === 'me' ? 'Me' : 'Bob', class: 'Mage', race: 'Gnome', level: 10,
  } as TavernCharacter;
}
const roster = [character('a', 'Judy', 'me'), character('b', 'Grim', 'bob'), character('c', 'Abel', 'me')];

describe('toFeedFilters', () => {
  it('sends nothing when nothing is set', () => {
    expect(toFeedFilters(none)).toEqual({ kinds: undefined, characterIds: undefined, mine: undefined, search: undefined });
    expect(isFiltering(none)).toBe(false);
    expect(isFiltering({ ...none, search: '   ' })).toBe(false);
  });

  it('expands post types into kinds and tidies the rest', () => {
    expect(toFeedFilters({ types: ['dungeons', 'loot'], characterIds: ['b', 'a'], mine: true, search: ' wailing ' })).toEqual({
      kinds: ['loot', 'dungeon_run', 'dungeon_cleared'],
      characterIds: ['a', 'b'],
      mine: true,
      search: 'wailing',
    });
  });
});

function Harness({ initial = none, viewerId = 'me' }: { initial?: FeedFilterState; viewerId?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <FeedFilterBar value={value} onChange={setValue} characters={roster} viewerId={viewerId} />
      <output data-testid="state">{JSON.stringify(value)}</output>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId('state').textContent!) as FeedFilterState;

describe('FeedFilterBar', () => {
  it('toggles post types and clears everything', () => {
    render(<Harness />);
    const loot = screen.getByRole('button', { name: /Loot/ });
    fireEvent.click(loot);
    fireEvent.click(screen.getByRole('button', { name: /Dungeons/ }));
    expect(state().types).toEqual(['loot', 'dungeons']);
    expect(loot.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(loot);
    expect(state().types).toEqual(['dungeons']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(state()).toEqual(none);
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('picks characters, sorted by name', () => {
    render(<Harness />);
    expect(screen.getByText('All characters')).toBeTruthy();
    const names = screen.getAllByRole('checkbox').map((b) => b.closest('label')!.querySelector('.class-mage')?.textContent);
    expect(names).toEqual(['Abel X', 'Grim X', 'Judy X', undefined]);
    fireEvent.click(screen.getByRole('checkbox', { name: /Grim/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Judy/ }));
    expect(state().characterIds).toEqual(['b', 'a']);
    expect(screen.getByText('Grim, Judy')).toBeTruthy();
  });

  it('"Just my characters" narrows the picker and drops other people’s characters', () => {
    render(<Harness initial={{ ...none, characterIds: ['a', 'b'] }} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Just my characters' }));
    expect(state()).toMatchObject({ mine: true, characterIds: ['a'] });
    expect(screen.queryByRole('checkbox', { name: /Grim/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Abel/ })).toBeTruthy();
  });

  it('waits for typing to pause before searching', () => {
    vi.useFakeTimers();
    render(<Harness />);
    const box = screen.getByRole('searchbox', { name: 'Search posts' });
    fireEvent.change(box, { target: { value: 'dead' } });
    fireEvent.change(box, { target: { value: 'deadmines' } });
    expect(state().search).toBe('');
    act(() => vi.advanceTimersByTime(300));
    expect(state().search).toBe('deadmines');
  });
});

describe('useFeedFilters', () => {
  function UrlHarness() {
    const [value, set] = useFeedFilters();
    const location = useLocation();
    return (
      <>
        <output data-testid="value">{JSON.stringify(value)}</output>
        <output data-testid="search">{location.search}</output>
        <button onClick={() => set({ types: ['loot'], characterIds: ['a', 'b'], mine: true, search: 'epic' })}>set</button>
        <button onClick={() => set(none)}>clear</button>
      </>
    );
  }

  it('reads and writes the URL, leaving other parameters alone', () => {
    render(
      <MemoryRouter initialEntries={['/taverns/1?character=z&types=dungeons,bogus&q=rfc']}>
        <UrlHarness />
      </MemoryRouter>,
    );
    expect(JSON.parse(screen.getByTestId('value').textContent!)).toEqual({
      types: ['dungeons'], characterIds: [], mine: false, search: 'rfc',
    });
    fireEvent.click(screen.getByText('set'));
    const params = new URLSearchParams(screen.getByTestId('search').textContent!);
    expect(Object.fromEntries(params)).toEqual({ character: 'z', types: 'loot', chars: 'a,b', mine: '1', q: 'epic' });
    fireEvent.click(screen.getByText('clear'));
    expect(screen.getByTestId('search').textContent).toBe('?character=z');
  });
});
