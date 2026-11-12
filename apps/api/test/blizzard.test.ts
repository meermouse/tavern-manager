import { describe, expect, it } from 'vitest';
import {
  characterSlug,
  createBlizzardClient,
  normalizeRuleset,
  parseAccountCharacters,
  parseAchievements,
  parseCharacterProfile,
  parseEquipment,
} from '../src/blizzard/client.js';
import { safeNext } from '../src/routes/auth.js';

describe('parseCharacterProfile', () => {
  it('reads classic-style responses', () => {
    const p = parseCharacterProfile(
      {
        name: 'Judgement',
        surname: 'Judy',
        level: 42,
        character_class: { id: 2, name: 'Paladin' },
        race: { id: 1, name: 'Human' },
        ruleset: { type: 'RPPVP', name: 'Roleplay PvP' },
        last_login_timestamp: 1_760_000_000_000,
      },
      { name: 'judgement', surname: 'judy' },
    );
    expect(p).toEqual({
      name: 'Judgement',
      surname: 'Judy',
      class: 'Paladin',
      race: 'Human',
      level: 42,
      ruleset: 'Roleplay PvP',
      lastLoginAt: new Date(1_760_000_000_000),
    });
  });

  it('handles localized names and missing fields', () => {
    const p = parseCharacterProfile(
      { name: { en_US: 'Judgement' }, playable_class: { name: { en_US: 'Mage' } }, level: '7' },
      { name: 'judgement', surname: 'judy' },
    );
    expect(p).toMatchObject({ name: 'Judgement', surname: 'judy', class: 'Mage', race: null, level: 7, ruleset: null });
    expect(p.lastLoginAt).toBeNull();
  });
});

describe('parseEquipment', () => {
  it('reads retail/classic-style equipment and tolerates odd shapes', () => {
    const items = parseEquipment({
      equipped_items: [
        {
          item: { id: 19019 },
          slot: { type: 'MAIN_HAND', name: 'Main Hand' },
          quality: { type: 'LEGENDARY', name: 'Legendary' },
          name: 'Thunderfury',
          level: { value: 80 },
        },
        { item: { id: 1 }, slot: { type: 'SHIRT' }, quality: 'Common', name: { en_US: 'Linen Shirt' } },
        { item: { id: 2 }, name: 'No quality' },
        { quality: { type: 'EPIC' }, name: 'No id' },
      ],
    });
    expect(items).toEqual([
      { id: 19019, name: 'Thunderfury', quality: 'LEGENDARY', slot: 'Main Hand', itemLevel: 80 },
      { id: 1, name: 'Linen Shirt', quality: 'COMMON', slot: 'SHIRT', itemLevel: null },
    ]);
    expect(parseEquipment({})).toEqual([]);
  });
});

describe('parseAchievements', () => {
  it('keeps completed achievements only', () => {
    const list = parseAchievements({
      achievements: [
        { id: 6, achievement: { id: 6, name: 'Level 10' }, completed_timestamp: 1_700_000_000_000 },
        { id: 7, achievement: { id: 7, name: 'Level 20' }, criteria: { is_completed: true } },
        { id: 8, achievement: { id: 8, name: 'Level 30' }, criteria: { is_completed: false } },
      ],
    });
    expect(list).toEqual([
      { id: 6, name: 'Level 10', completedAt: new Date(1_700_000_000_000) },
      { id: 7, name: 'Level 20', completedAt: null },
    ]);
    expect(parseAchievements({})).toEqual([]);
  });
});

describe('normalizeRuleset', () => {
  it.each([
    [{ type: 'NORMAL' }, 'Normal'],
    [{ type: 'PVP' }, 'PvP'],
    [{ type: 'RP' }, 'Roleplay'],
    ['Roleplay PvP', 'Roleplay PvP'],
    [undefined, null],
  ])('%j → %s', (input, expected) => {
    expect(normalizeRuleset(input)).toBe(expected);
  });
});

describe('parseAccountCharacters', () => {
  it('collects characters with a surname across accounts', () => {
    expect(
      parseAccountCharacters({
        wow_accounts: [
          { characters: [{ name: 'Judgement', surname: 'Judy' }, { name: 'NoSurname' }] },
          { characters: [{ name: 'Grimble', surname: 'Thornwick' }] },
        ],
      }),
    ).toEqual([
      { name: 'Judgement', surname: 'Judy' },
      { name: 'Grimble', surname: 'Thornwick' },
    ]);
  });
});

describe('createBlizzardClient', () => {
  it('calls the Forever character endpoint and treats 404 as not found', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.includes('oauth.battle.net/token')) {
        return new Response(JSON.stringify({ access_token: 'app', expires_in: 3600 }));
      }
      if (url.includes('judgement-judy')) {
        return new Response(JSON.stringify({ name: 'Judgement', surname: 'Judy', level: 12 }));
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;
    const client = createBlizzardClient({ clientId: 'id', clientSecret: 'secret' }, fetchImpl);
    expect(await client.getCharacter('eu', 'Judgement', 'Judy')).toMatchObject({ level: 12 });
    expect(await client.getCharacter('eu', 'Nobody', 'Here')).toBeNull();
    expect(calls).toContain(
      'https://eu.api.blizzard.com/profile/wow/character/judgement-judy?namespace=profile-forever-eu&locale=en_US',
    );
    // App token is cached.
    expect(calls.filter((u) => u.includes('/token'))).toHaveLength(1);

    expect(await client.getEquipment!('eu', 'Nobody', 'Here')).toBeNull();
    expect(calls).toContain(
      'https://eu.api.blizzard.com/profile/wow/character/nobody-here/equipment?namespace=profile-forever-eu&locale=en_US',
    );
  });

  it('slugs names', () => {
    expect(characterSlug('Judgement', 'Judy')).toBe('judgement-judy');
  });
});

describe('safeNext', () => {
  it.each([
    ['/taverns/1', '/taverns/1'],
    ['//evil.com', '/'],
    ['https://evil.com', '/'],
    ['/\\evil.com', '/'],
    [undefined, '/'],
  ])('%s → %s', (input, expected) => expect(safeNext(input)).toBe(expected));
});
