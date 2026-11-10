import type { Character } from './api/client';

export type DungeonFaction = 'Horde' | 'Alliance' | 'Both';

export interface Dungeon {
  name: string;
  minLevel: number;
  maxLevel: number;
  players: number;
  faction: DungeonFaction;
}

export const dungeons: Dungeon[] = [
  { name: 'Ragefire Chasm', minLevel: 13, maxLevel: 18, players: 5, faction: 'Horde' },
  { name: 'The Deadmines', minLevel: 17, maxLevel: 26, players: 5, faction: 'Both' },
  { name: 'Wailing Caverns', minLevel: 17, maxLevel: 24, players: 5, faction: 'Both' },
  { name: 'Shadowfang Keep', minLevel: 22, maxLevel: 30, players: 5, faction: 'Both' },
  { name: 'The Stockade', minLevel: 22, maxLevel: 30, players: 5, faction: 'Alliance' },
  { name: 'Blackfathom Deeps', minLevel: 24, maxLevel: 32, players: 5, faction: 'Both' },
  { name: 'Scarlet Monastery: Graveyard', minLevel: 26, maxLevel: 36, players: 5, faction: 'Both' },
  { name: 'Gnomeregan', minLevel: 29, maxLevel: 38, players: 5, faction: 'Both' },
  { name: 'Scarlet Monastery: Library', minLevel: 29, maxLevel: 39, players: 5, faction: 'Both' },
  { name: 'Razorfen Kraul', minLevel: 30, maxLevel: 40, players: 5, faction: 'Both' },
  { name: 'Scarlet Monastery: Armory', minLevel: 32, maxLevel: 42, players: 5, faction: 'Both' },
  { name: 'Scarlet Monastery: Cathedral', minLevel: 35, maxLevel: 45, players: 5, faction: 'Both' },
  { name: 'Razorfen Downs', minLevel: 40, maxLevel: 50, players: 5, faction: 'Both' },
  { name: 'Uldaman', minLevel: 41, maxLevel: 51, players: 5, faction: 'Both' },
  { name: 'Zul\'Farrak', minLevel: 44, maxLevel: 54, players: 5, faction: 'Both' },
  { name: 'Maraudon', minLevel: 46, maxLevel: 55, players: 5, faction: 'Both' },
  { name: 'Blackrock Depths', minLevel: 52, maxLevel: 60, players: 5, faction: 'Both' },
  { name: 'Dire Maul: East', minLevel: 55, maxLevel: 60, players: 5, faction: 'Both' },
  { name: 'Lower Blackrock Spire', minLevel: 55, maxLevel: 60, players: 5, faction: 'Both' },
  { name: 'Dire Maul: West', minLevel: 56, maxLevel: 60, players: 5, faction: 'Both' },
  { name: 'Dire Maul: North', minLevel: 57, maxLevel: 60, players: 5, faction: 'Both' },
  { name: 'Scholomance', minLevel: 58, maxLevel: 60, players: 5, faction: 'Both' },
  { name: 'Stratholme', minLevel: 58, maxLevel: 60, players: 5, faction: 'Both' },
  { name: 'Upper Blackrock Spire', minLevel: 58, maxLevel: 60, players: 10, faction: 'Both' },
];

export type DungeonListRow<T extends Character = Character> =
  | { type: 'dungeon'; dungeon: Dungeon; characters: T[] }
  | { type: 'between'; characters: T[] };

export interface DungeonAssignments<T extends Character = Character> {
  rows: DungeonListRow<T>[];
  pending: T[];
}

export function assignCharactersToDungeons<T extends Character>(characters: T[]): DungeonAssignments<T> {
  const rows: DungeonListRow<T>[] = [];
  const unmatchedByPosition = new Map<number, T[]>();
  const pending: T[] = [];

  for (const character of characters) {
    if (character.level == null) {
      pending.push(character);
      continue;
    }

    const matches = dungeons.filter(
      (dungeon) => character.level! >= dungeon.minLevel && character.level! <= dungeon.maxLevel,
    );
    if (matches.length) continue;

    const position = dungeons.findIndex((dungeon) => dungeon.minLevel > character.level!);
    const insertionIndex = position === -1 ? dungeons.length : position;
    const group = unmatchedByPosition.get(insertionIndex) ?? [];
    group.push(character);
    unmatchedByPosition.set(insertionIndex, group);
  }

  for (let index = 0; index <= dungeons.length; index += 1) {
    const between = unmatchedByPosition.get(index);
    if (between) {
      rows.push({
        type: 'between',
        characters: between.sort((a, b) => a.level! - b.level!),
      });
    }
    if (index < dungeons.length) {
      const dungeon = dungeons[index];
      rows.push({
        type: 'dungeon',
        dungeon,
        characters: characters.filter(
          (character) => character.level != null && character.level >= dungeon.minLevel && character.level <= dungeon.maxLevel,
        ),
      });
    }
  }

  return { rows, pending: pending.sort((a, b) => a.name.localeCompare(b.name)) };
}