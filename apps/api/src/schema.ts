import type { Db } from './db.js';

// Idempotent schema. Wrapped in an advisory lock so concurrent cold starts
// (e.g. several serverless instances) don't race each other.
export const SCHEMA = `
select pg_advisory_lock(727274);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  battlenet_id text not null unique,
  battletag text not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  bnet_access_token text,
  bnet_token_expires_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions(user_id);

create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  region text not null,
  name text not null,
  surname text not null,
  ruleset text,
  class text,
  race text,
  level integer,
  status text not null default 'pending' check (status in ('ok', 'pending', 'error')),
  sync_error text,
  last_synced_at timestamptz,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists characters_identity_idx
  on characters(region, lower(name), lower(surname));
create index if not exists characters_user_idx on characters(user_id);

create table if not exists taverns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references users(id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists tavern_members (
  tavern_id uuid not null references taverns(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (tavern_id, user_id)
);

create table if not exists tavern_characters (
  tavern_id uuid not null references taverns(id) on delete cascade,
  character_id uuid not null references characters(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (tavern_id, character_id)
);

-- Activity feed (see docs/activity-feed.md).
alter table characters add column if not exists last_login_at timestamptz;
alter table characters add column if not exists gear_baseline_at timestamptz;
alter table characters add column if not exists achievements_baseline_at timestamptz;

create table if not exists character_items (
  character_id uuid not null references characters(id) on delete cascade,
  item_id integer not null,
  quality text not null,
  first_seen_at timestamptz not null default now(),
  primary key (character_id, item_id)
);

create table if not exists character_achievements (
  character_id uuid not null references characters(id) on delete cascade,
  achievement_id integer not null,
  completed_at timestamptz,
  first_seen_at timestamptz not null default now(),
  primary key (character_id, achievement_id)
);

create table if not exists feed_events (
  id bigint generated always as identity primary key,
  kind text not null,
  tavern_id uuid references taverns(id) on delete cascade,
  character_id uuid references characters(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists feed_events_character_idx on feed_events(character_id, id desc);
create index if not exists feed_events_tavern_idx on feed_events(tavern_id, id desc) where tavern_id is not null;

-- "Cheers!" reactions. Scoped per tavern: a character's posts show in every tavern it's in,
-- but each tavern only sees its own members' cheers.
create table if not exists feed_reactions (
  event_id bigint not null references feed_events(id) on delete cascade,
  tavern_id uuid not null references taverns(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, tavern_id, user_id)
);

-- Character details pane and portraits.
alter table characters add column if not exists guild text;
alter table characters add column if not exists faction text;
alter table characters add column if not exists gender text;
alter table characters add column if not exists title text;
alter table characters add column if not exists item_level integer;
alter table characters add column if not exists achievement_points integer;
alter table characters add column if not exists avatar_url text;
alter table characters add column if not exists inset_url text;
alter table characters add column if not exists render_url text;
alter table characters add column if not exists media_synced_at timestamptz;
-- Everything the character has equipped, as of the last equipment fetch (EquippedItem[]).
alter table characters add column if not exists equipment jsonb;
alter table characters add column if not exists equipment_synced_at timestamptz;
-- Which parser version produced \`equipment\`; older saves get re-fetched once (see EQUIPMENT_VERSION).
alter table characters add column if not exists equipment_version integer not null default 0;

-- Party roles the owner picks for the character (any of 'tank', 'healer', 'damage'; empty = none).
alter table characters add column if not exists roles text[] not null default '{}';

-- Leaderboard: lifetime counters from /achievements/statistics and the character sheet from /statistics
-- (both StatisticMap: name → number).
alter table characters add column if not exists statistics jsonb;
alter table characters add column if not exists character_stats jsonb;
alter table characters add column if not exists statistics_synced_at timestamptz;

-- Trained professions from /professions (CharacterProfession[]: name, kind, skill, maxSkill).
alter table characters add column if not exists professions jsonb;
alter table characters add column if not exists professions_synced_at timestamptz;

-- Who holds each tavern title, and since when. Holders keep a title until someone strictly beats them, so ties go
-- to whoever got there first. subject_id is a character id, or a user id for player titles (Altaholic).
create table if not exists tavern_title_holders (
  tavern_id uuid not null references taverns(id) on delete cascade,
  title_key text not null,
  subject_id text not null,
  since timestamptz not null default now(),
  primary key (tavern_id, title_key)
);
-- When a tavern's first titles were handed out (silently: no feed posts for that first burst). Taverns that already
-- had holders before this column existed count as baselined.
alter table taverns add column if not exists titles_baseline_at timestamptz;
update taverns t set titles_baseline_at = now()
  where titles_baseline_at is null and exists (select 1 from tavern_title_holders h where h.tavern_id = t.id);

-- Dungeon log: which dungeons the owner has marked as completed, as { "<dungeon name>": "<when logged>" }.
alter table characters add column if not exists dungeons_completed jsonb not null default '{}';

-- Dungeon runs a tavern logged: who went, which bosses died, and whether they cleared it.
create table if not exists dungeon_runs (
  id uuid primary key default gen_random_uuid(),
  tavern_id uuid not null references taverns(id) on delete cascade,
  dungeon text not null,
  run_on date not null default current_date,
  bosses text[] not null default '{}',
  cleared boolean not null default false,
  notes text,
  logged_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists dungeon_runs_tavern_idx on dungeon_runs(tavern_id, run_on desc, created_at desc);

create table if not exists dungeon_run_characters (
  run_id uuid not null references dungeon_runs(id) on delete cascade,
  character_id uuid not null references characters(id) on delete cascade,
  primary key (run_id, character_id)
);

-- Tavern admins: can rename a character's IRL name in the tavern, remove anyone's character from it and edit its
-- dungeon runs. The owner is always an admin (and is flagged as one); the owner can make other members admins.
alter table tavern_members add column if not exists is_admin boolean not null default false;
update tavern_members m set is_admin = true from taverns t
  where t.id = m.tavern_id and t.owner_id = m.user_id and not m.is_admin;

-- The IRL name a tavern admin gave a character in this tavern; null shows the owning player's display name.
alter table tavern_characters add column if not exists irl_name text;

-- AI paintings an admin commissioned of feed posts (see docs/generated-images.md). Each has one
-- 'generated_image' feed post; deleting the post deletes the picture.
create table if not exists generated_images (
  id uuid primary key default gen_random_uuid(),
  tavern_id uuid not null references taverns(id) on delete cascade,
  event_id bigint references feed_events(id) on delete cascade,
  requested_by uuid references users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'generating', 'ready', 'failed')),
  -- What was sent to the image API: the prompt and the character renders used as references ({ url, label }[]).
  prompt text not null,
  "references" jsonb not null default '[]',
  image bytea,
  content_type text,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists generated_images_event_idx on generated_images(event_id);
-- The post it's a painting of (null once that post is deleted).
alter table generated_images add column if not exists source_event_id bigint references feed_events(id) on delete set null;
create index if not exists generated_images_source_idx on generated_images(source_event_id);
create index if not exists generated_images_tavern_idx on generated_images(tavern_id, created_at desc);

-- Character posts an admin deleted from one tavern's feed. A character's posts (tavern_id null) show in every tavern
-- it's in, so deleting one there only hides it in that tavern; the tavern's own posts are deleted outright.
create table if not exists feed_hidden_events (
  tavern_id uuid not null references taverns(id) on delete cascade,
  event_id bigint not null references feed_events(id) on delete cascade,
  hidden_by uuid references users(id) on delete set null,
  hidden_at timestamptz not null default now(),
  primary key (tavern_id, event_id)
);

-- The going auction house price of each item, per region (copper per unit; see prices.ts). Rows are upserted, never
-- deleted: an item that isn't listed right now keeps its last known price.
create table if not exists auction_prices (
  region text not null,
  item_id integer not null,
  price bigint not null,
  listings integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (region, item_id)
);

-- When each region's auction houses were last fetched, successfully or not.
create table if not exists auction_snapshots (
  region text primary key,
  attempted_at timestamptz not null default now(),
  fetched_at timestamptz,
  houses integer not null default 0,
  items integer not null default 0,
  error text
);
-- Every request the last fetch made (AuctionTraceStep[]), for the debug view.
alter table auction_snapshots add column if not exists trace jsonb;

-- "Yesterday on the auction house" (see auctionActivity.ts): estimated sales per item per day (UTC), from comparing
-- each hourly fetch with the one before. Kept for two weeks.
create table if not exists auction_sales (
  region text not null,
  day text not null,
  item_id integer not null,
  purchases integer not null default 0,
  units bigint not null default 0,
  copper bigint not null default 0,
  primary key (region, day, item_id)
);
-- One row per region per day: how many hourly comparisons went into it, the priciest believable listings seen
-- (PriceyListing[]), and when its feed post went up.
create table if not exists auction_daily (
  region text not null,
  day text not null,
  comparisons integer not null default 0,
  houses integer not null default 0,
  priciest jsonb,
  posted_at timestamptz,
  primary key (region, day)
);
-- Item names and qualities from the static game data, for auction house posts.
create table if not exists item_names (
  id integer primary key,
  name text not null,
  quality text not null,
  fetched_at timestamptz not null default now()
);
-- Item level, level needed and class, for the tavern market posts (null until fetched with these details).
alter table item_names add column if not exists item_level integer;
alter table item_names add column if not exists required_level integer;
alter table item_names add column if not exists item_class text;
alter table item_names add column if not exists details_at timestamptz;

-- The same estimated sales split by faction ('Alliance', 'Horde', 'Neutral' from the house's name), for each
-- tavern's local market post (see tavernMarket.ts). Kept for a few days.
create table if not exists auction_faction_sales (
  region text not null,
  day text not null,
  faction text not null,
  item_id integer not null,
  purchases integer not null default 0,
  units bigint not null default 0,
  copper bigint not null default 0,
  primary key (region, day, faction, item_id)
);
-- Which taverns have had their local market post for a day, and how many runs tried (item details can take a few).
create table if not exists auction_market_posts (
  tavern_id uuid not null references taverns(id) on delete cascade,
  region text not null,
  day text not null,
  attempts integer not null default 0,
  posted_at timestamptz,
  primary key (tavern_id, region, day)
);

-- Pictures players attach to their own feed posts ('user_post'; see routes/posts.ts). Deleting the post deletes them.
create table if not exists post_images (
  id uuid primary key default gen_random_uuid(),
  tavern_id uuid not null references taverns(id) on delete cascade,
  event_id bigint not null references feed_events(id) on delete cascade,
  position integer not null default 0,
  content_type text not null,
  image bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists post_images_event_idx on post_images(event_id, position);

select pg_advisory_unlock(727274);
`;

export async function migrate(db: Db): Promise<void> {
  await db.exec(SCHEMA);
}
