import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { api } from '../api/client';
import { keys, useMe } from '../api/hooks';

export function JoinPage() {
  const { code = '' } = useParams();
  const me = useMe();
  const invite = useQuery({ queryKey: keys.invite(code), queryFn: () => api.invite(code), retry: false });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const join = useMutation({
    mutationFn: () => api.joinInvite(code),
    onSuccess: ({ tavernId }) => {
      qc.invalidateQueries({ queryKey: keys.taverns });
      navigate(`/taverns/${tavernId}`);
    },
  });

  if (me.isPending || invite.isPending) return <p className="muted center">Loading…</p>;
  if (!me.data) return <Navigate to={`/login?next=${encodeURIComponent(`/join/${code}`)}`} replace />;
  if (invite.data?.isMember) return <Navigate to={`/taverns/${invite.data.id}`} replace />;

  return (
    <div className="login">
      <div className="card login-card">
        {invite.error ? (
          <>
            <h1>Invite not found</h1>
            <p className="muted">{invite.error.message}. Ask your friend for a fresh link.</p>
            <Link to="/">Back to your taverns</Link>
          </>
        ) : (
          <>
            <p className="muted">You've been invited to join</p>
            <h1>{invite.data?.name}</h1>
            <p className="muted">
              {invite.data?.memberCount} member{invite.data?.memberCount === 1 ? '' : 's'}
            </p>
            <button onClick={() => join.mutate()} disabled={join.isPending}>Join tavern</button>
            {join.error && <p className="error">{join.error.message}</p>}
            <Link to="/" className="small-text">Not now</Link>
          </>
        )}
      </div>
    </div>
  );
}
