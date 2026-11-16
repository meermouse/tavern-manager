import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { isRegion, type Region } from '../config.js';
import { badRequest, jsonBody, requireUser, uuidParam, type AppDeps, type AppEnv } from '../context.js';
import { ROLES, normalizeRoles, serializeCharacter } from '../serialize.js';
import { recordEvent } from '../feed.js';
import { syncCharacter, type CharacterRow } from '../sync.js';
import { listRawStatistics } from '../blizzard/client.js';

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

  /**
   * Debugging: every statistic Blizzard's `/achievements/statistics` returns for one of your characters, fetched
   * live, with whether the app keeps it (it keeps only numeric values). `?search=gold,hit` narrows the list to
   * statistics or categories whose name contains any of the words; `?full=1` adds the untouched response.
   */
  app.get('/:id/raw-statistics', async (c) => {
    const user = requireUser(c);
    const row = await ownedCharacter(user.id, uuidParam(c, 'id'));
    if (!blizzard.getRawStatistics) throw new HTTPException(501, { message: 'Not available' });
    const raw = await blizzard.getRawStatistics(row.region, row.name, row.surname);
    if (raw == null) throw new HTTPException(404, { message: 'Blizzard returned no statistics for this character' });
    const words = (c.req.query('search') ?? '')
      .split(',')
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
    const all = listRawStatistics(raw);
    const matches = (e: (typeof all)[number]) =>
      !words.length || words.some((w) => [e.name ?? '', ...e.path].some((n) => n.toLowerCase().includes(w)));
    const statistics = all.filter(matches);
    return c.json({
      character: `${row.name} ${row.surname} (${row.region})`,
      total: all.length,
      kept: all.filter((e) => e.kept).length,
      categories: [...new Set(all.map((e) => e.path.join(' > ')))],
      search: words,
      dropped: statistics.filter((e) => !e.kept),
      statistics,
      ...(c.req.query('full') ? { raw } : {}),
    });
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

  /**
   * Owner-only dungeon log: `{ dungeon, completed }` marks a dungeon done (with today's date) or clears it.
   * Newly ticking one posts "cleared <dungeon>" to the feed; unticking it takes that post down again.
   */
  app.post('/:id/dungeons', async (c) => {
    const user = requireUser(c);
    const row = await ownedCharacter(user.id, uuidParam(c, 'id'));
    const body = await jsonBody(c);
    const dungeon = typeof body.dungeon === 'string' ? body.dungeon.trim() : '';
    if (!dungeon || dungeon.length > 80) badRequest('Pick a dungeon');
    if (typeof body.completed !== 'boolean') badRequest('completed must be true or false');
    // Only touch the row when the tick actually changes, so a repeat (or double-click) posts nothing. The row lock
    // makes a concurrent repeat re-check the condition, so a dungeon can't be posted twice.
    const [changed] = await db.query<CharacterRow>(
      body.completed
        ? `update characters set dungeons_completed = dungeons_completed
             || jsonb_build_object($2::text, to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
           where id = $1 and not dungeons_completed ? $2 returning *`
        : 'update characters set dungeons_completed = dungeons_completed - $2::text where id = $1 and dungeons_completed ? $2 returning *',
      [row.id, dungeon],
    );
    if (changed && body.completed) {
      await recordEvent(db, { kind: 'dungeon_cleared', characterId: row.id, data: { dungeon } });
    } else if (changed) {
      await db.query(
        `delete from feed_events where kind = 'dungeon_cleared' and character_id = $1 and data->>'dungeon' = $2`,
        [row.id, dungeon],
      );
    }
    return c.json(serializeCharacter(changed ?? row));
  });

  app.delete('/:id', async (c) => {
    const user = requireUser(c);
    const row = await ownedCharacter(user.id, uuidParam(c, 'id'));
    await db.query('delete from characters where id = $1', [row.id]);
    return c.json({ ok: true });
  });

  return app;
}
