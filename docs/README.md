# Docs

| What | Link |
|---|---|
| Demo video (2:58) | <https://youtu.be/3JerLuNG0JU> |
| Devpost project | <https://devpost.com/software/unheld> |
| Hosted demo (access code in the Devpost testing instructions) | <https://unheld.onrender.com> |
| How it works, and how it uses AG Studio | [`how-it-works.md`](how-it-works.md) |
| Run locally, with sandbox credentials | [`run-locally.md`](run-locally.md) |
| Workbench screenshot | [`screenshot.png`](screenshot.png) |
| Research: why held payments | [`research/`](research/README.md) |
| Privacy | [`../PRIVACY.md`](../PRIVACY.md) |
| Licence (MIT) | [`../LICENSE`](../LICENSE) |

## Where the code is

| Path | What it does |
|---|---|
| [`app/studio/gantt-widget.tsx`](../app/studio/gantt-widget.tsx) | Calendar gantt, a raw AG Grid registered as a custom AG Studio widget |
| [`app/studio/evidence-widget.tsx`](../app/studio/evidence-widget.tsx) | Evidence timeline with source badges and the next action |
| [`app/studio/ai.ts`](../app/studio/ai.ts) | The assistant's instructions and its three tools |
| [`app/studio/theme.ts`](../app/studio/theme.ts) | AG Studio and AG Grid themes from the app's design tokens |
| [`lib/load-holds.ts`](../lib/load-holds.ts) | Builds each hold and its evidence from PayPal, Gmail and the fixtures |
| [`lib/demo-reset.ts`](../lib/demo-reset.ts) | Fresh demo state after 15 idle minutes; a sign-in during use joins the same demo |
| [`lib/ai/`](../lib/ai/) | Model provider, request guard and limits |
| [`data/holds.json`](../data/holds.json) | The three simulated holds |
| [`scripts/seed.mjs`](../scripts/seed.mjs) | Seeds the sandbox orders and demo Gmail mail |
