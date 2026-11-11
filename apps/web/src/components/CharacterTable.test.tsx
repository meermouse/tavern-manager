import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { TavernCharacter } from '../api/client';
import { parseInviteCode } from '../pages/TavernsPage';
import { CharacterTable } from './CharacterTable';

afterEach(cleanup);

function char(over: Partial<TavernCharacter>): TavernCharacter {
  return {
    id: crypto.randomUUID(),
    region: 'eu',
    name: 'Name',
    surname: 'Surname',
    ruleset: 'Normal',
    class: 'Warrior',
    race: 'Human',
    level: 10,
    zone: null,
    zoneSource: null,
    zoneUpdatedAt: null,
    status: 'ok',
    syncError: null,
    lastSyncedAt: null,
    ownerId: 'u1',
    ownerName: 'Alice',
    ...over,
  };
}

const data = [
  char({ name: 'Judgement', surname: 'Judy', class: 'Paladin', level: 42, ownerName: 'Alice' }),
  char({ name: 'Grimble', surname: 'Thornwick', class: 'Mage', race: 'Gnome', level: 18, ownerName: 'Bob', ruleset: 'PvP' }),
  char({ name: 'Pendingly', surname: 'Lowbie', class: null, race: null, level: null, status: 'pending', ownerName: 'Bob' }),
];

const names = () =>
  within(screen.getAllByRole('rowgroup')[1])
    .getAllByRole('row')
    .map((r) => within(r).getAllByRole('cell')[0].textContent);

describe('CharacterTable', () => {
  it('renders all columns and sorts by level descending, pending last', () => {
    render(<CharacterTable characters={data} />);
    for (const h of ['Character', 'Ruleset', 'IRL name', 'Class', 'Race', 'Level']) {
      expect(screen.getByRole('button', { name: new RegExp(h) })).toBeTruthy();
    }
    expect(names()).toEqual(['Judgement Judy', 'Grimble Thornwick', 'Pendingly Lowbie']);
    expect(screen.getByText('pending')).toBeTruthy();
  });

  it('sorts when a header is clicked', () => {
    render(<CharacterTable characters={data} />);
    fireEvent.click(screen.getByRole('button', { name: /Character/ }));
    expect(names()).toEqual(['Grimble Thornwick', 'Judgement Judy', 'Pendingly Lowbie']);
  });

  it('filters by search, class and level', () => {
    render(<CharacterTable characters={data} />);
    fireEvent.change(screen.getByLabelText('Search characters'), { target: { value: 'bob' } });
    expect(names()).toEqual(['Grimble Thornwick', 'Pendingly Lowbie']);

    fireEvent.change(screen.getByLabelText('Filter by class'), { target: { value: 'Mage' } });
    expect(names()).toEqual(['Grimble Thornwick']);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.change(screen.getByLabelText('Minimum level'), { target: { value: '20' } });
    expect(names()).toEqual(['Judgement Judy']);
  });
});

describe('parseInviteCode', () => {
  it('accepts codes and links', () => {
    expect(parseInviteCode(' abcd2345 ')).toBe('ABCD2345');
    expect(parseInviteCode('https://x.netlify.app/join/ABCD2345')).toBe('ABCD2345');
  });
});
