// The two writes Unheld makes, both on the creator's behalf and both reversible:
//   POST /api/holds/:id/track  - attach a tracking number to the PayPal order (real sandbox call)
//   POST /api/holds/:id/draft  - save a reply to the buyer as a Gmail draft (never sent)

import { trackCreatedDraft } from '@/lib/demo-reset';
import { createDraft } from '@/lib/gmail';
import { loadHolds } from '@/lib/load-holds';
import { addTracking } from '@/lib/paypal';

const fail = (status: number, message: string) => Response.json({ error: message }, { status });

const confirmRequest = (buyer: string, item: string) =>
  `Hi ${buyer.split(' ')[0]},\n\nI hope the ${item.toLowerCase()} is everything you wanted. ` +
  `Could you reply to confirm you have received it? PayPal is holding this payment until the order is confirmed, ` +
  `and your reply helps me show that.\n\nThank you!`;

export async function POST(request: Request, ctx: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await ctx.params;
  const input = (await request.json().catch(() => ({}))) as { body?: string; trackingNumber?: string; carrier?: string };
  const { holds } = await loadHolds();
  const hold = holds.find((h) => h.id === id);
  if (!hold) return fail(404, `no hold ${id}`);

  try {
    if (action === 'track') {
      const number = input.trackingNumber ?? hold.trackingFound;
      if (!number) return fail(400, 'no tracking number given or found in gmail');
      if (hold.kind !== 'physical') return fail(400, 'tracking only applies to physical items');
      const order = await addTracking(hold.orderId, hold.captureId, input.carrier ?? 'ROYAL_MAIL', number);
      const trackers = order.purchase_units[0].shipping?.trackers ?? [];
      return Response.json({ ok: true, source: 'paypal', orderId: hold.orderId, trackers });
    }
    if (action === 'draft') {
      const body = input.body?.trim() || confirmRequest(hold.buyer, hold.item);
      const draft = await createDraft(hold.buyerEmail, `Re: ${hold.item}`, body, hold.threadId);
      // Only drafts unheld itself created are ever deleted on reset (lib/demo-reset.ts).
      trackCreatedDraft(draft.id);
      return Response.json({ ok: true, source: 'gmail', draftId: draft.id, to: hold.buyerEmail, body });
    }
  } catch (e) {
    return fail(502, (e as Error).message);
  }
  return fail(404, `unknown action ${action}`);
}
