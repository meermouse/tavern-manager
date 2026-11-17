import { useEffect, useRef, useState } from 'react';
import type { FeedItem, TavernCharacter } from '../api/client';
import { useCharacterDetails, useIsTavernAdmin, useMe, useSetRoles, useTavernCharacterAdmin } from '../api/hooks';
import { CharacterLevel } from './CharacterLevel';
import { Ago, CharacterStats, Stat } from './CharacterStats';
import { ClassName, classKey } from './ClassName';
import { ItemLink } from './ItemLink';
import { PortraitViewer } from './PortraitViewer';
import { ProfessionList } from './ProfessionIcons';
import { TitleBadges } from './TitleBadges';
import { completedCount } from './DungeonLog';
import { dungeons } from '../dungeons';
import { RoleIcons, RolePicker } from './RoleIcons';
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
  const [enlarged, setEnlarged] = useState(false);
  const name = `${character.name} ${character.surname}`;
  const alt = `${name}, ${[character.race, character.class].filter(Boolean).join(' ') || 'character'}`;
  const bg = key ? `class-bg-${key}` : '';
  if (!url) {
    return (
      <div className={`details-portrait ${bg}`}>
        <span className="portrait-initial" aria-hidden="true">{character.name.charAt(0).toUpperCase()}</span>
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        className={`details-portrait enlargeable ${bg}`}
        onClick={() => setEnlarged(true)}
        aria-label={`Enlarge ${name}'s portrait`}
        title="Click to enlarge"
      >
        <img className={`portrait-${kind}`} src={url} alt={alt} onError={() => setFailed((f) => [...f, url])} />
        <span className="enlarge-hint" aria-hidden="true">⤢</span>
      </button>
      {enlarged && (
        <PortraitViewer src={url} alt={alt} title={name} className={bg} onClose={() => setEnlarged(false)} />
      )}
    </>
  );
}

/** The dungeons a character's owner has logged as completed, in level order. */
function CompletedDungeons({ log }: { log: Record<string, string> | undefined }) {
  const done = dungeons.filter((d) => log?.[d.name]);
  if (!done.length) return <p className="muted small-text">None logged yet.</p>;
  return (
    <ul className="details-dungeons">
      {done.map((d) => (
        <li key={d.name}>
          ✔ {d.name}{' '}
          <time className="muted small-text" dateTime={log![d.name]}>{new Date(log![d.name]).toLocaleDateString()}</time>
        </li>
      ))}
    </ul>
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

/** Tavern admin tools for a character: change the IRL name the tavern shows for it, or remove it from the tavern. */
function AdminControls({ tavernId, character }: { tavernId: string; character: TavernCharacter }) {
  const { setIrlName, remove } = useTavernCharacterAdmin(tavernId, character.id);
  const [draft, setDraft] = useState<string | null>(null);
  const name = `${character.name} ${character.surname}`;
  const error = setIrlName.error ?? remove.error;
  return (
    <div className="details-admin">
      <span className="muted small-text">Admin</span>
      {draft === null ? (
        <>
          <button className="ghost small" onClick={() => setDraft(character.ownerName)}>
            Change IRL name
          </button>
          {character.irlNameOverridden && (
            <button
              className="ghost small"
              disabled={setIrlName.isPending}
              title="Go back to the player's own display name"
              onClick={() => setIrlName.mutate(null)}
            >
              Reset IRL name
            </button>
          )}
        </>
      ) : (
        <form
          className="details-admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            setIrlName.mutate(draft.trim() || null, { onSuccess: () => setDraft(null) });
          }}
        >
          <input
            aria-label={`IRL name for ${name}`}
            value={draft}
            maxLength={40}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Esc cancels the edit rather than closing the pane.
              if (e.key === 'Escape') {
                e.preventDefault();
                setDraft(null);
              }
            }}
          />
          <button type="submit" className="small" disabled={setIrlName.isPending}>
            Save
          </button>
          <button type="button" className="ghost small" onClick={() => setDraft(null)}>
            Cancel
          </button>
        </form>
      )}
      <button
        className="ghost small danger"
        disabled={remove.isPending}
        onClick={() => confirm(`Remove ${name} from this tavern?`) && remove.mutate()}
      >
        Remove from tavern
      </button>
      {error && <span className="error small-text">{error.message}</span>}
    </div>
  );
}

export function CharacterDetails({
  tavernId,
  character,
  onClose,
}: {
  /** The tavern it's seen from; leave out on the global leaderboard. */
  tavernId?: string;
  character: TavernCharacter;
  onClose: () => void;
}) {
  const details = useCharacterDetails(tavernId, character.id);
  // Show what the table already knows straight away; the details request adds gear, posts and fresher data.
  const c: TavernCharacter = { ...character, ...details.data };
  const ref = useRef<HTMLElement>(null);
  const me = useMe();
  const isOwner = !!me.data && me.data.id === c.ownerId;
  const setRoles = useSetRoles(c.id);
  const isAdmin = useIsTavernAdmin(tavernId);

  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [character.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onClose();
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
            {!isOwner && <RoleIcons roles={c.roles} />}
          </div>
          <TitleBadges titles={c.titles} labelled />
          {isOwner && (
            <div className="details-roles">
              <span className="muted small-text">Your roles for this character</span>
              <RolePicker roles={c.roles ?? []} onChange={(roles) => setRoles.mutate(roles)} />
              {setRoles.error && <span className="error small-text">{setRoles.error.message}</span>}
            </div>
          )}
          {isAdmin && tavernId && <AdminControls key={c.id} tavernId={tavernId} character={c} />}
          {c.status !== 'ok' && c.syncError && <p className="muted small-text">{c.syncError}</p>}
        </header>

        <CharacterStats character={c} className="details-stats">
          <Stat label="Dungeons completed">{completedCount(c)} / {dungeons.length}</Stat>
          <Stat label="Last updated">{c.lastSyncedAt ? <Ago at={c.lastSyncedAt} /> : 'Never'}</Stat>
        </CharacterStats>

        <div className="details-columns">
          <div>
            <h3>Professions</h3>
            <ProfessionList professions={c.professions} />
            <h3>Dungeons completed</h3>
            <CompletedDungeons log={c.dungeonsCompleted} />
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
