// Gmail for the creator's test mailbox. Read messages and write drafts; there is no send call.
// Auth is an offline refresh token for an "In production" (unverified) OAuth client, so it does not
// expire after seven days the way a Testing-mode token would.

import { gmail, RemoteApiError } from './api-clients.mjs';
import type { BuyerDraft } from './holds';

export const gmailConfigured = () =>
  Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);

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
 * Messages to or from one address, newest first, without unsent drafts. Duplicates are dropped
 * by (from, subject), keeping the newest.
 */
export async function mailWith(address: string, max = 10): Promise<Mail[]> {
  const q = encodeURIComponent(`(from:${address} OR to:${address}) -in:drafts`);
  const list = await gmail<{ messages?: { id: string }[] }>(process.env, `messages?q=${q}&maxResults=${max}`);
  const messages = await Promise.all(
    (list.messages ?? []).map((m) =>
      gmail<RawMessage>(process.env, `messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`),
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
  return gmail<{ id: string; message: { id: string; threadId: string } }>(process.env, 'drafts', {
    method: 'POST',
    body: JSON.stringify({ message: { raw, ...(threadId && { threadId }) } }),
  });
}

export const draftsUrl = () => `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(process.env.GMAIL_TEST_ADDRESS ?? '')}#drafts`;

type Payload = { mimeType?: string; headers?: { name: string; value: string }[]; body?: { data?: string }; parts?: Payload[] };
const plainText = (part: Payload): string =>
  part.body?.data && (!part.mimeType || part.mimeType === 'text/plain')
    ? Buffer.from(part.body.data, 'base64url').toString('utf8')
    : (part.parts ?? []).map(plainText).filter(Boolean).join('\n');

export async function readDraft(id: string): Promise<BuyerDraft | undefined> {
  try {
    const draft = await gmail<{ id: string; message: { payload: Payload } }>(process.env, `drafts/${encodeURIComponent(id)}?format=full`);
    const payload = draft.message.payload;
    const header = (name: string) => payload.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? '';
    return { id: draft.id, to: header('to'), subject: header('subject'), body: plainText(payload) || 'text preview unavailable; review this draft in gmail', url: draftsUrl() };
  } catch (e) {
    if (e instanceof RemoteApiError && e.status === 404) return;
    throw e;
  }
}

/** Delete only our own draft. An already deleted or sent draft needs no further deletion. */
export async function deleteDraft(id: string): Promise<void> {
  try {
    await gmail<Record<string, never>>(process.env, `drafts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (e) {
    if (!(e instanceof RemoteApiError && e.status === 404)) throw e;
  }
}
