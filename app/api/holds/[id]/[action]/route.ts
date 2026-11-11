// The UI and Studio tools share these two guarded writes. Neither path can send mail.
import { claimPaymentAction, finishPaymentAction, trackCreatedDraft } from '@/lib/demo-reset';
import { createDraft, draftsUrl, gmailConfigured } from '@/lib/gmail';
import { findFixture } from '@/lib/holds';
import { loadHolds } from '@/lib/load-holds';
import { addTracking } from '@/lib/paypal';

const fail = (status: number, error: string, uncertain = false) => Response.json({ error, uncertain }, { status });
const confirmRequest = (buyer: string, item: string) =>
  `Hi ${buyer.split(' ')[0]},\n\nCould you reply to confirm you have received the ${item.toLowerCase()}?\n\nThank you!`;

export async function POST(request: Request, ctx: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await ctx.params;
  // Reject unknown commands and malformed input before either integration is reached.
  if (!findFixture(id)) return fail(404, `no hold ${id}`);
  if (action !== 'track' && action !== 'draft') return fail(404, `unknown action ${action}`);
  const text = await request.text();
  if (text.length > 10_000) return fail(413, 'request too large');
  let input: Record<string, string>;
  try {
    const value: unknown = JSON.parse(text);
    const allowed = action === 'draft' ? ['body'] : ['trackingNumber', 'carrier'];
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.entries(value).some(([key, v]) => !allowed.includes(key) || typeof v !== 'string' || v.length > 6000))
      return fail(400, 'use text values for the requested action');
    input = value as Record<string, string>;
  } catch {
    return fail(400, 'request body must be a json object');
  }
  if (action === 'track' && ((input.trackingNumber && !/^[A-Za-z0-9-]{3,80}$/.test(input.trackingNumber))
    || (input.carrier && !/^[A-Z_]{2,40}$/.test(input.carrier))))
    return fail(400, 'check the tracking number and carrier');
  if (action === 'draft' && !gmailConfigured())
    return fail(409, 'gmail is not set up here; try the hosted demo');
  if (!claimPaymentAction(id)) return fail(409, 'busy; try again in a moment');

  let writing = false;
  try {
    const { holds } = await loadHolds();
    const hold = holds.find((h) => h.id === id);
    if (!hold) return fail(404, `no hold ${id}`);
    if (action === 'track') {
      if (hold.kind !== 'physical') return fail(400, 'tracking only applies to physical items');
      if (hold.nextStep === 'wait for delivery') return Response.json({ ok: true, source: 'paypal', orderId: hold.orderId, reused: true });
      const number = input.trackingNumber || hold.trackingFound;
      if (!number) return fail(400, 'no tracking number given or found in gmail');
      writing = true;
      const order = await addTracking(hold.orderId, hold.captureId, input.carrier || 'ROYAL_MAIL', number);
      return Response.json({ ok: true, source: 'paypal', orderId: hold.orderId, trackers: order.purchase_units[0].shipping?.trackers ?? [] });
    }
    if (hold.kind !== 'digital' || hold.nextStep !== 'confirm with buyer')
      return fail(409, 'this payment does not need a buyer confirmation draft');
    const body = input.body?.trim() || confirmRequest(hold.buyer, hold.item);
    if (hold.draft) {
      if (input.body?.trim() && body !== hold.draft.body) return fail(409, 'a draft already exists; edit it in gmail');
      return Response.json({ ok: true, source: 'gmail', draftId: hold.draft.id, to: hold.draft.to, body: hold.draft.body, draft: hold.draft, reused: true });
    }
    const subject = `Re: ${hold.item}`;
    writing = true;
    const saved = await createDraft(hold.buyerEmail, subject, body, hold.threadId);
    const draft = { id: saved.id, to: hold.buyerEmail, subject, body, url: draftsUrl() };
    trackCreatedDraft(hold.orderId, draft);
    return Response.json({ ok: true, source: 'gmail', draftId: draft.id, to: draft.to, body, draft });
  } catch (e) {
    console.error(`payment ${id} ${action} failed:`, e);
    return fail(502, writing
      ? 'not sure it saved; refresh to check'
      : 'could not reach paypal or gmail; try again', writing);
  } finally {
    finishPaymentAction(id);
  }
}
