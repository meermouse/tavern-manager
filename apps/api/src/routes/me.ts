import { Hono } from 'hono';
import { userAchievements } from '../achievements.js';
import { badRequest, jsonBody, requireUser, type AppDeps, type AppEnv, type UserRow } from '../context.js';
import { serializeUser } from '../serialize.js';

export function meRoutes({ db, config }: AppDeps) {
  const app = new Hono<AppEnv>();

  app.get('/', async (c) => {
    const user = requireUser(c);
    const session = c.get('session');
    const hasToken =
      !!session?.bnet_access_token && !!session.bnet_token_expires_at && session.bnet_token_expires_at > new Date();
    const canImport = config.blizzardMock || hasToken;
    return c.json({ ...serializeUser(user), canImport, achievements: await userAchievements(db, user.id) });
  });

  app.patch('/', async (c) => {
    const user = requireUser(c);
    const body = await jsonBody(c);
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    if (displayName.length < 1 || displayName.length > 40) badRequest('Display name must be 1–40 characters');
    const [updated] = await db.query<UserRow>('update users set display_name = $2 where id = $1 returning *', [
      user.id,
      displayName,
    ]);
    return c.json(serializeUser(updated));
  });

  return app;
}
