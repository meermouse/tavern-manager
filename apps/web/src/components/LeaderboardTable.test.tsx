import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeaderboardEntry } from '../api/client';
import { LeaderboardTable } from './LeaderboardTable';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

function entry(over: Partial<LeaderboardEntry>): LeaderboardEntry {
  return {
    id: crypto.randomUUID(), region: 'eu', name: 'Name', surname: 'Surname', ruleset: 'Normal', class: 'Warrior',
    race: 'Human', level: 10, status: 'ok', syncError: null, lastSyncedAt: null, ownerId: 'u1', ownerName: 'Alice',
    gearItemLevel: null, gearQualities: null, achievementsEarned: 0, notableItems: 0, cheers: 0, cheersGiven: 0, feedPosts: 0,
    statistics: null, characterStats: null, statisticsSyncedAt: null,
    ...over,
  };
}

const data = [
  entry({ name: 'Judgement', surname: 'Judy', gearItemLevel: 400, statistics: { 'Total deaths': 3 } }),
  entry({ name: 'Grimble', surname: 'Thornwick', ownerId: 'u2', ownerName: 'Bob', gearItemLevel: 520, statistics: { 'Total deaths': 12 } }),
  entry({ name: 'Pendingly', surname: 'Lowbie', ownerId: 'u2', ownerName: 'Bob' }),
];

const names = () =>
  within(screen.getAllByRole('rowgroup')[1])
    .getAllByRole('row')
    .map((r) => r.querySelector('strong')?.textContent);

describe('LeaderboardTable', () => {
  it('ranks by total gear item level by default, with medals', () => {
    render(<LeaderboardTable entries={data} emptyText="none" />);
    expect(screen.getByRole('combobox', { name: 'Rank by' })).toHaveProperty('value', 'gear-ilvl');
    expect(screen.getByRole('columnheader', { name: 'Total gear item level' })).toBeTruthy();
    expect(names()).toEqual(['Grimble Thornwick', 'Judgement Judy', 'Pendingly Lowbie']);
    expect(screen.getByTitle('#1').textContent).toBe('🥇');
  });

  it('re-ranks when another stat is picked, and remembers it', () => {
    render(<LeaderboardTable entries={data} emptyText="none" />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Rank by' }), { target: { value: 'deaths' } });
    expect(screen.getByRole('columnheader', { name: 'Total deaths' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Highest first/ }));
    expect(names()).toEqual(['Judgement Judy', 'Grimble Thornwick', 'Pendingly Lowbie']);
    expect(localStorage.getItem('leaderboard.metric')).toBe('deaths');
  });

  it('can show one character per player', () => {
    render(<LeaderboardTable entries={data} emptyText="none" />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Best character per player/ }));
    expect(names()).toEqual(['Grimble Thornwick', 'Judgement Judy']);
  });

  it('selects a character when its row is clicked, and deselects on a second click', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<LeaderboardTable entries={data} emptyText="none" onSelect={onSelect} />);
    const row = screen.getByText('Grimble Thornwick').closest('tr')!;
    fireEvent.click(row);
    expect(onSelect).toHaveBeenLastCalledWith(data[1]);
    rerender(<LeaderboardTable entries={data} emptyText="none" selectedId={data[1].id} onSelect={onSelect} />);
    const selected = screen.getByText('Grimble Thornwick').closest('tr')!;
    expect(selected.getAttribute('aria-selected')).toBe('true');
    expect(selected.className).toContain('podium-1');
    fireEvent.keyDown(selected, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
