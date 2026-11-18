import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireUser, type AppDeps, type AppEnv } from '../context.js';
import { auctionStatus, refreshAuctionPrices } from '../prices.js';

/** Auction price fetching status, and a way for tavern admins to run it now and see what happened. */
export function priceRoutes({ db, blizzard, auctionListings }: AppDeps) {
  const app = new Hono<AppEnv>();

  const isAnyAdmin = async (userId: string) =>
    (
      await db.query(
        `select 1 from tavern_members m join taverns t on t.id = m.tavern_id
         where m.user_id = $1 and (m.is_admin or t.owner_id = m.user_id) limit 1`,
        [userId],
      )
    ).length > 0;

  app.get('/auction-prices', async (c) => {
    const user = requireUser(c);
    return c.json({
      supported: !!blizzard.getAuctionPrices,
      canRefresh: await isAnyAdmin(user.id),
      regions: await auctionStatus(db),
    });
  });

  /** Fetch now, ignoring the hourly limit. Tavern admins only: it's a lot of requests to Blizzard. */
  app.post('/auction-prices/refresh', async (c) => {
    const user = requireUser(c);
    if (!(await isAnyAdmin(user.id))) throw new HTTPException(403, { message: 'Only tavern admins can do that' });
    const regions = await db.query<{ region: string }>('select distinct region from characters');
    // Stay inside a serverless function's time limit.
    const deadline = Date.now() + 20_000;
    for (const { region } of regions) await refreshAuctionPrices(db, blizzard, region, { force: true, deadline, listings: auctionListings });
    return c.json({
      supported: !!blizzard.getAuctionPrices,
      canRefresh: true,
      regions: await auctionStatus(db),
    });
  });

  return app;
}
