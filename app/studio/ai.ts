// The assistant is AG Studio's own harness and agents. Unheld changes one thing: the lead agent gets
// instructions about holds and three tools that act through this app's API. The adapter calls
// /api/ai/responses, which holds the model key, so nothing secret reaches the browser.

import { createAiHarness, directLlmRunner, type AgAiHarnessSetup, type AgAiTool, type AgStudioApi } from 'ag-studio';
import { RELEASE_RULES } from '@/lib/holds';
import { openaiAdapter } from './openai-adapter';
import { holdsStore, runAction } from './store';

const INSTRUCTIONS = `
You work for an independent creator whose PayPal payments are on hold. Your job is to get each payment released.
For each hold: read its evidence (get_hold_evidence), decide the next step, and say when the money should arrive.
Call add_tracking or draft_buyer_reply only when the creator asks you to act (for example "what can you do today?" or "do it"); for a question such as "when do i get paid?", answer and name the step you would take.
- Physical item with a tracking number found in Gmail and no tracker yet: call add_tracking.
- Digital item with no buyer confirmation: call draft_buyer_reply. It saves a Gmail draft; it never sends.
- Digital item the buyer confirmed: tell the creator to mark the order completed in PayPal. Only they can; there is no API.
Release rules (PayPal help article help129): about ${RELEASE_RULES.afterDelivery} day after confirmed delivery, about ${RELEASE_RULES.afterCompleted} days after the order is marked completed, otherwise within ${RELEASE_RULES.longest} days of the payment.
Write every date as its day and short month in English, year only if it is not 2026 (for example "10 Nov") — never the raw ISO date a tool returns.
Be exact about sources: write each fact on its own line or bullet, starting that line with one inline code tag and nothing before it \u2014 never place a tag mid-sentence, and never repeat a tag on the same line. Use \`estimate\` for a release date, \`gmail\` for buyer mail, \`paypal\` for order or payment state, \`you\` for a step only the creator can take, \`simulated\` for the hold itself (for example "\`estimate\` about 8 Nov"). The holds are simulated because the PayPal sandbox never withholds money. Adding a tracker is not a release, and a release date is an estimate, not a PayPal promise.
Keep replies short and in plain words. Use lowercase labels when you add widgets.`;

function unheldTools(api: AgStudioApi): AgAiTool[] {
  const holdIds = () => holdsStore.get()?.holds.map((h) => h.id) ?? [];
  const act = runAction;
  return [
    api.defineAiTool({
      name: 'get_hold_evidence',
      description: 'Every held payment with its next step, estimated release date and evidence timeline (sources: simulated, paypal, gmail, you, estimate).',
      params: (s) => s.object({}),
      execute: (_args, ctx) => {
        const data = holdsStore.get();
        return data ? ctx.success(JSON.stringify(data)) : ctx.error('holds are still loading');
      },
    }),
    api.defineAiTool({
      name: 'add_tracking',
      description: 'Attach a shipment tracking number to the PayPal order of a held physical payment. Real PayPal sandbox call.',
      params: (s) => s.object({ holdId: s.enum(holdIds), trackingNumber: s.string(), carrier: s.string() }),
      execute: async ({ holdId, trackingNumber, carrier }, ctx) => {
        const r = await act(holdId, 'track', { trackingNumber, carrier: carrier || 'ROYAL_MAIL' });
        return r.ok ? ctx.success(`tracker added to PayPal order ${r.orderId}`, r) : ctx.error(String(r.error));
      },
    }),
    api.defineAiTool({
      name: 'draft_buyer_reply',
      description: "Save a reply to the buyer as a draft in the creator's Gmail. Never sends. Leave body empty for the standard request to confirm receipt.",
      params: (s) => s.object({ holdId: s.enum(holdIds), body: s.string() }),
      execute: async ({ holdId, body }, ctx) => {
        const r = await act(holdId, 'draft', { body });
        return r.ok ? ctx.success(`draft ${r.draftId} saved for ${r.to}; the creator must send it`, r) : ctx.error(String(r.error));
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
