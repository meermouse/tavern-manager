import { HTTPException } from 'hono/http-exception';
import type { Db } from './db.js';

export interface TavernAccess {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: Date;
  /** Admin rights in this tavern: the owner always has them. */
  is_admin: boolean;
}

/** The tavern, as seen by one of its members (404 for anyone else). */
export async function tavernMembership(db: Db, tavernId: string, userId: string): Promise<TavernAccess> {
  const [row] = await db.query<TavernAccess>(
    `select t.*, (m.is_admin or t.owner_id = m.user_id) as is_admin
     from taverns t join tavern_members m on m.tavern_id = t.id
     where t.id = $1 and m.user_id = $2`,
    [tavernId, userId],
  );
  if (!row) throw new HTTPException(404, { message: 'Tavern not found' });
  return row;
}

/** The tavern, if the user is one of its admins (403 for other members). */
export async function adminTavern(db: Db, tavernId: string, userId: string): Promise<TavernAccess> {
  const tavern = await tavernMembership(db, tavernId, userId);
  if (!tavern.is_admin) throw new HTTPException(403, { message: 'Only tavern admins can do that' });
  return tavern;
}

/** A character's IRL name in a tavern: the admin-set name if there is one, else the owner's display name. */
export const IRL_NAME_SQL = 'coalesce(tc.irl_name, u.display_name)';
