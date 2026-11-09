import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { api } from '../api/client';
import { keys, useMe } from '../api/hooks';

export function LoginPage() {
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/';
  const error = params.get('error');
  const me = useMe();
  const config = useQuery({ queryKey: ['auth-config'], queryFn: api.authConfig });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [battletag, setBattletag] = useState('');
  const devLogin = useMutation({
    mutationFn: () => api.devLogin(battletag),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.me });
      navigate(next.startsWith('/') && !next.startsWith('//') ? next : '/');
    },
  });

  if (me.data) return <Navigate to={next} replace />;

  return (
    <div className="login">
      <div className="card login-card">
        <img src="/favicon.svg" alt="" width={64} height={64} />
        <h1>Tavern Tracker</h1>
        <p className="muted">
          Keep track of your friends' World of Warcraft: Forever characters and plan dungeon runs together.
        </p>
        {error && <p className="error">{error}</p>}

        {config.data?.battlenet && (
          <a className="button bnet" href={api.loginUrl(next)}>
            Sign in with Battle.net
          </a>
        )}

        {config.data?.devLogin && (
          <form
            className="dev-login"
            onSubmit={(e) => {
              e.preventDefault();
              devLogin.mutate();
            }}
          >
            <p className="muted small-text">Development sign-in (no Battle.net needed)</p>
            <input
              placeholder="BattleTag, e.g. Alice#1234"
              aria-label="BattleTag"
              value={battletag}
              onChange={(e) => setBattletag(e.target.value)}
            />
            <button type="submit" disabled={devLogin.isPending || !battletag}>Sign in</button>
            {devLogin.error && <p className="error">{devLogin.error.message}</p>}
          </form>
        )}

        {config.data && !config.data.battlenet && !config.data.devLogin && (
          <p className="error">Login isn't configured on this server.</p>
        )}
      </div>
    </div>
  );
}
