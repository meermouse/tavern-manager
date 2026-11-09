import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { OAuthProvider } from './auth/oauth.js';
import type { BlizzardClient } from './blizzard/client.js';
import type { Config } from './config.js';
import type { Db } from './db.js';

export interface UserRow {
  id: string;
  battlenet_id: string;
  battletag: string;
  display_name: string;
  created_at: Date;
}

export interface SessionInfo {
  id: string;
  bnet_access_token: string | null;
  bnet_token_expires_at: Date | null;
}

export interface AppDeps {
  db: Db;
  config: Config;
  blizzard: BlizzardClient;
  oauth: OAuthProvider | null;
}

export type AppEnv = {
  Variables: {
    user: UserRow | null;
    session: SessionInfo | null;
  };
};

export function requireUser(c: Context<AppEnv>): UserRow {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Not signed in' });
  return user;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidParam(c: Context<AppEnv>, name: string): string {
  const value = c.req.param(name);
  if (!value || !UUID_RE.test(value)) throw new HTTPException(404, { message: 'Not found' });
  return value;
}

export async function jsonBody(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}
