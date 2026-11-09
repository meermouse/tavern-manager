import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client';
import { keys, useTaverns } from '../api/hooks';

/** Accepts either a bare code or a full invite link. */
export function parseInviteCode(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/join\/([A-Za-z0-9]+)/);
  return (match ? match[1] : trimmed).toUpperCase();
}

export function TavernsPage() {
  const taverns = useTaverns();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const create = useMutation({
    mutationFn: () => api.createTavern(name.trim()),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: keys.taverns });
      navigate(`/taverns/${t.id}`);
    },
  });

  return (
    <div className="stack">
      <section>
        <h1>Your taverns</h1>
        {taverns.isPending && <p className="muted">Loading…</p>}
        {taverns.error && <p className="error">{taverns.error.message}</p>}
        {taverns.data?.length === 0 && (
          <p className="muted">You're not in any taverns yet. Create one below, or join a friend's with an invite code.</p>
        )}
        <div className="tavern-grid">
          {taverns.data?.map((t) => (
            <Link key={t.id} to={`/taverns/${t.id}`} className="card tavern-card">
              <h2>{t.name}</h2>
              <p className="muted">
                {t.memberCount} member{t.memberCount === 1 ? '' : 's'} · {t.characterCount} character
                {t.characterCount === 1 ? '' : 's'}
              </p>
              {t.isOwner && <span className="badge">Owner</span>}
            </Link>
          ))}
        </div>
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Create a tavern</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <input placeholder="Tavern name" aria-label="Tavern name" value={name} maxLength={60}
              onChange={(e) => setName(e.target.value)} />
            <button type="submit" disabled={!name.trim() || create.isPending}>Create</button>
          </form>
          {create.error && <p className="error">{create.error.message}</p>}
        </section>

        <section className="card">
          <h2>Join with an invite</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/join/${parseInviteCode(code)}`);
            }}
          >
            <input placeholder="Invite code or link" aria-label="Invite code" value={code}
              onChange={(e) => setCode(e.target.value)} />
            <button type="submit" disabled={!code.trim()}>Join</button>
          </form>
        </section>
      </div>
    </div>
  );
}
