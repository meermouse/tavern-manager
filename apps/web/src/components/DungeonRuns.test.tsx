import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DungeonRun, TavernCharacter } from '../api/client';
import { keys } from '../api/hooks';
import { knownBosses, localToday, tallyBosses, TavernDungeons } from './DungeonRuns';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function run(over: Partial<DungeonRun>): DungeonRun {
  return {
    id: 'r1', dungeon: 'Ragefire Chasm', date: '2026-11-15', bosses: [], cleared: true, notes: null,
    loggedBy: { id: 'u1', displayName: 'Alice' }, createdAt: '2026-11-15T22:00:00Z', characters: [], canDelete: true,
    ...over,
  };
}

function char(id: string, name: string, level: number): TavernCharacter {
  return {
    id, region: 'eu', name, surname: 'Tester', ruleset: 'Normal', class: 'Warrior', race: 'Orc', level, status: 'ok',
    syncError: null, lastSyncedAt: null, ownerId: `u-${id}`, ownerName: `Owner ${name}`,
  };
}

describe('knownBosses', () => {
  it('lists the built-in bosses, then names the tavern has logged', () => {
    const runs = [run({ dungeon: 'Hall of Thanes', bosses: ['Thane Ulfgar', 'Old Grimtooth'] })];
    expect(knownBosses('Hall of Thanes', runs)).toEqual(['Thane Ulfgar', 'Old Grimtooth']);
    expect(knownBosses('Ragefire Chasm', [run({ bosses: ['bazzalan', 'Hidden Rat'] })])).toEqual([
      'Oggleflint', 'Taragaman the Hungerer', 'Jergosh the Invoker', 'Bazzalan', 'Hidden Rat',
    ]);
  });
});

describe('tallyBosses', () => {
  it('counts runs, clears and kills per boss, in dungeon order', () => {
    const tallies = tallyBosses([
      run({ id: 'a', dungeon: 'The Deadmines', bosses: ['Edwin VanCleef'], date: '2026-11-10' }),
      run({ id: 'b', bosses: ['Oggleflint', 'Bazzalan'], date: '2026-11-15' }),
      run({ id: 'c', bosses: ['Oggleflint'], cleared: false, date: '2026-11-12' }),
    ]);
    expect(tallies.map((t) => t.dungeon)).toEqual(['Ragefire Chasm', 'The Deadmines']);
    expect(tallies[0]).toMatchObject({ runs: 2, clears: 1, lastRun: '2026-11-15' });
    expect(tallies[0].bosses).toEqual([
      { name: 'Oggleflint', kills: 2 },
      { name: 'Taragaman the Hungerer', kills: 0 },
      { name: 'Jergosh the Invoker', kills: 0 },
      { name: 'Bazzalan', kills: 1 },
    ]);
  });
});

describe('TavernDungeons', () => {
  it('logs a run for the group from the finder', async () => {
    const posted: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify(run({})), { status: 201 });
      }
      return new Response('[]');
    }));
    const qc = new QueryClient();
    qc.setQueryData(keys.dungeonRuns('t1'), []);
    const characters = [char('a', 'Judy', 15), char('b', 'Grim', 16), char('c', 'Old', 50)];
    render(
      <QueryClientProvider client={qc}>
        <TavernDungeons tavernId="t1" characters={characters} visible={characters} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Log a Ragefire Chasm run' }));
    const form = within(screen.getByRole('heading', { name: 'Log a run' }).closest('form')!);
    expect((form.getByRole('combobox') as HTMLSelectElement).value).toBe('Ragefire Chasm');
    // In-range characters first.
    expect(form.getAllByRole('checkbox').slice(0, 3).map((c) => c.closest('label')!.textContent)).toEqual([
      expect.stringContaining('Grim'), expect.stringContaining('Judy'), expect.stringContaining('Old'),
    ]);
    const submit = form.getByRole('button', { name: 'Log run' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(form.getByRole('checkbox', { name: /Judy/ }));
    fireEvent.click(form.getByRole('checkbox', { name: /Grim/ }));
    fireEvent.click(form.getByRole('checkbox', { name: 'Jergosh the Invoker' }));
    fireEvent.change(form.getByRole('textbox', { name: 'Boss name' }), { target: { value: 'Hidden Rat' } });
    fireEvent.click(form.getByRole('button', { name: 'Add boss' }));
    fireEvent.click(submit);

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      dungeon: 'Ragefire Chasm',
      date: localToday(),
      characterIds: ['a', 'b'],
      bosses: ['Oggleflint', 'Taragaman the Hungerer', 'Bazzalan', 'Hidden Rat'],
      cleared: true,
    });
  });

  it('shows logged runs and the boss tally', () => {
    const qc = new QueryClient();
    qc.setQueryData(keys.dungeonRuns('t1'), [
      run({
        bosses: ['Oggleflint'], cleared: false, notes: 'Hearthed out',
        characters: [{ ...char('a', 'Judy', 15), ownerId: 'u-a', ownerName: 'Alice' }],
      }),
    ]);
    render(
      <QueryClientProvider client={qc}>
        <TavernDungeons tavernId="t1" characters={[]} visible={[]} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Runs/ }));
    const card = within(screen.getByText('Ragefire Chasm').closest('li')!);
    expect(card.getByText('Partial')).toBeTruthy();
    expect(card.getByText('Judy Tester')).toBeTruthy();
    expect(card.getByText(/Bosses \(1 of 4\)/)).toBeTruthy();
    expect(card.getByText('“Hearthed out”')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Bosses' }));
    expect(screen.getByLabelText('1 of 4 bosses defeated')).toBeTruthy();
    expect(screen.getByText(/1 run · 0 clears/)).toBeTruthy();
  });
});
