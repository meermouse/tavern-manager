# Tavern activity feed

The **Feed** tab is the home page of each Tavern: a social-media-style timeline of notable things that happened to the
characters in it.

## Post types

| Kind | When it's posted | Scope | Source |
|---|---|---|---|
| `level_up` | A sync sees a higher level than the one stored. Several levels at once become one post ("+3 levels"). Every 10th level and max level (60) get a highlighted post. | Character | Character summary (already synced) |
| `loot` | A sync sees a newly equipped item of **rare** quality or better (rare, epic, legendary, artifact). All new items found in one sync go into one post. | Character | `GET /profile/wow/character/{slug}/equipment` |
| `achievement` | A sync sees newly completed achievements. All found in one sync go into one post. | Character | `GET /profile/wow/character/{slug}/achievements` |
| `character_joined` | A player adds a character to the Tavern. | Tavern | App |
| `member_joined` | A player joins via an invite. | Tavern | App |
| `tavern_founded` | The Tavern is created. | Tavern | App |

**Character-scoped** posts appear in every Tavern the character is currently in, including posts from before it joined,
so a new Tavern starts with some history. Removing a character from a Tavern hides its posts there. Deleting the
character deletes its posts.

**Tavern-scoped** posts belong to one Tavern only.

## Avoiding spam: baselines

The first time we successfully read a character's equipment or achievements, we record what's already there **without
posting**. Only things that appear *after* that baseline become posts. Likewise, no `level_up` post is made the first time
a character's level is seen. So adding a level-60 character with a full set of epics creates a single "brought X to
the tavern" post, not twenty loot posts.

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
```

`data` holds the kind-specific payload, such as `{from, to}` for a level-up, `{items: [{id, name, quality, slot, itemLevel}]}`
for loot, `{achievements: [{id, name, completedAt}]}` for achievements, or `{tavernName}` for a founding. Character
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

## Ideas for later

- **Comments** on posts.
- **Races to milestones:** "First in the Tavern to reach 60!" (computed when the level-up is posted).
- **Dungeon or profession posts**, if the Forever API exposes encounters or professions.
- A combined feed across all your Taverns on the home page.
- Discord webhook per Tavern to cross-post milestones.
