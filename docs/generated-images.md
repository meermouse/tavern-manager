# Generated images

Tavern admins can turn the latest feed posts into an AI-painted picture in the World of Warcraft art style. The
picture is posted to the feed like any other post, so everyone can see it and raise a 🍺.

The typical use is a dungeon run: log the run, then **Generate image** paints the party in action inside that dungeon,
each character drawn from their Blizzard render.

## Using it

1. On a tavern's **Feed** tab, an admin presses **🎨 Generate image**.
2. They pick how many of the latest posts to paint (1–20, default 5). The form lists exactly which posts it will use.
3. **Generate** saves the request and adds a 🎨 post, which only admins see for now: "Alice commissioned a painting: *The Deadmines with Judy, Grim
   and Thorn*". While it's being painted, the post shows a placeholder, and the feed checks back every 5 seconds.
4. After a minute or two, the picture appears in the post and it is **posted to the feed for everyone** in the tavern,
   dated when it was finished. Click it to open it at full size (1536×1024).

Only one picture per tavern is painted at a time. Earlier pictures are never used as posts for a new one.

If painting fails, the post stays visible to admins only (for example, the image API's safety system rejects the prompt, or the account runs out of
credit), the post says why, and admins can **Try again** (same prompt) or **Remove** it. Admins can also remove a
finished picture. A job that hasn't finished after 20 minutes counts as failed.

## What goes into the picture

`apps/api/src/images/scene.ts` turns the chosen posts into a prompt. Only things that can be painted are used:

| From | Used for |
|---|---|
| Every character in the posts (the dungeon party first, then everyone else, newest first; at most 8) | Name, race, class, gender and faction, e.g. "Judgement, a female Human Paladin of the Alliance" |
| Each character's Blizzard render (`render_url`, falling back to the bust and headshot) | Sent as a **reference image** so the painting matches their real look, armour and colours |
| Their equipped rare-or-better gear in visible slots (weapons, head, shoulders, chest, back) | "Carries “Arcanite Reaper” (main hand)" |
| Class | A class-appropriate action in a fight (a mage hurling fireballs, a hunter with their pet, ...) |
| The newest `dungeon_run` or `dungeon_cleared` post | The setting: an action shot inside that dungeon, with a short description of what it looks like (`dungeonScenes.ts`) |
| That run's bosses | The final boss killed is the fight in the picture; earlier ones can appear in the background |
| `loot` posts | The character shows off the new item, faintly glowing |
| `level_up` posts at a milestone (every 10th level, max level) | A golden glow of power |
| `achievement`, `character_joined`, other dungeon posts | Small story details |

With no dungeon in the posts, the scene is everyone gathered in the tavern's common room, celebrating.

Never sent: IRL names, display names, Battle.net tags, dates, cheers, levels (apart from "max-level"), notes or stats.
The prompt asks for no text, names, logos or UI in the image.

## The image API

Pictures come from the **OpenAI Images API** (`apps/api/src/images/generator.ts`):

- With reference renders: `POST /v1/images/edits`, the prompt plus up to 8 character renders as `image[]`.
  `input_fidelity=high` keeps faces and armour closer to the renders.
- Without any (e.g. characters with no render yet): `POST /v1/images/generations` from the prompt alone.
- 1536×1024, WebP. The picture is stored in the database (`generated_images.image`), typically a few hundred KB.

Renders the API can't take (non-`https`, or not PNG/JPEG/WebP) are skipped, and the character is described in words
only.

| Variable | Default | Notes |
|---|---|---|
| `OPENAI_API_KEY` | — | Turns the feature on. Without it, production answers 503 and local dev draws a placeholder |
| `OPENAI_IMAGE_MODEL` | `gpt-image-1` | Any model the Images edits endpoint supports |
| `OPENAI_IMAGE_QUALITY` | `medium` | `low`, `medium`, `high` or `auto`. Higher costs more and takes longer |
| `OPENAI_IMAGE_INPUT_FIDELITY` | `high` | Set it empty to leave it out (for models that don't support it) |
| `IMAGE_MOCK` | on without a key, never in production | Draws a parchment "sketch" naming the setting and cast instead of calling the API |

Each picture is one paid API call (two or more if an admin retries). That's why only admins can generate.

## Running it in the background

A picture takes longer to paint than a normal request may run, especially on Netlify (functions time out after
about 10–26 seconds). So:

1. `POST /api/taverns/:id/images` saves the prompt and references in `generated_images` (status `pending`), adds the
   feed post, starts the job and returns `202` straight away.
2. The job claims the picture (`pending` → `generating`, so a duplicate start does nothing), calls the image API and
   saves the picture (`ready`) or the error (`failed`).

Where the job runs:

- **Node server / local dev:** in the same process, in the background.
- **Netlify:** the API function POSTs `{ imageId }` to the background function
  `netlify/functions/generate-image-background.ts`, which Netlify answers with 202 and lets run for up to 15 minutes.
  It only paints pictures that are still `pending`, which only an admin can create, so calling it directly can't do
  anything an admin didn't ask for.

## API

All under `/api/taverns/:id`.

| Request | Who | Does |
|---|---|---|
| `POST /images` `{ count }` | Admins | Paint the latest `count` posts (1–20, default 5). `202 { eventId, imageId }`. `409` if a picture is already being painted, `400` with no posts, `503` when not set up |
| `GET /images/:imageId` | Members | The picture (`Content-Type` from the API, cached privately; the URL changes on retry) |
| `POST /images/:imageId/retry` | Admins | Paint a failed picture again with the same prompt. `202` |
| `DELETE /images/:imageId` | Admins | Delete the picture and its post |

The post is a `generated_image` feed event (tavern-scoped). Its `data`:

```json
{
  "caption": "The Deadmines with Grimtusk and Judgement",
  "dungeon": "The Deadmines",
  "postCount": 5,
  "characters": [{ "id": "…", "name": "Grimtusk", "surname": "Bones", "class": "Mage", "level": 24, "avatarUrl": "…" }],
  "image": { "id": "…", "status": "ready", "error": null, "url": "/api/taverns/…/images/…?v=1" }
}
```

`image.status` is `pending`, `generating`, `ready` or `failed`. `url` is set only when it's `ready`, `error` only when
it's `failed`.

## Data model

```
generated_images
  id, tavern_id → taverns, event_id → feed_events (cascade), requested_by → users,
  status (pending | generating | ready | failed), prompt, references jsonb ({ url, label }[]),
  image bytea, content_type, error, attempts, created_at, started_at, finished_at
```

Deleting the post, or the tavern, deletes the picture.

## Ideas for later

- Let the admin add a line of direction ("make it night", "comic style").
- Pick posts individually instead of "the latest N".
- Offer a different provider (e.g. Gemini) behind the same `ImageGenerator` interface.
- Move pictures to object storage (Netlify Blobs, S3) if the database grows too big.
