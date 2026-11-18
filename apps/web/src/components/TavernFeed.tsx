import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';
import { api, type Cheers, type FeedEvent, type FeedFilters, type FeedPage } from '../api/client';
import {
  feedKey,
  keys,
  useDeleteFeedPost,
  useGeneratedImages,
  useImagePrompt,
  useIsTavernAdmin,
  useTavernFeed,
} from '../api/hooks';
import { ConfirmDialog } from './ConfirmDialog';
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

type Headline = { icon: string; text: ReactNode; className?: string };

/** The post's one-line summary, or null for a kind this version of the app doesn't know how to show. */
function headline(event: FeedEvent): Headline | null {
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
    case 'title_gained': {
      const title = d.title;
      if (!title) return null;
      const [holder, taken] = d.characters ?? [];
      const prev = d.previous;
      // Character titles tag both characters; player titles (Altaholic) name the players.
      const who = holder ? <PartyNames characters={[holder]} /> : user;
      const from = prev
        ? taken && prev.characterId === taken.id
          ? <PartyNames characters={[taken]} />
          : <strong>{prev.player.displayName}</strong>
        : null;
      return {
        icon: title.icon,
        className: 'title-gained',
        text: from ? (
          <>{who} took <strong>{title.name}</strong> from {from}</>
        ) : (
          <>{who} is now <strong>{title.name}</strong></>
        ),
      };
    }
    default:
      return null;
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
  if (image.status === 'ready' && image.url) {
    return (
      <figure className="feed-picture">
        <a href={image.url} target="_blank" rel="noreferrer" title="Open full size">
          <img src={image.url} alt={event.data.caption ?? 'A painting of the tavern’s adventures'} loading="lazy" />
        </a>
        {actions && (
          <figcaption className="small-text muted">
            <button type="button" className="link small-text" disabled={actions.busy} onClick={() => actions.remove(image.id)}>
              Remove
            </button>
          </figcaption>
        )}
      </figure>
    );
  }
  if (image.status === 'failed') {
    return (
      <div className="feed-picture failed">
        <p className="small-text">
          The painting didn’t work out{image.error ? <span className="muted">: {image.error}</span> : null}. Only admins can see this post.
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
      <span className="small-text muted">
        The tavern artist is painting… this usually takes a minute or two. Only admins see this post until the
        picture is finished; then it's posted for everyone.
      </span>
    </div>
  );
}

function Details({ event, imageActions }: { event: FeedEvent; imageActions?: ImageActions }) {
  if (event.kind === 'generated_image') return <GeneratedPicture event={event} actions={imageActions} />;
  if (event.kind === 'title_gained' && event.data.title) {
    const prev = event.data.previous;
    const taken = event.data.characters?.find((c) => c.id === prev?.characterId);
    return (
      <p className="feed-title-score small-text">
        {event.data.title.value}
        {prev && <span className="muted"> · {taken?.name ?? prev.player.displayName}: {prev.value}</span>}
      </p>
    );
  }
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
function useCheer(tavernId: string, viewerName: string | undefined, filters: FeedFilters) {
  const qc = useQueryClient();
  const key = feedKey(tavernId, filters);
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
    // The post may also be cached under other filters; let those catch up when they're next shown.
    onSettled: () => qc.invalidateQueries({ queryKey: keys.feed(tavernId), refetchType: 'none' }),
  });
}

/** Posts worth a painting: the ones with characters in them (matches the API's PAINTABLE_KINDS). */
export const PAINTABLE_KINDS = new Set<FeedEvent['kind']>([
  'dungeon_run',
  'dungeon_cleared',
  'loot',
  'level_up',
  'achievement',
  'character_joined',
  'title_gained',
]);

/** Posts that belong to one tavern (deleting them deletes them outright), even when they're about a character. */
const TAVERN_KINDS = new Set<FeedEvent['kind']>(['character_joined', 'generated_image', 'title_gained']);

/** Admins only: the post's "Commission painting" button. */
export interface Commission {
  onClick: () => void;
  /** Why it can't be pressed right now, if it can't. */
  disabledReason?: string;
}

export function FeedPost({
  event,
  now,
  onCheer,
  imageActions,
  commission,
  onDelete,
}: {
  event: FeedEvent;
  now?: number;
  onCheer?: () => void;
  /** Admins only: retry or remove a generated picture. */
  imageActions?: ImageActions;
  commission?: Commission;
  /** Admins only: ask to delete the post (the caller confirms first). */
  onDelete?: () => void;
}) {
  const head = headline(event);
  // A post we can't describe (e.g. one meant only for admins, or a kind newer than this page) shows nothing.
  if (!head) return null;
  const { icon, text, className } = head;
  const showOwner = !!event.character && event.kind !== 'character_joined';
  return (
    <li className={`feed-post card ${className ?? ''}`} data-kind={event.kind}>
      {onDelete && (
        <button type="button" className="feed-delete" aria-label="Delete this post" title="Delete this post" onClick={onDelete}>
          <span aria-hidden="true">×</span>
        </button>
      )}
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
        {((onCheer && event.cheers) || commission) && (
          <div className="feed-actions">
            {onCheer && event.cheers && <CheerButton cheers={event.cheers} onToggle={onCheer} />}
            {commission && (
              <button
                type="button"
                className="ghost small commission"
                disabled={!!commission.disabledReason}
                title={commission.disabledReason ?? 'Have an AI paint this post in the World of Warcraft art style'}
                onClick={commission.onClick}
              >
                <span aria-hidden="true">🎨</span> Commission painting
              </button>
            )}
            {onCheer && event.cheers && event.cheers.count > 0 && (
              <span className="muted small-text cheer-names">{cheersLabel(event.cheers)}</span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Admins only: shows the prompt the painting will be made from, in a box they can edit, before commissioning it.
 * The characters' renders are still sent along as reference images.
 */
export function CommissionDialog({
  tavernId,
  event,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  tavernId: string;
  event: FeedEvent;
  busy?: boolean;
  error?: string | null;
  onConfirm: (prompt: string) => void;
  onCancel: () => void;
}) {
  const preview = useImagePrompt(tavernId, event.id);
  // null until edited: show the suggested prompt as it loads.
  const [edited, setEdited] = useState<string | null>(null);
  const prompt = edited ?? preview.data?.prompt ?? '';
  const promptId = useId();
  const changed = edited !== null && preview.data && edited !== preview.data.prompt;
  return (
    <ConfirmDialog
      title="Commission a painting"
      confirmLabel="Paint it"
      className="commission-dialog"
      busy={busy}
      confirmDisabled={!preview.data || !prompt.trim()}
      error={error ?? preview.error?.message}
      onCancel={onCancel}
      onConfirm={() => onConfirm(prompt.trim())}
    >
      <p>Everyone in the tavern will see it once it’s finished.</p>
      <div className="commission-prompt-head">
        <label htmlFor={promptId}>Prompt</label>
        {changed && (
          <button type="button" className="ghost small" onClick={() => setEdited(null)} disabled={busy}>
            Reset
          </button>
        )}
      </div>
      <textarea
        id={promptId}
        className="commission-prompt"
        value={prompt}
        placeholder={preview.isPending ? 'Writing the prompt…' : undefined}
        disabled={!preview.data || busy}
        onChange={(e) => setEdited(e.target.value)}
        rows={14}
        spellCheck
      />
    </ConfirmDialog>
  );
}

const NO_FILTERS: FeedFilters = {};

export function TavernFeed({
  tavernId,
  viewerName,
  include,
  filters = NO_FILTERS,
}: {
  tavernId: string;
  viewerName?: string;
  /** Optional filter, e.g. the tavern's faction filter; posts it rejects are hidden. */
  include?: (event: FeedEvent) => boolean;
  /** Server-side filters (post type, characters, text). */
  filters?: FeedFilters;
}) {
  const feed = useTavernFeed(tavernId, filters);
  const cheer = useCheer(tavernId, viewerName, filters);
  const isAdmin = useIsTavernAdmin(tavernId);
  const images = useGeneratedImages(tavernId);
  const deletePost = useDeleteFeedPost(tavernId);
  const [deleting, setDeleting] = useState<FeedEvent | null>(null);
  const [commissioning, setCommissioning] = useState<FeedEvent | null>(null);
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

  // Only admins see paintings that aren't finished yet (the API already leaves them out for everyone else).
  const all = feed.data.pages
    .flatMap((p) => p.events)
    .filter((e) => isAdmin || !e.data.image || e.data.image.status === 'ready');
  const events = (include ? all.filter(include) : all).filter((e) => headline(e) !== null);

  // Each post gets one painting (a failed one can be commissioned again), and one is painted at a time.
  const painted = new Set(
    all.filter((e) => e.data.image && e.data.image.status !== 'failed').map((e) => e.data.sourceEventId),
  );
  const painting = all.some((e) => e.data.image?.status === 'pending' || e.data.image?.status === 'generating');
  const commissionFor = (e: FeedEvent): Commission | undefined => {
    if (!isAdmin || !PAINTABLE_KINDS.has(e.kind) || painted.has(e.id)) return undefined;
    // Player titles (Altaholic) have no character to paint.
    if (e.kind === 'title_gained' && !e.character) return undefined;
    return {
      onClick: () => {
        images.generate.reset();
        setCommissioning(e);
      },
      disabledReason: images.generate.isPending
        ? 'Starting…'
        : painting
          ? 'A picture is already being painted — wait for it to finish'
          : undefined,
    };
  };
  // The commission dialog shows its own errors while it's open.
  const imageError = (commissioning ? null : images.generate.error) ?? images.retry.error ?? images.remove.error;
  const filtered = !!(filters.kinds || filters.excludeKinds || filters.characterIds || filters.mine || filters.search);
  if (!all.length && !filtered) {
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
    <div className={`feed${feed.isPlaceholderData ? ' refreshing' : ''}`} aria-busy={feed.isPlaceholderData}>
      {imageError && <p className="error small-text">{imageError.message}</p>}
      {!events.length && !feed.isPlaceholderData && (
        <p className="muted">
          {filtered ? 'No posts match these filters.' : 'No posts from characters of this faction yet.'}
        </p>
      )}
      <ol className="feed-list">
        {events.map((e) => (
          <FeedPost
            key={e.id}
            event={e}
            onCheer={() => cheer.mutate({ eventId: e.id, on: !e.cheers.cheeredByMe })}
            imageActions={imageActions}
            commission={commissionFor(e)}
            onDelete={
              isAdmin
                ? () => {
                    deletePost.reset();
                    setDeleting(e);
                  }
                : undefined
            }
          />
        ))}
      </ol>
      {commissioning && (
        <CommissionDialog
          tavernId={tavernId}
          event={commissioning}
          busy={images.generate.isPending}
          error={images.generate.error?.message}
          onCancel={() => setCommissioning(null)}
          onConfirm={(prompt) =>
            images.generate.mutate(
              { eventId: commissioning.id, prompt },
              { onSuccess: () => setCommissioning(null) },
            )
          }
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this post?"
          confirmLabel="Delete post"
          danger
          busy={deletePost.isPending}
          error={deletePost.error?.message}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deletePost.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        >
          <p>
            <span aria-hidden="true">{headline(deleting)?.icon}</span> {headline(deleting)?.text}
          </p>
          <p className="small-text">
            {deleting.character && !TAVERN_KINDS.has(deleting.kind)
              ? 'It will be removed from this tavern’s feed for everyone. Other taverns this character is in will still see it. This can’t be undone.'
              : 'It will be removed for everyone, along with its cheers. This can’t be undone.'}
          </p>
        </ConfirmDialog>
      )}
      {feed.hasNextPage && (
        <button className="ghost small" onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage}>
          {feed.isFetchingNextPage ? 'Loading…' : 'Load older posts'}
        </button>
      )}
    </div>
  );
}
