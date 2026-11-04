// Gmail for the creator's test mailbox. Read messages and write drafts; there is no send call.
// Auth is an offline refresh token for an "In production" (unverified) OAuth client, so it does not
// expire after seven days the way a Testing-mode token would.

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

let cached: { value: string; expiresAt: number } | undefined;

export const gmailConfigured = () =>
  Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);

async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
      refresh_token: process.env.GMAIL_REFRESH_TOKEN ?? '',
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`gmail token ${res.status}: ${json.error ?? 'unknown'}`);
  cached = { value: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
  return json.access_token;
}

async function gmail<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  // DELETE (deleteDraft, below) returns 204 with no body.
  const json = res.status === 204 ? {} : await res.json();
  if (!res.ok) throw new Error(`gmail ${path.split('?')[0]} ${res.status}: ${json.error?.message ?? ''}`);
  return json as T;
}

export type Mail = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
};

type RawMessage = {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  payload: { headers: { name: string; value: string }[] };
};

/**
 * Messages to or from one address, newest first, each piece of evidence shown once. Unsent drafts
 * are not evidence, so they are left out.
 *
 * Dedupe key is (from, subject), not Message-ID: every message carries *some* Message-ID header
 * (if a raw insert's own id is malformed, Gmail silently replaces it with a generated one - see
 * scripts/seed.mjs's msgId comment), so it is always present and never collapses a duplicate by
 * itself. Content identity is what distinguishes a genuinely new reply from a repeat seed insert in
 * this app, where each buyer's one confirmation or tracking mail has a fixed subject. Newest-first
 * search order means the first of a duplicate pair is kept.
 */
export async function mailWith(address: string, max = 10): Promise<Mail[]> {
  const q = encodeURIComponent(`(from:${address} OR to:${address}) -in:drafts`);
  const list = await gmail<{ messages?: { id: string }[] }>(`messages?q=${q}&maxResults=${max}`);
  const messages = await Promise.all(
    (list.messages ?? []).map((m) =>
      gmail<RawMessage>(`messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`),
    ),
  );
  const seen = new Set<string>();
  return messages.flatMap((m) => {
    const header = (name: string) => m.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
    const from = header('from');
    const subject = header('subject');
    const key = `${from.toLowerCase()}|${subject}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return {
      id: m.id,
      threadId: m.threadId,
      from,
      to: header('to'),
      subject,
      date: new Date(Number(m.internalDate)).toISOString(),
      snippet: decodeEntities(m.snippet),
    };
  });
}

const decodeEntities = (s: string) =>
  s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Save a draft in the creator's mailbox. Unheld never sends; the creator reviews and sends it. */
export async function createDraft(to: string, subject: string, body: string, threadId?: string) {
  const raw = Buffer.from(
    [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset=utf-8', '', body].join('\r\n'),
  ).toString('base64url');
  return gmail<{ id: string; message: { id: string; threadId: string } }>('drafts', {
    method: 'POST',
    body: JSON.stringify({ message: { raw, ...(threadId && { threadId }) } }),
  });
}

/** Delete a draft this app created (demo reset, lib/demo-reset.ts) - never one the creator wrote by hand. */
export async function deleteDraft(id: string): Promise<void> {
  await gmail<Record<string, never>>(`drafts/${id}`, { method: 'DELETE' });
}
