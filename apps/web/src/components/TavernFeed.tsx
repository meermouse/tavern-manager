import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api, type Cheers, type FeedEvent, type FeedPage } from '../api/client';
import { keys, useTavernFeed } from '../api/hooks';
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
    default:
      return { icon: '•', text: <>Something happened</> };
  }
}

function Details({ event }: { event: FeedEvent }) {
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

export function FeedPost({ event, now, onCheer }: { event: FeedEvent; now?: number; onCheer?: () => void }) {
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
        <Details event={event} />
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

export function TavernFeed({ tavernId, viewerName }: { tavernId: string; viewerName?: string }) {
  const feed = useTavernFeed(tavernId);
  const cheer = useCheer(tavernId, viewerName);

  if (feed.isPending) return <p className="muted">Loading the feed…</p>;
  if (feed.error) return <p className="error">{feed.error.message}</p>;

  const events = feed.data.pages.flatMap((p) => p.events);
  if (!events.length) {
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
      <ol className="feed-list">
        {events.map((e) => (
          <FeedPost
            key={e.id}
            event={e}
            onCheer={() => cheer.mutate({ eventId: e.id, on: !e.cheers.cheeredByMe })}
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
