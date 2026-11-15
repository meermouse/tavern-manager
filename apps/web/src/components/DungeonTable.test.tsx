import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Character, Role } from '../api/client';
import { DungeonTable } from './DungeonTable';
import { countRoles } from './RoleIcons';

afterEach(cleanup);

function char(name: string, level: number | null, roles: Role[] = []): Character {
  return {
    id: name, region: 'eu', name, surname: 'Tester', ruleset: 'Normal', class: 'Warrior', race: 'Human',
    level, status: level == null ? 'pending' : 'ok', syncError: null, lastSyncedAt: null, roles,
  };
}

const row = (dungeon: string) => screen.getByText(dungeon).closest('tr')!;

describe('countRoles', () => {
  it('counts a character towards each of its roles', () => {
    expect(countRoles([{ roles: ['tank', 'damage'] }, { roles: ['damage'] }, { roles: [] }, {}])).toEqual({
      tank: 1, healer: 0, damage: 2,
    });
  });
});

describe('DungeonTable', () => {
  it('shows how many characters are eligible for each dungeon, and per role', () => {
    render(
      <DungeonTable characters={[char('Tanky', 14, ['tank']), char('Both', 15, ['healer', 'damage']), char('None', 16)]} showTotals />,
    );
    const cell = within(within(row('Ragefire Chasm')).getAllByRole('cell')[0]);
    expect(cell.getByText('3 eligible')).toBeTruthy();
    expect(cell.getByRole('listitem', { name: '1 tank' })).toBeTruthy();
    expect(cell.getByRole('listitem', { name: '1 healer' })).toBeTruthy();
    expect(cell.getByRole('listitem', { name: '1 damage dealer' })).toBeTruthy();

    expect(within(row('Ruins of Lordaeron')).getByText('2 eligible')).toBeTruthy();
    expect(within(row('Blackrock Depths')).getByText('0 eligible')).toBeTruthy();
  });

  it('leaves the totals out unless asked (e.g. your own dungeons page)', () => {
    render(<DungeonTable characters={[char('Tanky', 14, ['tank'])]} charactersLabel="Your characters" />);
    expect(screen.queryByText(/eligible/)).toBeNull();
    expect(screen.queryByRole('list', { name: 'Characters per role' })).toBeNull();
  });

  it("puts each character's roles before its name chip", () => {
    render(<DungeonTable characters={[char('Tanky', 14, ['tank', 'damage'])]} />);
    const line = within(row('Ragefire Chasm')).getByText('Tanky Tester').closest('li')!;
    const roles = line.querySelector('.dungeon-roles')!;
    expect(roles.nextElementSibling?.className).toBe('dungeon-character');
    expect([...roles.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label'))).toEqual(['Roles', 'Tank', 'Damage']);
  });

  it('leaves out the roles slot when nobody has a role', () => {
    const { container } = render(<DungeonTable characters={[char('Plain', 14)]} />);
    expect(container.querySelector('.dungeon-roles')).toBeNull();
  });

  it('marks characters who have logged the dungeon as completed', () => {
    const done = { ...char('Done', 14), dungeonsCompleted: { 'Ragefire Chasm': '2026-11-01T12:00:00Z' } };
    render(<DungeonTable characters={[done, char('Fresh', 14)]} />);
    const cells = within(row('Ragefire Chasm'));
    expect(within(cells.getByText('Done Tester').closest('li')!).getByText('✔ Done')).toBeTruthy();
    expect(within(cells.getByText('Fresh Tester').closest('li')!).queryByText('✔ Done')).toBeNull();
    // Only on that dungeon's row.
    expect(within(row('Hall of Thanes')).queryByText('✔ Done')).toBeNull();
  });
});
