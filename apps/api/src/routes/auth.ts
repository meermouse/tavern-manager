import { randomBytes, createHash } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { jsonBody, type AppDeps, type AppEnv, type UserRow } from '../context.js';

export const SESSION_COOKIE = 'tt_session';
const STATE_COOKIE = 'tt_oauth';
const SESSION_DAYS = 30;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Only allow same-site relative redirects. */
export function safeNext(next: unknown): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
    ? next
    : '/';
}

export function defaultDisplayName(battletag: string): string {
  return battletag.split('#')[0] || battletag;
}

export function authRoutes({ db, config, oauth }: AppDeps) {
  const app = new Hono<AppEnv>();
  const cookieOpts = { httpOnly: true, sameSite: 'Lax' as const, secure: config.production, path: '/' };

  async function upsertUser(battlenetId: string, battletag: string): Promise<UserRow> {
    const [user] = await db.query<UserRow>(
      `insert into users (battlenet_id, battletag, display_name) values ($1, $2, $3)
       on conflict (battlenet_id) do update set battletag = excluded.battletag
       returning *`,
      [battlenetId, battletag, defaultDisplayName(battletag)],
    );
    return user;
  }

  async function startSession(c: Context<AppEnv>, userId: string, bnet?: { accessToken: string; expiresIn: number }) {
    const token = randomBytes(32).toString('base64url');
    await db.query(
      `insert into sessions (id, user_id, bnet_access_token, bnet_token_expires_at, expires_at)
       values ($1, $2, $3, $4, now() + make_interval(days => $5::int))`,
      [
        hashToken(token),
        userId,
        bnet?.accessToken ?? null,
        bnet ? new Date(Date.now() + bnet.expiresIn * 1000) : null,
        SESSION_DAYS,
      ],
    );
    setCookie(c, SESSION_COOKIE, token, { ...cookieOpts, maxAge: SESSION_DAYS * 86400 });
  }

  app.get('/config', (c) => c.json({ battlenet: oauth !== null, devLogin: config.devLogin }));

  app.get('/login', async (c) => {
    if (!oauth) throw new HTTPException(503, { message: 'Battle.net login is not configured' });
    const state = randomBytes(16).toString('base64url');
    const payload = JSON.stringify({ state, next: safeNext(c.req.query('next')) });
    await setSignedCookie(c, STATE_COOKIE, payload, config.sessionSecret, { ...cookieOpts, maxAge: 600 });
    return c.redirect(oauth.authorizeUrl(state));
  });

  app.get('/callback', async (c) => {
    if (!oauth) throw new HTTPException(503, { message: 'Battle.net login is not configured' });
    const fail = (reason: string) => c.redirect(`/login?error=${encodeURIComponent(reason)}`);
    const raw = await getSignedCookie(c, config.sessionSecret, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: '/' });
    if (c.req.query('error')) return fail(c.req.query('error_description') ?? 'Login was cancelled');
    if (!raw) return fail('Login expired, please try again');
    const { state, next } = JSON.parse(raw) as { state: string; next: string };
    const code = c.req.query('code');
    if (!code || c.req.query('state') !== state) return fail('Invalid login state, please try again');

    try {
      const token = await oauth.exchangeCode(code);
      const bnetUser = await oauth.getUser(token.accessToken);
      const user = await upsertUser(bnetUser.id, bnetUser.battletag);
      await startSession(c, user.id, token);
      return c.redirect(safeNext(next));
    } catch (err) {
      console.error('Battle.net login failed', err);
      return fail('Battle.net login failed');
    }
  });

  app.post('/dev-login', async (c) => {
    if (!config.devLogin) throw new HTTPException(404, { message: 'Not found' });
    const body = await jsonBody(c);
    const battletag = typeof body.battletag === 'string' ? body.battletag.trim() : '';
    if (!/^[\p{L}\p{N}]{2,16}(#\d{3,6})?$/u.test(battletag)) {
      throw new HTTPException(400, { message: 'Enter a BattleTag like Adventurer#1234' });
    }
    const user = await upsertUser(`dev:${battletag.toLowerCase()}`, battletag);
    await startSession(c, user.id);
    return c.json({ ok: true });
  });

  app.post('/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await db.query('delete from sessions where id = $1', [hashToken(token)]);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  return app;
}
