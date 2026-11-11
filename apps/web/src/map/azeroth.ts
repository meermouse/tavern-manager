import { bbox, pad, pointInPolygon, powerCell, rectPolygon, roughen, type Box, type Point, type Polygon } from './geometry';

/**
 * An original, stylised map of Azeroth as it stands in WoW Forever: the classic continents plus
 * the new zones (Zephras Isle, Riverglades, Shen'dralas, Mount Hyjal). Not Blizzard art — zone
 * borders are generated from hand-placed seed points, so geography is approximate.
 *
 * Coordinates live in a 1000 × 700 world box.
 */
export const WORLD: Box = { x: 0, y: 0, w: 1000, h: 700 };

export type Faction = 'Alliance' | 'Horde' | 'Contested' | 'Sanctuary';
export type ContinentId = 'kalimdor' | 'eastern-kingdoms' | 'zephras';

export type Biome =
  | 'forest' | 'darkforest' | 'snow' | 'desert' | 'savanna' | 'mountain' | 'swamp' | 'volcanic'
  | 'plague' | 'grass' | 'jungle' | 'corrupted' | 'sky' | 'highland' | 'crater' | 'river' | 'ruins';

export const BIOME_COLOURS: Record<Biome, string> = {
  forest: '#56713d',
  darkforest: '#3f5434',
  snow: '#c4d0d3',
  desert: '#c8a467',
  savanna: '#ad8b55',
  mountain: '#8b7b67',
  swamp: '#5c6447',
  volcanic: '#7c412d',
  plague: '#6d6276',
  grass: '#7d9149',
  jungle: '#3f7246',
  corrupted: '#4c4a37',
  sky: '#b5d0ea',
  highland: '#8f8b5b',
  crater: '#6f8c3b',
  river: '#5f9a6a',
  ruins: '#7b7f5e',
};

export interface Zone {
  id: string;
  name: string;
  continent: ContinentId;
  /** Which landmass outline the zone is carved from (islands are their own landmass). */
  landmass: string;
  seed: Point;
  weight?: number;
  minLevel: number | null;
  maxLevel: number | null;
  faction: Faction;
  biome: Biome;
  isNew?: boolean;
  note?: string;
  /** Names match `dungeons.ts`. */
  dungeons?: string[];
  capital?: { name: string; at: Point; faction: 'Alliance' | 'Horde' };
  /** Other names the Blizzard API or players might use for somewhere in this zone. */
  aliases?: string[];
}

interface Landmass {
  id: string;
  continent: ContinentId;
  outline: Polygon;
}

const LANDMASSES: Landmass[] = [
  {
    id: 'kalimdor',
    continent: 'kalimdor',
    outline: [
      [205, 45], [265, 38], [330, 48], [398, 68], [428, 108], [412, 160], [424, 202], [406, 250],
      [422, 298], [410, 342], [396, 382], [416, 430], [410, 480], [386, 522], [396, 570], [380, 622],
      [350, 668], [300, 690], [240, 684], [180, 690], [120, 676], [80, 640], [70, 590], [86, 540],
      [70, 490], [90, 440], [74, 390], [100, 340], [114, 290], [134, 240], [150, 190], [166, 142], [182, 96],
    ],
  },
  {
    id: 'teldrassil',
    continent: 'kalimdor',
    outline: [[104, 58], [138, 48], [160, 70], [158, 110], [138, 134], [110, 130], [94, 98]],
  },
  {
    id: 'eastern-kingdoms',
    continent: 'eastern-kingdoms',
    outline: [
      [640, 50], [720, 38], [820, 44], [900, 60], [936, 100], [912, 150], [906, 200], [880, 240],
      [860, 280], [876, 320], [860, 360], [882, 400], [906, 440], [922, 490], [916, 540], [902, 582],
      [896, 630], [870, 680], [820, 700], [760, 690], [712, 702], [662, 690], [640, 650], [610, 620],
      [598, 580], [624, 545], [650, 510], [668, 470], [658, 430], [664, 390], [700, 354], [720, 318],
      [700, 280], [650, 252], [610, 222], [594, 170], [604, 120], [616, 80],
    ],
  },
  {
    id: 'zephras',
    continent: 'zephras',
    outline: [[470, 92], [495, 70], [532, 66], [562, 80], [570, 104], [548, 126], [508, 132], [478, 118]],
  },
];

export const CONTINENTS: { id: ContinentId; name: string; label: Point }[] = [
  { id: 'kalimdor', name: 'Kalimdor', label: [250, 28] },
  { id: 'eastern-kingdoms', name: 'Eastern Kingdoms', label: [770, 26] },
  { id: 'zephras', name: 'Zephras Isle', label: [520, 52] },
];

const K = 'kalimdor';
const EK = 'eastern-kingdoms';

export const ZONES: Zone[] = [
  // ---- Kalimdor ----
  { id: 'teldrassil', name: 'Teldrassil', continent: K, landmass: 'teldrassil', seed: [127, 92], minLevel: 1, maxLevel: 10, faction: 'Alliance', biome: 'forest',
    capital: { name: 'Darnassus', at: [116, 80], faction: 'Alliance' }, aliases: ['Darnassus', 'Rut\'theran Village'] },
  { id: 'darkshore', name: 'Darkshore', continent: K, landmass: K, seed: [180, 165], minLevel: 10, maxLevel: 20, faction: 'Alliance', biome: 'darkforest', aliases: ['Auberdine'] },
  { id: 'moonglade', name: 'Moonglade', continent: K, landmass: K, seed: [262, 72], weight: -700, minLevel: null, maxLevel: null, faction: 'Sanctuary', biome: 'grass', aliases: ['Nighthaven'] },
  { id: 'felwood', name: 'Felwood', continent: K, landmass: K, seed: [240, 135], minLevel: 48, maxLevel: 55, faction: 'Contested', biome: 'corrupted' },
  { id: 'winterspring', name: 'Winterspring', continent: K, landmass: K, seed: [350, 92], weight: 400, minLevel: 53, maxLevel: 60, faction: 'Contested', biome: 'snow', aliases: ['Everlook'] },
  { id: 'mount-hyjal', name: 'Mount Hyjal', continent: K, landmass: K, seed: [322, 168], minLevel: 60, maxLevel: 60, faction: 'Contested', biome: 'forest', isNew: true,
    note: 'New in WoW Forever: the level-60 endgame zone, recovering after Archimonde’s defeat.', aliases: ['Hyjal'] },
  { id: 'azshara', name: 'Azshara', continent: K, landmass: K, seed: [392, 222], minLevel: 45, maxLevel: 55, faction: 'Contested', biome: 'ruins' },
  { id: 'ashenvale', name: 'Ashenvale', continent: K, landmass: K, seed: [245, 232], weight: 300, minLevel: 18, maxLevel: 30, faction: 'Contested', biome: 'forest',
    dungeons: ['Blackfathom Deeps'], aliases: ['Astranaar', 'Splintertree Post'] },
  { id: 'stonetalon', name: 'Stonetalon Mountains', continent: K, landmass: K, seed: [158, 282], minLevel: 15, maxLevel: 27, faction: 'Contested', biome: 'mountain', aliases: ['Stonetalon'] },
  { id: 'durotar', name: 'Durotar', continent: K, landmass: K, seed: [388, 318], minLevel: 1, maxLevel: 10, faction: 'Horde', biome: 'savanna',
    dungeons: ['Ragefire Chasm'], capital: { name: 'Orgrimmar', at: [384, 288], faction: 'Horde' }, aliases: ['Orgrimmar', 'Razor Hill', 'Sen\'jin Village'] },
  { id: 'barrens', name: 'The Barrens', continent: K, landmass: K, seed: [305, 372], weight: 1800, minLevel: 10, maxLevel: 25, faction: 'Horde', biome: 'savanna',
    dungeons: ['Wailing Caverns', 'Razorfen Kraul', 'Razorfen Downs'], aliases: ['Barrens', 'Crossroads', 'Ratchet'] },
  { id: 'desolace', name: 'Desolace', continent: K, landmass: K, seed: [112, 392], minLevel: 30, maxLevel: 40, faction: 'Contested', biome: 'mountain', dungeons: ['Maraudon'] },
  { id: 'shendralas', name: 'Shen\'dralas', continent: K, landmass: K, seed: [180, 408], weight: -200, minLevel: 40, maxLevel: 50, faction: 'Contested', biome: 'ruins', isNew: true,
    note: 'New in WoW Forever, between Mulgore and Desolace via the Valley of Bones. Blizzard hasn’t confirmed its level range; 40–50 is the community estimate.' },
  { id: 'mulgore', name: 'Mulgore', continent: K, landmass: K, seed: [240, 452], minLevel: 1, maxLevel: 10, faction: 'Horde', biome: 'grass',
    capital: { name: 'Thunder Bluff', at: [232, 434], faction: 'Horde' }, aliases: ['Thunder Bluff', 'Bloodhoof Village'] },
  { id: 'dustwallow', name: 'Dustwallow Marsh', continent: K, landmass: K, seed: [372, 474], minLevel: 35, maxLevel: 45, faction: 'Contested', biome: 'swamp', aliases: ['Theramore', 'Theramore Isle', 'Brackenwall Village'] },
  { id: 'feralas', name: 'Feralas', continent: K, landmass: K, seed: [136, 522], weight: 300, minLevel: 40, maxLevel: 50, faction: 'Contested', biome: 'jungle',
    dungeons: ['Dire Maul: East', 'Dire Maul: West', 'Dire Maul: North'] },
  { id: 'thousand-needles', name: 'Thousand Needles', continent: K, landmass: K, seed: [282, 548], minLevel: 25, maxLevel: 35, faction: 'Contested', biome: 'desert' },
  { id: 'ungoro', name: 'Un\'Goro Crater', continent: K, landmass: K, seed: [222, 620], minLevel: 48, maxLevel: 55, faction: 'Contested', biome: 'crater', aliases: ['Un\'Goro'] },
  { id: 'silithus', name: 'Silithus', continent: K, landmass: K, seed: [124, 628], minLevel: 55, maxLevel: 60, faction: 'Contested', biome: 'desert' },
  { id: 'tanaris', name: 'Tanaris', continent: K, landmass: K, seed: [330, 628], weight: 400, minLevel: 40, maxLevel: 50, faction: 'Contested', biome: 'desert',
    dungeons: ['Zul\'Farrak'], aliases: ['Gadgetzan'] },

  // ---- Eastern Kingdoms ----
  { id: 'tirisfal', name: 'Tirisfal Glades', continent: EK, landmass: EK, seed: [668, 104], minLevel: 1, maxLevel: 10, faction: 'Horde', biome: 'plague',
    dungeons: ['Scarlet Monastery: Graveyard', 'Scarlet Monastery: Library', 'Scarlet Monastery: Armory', 'Scarlet Monastery: Cathedral', 'Ruins of Lordaeron'],
    capital: { name: 'Undercity', at: [690, 128], faction: 'Horde' }, aliases: ['Undercity', 'Brill', 'Tirisfal'] },
  { id: 'western-plaguelands', name: 'Western Plaguelands', continent: EK, landmass: EK, seed: [752, 110], minLevel: 51, maxLevel: 58, faction: 'Contested', biome: 'plague', dungeons: ['Scholomance'] },
  { id: 'eastern-plaguelands', name: 'Eastern Plaguelands', continent: EK, landmass: EK, seed: [848, 104], weight: 300, minLevel: 53, maxLevel: 60, faction: 'Contested', biome: 'plague', dungeons: ['Stratholme'] },
  { id: 'silverpine', name: 'Silverpine Forest', continent: EK, landmass: EK, seed: [636, 192], minLevel: 10, maxLevel: 20, faction: 'Horde', biome: 'darkforest', aliases: ['Silverpine', 'The Sepulcher'] },
  { id: 'alterac', name: 'Alterac Mountains', continent: EK, landmass: EK, seed: [738, 168], weight: -300, minLevel: 30, maxLevel: 40, faction: 'Contested', biome: 'snow', dungeons: ['City of Dalaran'], aliases: ['Dalaran'] },
  { id: 'hillsbrad', name: 'Hillsbrad Foothills', continent: EK, landmass: EK, seed: [712, 226], minLevel: 20, maxLevel: 30, faction: 'Contested', biome: 'grass', aliases: ['Hillsbrad', 'Southshore', 'Tarren Mill'] },
  { id: 'hinterlands', name: 'The Hinterlands', continent: EK, landmass: EK, seed: [858, 188], minLevel: 40, maxLevel: 50, faction: 'Contested', biome: 'forest', aliases: ['Hinterlands'] },
  { id: 'arathi', name: 'Arathi Highlands', continent: EK, landmass: EK, seed: [796, 258], minLevel: 30, maxLevel: 40, faction: 'Contested', biome: 'highland', aliases: ['Arathi'] },
  { id: 'wetlands', name: 'Wetlands', continent: EK, landmass: EK, seed: [770, 326], minLevel: 20, maxLevel: 30, faction: 'Contested', biome: 'swamp', dungeons: ['Excavation Site'], aliases: ['Menethil Harbor'] },
  { id: 'dun-morogh', name: 'Dun Morogh', continent: EK, landmass: EK, seed: [712, 398], minLevel: 1, maxLevel: 10, faction: 'Alliance', biome: 'snow',
    dungeons: ['Gnomeregan'], capital: { name: 'Ironforge', at: [726, 384], faction: 'Alliance' }, aliases: ['Ironforge', 'Kharanos'] },
  { id: 'loch-modan', name: 'Loch Modan', continent: EK, landmass: EK, seed: [806, 386], minLevel: 10, maxLevel: 20, faction: 'Alliance', biome: 'highland', aliases: ['Thelsamar'] },
  { id: 'searing-gorge', name: 'Searing Gorge', continent: EK, landmass: EK, seed: [728, 452], minLevel: 43, maxLevel: 50, faction: 'Contested', biome: 'volcanic' },
  { id: 'badlands', name: 'Badlands', continent: EK, landmass: EK, seed: [810, 442], minLevel: 35, maxLevel: 45, faction: 'Contested', biome: 'desert', dungeons: ['Uldaman'] },
  { id: 'burning-steppes', name: 'Burning Steppes', continent: EK, landmass: EK, seed: [758, 500], minLevel: 50, maxLevel: 58, faction: 'Contested', biome: 'volcanic',
    dungeons: ['Blackrock Depths', 'Lower Blackrock Spire', 'Upper Blackrock Spire'], aliases: ['Blackrock Mountain'] },
  { id: 'riverglades', name: 'Riverglades', continent: EK, landmass: EK, seed: [870, 494], weight: 300, minLevel: 35, maxLevel: 45, faction: 'Contested', biome: 'river', isNew: true,
    note: 'New in WoW Forever: an east-coast frontier between the Burning Steppes, Redridge, the Swamp of Sorrows and the Badlands.' },
  { id: 'elwynn', name: 'Elwynn Forest', continent: EK, landmass: EK, seed: [700, 548], minLevel: 1, maxLevel: 10, faction: 'Alliance', biome: 'grass',
    dungeons: ['The Stockade'], capital: { name: 'Stormwind', at: [676, 532], faction: 'Alliance' }, aliases: ['Stormwind', 'Stormwind City', 'Goldshire', 'Elwynn'] },
  { id: 'redridge', name: 'Redridge Mountains', continent: EK, landmass: EK, seed: [806, 548], minLevel: 15, maxLevel: 25, faction: 'Contested', biome: 'highland', aliases: ['Redridge', 'Lakeshire'] },
  { id: 'westfall', name: 'Westfall', continent: EK, landmass: EK, seed: [638, 596], minLevel: 10, maxLevel: 20, faction: 'Alliance', biome: 'savanna', dungeons: ['The Deadmines'], aliases: ['Sentinel Hill', 'Moonbrook'] },
  { id: 'duskwood', name: 'Duskwood', continent: EK, landmass: EK, seed: [722, 604], weight: -200, minLevel: 18, maxLevel: 30, faction: 'Contested', biome: 'darkforest', aliases: ['Darkshire'] },
  { id: 'deadwind', name: 'Deadwind Pass', continent: EK, landmass: EK, seed: [784, 606], weight: -400, minLevel: 55, maxLevel: 60, faction: 'Contested', biome: 'mountain', aliases: ['Karazhan'] },
  { id: 'swamp-of-sorrows', name: 'Swamp of Sorrows', continent: EK, landmass: EK, seed: [856, 590], minLevel: 35, maxLevel: 45, faction: 'Contested', biome: 'swamp', dungeons: ['Sunken Temple'], aliases: ['Stonard'] },
  { id: 'blasted-lands', name: 'Blasted Lands', continent: EK, landmass: EK, seed: [846, 660], minLevel: 45, maxLevel: 55, faction: 'Contested', biome: 'volcanic', aliases: ['Dark Portal'] },
  { id: 'stranglethorn', name: 'Stranglethorn Vale', continent: EK, landmass: EK, seed: [690, 670], weight: 900, minLevel: 30, maxLevel: 45, faction: 'Contested', biome: 'jungle',
    aliases: ['Stranglethorn', 'Booty Bay', 'Grom\'gol Base Camp'] },

  // ---- Zephras Isle ----
  { id: 'zephras-isle', name: 'Zephras Isle', continent: 'zephras', landmass: 'zephras', seed: [520, 100], minLevel: 1, maxLevel: 12, faction: 'Contested', biome: 'sky', isNew: true,
    note: 'New in WoW Forever: the Skyborne starting island, floating in Skywall, the Elemental Plane of Air. Open to both factions.', aliases: ['Zephras', 'Skywall'] },
];

export interface ZoneShape extends Zone {
  /** Cell clipped to the rough landmass outline: the zone's actual land. Used for framing. */
  land: Polygon;
  /** Cell clipped to the landmass bounding box: drawn under the smoothed coastline clip-path. */
  fill: Polygon;
  landBox: Box;
}

export interface LandmassShape extends Landmass {
  box: Box;
}

export const LANDMASS_SHAPES: LandmassShape[] = LANDMASSES.map((l, i) => {
  const outline = roughen(l.outline, 7919 * (i + 1));
  return { ...l, outline, box: bbox(outline) };
});

export const ZONE_SHAPES: ZoneShape[] = LANDMASS_SHAPES.flatMap((landmass) => {
  const zones = ZONES.filter((z) => z.landmass === landmass.id);
  const sites = zones.map((z) => ({ at: z.seed, weight: z.weight ?? 0 }));
  const frame = rectPolygon(pad(landmass.box, 12));
  return zones.map((zone, i) => {
    const land = powerCell(landmass.outline, sites, i);
    return { ...zone, land, fill: powerCell(frame, sites, i), landBox: bbox(land.length ? land : [zone.seed]) };
  });
});

export function continentBox(id: ContinentId): Box {
  const outlines = LANDMASS_SHAPES.filter((l) => l.continent === id).flatMap((l) => l.outline);
  return bbox(outlines);
}

export function seedInsideOwnZone(zone: ZoneShape): boolean {
  return pointInPolygon(zone.seed, zone.land);
}

const normalise = (s: string) => s.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z]/g, '');

const LOOKUP = new Map<string, Zone>();
for (const zone of ZONES) {
  for (const name of [zone.name, zone.id, ...(zone.aliases ?? [])]) LOOKUP.set(normalise(name), zone);
}

/** Match a free-text zone (from the API or a player) to a map zone, tolerating cities, case and "The". */
export function findZone(name: string | null | undefined): Zone | null {
  if (!name) return null;
  return LOOKUP.get(normalise(name)) ?? null;
}

export function levelRange(zone: Zone): string {
  if (zone.minLevel == null || zone.maxLevel == null) return 'All levels';
  return zone.minLevel === zone.maxLevel ? `${zone.minLevel}` : `${zone.minLevel}–${zone.maxLevel}`;
}
