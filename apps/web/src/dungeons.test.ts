import { describe, expect, it } from 'vitest';
import type { Character } from './api/client';
import { assignCharactersToDungeons, dungeons } from './dungeons';

function character(id: string, level: number | null): Character {
  return {
    id,
    region: 'eu',
    name: id,
    surname: 'Tester',
    ruleset: 'Normal',
    class: 'Warrior',
    race: 'Human',
    level,
    zone: null,
    zoneSource: null,
    zoneUpdatedAt: null,
    status: level == null ? 'pending' : 'ok',
    syncError: null,
    lastSyncedAt: null,
  };
}

describe('dungeon catalog', () => {
  it('includes all new WoW Forever dungeons and Sunken Temple', () => {
    const expectedNames = [
      'Hall of Thanes',
      'Ruins of Lordaeron',
      'Excavation Site',
      'City of Dalaran',
      'The Drowned City',
      'Krol’dok Stronghold',
      'Alcaz Prison',
      'Blackmaw Hold',
      'Shaper’s Terrace',
      'Sunken Temple',
    ];
    const catalogNames = new Set(dungeons.map((dungeon) => dungeon.name));

    expect(dungeons).toHaveLength(34);
    expect(expectedNames.filter((name) => !catalogNames.has(name))).toEqual([]);
    for (const name of expectedNames.slice(0, 9)) {
      expect(dungeons.find((dungeon) => dungeon.name === name)).toMatchObject({ players: 5, faction: 'Both' });
    }
  });
});

describe('assignCharactersToDungeons', () => {
  it('includes characters in every inclusive matching level range', () => {
    const result = assignCharactersToDungeons([character('OnBoundary', 18)]);
    const matches = result.rows.filter(
      (row) => row.type === 'dungeon' && row.characters.some((c) => c.id === 'OnBoundary'),
    );

    expect(matches.map((row) => row.type === 'dungeon' && row.dungeon.name)).toContain('Ragefire Chasm');
    expect(matches.map((row) => row.type === 'dungeon' && row.dungeon.name)).toContain('The Deadmines');
    expect(result.rows.some((row) => row.type === 'between' && row.characters.some((c) => c.id === 'OnBoundary'))).toBe(false);
  });

  it('places unmatched leveled characters between level bands and pending characters last', () => {
    const result = assignCharactersToDungeons([
      character('BelowRange', 10),
      character('NearRange', 12),
      character('Pending', null),
    ]);
    const gaps = result.rows.filter((row) => row.type === 'between');

    expect(gaps.map((row) => row.type === 'between' && row.characters.map((c) => c.id))).toEqual([
      ['BelowRange', 'NearRange'],
    ]);
    expect(result.pending.map((c) => c.id)).toEqual(['Pending']);
  });
});