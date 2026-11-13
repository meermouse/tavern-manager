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

select pg_advisory_unlock(727274);
`;

export async function migrate(db: Db): Promise<void> {
  await db.exec(SCHEMA);
}
