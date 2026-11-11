import { randomInt } from 'node:crypto';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { badRequest, jsonBody, requireUser, uuidParam, type AppDeps, type AppEnv } from '../context.js';
import { serializeCharacter } from '../serialize.js';
import { refreshStale, type CharacterRow } from '../sync.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 8): string {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

interface TavernRow {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: Date;
}

function tavernName(body: Record<string, unknown>): string {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > 60) badRequest('Tavern name must be 1–60 characters');
  return name;
}

export function tavernRoutes({ db, blizzard }: AppDeps) {
  const app = new Hono<AppEnv>();

  async function membership(tavernId: string, userId: string): Promise<TavernRow> {
    const [row] = await db.query<TavernRow>(
      `select t.* from taverns t join tavern_members m on m.tavern_id = t.id
       where t.id = $1 and m.user_id = $2`,
      [tavernId, userId],
    );
    if (!row) throw new HTTPException(404, { message: 'Tavern not found' });
    return row;
  }

  async function ownedTavern(tavernId: string, userId: string): Promise<TavernRow> {
    const tavern = await membership(tavernId, userId);
    if (tavern.owner_id !== userId) throw new HTTPException(403, { message: 'Only the tavern owner can do that' });
    return tavern;
  }

  async function detail(tavern: TavernRow, userId: string) {
    const members = await db.query<{ user_id: string; display_name: string; joined_at: Date }>(
      `select m.user_id, u.display_name, m.joined_at from tavern_members m join users u on u.id = m.user_id
       where m.tavern_id = $1 order by m.joined_at`,
      [tavern.id],
    );
    const characters = await db.query<CharacterRow & { owner_name: string }>(
      `select c.*, u.display_name as owner_name from tavern_characters tc
       join characters c on c.id = tc.character_id
       join users u on u.id = c.user_id
       where tc.tavern_id = $1
       order by c.level desc nulls last, c.name`,
      [tavern.id],
    );
    return {
      id: tavern.id,
      name: tavern.name,
      inviteCode: tavern.invite_code,
      isOwner: tavern.owner_id === userId,
      createdAt: tavern.created_at,
      members: members.map((m) => ({
        userId: m.user_id,
        displayName: m.display_name,
        isOwner: m.user_id === tavern.owner_id,
        joinedAt: m.joined_at,
      })),
      characters: characters.map((c) => ({
        ...serializeCharacter(c),
        ownerId: c.user_id,
        ownerName: c.owner_name,
      })),
    };
  }

  // ---- Taverns ----

  app.get('/taverns', async (c) => {
    const user = requireUser(c);
    const rows = await db.query<TavernRow & { member_count: number; character_count: number }>(
      `select t.*,
         (select count(*)::int from tavern_members where tavern_id = t.id) as member_count,
         (select count(*)::int from tavern_characters where tavern_id = t.id) as character_count
       from taverns t join tavern_members m on m.tavern_id = t.id
       where m.user_id = $1 order by t.created_at`,
      [user.id],
    );
    return c.json(
      rows.map((t) => ({
        id: t.id,
        name: t.name,
        isOwner: t.owner_id === user.id,
        memberCount: t.member_count,
        characterCount: t.character_count,
      })),
    );
  });

  app.post('/taverns', async (c) => {
    const user = requireUser(c);
    const name = tavernName(await jsonBody(c));
    const [tavern] = await db.query<TavernRow>(
      `with t as (
         insert into taverns (name, owner_id, invite_code) values ($1, $2, $3) returning *
       ), m as (
         insert into tavern_members (tavern_id, user_id) select id, owner_id from t
       )
       select * from t`,
      [name, user.id, generateInviteCode()],
    );
    return c.json(await detail(tavern, user.id), 201);
  });

  app.get('/taverns/:id', async (c) => {
    const user = requireUser(c);
    const tavern = await membership(uuidParam(c, 'id'), user.id);
    return c.json(await detail(tavern, user.id));
  });

  app.patch('/taverns/:id', async (c) => {
    const user = requireUser(c);
    const tavern = await ownedTavern(uuidParam(c, 'id'), user.id);
    const name = tavernName(await jsonBody(c));
    const [updated] = await db.query<TavernRow>('update taverns set name = $2 where id = $1 returning *', [
      tavern.id,
      name,
    ]);
    return c.json(await detail(updated, user.id));
  });

  app.delete('/taverns/:id', async (c) => {
    const user = requireUser(c);
    const tavern = await ownedTavern(uuidParam(c, 'id'), user.id);
    await db.query('delete from taverns where id = $1', [tavern.id]);
    return c.json({ ok: true });
  });

  app.post('/taverns/:id/invite-code', async (c) => {
    const user = requireUser(c);
    const tavern = await ownedTavern(uuidParam(c, 'id'), user.id);
    const [updated] = await db.query<TavernRow>('update taverns set invite_code = $2 where id = $1 returning *', [
      tavern.id,
      generateInviteCode(),
    ]);
    return c.json(await detail(updated, user.id));
  });

  app.post('/taverns/:id/leave', async (c) => {
    const user = requireUser(c);
    const tavern = await membership(uuidParam(c, 'id'), user.id);
    if (tavern.owner_id === user.id) badRequest("You own this tavern — delete it instead of leaving");
    await db.query(
      `delete from tavern_characters where tavern_id = $1
         and character_id in (select id from characters where user_id = $2)`,
      [tavern.id, user.id],
    );
    await db.query('delete from tavern_members where tavern_id = $1 and user_id = $2', [tavern.id, user.id]);
    return c.json({ ok: true });
  });

  app.post('/taverns/:id/refresh', async (c) => {
    const user = requireUser(c);
    const tavern = await membership(uuidParam(c, 'id'), user.id);
    await refreshStale(db, blizzard, { staleMinutes: 5, limit: 50, tavernId: tavern.id, deadline: Date.now() + 8000 });
    return c.json(await detail(tavern, user.id));
  });

  // ---- World map: your characters plus everyone's in your taverns ----

  app.get('/map', async (c) => {
    const user = requireUser(c);
    const rows = await db.query<CharacterRow & { owner_name: string }>(
      `select c.*, u.display_name as owner_name from characters c
       join users u on u.id = c.user_id
       where c.user_id = $1
          or c.id in (
            select tc.character_id from tavern_characters tc
            join tavern_members m on m.tavern_id = tc.tavern_id
            where m.user_id = $1)
       order by c.level desc nulls last, c.name`,
      [user.id],
    );
    return c.json(rows.map((r) => ({ ...serializeCharacter(r), ownerId: r.user_id, ownerName: r.owner_name })));
  });

  // ---- Characters in a tavern ----

  app.put('/taverns/:id/characters/:characterId', async (c) => {
    const user = requireUser(c);
    const tavern = await membership(uuidParam(c, 'id'), user.id);
    const characterId = uuidParam(c, 'characterId');
    const [owned] = await db.query('select id from characters where id = $1 and user_id = $2', [characterId, user.id]);
    if (!owned) throw new HTTPException(404, { message: 'Character not found' });
    await db.query(
      'insert into tavern_characters (tavern_id, character_id) values ($1, $2) on conflict do nothing',
      [tavern.id, characterId],
    );
    return c.json({ ok: true });
  });

  app.delete('/taverns/:id/characters/:characterId', async (c) => {
    const user = requireUser(c);
    const tavern = await membership(uuidParam(c, 'id'), user.id);
    const characterId = uuidParam(c, 'characterId');
    // Players can remove their own characters; the owner can remove anyone's.
    const params: unknown[] = [tavern.id, characterId];
    let ownerCheck = '';
    if (tavern.owner_id !== user.id) {
      params.push(user.id);
      ownerCheck = 'and character_id in (select id from characters where user_id = $3)';
    }
    await db.query(`delete from tavern_characters where tavern_id = $1 and character_id = $2 ${ownerCheck}`, params);
    return c.json({ ok: true });
  });

  // ---- Invites ----

  app.get('/invites/:code', async (c) => {
    const user = c.get('user');
    const code = c.req.param('code').toUpperCase();
    const [tavern] = await db.query<TavernRow & { member_count: number; is_member: boolean }>(
      `select t.*,
         (select count(*)::int from tavern_members where tavern_id = t.id) as member_count,
         exists(select 1 from tavern_members where tavern_id = t.id and user_id = $2) as is_member
       from taverns t where invite_code = $1`,
      [code, user?.id ?? null],
    );
    if (!tavern) throw new HTTPException(404, { message: 'That invite code is not valid' });
    return c.json({ id: tavern.id, name: tavern.name, memberCount: tavern.member_count, isMember: tavern.is_member });
  });

  app.post('/invites/:code/join', async (c) => {
    const user = requireUser(c);
    const code = c.req.param('code').toUpperCase();
    const [tavern] = await db.query<TavernRow>('select * from taverns where invite_code = $1', [code]);
    if (!tavern) throw new HTTPException(404, { message: 'That invite code is not valid' });
    await db.query('insert into tavern_members (tavern_id, user_id) values ($1, $2) on conflict do nothing', [
      tavern.id,
      user.id,
    ]);
    return c.json({ tavernId: tavern.id });
  });

  return app;
}
