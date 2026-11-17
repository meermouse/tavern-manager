import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { badRequest, jsonBody, requireUser, uuidParam, type AppDeps, type AppEnv } from '../context.js';
import { recordEvent } from '../feed.js';
import { IRL_NAME_SQL, tavernMembership, type TavernAccess } from '../tavernAccess.js';

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
        'avatarUrl', c.avatar_url, 'ownerId', c.user_id, 'ownerName', ${IRL_NAME_SQL})
      order by c.name, c.surname), '[]'::json)
     from dungeon_run_characters rc join characters c on c.id = rc.character_id join users u on u.id = c.user_id
       left join tavern_characters tc on tc.tavern_id = r.tavern_id and tc.character_id = c.id
     where rc.run_id = r.id) as characters
  from dungeon_runs r left join users lu on lu.id = r.logged_by`;

export function runRoutes({ db }: AppDeps) {
  const app = new Hono<AppEnv>();

  /** The tavern, if the user is a member; whether they're an admin decides who can edit and delete runs. */
  const membership = (tavernId: string, userId: string) => tavernMembership(db, tavernId, userId);

  /**
   * The run fields shared by logging and editing: `{ dungeon, date?, characterIds, bosses, cleared, notes? }`.
   * Everyone in the group must be one of the tavern's characters, or (`keep`, when editing) already in the run.
   */
  async function runInput(tavernId: string, body: Record<string, unknown>, keep: string[] = []) {
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
      `select id as character_id from characters where id::text = any($2::text[])
         and (id in (select character_id from tavern_characters where tavern_id = $1) or id::text = any($3::text[]))`,
      [tavernId, wanted, keep],
    );
    if (party.length !== wanted.length) badRequest('Everyone in the group must be one of this tavern’s characters');
    return { dungeon, date, cleared, bosses, notes: notes || null, ids: party.map((p) => p.character_id) };
  }

  /** A clear ticks the dungeon off in every party member's dungeon log, keeping an earlier date. */
  async function tickCleared(ids: string[], dungeon: string, date: string) {
    await db.query(
      `update characters set dungeons_completed = dungeons_completed || jsonb_build_object($2::text, $3::text)
       where id = any($1::uuid[]) and not dungeons_completed ? $2`,
      [ids, dungeon, `${date}T00:00:00Z`],
    );
  }

  /** The run's feed post data (the party is trimmed to what a post shows). */
  function postData(run: ReturnType<typeof serializeRun>) {
    return {
      runId: run.id,
      dungeon: run.dungeon,
      date: run.date,
      cleared: run.cleared,
      bosses: run.bosses,
      characters: run.characters.map((ch: RunCharacter) => ({
        id: ch.id, name: ch.name, surname: ch.surname, class: ch.class, level: ch.level, avatarUrl: ch.avatarUrl,
      })),
    };
  }

  async function loadRun(tavern: TavernAccess, runId: string, viewerId: string) {
    const [row] = await db.query<RunRow>(`${RUN_SELECT} where r.id = $1 and r.tavern_id = $2`, [runId, tavern.id]);
    if (!row) throw new HTTPException(404, { message: 'Run not found' });
    return serializeRun(row, viewerId, tavern);
  }

  function serializeRun(r: RunRow, viewerId: string, tavern: Pick<TavernAccess, 'is_admin'>) {
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
      canDelete: r.logged_by === viewerId || tavern.is_admin,
      canEdit: tavern.is_admin,
    };
  }

  app.get('/taverns/:id/runs', async (c) => {
    const user = requireUser(c);
    const tavern = await membership(uuidParam(c, 'id'), user.id);
    const rows = await db.query<RunRow>(
      `${RUN_SELECT} where r.tavern_id = $1 order by r.run_on desc, r.created_at desc`,
      [tavern.id],
    );
    return c.json(rows.map((r) => serializeRun(r, user.id, tavern)));
  });

  /**
   * Log a run for the group (see `runInput`). Any member can log any of the tavern's characters. A clear ticks the
   * dungeon off in every party member's dungeon log, and the run gets one feed post naming the whole party.
   */
  app.post('/taverns/:id/runs', async (c) => {
    const user = requireUser(c);
    const tavern = await membership(uuidParam(c, 'id'), user.id);
    const input = await runInput(tavern.id, await jsonBody(c));

    const [run] = await db.query<{ id: string }>(
      `insert into dungeon_runs (tavern_id, dungeon, run_on, bosses, cleared, notes, logged_by)
       values ($1, $2, $3::date, $4::text[], $5, $6, $7) returning id`,
      [tavern.id, input.dungeon, input.date, input.bosses, input.cleared, input.notes, user.id],
    );
    await db.query(
      `insert into dungeon_run_characters (run_id, character_id) select $1, unnest($2::uuid[])`,
      [run.id, input.ids],
    );
    if (input.cleared) await tickCleared(input.ids, input.dungeon, input.date);

    const out = await loadRun(tavern, run.id, user.id);
    await recordEvent(db, { kind: 'dungeon_run', tavernId: tavern.id, userId: user.id, data: postData(out) });
    return c.json(out, 201);
  });

  /**
   * Admin-only: replace a run's details (same body as logging one). Its feed post is updated to match. Making it a
   * clear ticks the dungeon off for the party; like deleting, an edit never unticks anything.
   */
  app.patch('/taverns/:id/runs/:runId', async (c) => {
    const user = requireUser(c);
    const tavern = await membership(uuidParam(c, 'id'), user.id);
    const runId = uuidParam(c, 'runId');
    const before = await loadRun(tavern, runId, user.id);
    if (!tavern.is_admin) throw new HTTPException(403, { message: 'Only tavern admins can edit runs' });
    const input = await runInput(
      tavern.id,
      await jsonBody(c),
      before.characters.map((ch: RunCharacter) => ch.id),
    );

    await db.query(
      `update dungeon_runs set dungeon = $2, run_on = $3::date, bosses = $4::text[], cleared = $5, notes = $6
       where id = $1`,
      [runId, input.dungeon, input.date, input.bosses, input.cleared, input.notes],
    );
    await db.query('delete from dungeon_run_characters where run_id = $1 and not (character_id = any($2::uuid[]))', [
      runId,
      input.ids,
    ]);
    await db.query(
      `insert into dungeon_run_characters (run_id, character_id) select $1, unnest($2::uuid[]) on conflict do nothing`,
      [runId, input.ids],
    );
    if (input.cleared) await tickCleared(input.ids, input.dungeon, input.date);

    const out = await loadRun(tavern, runId, user.id);
    await db.query(
      `update feed_events set data = $3::jsonb where kind = 'dungeon_run' and tavern_id = $1 and data->>'runId' = $2`,
      [tavern.id, runId, JSON.stringify(postData(out))],
    );
    return c.json(out);
  });

  /** Whoever logged a run, or a tavern admin, can delete it; its feed post goes too. Dungeon log ticks stay. */
  app.delete('/taverns/:id/runs/:runId', async (c) => {
    const user = requireUser(c);
    const tavern = await membership(uuidParam(c, 'id'), user.id);
    const runId = uuidParam(c, 'runId');
    const [run] = await db.query<{ logged_by: string | null }>(
      'select logged_by from dungeon_runs where id = $1 and tavern_id = $2',
      [runId, tavern.id],
    );
    if (!run) throw new HTTPException(404, { message: 'Run not found' });
    if (run.logged_by !== user.id && !tavern.is_admin) {
      throw new HTTPException(403, { message: 'Only whoever logged this run, or a tavern admin, can delete it' });
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
