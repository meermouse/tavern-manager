import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { api, type Me } from '../api/client';
import { keys } from '../api/hooks';

function DisplayNameEditor({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(me.displayName);
  const save = useMutation({
    mutationFn: () => api.updateMe(value),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries();
    },
  });

  if (!editing) {
    return (
      <button className="link user-name" title={`${me.battletag} — click to change your display name`} onClick={() => setEditing(true)}>
        {me.displayName}
      </button>
    );
  }
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <input
        autoFocus
        aria-label="Display name"
        value={value}
        maxLength={40}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
      />
      <button type="submit" className="small" disabled={save.isPending}>Save</button>
      {save.error && <span className="error">{save.error.message}</span>}
    </form>
  );
}

export function Layout({ me, children }: { me: Me; children: React.ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      qc.setQueryData(keys.me, null);
      qc.clear();
      navigate('/login');
    },
  });

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          Tavern Tracker
        </NavLink>
        <nav>
          <NavLink to="/" end>Taverns</NavLink>
          <NavLink to="/characters">Characters</NavLink>
          <NavLink to="/dungeons">Dungeons</NavLink>
        </nav>
        <div className="user">
          <DisplayNameEditor key={me.displayName} me={me} />
          <button className="ghost small" onClick={() => logout.mutate()}>Sign out</button>
        </div>
      </header>
      <main>{children}</main>
      <footer>
        Fan project, not affiliated with or endorsed by Blizzard Entertainment.
      </footer>
    </div>
  );
}
