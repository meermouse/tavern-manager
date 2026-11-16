import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { api, type FeedEvent, type TavernCharacter, type TavernDetail } from '../api/client';
import { keys, useCharacters, useLeaderboard, useMe, useTavern } from '../api/hooks';
import { AddCharacterForm } from '../components/AddCharacterForm';
import { CharacterAvatar } from '../components/CharacterAvatar';
import { CharacterDirectory, CharacterLink } from '../components/CharacterLink';
import { CharacterDetails } from '../components/CharacterDetails';
import { CharacterTable } from '../components/CharacterTable';
import { DUNGEON_VIEWS, TavernDungeons, type DungeonView } from '../components/DungeonRuns';
import { LeaderboardTable } from '../components/LeaderboardTable';
import { TavernFeed } from '../components/TavernFeed';
import { TitlesView } from '../components/TitlesView';
import { RoleIcons } from '../components/RoleIcons';
import { matchesFaction, useFactionFilter, type FactionFilter } from '../faction';

function InvitePanel({ tavern }: { tavern: TavernDetail }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/join/${tavern.inviteCode}`;
  const regenerate = useMutation({
    mutationFn: () => api.regenerateInvite(tavern.id),
    onSuccess: (t) => qc.setQueryData(keys.tavern(t.id), t),
  });

  return (
    <section className="card">
      <h2>Invite friends</h2>
      <p className="muted small-text">Share this link or code. Anyone with it can join.</p>
      <div className="invite">
        <code className="invite-code">{tavern.inviteCode}</code>
        <button
          className="small"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? 'Copied!' : 'Copy link'}
        </button>
        {tavern.isOwner && (
          <button
            className="ghost small"
            disabled={regenerate.isPending}
            onClick={() => confirm('Make a new code? The old link will stop working.') && regenerate.mutate()}
          >
            New code
          </button>
        )}
      </div>
    </section>
  );
}

function MyCharactersPanel({ tavern }: { tavern: TavernDetail }) {
  const qc = useQueryClient();
  const mine = useCharacters();
  const [showAdd, setShowAdd] = useState(false);
  const inTavern = new Set(tavern.characters.map((c) => c.id));
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.tavern(tavern.id) }),
      qc.invalidateQueries({ queryKey: keys.taverns }),
    ]);
  // Optimistic checkbox state until the server round-trip and refetch complete.
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const toggle = useMutation({
    mutationFn: ({ id, add }: { id: string; add: boolean }) =>
      add ? api.addToTavern(tavern.id, id) : api.removeFromTavern(tavern.id, id),
    onMutate: ({ id, add }) => setOptimistic((o) => ({ ...o, [id]: add })),
    onSettled: async (_data, _err, { id }) => {
      await invalidate();
      setOptimistic((o) => {
        const next = { ...o };
        delete next[id];
        return next;
      });
    },
  });

  return (
    <section className="card">
      <h2>Your characters here</h2>
      {mine.data?.length === 0 && <p className="muted small-text">You haven't added any characters yet.</p>}
      <ul className="checklist">
        {mine.data?.map((c) => (
          <li key={c.id}>
            <label>
              <input
                type="checkbox"
                checked={optimistic[c.id] ?? inTavern.has(c.id)}
                onChange={(e) => {
                  const add = e.target.checked;
                  setOptimistic((o) => ({ ...o, [c.id]: add }));
                  toggle.mutate({ id: c.id, add });
                }}
              />
              <CharacterLink character={c} focusable={false}>
                <CharacterAvatar character={c} size="xs" />
                {c.name} {c.surname}
              </CharacterLink>
              <span className="muted small-text">{c.level != null ? ` · ${c.level}` : ' · pending'}</span>
              <RoleIcons roles={c.roles} />
            </label>
          </li>
        ))}
      </ul>
      {toggle.error && <p className="error">{toggle.error.message}</p>}
      {showAdd ? (
        <AddCharacterForm onAdded={(c) => toggle.mutate({ id: c.id, add: true })} />
      ) : (
        <button className="ghost small" onClick={() => setShowAdd(true)}>+ Add a new character</button>
      )}
    </section>
  );
}

function MembersPanel({ tavern }: { tavern: TavernDetail }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const done = () => {
    qc.invalidateQueries({ queryKey: keys.taverns });
    navigate('/');
  };
  const leave = useMutation({ mutationFn: () => api.leaveTavern(tavern.id), onSuccess: done });
  const remove = useMutation({ mutationFn: () => api.deleteTavern(tavern.id), onSuccess: done });

  return (
    <section className="card">
      <h2>Members ({tavern.members.length})</h2>
      <ul className="members">
        {tavern.members.map((m) => (
          <li key={m.userId}>
            {m.displayName}
            {m.isOwner && <span className="badge">Owner</span>}
          </li>
        ))}
      </ul>
      {tavern.isOwner ? (
        <button
          className="ghost small danger"
          onClick={() => confirm(`Delete "${tavern.name}" for everyone?`) && remove.mutate()}
        >
          Delete tavern
        </button>
      ) : (
        <button className="ghost small danger" onClick={() => confirm(`Leave "${tavern.name}"?`) && leave.mutate()}>
          Leave tavern
        </button>
      )}
      {(leave.error || remove.error) && <p className="error">{(leave.error || remove.error)?.message}</p>}
    </section>
  );
}

/**
 * The selected character (from `characters`) and its details pane. The selection lives in the URL (?character=…)
 * so it survives a page refresh and carries over between the characters and leaderboard tabs.
 */
function useCharacterSelection<T extends TavernCharacter>(tavernId: string, characters: T[]) {
  const [selectedId, setSelectedId] = useSearchParam('character');
  // Look the selection up in the shown characters, so the pane closes if the character leaves or is filtered out.
  const selected = characters.find((c) => c.id === selectedId) ?? null;
  const close = useCallback(() => setSelectedId(null), [setSelectedId]);
  const onSelect = useCallback((c: T | null) => setSelectedId(c?.id ?? null), [setSelectedId]);
  const details = selected && <CharacterDetails tavernId={tavernId} character={selected} onClose={close} />;
  return { selectedId: selected?.id ?? null, onSelect, details };
}

/** The character table, with a details pane above it for the selected row. */
function CharacterRoster({ tavern, characters }: { tavern: TavernDetail; characters: TavernCharacter[] }) {
  const { details, ...selection } = useCharacterSelection(tavern.id, characters);
  return (
    <div className="stack roster">
      {details}
      <CharacterTable characters={characters} {...selection} />
    </div>
  );
}

/** The tavern's leaderboard, limited to the characters the faction filter shows, with a details pane like the roster's. */
function TavernLeaderboard({ tavernId, visible }: { tavernId: string; visible: TavernCharacter[] }) {
  const board = useLeaderboard(tavernId);
  const entries = useMemo(() => {
    const ids = new Set(visible.map((c) => c.id));
    return (board.data ?? []).filter((e) => ids.has(e.id));
  }, [board.data, visible]);
  const { details, ...selection } = useCharacterSelection(tavernId, entries);
  if (board.isPending) return <p className="muted">Loading…</p>;
  if (board.error) return <p className="error">{board.error.message}</p>;
  return (
    <div className="stack roster">
      {details}
      <LeaderboardTable entries={entries} emptyText="No characters in this tavern yet." {...selection} />
    </div>
  );
}

const FACTIONS: [FactionFilter, string][] = [
  ['both', 'Both'],
  ['horde', 'Horde'],
  ['alliance', 'Alliance'],
];

function FactionPicker({ value, onChange }: { value: FactionFilter; onChange: (f: FactionFilter) => void }) {
  return (
    <div className="faction-picker" role="group" aria-label="Faction filter">
      <span className="muted small-text">Faction</span>
      {FACTIONS.map(([key, label]) => (
        <button
          key={key}
          className={`small${value === key ? ' active' : ''}${key !== 'both' ? ` faction ${key}` : ''}`}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** One query-string parameter as state. Changes replace the history entry rather than adding one. */
function useSearchParam(name: string): [string | null, (value: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const set = useCallback(
    (value: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null) next.delete(name);
          else next.set(name, value);
          return next;
        },
        { replace: true },
      ),
    [name, setParams],
  );
  return [params.get(name), set];
}

type View = 'feed' | 'characters' | 'dungeons' | 'leaderboard' | 'titles';
const VIEWS: [View, string][] = [
  ['feed', 'Feed'],
  ['characters', 'Characters'],
  ['dungeons', 'Dungeons'],
  ['leaderboard', 'Leaderboard'],
  ['titles', 'Titles'],
];

export function TavernDetailPage() {
  // The open tab (and Dungeons sub-tab) live in the path, e.g. /taverns/:id/dungeons/runs,
  // so refreshing or sharing the link lands on the same view.
  const { id = '', view: viewParam, sub: subParam } = useParams();
  const navigate = useNavigate();
  const view = VIEWS.find(([key]) => key === (viewParam ?? 'feed'))?.[0];
  const dungeonView = DUNGEON_VIEWS.find(([key]) => key === (subParam ?? 'finder'))?.[0];
  const setView = (next: View) => navigate(next === 'feed' ? `/taverns/${id}` : `/taverns/${id}/${next}`);
  const setDungeonView = (next: DungeonView) =>
    navigate(next === 'finder' ? `/taverns/${id}/dungeons` : `/taverns/${id}/dungeons/${next}`);
  const [titleKey, setTitleKey] = useSearchParam('title');
  const [faction, setFaction] = useFactionFilter(id);
  const tavern = useTavern(id);
  const me = useMe();
  const qc = useQueryClient();
  // Lets hover cards anywhere on the page (e.g. in feed posts) show the roster's full character details.
  const directory = useMemo(
    () => new Map((tavern.data?.characters ?? []).map((c) => [c.id, c])),
    [tavern.data?.characters],
  );
  const visible = useMemo(
    () => (tavern.data?.characters ?? []).filter((c) => matchesFaction(c, faction)),
    [tavern.data?.characters, faction],
  );
  const includePost = useCallback(
    (e: FeedEvent) => {
      if (faction === 'both' || !e.character) return true;
      // Feed posts carry a trimmed character; prefer the roster's copy, which knows the faction.
      return matchesFaction(directory.get(e.character.id) ?? e.character, faction);
    },
    [directory, faction],
  );
  const refresh = useMutation({
    mutationFn: () => api.refreshTavern(id),
    onSuccess: (t) => {
      qc.setQueryData(keys.tavern(id), t);
      qc.invalidateQueries({ queryKey: keys.feed(id) });
      qc.invalidateQueries({ queryKey: keys.tavernLeaderboard(id) });
      // Fresh stats can move titles, which the top bar shows.
      qc.invalidateQueries({ queryKey: keys.me });
    },
  });

  // Unknown tab in the URL (or a sub-tab on a tab without any): fall back to the tavern's front page.
  if (!view || (subParam && (view !== 'dungeons' || !dungeonView))) return <Navigate to={`/taverns/${id}`} replace />;
  if (tavern.isPending) return <p className="muted">Loading…</p>;
  if (tavern.error) {
    return (
      <div className="stack">
        <p className="error">{tavern.error.message}</p>
        <Link to="/">Back to your taverns</Link>
      </div>
    );
  }
  const t = tavern.data;

  return (
    <CharacterDirectory.Provider value={directory}>
      <div className="stack">
        <div className="page-head">
          <div>
            <Link to="/" className="muted small-text">← Taverns</Link>
            <h1>{t.name}</h1>
          </div>
          <button onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            {refresh.isPending ? 'Refreshing…' : 'Refresh levels'}
          </button>
        </div>
        {refresh.error && <p className="error">{refresh.error.message}</p>}

        <div className="view-bar">
          <div className="view-tabs" role="group" aria-label="Tavern views">
            {VIEWS.map(([key, label]) => (
              <button key={key} className={view === key ? 'active' : ''} aria-pressed={view === key} onClick={() => setView(key)}>
                {label}
              </button>
            ))}
          </div>
          {/* Titles are tavern-wide, so the faction filter doesn't apply to them. */}
          {view !== 'titles' && <FactionPicker value={faction} onChange={setFaction} />}
        </div>
        {view === 'feed' && (
          <TavernFeed tavernId={t.id} viewerName={me.data?.displayName} include={faction === 'both' ? undefined : includePost} />
        )}
        {view === 'characters' && <CharacterRoster tavern={t} characters={visible} />}
        {view === 'dungeons' && (
          <TavernDungeons
            tavernId={t.id}
            characters={t.characters}
            visible={visible}
            questFaction={faction === 'horde' ? 'Horde' : faction === 'alliance' ? 'Alliance' : null}
            view={dungeonView}
            onViewChange={setDungeonView}
          />
        )}
        {view === 'leaderboard' && <TavernLeaderboard tavernId={t.id} visible={visible} />}
        {view === 'titles' && <TitlesView titles={t.titles ?? []} selectedKey={titleKey} onSelect={setTitleKey} />}

        <div className="three-col">
          <MyCharactersPanel tavern={t} />
          <InvitePanel tavern={t} />
          <MembersPanel tavern={t} />
        </div>
      </div>
    </CharacterDirectory.Provider>
  );
}
