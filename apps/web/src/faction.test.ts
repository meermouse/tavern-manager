import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { factionOf, matchesFaction, useFactionFilter } from './faction';

afterEach(() => localStorage.clear());

describe('factionOf', () => {
  it('uses the synced faction, falling back to race', () => {
    expect(factionOf({ faction: 'Horde', race: 'Human' })).toBe('Horde');
    expect(factionOf({ faction: null, race: 'Orc' })).toBe('Horde');
    expect(factionOf({ race: 'Night Elf' })).toBe('Alliance');
    expect(factionOf({ faction: null, race: null })).toBeNull();
  });
});

describe('matchesFaction', () => {
  it('shows everyone under both, and only known matches otherwise', () => {
    expect(matchesFaction({ race: null }, 'both')).toBe(true);
    expect(matchesFaction({ race: null }, 'horde')).toBe(false);
    expect(matchesFaction({ faction: 'Alliance', race: 'Human' }, 'alliance')).toBe(true);
    expect(matchesFaction({ faction: 'Alliance', race: 'Human' }, 'horde')).toBe(false);
  });
});

describe('useFactionFilter', () => {
  it('remembers the choice per tavern', () => {
    const a = renderHook(() => useFactionFilter('tavern-a'));
    expect(a.result.current[0]).toBe('both');
    act(() => a.result.current[1]('horde'));
    expect(a.result.current[0]).toBe('horde');
    a.unmount();

    expect(renderHook(() => useFactionFilter('tavern-a')).result.current[0]).toBe('horde');
    expect(renderHook(() => useFactionFilter('tavern-b')).result.current[0]).toBe('both');
  });

  it('follows the tavern id when it changes', () => {
    localStorage.setItem('tavern.factionFilter.tavern-b', 'alliance');
    const { result, rerender } = renderHook(({ id }) => useFactionFilter(id), { initialProps: { id: 'tavern-a' } });
    expect(result.current[0]).toBe('both');
    rerender({ id: 'tavern-b' });
    expect(result.current[0]).toBe('alliance');
  });
});
