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

### Ideas for later
- Role (tank / healer / DPS) per character
- "Who can run this dungeon?" filter based on level ranges
- Item level and gear
- Last-updated timestamp and level-up history

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

## Data model (draft)

```
users
  id, battlenet_id, battletag, display_name, created_at

characters
  id, user_id → users, region, name, surname, ruleset,
  class, race, level, last_synced_at

taverns
  id, name, owner_id → users, invite_code, created_at

tavern_members
  tavern_id → taverns, user_id → users, joined_at

tavern_characters
  tavern_id → taverns, character_id → characters
```

---

## Getting started

### Prerequisites
- Node.js 20+
- A Blizzard developer account and API client: <https://develop.battle.net/>
  - Add your redirect URI, e.g. `http://localhost:5173/auth/callback`

### Install

```bash
git clone <repo-url>
cd tavern-tracker
npm install
```

### Environment variables

Create `.env` in the API package (never commit this file):

```bash
BNET_CLIENT_ID=your_client_id
BNET_CLIENT_SECRET=your_client_secret
BNET_REDIRECT_URI=http://localhost:5173/auth/callback
BNET_REGION=eu
DATABASE_URL=postgres://...
SESSION_SECRET=a_long_random_string
```

And in the web app (`.env.local`):

```bash
VITE_API_URL=http://localhost:8787
```

### Run locally

```bash
npm run dev        # starts the Vite dev server and the API
```

Then open <http://localhost:5173>.

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run frontend and API in development |
| `npm run build` | Production build |
| `npm run lint` | Lint the codebase |
| `npm test` | Run tests |

---

## Project structure (proposed)

```
tavern-tracker/
├── apps/
│   ├── web/            # React + Vite frontend
│   │   └── src/
│   │       ├── pages/          # Login, Taverns, TavernDetail, MyCharacters
│   │       ├── components/     # CharacterTable, AddCharacterForm, ...
│   │       └── api/            # Typed client for our backend
│   └── api/            # Backend: auth, Blizzard client, sync jobs
│       └── src/
│           ├── auth/           # Battle.net OAuth
│           ├── blizzard/       # Forever API client
│           └── routes/         # /me, /characters, /taverns
└── package.json
```

---

## Roadmap

- [ ] Battle.net OAuth login
- [ ] Blizzard Forever API client with caching
- [ ] Add characters (import or manual)
- [ ] Create / join Taverns via invite code
- [ ] Sortable character table
- [ ] Scheduled refresh
- [ ] Roles and dungeon-planning filters

---

## Disclaimer

Tavern Tracker is a fan project and is not affiliated with or endorsed by Blizzard Entertainment. World of Warcraft and Battle.net are trademarks of Blizzard Entertainment, Inc.