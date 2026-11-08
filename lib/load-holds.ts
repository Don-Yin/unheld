// Builds the held payments and their evidence from three sources, each kept distinguishable:
//   simulated - the hold itself (data/holds.json); the PayPal sandbox never withholds funds
//   paypal    - the real sandbox order: amount, capture and trackers
//   gmail     - the creator's real (test) mailbox
// plus two derived kinds: `you` (a step only the creator can take in PayPal) and `estimate`
// (a release date from PayPal's published release rules, not a PayPal promise).
//
// Server only: this reaches PayPal, Gmail and the in-memory demo reset state (lib/demo-reset.ts),
// which itself reaches the filesystem (scripts/seed.mjs). Route handlers and page.tsx (both server
// components) import loadHolds from here; app/studio/*.tsx (client components) import the shared,
// I/O-free types and helpers from lib/holds.ts instead - see that file's own comment.

import fixtures from '@/data/holds.json';
import { currentOrderId, draftForOrder } from './demo-reset';
import { gmailConfigured, mailWith, type Mail } from './gmail';
import { day, formatDate, RELEASE_RULES, release, type Evidence, type Fixture, type Hold, type Source } from './holds';
import { getOrder, type Order } from './paypal';

const CONFIRMS = /\b(love|loved|received|got (it|them|the)|arrived|perfect|thank you)\b/i;
const ROYAL_MAIL = /\b[A-Z]{2}\d{9}GB\b/;

function nextStep(kind: Hold['kind'], s: { confirmed: boolean; tracked: boolean; trackingFound?: string }) {
  // Kept at or under 18 characters ('wait for delivery'), the longest next-step value AG Grid's
  // autosize measured correctly without truncating at 1440px (AgGridWidgetOptions has no
  // per-column width - see gridOverride's comment); 21-character values ('ask buyer to confirm',
  // 'find tracking number') still clipped even after the 24-character 'mark complete in paypal'
  // was shortened, so the limit is on autosize's own measurement, not just the longest string
  // (ui-critique.md #1, round 2). This same string also backs the evidence panel's "next: ..."
  // line, which shortens with it.
  if (kind === 'digital') return s.confirmed ? 'mark complete' : 'confirm with buyer';
  if (s.tracked) return 'wait for delivery';
  return s.trackingFound ? 'add tracking' : 'find tracking';
}

async function oneHold(f: Fixture, now: number): Promise<{ hold: Hold; evidence: Evidence[] }> {
  if (!f.orderId) throw new Error(`hold ${f.id} has no sandbox order; run the experiment entry to seed it`);
  // demo-reset.ts's own sandbox order for this run, when one has been created; f.orderId (the
  // fixture's committed-in id) is only the fallback before the first reset completes.
  const orderId = currentOrderId(f.id, f.orderId);
  const order: Order = await getOrder(orderId);
  const unit = order.purchase_units[0];
  const capture = unit.payments?.captures?.[0];
  if (!capture) throw new Error(`order ${f.orderId} has no capture`);
  const trackers = unit.shipping?.trackers ?? [];
  const mail: Mail[] = gmailConfigured() ? await mailWith(f.buyerEmail) : [];

  const byBuyer = (m: Mail) => m.from.toLowerCase().includes(f.buyerEmail.toLowerCase());
  const fromBuyer = mail.filter(byBuyer);
  const confirmed = fromBuyer.some((m) => CONFIRMS.test(m.snippet));
  const trackingFound = mail.map((m) => m.snippet.match(ROYAL_MAIL)?.[0]).find(Boolean);
  const tracked = trackers.length > 0;
  const kind = f.kind as Hold['kind'];
  const state = { confirmed, tracked, trackingFound };

  const hold: Hold = {
    id: f.id,
    creator: f.creator,
    buyer: f.buyer,
    buyerEmail: f.buyerEmail,
    item: f.item,
    kind,
    amount: Number(unit.amount.value),
    currency: unit.amount.currency_code,
    heldSince: capture.create_time,
    hold: f.hold,
    nextStep: nextStep(kind, state),
    release: release({ heldSince: capture.create_time, kind }, state, now),
    orderId: order.id,
    captureId: capture.id,
    trackingFound,
    threadId: fromBuyer[0]?.threadId,
    draft: await draftForOrder(order.id),
    // Gantt's dashed 'with tracking' bar (docs/ui-redesign/c-calendar-gantt.png): only set once
    // nextStep below resolves to 'add tracking' (physical, untracked, a number already found in
    // Gmail), so the UI shows the faster alternative only when it is an action the creator can
    // actually take right now, not a hypothetical for a parcel with no known number yet.
    withTrackingRelease:
      kind === 'physical' && !tracked && trackingFound
        ? release({ heldSince: capture.create_time, kind }, { ...state, tracked: true }, now)
        : undefined,
  };

  let n = 0;
  const ev = (at: string, source: Source, text: string): Evidence => ({ id: `${f.id}-${n++}`, holdId: f.id, at, source, text });
  const evidence = [
    ev(capture.create_time, 'paypal', `payment captured, ${unit.amount.currency_code} ${unit.amount.value} (${capture.status.toLowerCase()})`),
    ev(capture.create_time, 'simulated', `hold placed: ${f.hold}`),
    ...trackers.map((t) => ev(capture.create_time, 'paypal', `tracker ${t.id.split('-').pop()} on the order, ${t.status.toLowerCase()}`)),
    ...mail
      .toReversed()
      .map((m) => ev(m.date, 'gmail', `${byBuyer(m) ? `${f.buyer} wrote` : 'you wrote'}: "${m.snippet}"`)),
  ];
  const today = new Date(now).toISOString();
  if (kind === 'digital' && confirmed)
    evidence.push(ev(today, 'you', 'in paypal, open this payment and mark the order as completed. paypal offers no api for this step.'));
  evidence.push(ev(today, 'estimate', releaseText(kind, state, hold.release)));
  // Same-day rows sort by the story, not by write time: the hold, its capture and its tracker are
  // all timestamped off capture.create_time, so they already share an order, but seeded Gmail mail
  // and freshly-created sandbox orders (lib/demo-reset.ts) often land on the same calendar day -
  // without this, a mail row seeded earlier could sort above "payment captured" and make the buyer
  // look like they confirmed before paying (paypal-challenge peer review). Different days keep their
  // own chronological order; only the same-day tie is broken by story order.
  const STORY_ORDER: Record<Source, number> = { paypal: 0, simulated: 1, gmail: 2, you: 3, estimate: 4 };
  evidence.sort((a, b) => (day(a.at) !== day(b.at) ? a.at.localeCompare(b.at) : STORY_ORDER[a.source] - STORY_ORDER[b.source]));
  return { hold, evidence };
}

function releaseText(kind: Hold['kind'], s: { confirmed: boolean; tracked: boolean }, date: string) {
  const when = formatDate(date);
  if (kind === 'digital' && s.confirmed) return `about ${when}: ${RELEASE_RULES.afterCompleted} days after you mark it completed today`;
  if (kind === 'physical' && s.tracked) return `about ${when}: ${RELEASE_RULES.afterDelivery} day after delivery, if delivery takes 2 days`;
  return `by ${when} at the latest: ${RELEASE_RULES.longest} days after the payment`;
}

export async function loadHolds(now = Date.now()) {
  const all = await Promise.all(fixtures.map((f) => oneHold(f, now)));
  return { holds: all.map((a) => a.hold), evidence: all.flatMap((a) => a.evidence), asOf: new Date(now).toISOString() };
}
