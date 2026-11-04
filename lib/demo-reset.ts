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
import { deleteDraft } from './gmail';

export const MAX_AGE_MS = 6 * 60 * 60 * 1000; // auto reset once the demo state is this old
const MIN_MANUAL_INTERVAL_MS = 60_000; // rate limit for the 'reset demo' button

type State = {
  orderIds?: Record<string, string>;
  resetAt: number;
  // Only the manual 'reset demo' button sets this; the automatic reset (instrumentation.ts on
  // startup, and ensureFreshDemo() when state goes stale) must never count against the button's
  // rate limit, or a judge's first click right after a fresh server start gets refused.
  lastManualAttempt: number;
  inFlight?: Promise<void>;
  createdDraftIds: Set<string>;
};

const KEY = Symbol.for('unheld.demo-reset');
// SAFETY: globalThis has no index signature for an arbitrary Symbol key; this module is the only
// reader/writer of KEY, and every access goes through `state` below, so the shape is ours to define.
const g = globalThis as unknown as { [KEY]?: State };
const state: State = (g[KEY] ??= { resetAt: 0, lastManualAttempt: 0, createdDraftIds: new Set() });

/** The order id the running demo currently points a fixture at, or its seeded fallback. */
export function currentOrderId(fixtureId: string, fallback: string): string {
  return state.orderIds?.[fixtureId] ?? fallback;
}

/** Record a draft id so a later reset deletes it; never anything the creator wrote by hand. */
export function trackCreatedDraft(id: string) {
  state.createdDraftIds.add(id);
}

async function doReset() {
  const env = process.env as Record<string, string>;
  const drafts = [...state.createdDraftIds];
  const [ids] = await Promise.all([
    freshOrderIds(env) as Promise<Record<string, string>>,
    Promise.all(drafts.map((id) => deleteDraft(id).catch(() => {}))),
  ]);
  for (const id of drafts) state.createdDraftIds.delete(id);
  state.orderIds = ids;
  state.resetAt = Date.now();
}

function startReset(): Promise<void> {
  state.inFlight = doReset().finally(() => (state.inFlight = undefined));
  return state.inFlight;
}

/** Manual reset (the 'reset demo' button): rate-limited, throws its refusal message instead of resetting. */
export async function resetDemo(): Promise<void> {
  if (state.inFlight) return state.inFlight;
  if (Date.now() - state.lastManualAttempt < MIN_MANUAL_INTERVAL_MS) throw new Error('reset was just run; wait a moment and try again');
  state.lastManualAttempt = Date.now();
  return startReset();
}

/** Automatic reset: the first load after a server start, and whenever the state goes stale. Never throws. */
export async function ensureFreshDemo(): Promise<void> {
  if (state.orderIds && Date.now() - state.resetAt <= MAX_AGE_MS) return;
  const run = state.inFlight ? state.inFlight.catch(() => {}) : startReset();
  await run.catch((e) => console.error('demo auto-reset failed:', (e as Error).message));
}
