import { createApp } from '../src/app.js';
import { createMockBlizzardClient } from '../src/blizzard/mock.js';
import { loadConfig } from '../src/config.js';
import type { AppDeps } from '../src/context.js';
import { createDb } from '../src/db.js';
import { migrate } from '../src/schema.js';

export async function setup(overrides: Partial<AppDeps> = {}) {
  const config = { ...loadConfig({}), pgliteDir: null, devLogin: true, blizzardMock: true };
  const db = await createDb({ url: null, pgliteDir: null });
  await migrate(db);
  const deps: AppDeps = { db, config, blizzard: createMockBlizzardClient(), oauth: null, ...overrides };
  const app = createApp(deps);

  async function login(battletag: string) {
    const res = await app.request('/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ battletag }),
    });
    if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
    const cookie = res.headers.get('set-cookie')!.split(';')[0];
    const call = async (method: string, path: string, body?: unknown) => {
      const r = await app.request(path, {
        method,
        headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await r.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { status: r.status, body: (text ? JSON.parse(text) : null) as any };
    };
    return {
      get: (p: string) => call('GET', p),
      post: (p: string, b?: unknown) => call('POST', p, b ?? {}),
      put: (p: string) => call('PUT', p),
      patch: (p: string, b: unknown) => call('PATCH', p, b),
      del: (p: string) => call('DELETE', p),
    };
  }

  return { app, db, deps, login };
}
