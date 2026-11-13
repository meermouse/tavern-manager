# Tavern Tracker

A web app that helps groups of friends playing **World of Warcraft: Forever** keep track of everyone's characters, so it's easy to see who's levelled where and plan dungeon runs together.

Players sign in with their Battle.net account, add their characters, and join a **Tavern**: a shared group where everyone can see each other's progress at a glance.

---

## Core concepts

| Concept | Description |
|---|---|
| **User** | A person who signs in with Battle.net. Has a display name (their "IRL name") shown to the rest of the Tavern. |
| **Character** | A WoW Forever character owned by a user. A user can have many characters. |
| **Tavern** | A named group of characters that can track each other's progress. A user can add any of their characters to a Tavern, and can belong to more than one Tavern. |

## Features

### MVP
- **Battle.net login.** OAuth 2.0 sign-in; no separate passwords.
- **Add characters.** Import characters from the signed-in Battle.net account, or add one manually by first name + surname.
- **Dungeon finder.** Browse the original level-60 dungeons and nine new WoW Forever dungeons, with recommended group sizes and faction access. Tavern characters appear in every matching level range. New dungeon levels and access notes follow [Blizzard's dungeon announcement](https://news.blizzard.com/en-us/article/24301455/explore-the-new-dungeons-of-world-of-warcraft-forever).
- **Map of Azeroth.** The home page embeds the interactive [Forever Map](https://wowforevermap.com/) by wowforevermap.com, a separate fan site, credited with a link to the full map. A "Simple map" tab switches to our own stylised map (classic continents plus Zephras Isle, Riverglades, Shen'dralas and Mount Hyjal, with capitals, towns and dungeon entrances), which also serves as a fallback if the embed doesn't load. The choice is remembered per browser.
- **Activity feed.** Each Tavern's home tab is a social-style feed of level-ups (with milestone and max-level highlights), newly equipped rare/epic/legendary gear, achievements, and new members and characters. Friends can raise a 🍺 **Cheers** on any post. The first sync of each character records a silent baseline, so adding a character doesn't flood the feed. See [docs/activity-feed.md](docs/activity-feed.md).
- **Character portraits.** Each character's Blizzard render headshot (from the character-media endpoint) is shown as a class-coloured icon wherever the character appears: the character table, feed posts, the dungeon finder, My characters and the tavern sidebar. Characters without an image yet (e.g. pending) show their initial instead.
- **Hover cards.** Hover over (or tab to) any character, anywhere in the app, to see a quick profile card: portrait, level, race and class, title, guild, faction, ruleset, player, item level and achievement points. Hover over any item (feed loot posts, the details pane's gear) for a WoW-style tooltip: item level, binding, slot and type, armour or weapon damage, stats, enchants, durability, required level, equip effects, set and flavour text, as far as the Blizzard API provides them. Touch screens skip these, since there's no hover.
- **Character details.** Click a row in a tavern's character table to open a details pane above it: the full-body render, title, guild, faction, ruleset, item level, achievement points, last seen in game, everything they have equipped (quality-coloured, in paper-doll order), and their latest feed posts. Click the portrait to open it full-screen at Blizzard's largest render size, then scroll, double-click or use +/− to zoom and drag to pan. Click the row again, press Esc or ✕ to close.
- **Taverns.** Create a Tavern, invite friends with a shareable invite link/code, and choose which of your characters to add to it.
- **Character list (primary screen).** A sortable, filterable table of every character in the selected Tavern, with these columns:

  | Column | Source |
  |---|---|
  | Character name | Blizzard API (`name` + `surname`) |
  | Ruleset | Blizzard API (Normal, PvP, Roleplay, Roleplay PvP) |
  | IRL name | The owning user's display name in the app |
  | Class | Blizzard API |
  | Race | Blizzard API |
  | Level | Blizzard API |

- **Refresh.** Character data refreshes on a schedule and on demand.
- **Leaderboard.** A friendly competition: a tavern's **Leaderboard** tab (and a top-level Leaderboard page covering your characters plus everyone in your taverns) ranks characters by a stat picked from a drop-down, with 🥇🥈🥉 for the podium, a highest/lowest-first toggle and a "best character per player" option. The default is **total gear item level** (all equipped item levels added up, shirt and tabard excluded). Stats come from data we already sync (gear, level, achievements, cheers) plus two best-effort Blizzard endpoints synced alongside each character: `/achievements/statistics` (lifetime counters such as total deaths, kills, deaths from falling, drinks consumed) and `/statistics` (the character sheet: health, strength, armor, crit...). Stats are only offered when someone has data for them, and any statistic Blizzard returns that isn't in the curated list still appears under "Every other statistic".

### Ideas for later
- Role (tank / healer / DPS) per character
- Item icons and tooltips (needs the Forever static-data namespace for `/data/wow/media/item/{id}`)
- Character details on the My characters page and from feed posts
- Feed comments (see [docs/activity-feed.md](docs/activity-feed.md#ideas-for-later))

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite (TypeScript) |
| Table | TanStack Table |
| Data fetching | TanStack Query |
| Routing | React Router |
| Backend API | Small TypeScript API (e.g. Hono on Cloudflare Workers, or Node/Express) |
| Database | Postgres (e.g. Supabase or Neon) or Cloudflare D1 |
| Auth | Battle.net OAuth 2.0 (authorization code flow) |

> **Why a backend?** The Battle.net OAuth code exchange and all Blizzard API calls need the client secret, which must never ship to the browser. The React app only talks to our own API.

---

## Blizzard API

WoW Forever characters are **realmless**. They are identified by first name + surname, unique per region.

```
GET https://{region}.api.blizzard.com/profile/wow/character/{name}-{surname}
    ?namespace=profile-forever-{region}
```

- `{name}-{surname}` is lowercase, e.g. `judgement-judy`.
- `{region}` is one of `us`, `eu`, `kr`, `tw`.
- Guild rosters: `/data/wow/guild/{guild-slug}/roster` (profile namespace).

**Caveats**
- The Forever API is **not officially documented yet** and may change.
- Character data updates when the character **logs out**, so levels can lag behind live play.
- Low-level characters (reportedly under level 10) may not be returned by the character endpoint. Show these as "pending" and retry.
- Respect Blizzard's rate limits: cache responses and refresh on a schedule rather than on every page load.

**Open question:** whether the account-level endpoint (`/profile/user/wow` with the `wow.profile` scope) returns Forever characters. If it doesn't, character import falls back to manual name + surname entry with an ownership check.

---

## Data model

```
users
  id, battlenet_id, battletag, display_name, created_at

sessions
  id (sha256 of cookie token), user_id → users, bnet_access_token,
  bnet_token_expires_at, expires_at

characters
  id, user_id → users, region, name, surname, ruleset,
  class, race, level, status (ok | pending | error), sync_error,
  last_synced_at, last_attempt_at,
  guild, faction, gender, title, item_level, achievement_points,   -- details pane
  avatar_url, inset_url, render_url, media_synced_at,              -- character-media renders
  equipment (jsonb), equipment_synced_at                           -- full equipped gear

taverns
  id, name, owner_id → users, invite_code, created_at

tavern_members
  tavern_id → taverns, user_id → users, joined_at

tavern_characters
  tavern_id → taverns, character_id → characters

feed_events, feed_reactions, character_items, character_achievements
  activity feed; see docs/activity-feed.md
```

---

## Getting started

### Prerequisites
- Node.js 20+
- *(Optional for local dev)* A Blizzard developer account and API client: <https://develop.battle.net/>
  - Add your redirect URI, e.g. `http://localhost:5173/auth/callback`
- *(Optional for local dev)* Postgres. Without `DATABASE_URL` the API uses an embedded Postgres ([PGlite](https://pglite.dev)) stored in `apps/api/.data/`.

### Install & run

```bash
npm install
npm run dev        # starts the Vite dev server (5173) and the API (8787)
```

Then open <http://localhost:5173>.

**Zero-config local mode:** with no Battle.net credentials, the API enables a *dev login* (sign in with any BattleTag) and a *mock Blizzard client* that returns deterministic fake character data. Any character whose name contains "pending" behaves like a low-level character the API doesn't return yet. Open a second browser profile to play as a friend.

### Environment variables

Copy `apps/api/.env.example` to `apps/api/.env` (never commit this file):

```bash
BNET_CLIENT_ID=your_client_id
BNET_CLIENT_SECRET=your_client_secret
BNET_REDIRECT_URI=http://localhost:5173/auth/callback
BNET_REGION=eu
DATABASE_URL=postgres://...          # optional locally; required in production
SESSION_SECRET=a_long_random_string
```

| Variable | Default | Notes |
|---|---|---|
| `DEV_LOGIN` | on when no Battle.net creds | Never enabled in production |
| `BLIZZARD_MOCK` | on when no Battle.net creds | Fake character data |
| `REFRESH_INTERVAL_MINUTES` | `30` | How stale a character must be before the scheduler refreshes it |

In the web app, `VITE_API_URL` (see `apps/web/.env.example`) only sets where the Vite dev server proxies `/api` and `/auth`. The browser always talks to the same origin, so cookies stay first-party.

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run frontend and API in development |
| `npm run build` | Production build (API → `apps/api/dist`, web → `apps/web/dist`) |
| `npm start` | Run the built API, which also serves the built web app |
| `npm run lint` | Lint the codebase |
| `npm run typecheck` | Type-check all packages |
| `npm test` | Run tests (API against in-memory Postgres; table component in jsdom) |

---

## Hosting on Netlify

The repo is ready to deploy to Netlify as-is (`netlify.toml`):

| Piece | Netlify feature |
|---|---|
| React app | Static site from `apps/web/dist`, with an SPA fallback |
| API (`/api/*`, `/auth/*`) | One Netlify Function (`netlify/functions/api.ts`) running the same Hono app via `hono/netlify` |
| Scheduled refresh | Scheduled Function (`netlify/functions/refresh.ts`), every 30 minutes |
| Database | Postgres: [Netlify DB](https://docs.netlify.com/build/data-and-storage/netlify-db/) (Neon) sets `NETLIFY_DATABASE_URL` automatically, or any Postgres via `DATABASE_URL` |

Because the API is served from the same origin as the site, there's no CORS to configure, and the session cookie is first-party.

**Steps**

1. Create a site from this repo in Netlify (build settings are picked up from `netlify.toml`).
2. Add a database: either enable Netlify DB, or set `DATABASE_URL` to a Postgres (e.g. Neon or Supabase) connection string. Tables are created automatically on first request.
3. In your Blizzard API client, add the redirect URI `https://<your-site>.netlify.app/auth/callback`.
4. Set environment variables (Site configuration → Environment variables), scoped to **Functions**:
   `BNET_CLIENT_ID`, `BNET_CLIENT_SECRET`, `BNET_REDIRECT_URI`, `BNET_REGION`, `SESSION_SECRET` (16+ random characters).
5. Deploy.

Deployed functions always run in production mode: Secure cookies, no dev login, no mock data. `netlify dev` keeps the local defaults.

The plain Node server (`npm run build && npm start`) also works for hosts like Fly.io, Render or a VPS. It serves the API and the built web app from one process and runs the refresh on an in-process timer.

---

## How it works

- **Auth:** Battle.net OAuth authorization-code flow (`openid wow.profile`). The CSRF `state` lives in a short-lived signed cookie. Sessions are random tokens in an httpOnly cookie, stored hashed in the `sessions` table (30 days). The user's Battle.net access token is kept on the session so characters can be imported.
- **Characters:** added manually (first name + surname + region) or imported from `/profile/user/wow`. A character can only be claimed by one user (unique on region + name + surname, case-insensitive). If import fails, the UI falls back to manual entry.
- **Blizzard client:** client-credentials app token (cached), `GET /profile/wow/character/{name}-{surname}?namespace=profile-forever-{region}`. A 404 marks the character **pending** and it is retried later. Because the Forever API is undocumented, the response parser is deliberately tolerant (`character_class`/`playable_class`, localized names, several ruleset shapes); see `apps/api/src/blizzard/client.ts`.
- **Portraits:** `GET /profile/wow/character/{name}-{surname}/character-media` returns render URLs on `render.worldofwarcraft.com` (`avatar`, `inset`, `main`, `main-raw`; older `avatar_url`/`bust_url`/`render_url` are also read). Only `https://` URLs are stored. They're fetched when a character has none, when Blizzard reports a new login (appearance only changes in game), or once a day, and a failed fetch keeps the old images. The browser loads the images straight from Blizzard's CDN. The mock client draws stand-in SVG portraits so local dev shows something.
- **Character details:** `GET /api/taverns/:id/characters/:characterId` (tavern members only) returns the profile, renders, the gear saved by the last equipment sync, and the character's five latest posts in that tavern.
- **Refresh & rate limits:** characters are refreshed sequentially, oldest first. The scheduler refreshes anything older than `REFRESH_INTERVAL_MINUTES`. "Refresh levels" on a tavern only refreshes characters older than 5 minutes, and per-character refresh has a 2-minute cooldown.

---

## Project structure

```
tavern-tracker/
├── apps/
│   ├── web/                    # React + Vite frontend
│   │   └── src/
│   │       ├── pages/          # Login, Join, Taverns, TavernDetail, MyCharacters
│   │       ├── components/     # CharacterTable, AddCharacterForm, Layout, ...
│   │       └── api/            # Typed client + TanStack Query hooks
│   └── api/                    # Hono backend
│       ├── src/
│       │   ├── auth/           # Battle.net OAuth
│       │   ├── blizzard/       # Forever API client + mock
│       │   ├── routes/         # /auth, /api/me, /api/characters, /api/taverns, /api/invites
│       │   ├── schema.ts       # Idempotent Postgres schema
│       │   ├── sync.ts         # Character sync + stale refresh
│       │   └── index.ts        # Node server (local / self-hosted)
│       └── test/
├── netlify/functions/          # api.ts (HTTP) + refresh.ts (scheduled)
├── netlify.toml
└── package.json                # npm workspaces
```

---

## Roadmap

- [x] Battle.net OAuth login
- [x] Blizzard Forever API client with caching
- [x] Add characters (import or manual)
- [x] Create / join Taverns via invite code
- [x] Sortable character table
- [x] Scheduled refresh
- [x] Tavern activity feed (level-ups, gear, achievements)
- [ ] Verify Forever API response shapes against live data (parser is best-effort until the API is documented)
- [ ] Ownership check for manually added characters
- [ ] Roles and dungeon-planning filters

---

## Disclaimer

Tavern Tracker is a fan project and is not affiliated with or endorsed by Blizzard Entertainment. World of Warcraft and Battle.net are trademarks of Blizzard Entertainment, Inc.