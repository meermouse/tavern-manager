import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useMe } from './api/hooks';
import { Layout } from './components/Layout';
import { MyDungeonsPage } from './pages/MyDungeonsPage';
import { JoinPage } from './pages/JoinPage';
import { LoginPage } from './pages/LoginPage';
import { MyCharactersPage } from './pages/MyCharactersPage';
import { TavernDetailPage } from './pages/TavernDetailPage';
import { TavernsPage } from './pages/TavernsPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <p className="muted center">Loading…</p>;
  if (me.isError) return <p className="error center">Couldn't reach the server. Try again shortly.</p>;
  if (!me.data) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <Layout me={me.data}>{children}</Layout>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/join/:code" element={<JoinPage />} />
      <Route path="/" element={<RequireAuth><TavernsPage /></RequireAuth>} />
      <Route path="/taverns/:id" element={<RequireAuth><TavernDetailPage /></RequireAuth>} />
      <Route path="/characters" element={<RequireAuth><MyCharactersPage /></RequireAuth>} />
      <Route path="/dungeons" element={<RequireAuth><MyDungeonsPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
