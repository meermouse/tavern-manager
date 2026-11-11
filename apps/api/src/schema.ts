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
-- Last known zone: from the Blizzard API when it reports one, otherwise set by the player.
alter table characters add column if not exists zone text;
alter table characters add column if not exists zone_source text;
alter table characters add column if not exists zone_updated_at timestamptz;

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

select pg_advisory_unlock(727274);
`;

export async function migrate(db: Db): Promise<void> {
  await db.exec(SCHEMA);
}
