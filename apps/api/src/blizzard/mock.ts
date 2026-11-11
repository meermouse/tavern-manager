import { RULESETS, type BlizzardClient } from './client.js';

const CLASSES = ['Warrior', 'Paladin', 'Hunter', 'Rogue', 'Priest', 'Shaman', 'Mage', 'Warlock', 'Druid'];
const RACES = ['Human', 'Dwarf', 'Night Elf', 'Gnome', 'Orc', 'Undead', 'Tauren', 'Troll'];

// [zone, minLevel, maxLevel] — enough variety to make the dev map interesting.
const ZONES: [string, number, number][] = [
  ['Elwynn Forest', 1, 10], ['Dun Morogh', 1, 10], ['Durotar', 1, 10], ['Tirisfal Glades', 1, 10],
  ['Zephras Isle', 1, 12], ['Westfall', 10, 20], ['The Barrens', 10, 25], ['Darkshore', 10, 20],
  ['Silverpine Forest', 10, 20], ['Loch Modan', 10, 20], ['Redridge Mountains', 15, 25],
  ['Ashenvale', 18, 30], ['Duskwood', 18, 30], ['Hillsbrad Foothills', 20, 30], ['Wetlands', 20, 30],
  ['Thousand Needles', 25, 35], ['Stranglethorn Vale', 30, 45], ['Arathi Highlands', 30, 40],
  ['Desolace', 30, 40], ['Riverglades', 35, 45], ['Dustwallow Marsh', 35, 45], ['Badlands', 35, 45],
  ["Shen'dralas", 40, 50], ['Tanaris', 40, 50], ['Feralas', 40, 50], ['The Hinterlands', 40, 50],
  ['Searing Gorge', 43, 50], ['Azshara', 45, 55], ["Un'Goro Crater", 48, 55], ['Felwood', 48, 55],
  ['Burning Steppes', 50, 58], ['Western Plaguelands', 51, 58], ['Winterspring', 53, 60],
  ['Eastern Plaguelands', 53, 60], ['Silithus', 55, 60], ['Mount Hyjal', 58, 60],
];

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
      const level = Math.min(60, 10 + ((h >>> 8) % 46) + dayBump);
      const fitting = ZONES.filter(([, min, max]) => level >= min && level <= max);
      return {
        name: capitalise(name),
        surname: capitalise(surname),
        class: CLASSES[h % CLASSES.length],
        race: RACES[(h >>> 4) % RACES.length],
        level,
        ruleset: RULESETS[(h >>> 12) % RULESETS.length],
        zone: fitting.length ? fitting[(h >>> 16) % fitting.length][0] : null,
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
