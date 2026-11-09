import { RULESETS, type BlizzardClient } from './client.js';

const CLASSES = ['Warrior', 'Paladin', 'Hunter', 'Rogue', 'Priest', 'Shaman', 'Mage', 'Warlock', 'Druid'];
const RACES = ['Human', 'Dwarf', 'Night Elf', 'Gnome', 'Orc', 'Undead', 'Tauren', 'Troll'];

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Deterministic fake data for local development without Blizzard credentials.
 * Names containing "pending" behave like low-level characters the API doesn't return yet.
 */
export function createMockBlizzardClient(): BlizzardClient {
  return {
    async getCharacter(region, name, surname) {
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
      };
    },
    async getAccountCharacters() {
      return [
        { name: 'Judgement', surname: 'Judy' },
        { name: 'Grimble', surname: 'Thornwick' },
        { name: 'Pendingly', surname: 'Lowbie' },
      ];
    },
  };
}
