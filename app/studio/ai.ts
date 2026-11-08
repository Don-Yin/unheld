// The assistant is AG Studio's own harness and agents. Unheld changes one thing: the lead agent gets
// instructions about holds and three tools that act through this app's API. The adapter calls
// /api/ai/responses, which holds the model key, so nothing secret reaches the browser.

import { createAiHarness, directLlmRunner, type AgAiHarnessSetup, type AgAiTool, type AgStudioApi } from 'ag-studio';
import { RELEASE_RULES, type Hold } from '@/lib/holds';
import { openaiAdapter } from './openai-adapter';
import { holdsStore, runAction, type ActionResult } from './store';

const INSTRUCTIONS = `
You work for an independent creator whose PayPal payments are on hold. Your job is to get each payment released.
For each hold: read its evidence (get_hold_evidence), decide the next step, and say when the money should arrive.
Name each payment with its returned payment label, creator name plus item, as its heading (for example "Maya Chen · Portrait commission"). Never use internal record keys or transaction identifiers as payment names.
Call add_tracking or draft_buyer_reply only when the creator asks you to act (for example "what can you do today?" or "do it"); for a question such as "when do i get paid?", answer and name the step you would take.
- Physical item with a tracking number found in Gmail and no tracker yet: call add_tracking.
- Digital item with no buyer confirmation: call draft_buyer_reply. It saves a Gmail draft; it never sends.
- Digital item the buyer confirmed: tell the creator to mark the order completed in PayPal. Only they can; there is no API.
Release rules (PayPal help article help129): about ${RELEASE_RULES.afterDelivery} day after confirmed delivery, about ${RELEASE_RULES.afterCompleted} days after the order is marked completed, otherwise within ${RELEASE_RULES.longest} days of the payment.
Write every date as its day and short month in English, year only if it is not 2026 (for example "10 Nov") — never the raw ISO date a tool returns.
Be exact about sources: write each fact on its own line or bullet, starting that line with one inline code tag and nothing before it \u2014 never place a tag mid-sentence, and never repeat a tag on the same line. Use \`estimate\` for a release date, \`gmail\` for buyer mail, \`paypal\` for order or payment state, \`you\` for a step only the creator can take, \`simulated\` for the hold itself (for example "\`estimate\` about 8 Nov"). The holds are simulated because the PayPal sandbox never withholds money. Adding a tracker is not a release, and a release date is an estimate, not a PayPal promise.
Keep replies short and in plain words. Per payment give at most three tagged lines: the \`estimate\` date, the one fact it rests on, and the \`you\` step if there is one. List every evidence row only when the creator asks for the full evidence of one payment.
Use lowercase labels when you add widgets.`;

const paymentName = (hold: Pick<Hold, 'creator' | 'item'>) => `${hold.creator} · ${hold.item}`;

function unheldTools(api: AgStudioApi): AgAiTool[] {
  const payments = () => holdsStore.get()?.holds.map(paymentName) ?? [];
  // Model-facing names resolve to the internal key only at the shared action boundary.
  const act = async (payment: string, action: 'track' | 'draft', input: Record<string, string>): Promise<ActionResult> => {
    const matches = holdsStore.get()?.holds.filter((h) => paymentName(h) === payment) ?? [];
    return matches.length === 1 ? runAction(matches[0].id, action, input) : { ok: false, error: 'that payment name is missing or ambiguous; refresh payments' };
  };
  return [
    api.defineAiTool({
      name: 'get_hold_evidence',
      description: 'Every held payment, named by creator and item, with its next step, estimated release date and evidence timeline (sources: simulated, paypal, gmail, you, estimate).',
      params: (s) => s.object({}),
      execute: (_args, ctx) => {
        const data = holdsStore.get();
        if (!data) return ctx.error('holds are still loading');
        return ctx.success(JSON.stringify({
          asOf: data.asOf,
          payments: data.holds.map((hold) => ({
            payment: paymentName(hold), creator: hold.creator, item: hold.item,
            buyer: hold.buyer, buyerEmail: hold.buyerEmail, kind: hold.kind,
            amount: hold.amount, currency: hold.currency, heldSince: hold.heldSince,
            hold: hold.hold, nextStep: hold.nextStep, release: hold.release,
            trackingFound: hold.trackingFound, withTrackingRelease: hold.withTrackingRelease,
            draft: hold.draft && { to: hold.draft.to, subject: hold.draft.subject, body: hold.draft.body, url: hold.draft.url },
            evidence: data.evidence.filter((row) => row.holdId === hold.id).map(({ at, source, text }) => ({ at, source, text })),
          })),
        }));
      },
    }),
    api.defineAiTool({
      name: 'add_tracking',
      description: 'Attach a shipment tracking number to the PayPal order of a held physical payment. Real PayPal sandbox call.',
      params: (s) => s.object({ payment: s.enum(payments), trackingNumber: s.string(), carrier: s.string() }),
      execute: async ({ payment, trackingNumber, carrier }, ctx) => {
        const r = await act(payment, 'track', { trackingNumber, carrier: carrier || 'ROYAL_MAIL' });
        return r.ok ? ctx.success(`tracking added for ${payment}`, { payment, refreshError: r.refreshError }) : ctx.error(String(r.error));
      },
    }),
    api.defineAiTool({
      name: 'draft_buyer_reply',
      description: "Save a reply to the buyer as a draft in the creator's Gmail. Never sends. Leave body empty for the standard request to confirm receipt.",
      params: (s) => s.object({ payment: s.enum(payments), body: s.string() }),
      execute: async ({ payment, body }, ctx) => {
        const r = await act(payment, 'draft', { body });
        return r.ok ? ctx.success(`draft saved for ${payment}, not sent`, { payment, to: r.to, url: r.draft?.url, refreshError: r.refreshError }) : ctx.error(String(r.error));
      },
    }),
  ];
}

export function buildAi(models: string[]): AgAiHarnessSetup {
  const adapter = openaiAdapter({ endpoint: '/api/ai', model: models[0] });
  return ({ api }) =>
    createAiHarness(api, ({ builtIn }) => ({
      primary: 'lead',
      agents: Object.values(builtIn).map((agent) =>
        agent.id === 'lead'
          ? directLlmRunner({
              ...agent,
              instructions: (ctx, p) => `${agent.instructions?.(ctx, p) ?? ''}\n${INSTRUCTIONS}`,
              tools: (ctx, p) => [...(agent.tools?.(ctx, p) ?? []), ...unheldTools(api)],
              adapter,
            })
          : directLlmRunner({ ...agent, adapter }),
      ),
      models: models.length > 1 ? models.map((id) => ({ id, label: id })) : undefined,
      // The chips' icon has no React tree to render into (AG Studio's own AiAssistantPanel
      // harness builds this DOM), so each uses `{ url, mask: true }` — Studio's own documented
      // icon option, which paints the SVG as a `mask-image` in the chip's text colour — instead of
      // the globals.css `::before`-mask technique the Send button below needs (that button has no
      // configurable icon option at all, not even this one). calendar-clock.svg is the exact same
      // shape as icons.tsx's SOURCE_ICON_NODES.estimate, so the "release date" idea reads as one
      // icon everywhere it appears, not two similar-looking ones.
      promptStarters: [
        { label: 'what can you do today?', prompt: 'For each held payment, tell me the next step and do the ones you can.', icon: { url: '/icons/list-checks.svg', mask: true } },
        { label: 'when do i get paid?', prompt: 'When should each held payment be released, and why?', icon: { url: '/icons/calendar-clock.svg', mask: true } },
      ],
    }));
}
