// Demo reset: every judge starts from the same state. PayPal cannot remove a tracker and Gmail
// drafts pile up, so a reset creates fresh sandbox orders (seed.mjs's logic) and deletes only the
// drafts this app created. State is in memory (Render's disk is ephemeral) and on globalThis,
// because Next.js bundles each route separately and a module-level variable would not be shared.

import { freshOrderIds } from '@/scripts/seed.mjs';
import { deleteDraft, readDraft } from './gmail';
import type { BuyerDraft } from './holds';

const MIN_MANUAL_INTERVAL_MS = 60_000; // rate limit for the 'reset demo' button

type State = {
  orderIds?: Record<string, string>;
  // Startup and access-code sign-in must not consume the manual button's rate limit.
  lastManualAttempt: number;
  inFlight?: Promise<void>;
  createdDraftIds: Set<string>;
  draftsByOrder: Map<string, BuyerDraft>;
  actionsInFlight: Set<string>;
};

const KEY = Symbol.for('unheld.demo-reset');
// SAFETY: only this module reads or writes KEY, so the shape is ours to define.
const g = globalThis as unknown as { [KEY]?: State };
const state: State = (g[KEY] ??= { lastManualAttempt: 0, createdDraftIds: new Set(), draftsByOrder: new Map(), actionsInFlight: new Set() });

/** The order id the running demo currently points a fixture at, or its seeded fallback. */
export function currentOrderId(fixtureId: string, fallback: string): string {
  return state.orderIds?.[fixtureId] ?? fallback;
}

/** Remember only our own drafts, keyed by the sandbox order so repeated requests reuse one. */
export function trackCreatedDraft(orderId: string, draft: BuyerDraft) {
  state.createdDraftIds.add(draft.id);
  state.draftsByOrder.set(orderId, draft);
}

/** Refresh a known draft from Gmail. A deleted/sent draft no longer appears as an unsent reply. */
export async function draftForOrder(orderId: string): Promise<BuyerDraft | undefined> {
  const known = state.draftsByOrder.get(orderId);
  if (!known) return;
  const draft = await readDraft(known.id);
  if (draft) state.draftsByOrder.set(orderId, draft);
  else {
    state.draftsByOrder.delete(orderId);
    state.createdDraftIds.delete(known.id);
  }
  return draft;
}

export function claimPaymentAction(id: string) {
  if (state.inFlight || state.actionsInFlight.has(id)) return false;
  state.actionsInFlight.add(id);
  return true;
}
export const finishPaymentAction = (id: string) => state.actionsInFlight.delete(id);

async function doReset() {
  const env = process.env as Record<string, string>;
  const drafts = [...state.createdDraftIds];
  const [ids] = await Promise.all([
    freshOrderIds(env) as Promise<Record<string, string>>,
    Promise.all(drafts.map((id) => deleteDraft(id))),
  ]);
  for (const id of drafts) state.createdDraftIds.delete(id);
  state.draftsByOrder.clear();
  state.orderIds = ids;
}

function startReset(): Promise<void> {
  state.inFlight = doReset().finally(() => (state.inFlight = undefined));
  return state.inFlight;
}

/** Each correct access-code entry starts the next judge with fresh orders and no app-owned drafts. */
export function resetOnSignIn(): Promise<void> {
  if (state.inFlight) return state.inFlight;
  if (state.actionsInFlight.size) throw new Error('a payment action is running; wait for it to finish');
  return startReset();
}

/** Manual reset: same guarded write, with an additional button rate limit. */
export async function resetDemo(): Promise<void> {
  if (state.inFlight) return state.inFlight;
  if (Date.now() - state.lastManualAttempt < MIN_MANUAL_INTERVAL_MS) throw new Error('reset was just run; wait a moment and try again');
  const reset = resetOnSignIn();
  state.lastManualAttempt = Date.now();
  return reset;
}

/** Startup only. Ordinary page/API reads never call the reset path. */
export async function ensureFreshDemo(): Promise<void> {
  try { if (!state.orderIds) await resetOnSignIn(); }
  catch (e) { console.error('demo startup reset failed:', (e as Error).message); }
}
