// Demo reset: give every judge the same fresh starting state instead of the sandbox state the
// previous judge left behind.
//
// The 'add tracking' action (app/api/holds/[id]/[action]/route.ts) writes a real tracker onto the
// sandbox order lib/holds.ts reads back, and PayPal has no call to remove one, so without a reset
// the first judge to track Tom's parcel removes his "18 days sooner" moment for every judge after
// them on this server. The 'create draft reply' action leaves a real Gmail draft in the creator's
// mailbox, and those pile up over a week of judging.
//
// Reset creates brand-new sandbox orders (scripts/seed.mjs's own order-creation logic, reused not
// re-implemented) and deletes only the Gmail drafts this app itself created since the last reset -
// never one the creator wrote by hand. State lives in memory only: Render's disk is ephemeral, so
// a write to data/holds.json surviving a restart cannot be relied on (seed.mjs's own --fresh
// comment makes the same point) - a fresh process must be able to reach a clean state on its own,
// not by reading an order id back off disk.
//
// On globalThis, not a module-level `let`: Next.js compiles instrumentation.ts, page.tsx and each
// route handler ([id]/[action], holds, reset) into separate bundles, each getting its own copy of
// a module-scope variable even though they `import` the "same" file - a run.mjs run with a plain
// module-level singleton here logged four independent resets (one per entry point) instead of one,
// and the grid, the track action and the reset button each read a different sandbox order for the
// same hold. globalThis is the one thing every bundle in the same Node process actually shares
// (the same pattern Prisma's own Next.js docs use for its client singleton, for the same reason).

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
// SAFETY: globalThis has no index signature for an arbitrary Symbol key; this module is the only
// reader/writer of KEY, and every access goes through `state` below, so the shape is ours to define.
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
