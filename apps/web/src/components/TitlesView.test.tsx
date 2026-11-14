import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { TitleStandings } from '../api/client';
import { TitlesView } from './TitlesView';

afterEach(cleanup);

const title = (over: Partial<TitleStandings>): TitleStandings => ({
  key: 'k', name: 'Title', icon: '⭐', description: 'desc', subject: 'character', lowestWins: false, standings: [], ...over,
});
const player = (n: number) => ({ userId: `u${n}`, displayName: `Player ${n}` });

const titles: TitleStandings[] = [
  title({
    key: 'head-chef', name: 'Head Chef', icon: '🍳',
    standings: [
      { rank: 1, holder: true, score: 300, value: '300 Cooking', player: player(1), character: { id: 'c1', name: 'Judgement', surname: 'Judy' } },
      { rank: 2, holder: false, score: 120, value: '120 Cooking', player: player(2), character: { id: 'c2', name: 'Grimble', surname: 'Thornwick' } },
    ],
  }),
  title({
    key: 'altaholic', name: 'Altaholic', subject: 'player',
    standings: [{ rank: 1, holder: false, score: 1, value: '1 character', player: player(1), character: null }],
  }),
  title({ key: 'ninja', name: 'The Ninja' }),
];

function Harness() {
  const [key, setKey] = useState<string | null>(null);
  return <TitlesView titles={titles} selectedKey={key} onSelect={setKey} />;
}

describe('TitlesView', () => {
  it('shows each title with its holder, greying out unclaimed ones', () => {
    render(<Harness />);
    const chef = screen.getByRole('button', { name: /^Head Chef: Judgement/ });
    expect(chef.textContent).toContain('Judgement Judy');
    expect(chef.className).not.toContain('vacant');
    // Altaholic has a standing but nobody with an alt, so nobody holds it.
    expect(screen.getByRole('button', { name: /^Altaholic: unclaimed/ }).className).toContain('vacant');
    expect(screen.getByRole('button', { name: /^The Ninja: unclaimed/ }).className).toContain('vacant');
  });

  it('drops the standings down when a title is clicked, holder first', () => {
    render(<Harness />);
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Head Chef/ }));
    const rows = within(screen.getAllByRole('rowgroup')[1]).getAllByRole('row');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Judgement Judy'),
      expect.stringContaining('Grimble Thornwick'),
    ]);
    expect(rows[0].className).toBe('title-holder');
    expect(rows[1].textContent).toContain('2');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('lists players for player titles, and says so when nobody has data', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^Altaholic/ }));
    expect(screen.getByRole('columnheader', { name: 'Player' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Character' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^The Ninja/ }));
    expect(screen.getByText(/Nobody in the tavern has the data/)).toBeTruthy();
  });
});
