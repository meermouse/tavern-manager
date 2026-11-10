import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, type TavernDetail } from '../api/client';
import { keys, useCharacters, useTavern } from '../api/hooks';
import { AddCharacterForm } from '../components/AddCharacterForm';
import { CharacterTable } from '../components/CharacterTable';
import { DungeonTable } from '../components/DungeonTable';

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
              {c.name} {c.surname}
              <span className="muted small-text">{c.level != null ? ` · ${c.level}` : ' · pending'}</span>
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

export function TavernDetailPage() {
  const { id = '' } = useParams();
  const [view, setView] = useState<'characters' | 'dungeons'>('characters');
  const tavern = useTavern(id);
  const qc = useQueryClient();
  const refresh = useMutation({
    mutationFn: () => api.refreshTavern(id),
    onSuccess: (t) => qc.setQueryData(keys.tavern(id), t),
  });

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

      <div className="view-tabs" role="group" aria-label="Tavern views">
        <button
          className={view === 'characters' ? 'active' : ''}
          aria-pressed={view === 'characters'}
          onClick={() => setView('characters')}
        >
          Characters
        </button>
        <button
          className={view === 'dungeons' ? 'active' : ''}
          aria-pressed={view === 'dungeons'}
          onClick={() => setView('dungeons')}
        >
          Dungeons
        </button>
      </div>
      {view === 'characters' ? (
        <CharacterTable characters={t.characters} />
      ) : (
        <DungeonTable characters={t.characters} />
      )}

      <div className="three-col">
        <MyCharactersPanel tavern={t} />
        <InvitePanel tavern={t} />
        <MembersPanel tavern={t} />
      </div>
    </div>
  );
}
