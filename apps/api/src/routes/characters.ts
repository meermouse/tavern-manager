import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { isRegion, type Region } from '../config.js';
import { badRequest, jsonBody, requireUser, uuidParam, type AppDeps, type AppEnv } from '../context.js';
import { ROLES, normalizeRoles, serializeCharacter } from '../serialize.js';
import { syncCharacter, type CharacterRow } from '../sync.js';

/** Don't hit Blizzard again for the same character within this window. */
const MANUAL_REFRESH_COOLDOWN_MS = 2 * 60_000;
const NAME_RE = /^\p{L}{2,24}$/u;

export function characterRoutes({ db, config, blizzard }: AppDeps) {
  const app = new Hono<AppEnv>();

  async function findIdentity(region: Region, name: string, surname: string) {
    const [row] = await db.query<CharacterRow>(
      'select * from characters where region = $1 and lower(name) = lower($2) and lower(surname) = lower($3)',
      [region, name, surname],
    );
    return row;
  }

  async function ownedCharacter(userId: string, id: string): Promise<CharacterRow> {
    const [row] = await db.query<CharacterRow>('select * from characters where id = $1 and user_id = $2', [id, userId]);
    if (!row) throw new HTTPException(404, { message: 'Character not found' });
    return row;
  }

  app.get('/', async (c) => {
    const user = requireUser(c);
    const rows = await db.query<CharacterRow>(
      'select * from characters where user_id = $1 order by level desc nulls last, name',
      [user.id],
    );
    return c.json(rows.map(serializeCharacter));
  });

  app.post('/', async (c) => {
    const user = requireUser(c);
    const body = await jsonBody(c);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const surname = typeof body.surname === 'string' ? body.surname.trim() : '';
    const region = body.region === undefined ? config.region : body.region;
    if (!NAME_RE.test(name) || !NAME_RE.test(surname)) badRequest('Enter a first name and surname (letters only)');
    if (!isRegion(region)) badRequest('Unknown region');

    const existing = await findIdentity(region, name, surname);
    if (existing) {
      throw new HTTPException(409, {
        message:
          existing.user_id === user.id
            ? 'You have already added this character'
            : 'This character has already been claimed by another player',
      });
    }
    const [row] = await db.query<CharacterRow>(
      'insert into characters (user_id, region, name, surname) values ($1, $2, $3, $4) returning *',
      [user.id, region, name, surname],
    );
    const synced = await syncCharacter(db, blizzard, row);
    return c.json(serializeCharacter(synced), 201);
  });

  app.post('/import', async (c) => {
    const user = requireUser(c);
    const session = c.get('session');
    const token = session?.bnet_access_token;
    const tokenValid = !!token && !!session?.bnet_token_expires_at && session.bnet_token_expires_at > new Date();
    if (!config.blizzardMock && !tokenValid) {
      throw new HTTPException(400, { message: 'Sign in with Battle.net again to import characters' });
    }

    let found;
    try {
      found = await blizzard.getAccountCharacters(config.region, token ?? '');
    } catch (err) {
      console.error('Account import failed', err);
      throw new HTTPException(502, {
        message: "Couldn't import from Battle.net. Add your characters manually by name and surname instead.",
      });
    }

    let imported = 0;
    let skipped = 0;
    for (const ch of found) {
      const [row] = await db.query<CharacterRow>(
        `insert into characters (user_id, region, name, surname) values ($1, $2, $3, $4)
         on conflict do nothing returning *`,
        [user.id, config.region, ch.name, ch.surname],
      );
      if (row) {
        await syncCharacter(db, blizzard, row);
        imported++;
      } else {
        skipped++;
      }
    }
    return c.json({ found: found.length, imported, skipped });
  });

  app.post('/:id/refresh', async (c) => {
    const user = requireUser(c);
    const row = await ownedCharacter(user.id, uuidParam(c, 'id'));
    const recent = row.last_attempt_at && Date.now() - row.last_attempt_at.getTime() < MANUAL_REFRESH_COOLDOWN_MS;
    const synced = recent ? row : await syncCharacter(db, blizzard, row);
    return c.json(serializeCharacter(synced));
  });

  /** Owner-only edits. Currently just `roles`: a list of 'tank' | 'healer' | 'damage' (empty for none). */
  app.patch('/:id', async (c) => {
    const user = requireUser(c);
    const row = await ownedCharacter(user.id, uuidParam(c, 'id'));
    const body = await jsonBody(c);
    if (!Array.isArray(body.roles) || body.roles.some((r) => !(ROLES as readonly unknown[]).includes(r))) {
      badRequest(`roles must be a list of: ${ROLES.join(', ')}`);
    }
    const [updated] = await db.query<CharacterRow>('update characters set roles = $2 where id = $1 returning *', [
      row.id,
      normalizeRoles(body.roles),
    ]);
    return c.json(serializeCharacter(updated));
  });

  app.delete('/:id', async (c) => {
    const user = requireUser(c);
    const row = await ownedCharacter(user.id, uuidParam(c, 'id'));
    await db.query('delete from characters where id = $1', [row.id]);
    return c.json({ ok: true });
  });

  return app;
}
