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
  { id: 'teldrassil', name: 'Teldrassil', continent: K, landmass: 'teldrassil', seed: [127, 92], minLevel: 1, maxLevel: 10, faction: 'Alliance', biome: 'forest' },
  { id: 'darkshore', name: 'Darkshore', continent: K, landmass: K, seed: [180, 165], minLevel: 10, maxLevel: 20, faction: 'Alliance', biome: 'darkforest' },
  { id: 'moonglade', name: 'Moonglade', continent: K, landmass: K, seed: [262, 72], weight: -700, minLevel: null, maxLevel: null, faction: 'Sanctuary', biome: 'grass' },
  { id: 'felwood', name: 'Felwood', continent: K, landmass: K, seed: [240, 135], minLevel: 48, maxLevel: 55, faction: 'Contested', biome: 'corrupted' },
  { id: 'winterspring', name: 'Winterspring', continent: K, landmass: K, seed: [350, 92], weight: 400, minLevel: 53, maxLevel: 60, faction: 'Contested', biome: 'snow' },
  { id: 'mount-hyjal', name: 'Mount Hyjal', continent: K, landmass: K, seed: [322, 168], minLevel: 60, maxLevel: 60, faction: 'Contested', biome: 'forest', isNew: true,
    note: 'New in WoW Forever: the level-60 endgame zone, recovering after Archimonde’s defeat.' },
  { id: 'azshara', name: 'Azshara', continent: K, landmass: K, seed: [392, 222], minLevel: 45, maxLevel: 55, faction: 'Contested', biome: 'ruins' },
  { id: 'ashenvale', name: 'Ashenvale', continent: K, landmass: K, seed: [245, 232], weight: 300, minLevel: 18, maxLevel: 30, faction: 'Contested', biome: 'forest' },
  { id: 'stonetalon', name: 'Stonetalon Mountains', continent: K, landmass: K, seed: [158, 282], minLevel: 15, maxLevel: 27, faction: 'Contested', biome: 'mountain' },
  { id: 'durotar', name: 'Durotar', continent: K, landmass: K, seed: [388, 318], minLevel: 1, maxLevel: 10, faction: 'Horde', biome: 'savanna' },
  { id: 'barrens', name: 'The Barrens', continent: K, landmass: K, seed: [305, 372], weight: 1800, minLevel: 10, maxLevel: 25, faction: 'Horde', biome: 'savanna' },
  { id: 'desolace', name: 'Desolace', continent: K, landmass: K, seed: [112, 392], minLevel: 30, maxLevel: 40, faction: 'Contested', biome: 'mountain', },
  { id: 'shendralas', name: 'Shen\'dralas', continent: K, landmass: K, seed: [180, 408], weight: -200, minLevel: 40, maxLevel: 50, faction: 'Contested', biome: 'ruins', isNew: true,
    note: 'New in WoW Forever, between Mulgore and Desolace via the Valley of Bones. Blizzard hasn’t confirmed its level range; 40–50 is the community estimate.' },
  { id: 'mulgore', name: 'Mulgore', continent: K, landmass: K, seed: [240, 452], minLevel: 1, maxLevel: 10, faction: 'Horde', biome: 'grass' },
  { id: 'dustwallow', name: 'Dustwallow Marsh', continent: K, landmass: K, seed: [372, 474], minLevel: 35, maxLevel: 45, faction: 'Contested', biome: 'swamp' },
  { id: 'feralas', name: 'Feralas', continent: K, landmass: K, seed: [136, 522], weight: 300, minLevel: 40, maxLevel: 50, faction: 'Contested', biome: 'jungle', },
  { id: 'thousand-needles', name: 'Thousand Needles', continent: K, landmass: K, seed: [282, 548], minLevel: 25, maxLevel: 35, faction: 'Contested', biome: 'desert' },
  { id: 'ungoro', name: 'Un\'Goro Crater', continent: K, landmass: K, seed: [222, 620], minLevel: 48, maxLevel: 55, faction: 'Contested', biome: 'crater' },
  { id: 'silithus', name: 'Silithus', continent: K, landmass: K, seed: [124, 628], minLevel: 55, maxLevel: 60, faction: 'Contested', biome: 'desert' },
  { id: 'tanaris', name: 'Tanaris', continent: K, landmass: K, seed: [330, 628], weight: 400, minLevel: 40, maxLevel: 50, faction: 'Contested', biome: 'desert' },

  // ---- Eastern Kingdoms ----
  { id: 'tirisfal', name: 'Tirisfal Glades', continent: EK, landmass: EK, seed: [668, 104], minLevel: 1, maxLevel: 10, faction: 'Horde', biome: 'plague' },
  { id: 'western-plaguelands', name: 'Western Plaguelands', continent: EK, landmass: EK, seed: [752, 110], minLevel: 51, maxLevel: 58, faction: 'Contested', biome: 'plague', },
  { id: 'eastern-plaguelands', name: 'Eastern Plaguelands', continent: EK, landmass: EK, seed: [848, 104], weight: 300, minLevel: 53, maxLevel: 60, faction: 'Contested', biome: 'plague', },
  { id: 'silverpine', name: 'Silverpine Forest', continent: EK, landmass: EK, seed: [636, 192], minLevel: 10, maxLevel: 20, faction: 'Horde', biome: 'darkforest' },
  { id: 'alterac', name: 'Alterac Mountains', continent: EK, landmass: EK, seed: [738, 168], weight: -300, minLevel: 30, maxLevel: 40, faction: 'Contested', biome: 'snow' },
  { id: 'hillsbrad', name: 'Hillsbrad Foothills', continent: EK, landmass: EK, seed: [712, 226], minLevel: 20, maxLevel: 30, faction: 'Contested', biome: 'grass' },
  { id: 'hinterlands', name: 'The Hinterlands', continent: EK, landmass: EK, seed: [858, 188], minLevel: 40, maxLevel: 50, faction: 'Contested', biome: 'forest' },
  { id: 'arathi', name: 'Arathi Highlands', continent: EK, landmass: EK, seed: [796, 258], minLevel: 30, maxLevel: 40, faction: 'Contested', biome: 'highland' },
  { id: 'wetlands', name: 'Wetlands', continent: EK, landmass: EK, seed: [770, 326], minLevel: 20, maxLevel: 30, faction: 'Contested', biome: 'swamp' },
  { id: 'dun-morogh', name: 'Dun Morogh', continent: EK, landmass: EK, seed: [712, 398], minLevel: 1, maxLevel: 10, faction: 'Alliance', biome: 'snow' },
  { id: 'loch-modan', name: 'Loch Modan', continent: EK, landmass: EK, seed: [806, 386], minLevel: 10, maxLevel: 20, faction: 'Alliance', biome: 'highland' },
  { id: 'searing-gorge', name: 'Searing Gorge', continent: EK, landmass: EK, seed: [728, 452], minLevel: 43, maxLevel: 50, faction: 'Contested', biome: 'volcanic' },
  { id: 'badlands', name: 'Badlands', continent: EK, landmass: EK, seed: [810, 442], minLevel: 35, maxLevel: 45, faction: 'Contested', biome: 'desert', },
  { id: 'burning-steppes', name: 'Burning Steppes', continent: EK, landmass: EK, seed: [758, 500], minLevel: 50, maxLevel: 58, faction: 'Contested', biome: 'volcanic' },
  { id: 'riverglades', name: 'Riverglades', continent: EK, landmass: EK, seed: [870, 494], weight: 300, minLevel: 35, maxLevel: 45, faction: 'Contested', biome: 'river', isNew: true,
    note: 'New in WoW Forever: an east-coast frontier between the Burning Steppes, Redridge, the Swamp of Sorrows and the Badlands.' },
  { id: 'elwynn', name: 'Elwynn Forest', continent: EK, landmass: EK, seed: [700, 548], minLevel: 1, maxLevel: 10, faction: 'Alliance', biome: 'grass' },
  { id: 'redridge', name: 'Redridge Mountains', continent: EK, landmass: EK, seed: [806, 548], minLevel: 15, maxLevel: 25, faction: 'Contested', biome: 'highland' },
  { id: 'westfall', name: 'Westfall', continent: EK, landmass: EK, seed: [638, 596], minLevel: 10, maxLevel: 20, faction: 'Alliance', biome: 'savanna' },
  { id: 'duskwood', name: 'Duskwood', continent: EK, landmass: EK, seed: [722, 604], weight: -200, minLevel: 18, maxLevel: 30, faction: 'Contested', biome: 'darkforest' },
  { id: 'deadwind', name: 'Deadwind Pass', continent: EK, landmass: EK, seed: [784, 606], weight: -400, minLevel: 55, maxLevel: 60, faction: 'Contested', biome: 'mountain' },
  { id: 'swamp-of-sorrows', name: 'Swamp of Sorrows', continent: EK, landmass: EK, seed: [856, 590], minLevel: 35, maxLevel: 45, faction: 'Contested', biome: 'swamp' },
  { id: 'blasted-lands', name: 'Blasted Lands', continent: EK, landmass: EK, seed: [846, 660], minLevel: 45, maxLevel: 55, faction: 'Contested', biome: 'volcanic' },
  { id: 'stranglethorn', name: 'Stranglethorn Vale', continent: EK, landmass: EK, seed: [690, 670], weight: 900, minLevel: 30, maxLevel: 45, faction: 'Contested', biome: 'jungle' },

  // ---- Zephras Isle ----
  { id: 'zephras-isle', name: 'Zephras Isle', continent: 'zephras', landmass: 'zephras', seed: [520, 100], minLevel: 1, maxLevel: 12, faction: 'Contested', biome: 'sky', isNew: true,
    note: 'New in WoW Forever: the Skyborne starting island, floating in Skywall, the Elemental Plane of Air. Open to both factions.' },
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

export function levelRange(zone: Zone): string {
  if (zone.minLevel == null || zone.maxLevel == null) return 'All levels';
  return zone.minLevel === zone.maxLevel ? `${zone.minLevel}` : `${zone.minLevel}–${zone.maxLevel}`;
}

export type PoiKind = 'capital' | 'town' | 'dungeon';
export type PoiFaction = 'Alliance' | 'Horde' | 'Neutral';

export interface Poi {
  id: string;
  name: string;
  kind: PoiKind;
  zoneId: string;
  at: Point;
  faction?: PoiFaction;
  /** Dungeon entrances: the instance(s) behind this entrance, named as in `dungeons.ts`. */
  dungeons?: string[];
  /** Entrance lies just off the coast (underwater or on an island). */
  offshore?: boolean;
  note?: string;
}

const A: PoiFaction = 'Alliance';
const H: PoiFaction = 'Horde';
const N: PoiFaction = 'Neutral';

function capital(name: string, zoneId: string, at: Point, faction: PoiFaction): Poi {
  return { id: slug(name), name, kind: 'capital', zoneId, at, faction };
}
function town(name: string, zoneId: string, at: Point, faction: PoiFaction): Poi {
  return { id: slug(name), name, kind: 'town', zoneId, at, faction };
}
function dungeon(name: string, zoneId: string, at: Point, instances: string[] = [name], extra: Partial<Poi> = {}): Poi {
  return { id: slug(name), name, kind: 'dungeon', zoneId, at, dungeons: instances, ...extra };
}
function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Cities, towns and dungeon entrances. Positions are approximate, chosen to sit in the right part
 * of each zone on this stylised map. Shaper's Terrace is left off until its location is confirmed.
 */
export const POIS: Poi[] = [
  // Capitals
  capital('Darnassus', 'teldrassil', [114, 76], A),
  capital('Orgrimmar', 'durotar', [390, 288], H),
  capital('Thunder Bluff', 'mulgore', [226, 434], H),
  capital('Stormwind City', 'elwynn', [676, 528], A),
  capital('Ironforge', 'dun-morogh', [722, 380], A),
  capital('Undercity', 'tirisfal', [682, 132], H),

  // Kalimdor towns
  town('Auberdine', 'darkshore', [164, 192], A),
  town('Nighthaven', 'moonglade', [250, 92], N),
  town('Everlook', 'winterspring', [374, 118], N),
  town('Astranaar', 'ashenvale', [226, 252], A),
  town('Splintertree Post', 'ashenvale', [286, 248], H),
  town('Sun Rock Retreat', 'stonetalon', [150, 304], H),
  town('Razor Hill', 'durotar', [394, 346], H),
  town('The Crossroads', 'barrens', [300, 346], H),
  town('Ratchet', 'barrens', [362, 384], N),
  town('Camp Taurajo', 'barrens', [310, 410], H),
  town('Bloodhoof Village', 'mulgore', [252, 476], H),
  town('Nijel\'s Point', 'desolace', [124, 350], A),
  town('Shadowprey Village', 'desolace', [90, 418], H),
  town('Theramore Isle', 'dustwallow', [388, 492], A),
  town('Brackenwall Village', 'dustwallow', [348, 446], H),
  town('Feathermoon Stronghold', 'feralas', [88, 516], A),
  town('Camp Mojache', 'feralas', [178, 512], H),
  town('Freewind Post', 'thousand-needles', [262, 528], H),
  town('Marshal\'s Refuge', 'ungoro', [226, 598], N),
  town('Cenarion Hold', 'silithus', [120, 604], N),
  town('Gadgetzan', 'tanaris', [338, 602], N),

  // Eastern Kingdoms towns
  town('Brill', 'tirisfal', [652, 128], H),
  town('Chillwind Camp', 'western-plaguelands', [742, 140], A),
  town('Light\'s Hope Chapel', 'eastern-plaguelands', [892, 120], N),
  town('The Sepulcher', 'silverpine', [628, 212], H),
  town('Southshore', 'hillsbrad', [700, 254], A),
  town('Tarren Mill', 'hillsbrad', [728, 214], H),
  town('Aerie Peak', 'hinterlands', [822, 172], A),
  town('Revantusk Village', 'hinterlands', [882, 206], H),
  town('Refuge Pointe', 'arathi', [790, 282], A),
  town('Hammerfall', 'arathi', [840, 248], H),
  town('Menethil Harbor', 'wetlands', [730, 334], A),
  town('Kharanos', 'dun-morogh', [694, 410], A),
  town('Thelsamar', 'loch-modan', [790, 398], A),
  town('Thorium Point', 'searing-gorge', [708, 440], N),
  town('Kargath', 'badlands', [790, 428], H),
  town('Morgan\'s Vigil', 'burning-steppes', [780, 512], A),
  town('Goldshire', 'elwynn', [706, 566], A),
  town('Lakeshire', 'redridge', [790, 562], A),
  town('Sentinel Hill', 'westfall', [640, 612], A),
  town('Darkshire', 'duskwood', [736, 622], A),
  town('Stonard', 'swamp-of-sorrows', [870, 606], H),
  town('Nethergarde Keep', 'blasted-lands', [866, 640], A),
  town('Grom\'gol Base Camp', 'stranglethorn', [662, 650], H),
  town('Booty Bay', 'stranglethorn', [674, 682], N),

  // Dungeon entrances — Kalimdor
  dungeon('Ragefire Chasm', 'durotar', [372, 302], undefined, { note: 'Inside Orgrimmar.' }),
  dungeon('Wailing Caverns', 'barrens', [262, 378]),
  dungeon('Razorfen Kraul', 'barrens', [278, 420]),
  dungeon('Razorfen Downs', 'barrens', [306, 444]),
  dungeon('Blackfathom Deeps', 'ashenvale', [198, 218]),
  dungeon('Maraudon', 'desolace', [100, 446]),
  dungeon('Dire Maul', 'feralas', [148, 546], ['Dire Maul: East', 'Dire Maul: West', 'Dire Maul: North']),
  dungeon('Zul\'Farrak', 'tanaris', [312, 602]),
  dungeon('Alcaz Prison', 'dustwallow', [428, 506], undefined, { offshore: true, note: 'On Alcaz Island, off the Dustwallow coast.' }),
  dungeon('Blackmaw Hold', 'azshara', [398, 186]),

  // Dungeon entrances — Eastern Kingdoms
  dungeon('Scarlet Monastery', 'tirisfal', [704, 78], ['Scarlet Monastery: Graveyard', 'Scarlet Monastery: Library', 'Scarlet Monastery: Armory', 'Scarlet Monastery: Cathedral']),
  dungeon('Ruins of Lordaeron', 'tirisfal', [690, 146]),
  dungeon('Shadowfang Keep', 'silverpine', [650, 168]),
  dungeon('City of Dalaran', 'alterac', [718, 178]),
  dungeon('Scholomance', 'western-plaguelands', [762, 128]),
  dungeon('Stratholme', 'eastern-plaguelands', [830, 70]),
  dungeon('Gnomeregan', 'dun-morogh', [680, 384]),
  dungeon('Hall of Thanes', 'dun-morogh', [744, 386], undefined, { note: 'Beneath Ironforge.' }),
  dungeon('Excavation Site', 'wetlands', [792, 348]),
  dungeon('Uldaman', 'badlands', [836, 424]),
  dungeon('Blackrock Mountain', 'burning-steppes', [742, 478], ['Blackrock Depths', 'Lower Blackrock Spire', 'Upper Blackrock Spire'], { note: 'Straddles the Searing Gorge and the Burning Steppes.' }),
  dungeon('Krol’dok Stronghold', 'riverglades', [884, 470]),
  dungeon('The Stockade', 'elwynn', [662, 540], undefined, { note: 'Inside Stormwind City.' }),
  dungeon('The Deadmines', 'westfall', [628, 620]),
  dungeon('Sunken Temple', 'swamp-of-sorrows', [876, 572]),
  dungeon('The Drowned City', 'stranglethorn', [620, 664], undefined, { offshore: true, note: 'Underwater, off the coast west of Grom\'gol.' }),
];
