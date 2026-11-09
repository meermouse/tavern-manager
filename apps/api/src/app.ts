import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps, AppEnv, SessionInfo, UserRow } from './context.js';
import { authRoutes, hashToken, SESSION_COOKIE } from './routes/auth.js';
import { characterRoutes } from './routes/characters.js';
import { meRoutes } from './routes/me.js';
import { tavernRoutes } from './routes/taverns.js';

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('user', null);
    c.set('session', null);
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const [row] = await deps.db.query<UserRow & { session_id: string } & Omit<SessionInfo, 'id'>>(
        `select u.*, s.id as session_id, s.bnet_access_token, s.bnet_token_expires_at
         from sessions s join users u on u.id = s.user_id
         where s.id = $1 and s.expires_at > now()`,
        [hashToken(token)],
      );
      if (row) {
        const { session_id, bnet_access_token, bnet_token_expires_at, ...user } = row;
        c.set('user', user);
        c.set('session', { id: session_id, bnet_access_token, bnet_token_expires_at });
      }
    }
    await next();
  });

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.route('/auth', authRoutes(deps));
  app.route('/api/me', meRoutes(deps));
  app.route('/api/characters', characterRoutes(deps));
  app.route('/api', tavernRoutes(deps));

  app.notFound((c) => c.json({ error: 'Not found' }, 404));
  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'Something went wrong' }, 500);
  });

  return app;
}
