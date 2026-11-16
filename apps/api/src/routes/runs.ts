import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { badRequest, jsonBody, requireUser, uuidParam, type AppDeps, type AppEnv } from '../context.js';
import { recordEvent } from '../feed.js';

const MAX_NAME = 80;
const MAX_BOSSES = 40;
const MAX_NOTES = 500;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface RunRow {
  id: string;
  tavern_id: string;
  dungeon: string;
  run_on: string;
  bosses: string[];
  cleared: boolean;
  notes: string | null;
  logged_by: string | null;
  logged_by_name: string | null;
  created_at: Date;
  characters: RunCharacter[] | string;
}

interface RunCharacter {
  id: string;
  name: string;
  surname: string;
  class: string | null;
  level: number | null;
  avatarUrl: string | null;
  ownerId: string;
  ownerName: string;
}

/** Trimmed, de-duplicated (case-insensitively), non-empty names, first spelling wins. */
function cleanNames(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) badRequest('bosses must be a list of names');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value as string[]) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name) continue;
    if (name.length > MAX_NAME) badRequest('Boss names must be 80 characters or fewer');
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  if (out.length > MAX_BOSSES) badRequest('Too many bosses');
  return out;
}

/** Today's date (UTC) as YYYY-MM-DD. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A run date: a real calendar date, not in the future (a day's grace for time zones ahead of UTC). */
function runDate(value: unknown): string {
  if (value === undefined || value === null || value === '') return today();
  if (typeof value !== 'string' || !DATE_RE.test(value)) badRequest('date must be YYYY-MM-DD');
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) badRequest('date must be a real date');
  if (d.getTime() > Date.now() + 24 * 60 * 60_000) badRequest("A run can't be in the future");
  return value;
}

const RUN_SELECT = `
  select r.id, r.tavern_id, r.dungeon, to_char(r.run_on, 'YYYY-MM-DD') as run_on, r.bosses, r.cleared, r.notes,
    r.logged_by, lu.display_name as logged_by_name, r.created_at,
    (select coalesce(json_agg(json_build_object(
        'id', c.id, 'name', c.name, 'surname', c.surname, 'class', c.class, 'level', c.level,
        'avatarUrl', c.avatar_url, 'ownerId', c.user_id, 'ownerName', u.display_name)
      order by c.name, c.surname), '[]'::json)
     from dungeon_run_characters rc join characters c on c.id = rc.character_id join users u on u.id = c.user_id
     where rc.run_id = r.id) as characters
  from dungeon_runs r left join users lu on lu.id = r.logged_by`;

export function runRoutes({ db }: AppDeps) {
  const app = new Hono<AppEnv>();

  /** The tavern, if the user is a member; its owner id decides who can delete runs. */
  async function membership(tavernId: string, userId: string) {
    const [row] = await db.query<{ id: string; owner_id: string }>(
      `select t.id, t.owner_id from taverns t join tavern_members m on m.tavern_id = t.id
       where t.id = $1 and m.user_id = $2`,
      [tavernId, userId],
    );
    if (!row) throw new HTTPException(404, { message: 'Tavern not found' });
    return row;
  }

  function serializeRun(r: RunRow, viewerId: string, tavernOwnerId: string) {
    return {
      id: r.id,
      dungeon: r.dungeon,
      date: r.run_on,
      bosses: r.bosses ?? [],
      cleared: r.cleared,
      notes: r.notes,
      loggedBy: r.logged_by ? { id: r.logged_by, displayName: r.logged_by_name } : null,
      createdAt: r.created_at,
      characters: typeof r.characters === 'string' ? JSON.parse(r.characters) : r.characters,
      canDelete: r.logged_by === viewerId || tavernOwnerId === viewerId,
    };
  }

  app.get('/taverns/:id/runs', async (c) => {
    const user = requireUser(c);
    const tavern = await membership(uuidParam(c, 'id'), user.id);
    const rows = await db.query<RunRow>(
      `${RUN_SELECT} where r.tavern_id = $1 order by r.run_on desc, r.created_at desc`,
      [tavern.id],
    );
    return c.json(rows.map((r) => serializeRun(r, user.id, tavern.owner_id)));
  });

  /**
   * Log a run for the group: `{ dungeon, date?, characterIds, bosses, cleared, notes? }`. Any member can log any of
   * the tavern's characters. A clear ticks the dungeon off in every party member's dungeon log (keeping an earlier
   * date), and the run gets one feed post naming the whole party.
   */
  app.post('/taverns/:id/runs', async (c) => {
    const user = requireUser(c);
    const tavern = await membership(uuidParam(c, 'id'), user.id);
    const body = await jsonBody(c);

    const dungeon = typeof body.dungeon === 'string' ? body.dungeon.trim() : '';
    if (!dungeon || dungeon.length > MAX_NAME) badRequest('Pick a dungeon');
    const date = runDate(body.date);
    if (typeof body.cleared !== 'boolean') badRequest('cleared must be true or false');
    const cleared = body.cleared;
    const bosses = cleanNames(body.bosses ?? []);
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    if (notes.length > MAX_NOTES) badRequest('Notes must be 500 characters or fewer');
    if (!Array.isArray(body.characterIds) || body.characterIds.some((v) => typeof v !== 'string')) {
      badRequest('characterIds must be a list');
    }
    const wanted = [...new Set(body.characterIds as string[])];
    if (!wanted.length) badRequest('Pick who was in the group');

    const party = await db.query<{ character_id: string }>(
      'select character_id from tavern_characters where tavern_id = $1 and character_id::text = any($2::text[])',
      [tavern.id, wanted],
    );
    if (party.length !== wanted.length) badRequest('Everyone in the group must be one of this tavern’s characters');
    const ids = party.map((p) => p.character_id);

    const [run] = await db.query<{ id: string }>(
      `insert into dungeon_runs (tavern_id, dungeon, run_on, bosses, cleared, notes, logged_by)
       values ($1, $2, $3::date, $4::text[], $5, $6, $7) returning id`,
      [tavern.id, dungeon, date, bosses, cleared, notes || null, user.id],
    );
    await db.query(
      `insert into dungeon_run_characters (run_id, character_id) select $1, unnest($2::uuid[])`,
      [run.id, ids],
    );
    if (cleared) {
      // Keep an earlier date if the dungeon was already ticked off.
      await db.query(
        `update characters set dungeons_completed = dungeons_completed || jsonb_build_object($2::text, $3::text)
         where id = any($1::uuid[]) and not dungeons_completed ? $2`,
        [ids, dungeon, `${date}T00:00:00Z`],
      );
    }

    const [row] = await db.query<RunRow>(`${RUN_SELECT} where r.id = $1`, [run.id]);
    const out = serializeRun(row, user.id, tavern.owner_id);
    await recordEvent(db, {
      kind: 'dungeon_run',
      tavernId: tavern.id,
      userId: user.id,
      data: {
        runId: run.id,
        dungeon,
        date,
        cleared,
        bosses,
        characters: out.characters.map((ch: RunCharacter) => ({
          id: ch.id, name: ch.name, surname: ch.surname, class: ch.class, level: ch.level, avatarUrl: ch.avatarUrl,
        })),
      },
    });
    return c.json(out, 201);
  });

  /** Whoever logged a run, or the tavern owner, can delete it; its feed post goes too. Dungeon log ticks stay. */
  app.delete('/taverns/:id/runs/:runId', async (c) => {
    const user = requireUser(c);
    const tavern = await membership(uuidParam(c, 'id'), user.id);
    const runId = uuidParam(c, 'runId');
    const [run] = await db.query<{ logged_by: string | null }>(
      'select logged_by from dungeon_runs where id = $1 and tavern_id = $2',
      [runId, tavern.id],
    );
    if (!run) throw new HTTPException(404, { message: 'Run not found' });
    if (run.logged_by !== user.id && tavern.owner_id !== user.id) {
      throw new HTTPException(403, { message: 'Only whoever logged this run, or the tavern owner, can delete it' });
    }
    await db.query('delete from dungeon_runs where id = $1', [runId]);
    await db.query(`delete from feed_events where kind = 'dungeon_run' and tavern_id = $1 and data->>'runId' = $2`, [
      tavern.id,
      runId,
    ]);
    return c.json({ ok: true });
  });

  return app;
}
