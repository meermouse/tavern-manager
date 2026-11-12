import { RULESETS, type BlizzardClient, type CharacterProfile } from './client.js';

const CLASSES = ['Warrior', 'Paladin', 'Hunter', 'Rogue', 'Priest', 'Shaman', 'Mage', 'Warlock', 'Druid'];
const RACES = ['Human', 'Dwarf', 'Night Elf', 'Gnome', 'Orc', 'Undead', 'Tauren', 'Troll'];

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// Gear unlocks as the (drifting) mock level rises, so local dev produces loot posts over time.
const MOCK_GEAR = [
  { id: 900001, name: 'Frayed Tavern Apron', quality: 'COMMON', slot: 'Chest', minLevel: 1 },
  { id: 900002, name: 'Bracers of the Bar Brawl', quality: 'UNCOMMON', slot: 'Wrists', minLevel: 12 },
  { id: 900003, name: 'Stoutheart Pauldrons', quality: 'RARE', slot: 'Shoulders', minLevel: 22 },
  { id: 900004, name: 'Ring of Last Orders', quality: 'RARE', slot: 'Finger', minLevel: 34 },
  { id: 900005, name: 'Cloak of the Long Night', quality: 'RARE', slot: 'Back', minLevel: 46 },
  { id: 900006, name: 'Hearthfire Greatblade', quality: 'EPIC', slot: 'Main Hand', minLevel: 52 },
  { id: 900007, name: 'Crown of the Innkeeper', quality: 'EPIC', slot: 'Head', minLevel: 58 },
];

const MOCK_ACHIEVEMENTS = [10, 20, 30, 40, 50, 60].map((level) => ({ id: 800000 + level, name: `Level ${level}`, level }));

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
      return {
        name: capitalise(name),
        surname: capitalise(surname),
        class: CLASSES[h % CLASSES.length],
        race: RACES[(h >>> 4) % RACES.length],
        level: Math.min(60, 10 + ((h >>> 8) % 46) + dayBump),
        ruleset: RULESETS[(h >>> 12) % RULESETS.length],
        lastLoginAt: null,
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
    async getAchievements(region, name, surname) {
      const level = (await client.getCharacter(region, name, surname))?.level;
      if (level == null) return null;
      return MOCK_ACHIEVEMENTS.filter((a) => a.level <= level).map(({ id, name }) => ({ id, name, completedAt: null }));
    },
  };
  return client;
}
