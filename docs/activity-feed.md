# Tavern activity feed

The **Feed** tab is the home page of each Tavern: a social-media-style timeline of notable things that happened to the
characters in it.

## Post types

| Kind | When it's posted | Scope | Source |
|---|---|---|---|
| `level_up` | A sync sees a higher level than the one stored. Several levels at once become one post ("+3 levels"). Every 10th level and max level (60) get a highlighted post. | Character | Character summary (already synced) |
| `loot` | A sync sees a newly equipped item of **rare** quality or better (rare, epic, legendary, artifact). All new items found in one sync go into one post. | Character | `GET /profile/wow/character/{slug}/equipment` |
| `achievement` | A sync sees newly completed achievements. All found in one sync go into one post. | Character | `GET /profile/wow/character/{slug}/achievements` |
| `dungeon_cleared` | The owner ticks a dungeon off in the character's dungeon log (My dungeons). Ticking the same dungeon again posts nothing; unticking it deletes the post. | Character | App (dungeon log) |
| `dungeon_run` | A member logs a group run (Dungeons → Runs). One post names the whole party, the dungeon, whether they cleared it and the bosses killed. Deleting the run deletes the post. | Tavern | App (run log) |
| `character_joined` | A player adds a character to the Tavern. | Tavern | App |
| `member_joined` | A player joins via an invite. | Tavern | App |
| `tavern_founded` | The Tavern is created. | Tavern | App |
| `title_gained` | A character (or, for player titles like Altaholic, a player) becomes the holder of a tavern title. If they overtook the previous holder, the post tags both characters ("Grim took The Ninja from Judy") and shows both scores. Titles are worked out whenever the tavern or a player's profile is loaded, so the post appears then; saving the new holder is conditional on the old one, so two requests at once can't both post. A holder who left the tavern isn't tagged. A tavern's first titles are handed out without posts (see baselines below). | Tavern | App (tavern titles) |
| `auction_daily` | Each morning (UTC), from the hourly auction fetch: yesterday's most in-demand items (with average prices), the item most gold was spent on, and the priciest believable listing, for the region. Sales are estimated by comparing hourly snapshots (see the README's "Yesterday on the auction house"). One post per region (`tavern_id` and `character_id` null, `data.region`), shown in every tavern with a character in that region; admins can hide it from their tavern. | Region | Auction house API (hourly snapshots) |
| `auction_market` | Each morning, after the region's `auction_daily`: the tavern's local market. Its characters with the latest posts, grouped by faction and level, where they're probably levelling, and up to five items for their level that sold on their side's (and neutral) auction houses, with average prices (`data.groups`). One per tavern per region (`tavern_id` set). | Tavern | Auction house API (sales by faction) and item API (levels) |
| `user_post` | A member writes a post from the box at the top of the feed: some text (up to 2,000 characters) and/or up to 4 pictures, posted either as themselves (IRL) or as one of their own characters in that tavern, picked from a **Post as** dropdown. Posted as a character, the post shows the character's portrait and name with the player beside it. `data` is `{text, images: [{id}]}`; pictures live in `post_images` and the feed adds each one's `url`. | Tavern | App (players) |
| `generated_image` | A tavern admin presses **Commission painting** on a post: an AI picture of it, shown to everyone once finished. See [generated-images.md](generated-images.md). Removing it deletes the picture. | Tavern | App (OpenAI Images API) |

**Character-scoped** posts appear in every Tavern the character is currently in, including posts from before it joined,
so a new Tavern starts with some history. Removing a character from a Tavern hides its posts there. Deleting the
character deletes its posts.

**Tavern-scoped** posts belong to one Tavern only.

## Avoiding spam: baselines

The first time we successfully read a character's equipment or achievements, we record what's already there **without
posting**. Only things that appear *after* that baseline become posts. Likewise, no `level_up` post is made the first time
a character's level is seen. So adding a level-60 character with a full set of epics creates a single "brought X to
the tavern" post, not twenty loot posts.

Titles work the same way per tavern: the first time anyone in a tavern holds a title, every title held then is saved
silently (`taverns.titles_baseline_at`), so the first character in a new tavern doesn't post every title at once.
From then on each new holder gets a `title_gained` post. Taverns that already had title holders before posts existed
count as baselined.

Each item or achievement is only ever posted once per character (unique on `character_id` + id), so swapping gear back
and forth doesn't post again. The level-up check reads and updates the level in one statement, under a row lock, so two
overlapping syncs (scheduled refresh and a manual refresh) can't post the same level-up twice.

## Blizzard API notes

- The Forever API is undocumented, so the equipment and achievement parsers are tolerant (like the character parser),
  and both endpoints are best-effort:
  - **404** means "not available for this character or game": no posts, no error shown.
  - Other failures are logged and the character sync still succeeds.
- Classic Era has no achievements. If Forever doesn't expose them, the achievement post type simply never appears.
- **Rate limits:** each sync now makes up to three calls instead of one. If the summary includes
  `last_login_timestamp` and it hasn't changed since the last sync, the equipment and achievement calls are skipped,
  because nothing can have changed while the character was offline.
- Characters only update when they **log out**, so posts lag live play the same way levels do. Posts are timestamped
  when we *detect* the change, not when it happened in game.

Hovering a character's name or portrait in a post shows their profile card, and hovering an item shows its tooltip.
Loot posts save the whole item (stats, effects and so on), so the tooltip still works after the item is replaced.

## Cheers 🍺

Every post has a **Cheers** button. It toggles your cheer and shows the count, with "Cheers from Alice, Bob" next to
it. Cheers are **scoped per Tavern**: the same character post shown in two Taverns has separate cheers in each, so
nobody sees names from a Tavern they're not in. Leaving a Tavern removes your cheers there. The button updates
instantly (optimistically) and rolls back if the request fails.

## Players' own posts 💬

`POST /api/taverns/:id/posts` (members only) with `{ text?, images?: string[], characterId?: string | null }` creates a
`user_post` and returns it as it appears in the feed. `images` are base64 data URLs (or bare base64), at most 4, each
at most 1.5 MB and 4.2 MB all together; the type is recognised from the file's first bytes, and only PNG, JPEG, GIF and WebP are accepted (no
SVG, which could run script). `characterId` must be one of your characters that's in this tavern; leave it out to post
as yourself. A post needs some text or a picture. The web app shrinks big photos to 1600 px JPEGs before sending them,
to about 1 MB each, since the whole request has to fit in a Netlify function's 6 MB body limit, and remembers who you last posted as in
each tavern (in local storage).

Pictures are stored in the database (`post_images`, bytea) and served from `GET /api/taverns/:id/posts/images/:imageId`
to members of that tavern only, with `nosniff`, a sandboxing CSP and a long private cache (a post's pictures never
change). Deleting the post deletes its pictures. The text is plain text: line breaks are kept, and nothing is rendered
as HTML.

## Deleting posts

Tavern admins can delete any post they see in the tavern's feed (a confirmation dialog asks first). A post that
belongs to the tavern (`tavern_id` set: joins, dungeon runs, paintings, ...) is deleted outright, with its cheers and
any painting on it. A character's post (`tavern_id` null) is shared by every tavern the character is in, so it's only
hidden from this tavern (`feed_hidden_events`) and its cheers here are dropped; other taverns still see it.
Players can also delete their own `user_post`s; deleting anyone else's post is admins only (403).
`DELETE /api/taverns/:id/feed/:eventId` (404 if the tavern can't see the post).

## Data model

```
characters (new columns)
  last_login_at, gear_baseline_at, achievements_baseline_at

character_items          -- rare+ items we've seen equipped
  character_id → characters, item_id, quality, first_seen_at   (pk: character_id, item_id)

character_achievements   -- completed achievements we've seen
  character_id → characters, achievement_id, completed_at       (pk: character_id, achievement_id)

feed_events
  id (identity), kind, tavern_id → taverns (null for character posts),
  character_id → characters, user_id → users, data jsonb, created_at

feed_reactions           -- cheers
  event_id → feed_events, tavern_id → taverns, user_id → users, created_at   (pk: all three ids)

post_images              -- pictures on players' own posts
  id, tavern_id → taverns, event_id → feed_events (cascade), position, content_type, image bytea, created_at
```

`data` holds the kind-specific payload, such as `{from, to}` for a level-up, `{items: [{id, name, quality, slot, itemLevel}]}`
for loot, `{achievements: [{id, name, completedAt}]}` for achievements, `{tavernName}` for a founding, or `{title: {key, name, icon, value}, characters: [newHolder, previousHolder?],
previous: {characterId, player: {id, displayName}, value} | null}` for a title gained. Character
name, class and owner are joined in when the feed is read, so renames show up everywhere.

## API

`GET /api/taverns/:id/feed?before=<eventId>&limit=<1-50, default 30>` (members only)

```json
{
  "events": [
    {
      "id": "42",
      "kind": "level_up",
      "createdAt": "2026-11-12T10:00:00Z",
      "character": { "id": "…", "name": "Judgement", "surname": "Judy", "class": "Paladin", "race": "Human", "level": 23 },
      "user": { "id": "…", "displayName": "Alice" },
      "data": { "from": 20, "to": 23 }
    }
  ],
  "nextCursor": "41"
}
```

Each event also has `"cheers": { "count": 2, "names": ["Bob", "Alice"], "cheeredByMe": true }`.
Newest first. `nextCursor` is `null` when there are no older posts.

Optional filters, which combine (a post must match all of them), and page with `before` as usual:

| Parameter | Keeps posts… |
| --- | --- |
| `kinds=level_up,loot` | of these kinds (an unknown kind is a 400) |
| `characters=<id>,<id>` | about any of these characters, including group runs and paintings they're in |
| `mine=1` | about your own characters (so no "joined the tavern" or "founded" posts) |
| `q=<text>` | mentioning the text, case-insensitively: character and player names, item names and qualities, achievements, dungeons, bosses, painting captions, and the text of players' own posts. Up to 100 characters. |

`PUT` / `DELETE /api/taverns/:id/feed/:eventId/cheers` (members only, and only for posts visible in that Tavern)
adds or removes your cheer and returns the post's updated `cheers`. Both are idempotent.

## UI

- The tabs are now **Feed** (default) · Characters · Dungeons.
- Each post is a card with an avatar (the character's initial, in their class colour), the owner's name, a relative
  time ("3h ago", with the exact time on hover), a headline, and details: an item list in quality colours, or
  achievement names.
- "Load older posts" pages through the history. The feed refetches after **Refresh levels** or after a character is
  added.
- The empty state explains what will appear and that updates arrive when characters log out.
- A **post box** above the feed: a **Post as** dropdown (you, or any of your characters in the tavern), a text box
  (Ctrl/⌘+Enter posts), **Add pictures** (or paste a screenshot into the text box) with removable thumbnails, and
  **Post**.
- A filter bar above the feed: a search box, a character picker, **Just my characters**, and post-type toggles
  (Posts, Level ups, Loot, Achievements, Dungeons, Titles, Paintings, Arrivals). Filters live in the URL (`?q=`, `?chars=`,
  `?mine=1`, `?types=`), so a refresh or shared link keeps them, and they're applied by the API so older pages are
  filtered too. The faction picker still applies on top.

## Ideas for later

- **Comments** on posts.
- **Races to milestones:** "First in the Tavern to reach 60!" (computed when the level-up is posted).
- **Dungeon or profession posts**, if the Forever API exposes encounters or professions.
- A combined feed across all your Taverns on the home page.
- Discord webhook per Tavern to cross-post milestones.
