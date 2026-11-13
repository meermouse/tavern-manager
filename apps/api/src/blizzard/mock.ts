import { RULESETS, type BlizzardClient, type CharacterProfile } from './client.js';
import { mockPortraits } from './portrait.js';

const CLASSES = ['Warrior', 'Paladin', 'Hunter', 'Rogue', 'Priest', 'Shaman', 'Mage', 'Warlock', 'Druid'];
const RACES = ['Human', 'Dwarf', 'Night Elf', 'Gnome', 'Orc', 'Undead', 'Tauren', 'Troll'];

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// Gear unlocks as the (drifting) mock level rises, so local dev produces loot posts over time.
const MOCK_GEAR = [
  {
    id: 900001, name: 'Frayed Tavern Apron', quality: 'COMMON', slot: 'Chest', minLevel: 1,
    itemType: 'Cloth', armor: '8 Armor', durability: 'Durability 40 / 40',
    description: 'Smells faintly of spilled ale.',
  },
  {
    id: 900002, name: 'Bracers of the Bar Brawl', quality: 'UNCOMMON', slot: 'Wrists', minLevel: 12,
    itemType: 'Leather', binding: 'Binds when equipped', armor: '31 Armor', stats: ['+3 Strength', '+2 Stamina'],
    durability: 'Durability 30 / 30', requirement: 'Requires Level 12',
  },
  {
    id: 900003, name: 'Stoutheart Pauldrons', quality: 'RARE', slot: 'Shoulders', minLevel: 22,
    itemType: 'Mail', binding: 'Binds when picked up', armor: '182 Armor', stats: ['+8 Stamina', '+6 Strength'],
    durability: 'Durability 70 / 70', requirement: 'Requires Level 22',
  },
  {
    id: 900004, name: 'Ring of Last Orders', quality: 'RARE', slot: 'Finger', minLevel: 34,
    binding: 'Binds when picked up', unique: 'Unique', stats: ['+7 Agility', '+5 Stamina'],
    effects: ['Equip: Improves your chance to get a critical strike by 1%.'], requirement: 'Requires Level 34',
  },
  {
    id: 900005, name: 'Cloak of the Long Night', quality: 'RARE', slot: 'Back', minLevel: 46,
    itemType: 'Cloth', binding: 'Binds when equipped', armor: '42 Armor', stats: ['+9 Intellect', '+8 Spirit'],
    requirement: 'Requires Level 46', description: 'Woven after closing time.',
  },
  {
    id: 900006, name: 'Hearthfire Greatblade', quality: 'EPIC', slot: 'Main Hand', minLevel: 52,
    itemType: 'Two-Handed Sword', binding: 'Binds when picked up',
    weapon: ['118 - 178 Damage', 'Speed 3.40', '(43.5 damage per second)'], stats: ['+19 Strength', '+15 Stamina'],
    effects: ['Chance on hit: Sets the target ablaze for 120 Fire damage over 6 sec.'],
    durability: 'Durability 120 / 120', requirement: 'Requires Level 52',
  },
  {
    id: 900007, name: 'Crown of the Innkeeper', quality: 'EPIC', slot: 'Head', minLevel: 58,
    itemType: 'Plate', binding: 'Binds when picked up', armor: '641 Armor', stats: ['+24 Stamina', '+16 Strength'],
    effects: ['Equip: Restores 6 health per 5 sec.'], set: "The Innkeeper's Regalia (1/5)",
    durability: 'Durability 100 / 100', requirement: 'Requires Level 58', description: 'Last orders, please.',
  },
];

const HORDE = new Set(['Orc', 'Undead', 'Tauren', 'Troll']);
const GUILDS = ['The Foaming Tankards', 'Last Orders', 'Hearth & Home', null];
const TITLES = [null, '{name} the Explorer', 'Private {name}', '{name} of the Tavern'];

const MOCK_ACHIEVEMENTS = [10, 20, 30, 40, 50, 60].map((level) => ({ id: 800000 + level, name: `Level ${level}`, level }));

const PRIMARY_PROFESSIONS = [
  'Alchemy', 'Blacksmithing', 'Enchanting', 'Engineering', 'Herbalism', 'Leatherworking', 'Mining', 'Skinning', 'Tailoring',
];
const SECONDARY_PROFESSIONS = ['Cooking', 'First Aid', 'Fishing'];

/** Classic rank caps: Apprentice 75, Journeyman 150, Expert 225, Artisan 300. */
function rankCap(skill: number): number {
  return Math.min(300, Math.max(75, Math.ceil((skill + 1) / 75) * 75));
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Deterministic fake data for local development without Blizzard credentials.
 * Names containing "pending" behave like low-level characters the API doesn't return yet.
 */
export function createMockBlizzardClient(): BlizzardClient {
  const client: BlizzardClient = {
    async getCharacter(region, name, surname): Promise<CharacterProfile | null> {
      if (/pending/i.test(name) || /pending/i.test(surname)) return null;
      const h = hash(`${region}:${name.toLowerCase()}-${surname.toLowerCase()}`);
      // Levels drift upwards over time so "refresh" visibly does something.
      const dayBump = Math.floor(Date.now() / 86_400_000) % 5;
      const race = RACES[(h >>> 4) % RACES.length];
      const level = Math.min(60, 10 + ((h >>> 8) % 46) + dayBump);
      const title = TITLES[(h >>> 18) % TITLES.length];
      return {
        name: capitalise(name),
        surname: capitalise(surname),
        class: CLASSES[h % CLASSES.length],
        race,
        level,
        ruleset: RULESETS[(h >>> 12) % RULESETS.length],
        lastLoginAt: null,
        guild: GUILDS[(h >>> 16) % GUILDS.length],
        faction: HORDE.has(race) ? 'Horde' : 'Alliance',
        gender: (h >>> 20) % 2 ? 'Female' : 'Male',
        title: title && title.replace('{name}', capitalise(name)),
        itemLevel: Math.round(level * 1.05),
        achievementPoints: Math.floor(level / 10) * 10,
      };
    },
    async getAccountCharacters() {
      return [
        { name: 'Judgement', surname: 'Judy' },
        { name: 'Grimble', surname: 'Thornwick' },
        { name: 'Pendingly', surname: 'Lowbie' },
      ];
    },
    async getEquipment(region, name, surname) {
      const level = (await client.getCharacter(region, name, surname))?.level;
      if (level == null) return null;
      return MOCK_GEAR.filter((g) => g.minLevel <= level).map(({ minLevel, ...g }) => ({
        ...g,
        itemLevel: minLevel + 5,
      }));
    },
    async getMedia(region, name, surname) {
      const profile = await client.getCharacter(region, name, surname);
      if (!profile?.class || !profile.race) return null;
      return mockPortraits(profile.name, profile.class, profile.race);
    },
    async getStatistics(region, name, surname) {
      const profile = await client.getCharacter(region, name, surname);
      if (!profile?.level) return null;
      const h = hash(`stats:${profile.name}-${profile.surname}`);
      const lvl = profile.level;
      // Names as Blizzard's retail statistics use them; scaled by level so higher characters have done more.
      const n = (shift: number, per: number) => Math.round(lvl * per * (0.5 + ((h >>> shift) % 100) / 100));
      const deathsFalling = n(1, 0.15);
      const deathsDrowning = n(2, 0.05);
      const deathsPlayers = /pvp/i.test(profile.ruleset ?? '') ? n(3, 0.6) : 0;
      return {
        'Total deaths': deathsFalling + deathsDrowning + deathsPlayers + n(4, 0.5),
        'Deaths from falling': deathsFalling,
        'Deaths from drowning': deathsDrowning,
        'Deaths from fatigue': n(5, 0.01),
        'Deaths from fire and lava': n(6, 0.02),
        'Deaths from other players': deathsPlayers,
        'Total deaths in 5-player dungeons': n(7, 0.08),
        'Creatures killed': n(8, 60),
        'Critters killed': n(9, 1.5),
        'Honorable kills': deathsPlayers * 2,
        'Total damage done': n(10, 9000),
        'Total damage received': n(11, 7000),
        'Total healing done': n(12, 2500),
        'Largest hit dealt': n(13, 12),
        'Largest heal cast': n(14, 9),
        'Quests completed': n(15, 7),
        'Quests abandoned': n(16, 0.4),
        'Flight paths taken': n(17, 1.2),
        'Number of times hearthed': n(18, 1.6),
        'Summons accepted': n(19, 0.2),
        'Gold looted': n(20, 900),
        'Most gold ever owned': n(21, 4000),
        'Total gold acquired': n(22, 9000),
        'Food eaten': n(23, 3),
        'Beverages consumed': n(24, 3.5),
        'Health potions consumed': n(25, 0.6),
        'Bandages used': n(26, 0.9),
        'Number of hugs': n(27, 0.3),
        'Need rolls made on loot': n(28, 0.5),
        'Greed rolls made on loot': n(29, 1.1),
        'Disenchant rolls made on loot': n(31, 0.3),
        'Fish caught': n(30, 0.8),
        // Seconds, like /played: roughly 3 hours a level.
        'Total time played': n(0, 3 * 3600),
      };
    },
    async getCharacterStats(region, name, surname) {
      const profile = await client.getCharacter(region, name, surname);
      if (!profile?.level) return null;
      const h = hash(`sheet:${profile.name}-${profile.surname}`);
      const lvl = profile.level;
      const stat = (shift: number) => Math.round(lvl * (1 + ((h >>> shift) % 100) / 100));
      return {
        health: lvl * 70 + stat(1) * 5,
        power: lvl * 40 + stat(2) * 3,
        strength: stat(3),
        agility: stat(4),
        intellect: stat(5),
        stamina: stat(6),
        spirit: stat(7),
        armor: stat(8) * 25,
        attack_power: stat(9) * 2,
        melee_crit: Math.round((2 + ((h >>> 10) % 80) / 10) * 100) / 100,
        dodge: Math.round((2 + ((h >>> 11) % 60) / 10) * 100) / 100,
      };
    },
    async getProfessions(region, name, surname) {
      const profile = await client.getCharacter(region, name, surname);
      if (!profile?.level) return null;
      const h = hash(`professions:${profile.name}-${profile.surname}`);
      // Skill roughly keeps pace with level (5 per level), with some variety.
      const skillAt = (shift: number) => Math.max(1, Math.min(300, Math.round(profile.level! * 5 * (0.4 + ((h >>> shift) % 60) / 100))));
      const first = PRIMARY_PROFESSIONS[h % PRIMARY_PROFESSIONS.length];
      const second = PRIMARY_PROFESSIONS[(h >>> 5) % PRIMARY_PROFESSIONS.length];
      // Some characters only have one profession (or none), so empty slots show up locally too.
      const primaries = (h >>> 10) % 6 === 0 ? [] : (h >>> 10) % 6 === 1 || first === second ? [first] : [first, second];
      const secondaries = SECONDARY_PROFESSIONS.filter((_, i) => (h >>> (13 + i)) % 2);
      return [
        ...primaries.map((p, i) => ({ name: p, kind: 'primary' as const, skill: skillAt(16 + i * 4), maxSkill: 0 })),
        ...secondaries.map((p, i) => ({ name: p, kind: 'secondary' as const, skill: skillAt(24 + i), maxSkill: 0 })),
      ].map((p) => ({ ...p, maxSkill: rankCap(p.skill) }));
    },
    async getAchievements(region, name, surname) {
      const level = (await client.getCharacter(region, name, surname))?.level;
      if (level == null) return null;
      return MOCK_ACHIEVEMENTS.filter((a) => a.level <= level).map(({ id, name }) => ({ id, name, completedAt: null }));
    },
  };
  return client;
}
