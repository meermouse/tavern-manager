import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character, Role } from '../api/client';
import { DungeonTable } from './DungeonTable';
import { countRoles } from './RoleIcons';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

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

describe('Dungeon quest markers', () => {
  it('shows a ! for each quest, naming the quest and where its giver is', () => {
    render(<DungeonTable characters={[]} />);
    const list = within(row('The Deadmines')).getByRole('list', { name: /quests for The Deadmines/ });
    expect(within(list).getAllByText('!').length).toBeGreaterThan(1);
    expect(within(list).getByText(/The Defias Brotherhood: Gryan Stoutmantle, Westfall, Sentinel Hill/)).toBeTruthy();
  });

  it('opens a card with the quest details on focus', () => {
    render(<DungeonTable characters={[]} />);
    const marker = within(row('Ragefire Chasm')).getByText(/Hidden Enemies/).closest('.quest-marker') as HTMLElement;
    fireEvent.focus(marker);
    act(() => { vi.runAllTimers(); });
    const card = screen.getByRole('tooltip');
    expect(within(card).getByText('Hidden Enemies', { selector: '.qc-name' })).toBeTruthy();
    expect(within(card).getByText('Orgrimmar, Grommash Hold')).toBeTruthy();
    expect(within(card).getByText('Horde only')).toBeTruthy();
  });

  it('hides the other faction\'s quests when a faction is chosen', () => {
    render(<DungeonTable characters={[]} questFaction="Alliance" />);
    expect(within(row('Ragefire Chasm')).queryByRole('list', { name: /quests? for/ })).toBeNull();
    const smQuests = within(row('Scarlet Monastery: Cathedral')).getByRole('list', { name: /quests? for/ });
    expect(within(smQuests).getByText(/In the Name of the Light/)).toBeTruthy();
    expect(within(smQuests).queryByText(/Into the Scarlet Monastery/)).toBeNull();
  });

  it('covers the new Forever dungeons', () => {
    render(<DungeonTable characters={[]} />);
    const thanes = within(row('Hall of Thanes')).getByRole('list', { name: /quests for Hall of Thanes/ });
    expect(within(thanes).getByText('Important Heirlooms: Thom Filch, Ironforge')).toBeTruthy();
  });

  it('says when a quest giver is not on record yet', () => {
    render(<DungeonTable characters={[]} />);
    const marker = within(row('Alcaz Prison')).getByText(/The Dragon's Journal/).closest('.quest-marker') as HTMLElement;
    expect(marker.textContent).toContain('quest giver not on record yet');
    fireEvent.focus(marker);
    act(() => { vi.runAllTimers(); });
    expect(within(screen.getByRole('tooltip')).getByText('Quest giver not on record yet')).toBeTruthy();
  });

  it('keeps the Wowhead links on the card, not on the marker', () => {
    render(<DungeonTable characters={[]} />);
    const marker = within(row('The Deadmines')).getByText(/^The Defias Brotherhood:/).closest('.quest-marker') as HTMLElement;
    expect(marker.closest('a')).toBeNull();
    expect(within(marker).queryByRole('link')).toBeNull();
    fireEvent.focus(marker);
    act(() => { vi.runAllTimers(); });
    const card = within(screen.getByRole('tooltip'));
    expect(card.getByRole('link', { name: /View on Wowhead/ }).getAttribute('href')).toBe('https://www.wowhead.com/classic/quest=166');
  });

  it('opens the card on click and keeps it open until a click outside', () => {
    render(<DungeonTable characters={[]} />);
    const marker = within(row('Alcaz Prison')).getByText(/The Dragon's Journal/).closest('.quest-marker') as HTMLElement;
    fireEvent.click(marker);
    const card = within(screen.getByRole('tooltip'));
    expect(card.getByRole('link', { name: /Search Wowhead/ }).getAttribute('href'))
      .toBe('https://www.wowhead.com/classic/search?q=The%20Dragon\'s%20Journal');
    fireEvent.pointerLeave(marker);
    fireEvent.blur(marker);
    act(() => { vi.runAllTimers(); });
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows whether a quest is shareable and where its chain starts and ends', () => {
    render(<DungeonTable characters={[]} />);
    const marker = within(row('Ragefire Chasm')).getByText(/Hidden Enemies/).closest('.quest-marker') as HTMLElement;
    expect(marker.textContent).toContain('shareable, chain quest');
    fireEvent.focus(marker);
    act(() => { vi.runAllTimers(); });
    const card = within(screen.getByRole('tooltip'));
    expect(card.getByText('Shareable')).toBeTruthy();
    expect(card.getByText('Chain quest · 5 steps')).toBeTruthy();
    const links = card.getAllByRole('link', { name: 'Hidden Enemies' }).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['https://www.wowhead.com/classic/quest=5726', 'https://www.wowhead.com/classic/quest=5730']);
    expect(card.getByRole('link', { name: /View on Wowhead/ }).getAttribute('href')).toBe('https://www.wowhead.com/classic/quest=5728');
  });

  it('marks quests that can\'t be shared', () => {
    render(<DungeonTable characters={[]} />);
    const marker = within(row('Gnomeregan')).getByText(/A Fine Mess/).closest('.quest-marker') as HTMLElement;
    fireEvent.focus(marker);
    act(() => { vi.runAllTimers(); });
    const card = within(screen.getByRole('tooltip'));
    expect(card.getByText('Not shareable')).toBeTruthy();
    expect(card.queryByText(/Chain quest/)).toBeNull();
  });

  it('leaves out sharing and chain details for the new Forever quests', () => {
    render(<DungeonTable characters={[]} />);
    const marker = within(row('Hall of Thanes')).getByText(/Important Heirlooms/).closest('.quest-marker') as HTMLElement;
    fireEvent.focus(marker);
    act(() => { vi.runAllTimers(); });
    const card = within(screen.getByRole('tooltip'));
    expect(card.queryByText(/shareable/i)).toBeNull();
    expect(card.getByRole('link', { name: /Search Wowhead/ })).toBeTruthy();
  });

  it('shows no markers when the faction filter leaves no quests', () => {
    render(<DungeonTable characters={[]} questFaction="Alliance" />);
    expect(within(row('Shaper’s Terrace')).queryByRole('list', { name: /quests? for/ })).toBeNull();
  });
});
