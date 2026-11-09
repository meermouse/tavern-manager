import type { BnetCredentials } from '../config.js';

export interface BnetUser {
  id: string;
  battletag: string;
}

export interface OAuthProvider {
  authorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<{ accessToken: string; expiresIn: number }>;
  getUser(accessToken: string): Promise<BnetUser>;
}

const OAUTH_HOST = 'https://oauth.battle.net';

export function createBattleNetOAuth(creds: BnetCredentials, fetchImpl: typeof fetch = fetch): OAuthProvider {
  return {
    authorizeUrl(state) {
      const params = new URLSearchParams({
        client_id: creds.clientId,
        redirect_uri: creds.redirectUri,
        response_type: 'code',
        scope: 'openid wow.profile',
        state,
      });
      return `${OAUTH_HOST}/authorize?${params}`;
    },

    async exchangeCode(code) {
      const res = await fetchImpl(`${OAUTH_HOST}/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: creds.redirectUri }),
      });
      if (!res.ok) throw new Error(`Battle.net token exchange failed (${res.status})`);
      const body = (await res.json()) as { access_token: string; expires_in: number };
      return { accessToken: body.access_token, expiresIn: body.expires_in };
    },

    async getUser(accessToken) {
      const res = await fetchImpl(`${OAUTH_HOST}/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Battle.net userinfo failed (${res.status})`);
      const body = (await res.json()) as { id: number | string; sub?: string; battletag?: string };
      return { id: String(body.id ?? body.sub), battletag: body.battletag ?? 'Adventurer' };
    },
  };
}
