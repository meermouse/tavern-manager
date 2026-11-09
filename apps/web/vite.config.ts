import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_URL || 'http://localhost:8787';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      // The API is served from the same origin in production (Netlify functions),
      // so proxy it in dev too. This keeps cookies first-party and the
      // Battle.net redirect URI at http://localhost:5173/auth/callback.
      proxy: {
        '/api': target,
        '/auth': target,
      },
    },
    test: {
      environment: 'jsdom',
    },
  };
});
