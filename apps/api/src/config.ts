export const REGIONS = ['us', 'eu', 'kr', 'tw'] as const;
export type Region = (typeof REGIONS)[number];

export interface BnetCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface Config {
  production: boolean;
  port: number;
  region: Region;
  bnet: BnetCredentials | null;
  /** Postgres connection string. When absent, an embedded PGlite database is used (local dev only). */
  databaseUrl: string | null;
  /** Directory for the embedded PGlite database. `null` means in-memory. */
  pgliteDir: string | null;
  sessionSecret: string;
  /** Allow signing in without Battle.net (local development). */
  devLogin: boolean;
  /** Use fake Blizzard character data instead of calling the real API. */
  blizzardMock: boolean;
  /** How often (minutes) characters are refreshed by the scheduler. */
  refreshIntervalMinutes: number;
  /** OpenAI image generation for admin "Commission painting" pictures. `null` when no API key is set. */
  openai: OpenAiImageConfig | null;
  /** Draw placeholder images instead of calling the image API (local development). */
  imageMock: boolean;
  /**
   * Where the hourly auction fetch keeps the previous listings, to estimate what sold: `netlify` (Netlify Blobs),
   * a directory, or `off`.
   */
  auctionListingsStore: string | null;
}

export interface OpenAiImageConfig {
  apiKey: string;
  /** e.g. `gpt-image-1`. */
  model: string;
  /** `low`, `medium`, `high` or `auto`. */
  quality: string;
  /** `high` keeps the characters' reference renders more faithful (costs more input tokens); empty to leave it out. */
  inputFidelity: string;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function isRegion(value: unknown): value is Region {
  return typeof value === 'string' && (REGIONS as readonly string[]).includes(value);
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const bnet =
    env.BNET_CLIENT_ID && env.BNET_CLIENT_SECRET && env.BNET_REDIRECT_URI
      ? { clientId: env.BNET_CLIENT_ID, clientSecret: env.BNET_CLIENT_SECRET, redirectUri: env.BNET_REDIRECT_URI }
      : null;
  const region = (env.BNET_REGION ?? 'eu').toLowerCase();
  const sessionSecret = env.SESSION_SECRET ?? '';
  if (production && sessionSecret.length < 16) {
    throw new Error('SESSION_SECRET must be set (at least 16 characters) in production');
  }

  return {
    production,
    port: Number(env.PORT ?? 8787),
    region: isRegion(region) ? region : 'eu',
    bnet,
    databaseUrl: env.DATABASE_URL || env.NETLIFY_DB_URL || env.NETLIFY_DATABASE_URL || null,
    pgliteDir: env.PGLITE_DIR ?? '.data/pglite',
    sessionSecret: sessionSecret || 'dev-only-insecure-session-secret',
    devLogin: bool(env.DEV_LOGIN, !production && !bnet),
    blizzardMock: bool(env.BLIZZARD_MOCK, !production && !bnet),
    refreshIntervalMinutes: Number(env.REFRESH_INTERVAL_MINUTES ?? 30),
    openai: env.OPENAI_API_KEY
      ? {
          apiKey: env.OPENAI_API_KEY,
          model: env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
          quality: env.OPENAI_IMAGE_QUALITY || 'medium',
          inputFidelity: env.OPENAI_IMAGE_INPUT_FIDELITY ?? 'high',
        }
      : null,
    imageMock: bool(env.IMAGE_MOCK, !production && !env.OPENAI_API_KEY),
    auctionListingsStore: env.AUCTION_LISTINGS_STORE || '.data/auction-listings',
  };
}
