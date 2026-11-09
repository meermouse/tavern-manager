import { createBattleNetOAuth } from './auth/oauth.js';
import { createBlizzardClient, type BlizzardClient } from './blizzard/client.js';
import { createMockBlizzardClient } from './blizzard/mock.js';
import { loadConfig, type Config } from './config.js';
import { createDb } from './db.js';
import type { AppDeps } from './context.js';
import { migrate } from './schema.js';

export function createBlizzard(config: Config): BlizzardClient {
  if (config.blizzardMock) return createMockBlizzardClient();
  if (!config.bnet) throw new Error('BNET_CLIENT_ID / BNET_CLIENT_SECRET are required (or set BLIZZARD_MOCK=true)');
  return createBlizzardClient(config.bnet);
}

export async function createDeps(config: Config = loadConfig()): Promise<AppDeps> {
  if (config.production && !config.databaseUrl) {
    throw new Error('DATABASE_URL (or NETLIFY_DATABASE_URL) must be set in production');
  }
  const db = await createDb({ url: config.databaseUrl, pgliteDir: config.pgliteDir });
  await migrate(db);
  return {
    db,
    config,
    blizzard: createBlizzard(config),
    oauth: config.bnet ? createBattleNetOAuth(config.bnet) : null,
  };
}

let cached: Promise<AppDeps> | null = null;

/** Lazily-initialised singleton, reused across warm serverless invocations. */
export function getDeps(): Promise<AppDeps> {
  cached ??= createDeps().catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}
