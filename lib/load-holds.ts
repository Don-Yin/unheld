// Builds the held payments and their evidence from three sources, each kept distinguishable:
//   simulated - the hold itself (data/holds.json); the PayPal sandbox never withholds funds
//   paypal    - the real sandbox order: amount, capture and trackers
//   gmail     - the creator's real (test) mailbox
// plus two derived kinds: `you` (a step only the creator can take in PayPal) and `estimate`
// (from PayPal's published release rules). Server only; client code imports lib/holds.ts.

import fixtures from '@/data/holds.json';
import { currentOrderId, draftForOrder } from './demo-reset';
import { gmailConfigured, mailWith, type Mail } from './gmail';
import { day, formatDate, RELEASE_RULES, release, type Evidence, type Fixture, type Hold, type Source } from './holds';
import { getOrder, type Order } from './paypal';

const CONFIRMS = /\b(love|loved|received|got (it|them|the)|arrived|perfect|thank you)\b/i;
const ROYAL_MAIL = /\b[A-Z]{2}\d{9}GB\b/;

function nextStep(kind: Hold['kind'], s: { confirmed: boolean; tracked: boolean; trackingFound?: string }) {
  // Kept to 18 characters or fewer so the label fits the gantt bar and the "next:" line.
  if (kind === 'digital') return s.confirmed ? 'mark complete' : 'confirm with buyer';
  if (s.tracked) return 'wait for delivery';
  return s.trackingFound ? 'add tracking' : 'find tracking';
}

async function oneHold(f: Fixture, now: number): Promise<{ hold: Hold; evidence: Evidence[] }> {
  if (!f.orderId) throw new Error(`hold ${f.id} has no sandbox order; run the experiment entry to seed it`);
  // The order from the latest demo reset, else the fixture's seeded id.
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
    // The gantt's dashed preview, only when 'add tracking' is an action available right now.
    withTrackingRelease:
      kind === 'physical' && !tracked && trackingFound
        ? release({ heldSince: capture.create_time, kind }, { ...state, tracked: true }, now)
        : undefined,
  };

  let n = 0;
  const ev = (at: string, source: Source, text: string): Evidence => ({ id: `${f.id}-${n++}`, holdId: f.id, at, source, text });
  const evidence = [
    ev(capture.create_time, 'paypal', `payment received, ${unit.amount.currency_code} ${unit.amount.value}`),
    ev(capture.create_time, 'simulated', `hold placed: ${f.hold}`),
    ...trackers.map((t) => ev(capture.create_time, 'paypal', `tracker ${t.id.split('-').pop()} on the order, ${t.status.toLowerCase()}`)),
    ...mail
      .toReversed()
      .map((m) => ev(m.date, 'gmail', `${byBuyer(m) ? `${f.buyer} wrote` : 'you wrote'}: "${m.snippet}"`)),
  ];
  const today = new Date(now).toISOString();
  if (kind === 'digital' && confirmed)
    evidence.push(ev(today, 'you', 'mark it complete in paypal (no api for this step)'));
  evidence.push(ev(today, 'estimate', releaseText(kind, state, hold.release)));
  // Same-day rows follow story order, so a buyer's mail never sorts above the capture it follows.
  const STORY_ORDER: Record<Source, number> = { paypal: 0, simulated: 1, gmail: 2, you: 3, estimate: 4 };
  evidence.sort((a, b) => (day(a.at) !== day(b.at) ? a.at.localeCompare(b.at) : STORY_ORDER[a.source] - STORY_ORDER[b.source]));
  return { hold, evidence };
}

function releaseText(kind: Hold['kind'], s: { confirmed: boolean; tracked: boolean }, date: string) {
  const when = formatDate(date);
  if (kind === 'digital' && s.confirmed) return `about ${when}: ${RELEASE_RULES.afterCompleted} days after you mark it complete today`;
  if (kind === 'physical' && s.tracked) return `about ${when}: ${RELEASE_RULES.afterDelivery} day after delivery, if delivery takes 2 days`;
  return `by ${when} at the latest: ${RELEASE_RULES.longest} days after the payment`;
}

export async function loadHolds(now = Date.now()) {
  const all = await Promise.all(fixtures.map((f) => oneHold(f, now)));
  return { holds: all.map((a) => a.hold), evidence: all.flatMap((a) => a.evidence), asOf: new Date(now).toISOString() };
}
