# How it works

- **Calendar gantt.** One row per held payment, with the creator's avatar, amount, paid-by estimate and a hold bar. A dashed bar previews the shorter wait if tracking is added. Phones show a days-left list.
- **Evidence timeline.** Each fact below the calendar is labelled `paypal`, `simulated`, `gmail`, `you` or `estimate`.
- **Assistant.** Three tools, `get_hold_evidence`, `add_tracking` and `draft_buyer_reply`. Tracking writes to the sandbox order. Gmail drafts stay unsent until the creator sends them.
- **Release estimates.** Computed from today under three rules: about 1 day after confirmed delivery, 7 days after the creator marks a digital service complete, or 21 days at the latest. The recorded video shows Maya 13 Nov, Tom about 9 Nov and Priya 27 Nov.
- **Holds are simulated** and labelled, because the PayPal sandbox never withholds money. Dates are estimates.

## AG Studio

The calendar ([`app/studio/gantt-widget.tsx`](../app/studio/gantt-widget.tsx)) is AG Grid inside a custom AG Studio widget. The evidence widget ([`evidence-widget.tsx`](../app/studio/evidence-widget.tsx)) adds source badges and a crossfade between payments. Both use the app's Tailwind tokens ([`theme.ts`](../app/studio/theme.ts)). The three tools in [`ai.ts`](../app/studio/ai.ts) ground Studio's built-in assistant in PayPal sandbox and Gmail evidence.
