// The hold/evidence shapes, the release-estimate math and date formatting - kept free of any
// PayPal, Gmail or filesystem I/O (data/holds.json is static data, safe to bundle) so this file
// stays safe for the client bundle: app/studio/*.tsx import formatDate, RELEASE_RULES and these
// types directly. loadHolds() itself, and everything it needs to reach PayPal, Gmail and the demo
// reset state, lives in lib/load-holds.ts - mixing that in here once broke the client build
// outright, since demo-reset.ts's use of scripts/seed.mjs (node:fs) cannot be bundled for a
// browser at all, even as dead code a client component never calls.
import fixtures from '@/data/holds.json';

// One GBP formatter for the whole app (the summary line, the gantt's pinned column, the evidence/
// event-list header): data.ts wraps it as `{ format: gbp }` for ag-studio's own currencyFormat.
export const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

export type Source = 'simulated' | 'paypal' | 'gmail' | 'you' | 'estimate';
export type Evidence = { id: string; holdId: string; at: string; source: Source; text: string };

export type BuyerDraft = { id: string; to: string; subject: string; body: string; url: string };

export type Hold = {
  id: string;
  creator: string;
  buyer: string;
  buyerEmail: string;
  item: string;
  kind: 'digital' | 'physical';
  amount: number;
  currency: string;
  heldSince: string;
  hold: string;
  nextStep: string;
  release: string;
  orderId: string;
  captureId: string;
  trackingFound?: string;
  threadId?: string;
  draft?: BuyerDraft;
  // The release date if tracking were added today (physical, untracked, a number already found in
  // Gmail): the gantt's dashed 'with tracking' bar (docs/ui-redesign/c-calendar-gantt.png). Only
  // load-holds.ts's oneHold sets this, and only when nextStep is exactly 'add tracking'.
  withTrackingRelease?: string;
};

export type Fixture = (typeof fixtures)[number];

const DAY = 864e5;
export const day = (iso: string | number) => new Date(iso).toISOString().slice(0, 10);
/** Whole calendar days (UTC) from `now` to `date`, so "in 7 days" does not depend on the time of day. */
export const daysUntil = (date: string | number, now: string | number) => Math.round((Date.parse(day(date)) - Date.parse(day(now))) / DAY);

// One date format for the whole app (grid, evidence timeline, estimate text, the assistant's
// answers): "31 Oct", with the year only when it is not `now`'s year. ag-studio's dateFormat
// field only accepts a static Intl.DateTimeFormat (it cannot see `now` per value), so the grid's
// own date columns use the no-year form directly (data.ts); this helper is for free text.
export function formatDate(iso: string | number, now = Date.now()) {
  const d = new Date(iso);
  const sameYear = d.getUTCFullYear() === new Date(now).getUTCFullYear();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric', timeZone: 'UTC' });
}

// PayPal help129 (checked 2026-10-30): eligible holds release about 1 day after confirmed delivery,
// about 7 days after a service is marked completed, and otherwise within 21 days.
export const RELEASE_RULES = { afterDelivery: 1, afterCompleted: 7, longest: 21 };

export function release(hold: Pick<Hold, 'heldSince' | 'kind'>, ctx: { confirmed: boolean; tracked: boolean }, now = Date.now()) {
  const longest = new Date(hold.heldSince).getTime() + RELEASE_RULES.longest * DAY;
  // If the creator marks it complete today (digital) or the parcel is delivered in ~2 days (physical).
  const early =
    hold.kind === 'digital'
      ? ctx.confirmed && now + RELEASE_RULES.afterCompleted * DAY
      : ctx.tracked && now + (2 + RELEASE_RULES.afterDelivery) * DAY;
  return day(early ? Math.min(early, longest) : longest);
}

export const findFixture = (id: string) => fixtures.find((f) => f.id === id);
