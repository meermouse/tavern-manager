import type { ReactNode } from 'react';
import type { FeedEvent } from '../api/client';
import { useTavernFeed } from '../api/hooks';
import { ClassName } from './ClassName';

const MAX_LEVEL = 60;
const CLASS_KEYS = ['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid'];

export function timeAgo(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Every 10th level, and max level, deserve a bigger post. */
export function isMilestone(from: number, to: number): boolean {
  return to >= MAX_LEVEL || Math.floor(from / 10) < Math.floor(to / 10);
}

function classKey(value: string | null | undefined): string | null {
  const key = value?.toLowerCase().replace(/\s+/g, '') ?? '';
  return CLASS_KEYS.includes(key) ? key : null;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function qualityLabel(q: string) {
  return q.charAt(0) + q.slice(1).toLowerCase();
}

function Avatar({ event }: { event: FeedEvent }) {
  const letter = (event.character?.name ?? event.user?.displayName ?? '?').charAt(0).toUpperCase();
  const key = event.character ? classKey(event.character.class) : null;
  return (
    <div className={`feed-avatar ${key ? `class-bg-${key}` : ''}`} aria-hidden="true">
      {letter}
    </div>
  );
}

function CharName({ event }: { event: FeedEvent }) {
  const c = event.character;
  if (!c) return <strong>Someone</strong>;
  return (
    <strong className={classKey(c.class) ? `class-${classKey(c.class)}` : undefined}>
      {c.name} {c.surname}
    </strong>
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
            <span className={`quality q-${i.quality.toLowerCase()}`}>[{i.name}]</span>
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

export function FeedPost({ event, now }: { event: FeedEvent; now?: number }) {
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
      </div>
    </li>
  );
}

export function TavernFeed({ tavernId }: { tavernId: string }) {
  const feed = useTavernFeed(tavernId);

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
          <FeedPost key={e.id} event={e} />
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
