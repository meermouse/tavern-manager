import type { Character } from './api/client';

export type DungeonFaction = 'Horde' | 'Alliance' | 'Both';

export interface Dungeon {
  name: string;
  minLevel: number;
  maxLevel: number;
  players: number;
  faction: DungeonFaction;
  /**
   * The dungeon's bosses, in rough kill order, for the run log's checklist. Only the original dungeons have a list;
   * for the new WoW Forever ones the run log offers whatever names the tavern has logged before.
   */
  bosses?: string[];
}

/** Boss lists for the original dungeons (see `Dungeon.bosses`). */
const BOSSES: Record<string, string[]> = {
  'Ragefire Chasm': ['Oggleflint', 'Taragaman the Hungerer', 'Jergosh the Invoker', 'Bazzalan'],
  'The Deadmines': ["Rhahk'Zor", "Sneed's Shredder", 'Gilnid', 'Mr. Smite', 'Captain Greenskin', 'Edwin VanCleef', 'Cookie'],
  'Wailing Caverns': [
    'Lady Anacondra', 'Lord Cobrahn', 'Kresh', 'Lord Pythas', 'Skum', 'Lord Serpentis', 'Verdan the Everliving',
    'Mutanus the Devourer',
  ],
  'Shadowfang Keep': [
    'Rethilgore', 'Razorclaw the Butcher', 'Baron Silverlaine', 'Commander Springvale', 'Odo the Blindwatcher',
    'Fenrus the Devourer', 'Wolf Master Nandos', 'Archmage Arugal',
  ],
  'The Stockade': ['Targorr the Dread', 'Kam Deepfury', 'Hamhock', 'Bazil Thredd', 'Dextren Ward'],
  'Blackfathom Deeps': [
    'Ghamoo-ra', 'Lady Sarevess', 'Gelihast', 'Lorgus Jett', 'Baron Aquanis', 'Twilight Lord Kelris', "Old Serra'kis",
    "Aku'mai",
  ],
  'Scarlet Monastery: Graveyard': ['Interrogator Vishas', 'Bloodmage Thalnos'],
  Gnomeregan: ['Grubbis', 'Viscous Fallout', 'Electrocutioner 6000', 'Crowd Pummeler 9-60', 'Mekgineer Thermaplugg'],
  'Scarlet Monastery: Library': ['Houndmaster Loksey', 'Arcanist Doan'],
  'Razorfen Kraul': [
    'Roogug', 'Aggem Thorncurse', 'Death Speaker Jargba', 'Overlord Ramtusk', 'Agathelos the Raging',
    'Charlga Razorflank',
  ],
  'Scarlet Monastery: Armory': ['Herod'],
  'Scarlet Monastery: Cathedral': ['High Inquisitor Fairbanks', 'Scarlet Commander Mograine', 'High Inquisitor Whitemane'],
  'Razorfen Downs': ["Tuten'kash", 'Mordresh Fire Eye', 'Glutton', 'Amnennar the Coldbringer'],
  Uldaman: [
    'Revelosh', 'Ironaya', 'Obsidian Sentinel', 'Ancient Stone Keeper', 'Galgann Firehammer', 'Grimlok', 'Archaedas',
  ],
  "Zul'Farrak": [
    "Antu'sul", 'Theka the Martyr', "Witch Doctor Zum'rah", 'Nekrum Gutchewer', "Shadowpriest Sezz'ziz",
    'Sergeant Bly', 'Hydromancer Velratha', "Gahz'rilla", 'Chief Ukorz Sandscalp',
  ],
  Maraudon: [
    'Noxxion', 'Razorlash', 'Lord Vyletongue', 'Celebras the Cursed', 'Landslide', 'Tinkerer Gizlock', 'Rotgrip',
    'Princess Theradras',
  ],
  'Sunken Temple': [
    "Atal'alarion", 'Dreamscythe', 'Weaver', "Jammal'an the Prophet", 'Ogom the Wretched', 'Morphaz', 'Hazzas',
    'Avatar of Hakkar', 'Shade of Eranikus',
  ],
  'Blackrock Depths': [
    'High Interrogator Gerstahn', 'Lord Roccor', 'Houndmaster Grebmar', 'Ring of Law', 'Pyromancer Loregrain',
    'Lord Incendius', 'Warder Stilgiss', 'Fineous Darkvire', "Bael'Gar", 'General Angerforge', 'Golem Lord Argelmach',
    'Hurley Blackbreath', 'Phalanx', 'Ribbly Screwspigot', 'Plugger Spazzring', 'Ambassador Flamelash', 'The Seven',
    'Magmus', 'Emperor Dagran Thaurissan',
  ],
  'Dire Maul: East': ['Pusillin', 'Zevrim Thornhoof', 'Hydrospawn', 'Lethtendris', 'Alzzin the Wildshaper'],
  'Lower Blackrock Spire': [
    'Highlord Omokk', "Shadow Hunter Vosh'gajin", 'War Master Voone', 'Mother Smolderweb', 'Urok Doomhowl',
    'Quartermaster Zigris', 'Halycon', 'Gizrul the Slavener', 'Overlord Wyrmthalak',
  ],
  'Dire Maul: West': [
    'Tendris Warpwood', 'Illyanna Ravenoak', 'Magister Kalendris', "Immol'thar", 'Prince Tortheldrin',
  ],
  'Dire Maul: North': [
    "Guard Mol'dar", 'Stomper Kreeg', 'Guard Fengus', "Guard Slip'kik", 'Captain Kromcrush', 'King Gordok',
  ],
  Scholomance: [
    'Kirtonos the Herald', 'Jandice Barov', 'Rattlegore', 'Marduk Blackpool', 'Vectus', 'Ras Frostwhisper',
    'Instructor Malicia', 'Doctor Theolen Krastinov', 'Lorekeeper Polkelt', 'The Ravenian', 'Lord Alexei Barov',
    'Lady Illucia Barov', 'Darkmaster Gandling',
  ],
  Stratholme: [
    'The Unforgiven', 'Timmy the Cruel', 'Malor the Zealous', 'Cannon Master Willey', 'Archivist Galford', 'Balnazzar',
    'Magistrate Barthilas', "Nerub'enkan", 'Baroness Anastari', 'Maleki the Pallid', 'Ramstein the Gorger',
    'Baron Rivendare',
  ],
  'Upper Blackrock Spire': [
    'Pyroguard Emberseer', 'Solakar Flamewreath', 'Warchief Rend Blackhand', 'The Beast', 'General Drakkisath',
  ],
};

export const dungeons: Dungeon[] = ([
  { name: 'Ragefire Chasm', minLevel: 13, maxLevel: 18, players: 5, faction: 'Horde' },
  { name: 'Hall of Thanes', minLevel: 13, maxLevel: 18, players: 5, faction: 'Both' },
  { name: 'Ruins of Lordaeron', minLevel: 15, maxLevel: 20, players: 5, faction: 'Both' },
  { name: 'The Deadmines', minLevel: 17, maxLevel: 26, players: 5, faction: 'Both' },
  { name: 'Wailing Caverns', minLevel: 17, maxLevel: 24, players: 5, faction: 'Both' },
  { name: 'Shadowfang Keep', minLevel: 22, maxLevel: 30, players: 5, faction: 'Both' },
  { name: 'The Stockade', minLevel: 22, maxLevel: 30, players: 5, faction: 'Alliance' },
  { name: 'Blackfathom Deeps', minLevel: 24, maxLevel: 32, players: 5, faction: 'Both' },
  { name: 'Excavation Site', minLevel: 24, maxLevel: 29, players: 5, faction: 'Both' },
  { name: 'Scarlet Monastery: Graveyard', minLevel: 26, maxLevel: 36, players: 5, faction: 'Both' },
  { name: 'City of Dalaran', minLevel: 28, maxLevel: 33, players: 5, faction: 'Both' },
  { name: 'Gnomeregan', minLevel: 29, maxLevel: 38, players: 5, faction: 'Both' },
  { name: 'Scarlet Monastery: Library', minLevel: 29, maxLevel: 39, players: 5, faction: 'Both' },
  { name: 'Razorfen Kraul', minLevel: 30, maxLevel: 40, players: 5, faction: 'Both' },
  { name: 'Scarlet Monastery: Armory', minLevel: 32, maxLevel: 42, players: 5, faction: 'Both' },
  { name: 'Scarlet Monastery: Cathedral', minLevel: 35, maxLevel: 45, players: 5, faction: 'Both' },
  { name: 'The Drowned City', minLevel: 35, maxLevel: 40, players: 5, faction: 'Both' },
  { name: 'Krol’dok Stronghold', minLevel: 40, maxLevel: 45, players: 5, faction: 'Both' },
  { name: 'Razorfen Downs', minLevel: 40, maxLevel: 50, players: 5, faction: 'Both' },
  { name: 'Uldaman', minLevel: 41, maxLevel: 51, players: 5, faction: 'Both' },
  { name: 'Zul\'Farrak', minLevel: 44, maxLevel: 54, players: 5, faction: 'Both' },
  { name: 'Maraudon', minLevel: 46, maxLevel: 55, players: 5, faction: 'Both' },
  { name: 'Alcaz Prison', minLevel: 48, maxLevel: 53, players: 5, faction: 'Both' },
  { name: 'Sunken Temple', minLevel: 50, maxLevel: 60, players: 5, faction: 'Both' },
  { name: 'Blackrock Depths', minLevel: 52, maxLevel: 60, players: 5, faction: 'Both' },
  { name: 'Dire Maul: East', minLevel: 55, maxLevel: 60, players: 5, faction: 'Both' },
  { name: 'Lower Blackrock Spire', minLevel: 55, maxLevel: 60, players: 5, faction: 'Both' },
  { name: 'Blackmaw Hold', minLevel: 55, maxLevel: 60, players: 5, faction: 'Both' },
  { name: 'Dire Maul: West', minLevel: 56, maxLevel: 60, players: 5, faction: 'Both' },
  { name: 'Dire Maul: North', minLevel: 57, maxLevel: 60, players: 5, faction: 'Both' },
  { name: 'Scholomance', minLevel: 58, maxLevel: 60, players: 5, faction: 'Both' },
  { name: 'Stratholme', minLevel: 58, maxLevel: 60, players: 5, faction: 'Both' },
  { name: 'Upper Blackrock Spire', minLevel: 58, maxLevel: 60, players: 10, faction: 'Both' },
  { name: 'Shaper’s Terrace', minLevel: 58, maxLevel: 60, players: 5, faction: 'Both' },
] satisfies Dungeon[]).map((d): Dungeon => (BOSSES[d.name] ? { ...d, bosses: BOSSES[d.name] } : d));

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

/** The listed dungeon with this name, if any. */
export function findDungeon(name: string): Dungeon | undefined {
  return dungeons.find((d) => d.name === name);
}
