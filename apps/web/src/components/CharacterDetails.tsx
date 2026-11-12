import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FeedItem, TavernCharacter } from '../api/client';
import { useCharacterDetails } from '../api/hooks';
import { CharacterLevel } from './CharacterLevel';
import { ClassName, classKey } from './ClassName';
import { ItemLink } from './ItemLink';
import { FeedPost, timeAgo } from './TavernFeed';

// Paper-doll order; anything we don't recognise goes last.
const SLOT_ORDER = [
  'head', 'neck', 'shoulder', 'back', 'chest', 'shirt', 'tabard', 'wrist', 'hands', 'waist', 'legs', 'feet',
  'finger', 'trinket', 'main hand', 'two-hand', 'one-hand', 'off hand', 'held in off', 'ranged', 'relic', 'ammo',
];

function slotRank(slot: string | null): number {
  const s = slot?.toLowerCase().replace(/_/g, ' ') ?? '';
  const i = SLOT_ORDER.findIndex((k) => s.startsWith(k));
  return i === -1 ? SLOT_ORDER.length : i;
}

export function sortGear(items: FeedItem[]): FeedItem[] {
  return [...items].sort((a, b) => slotRank(a.slot) - slotRank(b.slot) || (a.slot ?? '').localeCompare(b.slot ?? ''));
}

/** Full-body render, falling back to the bust, then the headshot, then the character's initial. */
function Portrait({ character }: { character: TavernCharacter }) {
  const candidates = [character.renderUrl, character.insetUrl, character.avatarUrl].filter((u): u is string => !!u);
  const [failed, setFailed] = useState<string[]>([]);
  const url = candidates.find((u) => !failed.includes(u));
  const key = classKey(character.class);
  const kind = url === character.renderUrl ? 'render' : url === character.insetUrl ? 'inset' : 'avatar';
  return (
    <div className={`details-portrait ${key ? `class-bg-${key}` : ''}`}>
      {url ? (
        <img
          className={`portrait-${kind}`}
          src={url}
          alt={`${character.name} ${character.surname}, ${[character.race, character.class].filter(Boolean).join(' ') || 'character'}`}
          onError={() => setFailed((f) => [...f, url])}
        />
      ) : (
        <span className="portrait-initial" aria-hidden="true">{character.name.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="details-stat">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Gear({ items, syncedAt }: { items: FeedItem[] | null | undefined; syncedAt: string | null | undefined }) {
  if (items === undefined) return <p className="muted small-text">Loading gear…</p>;
  if (!items?.length) {
    return <p className="muted small-text">Gear shows up after the character's next refresh.</p>;
  }
  return (
    <>
      <ul className="details-gear">
        {sortGear(items).map((i) => (
          <li key={`${i.slot}-${i.id}`}>
            <span className="muted gear-slot">{i.slot ?? '—'}</span>
            <ItemLink item={i} brackets={false} />
            {i.itemLevel != null && <span className="muted small-text gear-ilvl">{i.itemLevel}</span>}
          </li>
        ))}
      </ul>
      {syncedAt && <p className="muted small-text">As of {timeAgo(syncedAt)}</p>}
    </>
  );
}

export function CharacterDetails({
  tavernId,
  character,
  onClose,
}: {
  tavernId: string;
  character: TavernCharacter;
  onClose: () => void;
}) {
  const details = useCharacterDetails(tavernId, character.id);
  // Show what the table already knows straight away; the details request adds gear, posts and fresher data.
  const c: TavernCharacter = { ...character, ...details.data };
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [character.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const key = classKey(c.class);

  return (
    <section
      ref={ref}
      className={`card character-details ${key ? `class-bg-${key}` : ''}`}
      aria-labelledby="character-details-name"
    >
      <button className="ghost small details-close" onClick={onClose} aria-label="Close character details">
        ✕
      </button>
      <Portrait key={c.id} character={c} />

      <div className="details-body">
        <header>
          <h2 id="character-details-name" className={key ? `class-${key}` : undefined}>
            {c.name} {c.surname}
          </h2>
          {c.title && <p className="details-title">{c.title}</p>}
          <p className="details-line">
            {c.level != null ? <>Level <CharacterLevel character={c} /></> : <CharacterLevel character={c} />}{' '}
            {c.race} {c.class && <ClassName value={c.class} />}
          </p>
          {c.guild && <p className="details-guild">&lt;{c.guild}&gt;</p>}
          <div className="details-badges">
            {c.faction && <span className={`badge faction ${c.faction.toLowerCase()}`}>{c.faction}</span>}
            {c.ruleset && <span className="badge">{c.ruleset}</span>}
            <span className="badge">{c.region.toUpperCase()}</span>
          </div>
          {c.status !== 'ok' && c.syncError && <p className="muted small-text">{c.syncError}</p>}
        </header>

        <dl className="details-stats">
          <Stat label="Player">{c.ownerName}</Stat>
          {c.itemLevel != null && <Stat label="Item level">{c.itemLevel}</Stat>}
          {c.achievementPoints != null && <Stat label="Achievement points">{c.achievementPoints}</Stat>}
          {c.lastLoginAt && (
            <Stat label="Last seen in game">
              <time dateTime={c.lastLoginAt} title={new Date(c.lastLoginAt).toLocaleString()}>{timeAgo(c.lastLoginAt)}</time>
            </Stat>
          )}
          <Stat label="Last updated">
            {c.lastSyncedAt ? (
              <time dateTime={c.lastSyncedAt} title={new Date(c.lastSyncedAt).toLocaleString()}>{timeAgo(c.lastSyncedAt)}</time>
            ) : (
              'Never'
            )}
          </Stat>
        </dl>

        <div className="details-columns">
          <div>
            <h3>Equipped</h3>
            <Gear items={details.isPending ? undefined : details.data?.equipment} syncedAt={details.data?.equipmentSyncedAt} />
          </div>
          <div>
            <h3>Recent activity</h3>
            {details.isPending && <p className="muted small-text">Loading…</p>}
            {details.error && <p className="error small-text">{details.error.message}</p>}
            {details.data && details.data.recent.length === 0 && <p className="muted small-text">Nothing yet.</p>}
            {details.data && details.data.recent.length > 0 && (
              <ol className="feed-list details-recent">
                {details.data.recent.map((e) => (
                  <FeedPost key={e.id} event={e} />
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
