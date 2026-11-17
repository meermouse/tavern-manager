import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireUser, uuidParam, type AppDeps, type AppEnv } from '../context.js';
import type { Db } from '../db.js';
import { userFeed } from '../feed.js';
import { GEAR_PRICED_SQL, GEAR_VALUE_SQL, itemPrices } from '../prices.js';
import { equipmentIds, gearSummary, serializeCharacterDetails, serializeEquipment, serializeCharacter } from '../serialize.js';
import type { CharacterRow } from '../sync.js';
import { IRL_NAME_SQL } from '../tavernAccess.js';

/** Characters on your global leaderboard (`$1` is your user id): your own, plus everyone in your taverns. */
const VISIBLE_CHARACTERS = `select id from characters where user_id = $1
  union
  select tc.character_id from tavern_characters tc
    join tavern_members m on m.tavern_id = tc.tavern_id where m.user_id = $1`;

type LeaderboardRow = CharacterRow & {
  owner_name: string;
  achievements_earned: number;
  notable_items: number;
  cheers: number;
  cheers_given: number;
  feed_posts: number;
  gear_value: number | null;
  gear_priced: number;
};

function statMap(value: unknown): Record<string, number> | null {
  const raw = typeof value === 'string' ? JSON.parse(value) : value;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, number>) : null;
}

/**
 * Everything a leaderboard ranks by, for the characters matched by `scope` (a subquery of character ids).
 * Cheers (received by the character, given by its player) count only reactions in `cheerTaverns` (a subquery of tavern ids). Both may use `$1`.
 */
async function leaderboard(db: Db, param: string, scope: string, cheerTaverns: string, tavernId: string | null) {
  const rows = await db.query<LeaderboardRow>(
    `select c.*, ${IRL_NAME_SQL} as owner_name,
       (select count(*)::int from character_achievements a where a.character_id = c.id) as achievements_earned,
       (select count(*)::int from character_items i where i.character_id = c.id) as notable_items,
       (select count(*)::int from feed_reactions r join feed_events e on e.id = r.event_id
          where e.character_id = c.id and r.tavern_id in (${cheerTaverns})) as cheers,
       (select count(*)::int from feed_reactions r
          where r.user_id = c.user_id and r.tavern_id in (${cheerTaverns})) as cheers_given,
       (select count(*)::int from feed_events e where e.character_id = c.id and e.kind in ('level_up', 'loot', 'achievement'))
          as feed_posts,
       ${GEAR_VALUE_SQL} as gear_value, ${GEAR_PRICED_SQL} as gear_priced
     from characters c join users u on u.id = c.user_id
       left join tavern_characters tc on tc.character_id = c.id and tc.tavern_id = $2::uuid
     where c.id in (${scope})
     order by c.name, c.surname`,
    [param, tavernId],
  );
  return rows.map((r) => ({
    ...serializeCharacter(r),
    ownerId: r.user_id,
    ownerName: r.owner_name,
    ...gearSummary(serializeEquipment(r)),
    achievementsEarned: r.achievements_earned,
    notableItems: r.notable_items,
    cheers: r.cheers,
    cheersGiven: r.cheers_given,
    feedPosts: r.feed_posts,
    gearValue: r.gear_value,
    gearPriced: r.gear_priced,
    statistics: statMap(r.statistics),
    characterStats: statMap(r.character_stats),
    statisticsSyncedAt: r.statistics_synced_at,
  }));
}

export function leaderboardRoutes({ db }: AppDeps) {
  const app = new Hono<AppEnv>();

  /** One tavern's characters; cheers from that tavern only. */
  app.get('/taverns/:id/leaderboard', async (c) => {
    const user = requireUser(c);
    const tavernId = uuidParam(c, 'id');
    const [member] = await db.query('select 1 from tavern_members where tavern_id = $1 and user_id = $2', [
      tavernId,
      user.id,
    ]);
    if (!member) throw new HTTPException(404, { message: 'Tavern not found' });
    return c.json(
      await leaderboard(
        db,
        tavernId,
        'select character_id from tavern_characters where tavern_id = $1',
        'select $1::uuid',
        tavernId,
      ),
    );
  });

  /** Outside a tavern: your own characters plus everyone in any tavern you belong to. */
  app.get('/leaderboard', async (c) => {
    const user = requireUser(c);
    return c.json(
      await leaderboard(db, user.id, VISIBLE_CHARACTERS, 'select tavern_id from tavern_members where user_id = $1', null),
    );
  });

  /**
   * The details pane for anyone on the global leaderboard. Recent posts come from every tavern you share with them
   * (plus tavern-less ones).
   */
  app.get('/leaderboard/characters/:characterId', async (c) => {
    const user = requireUser(c);
    const characterId = uuidParam(c, 'characterId');
    const [row] = await db.query<CharacterRow & { owner_name: string }>(
      `select c.*, u.display_name as owner_name from characters c join users u on u.id = c.user_id
       where c.id = $2 and c.id in (${VISIBLE_CHARACTERS})`,
      [user.id, characterId],
    );
    if (!row) throw new HTTPException(404, { message: 'Character not found' });
    const recent = await userFeed(db, user.id, { limit: 5, characterId });
    const prices = await itemPrices(db, row.region, equipmentIds(row));
    return c.json(serializeCharacterDetails(row, recent.events, prices));
  });

  return app;
}
