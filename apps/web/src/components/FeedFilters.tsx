import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { FeedFilters, FeedKind, TavernCharacter } from '../api/client';
import { CharacterAvatar } from './CharacterAvatar';
import { classKey } from './ClassName';

/** The post types the filter offers, each covering one or more kinds of post. */
export const POST_TYPES = [
  { key: 'levels', label: 'Level ups', icon: '⬆️', kinds: ['level_up'] },
  { key: 'loot', label: 'Loot', icon: '💎', kinds: ['loot'] },
  { key: 'achievements', label: 'Achievements', icon: '🏆', kinds: ['achievement'] },
  { key: 'dungeons', label: 'Dungeons', icon: '🗝️', kinds: ['dungeon_run', 'dungeon_cleared'] },
  { key: 'paintings', label: 'Paintings', icon: '🎨', kinds: ['generated_image'] },
  { key: 'arrivals', label: 'Arrivals', icon: '🍺', kinds: ['character_joined', 'member_joined', 'tavern_founded'] },
] as const satisfies readonly { key: string; label: string; icon: string; kinds: readonly FeedKind[] }[];

export type PostType = (typeof POST_TYPES)[number]['key'];

/** The feed filter as the UI holds it: post types rather than raw kinds. */
export interface FeedFilterState {
  /** Show only these post types. */
  types: PostType[];
  /** Leave these post types out. */
  hidden: PostType[];
  characterIds: string[];
  mine: boolean;
  search: string;
}

export function isFiltering(f: FeedFilterState): boolean {
  return f.types.length > 0 || f.hidden.length > 0 || f.characterIds.length > 0 || f.mine || f.search.trim() !== '';
}

const kindsOf = (types: PostType[]): FeedKind[] =>
  types.length ? POST_TYPES.filter((t) => types.includes(t.key)).flatMap((t) => t.kinds) : [];

/** What to ask the API for. */
export function toFeedFilters(f: FeedFilterState): FeedFilters {
  const kinds = kindsOf(f.types);
  // Hiding a type is moot when only other types are shown.
  const hidden = kinds.length ? [] : kindsOf(f.hidden);
  return {
    kinds: kinds.length ? kinds : undefined,
    excludeKinds: hidden.length ? hidden : undefined,
    characterIds: f.characterIds.length ? [...f.characterIds].sort() : undefined,
    mine: f.mine || undefined,
    search: f.search.trim() || undefined,
  };
}

const list = (value: string | null) => (value ? value.split(',').filter(Boolean) : []);
const isPostType = (t: string): t is PostType => POST_TYPES.some((p) => p.key === t);

/**
 * The feed filter, kept in the URL (?q=…&types=…&hide=…&chars=…&mine=1) so a refresh or a shared link shows the same
 * posts. Changes replace the history entry rather than adding one.
 */
export function useFeedFilters(): [FeedFilterState, (next: FeedFilterState) => void] {
  const [params, setParams] = useSearchParams();
  const q = params.get('q');
  const types = params.get('types');
  const hide = params.get('hide');
  const chars = params.get('chars');
  const mine = params.get('mine');
  const state = useMemo<FeedFilterState>(
    () => ({
      types: list(types).filter(isPostType),
      hidden: list(hide).filter(isPostType).filter((t) => !list(types).includes(t)),
      characterIds: list(chars),
      mine: mine === '1',
      search: q ?? '',
    }),
    [q, types, hide, chars, mine],
  );
  const set = useCallback(
    (next: FeedFilterState) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          const put = (name: string, value: string) => (value ? p.set(name, value) : p.delete(name));
          put('q', next.search);
          put('types', next.types.join(','));
          put('hide', next.hidden.join(','));
          put('chars', next.characterIds.join(','));
          put('mine', next.mine ? '1' : '');
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [state, set];
}

/** Calls `fn` with `value` once it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms: number, fn: (value: T) => void) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    const t = setTimeout(() => latest.current(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  // Follow outside changes (e.g. "Clear filters").
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  useDebounced(draft, 300, (d) => d !== value && onChange(d));
  return (
    <input
      type="search"
      className="feed-search"
      placeholder="Search posts — names, items, dungeons…"
      aria-label="Search posts"
      value={draft}
      maxLength={100}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onChange(draft)}
    />
  );
}

function CharacterPicker({
  characters,
  selected,
  onChange,
}: {
  characters: TavernCharacter[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  // Close when clicking or tabbing away.
  useEffect(() => {
    const close = (e: Event) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('focusin', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('focusin', close);
    };
  }, []);
  const sorted = useMemo(() => [...characters].sort((a, b) => a.name.localeCompare(b.name)), [characters]);
  const names = sorted.filter((c) => selected.includes(c.id)).map((c) => c.name);
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  return (
    <details className="feed-filter-characters" ref={ref}>
      <summary className={selected.length ? 'active' : undefined}>
        {names.length === 0 ? 'All characters' : names.length <= 2 ? names.join(', ') : `${names.length} characters`}
      </summary>
      <div className="feed-filter-menu card">
        {sorted.length === 0 && <p className="muted small-text">No characters to pick from.</p>}
        <ul>
          {sorted.map((c) => (
            <li key={c.id}>
              <label>
                <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
                <span aria-hidden="true">
                  <CharacterAvatar character={c} size="sm" />
                </span>
                <span className={classKey(c.class) ? `class-${classKey(c.class)}` : undefined}>
                  {c.name} {c.surname}
                </span>
                <span className="muted small-text">{c.ownerName}</span>
              </label>
            </li>
          ))}
        </ul>
        {selected.length > 0 && (
          <button type="button" className="link small-text" onClick={() => onChange([])}>
            Show all characters
          </button>
        )}
      </div>
    </details>
  );
}

export function FeedFilterBar({
  value,
  onChange,
  characters,
  viewerId,
}: {
  value: FeedFilterState;
  onChange: (next: FeedFilterState) => void;
  /** The tavern roster, to pick characters from. */
  characters: TavernCharacter[];
  viewerId?: string;
}) {
  // With "Just mine" on, only your own characters are worth picking.
  const pickable = value.mine && viewerId ? characters.filter((c) => c.ownerId === viewerId) : characters;
  // Each post type cycles: everything → only this → hide this → everything.
  const typeState = (key: PostType) =>
    value.types.includes(key) ? 'only' : value.hidden.includes(key) ? 'hidden' : 'off';
  const cycleType = (key: PostType) => {
    const types = value.types.filter((t) => t !== key);
    const hidden = value.hidden.filter((t) => t !== key);
    const current = typeState(key);
    if (current === 'off') types.push(key);
    else if (current === 'only') hidden.push(key);
    onChange({ ...value, types, hidden });
  };
  const setMine = (mine: boolean) => {
    const keep = new Set((mine && viewerId ? characters.filter((c) => c.ownerId === viewerId) : characters).map((c) => c.id));
    onChange({ ...value, mine, characterIds: value.characterIds.filter((id) => keep.has(id)) });
  };
  return (
    <div className="feed-filters" role="search" aria-label="Filter the feed">
      <div className="feed-filters-row">
        <SearchBox value={value.search} onChange={(search) => onChange({ ...value, search })} />
        <CharacterPicker
          characters={pickable}
          selected={value.characterIds}
          onChange={(characterIds) => onChange({ ...value, characterIds })}
        />
        <label className={`feed-filter-mine${value.mine ? ' active' : ''}`}>
          <input type="checkbox" checked={value.mine} onChange={(e) => setMine(e.target.checked)} /> Just my characters
        </label>
      </div>
      <div className="feed-filters-row feed-filter-types" role="group" aria-label="Post types">
        {POST_TYPES.map((t) => {
          const state = typeState(t.key);
          return (
            <button
              key={t.key}
              type="button"
              className={`ghost small${state === 'only' ? ' active' : state === 'hidden' ? ' hidden' : ''}`}
              aria-pressed={state === 'only' ? true : state === 'hidden' ? 'mixed' : false}
              aria-label={`${t.label}${state === 'only' ? ' (showing only these)' : state === 'hidden' ? ' (hidden)' : ''}`}
              title={
                state === 'off'
                  ? `Show only ${t.label.toLowerCase()}`
                  : state === 'only'
                    ? `Click again to hide ${t.label.toLowerCase()}`
                    : `${t.label} hidden — click to show again`
              }
              onClick={() => cycleType(t.key)}
            >
              <span aria-hidden="true">{state === 'hidden' ? '🚫' : t.icon}</span>{' '}
              <span className="feed-filter-label">{t.label}</span>
            </button>
          );
        })}
        {isFiltering(value) && (
          <button
            type="button"
            className="link small-text feed-filter-clear"
            onClick={() => onChange({ types: [], hidden: [], characterIds: [], mine: false, search: '' })}
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
