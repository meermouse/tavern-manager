import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api, type Cheers, type FeedEvent, type FeedPage } from '../api/client';
import { keys, useGeneratedImages, useIsTavernAdmin, useTavernFeed } from '../api/hooks';
import { CharacterAvatar } from './CharacterAvatar';
import { CharacterLink } from './CharacterLink';
import { ItemLink } from './ItemLink';
import { timeAgo } from '../time';
import { ClassName, classKey } from './ClassName';

const MAX_LEVEL = 60;

export { timeAgo } from '../time';

/** Every 10th level, and max level, deserve a bigger post. */
export function isMilestone(from: number, to: number): boolean {
  return to >= MAX_LEVEL || Math.floor(from / 10) < Math.floor(to / 10);
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function qualityLabel(q: string) {
  return q.charAt(0) + q.slice(1).toLowerCase();
}

function Avatar({ event }: { event: FeedEvent }) {
  if (event.character) {
    return (
      <CharacterLink character={event.character} focusable={false}>
        <CharacterAvatar character={event.character} size="md" className="feed-avatar" />
      </CharacterLink>
    );
  }
  const letter = (event.user?.displayName ?? '?').charAt(0).toUpperCase();
  return (
    <div className="feed-avatar" aria-hidden="true">
      {letter}
    </div>
  );
}

function CharName({ event }: { event: FeedEvent }) {
  const c = event.character;
  if (!c) return <strong>Someone</strong>;
  return (
    <CharacterLink character={c}>
      <strong className={classKey(c.class) ? `class-${classKey(c.class)}` : undefined}>
        {c.name} {c.surname}
      </strong>
    </CharacterLink>
  );
}

function headline(event: FeedEvent): { icon: string; text: ReactNode; className?: string } {
  const user = <strong>{event.user?.displayName ?? 'Someone'}</strong>;
  const d = event.data;
  switch (event.kind) {
    case 'level_up': {
      const from = d.from ?? 0;
      const to = d.to ?? 0;
      const gained = to - from;
      if (to >= MAX_LEVEL) {
        return {
          icon: '👑',
          className: 'milestone max',
          text: <><CharName event={event} /> reached <strong>max level {to}</strong>!</>,
        };
      }
      return {
        icon: isMilestone(from, to) ? '🎉' : '⬆️',
        className: isMilestone(from, to) ? 'milestone' : undefined,
        text: (
          <>
            <CharName event={event} /> reached level <strong>{to}</strong>
            {gained > 1 && <span className="muted"> (+{gained} levels)</span>}
          </>
        ),
      };
    }
    case 'loot': {
      const items = d.items ?? [];
      const best = items.some((i) => i.quality === 'LEGENDARY') ? 'legendary' : items.some((i) => i.quality === 'EPIC') ? 'epic' : 'rare';
      return {
        icon: best === 'rare' ? '🛡️' : '💎',
        className: `loot-${best}`,
        text:
          items.length === 1 ? (
            <><CharName event={event} /> equipped {best === 'epic' ? 'an' : 'a'} {best} item</>
          ) : (
            <><CharName event={event} /> equipped {items.length} new items</>
          ),
      };
    }
    case 'achievement': {
      const n = d.achievements?.length ?? 0;
      return {
        icon: '🏆',
        text: <><CharName event={event} /> earned {n === 1 ? 'an achievement' : plural(n, 'achievement')}</>,
      };
    }
    case 'dungeon_cleared':
      return {
        icon: '🗝️',
        className: 'dungeon-cleared',
        text: <><CharName event={event} /> cleared <strong>{d.dungeon ?? 'a dungeon'}</strong></>,
      };
    case 'dungeon_run': {
      const party = d.characters ?? [];
      return {
        icon: d.cleared ? '🗝️' : '⚔️',
        className: d.cleared ? 'dungeon-cleared' : undefined,
        text: (
          <>
            <PartyNames characters={party} /> {d.cleared ? 'cleared' : 'ran'} <strong>{d.dungeon ?? 'a dungeon'}</strong>
            {!d.cleared && d.bosses?.length ? <span className="muted"> ({d.bosses.length === 1 ? '1 boss' : `${d.bosses.length} bosses`} down)</span> : null}
          </>
        ),
      };
    }
    case 'character_joined': {
      const c = event.character;
      return {
        icon: '🍺',
        text: (
          <>
            {user} brought <CharName event={event} /> to the tavern
            {c && (c.level != null || c.class) && (
              <span className="muted">
                {' '}({c.level != null ? `level ${c.level}` : 'pending'}
                {c.class ? <> <ClassName value={c.class} /></> : null})
              </span>
            )}
          </>
        ),
      };
    }
    case 'member_joined':
      return { icon: '👋', text: <>{user} joined the tavern</> };
    case 'tavern_founded':
      return { icon: '🏠', text: <>{user} founded <strong>{d.tavernName ?? 'the tavern'}</strong></> };
    case 'generated_image':
      return {
        icon: '🎨',
        className: 'generated-image',
        text: (
          <>
            {user} commissioned a painting{d.caption ? <>: <strong>{d.caption}</strong></> : null}
          </>
        ),
      };
    default:
      return { icon: '•', text: <>Something happened</> };
  }
}

/** "Judy", "Judy and Grim", "Judy, Grim and Thorn", each linked to its hover card. */
function PartyNames({ characters }: { characters: NonNullable<FeedEvent['data']['characters']> }) {
  if (!characters.length) return <strong>Someone</strong>;
  return (
    <>
      {characters.map((c, i) => (
        <span key={c.id}>
          {i > 0 && (i === characters.length - 1 ? ' and ' : ', ')}
          <CharacterLink character={c}>
            <strong className={classKey(c.class) ? `class-${classKey(c.class)}` : undefined}>{c.name}</strong>
          </CharacterLink>
        </span>
      ))}
    </>
  );
}

/** Admin controls for a generated picture that failed. */
export interface ImageActions {
  retry: (imageId: string) => void;
  remove: (imageId: string) => void;
  busy?: boolean;
}

function GeneratedPicture({ event, actions }: { event: FeedEvent; actions?: ImageActions }) {
  const image = event.data.image;
  if (!image) return null;
  const from = event.data.postCount
    ? `Painted from the latest ${event.data.postCount === 1 ? 'post' : `${event.data.postCount} posts`}`
    : null;
  if (image.status === 'ready' && image.url) {
    return (
      <figure className="feed-picture">
        <a href={image.url} target="_blank" rel="noreferrer" title="Open full size">
          <img src={image.url} alt={event.data.caption ?? 'A painting of the tavern’s adventures'} loading="lazy" />
        </a>
        {(from || actions) && (
          <figcaption className="small-text muted">
            {from}
            {actions && (
              <button type="button" className="link small-text" disabled={actions.busy} onClick={() => actions.remove(image.id)}>
                Remove
              </button>
            )}
          </figcaption>
        )}
      </figure>
    );
  }
  if (image.status === 'failed') {
    return (
      <div className="feed-picture failed">
        <p className="small-text">
          The painting didn’t work out{image.error ? <span className="muted">: {image.error}</span> : null}
        </p>
        {actions && (
          <div className="feed-picture-actions">
            <button type="button" className="ghost small" disabled={actions.busy} onClick={() => actions.retry(image.id)}>
              Try again
            </button>
            <button type="button" className="ghost small" disabled={actions.busy} onClick={() => actions.remove(image.id)}>
              Remove
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="feed-picture painting" role="status">
      <span className="small-text muted">The tavern artist is painting… this usually takes a minute or two.</span>
    </div>
  );
}

function Details({ event, imageActions }: { event: FeedEvent; imageActions?: ImageActions }) {
  if (event.kind === 'generated_image') return <GeneratedPicture event={event} actions={imageActions} />;
  if (event.kind === 'dungeon_run' && event.data.bosses?.length) {
    return <p className="feed-bosses small-text"><span className="muted">Bosses:</span> {event.data.bosses.join(' · ')}</p>;
  }
  if (event.kind === 'loot' && event.data.items?.length) {
    return (
      <ul className="feed-items">
        {event.data.items.map((i) => (
          <li key={i.id}>
            <ItemLink item={i} />
            <span className="muted small-text">
              {[qualityLabel(i.quality), i.slot, i.itemLevel != null ? `item level ${i.itemLevel}` : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  if (event.kind === 'achievement' && event.data.achievements?.length) {
    return (
      <ul className="feed-items">
        {event.data.achievements.map((a) => (
          <li key={a.id}>
            <span className="achievement-name">{a.name}</span>
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

export function cheersLabel(cheers: Cheers): string {
  if (!cheers.count) return 'Be the first to raise a glass';
  return `Cheers from ${cheers.names.join(', ')}`;
}

export function CheerButton({ cheers, onToggle, pending }: { cheers: Cheers; onToggle: () => void; pending?: boolean }) {
  return (
    <button
      type="button"
      className={`cheer ghost small${cheers.cheeredByMe ? ' cheered' : ''}`}
      aria-pressed={cheers.cheeredByMe}
      title={cheersLabel(cheers)}
      disabled={pending}
      onClick={onToggle}
    >
      <span aria-hidden="true">🍺</span> Cheers{cheers.count > 0 && <span className="cheer-count">{cheers.count}</span>}
    </button>
  );
}

/** Toggle the viewer's cheer, updating the cached feed immediately and rolling back on error. */
function useCheer(tavernId: string, viewerName: string | undefined) {
  const qc = useQueryClient();
  const key = keys.feed(tavernId);
  const patch = (eventId: string, fn: (c: Cheers) => Cheers) =>
    qc.setQueryData<InfiniteData<FeedPage>>(key, (data) =>
      data && {
        ...data,
        pages: data.pages.map((p) => ({
          ...p,
          events: p.events.map((e) => (e.id === eventId ? { ...e, cheers: fn(e.cheers) } : e)),
        })),
      },
    );
  return useMutation({
    mutationFn: ({ eventId, on }: { eventId: string; on: boolean }) => api.setCheer(tavernId, eventId, on),
    onMutate: async ({ eventId, on }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<InfiniteData<FeedPage>>(key);
      patch(eventId, (c) => ({
        count: c.count + (on ? 1 : -1),
        cheeredByMe: on,
        names: on ? [...c.names, viewerName ?? 'You'] : c.names.filter((n) => n !== viewerName),
      }));
      return { previous };
    },
    onError: (_err, _vars, ctx) => ctx?.previous && qc.setQueryData(key, ctx.previous),
    onSuccess: (cheers, { eventId }) => patch(eventId, () => cheers),
  });
}

export function FeedPost({
  event,
  now,
  onCheer,
  imageActions,
}: {
  event: FeedEvent;
  now?: number;
  onCheer?: () => void;
  /** Admins only: retry or remove a generated picture. */
  imageActions?: ImageActions;
}) {
  const { icon, text, className } = headline(event);
  const showOwner = !!event.character && event.kind !== 'character_joined';
  return (
    <li className={`feed-post card ${className ?? ''}`} data-kind={event.kind}>
      <Avatar event={event} />
      <div className="feed-body">
        <div className="feed-meta small-text muted">
          {showOwner && event.user && <span>{event.user.displayName}</span>}
          <time dateTime={event.createdAt} title={new Date(event.createdAt).toLocaleString()}>
            {timeAgo(event.createdAt, now)}
          </time>
        </div>
        <p className="feed-headline">
          <span className="feed-icon" aria-hidden="true">{icon}</span> {text}
        </p>
        <Details event={event} imageActions={imageActions} />
        {onCheer && event.cheers && (
          <div className="feed-actions">
            <CheerButton cheers={event.cheers} onToggle={onCheer} />
            {event.cheers.count > 0 && <span className="muted small-text cheer-names">{cheersLabel(event.cheers)}</span>}
          </div>
        )}
      </div>
    </li>
  );
}

const POST_COUNTS = [1, 2, 3, 5, 8, 10, 15, 20];

/**
 * Admin only: paint an AI picture of the latest posts, e.g. the party in the dungeon they just ran. Shows which
 * posts it will use before you commit.
 */
function GenerateImage({ tavernId, posts }: { tavernId: string; posts: FeedEvent[] }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(5);
  const { generate } = useGeneratedImages(tavernId);
  const painting = posts.some((e) => e.data.image?.status === 'pending' || e.data.image?.status === 'generating');
  const sources = posts.filter((e) => e.kind !== 'generated_image');
  const picked = sources.slice(0, count);

  if (!open) {
    return (
      <div className="generate-image-bar">
        <button type="button" className="ghost small" onClick={() => setOpen(true)} disabled={!sources.length}>
          <span aria-hidden="true">🎨</span> Generate image
        </button>
      </div>
    );
  }
  return (
    <form
      className="card generate-image"
      onSubmit={(e) => {
        e.preventDefault();
        generate.mutate(count, { onSuccess: () => setOpen(false) });
      }}
    >
      <div className="generate-image-head">
        <label>
          Paint the latest{' '}
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {POST_COUNTS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>{' '}
          {count === 1 ? 'post' : 'posts'}
        </label>
        <span className="muted small-text">in the World of Warcraft art style, with the characters’ portraits</span>
      </div>
      {picked.length > 0 && (
        <ol className="generate-image-sources small-text">
          {picked.map((e) => {
            const { icon, text } = headline(e);
            return (
              <li key={e.id}>
                <span aria-hidden="true">{icon}</span> {text}
              </li>
            );
          })}
          {sources.length < count && <li className="muted">…and older posts</li>}
        </ol>
      )}
      {generate.error && <p className="error small-text">{generate.error.message}</p>}
      {painting && <p className="muted small-text">A picture is already being painted. Wait for it to finish first.</p>}
      <div className="generate-image-actions">
        <button type="submit" className="small" disabled={generate.isPending || painting}>
          {generate.isPending ? 'Starting…' : 'Generate'}
        </button>
        <button type="button" className="ghost small" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function TavernFeed({
  tavernId,
  viewerName,
  include,
}: {
  tavernId: string;
  viewerName?: string;
  /** Optional filter, e.g. the tavern's faction filter; posts it rejects are hidden. */
  include?: (event: FeedEvent) => boolean;
}) {
  const feed = useTavernFeed(tavernId);
  const cheer = useCheer(tavernId, viewerName);
  const isAdmin = useIsTavernAdmin(tavernId);
  const images = useGeneratedImages(tavernId);
  const imageActions: ImageActions | undefined = isAdmin
    ? {
        retry: (id) => images.retry.mutate(id),
        remove: (id) => {
          if (window.confirm('Remove this picture from the feed?')) images.remove.mutate(id);
        },
        busy: images.retry.isPending || images.remove.isPending,
      }
    : undefined;

  if (feed.isPending) return <p className="muted">Loading the feed…</p>;
  if (feed.error) return <p className="error">{feed.error.message}</p>;

  const all = feed.data.pages.flatMap((p) => p.events);
  const events = include ? all.filter(include) : all;
  if (!all.length) {
    return (
      <div className="card feed-empty">
        <p>Nothing has happened here yet.</p>
        <p className="muted small-text">
          Level-ups, new rare and epic gear, and achievements will show up here as characters are refreshed. Blizzard
          only updates a character when they log out.
        </p>
      </div>
    );
  }

  return (
    <div className="feed">
      {isAdmin && <GenerateImage tavernId={tavernId} posts={all} />}
      {(images.retry.error || images.remove.error) && (
        <p className="error small-text">{(images.retry.error ?? images.remove.error)!.message}</p>
      )}
      {!events.length && <p className="muted">No posts from characters of this faction yet.</p>}
      <ol className="feed-list">
        {events.map((e) => (
          <FeedPost
            key={e.id}
            event={e}
            onCheer={() => cheer.mutate({ eventId: e.id, on: !e.cheers.cheeredByMe })}
            imageActions={imageActions}
          />
        ))}
      </ol>
      {feed.hasNextPage && (
        <button className="ghost small" onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage}>
          {feed.isFetchingNextPage ? 'Loading…' : 'Load older posts'}
        </button>
      )}
    </div>
  );
}
