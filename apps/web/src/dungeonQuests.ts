/**
 * Quests that send you into a dungeon, shown as ! markers in the dungeon finder. These tend to carry the best rewards
 * for the level, so they're worth picking up before a run. Class quests are left out, as are quests that start from an
 * item dropped inside. The new WoW Forever dungeons' quests come from the mmonster.co dungeon quest list
 * (https://mmonster.co/wow-forever/guides/dungeons/quests); there, quests that start from an item are left out along
 * with their follow-ups, and some givers aren't on record yet.
 *
 * Quest IDs, whether a quest can be shared and the chain it belongs to come from the Questie addon's Classic quest
 * database (https://github.com/Questie/Questie, Database/Classic/classicQuestDB.lua at v9.0.0): shareable is the
 * QUEST_FLAGS_SHARABLE (8) bit of questFlags, and a chain follows the prerequisite links back to its first quest and
 * forward while exactly one quest follows on. The new Forever quests aren't in that database, so they have none of
 * this and link to a Wowhead search instead.
 */

/** Which faction can pick the quest up. */
export type QuestFaction = 'Alliance' | 'Horde' | 'Both';

export interface DungeonQuest {
  name: string;
  /** Who hands the quest out; null when it isn't known yet (some of the new Forever quests). */
  giver: string | null;
  /** Where to find them: zone, then the spot within it; null when it isn't known yet. */
  location: string | null;
  faction: QuestFaction;
  /** The quest's ID, for its Wowhead page; missing for the new Forever quests. */
  id?: number;
  /** Whether a party member can share it; unknown (missing) for the new Forever quests. */
  shareable?: boolean;
  /** Set when the quest is one step in a chain: its first and last quests and how many steps there are. */
  chain?: { length: number; first: QuestRef; last: QuestRef };
}

export interface QuestRef {
  id: number;
  name: string;
}

type QuestDetails = Pick<DungeonQuest, 'id' | 'shareable' | 'chain'>;

const q = (
  name: string,
  giver: string | null,
  location: string | null,
  faction: QuestFaction = 'Both',
  details: QuestDetails = {},
): DungeonQuest => ({ name, giver, location, faction, ...details });

/** The quest's Wowhead page, or a Wowhead search for it when its ID isn't known. */
export function wowheadQuestUrl(quest: { name: string; id?: number }): string {
  return quest.id
    ? `https://www.wowhead.com/classic/quest=${quest.id}`
    : `https://www.wowhead.com/classic/search?q=${encodeURIComponent(quest.name)}`;
}

// Kill-the-four-bosses quests that need a trip through several Scarlet Monastery wings.
const scarletLeaders = [
  q('In the Name of the Light', 'Raleigh the Devout', 'Hillsbrad Foothills, Southshore', 'Alliance', { id: 1053, shareable: true, chain: { length: 3, first: { id: 261, name: 'Down the Scarlet Path' }, last: { id: 1053, name: 'In the Name of the Light' } } }),
  q('Into the Scarlet Monastery', 'Varimathras', 'Undercity, Royal Quarter', 'Horde', { id: 1048, shareable: true }),
];

export const DUNGEON_QUESTS: Record<string, DungeonQuest[]> = {
  'Ragefire Chasm': [
    q('Testing an Enemy\'s Strength', 'Rahauro', 'Thunder Bluff, Elder Rise', 'Horde', { id: 5723, shareable: true }),
    q('Searching for the Lost Satchel', 'Rahauro', 'Thunder Bluff, Elder Rise', 'Horde', { id: 5722, shareable: true, chain: { length: 2, first: { id: 5722, name: 'Searching for the Lost Satchel' }, last: { id: 5724, name: 'Returning the Lost Satchel' } } }),
    q('The Power to Destroy...', 'Varimathras', 'Undercity, Royal Quarter', 'Horde', { id: 5725, shareable: true }),
    q('Hidden Enemies', 'Thrall', 'Orgrimmar, Grommash Hold', 'Horde', { id: 5728, shareable: true, chain: { length: 5, first: { id: 5726, name: 'Hidden Enemies' }, last: { id: 5730, name: 'Hidden Enemies' } } }),
    q('Slaying the Beast', 'Neeru Fireblade', 'Orgrimmar, Cleft of Shadow', 'Horde', { id: 5761, shareable: true }),
  ],
  'The Deadmines': [
    q('The Defias Brotherhood', 'Gryan Stoutmantle', 'Westfall, Sentinel Hill', 'Alliance', { id: 166, shareable: true, chain: { length: 7, first: { id: 65, name: 'The Defias Brotherhood' }, last: { id: 166, name: 'The Defias Brotherhood' } } }),
    q('Red Silk Bandanas', 'Scout Riell', 'Westfall, Sentinel Hill tower', 'Alliance', { id: 214, shareable: true, chain: { length: 7, first: { id: 65, name: 'The Defias Brotherhood' }, last: { id: 214, name: 'Red Silk Bandanas' } } }),
    q('Collecting Memories', 'Wilder Thistlenettle', 'Stormwind, Dwarven District', 'Alliance', { id: 168, shareable: true }),
    q('Oh Brother. . .', 'Wilder Thistlenettle', 'Stormwind, Dwarven District', 'Alliance', { id: 167, shareable: true }),
    q('Underground Assault', 'Shoni the Shilent', 'Stormwind, Dwarven District', 'Alliance', { id: 2040, shareable: true }),
  ],
  'Wailing Caverns': [
    q('Deviate Hides', 'Nalpak', 'The Barrens, cave above the Wailing Caverns entrance', 'Both', { id: 1486, shareable: true }),
    q('Deviate Eradication', 'Ebru', 'The Barrens, cave above the Wailing Caverns entrance', 'Both', { id: 1487, shareable: true }),
    q('Trouble at the Docks', 'Crane Operator Bigglefuzz', 'The Barrens, Ratchet', 'Both', { id: 959, shareable: true }),
    q('Smart Drinks', 'Mebok Mizzyrix', 'The Barrens, Ratchet', 'Both', { id: 1491, shareable: true, chain: { length: 2, first: { id: 865, name: 'Raptor Horns' }, last: { id: 1491, name: 'Smart Drinks' } } }),
    q('Leaders of the Fang', 'Nara Wildmane', 'Thunder Bluff, Elder Rise', 'Horde', { id: 914, shareable: true, chain: { length: 6, first: { id: 870, name: 'The Forgotten Pools' }, last: { id: 914, name: 'Leaders of the Fang' } } }),
    q('Serpentbloom', 'Apothecary Zamah', 'Thunder Bluff, Spirit Rise', 'Horde', { id: 962, shareable: true }),
  ],
  'Shadowfang Keep': [
    q('Deathstalkers in Shadowfang', 'High Executor Hadrec', 'Silverpine Forest, The Sepulcher', 'Horde', { id: 1098, shareable: true }),
    q('Arugal Must Die', 'Dalar Dawnweaver', 'Silverpine Forest, The Sepulcher', 'Horde', { id: 1014, shareable: true }),
    q('The Book of Ur', 'Keeper Bel\'dugur', 'Undercity, The Apothecarium', 'Horde', { id: 1013, shareable: true }),
  ],
  'The Stockade': [
    q('Quell The Uprising', 'Warden Thelwater', 'Stormwind, outside The Stockade', 'Alliance', { id: 387, shareable: true }),
    q('The Stockade Riots', 'Warden Thelwater', 'Stormwind, outside The Stockade', 'Alliance', { id: 391, shareable: true, chain: { length: 12, first: { id: 373, name: 'The Unsent Letter' }, last: { id: 396, name: 'An Audience with the King' } } }),
    q('The Color of Blood', 'Nikova Raskol', 'Stormwind, Old Town', 'Alliance', { id: 388, shareable: true }),
    q('Crime and Punishment', 'Councilman Millstipe', 'Duskwood, Darkshire', 'Alliance', { id: 377, shareable: true }),
    q('What Comes Around...', 'Guard Berton', 'Redridge Mountains, Lakeshire', 'Alliance', { id: 386, shareable: true }),
    q('The Fury Runs Deep', 'Motley Garmason', 'Wetlands, Dun Modr', 'Alliance', { id: 378, shareable: true, chain: { length: 2, first: { id: 303, name: 'The Dark Iron War' }, last: { id: 378, name: 'The Fury Runs Deep' } } }),
  ],
  'Blackfathom Deeps': [
    q('Knowledge in the Deeps', 'Gerrig Bonegrip', 'Ironforge, The Forlorn Cavern', 'Alliance', { id: 971, shareable: true }),
    q('Researching the Corruption', 'Gershala Nightwhisper', 'Darkshore, Auberdine', 'Alliance', { id: 1275, shareable: true, chain: { length: 2, first: { id: 3765, name: 'The Corruption Abroad' }, last: { id: 1275, name: 'Researching the Corruption' } } }),
    q('In Search of Thaelrid', 'Dawnwatcher Shaedlass', 'Darnassus, Craftsmen\'s Terrace', 'Alliance', { id: 1198, shareable: true, chain: { length: 2, first: { id: 1198, name: 'In Search of Thaelrid' }, last: { id: 1200, name: 'Blackfathom Villainy' } } }),
    q('Twilight Falls', 'Argent Guard Manados', 'Darnassus, Craftsmen\'s Terrace', 'Alliance', { id: 1199, shareable: true }),
    q('Blackfathom Villainy', 'Argent Guard Thaelrid', 'Inside Blackfathom Deeps', 'Alliance', { id: 1200, shareable: true, chain: { length: 2, first: { id: 1198, name: 'In Search of Thaelrid' }, last: { id: 1200, name: 'Blackfathom Villainy' } } }),
    q('Blackfathom Villainy', 'Bashana Runetotem', 'Thunder Bluff, Elder Rise', 'Horde', { id: 6561, shareable: true }),
    q('The Essence of Aku\'Mai', 'Je\'neu Sancrea', 'Ashenvale, Zoram\'gar Outpost', 'Horde', { id: 6563, shareable: true, chain: { length: 2, first: { id: 6562, name: 'Trouble in the Deeps' }, last: { id: 6563, name: 'The Essence of Aku\'Mai' } } }),
    q('Amongst the Ruins', 'Je\'neu Sancrea', 'Ashenvale, Zoram\'gar Outpost', 'Horde', { id: 6921, shareable: true }),
  ],
  'Scarlet Monastery: Graveyard': [
    q('Vorrel\'s Revenge', 'Vorrel Sengutz', 'Inside the Scarlet Monastery Graveyard', 'Both', { id: 1051, shareable: true }),
  ],
  Gnomeregan: [
    q('Save Techbot\'s Brain!', 'Tinkmaster Overspark', 'Ironforge, Tinker Town', 'Alliance', { id: 2922, shareable: true, chain: { length: 2, first: { id: 2923, name: 'Tinkmaster Overspark' }, last: { id: 2922, name: 'Save Techbot\'s Brain!' } } }),
    q('Gnogaine', 'Ozzie Togglevolt', 'Dun Morogh, Kharanos', 'Alliance', { id: 2926, shareable: false, chain: { length: 3, first: { id: 2927, name: 'The Day After' }, last: { id: 2962, name: 'The Only Cure is More Green Glow' } } }),
    q('The Only Cure is More Green Glow', 'Ozzie Togglevolt', 'Dun Morogh, Kharanos', 'Alliance', { id: 2962, shareable: false, chain: { length: 3, first: { id: 2927, name: 'The Day After' }, last: { id: 2962, name: 'The Only Cure is More Green Glow' } } }),
    q('Essential Artificials', 'Klockmort Spannerspan', 'Ironforge, Tinker Town', 'Alliance', { id: 2924, shareable: true }),
    q('Data Rescue', 'Master Mechanic Castpipe', 'Ironforge, Tinker Town', 'Alliance', { id: 2930, shareable: true }),
    q('Gyrodrillmatic Excavationators', 'Shoni the Shilent', 'Stormwind, Dwarven District', 'Alliance', { id: 2928, shareable: true }),
    q('Rig Wars', 'Nogg', 'Orgrimmar, Valley of Honor', 'Horde', { id: 2841, shareable: false }),
    q('A Fine Mess', 'Kernobee', 'Inside Gnomeregan, Clean Zone', 'Both', { id: 2904, shareable: false }),
  ],
  'Scarlet Monastery: Library': [
    q('Mythology of the Titans', 'Librarian Mae Paledust', 'Ironforge, Hall of Explorers', 'Alliance', { id: 1050, shareable: true }),
    q('Compendium of the Fallen', 'Sage Truthseeker', 'Thunder Bluff, Elder Rise', 'Horde', { id: 1049, shareable: true }),
    q('Hearts of Zeal', 'Master Apothecary Faranell', 'Undercity, The Apothecarium', 'Horde', { id: 1113, shareable: true, chain: { length: 2, first: { id: 1109, name: 'Going, Going, Guano!' }, last: { id: 1113, name: 'Hearts of Zeal' } } }),
    ...scarletLeaders,
  ],
  'Razorfen Kraul': [
    q('Blueleaf Tubers', 'Mebok Mizzyrix', 'The Barrens, Ratchet', 'Both', { id: 1221, shareable: false }),
    q('Willix the Importer', 'Willix the Importer', 'Inside Razorfen Kraul', 'Both', { id: 1144, shareable: false }),
    q('Mortality Wanes', 'Treshala Fallowbrook', 'Darnassus, Tradesmen\'s Terrace', 'Alliance', { id: 1142, shareable: true }),
    q('The Crone of the Kraul', 'Falfindel Waywarder', 'Feralas, Thalanaar', 'Alliance', { id: 1101, shareable: true, chain: { length: 2, first: { id: 1100, name: 'Lonebrow\'s Journal' }, last: { id: 1101, name: 'The Crone of the Kraul' } } }),
    q('Going, Going, Guano!', 'Master Apothecary Faranell', 'Undercity, The Apothecarium', 'Horde', { id: 1109, shareable: true, chain: { length: 2, first: { id: 1109, name: 'Going, Going, Guano!' }, last: { id: 1113, name: 'Hearts of Zeal' } } }),
    q('A Vengeful Fate', 'Auld Stonespire', 'Thunder Bluff, Elder Rise', 'Horde', { id: 1102, shareable: true }),
  ],
  'Scarlet Monastery: Armory': [...scarletLeaders],
  'Scarlet Monastery: Cathedral': [...scarletLeaders],
  'Razorfen Downs': [
    q('Scourge of the Downs', 'Belnistrasz', 'Inside Razorfen Downs', 'Both', { id: 3523, shareable: false, chain: { length: 2, first: { id: 3523, name: 'Scourge of the Downs' }, last: { id: 3525, name: 'Extinguishing the Idol' } } }),
    q('Extinguishing the Idol', 'Belnistrasz', 'Inside Razorfen Downs', 'Both', { id: 3525, shareable: false, chain: { length: 2, first: { id: 3523, name: 'Scourge of the Downs' }, last: { id: 3525, name: 'Extinguishing the Idol' } } }),
    q('Bring the Light', 'Archbishop Benedictus', 'Stormwind, Cathedral of Light', 'Alliance', { id: 3636, shareable: false }),
    q('A Host of Evil', 'Myriam Moonsinger', 'The Barrens, outside Razorfen Downs', 'Horde', { id: 6626, shareable: true }),
    q('Bring the End', 'Andrew Brownell', 'Undercity, Magic Quarter', 'Horde', { id: 3341, shareable: true }),
  ],
  Uldaman: [
    q('Power Stones', 'Rigglefuzz', 'Badlands, near the Uldaman dig site', 'Both', { id: 2418, shareable: true }),
    q('Solution to Doom', 'Theldurin the Lost', 'Badlands, Uldaman approach', 'Both', { id: 709, shareable: true }),
    q('The Platinum Discs', 'Discs of Norgannon', 'Inside Uldaman, Hall of the Crafters', 'Both', { id: 2278, shareable: false }),
    q('The Lost Dwarves', 'Prospector Stormpike', 'Ironforge, Hall of Explorers', 'Alliance', { id: 2398, shareable: true, chain: { length: 2, first: { id: 2398, name: 'The Lost Dwarves' }, last: { id: 2240, name: 'The Hidden Chamber' } } }),
    q('Reclaimed Treasures', 'Krom Stoutarm', 'Ironforge, Hall of Explorers', 'Alliance', { id: 1360, shareable: true }),
    q('Back to Uldaman', 'Talvash del Kissel', 'Ironforge, The Mystic Ward', 'Alliance', { id: 2200, shareable: false, chain: { length: 6, first: { id: 2198, name: 'The Shattered Necklace' }, last: { id: 2361, name: 'Restoring the Necklace' } } }),
    q('Uldaman Reagent Run', 'Jarkal Mossmeld', 'Badlands, Kargath', 'Horde', { id: 2202, shareable: true, chain: { length: 3, first: { id: 2258, name: 'Badlands Reagent Run' }, last: { id: 2203, name: 'Badlands Reagent Run II' } } }),
  ],
  'Zul\'Farrak': [
    q('Divino-matic Rod', 'Chief Engineer Bilgewhizzle', 'Tanaris, Gadgetzan', 'Both', { id: 2768, shareable: true }),
    q('Scarab Shells', 'Tran\'rek', 'Tanaris, Gadgetzan', 'Both', { id: 2865, shareable: true, chain: { length: 2, first: { id: 2864, name: 'Tran\'rek' }, last: { id: 2865, name: 'Scarab Shells' } } }),
    q('Troll Temper', 'Trenton Lighthammer', 'Tanaris, Gadgetzan', 'Both', { id: 3042, shareable: true }),
    q('The Prophecy of Mosh\'aru', 'Yeh\'kinya', 'Tanaris, Steamwheedle Port', 'Both', { id: 3527, shareable: true, chain: { length: 8, first: { id: 3520, name: 'Screecher Spirits' }, last: { id: 8182, name: 'The Hand of Rastakhan' } } }),
    q('Gahz\'rilla', 'Wizzle Brassbolts', 'Thousand Needles, Mirage Raceway', 'Both', { id: 2770, shareable: true }),
    q('Tiara of the Deep', 'Tabetha', 'Dustwallow Marsh, Tabetha\'s Farm', 'Both', { id: 2846, shareable: true }),
    q('Nekrum\'s Medallion', 'Thadius Grimshade', 'Blasted Lands, Nethergarde Keep', 'Both', { id: 2991, shareable: true, chain: { length: 7, first: { id: 2988, name: 'Witherbark Cages' }, last: { id: 2994, name: 'Saving Sharpbeak' } } }),
  ],
  Maraudon: [
    q('Legends of Maraudon', 'Cavindra', 'Desolace, Maraudon (orange crystal entrance)', 'Both', { id: 7044, shareable: true, chain: { length: 2, first: { id: 7044, name: 'Legends of Maraudon' }, last: { id: 7046, name: 'The Scepter of Celebras' } } }),
    q('Corruption of Earth and Seed', 'Keeper Marandis', 'Desolace, Nijel\'s Point', 'Alliance', { id: 7065, shareable: true }),
    q('Corruption of Earth and Seed', 'Selendra', 'Desolace, Shadowprey Village', 'Horde', { id: 7064, shareable: true }),
    q('The Pariah\'s Instructions', 'Centaur Pariah', 'Desolace, southern plains', 'Both', { id: 7067, shareable: false }),
    q('Twisted Evils', 'Willow', 'Desolace, near the Valley of Spears', 'Both', { id: 7028, shareable: true }),
    q('Shadowshard Fragments', 'Archmage Tervosh', 'Dustwallow Marsh, Theramore', 'Alliance', { id: 7070, shareable: true }),
    q('Shadowshard Fragments', 'Uthel\'nay', 'Orgrimmar, Valley of Spirits', 'Horde', { id: 7068, shareable: true }),
    q('Vyletongue Corruption', 'Talendria', 'Desolace, Nijel\'s Point', 'Alliance', { id: 7041, shareable: false }),
    q('Vyletongue Corruption', 'Vark Battlescar', 'Desolace, Shadowprey Village', 'Horde', { id: 7029, shareable: false }),
  ],
  'Sunken Temple': [
    q('The God Hakkar', 'Yeh\'kinya', 'Tanaris, Steamwheedle Port', 'Both', { id: 3528, shareable: false, chain: { length: 8, first: { id: 3520, name: 'Screecher Spirits' }, last: { id: 8182, name: 'The Hand of Rastakhan' } } }),
    q('Haze of Evil', 'Muigin', 'Un\'Goro Crater, Marshal\'s Refuge', 'Both', { id: 4143, shareable: true, chain: { length: 4, first: { id: 4141, name: 'Muigin and Larion' }, last: { id: 4144, name: 'Bloodpetal Sprouts' } } }),
    q('Into The Temple of Atal\'Hakkar', 'Brohann Caskbelly', 'Stormwind, Dwarven District', 'Alliance', { id: 1475, shareable: true, chain: { length: 7, first: { id: 1448, name: 'In Search of The Temple' }, last: { id: 1475, name: 'Into The Temple of Atal\'Hakkar' } } }),
    q('Jammal\'an the Prophet', 'Atal\'ai Exile', 'The Hinterlands, Shadra\'Alor', 'Alliance', { id: 1446, shareable: true }),
    q('The Temple of Atal\'Hakkar', 'Fel\'Zerul', 'Swamp of Sorrows, Stonard', 'Horde', { id: 1445, shareable: true, chain: { length: 4, first: { id: 1424, name: 'Pool of Tears' }, last: { id: 1445, name: 'The Temple of Atal\'Hakkar' } } }),
  ],
  'Blackrock Depths': [
    q('Dark Iron Legacy', 'Franclorn Forgewright', 'Blackrock Mountain, by the Molten Bridge', 'Both', { id: 3802, shareable: true, chain: { length: 2, first: { id: 3801, name: 'Dark Iron Legacy' }, last: { id: 3802, name: 'Dark Iron Legacy' } } }),
    q('Attunement to the Core', 'Lothos Riftwaker', 'Blackrock Mountain, by the Molten Core portal', 'Both', { id: 7848, shareable: false }),
    q('Ribbly Screwspigot', 'Yuka Screwspigot', 'Burning Steppes, Flame Crest', 'Both', { id: 4136, shareable: true, chain: { length: 2, first: { id: 4324, name: 'Yuka Screwspigot' }, last: { id: 4136, name: 'Ribbly Screwspigot' } } }),
    q('The Heart of the Mountain', 'Maxwort Uberglint', 'Burning Steppes, Flame Crest', 'Both', { id: 4123, shareable: true }),
    q('A Taste of Flame', 'Cyrus Therepentous', 'Burning Steppes, southern ridge', 'Both', { id: 4024, shareable: false, chain: { length: 11, first: { id: 3441, name: 'Divine Retribution' }, last: { id: 4024, name: 'A Taste of Flame' } } }),
    q('The Rise of the Machines', 'Lotwil Veriatus', 'Badlands, near Kargath', 'Both', { id: 4063, shareable: true, chain: { length: 3, first: { id: 4061, name: 'The Rise of the Machines' }, last: { id: 4063, name: 'The Rise of the Machines' } } }),
    q('The Fate of the Kingdom', 'King Magni Bronzebeard', 'Ironforge, The High Seat', 'Alliance', { id: 4362, shareable: true, chain: { length: 6, first: { id: 3702, name: 'The Smoldering Ruins of Thaurissan' }, last: { id: 4363, name: 'The Princess\'s Surprise' } } }),
    q('Hurley Blackbreath', 'Ragnar Thunderbrew', 'Dun Morogh, Kharanos', 'Alliance', { id: 4126, shareable: true, chain: { length: 2, first: { id: 4128, name: 'Ragnar Thunderbrew' }, last: { id: 4126, name: 'Hurley Blackbreath' } } }),
    q('The Good Stuff', 'Oralius', 'Burning Steppes, Morgan\'s Vigil', 'Alliance', { id: 4286, shareable: true }),
    q('Marshal Windsor', 'Marshal Maxwell', 'Burning Steppes, Morgan\'s Vigil', 'Alliance', { id: 4241, shareable: true, chain: { length: 16, first: { id: 4182, name: 'Dragonkin Menace' }, last: { id: 6502, name: 'Drakefire Amulet' } } }),
    q('Incendius!', 'Jalinda Sprig', 'Burning Steppes, Morgan\'s Vigil', 'Alliance', { id: 4263, shareable: true, chain: { length: 2, first: { id: 4262, name: 'Overmaster Pyron' }, last: { id: 4263, name: 'Incendius!' } } }),
    q('Disharmony of Fire', 'Thunderheart', 'Badlands, Kargath', 'Horde', { id: 3907, shareable: true, chain: { length: 2, first: { id: 3906, name: 'Disharmony of Flame' }, last: { id: 3907, name: 'Disharmony of Fire' } } }),
    q('Commander Gor\'shak', 'Galamav the Marksman', 'Badlands, Kargath', 'Horde', { id: 3981, shareable: true, chain: { length: 2, first: { id: 3906, name: 'Disharmony of Flame' }, last: { id: 3981, name: 'Commander Gor\'shak' } } }),
    q('Lost Thunderbrew Recipe', 'Shadowmage Vivian Lagrave', 'Badlands, Kargath', 'Horde', { id: 4134, shareable: true, chain: { length: 2, first: { id: 4133, name: 'Vivian Lagrave' }, last: { id: 4134, name: 'Lost Thunderbrew Recipe' } } }),
    q('The Last Element', 'Shadowmage Vivian Lagrave', 'Badlands, Kargath', 'Horde', { id: 7201, shareable: true }),
  ],
  'Dire Maul: East': [
    q('Pusillin and the Elder Azj\'Tordin', 'Azj\'Tordin', 'Feralas, Lariss Pavilion', 'Both', { id: 7441, shareable: true }),
    q('Shards of the Felvine', 'Rabine Saturna', 'Moonglade, Nighthaven', 'Both', { id: 5526, shareable: false, chain: { length: 2, first: { id: 5527, name: 'A Reliquary of Purity' }, last: { id: 5526, name: 'Shards of the Felvine' } } }),
    q('Lethtendris\'s Web', 'Latronicus Moonspear', 'Feralas, Feathermoon Stronghold', 'Alliance', { id: 7488, shareable: true, chain: { length: 2, first: { id: 7494, name: 'Feathermoon Stronghold' }, last: { id: 7488, name: 'Lethtendris\'s Web' } } }),
    q('Lethtendris\'s Web', 'Talo Thornhoof', 'Feralas, Camp Mojache', 'Horde', { id: 7489, shareable: true, chain: { length: 2, first: { id: 7492, name: 'Camp Mojache' }, last: { id: 7489, name: 'Lethtendris\'s Web' } } }),
  ],
  'Lower Blackrock Spire': [
    q('Seal of Ascension', 'Vaelan', 'Inside Lower Blackrock Spire, near the entrance', 'Both', { id: 4742, shareable: true, chain: { length: 2, first: { id: 4742, name: 'Seal of Ascension' }, last: { id: 4743, name: 'Seal of Ascension' } } }),
    q('Kibler\'s Exotic Pets', 'Kibler', 'Burning Steppes, Flame Crest', 'Both', { id: 4729, shareable: false }),
    q('En-Ay-Es-Tee-Why', 'Kibler', 'Burning Steppes, Flame Crest', 'Both', { id: 4862, shareable: true }),
    q('Mother\'s Milk', 'Ragged John', 'Burning Steppes, north of Flame Crest', 'Both', { id: 4866, shareable: true }),
    q('Maxwell\'s Mission', 'Marshal Maxwell', 'Burning Steppes, Morgan\'s Vigil', 'Alliance', { id: 5081, shareable: true, chain: { length: 3, first: { id: 5001, name: 'Bijou\'s Belongings' }, last: { id: 5081, name: 'Maxwell\'s Mission' } } }),
    q('Warlord\'s Command', 'Warlord Goretooth', 'Badlands, Kargath', 'Horde', { id: 4903, shareable: false, chain: { length: 8, first: { id: 4903, name: 'Warlord\'s Command' }, last: { id: 6570, name: 'Emberstrife' } } }),
  ],
  'Dire Maul: West': [
    q('The Madness Within', 'Shen\'dralar Ancient', 'Inside Dire Maul, the Athenaeum', 'Both', { id: 7461, shareable: true }),
  ],
  'Dire Maul: North': [
    q('Free Knot!', 'Knot Thimblejack', 'Inside Dire Maul North', 'Both', { id: 5525, shareable: true }),
    q('Unfinished Gordok Business', 'Captain Kromcrush', 'Inside Dire Maul North', 'Both', { id: 7703, shareable: false }),
  ],
  Scholomance: [
    q('Kirtonos the Herald', 'Eva Sarkhoff', 'Western Plaguelands, Caer Darrow', 'Both', { id: 5384, shareable: false, chain: { length: 9, first: { id: 5382, name: 'Doctor Theolen Krastinov, the Butcher' }, last: { id: 5466, name: 'The Lich, Ras Frostwhisper' } } }),
    q('Doctor Theolen Krastinov, the Butcher', 'Eva Sarkhoff', 'Western Plaguelands, Caer Darrow', 'Both', { id: 5382, shareable: true, chain: { length: 9, first: { id: 5382, name: 'Doctor Theolen Krastinov, the Butcher' }, last: { id: 5466, name: 'The Lich, Ras Frostwhisper' } } }),
    q('Krastinov\'s Bag of Horrors', 'Eva Sarkhoff', 'Western Plaguelands, Caer Darrow', 'Both', { id: 5515, shareable: true, chain: { length: 9, first: { id: 5382, name: 'Doctor Theolen Krastinov, the Butcher' }, last: { id: 5466, name: 'The Lich, Ras Frostwhisper' } } }),
    q('Dawn\'s Gambit', 'Betina Bigglezink', 'Eastern Plaguelands, Light\'s Hope Chapel', 'Both', { id: 4771, shareable: false, chain: { length: 9, first: { id: 4726, name: 'Broodling Essence' }, last: { id: 4771, name: 'Dawn\'s Gambit' } } }),
    q('Plagued Hatchlings', 'Alchemist Arbington', 'Western Plaguelands, Chillwind Camp', 'Alliance', { id: 5529, shareable: true }),
    q('Plagued Hatchlings', 'Apothecary Dithers', 'Tirisfal Glades, The Bulwark', 'Horde', { id: 5529, shareable: true }),
    q('Barov Family Fortune', 'Weldon Barov', 'Western Plaguelands, Chillwind Camp', 'Alliance', { id: 5343, shareable: true, chain: { length: 2, first: { id: 5343, name: 'Barov Family Fortune' }, last: { id: 5344, name: 'The Last Barov' } } }),
    q('Barov Family Fortune', 'Alexi Barov', 'Tirisfal Glades, The Bulwark', 'Horde', { id: 5341, shareable: true, chain: { length: 2, first: { id: 5341, name: 'Barov Family Fortune' }, last: { id: 5342, name: 'The Last Barov' } } }),
  ],
  Stratholme: [
    q('The Archivist', 'Duke Nicholas Zverenhoff', 'Eastern Plaguelands, Light\'s Hope Chapel', 'Both', { id: 5251, shareable: true, chain: { length: 5, first: { id: 5251, name: 'The Archivist' }, last: { id: 5265, name: 'The Argent Hold' } } }),
    q('Houses of the Holy', 'Leonid Barthalomew the Revered', 'Eastern Plaguelands, Light\'s Hope Chapel', 'Both', { id: 5243, shareable: true }),
    q('The Great Fras Siabi', 'Smokey LaRue', 'Eastern Plaguelands, Light\'s Hope Chapel', 'Both', { id: 5214, shareable: true }),
    q('The Flesh Does Not Lie', 'Betina Bigglezink', 'Eastern Plaguelands, Light\'s Hope Chapel', 'Both', { id: 5212, shareable: true, chain: { length: 2, first: { id: 5212, name: 'The Flesh Does Not Lie' }, last: { id: 5213, name: 'The Active Agent' } } }),
    q('The Active Agent', 'Betina Bigglezink', 'Eastern Plaguelands, Light\'s Hope Chapel', 'Both', { id: 5213, shareable: true, chain: { length: 2, first: { id: 5212, name: 'The Flesh Does Not Lie' }, last: { id: 5213, name: 'The Active Agent' } } }),
    q('Dead Man\'s Plea', 'Anthion Harmon', 'Eastern Plaguelands, outside Stratholme', 'Both', { id: 8945, shareable: true, chain: { length: 8, first: { id: 8929, name: 'In Search of Anthion' }, last: { id: 9015, name: 'The Challenge' } } }),
    q('Aurius\' Reckoning', 'Aurius', 'Inside Stratholme', 'Both', { id: 5125, shareable: true }),
    q('Ramstein', 'Nathanos Blightcaller', 'Eastern Plaguelands, Marris Stead', 'Horde', { id: 6163, shareable: true, chain: { length: 3, first: { id: 6133, name: 'The Ranger Lord\'s Behest' }, last: { id: 6163, name: 'Ramstein' } } }),
  ],
  'Upper Blackrock Spire': [
    q('The Matron Protectorate', 'Haleh', 'Winterspring, Mazthoril', 'Both', { id: 5160, shareable: false, chain: { length: 4, first: { id: 5160, name: 'The Matron Protectorate' }, last: { id: 5164, name: 'Catalogue of the Wayward' } } }),
    q('General Drakkisath\'s Demise', 'Marshal Maxwell', 'Burning Steppes, Morgan\'s Vigil', 'Alliance', { id: 5102, shareable: true, chain: { length: 2, first: { id: 5089, name: 'General Drakkisath\'s Command' }, last: { id: 5102, name: 'General Drakkisath\'s Demise' } } }),
    q('For The Horde!', 'Thrall', 'Orgrimmar, Grommash Hold', 'Horde', { id: 4974, shareable: true, chain: { length: 8, first: { id: 4903, name: 'Warlord\'s Command' }, last: { id: 6570, name: 'Emberstrife' } } }),
  ],

  // New WoW Forever dungeons.
  'Hall of Thanes': [
    q('A Visitor to Dun Morogh', 'Beldin Steelgrill', 'Dun Morogh', 'Alliance'),
    q('Farsen\'s Watch', 'Earthseer Farsen', 'Dun Morogh', 'Alliance'),
    q('Nip \'Em in the Bud', 'Earthseer Farsen', 'Dun Morogh', 'Alliance'),
    q('An Ancient Grudge', 'Ghostly Attendant', 'Inside Hall of Thanes', 'Both'),
    q('Important Heirlooms', 'Thom Filch', 'Ironforge', 'Both'),
    q('The Restless Dead', 'Afadra Dunwall', 'Ironforge', 'Alliance'),
  ],
  'Ruins of Lordaeron': [
    q('Abominable Creatures', 'Captain Truman', 'Inside Ruins of Lordaeron', 'Alliance'),
    q('A Frightened Request', 'Tabitha Heartweaver', 'Silverpine Forest', 'Horde'),
    q('Light\'s Justice', 'Morbin Lightbane', 'Undercity', 'Horde'),
    q('The Wrath of Rath\'mael', 'Deathguard Kristof', 'Tirisfal Glades', 'Horde'),
    q('The New Plague', 'Theodore Griffs', 'Undercity', 'Horde'),
  ],
  'Excavation Site': [
    q('Highland Hides', 'James Halloran', 'Wetlands', 'Alliance'),
    q('Changing Tastes', 'Borstan', 'Orgrimmar', 'Horde'),
    q('Dragonmaw Rumors', 'Zaruk', 'Arathi Highlands', 'Horde'),
    q('Fallen in the Fen', 'Daewyn Songblade', 'Inside Excavation Site', 'Alliance'),
    q('Heartwoven', 'Ardin Grassman', 'Inside Excavation Site', 'Alliance'),
    q('Horrors in the Highland', 'Rethiel the Greenwarden', 'Wetlands', 'Alliance'),
    q('Lost in the Thicket Things', 'Caitlin Grassman', 'Wetlands', 'Alliance'),
    q('Open the Maw', 'Deathstalker Agent', 'Wetlands', 'Horde'),
    q('Seeking Caitlin', 'Llana', 'Ashenvale', 'Alliance'),
    q('Songblade Search', 'Dorin Songblade', 'Redridge Mountains', 'Alliance'),
  ],
  'City of Dalaran': [
    q('Prison Break In', 'Magus Wordeen Voidglare', 'Hillsbrad Foothills', 'Horde'),
    q('A Green Sample', 'Shylamiir', 'Stormwind City', 'Alliance'),
    q('Friend of the Kirin Tor', 'Image of Archmage Modera', 'Silverpine Forest', 'Alliance'),
    q('Heart of Disruption', 'Image of Archmage Modera', 'Silverpine Forest', 'Alliance'),
    q('Heart of Disruption', 'Image of Archmage Modera', 'Silverpine Forest', 'Horde'),
    q('Opportunistic Education', 'Rexxie Copperclutch', null, 'Horde'),
    q('Power Overwhelming', 'High Sorcerer Andromath', 'Stormwind City', 'Alliance'),
    q('Shrewd Negotiations', 'Magus Wordeen Voidglare', 'Hillsbrad Foothills', 'Horde'),
    q('Source of Power', 'Doctor Martin Felben', 'Undercity', 'Horde'),
    q('Starving Arcane', 'Image of Archmage Modera', 'Silverpine Forest', 'Alliance'),
    q('The Grave Knight', 'Melisara', 'Hillsbrad Foothills', 'Horde'),
    q('An Alarming Request', 'Emissary Jacques', 'Hillsbrad Foothills', 'Alliance'),
    q('Key to the City', 'Magus Wordeen Voidglare', 'Hillsbrad Foothills', 'Horde'),
    q('Blood in the Streets', 'Magus Wordeen Voidglare', 'Hillsbrad Foothills', 'Horde'),
  ],
  'The Drowned City': [
    q('The Only Good Brinescale...', null, null, 'Horde'),
    q('Ancient Gurubashi Idol', 'Mazu\'kon', 'Mulgore', 'Horde'),
    q('Magics of the Drowned City', null, null, 'Alliance'),
    q('Take Two With Water', 'Loremaster Dibbs', 'Hillsbrad Foothills', 'Alliance'),
    q('The Drowned City', null, null, 'Horde'),
    q('Ancient Gurubashi Secrets', null, null, 'Alliance'),
    q('Shady Saltseers', null, null, 'Both'),
    q('The Saltseer Captain', null, null, 'Both'),
  ],
  'Krol’dok Stronghold': [
    q('Key Ingredients', null, null, 'Horde'),
    q('Key Ingredients', 'Alphonse Dumas', null, 'Alliance'),
    q('Krol\'dok Moulding', null, null, 'Horde'),
    q('Krol\'dok Moulding', null, null, 'Alliance'),
    q('A Token of Vengeance', null, null, 'Horde'),
    q('Curios of Curiosity', null, null, 'Alliance'),
    q('Twilight Mementos', null, null, 'Alliance'),
    q('Tome of Twilight', null, null, 'Horde'),
    q('Tome of Twilight', null, null, 'Alliance'),
    q('Eye of Mugg', null, null, 'Horde'),
    q('Eye of Mugg', null, null, 'Alliance'),
    q('Vengeance of the Highborne', null, null, 'Alliance'),
  ],
  'Alcaz Prison': [
    q('The Dragon\'s Journal', null, null, 'Alliance'),
  ],
  'Blackmaw Hold': [
    q('Get to the Roots of It', null, null, 'Horde'),
    q('Get to the Roots of It', null, null, 'Alliance'),
    q('Claws That Rend, Tusks that Gore', null, null, 'Both'),
    q('Blackmaw Magic', null, null, 'Alliance'),
    q('Blackmaw Magic', null, null, 'Horde'),
  ],
  'Shaper’s Terrace': [
    q('Crystalline Elements', null, null, 'Horde'),
  ],
};

/** The quests for this dungeon that a group of the given faction can pick up (all of them when it's null). */
export function questsFor(dungeon: string, faction: 'Alliance' | 'Horde' | null = null): DungeonQuest[] {
  const quests = DUNGEON_QUESTS[dungeon] ?? [];
  return faction ? quests.filter((quest) => quest.faction === 'Both' || quest.faction === faction) : quests;
}
