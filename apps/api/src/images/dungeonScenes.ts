/**
 * What each original dungeon looks like, for image prompts. The image model may not know a dungeon by name alone,
 * so this gives it something to paint. Dungeons new in WoW Forever aren't listed: their name is used as-is.
 */
const SETTINGS: Record<string, string> = {
  'Ragefire Chasm': 'a cavern of molten lava rivers and jagged red rock beneath Orgrimmar, lit by fire',
  'The Deadmines':
    'a vast underground cave beneath Westfall where a goblin-built pirate ship is moored in a hidden cove, mine carts, ' +
    'rickety wooden scaffolding and lantern light',
  'Wailing Caverns':
    'lush, misty caverns beneath the Barrens: glowing green pools, giant ferns, twisted roots and serpentine druids',
  'Shadowfang Keep':
    'a dark gothic castle on a stormy hill in Silverpine Forest, moonlight through stained glass, worgen and cursed ' +
    'nobles',
  'The Stockade': 'a grim stone prison under Stormwind: cells, torches on the walls and rioting inmates',
  'Blackfathom Deeps':
    'a flooded, ruined night elf temple on the coast of Ashenvale, deep blue water, moss-covered columns and naga',
  'Scarlet Monastery: Graveyard':
    'the moonlit graveyard of the Scarlet Monastery in Tirisfal Glades, crypts, gravestones and restless spirits',
  'Scarlet Monastery: Library':
    'the grand library of the Scarlet Monastery: towering bookshelves, red and gold banners, fanatical Scarlet ' +
    'Crusaders',
  'Scarlet Monastery: Armory':
    'the armory of the Scarlet Monastery: racks of weapons, a training hall, red and gold banners and armoured ' +
    'crusaders',
  'Scarlet Monastery: Cathedral':
    'the vaulted cathedral of the Scarlet Monastery: pews, stained glass, red carpets, gold candelabras and zealots',
  Gnomeregan:
    'the irradiated gnome city of Gnomeregan: clanking machinery, pipes, cogs, toxic green slime and rogue robots',
  'Razorfen Kraul': 'a maze of giant thorny brambles in the southern Barrens, home of the quilboar',
  'Razorfen Downs': 'a frozen thorn maze in the Barrens overrun by undead quilboar and the Scourge',
  Uldaman: 'an ancient titan excavation in the Badlands: carved stone halls, huge stone keepers and dwarven dig sites',
  "Zul'Farrak": 'a sun-baked troll city in the Tanaris desert: sandstone ziggurats, stairs and sand trolls',
  Maraudon: 'vast crystal caverns in Desolace: glowing purple and orange crystals, waterfalls and earth elementals',
  'Sunken Temple': "the half-sunken temple of Atal'Hakkar in the Swamp of Sorrows: green water, jungle ruins and dragons",
  'Blackrock Depths':
    'the volcanic Dark Iron dwarf city inside Blackrock Mountain: molten lava, forges, huge stone halls and fire',
  'Lower Blackrock Spire': 'the orc-held halls inside Blackrock Mountain: spiked iron, orc banners and spider webs',
  'Upper Blackrock Spire': 'the black dragonflight stronghold atop Blackrock Mountain: dragon whelps, lava and orc legions',
  'Dire Maul: East': 'the overgrown ruins of an ancient night elf city in Feralas: crumbling pillars, vines and satyrs',
  'Dire Maul: West': 'the haunted arcane quarter of the ruined city of Dire Maul: ghostly highborne and arcane pylons',
  'Dire Maul: North': 'the ogre-held courtyards of the ruined city of Dire Maul: brutish gordok ogres and a throne',
  Scholomance: 'a necromancy school in the crypts beneath Caer Darrow: candles, skeletons and dark magic',
  Stratholme: 'the burning, plague-ridden city of Stratholme: undead Scourge, ruined streets and ziggurats',
};

/** A short visual description of the dungeon, for an image prompt. */
export function dungeonScene(name: string): string {
  const setting = SETTINGS[name];
  return setting ? `${name} — ${setting}` : `${name}, a World of Warcraft dungeon`;
}
