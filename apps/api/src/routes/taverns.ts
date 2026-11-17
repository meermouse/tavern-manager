import { randomInt } from 'node:crypto';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { GEAR_VALUE_SQL } from '../prices.js';
import { awardTitles, FEED_POSTS_SQL, tavernTitles } from '../titles.js';
import { badRequest, jsonBody, requireUser, uuidParam, type AppDeps, type AppEnv } from '../context.js';
import { deleteTavernPost, eventVisibleInTavern, FEED_KINDS, recordEvent, setCheer, tavernFeed, type FeedKind } from '../feed.js';
import { serializeCharacter, serializeCharacterDetails } from '../serialize.js';
import { refreshStale, type CharacterRow } from '../sync.js';
import { IRL_NAME_SQL, adminTavern, tavernMembership, type TavernAccess } from '../tavernAccess.js';

const MAX_IRL_NAME = 40;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 8): string {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

type TavernRow = Omit<TavernAccess, 'is_admin'>;

function tavernName(body: Record<string, unknown>): string {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > 60) badRequest('Tavern name must be 1–60 characters');
  return name;
}

export function tavernRoutes({ db, blizzard }: AppDeps) {
  const app = new Hono<AppEnv>();

  const membership = (tavernId: string, userId: string) => tavernMembership(db, tavernId, userId);

  async function ownedTavern(tavernId: string, userId: string): Promise<TavernAccess> {
    const tavern = await membership(tavernId, userId);
    if (tavern.owner_id !== userId) throw new HTTPException(403, { message: 'Only the tavern owner can do that' });
    return tavern;
  }

  async function detail(tavern: TavernRow, userId: string) {
    const members = await db.query<{ user_id: string; display_name: string; is_admin: boolean; joined_at: Date }>(
      `select m.user_id, u.display_name, m.is_admin, m.joined_at from tavern_members m join users u on u.id = m.user_id
       where m.tavern_id = $1 order by m.joined_at`,
      [tavern.id],
    );
    const isAdmin = (memberId: string) =>
      memberId === tavern.owner_id || members.some((m) => m.user_id === memberId && m.is_admin);
    const characters = await db.query<CharacterRow & { owner_name: string; irl_name: string | null; feed_posts: number; gear_value: number | null }>(
      `select c.*, ${IRL_NAME_SQL} as owner_name, tc.irl_name, ${FEED_POSTS_SQL} as feed_posts, ${GEAR_VALUE_SQL} as gear_value from tavern_characters tc
       join characters c on c.id = tc.character_id
       join users u on u.id = c.user_id
       where tc.tavern_id = $1
       order by c.level desc nulls last, c.name`,
      [tavern.id],
    );
    const ranked = await tavernTitles(db, tavern.id, characters);
    const titles = awardTitles(characters, ranked);
    return {
      id: tavern.id,
      name: tavern.name,
      inviteCode: tavern.invite_code,
      isOwner: tavern.owner_id === userId,
      isAdmin: isAdmin(userId),
      createdAt: tavern.created_at,
      members: members.map((m) => ({
        userId: m.user_id,
        displayName: m.display_name,
        isOwner: m.user_id === tavern.owner_id,
        isAdmin: isAdmin(m.user_id),
        joinedAt: m.joined_at,
      })),
      characters: characters.map((c) => ({
        ...serializeCharacter(c),
        ownerId: c.user_id,
        ownerName: c.owner_name,
        /** True when an admin set this character's IRL name here, rather than it being the owner's display name. */
        irlNameOverridden: c.irl_name !== null,
        titles: titles.get(c.id) ?? [],
      })),
      /** Every title with its standings, for the Titles tab. */
      titles: ranked,
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
         insert into tavern_members (tavern_id, user_id, is_admin) select id, owner_id, true from t
       )
       select * from t`,
      [name, user.id, generateInviteCode()],
    );
    await recordEvent(db, { kind: 'tavern_founded', tavernId: tavern.id, userId: user.id, data: { tavernName: name } });
    return c.json(await detail(tavern, user.id), 201);
  });

  app.get('/taverns/:id', async (c) => {
    const user = requireUser(c);
    const tavern = await membership(uuidParam(c, 'id'), user.id);
    return c.json(await detail(tavern, user.id));
  });

  app.get('/taverns/:id/feed', async (c) => {
    const user = requireUser(c);
    const tavern = await membership(uuidParam(c, 'id'), user.id);
    const before = c.req.query('before');
    if (before !== undefined && !/^\d{1,18}$/.test(before)) badRequest('Invalid cursor');
    const limit = Math.min(50, Math.max(1, Number(c.req.query('limit')) || 30));
    // Optional filters: ?kinds=a,b  ?characters=id,id  ?mine=1  ?q=text
    const list = (name: string) => c.req.query(name)?.split(',').filter(Boolean) ?? [];
    const kinds = list('kinds');
    if (kinds.some((k) => !FEED_KINDS.includes(k as FeedKind))) badRequest('Unknown post type');
    const characterIds = list('characters');
    if (characterIds.length > 100) badRequest('Too many characters');
    const search = c.req.query('q')?.trim().slice(0, 100) || undefined;
    return c.json(
      await tavernFeed(db, tavern.id, user.id, {
        before,
        limit,
        unfinishedImages: tavern.is_admin,
        kinds: kinds.length ? (kinds as FeedKind[]) : undefined,
        characterIds: characterIds.length ? characterIds : undefined,
        ownedBy: c.req.query('mine') === '1' ? user.id : undefined,
        search,
      }),
    );
  });

  for (const method of ['put', 'delete'] as const) {
    app[method]('/taverns/:id/feed/:eventId/cheers', async (c) => {
      const user = requireUser(c);
      const tavern = await membership(uuidParam(c, 'id'), user.id);
      const eventId = c.req.param('eventId');
      if (!/^\d{1,18}$/.test(eventId) || !(await eventVisibleInTavern(db, tavern.id, eventId))) {
        throw new HTTPException(404, { message: 'Post not found' });
      }
      return c.json(await setCheer(db, tavern.id, eventId, user.id, method === 'put'));
    });
  }

  /** Admin-only: delete a post from the tavern's feed (a character's post is only hidden from this tavern). */
  app.delete('/taverns/:id/feed/:eventId', async (c) => {
    const user = requireUser(c);
    const tavern = await adminTavern(db, uuidParam(c, 'id'), user.id);
    const eventId = c.req.param('eventId');
    if (!/^\d{1,18}$/.test(eventId) || !(await deleteTavernPost(db, tavern.id, eventId, user.id))) {
      throw new HTTPException(404, { message: 'Post not found' });
    }
    return c.json({ ok: true });
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
    await db.query('delete from feed_reactions where tavern_id = $1 and user_id = $2', [tavern.id, user.id]);
    await db.query('delete from tavern_members where tavern_id = $1 and user_id = $2', [tavern.id, user.id]);
    return c.json({ ok: true });
  });

  app.post('/taverns/:id/refresh', async (c) => {
    const user = requireUser(c);
    const tavern = await membership(uuidParam(c, 'id'), user.id);
    await refreshStale(db, blizzard, { staleMinutes: 5, limit: 50, tavernId: tavern.id, deadline: Date.now() + 8000 });
    return c.json(await detail(tavern, user.id));
  });

  // ---- Characters in a tavern ----

  /** Everything the details pane shows: profile, portraits, saved gear and this character's recent posts. */
  app.get('/taverns/:id/characters/:characterId', async (c) => {
    const user = requireUser(c);
    const tavern = await membership(uuidParam(c, 'id'), user.id);
    const characterId = uuidParam(c, 'characterId');
    const [row] = await db.query<CharacterRow & { owner_name: string }>(
      `select c.*, ${IRL_NAME_SQL} as owner_name from tavern_characters tc
       join characters c on c.id = tc.character_id
       join users u on u.id = c.user_id
       where tc.tavern_id = $1 and tc.character_id = $2`,
      [tavern.id, characterId],
    );
    if (!row) throw new HTTPException(404, { message: 'Character not found' });
    const recent = await tavernFeed(db, tavern.id, user.id, { limit: 5, characterId });
    return c.json(serializeCharacterDetails(row, recent.events));
  });

  app.put('/taverns/:id/characters/:characterId', async (c) => {
    const user = requireUser(c);
    const tavern = await membership(uuidParam(c, 'id'), user.id);
    const characterId = uuidParam(c, 'characterId');
    const [owned] = await db.query('select id from characters where id = $1 and user_id = $2', [characterId, user.id]);
    if (!owned) throw new HTTPException(404, { message: 'Character not found' });
    const [added] = await db.query(
      `insert into tavern_characters (tavern_id, character_id) values ($1, $2)
       on conflict do nothing returning character_id`,
      [tavern.id, characterId],
    );
    if (added) await recordEvent(db, { kind: 'character_joined', tavernId: tavern.id, characterId, userId: user.id });
    return c.json({ ok: true });
  });

  app.delete('/taverns/:id/characters/:characterId', async (c) => {
    const user = requireUser(c);
    const tavern = await membership(uuidParam(c, 'id'), user.id);
    const characterId = uuidParam(c, 'characterId');
    // Players can remove their own characters; admins can remove anyone's.
    const params: unknown[] = [tavern.id, characterId];
    let ownerCheck = '';
    if (!tavern.is_admin) {
      params.push(user.id);
      ownerCheck = 'and character_id in (select id from characters where user_id = $3)';
    }
    await db.query(`delete from tavern_characters where tavern_id = $1 and character_id = $2 ${ownerCheck}`, params);
    return c.json({ ok: true });
  });

  /**
   * Admin-only: `{ irlName }` sets the IRL name this tavern shows for a character. It doesn't touch the player's own
   * display name or other taverns. `null` or an empty name goes back to the owner's display name.
   */
  app.patch('/taverns/:id/characters/:characterId', async (c) => {
    const user = requireUser(c);
    const tavern = await adminTavern(db, uuidParam(c, 'id'), user.id);
    const characterId = uuidParam(c, 'characterId');
    const body = await jsonBody(c);
    if (body.irlName !== null && typeof body.irlName !== 'string') badRequest('irlName must be a name or null');
    const irlName = typeof body.irlName === 'string' ? body.irlName.trim().replace(/\s+/g, ' ') : '';
    if (irlName.length > MAX_IRL_NAME) badRequest(`IRL name must be ${MAX_IRL_NAME} characters or fewer`);
    const [updated] = await db.query(
      'update tavern_characters set irl_name = $3 where tavern_id = $1 and character_id = $2 returning character_id',
      [tavern.id, characterId, irlName || null],
    );
    if (!updated) throw new HTTPException(404, { message: 'Character not found' });
    return c.json(await detail(tavern, user.id));
  });

  // ---- Members ----

  /** Owner-only: `{ admin }` makes a member a tavern admin, or takes it away. The owner is always an admin. */
  app.put('/taverns/:id/members/:userId/admin', async (c) => {
    const user = requireUser(c);
    const tavern = await ownedTavern(uuidParam(c, 'id'), user.id);
    const memberId = uuidParam(c, 'userId');
    const body = await jsonBody(c);
    if (typeof body.admin !== 'boolean') badRequest('admin must be true or false');
    if (memberId === tavern.owner_id) badRequest('The tavern owner is always an admin');
    const [updated] = await db.query(
      'update tavern_members set is_admin = $3 where tavern_id = $1 and user_id = $2 returning user_id',
      [tavern.id, memberId, body.admin],
    );
    if (!updated) throw new HTTPException(404, { message: 'Member not found' });
    return c.json(await detail(tavern, user.id));
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
    const [joined] = await db.query(
      'insert into tavern_members (tavern_id, user_id) values ($1, $2) on conflict do nothing returning user_id',
      [tavern.id, user.id],
    );
    if (joined) await recordEvent(db, { kind: 'member_joined', tavernId: tavern.id, userId: user.id });
    return c.json({ tavernId: tavern.id });
  });

  return app;
}
