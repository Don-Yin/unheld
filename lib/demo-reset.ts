// Demo reset: fresh sandbox orders and only this app's drafts deleted, so every visitor starts
// alike. State lives on globalThis because Next.js bundles each route separately.

import { freshOrderIds } from '@/scripts/seed.mjs';
import { deleteDraft, readDraft } from './gmail';
import type { BuyerDraft } from './holds';

const MIN_MANUAL_INTERVAL_MS = 60_000; // rate limit for the 'reset demo' button
const SIGN_IN_JOINS_MS = 15 * 60_000; // a sign-in this soon after other activity joins that demo

type State = {
  orderIds?: Record<string, string>;
  // Startup and access-code sign-in must not consume the manual button's rate limit.
  lastManualAttempt: number;
  lastActive: number; // last reset, sign-in or payment action
  inFlight?: Promise<void>;
  createdDraftIds: Set<string>;
  draftsByOrder: Map<string, BuyerDraft>;
  actionsInFlight: Set<string>;
};

const KEY = Symbol.for('unheld.demo-reset');
// SAFETY: only this module reads or writes KEY, so the shape is ours to define.
const g = globalThis as unknown as { [KEY]?: State };
const state: State = (g[KEY] ??= { lastManualAttempt: 0, lastActive: 0, createdDraftIds: new Set(), draftsByOrder: new Map(), actionsInFlight: new Set() });

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
  state.lastActive = Date.now();
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
  state.lastActive = Date.now();
}

function startReset(): Promise<void> {
  state.inFlight = doReset().finally(() => (state.inFlight = undefined));
  return state.inFlight;
}

function guardedReset(): Promise<void> {
  if (state.inFlight) return state.inFlight;
  if (state.actionsInFlight.size) throw new Error('busy; try again in a moment');
  return startReset();
}

/** A correct access-code entry starts fresh, unless someone used the demo in the last 15 minutes:
 *  then it joins that demo, so one visitor never wipes another's progress. */
export async function resetOnSignIn(): Promise<void> {
  if (state.inFlight) return state.inFlight;
  const active = state.actionsInFlight.size > 0 || Date.now() - state.lastActive < SIGN_IN_JOINS_MS;
  state.lastActive = Date.now();
  if (!active) return startReset();
}

/** Manual reset: same guarded write, with an additional button rate limit. */
export async function resetDemo(): Promise<void> {
  if (state.inFlight) return state.inFlight;
  if (Date.now() - state.lastManualAttempt < MIN_MANUAL_INTERVAL_MS) throw new Error('just reset; try again in a minute');
  const reset = guardedReset();
  state.lastManualAttempt = Date.now();
  return reset;
}

/** Startup only. Ordinary page/API reads never call the reset path. */
export async function ensureFreshDemo(): Promise<void> {
  try { if (!state.orderIds) await guardedReset(); }
  catch (e) { console.error('demo startup reset failed:', (e as Error).message); }
}
