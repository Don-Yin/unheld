<p align="center"><img src="docs/banner.png" alt="unheld" width="100%"></p>

Unheld is a workbench for an independent creator whose PayPal payment is held. It reads the
creator's held payments into one grid, shows the evidence for the selected payment next to it
(the PayPal order and tracker, and the creator's own Gmail thread with the buyer where available),
and estimates when the money arrives against PayPal's release rules. An AI assistant can explain a
hold, add a shipment tracker, or draft (never send) a buyer reply.

![Unheld workbench](docs/screenshot.png)

## Demo

- Hosted: `<TO FILL: Render URL>`. The access code is given in the Devpost testing instructions.
- Video: `<TO FILL: YouTube URL>`

## How it works

- One AG Studio grid of held payments, each with a next step and an estimated release date.
- An evidence widget next to the grid, every line labelled by source: PayPal, Gmail, simulated hold, or policy estimate.
- An AI assistant with three tools: `get_hold_evidence`, `add_tracking`, and `draft_buyer_reply`, which never sends.
- Release dates follow PayPal's published hold-release rules: about 1 day after delivery, 7 days after a service is marked complete, or within 21 days.
- Holds are simulated, because the PayPal sandbox never withholds money; the interface marks them as such.

## How it uses AG Studio

I built a custom evidence widget, `app/studio/evidence-widget.tsx`, with source badges and a crossfade between payments. I fed our own Tailwind tokens into Studio's theme in `app/studio/theme.ts`. I wired three custom tools into Studio's built-in assistant in `app/studio/ai.ts`: `get_hold_evidence`, `add_tracking`, and `draft_buyer_reply`. The assistant answers "when do I get paid?" per payment from real PayPal and Gmail evidence.

## Run locally

Requires Node.js 20.9 or later.

```bash
npm install
cp env.example .env.local   # then paste the sandbox values below into it
npm run seed
npm run dev
```

With the sandbox credentials below, this works as is. With your own PayPal sandbox app, run
`npm run seed -- --fresh` to seed new orders instead of reusing these ones. Gmail evidence is
optional and needs your own OAuth client and mailbox.

## Sandbox test credentials

| What | Value |
|---|---|
| PayPal sandbox client ID | `AaLBuM7uCdXwGHpfW0k2C8vJLd_LTW0cb8MuHvW2yD-rIs_di6E5-rTZsbET1r2vA9bKrct1naKTQqdj` |
| PayPal sandbox client secret | `EPItWsBRKKfLp69vA_j7zxEg1tsaPjM_AaFnu8YWJfUlU0H9Ciq8DuYheX1mUcg_da0du2z2DMTB9suR` |
| PayPal sandbox merchant email | `sb-47yi3w53561496@business.example.com` |
| PayPal sandbox test card | `4032039317984658`, expiry `2030-12`, CVV `123` |

## Licence

MIT for this code and its two icons (`LICENSE`). AG Grid and AG Studio are npm dependencies under
their own commercial licence; without a licence key, a trial watermark shows.

## Privacy

See [`PRIVACY.md`](PRIVACY.md).
