// PayPal sandbox REST client. Server-side only: it reads the client secret from the environment.
// Unheld makes two kinds of call: read an order (amount, capture, trackers) and add a tracker.

const BASE_URL = process.env.PAYPAL_API_BASE ?? 'https://api-m.sandbox.paypal.com';

export class PayPalApiError extends Error {
  constructor(readonly status: number, readonly path: string, body: string) {
    super(`PayPal ${status} on ${path}: ${body.slice(0, 300)}`);
  }
}

let cachedToken: { value: string; expiresAt: number } | undefined;

async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set');
  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
    cache: 'no-store',
  });
  if (!res.ok) throw new PayPalApiError(res.status, '/v1/oauth2/token', await res.text());
  const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: access_token, expiresAt: Date.now() + (expires_in - 60) * 1000 };
  return access_token;
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      ...(method === 'POST' && { 'PayPal-Request-Id': crypto.randomUUID() }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new PayPalApiError(res.status, path, await res.text());
  return (await res.json()) as T;
}

export type Tracker = { id: string; status: string };

export type Order = {
  id: string;
  status: string;
  purchase_units: {
    description?: string;
    amount: { value: string; currency_code: string };
    shipping?: { trackers?: Tracker[] };
    payments?: { captures?: { id: string; status: string; create_time: string }[] };
  }[];
};

export const getOrder = (orderId: string) => call<Order>('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`);

/** Attach a shipment tracker to an order's capture (order-level /track; the batch API is 403 here). */
export const addTracking = (orderId: string, captureId: string, carrier: string, trackingNumber: string) =>
  call<Order>('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/track`, {
    capture_id: captureId,
    tracking_number: trackingNumber,
    carrier,
    notify_payer: false,
  });
