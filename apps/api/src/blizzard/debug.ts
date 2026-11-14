import { titleStatGaps } from '../titles.js';
import type { BlizzardClient, StatisticMap } from './client.js';

/** Logged values are cut to this many characters, so one character can't flood the log. */
const MAX_VALUE_LENGTH = 4000;

function clip(text: string): string {
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}… (${text.length} chars)` : text;
}

/** One line describing what a client method returned, flagging empty results. */
export function summarize(value: unknown): string {
  if (value == null) return 'NOTHING RETURNED (null)';
  if (Array.isArray(value)) return value.length ? `${value.length} item(s): ${clip(JSON.stringify(value))}` : 'EMPTY LIST';
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return keys.length ? `${keys.length} field(s): ${clip(JSON.stringify(value))}` : 'EMPTY OBJECT';
  }
  return String(value);
}

/** What the titles would make of a statistics map: which titles have no statistic to read, or only zeros. */
export function describeTitleGaps(stats: StatisticMap | null): string {
  if (!stats) return 'titles: no statistics at all, so every statistic-based title is unclaimable';
  const gaps = titleStatGaps(stats);
  if (!gaps.length) return 'titles: every statistic-based title has data';
  const of = (problem: string) => gaps.filter((g) => g.problem === problem).map((g) => g.title);
  return [
    of('missing').length && `titles MISSING their statistic: ${of('missing').join(', ')}`,
    of('zero').length && `titles whose statistic is 0: ${of('zero').join(', ')}`,
  ]
    .filter(Boolean)
    .join('; ');
}

/**
 * Wrap a Blizzard client so every call logs what came back (`BLIZZARD_DEBUG`). Character methods log
 * "name-surname method → result"; failures are logged and rethrown unchanged.
 */
export function withDebugLogging(client: BlizzardClient, log: (line: string) => void): BlizzardClient {
  const wrapped: BlizzardClient = { ...client, debug: true };
  for (const key of Object.keys(client) as (keyof BlizzardClient)[]) {
    const fn = client[key];
    if (typeof fn !== 'function') continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wrapped as any)[key] = async (...args: unknown[]) => {
      // Character methods take (region, name, surname); getAccountCharacters takes a token, which isn't logged.
      const who = key === 'getAccountCharacters' ? `account (${args[0]})` : `${args[1]}-${args[2]} (${args[0]})`;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (fn as any).apply(client, args);
        log(`${who} ${key} → ${summarize(result)}`);
        if (key === 'getStatistics') log(`${who} ${describeTitleGaps(result as StatisticMap | null)}`);
        return result;
      } catch (err) {
        log(`${who} ${key} → ERROR: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
    };
  }
  return wrapped;
}
