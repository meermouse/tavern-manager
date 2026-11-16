/**
 * Quests that send you into a dungeon, shown as ! markers in the dungeon finder. These tend to carry the best rewards
 * for the level, so they're worth picking up before a run. Class quests are left out, as are quests that start from an
 * item dropped inside. Only the original dungeons are covered so far; the new WoW Forever ones have no list yet.
 */

/** Which faction can pick the quest up. */
export type QuestFaction = 'Alliance' | 'Horde' | 'Both';

export interface DungeonQuest {
  name: string;
  /** Who hands the quest out. */
  giver: string;
  /** Where to find them: zone, then the spot within it. */
  location: string;
  faction: QuestFaction;
}

const q = (name: string, giver: string, location: string, faction: QuestFaction = 'Both'): DungeonQuest => ({
  name, giver, location, faction,
});

// Kill-the-four-bosses quests that need a trip through several Scarlet Monastery wings.
const scarletLeaders = [
  q('In the Name of the Light', 'Raleigh the Devout', 'Hillsbrad Foothills, Southshore', 'Alliance'),
  q('Into the Scarlet Monastery', 'Varimathras', 'Undercity, Royal Quarter', 'Horde'),
];

export const DUNGEON_QUESTS: Record<string, DungeonQuest[]> = {
  'Ragefire Chasm': [
    q('Testing an Enemy\'s Strength', 'Rahauro', 'Thunder Bluff, Elder Rise', 'Horde'),
    q('Searching for the Lost Satchel', 'Rahauro', 'Thunder Bluff, Elder Rise', 'Horde'),
    q('The Power to Destroy...', 'Varimathras', 'Undercity, Royal Quarter', 'Horde'),
    q('Hidden Enemies', 'Thrall', 'Orgrimmar, Grommash Hold', 'Horde'),
    q('Slaying the Beast', 'Neeru Fireblade', 'Orgrimmar, Cleft of Shadow', 'Horde'),
  ],
  'The Deadmines': [
    q('The Defias Brotherhood', 'Gryan Stoutmantle', 'Westfall, Sentinel Hill', 'Alliance'),
    q('Red Silk Bandanas', 'Scout Riell', 'Westfall, Sentinel Hill tower', 'Alliance'),
    q('Collecting Memories', 'Wilder Thistlenettle', 'Stormwind, Dwarven District', 'Alliance'),
    q('Oh Brother. . .', 'Wilder Thistlenettle', 'Stormwind, Dwarven District', 'Alliance'),
    q('Underground Assault', 'Shoni the Shilent', 'Stormwind, Dwarven District', 'Alliance'),
  ],
  'Wailing Caverns': [
    q('Deviate Hides', 'Nalpak', 'The Barrens, cave above the Wailing Caverns entrance'),
    q('Deviate Eradication', 'Ebru', 'The Barrens, cave above the Wailing Caverns entrance'),
    q('Trouble at the Docks', 'Crane Operator Bigglefuzz', 'The Barrens, Ratchet'),
    q('Smart Drinks', 'Mebok Mizzyrix', 'The Barrens, Ratchet'),
    q('Leaders of the Fang', 'Nara Wildmane', 'Thunder Bluff, Elder Rise', 'Horde'),
    q('Serpentbloom', 'Apothecary Zamah', 'Thunder Bluff, Spirit Rise', 'Horde'),
  ],
  'Shadowfang Keep': [
    q('Deathstalkers in Shadowfang', 'High Executor Hadrec', 'Silverpine Forest, The Sepulcher', 'Horde'),
    q('Arugal Must Die', 'Dalar Dawnweaver', 'Silverpine Forest, The Sepulcher', 'Horde'),
    q('The Book of Ur', 'Keeper Bel\'dugur', 'Undercity, The Apothecarium', 'Horde'),
  ],
  'The Stockade': [
    q('Quell The Uprising', 'Warden Thelwater', 'Stormwind, outside The Stockade', 'Alliance'),
    q('The Stockade Riots', 'Warden Thelwater', 'Stormwind, outside The Stockade', 'Alliance'),
    q('The Color of Blood', 'Nikova Raskol', 'Stormwind, Old Town', 'Alliance'),
    q('Crime and Punishment', 'Councilman Millstipe', 'Duskwood, Darkshire', 'Alliance'),
    q('What Comes Around...', 'Guard Berton', 'Redridge Mountains, Lakeshire', 'Alliance'),
    q('The Fury Runs Deep', 'Motley Garmason', 'Wetlands, Dun Modr', 'Alliance'),
  ],
  'Blackfathom Deeps': [
    q('Knowledge in the Deeps', 'Gerrig Bonegrip', 'Ironforge, The Forlorn Cavern', 'Alliance'),
    q('Researching the Corruption', 'Gershala Nightwhisper', 'Darkshore, Auberdine', 'Alliance'),
    q('In Search of Thaelrid', 'Dawnwatcher Shaedlass', 'Darnassus, Craftsmen\'s Terrace', 'Alliance'),
    q('Twilight Falls', 'Argent Guard Manados', 'Darnassus, Craftsmen\'s Terrace', 'Alliance'),
    q('Blackfathom Villainy', 'Argent Guard Thaelrid', 'Inside Blackfathom Deeps', 'Alliance'),
    q('Blackfathom Villainy', 'Bashana Runetotem', 'Thunder Bluff, Elder Rise', 'Horde'),
    q('The Essence of Aku\'Mai', 'Je\'neu Sancrea', 'Ashenvale, Zoram\'gar Outpost', 'Horde'),
    q('Amongst the Ruins', 'Je\'neu Sancrea', 'Ashenvale, Zoram\'gar Outpost', 'Horde'),
  ],
  'Scarlet Monastery: Graveyard': [
    q('Vorrel\'s Revenge', 'Vorrel Sengutz', 'Inside the Scarlet Monastery Graveyard'),
  ],
  Gnomeregan: [
    q('Save Techbot!', 'Tinkmaster Overspark', 'Ironforge, Tinker Town', 'Alliance'),
    q('Gnogaine', 'Ozzie Togglevolt', 'Dun Morogh, Kharanos', 'Alliance'),
    q('The Only Cure is More Green Glow', 'Ozzie Togglevolt', 'Dun Morogh, Kharanos', 'Alliance'),
    q('Essential Artificials', 'Klockmort Spannerspan', 'Ironforge, Tinker Town', 'Alliance'),
    q('Data Rescue', 'Master Mechanic Castpipe', 'Ironforge, Tinker Town', 'Alliance'),
    q('Gyrodrillmatic Excavationators', 'Shoni the Shilent', 'Stormwind, Dwarven District', 'Alliance'),
    q('Rig Wars', 'Nogg', 'Orgrimmar, Valley of Honor', 'Horde'),
    q('A Fine Mess', 'Kernobee', 'Inside Gnomeregan, Clean Zone'),
  ],
  'Scarlet Monastery: Library': [
    q('Mythology of the Titans', 'Librarian Mae Paledust', 'Ironforge, Hall of Explorers', 'Alliance'),
    q('Compendium of the Fallen', 'Sage Truthseeker', 'Thunder Bluff, Elder Rise', 'Horde'),
    q('Hearts of Zeal', 'Master Apothecary Faranell', 'Undercity, The Apothecarium', 'Horde'),
    ...scarletLeaders,
  ],
  'Razorfen Kraul': [
    q('Blueleaf Tubers', 'Mebok Mizzyrix', 'The Barrens, Ratchet'),
    q('Willix the Importer', 'Willix the Importer', 'Inside Razorfen Kraul'),
    q('Mortality Wanes', 'Treshala Fallowbrook', 'Darnassus, Tradesmen\'s Terrace', 'Alliance'),
    q('The Crone of the Kraul', 'Falfindel Waywarder', 'Feralas, Thalanaar', 'Alliance'),
    q('Going, Going, Guano!', 'Master Apothecary Faranell', 'Undercity, The Apothecarium', 'Horde'),
    q('A Vengeful Fate', 'Auld Stonespire', 'Thunder Bluff, Elder Rise', 'Horde'),
  ],
  'Scarlet Monastery: Armory': [...scarletLeaders],
  'Scarlet Monastery: Cathedral': [...scarletLeaders],
  'Razorfen Downs': [
    q('Scourge of the Downs', 'Belnistrasz', 'Inside Razorfen Downs'),
    q('Extinguishing the Idol', 'Belnistrasz', 'Inside Razorfen Downs'),
    q('Bring the Light', 'Archbishop Benedictus', 'Stormwind, Cathedral of Light', 'Alliance'),
    q('A Host of Evil', 'Myriam Moonsinger', 'The Barrens, outside Razorfen Downs', 'Horde'),
    q('Bring the End', 'Andrew Brownell', 'Undercity, Magic Quarter', 'Horde'),
  ],
  Uldaman: [
    q('Power Stones', 'Rigglefuzz', 'Badlands, near the Uldaman dig site'),
    q('Solution to Doom', 'Theldurin the Lost', 'Badlands, Uldaman approach'),
    q('The Platinum Discs', 'Discs of Norgannon', 'Inside Uldaman, Hall of the Crafters'),
    q('The Lost Dwarves', 'Prospector Stormpike', 'Ironforge, Hall of Explorers', 'Alliance'),
    q('Reclaimed Treasures', 'Krom Stoutarm', 'Ironforge, Hall of Explorers', 'Alliance'),
    q('Necklace Recovery', 'Talvash del Kissel', 'Ironforge, The Mystic Ward', 'Alliance'),
    q('Uldaman Reagent Run', 'Jarkal Mossmeld', 'Badlands, Kargath', 'Horde'),
  ],
  'Zul\'Farrak': [
    q('Divino-matic Rod', 'Chief Engineer Bilgewhizzle', 'Tanaris, Gadgetzan'),
    q('Scarab Shells', 'Tran\'rek', 'Tanaris, Gadgetzan'),
    q('Troll Temper', 'Trenton Lighthammer', 'Tanaris, Gadgetzan'),
    q('The Prophecy of Mosh\'aru', 'Yeh\'kinya', 'Tanaris, Steamwheedle Port'),
    q('Gahz\'rilla', 'Wizzle Brassbolts', 'Thousand Needles, Mirage Raceway'),
    q('Tiara of the Deep', 'Tabetha', 'Dustwallow Marsh, Tabetha\'s Farm'),
    q('Nekrum\'s Medallion', 'Thadius Grimshade', 'Blasted Lands, Nethergarde Keep'),
  ],
  Maraudon: [
    q('Legends of Maraudon', 'Cavindra', 'Desolace, Maraudon (orange crystal entrance)'),
    q('Corruption of Earth and Seed', 'Keeper Marandis', 'Desolace, Nijel\'s Point', 'Alliance'),
    q('Corruption of Earth and Seed', 'Selendra', 'Desolace, Shadowprey Village', 'Horde'),
    q('The Pariah\'s Instructions', 'Centaur Pariah', 'Desolace, southern plains'),
    q('Twisted Evils', 'Willow', 'Desolace, near the Valley of Spears'),
    q('Shadowshard Fragments', 'Archmage Tervosh', 'Dustwallow Marsh, Theramore', 'Alliance'),
    q('Shadowshard Fragments', 'Uthel\'nay', 'Orgrimmar, Valley of Spirits', 'Horde'),
    q('Vyletongue Corruption', 'Talendria', 'Desolace, Nijel\'s Point', 'Alliance'),
    q('Vyletongue Corruption', 'Vark Battlescar', 'Desolace, Shadowprey Village', 'Horde'),
  ],
  'Sunken Temple': [
    q('The God Hakkar', 'Yeh\'kinya', 'Tanaris, Steamwheedle Port'),
    q('Haze of Evil', 'Muigin', 'Un\'Goro Crater, Marshal\'s Refuge'),
    q('Into The Temple of Atal\'Hakkar', 'Brohann Caskbelly', 'Stormwind, Dwarven District', 'Alliance'),
    q('Jammal\'an the Prophet', 'Atal\'ai Exile', 'The Hinterlands, Shadra\'Alor', 'Alliance'),
    q('The Temple of Atal\'Hakkar', 'Fel\'Zerul', 'Swamp of Sorrows, Stonard', 'Horde'),
  ],
  'Blackrock Depths': [
    q('Dark Iron Legacy', 'Franclorn Forgewright', 'Blackrock Mountain, by the Molten Bridge'),
    q('Attunement to the Core', 'Lothos Riftwaker', 'Blackrock Mountain, by the Molten Core portal'),
    q('Ribbly Screwspigot', 'Yuka Screwspigot', 'Burning Steppes, Flame Crest'),
    q('The Heart of the Mountain', 'Maxwort Uberglint', 'Burning Steppes, Flame Crest'),
    q('A Taste of Flame', 'Cyrus Therepentous', 'Burning Steppes, southern ridge'),
    q('The Rise of the Machines', 'Lotwil Veriatus', 'Badlands, near Kargath'),
    q('Royal Rescue', 'King Magni Bronzebeard', 'Ironforge, The High Seat', 'Alliance'),
    q('Hurley Blackbreath', 'Ragnar Thunderbrew', 'Dun Morogh, Kharanos', 'Alliance'),
    q('The Good Stuff', 'Oralius', 'Burning Steppes, Morgan\'s Vigil', 'Alliance'),
    q('Marshal Windsor', 'Marshal Maxwell', 'Burning Steppes, Morgan\'s Vigil', 'Alliance'),
    q('Incendius!', 'Jalinda Sprig', 'Burning Steppes, Morgan\'s Vigil', 'Alliance'),
    q('Incendius!', 'Thunderheart', 'Badlands, Kargath', 'Horde'),
    q('Commander Gor\'shak', 'Galamav the Marksman', 'Badlands, Kargath', 'Horde'),
    q('Lost Thunderbrew Recipe', 'Shadowmage Vivian Lagrave', 'Badlands, Kargath', 'Horde'),
    q('The Last Element', 'Shadowmage Vivian Lagrave', 'Badlands, Kargath', 'Horde'),
  ],
  'Dire Maul: East': [
    q('Pusillin and the Elder Azj\'Tordin', 'Azj\'Tordin', 'Feralas, Lariss Pavilion'),
    q('Shards of the Felvine', 'Rabine Saturna', 'Moonglade, Nighthaven'),
    q('Lethtendris\'s Web', 'Latronicus Moonspear', 'Feralas, Feathermoon Stronghold', 'Alliance'),
    q('Lethtendris\'s Web', 'Talo Thornhoof', 'Feralas, Camp Mojache', 'Horde'),
  ],
  'Lower Blackrock Spire': [
    q('Seal of Ascension', 'Vaelan', 'Inside Lower Blackrock Spire, near the entrance'),
    q('Kibler\'s Exotic Pets', 'Kibler', 'Burning Steppes, Flame Crest'),
    q('En-Ay-Es-Tee-Why', 'Kibler', 'Burning Steppes, Flame Crest'),
    q('Mother\'s Milk', 'Ragged John', 'Burning Steppes, north of Flame Crest'),
    q('Maxwell\'s Mission', 'Marshal Maxwell', 'Burning Steppes, Morgan\'s Vigil', 'Alliance'),
    q('Warlord\'s Command', 'Warlord Goretooth', 'Badlands, Kargath', 'Horde'),
  ],
  'Dire Maul: West': [
    q('The Madness Within', 'Shen\'dralar Ancient', 'Inside Dire Maul, the Athenaeum'),
  ],
  'Dire Maul: North': [
    q('Free Knot!', 'Knot Thimblejack', 'Inside Dire Maul North'),
    q('Unfinished Gordok Business', 'Captain Kromcrush', 'Inside Dire Maul North'),
  ],
  Scholomance: [
    q('Kirtonos the Herald', 'Eva Sarkhoff', 'Western Plaguelands, Caer Darrow'),
    q('Doctor Theolen Krastinov, the Butcher', 'Eva Sarkhoff', 'Western Plaguelands, Caer Darrow'),
    q('Krastinov\'s Bag of Horrors', 'Eva Sarkhoff', 'Western Plaguelands, Caer Darrow'),
    q('Dawn\'s Gambit', 'Betina Bigglezink', 'Eastern Plaguelands, Light\'s Hope Chapel'),
    q('Plagued Hatchlings', 'Alchemist Arbington', 'Western Plaguelands, Chillwind Camp', 'Alliance'),
    q('Plagued Hatchlings', 'Apothecary Dithers', 'Tirisfal Glades, The Bulwark', 'Horde'),
    q('Barov Family Fortune', 'Weldon Barov', 'Western Plaguelands, Chillwind Camp', 'Alliance'),
    q('Barov Family Fortune', 'Alexi Barov', 'Tirisfal Glades, The Bulwark', 'Horde'),
  ],
  Stratholme: [
    q('The Archivist', 'Duke Nicholas Zverenhoff', 'Eastern Plaguelands, Light\'s Hope Chapel'),
    q('Houses of the Holy', 'Leonid Barthalomew the Revered', 'Eastern Plaguelands, Light\'s Hope Chapel'),
    q('The Great Fras Siabi', 'Smokey LaRue', 'Eastern Plaguelands, Light\'s Hope Chapel'),
    q('The Flesh Does Not Lie', 'Betina Bigglezink', 'Eastern Plaguelands, Light\'s Hope Chapel'),
    q('The Active Agent', 'Betina Bigglezink', 'Eastern Plaguelands, Light\'s Hope Chapel'),
    q('Dead Man\'s Plea', 'Anthion Harmon', 'Eastern Plaguelands, outside Stratholme'),
    q('Aurius\' Reckoning', 'Aurius', 'Inside Stratholme'),
    q('Ramstein', 'Nathanos Blightcaller', 'Eastern Plaguelands, Marris Stead', 'Horde'),
  ],
  'Upper Blackrock Spire': [
    q('The Matron Protectorate', 'Haleh', 'Winterspring, Mazthoril'),
    q('General Drakkisath\'s Demise', 'Marshal Maxwell', 'Burning Steppes, Morgan\'s Vigil', 'Alliance'),
    q('For The Horde!', 'Thrall', 'Orgrimmar, Grommash Hold', 'Horde'),
  ],
};

/** The quests for this dungeon that a group of the given faction can pick up (all of them when it's null). */
export function questsFor(dungeon: string, faction: 'Alliance' | 'Horde' | null = null): DungeonQuest[] {
  const quests = DUNGEON_QUESTS[dungeon] ?? [];
  return faction ? quests.filter((quest) => quest.faction === 'Both' || quest.faction === faction) : quests;
}
