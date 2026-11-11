import { describe, expect, it } from 'vitest';
import {
  characterSlug,
  createBlizzardClient,
  normalizeRuleset,
  parseAccountCharacters,
  parseCharacterProfile,
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
      },
      { name: 'judgement', surname: 'judy' },
    );
    expect(p).toEqual({ name: 'Judgement', surname: 'Judy', class: 'Paladin', race: 'Human', level: 42, ruleset: 'Roleplay PvP' });
  });

  it('handles localized names and missing fields', () => {
    const p = parseCharacterProfile(
      { name: { en_US: 'Judgement' }, playable_class: { name: { en_US: 'Mage' } }, level: '7' },
      { name: 'judgement', surname: 'judy' },
    );
    expect(p).toMatchObject({ name: 'Judgement', surname: 'judy', class: 'Mage', race: null, level: 7, ruleset: null });
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
