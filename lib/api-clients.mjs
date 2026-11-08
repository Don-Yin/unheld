// Server-only REST/OAuth for both the running app and the seed/reset scripts. Nothing here retries
// a write. Each environment's concurrent reads share one token request, refreshed before expiry.
/** @typedef {Record<string, string | undefined>} Env */
/** @typedef {{value?: string, expiresAt: number, pending?: Promise<string>}} Token */
const tokens = {
  paypal: new WeakMap(),
  gmail: new WeakMap(),
};

export class RemoteApiError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) { super(message); this.status = status; }
}

/** @template T @param {string} url @param {RequestInit} init @param {string} label @returns {Promise<T>} */
async function jsonRequest(url, init, label) {
  const res = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  if (!res.ok) throw new RemoteApiError(res.status, `${label} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/** @param {Env} env @param {'paypal' | 'gmail'} service @returns {Promise<string>} */
async function accessToken(env, service) {
  /** @type {Token} */
  const state = tokens[service].get(env) ?? { expiresAt: 0 };
  tokens[service].set(env, state);
  if (state.value && Date.now() < state.expiresAt) return state.value;
  if (state.pending) return state.pending;
  state.pending = (async () => {
    const paypal = service === 'paypal';
    const id = paypal ? env.PAYPAL_CLIENT_ID : env.GOOGLE_OAUTH_CLIENT_ID;
    const secret = paypal ? env.PAYPAL_CLIENT_SECRET : env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!id || !secret || (!paypal && !env.GMAIL_REFRESH_TOKEN)) throw new Error(`${service} credentials are not configured`);
    const url = paypal ? `${env.PAYPAL_API_BASE ?? 'https://api-m.sandbox.paypal.com'}/v1/oauth2/token` : 'https://oauth2.googleapis.com/token';
    const body = paypal
      ? { grant_type: 'client_credentials' }
      : { grant_type: 'refresh_token', client_id: id, client_secret: secret, refresh_token: env.GMAIL_REFRESH_TOKEN };
    const token = await jsonRequest(url, {
      method: 'POST', body: new URLSearchParams(body),
      ...(paypal && { headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` } }),
    }, `${service} token`);
    if (typeof token.access_token !== 'string' || typeof token.expires_in !== 'number') throw new Error(`${service} returned an invalid token`);
    state.value = token.access_token;
    state.expiresAt = Date.now() + (token.expires_in - 60) * 1000;
    return token.access_token;
  })().finally(() => { state.pending = undefined; });
  return state.pending;
}

/** @template T @param {Env} env @param {'GET' | 'POST'} method @param {string} path @param {unknown} [body] @returns {Promise<T>} */
export async function paypal(env, method, path, body) {
  return jsonRequest(`${env.PAYPAL_API_BASE ?? 'https://api-m.sandbox.paypal.com'}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken(env, 'paypal')}`, 'Content-Type': 'application/json',
      ...(method === 'POST' && { 'PayPal-Request-Id': crypto.randomUUID() }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  }, `PayPal ${path}`);
}

/** @template T @param {Env} env @param {string} path @param {RequestInit} [init] @returns {Promise<T>} */
export async function gmail(env, path, init = {}) {
  if (/^(messages|drafts)\/send(?:$|\?)/.test(path)) throw new Error('unheld never sends email');
  return jsonRequest(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken(env, 'gmail')}`, 'Content-Type': 'application/json' },
  }, `gmail ${path.split('?')[0]}`);
}
