import { describe, expect, it } from 'vitest';
import { createBlizzardClient, type BlizzardClient } from '../src/blizzard/client.js';
import { describeTitleGaps, summarize, withDebugLogging } from '../src/blizzard/debug.js';
import { createMockBlizzardClient } from '../src/blizzard/mock.js';
import { loadConfig } from '../src/config.js';
import { syncCharacter } from '../src/sync.js';
import { setup } from './helpers.js';

describe('Blizzard debug logging', () => {
  it('is off unless BLIZZARD_DEBUG is set', () => {
    expect(loadConfig({}).blizzardDebug).toBe(false);
    expect(loadConfig({ BLIZZARD_DEBUG: 'true' }).blizzardDebug).toBe(true);
  });

  it('flags empty results', () => {
    expect(summarize(null)).toBe('NOTHING RETURNED (null)');
    expect(summarize([])).toBe('EMPTY LIST');
    expect(summarize({})).toBe('EMPTY OBJECT');
    expect(summarize({ 'Total deaths': 3 })).toBe('1 field(s): {"Total deaths":3}');
  });

  it('names the titles a statistics map can’t feed', () => {
    expect(describeTitleGaps(null)).toMatch(/no statistics at all/);
    const line = describeTitleGaps({ 'Critters killed': 4, 'Largest hit dealt': 0 });
    expect(line).toMatch(/MISSING their statistic: .*Dragon’s Hoard/);
    expect(line).toMatch(/MISSING their statistic: .*Lay on Hands/);
    expect(line).not.toMatch(/MISSING[^;]*Bunny Slayer/);
    expect(line).toMatch(/statistic is 0: One Punch/);
  });

  it('logs every call and its result, and rethrows errors', async () => {
    const lines: string[] = [];
    const client = withDebugLogging(createMockBlizzardClient(), (l) => lines.push(l));
    expect(client.debug).toBe(true);
    await client.getStatistics!('eu', 'Judgement', 'Judy');
    expect(lines[0]).toMatch(/^Judgement-Judy \(eu\) getStatistics → \d+ field\(s\): \{"Total deaths"/);
    expect(lines[1]).toMatch(/^Judgement-Judy \(eu\) titles: /);

    const failing = withDebugLogging(
      { getCharacter: async () => { throw new Error('boom'); }, getAccountCharacters: async () => [] } as BlizzardClient,
      (l) => lines.push(l),
    );
    await expect(failing.getCharacter('eu', 'A', 'B')).rejects.toThrow('boom');
    expect(lines.at(-1)).toBe('A-B (eu) getCharacter → ERROR: boom');
  });

  it('logs each HTTP request’s path and status, without the token', async () => {
    const lines: string[] = [];
    const fetchImpl = (async (url: string) =>
      url.includes('/token')
        ? new Response(JSON.stringify({ access_token: 'secret-token', expires_in: 3600 }))
        : new Response('{}', { status: 404 })) as typeof fetch;
    const client = createBlizzardClient({ clientId: 'id', clientSecret: 'secret' }, fetchImpl, (l) => lines.push(l));
    await client.getStatistics!('eu', 'Nobody', 'Here');
    expect(lines).toEqual([
      'GET /profile/wow/character/nobody-here/achievements/statistics → 404 (not found: treated as no data)',
    ]);
    expect(lines.join()).not.toContain('secret');
  });

  it('refetches statistics on every sync in debug mode', async () => {
    const { db, login } = await setup();
    const alice = await login('Alice#1234');
    const judy = (await alice.post('/api/characters', { name: 'Judgement', surname: 'Judy' })).body;
    const lines: string[] = [];
    const client = withDebugLogging(createMockBlizzardClient(), (l) => lines.push(l));
    const [row] = await db.query('select * from characters where id = $1', [judy.id]);
    // Synced moments ago, so outside debug mode statistics wouldn't be fetched again yet.
    await syncCharacter(db, client, row as never);
    expect(lines.some((l) => l.includes('getStatistics'))).toBe(true);
  });
});
