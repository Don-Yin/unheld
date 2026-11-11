# <img src="public/brand-mark.svg" width="28" alt=""> Privacy: unheld (demo)

Unheld is a hackathon demo for one independent creator managing their own held PayPal payments.
It acts only on the creator's own Gmail and PayPal sandbox accounts. It has no user accounts,
no database and no analytics.

## What the app reads

- **Gmail** (`lib/gmail.ts`): the creator's own mailbox, through an OAuth refresh token the creator
  grants. For each held payment it searches messages to or from that buyer (drafts excluded) and
  fetches metadata only: From, To, Subject, date and Gmail's short snippet. It never fetches full
  message bodies or attachments.
- **PayPal** (`lib/paypal.ts`): the creator's own sandbox orders through the PayPal REST API,
  server-side only: order status, capture amount, status and time, and shipment trackers. No card
  or other payment instrument data is read.

## What the app writes

- **Gmail**: a draft reply in the creator's mailbox, only when the creator presses "create draft
  reply" or asks the assistant to act. Unheld has no send call; the creator reviews and sends the
  draft themselves. Resetting the demo, including the first sign-in after 15 idle minutes,
  deletes drafts this app created.
- **PayPal**: a shipment tracker on an existing sandbox order, only when the creator presses "add
  tracking" or asks the assistant to act. Each demo reset creates fresh paid sandbox orders; the demo never moves real money.
  Marking an order complete is a manual step the creator takes in PayPal.

## Who else receives data

- **Google** (Gmail API) and **PayPal** (sandbox API), called with the creator's own credentials.
- **The AI model provider**, only when the assistant is used. The assistant's question and the hold
  evidence it looks up (order details, Gmail metadata and snippets, estimated dates) are sent
  server-side to the configured provider (`lib/ai/provider.ts`; the demo uses OpenRouter with
  `google/gemini-2.5-flash`). That provider's own privacy terms apply to those requests. With no
  AI key set, the assistant is off and nothing is sent.
- **Render**, which hosts the demo and keeps its standard request logs.

## Storage and retention

- Credentials (Gmail token, PayPal and AI keys) live in server environment variables. The app never
  logs or persists them.
- Order and message data is fetched live per request and held in memory only. The held-payment list
  comes from a fixture seed (`data/holds.json`) paired with real sandbox orders. The holds
  themselves are simulated, because the PayPal sandbox never withholds money; the interface labels
  them as simulated.
- One cookie, `unheld_access`, remembers that a visitor entered the access code. It holds a hash of
  the code, is HttpOnly, and expires after 30 days.

## Research material

The `docs/research/` counts and the demo video draw on public posts in which sellers describe PayPal
holds. Only counts and anonymised excerpts are published: names, handles, avatars, profile photos,
links, email addresses and payment handles are removed or blurred. The raw collection of posts is
not published.

## Contact

Questions or removal requests: open an issue on this repository.
