// Seeds the sandbox PayPal orders and demo Gmail mail that data/holds.json's held-payment
// fixtures point at. Run with `npm run seed` (reads env from .env.local, Next's own convention,
// or from the process environment). `--fresh` clears every fixture's orderId first, so seedOrders
// creates brand new sandbox orders in your own sandbox instead of reusing ids seeded elsewhere.
//
// Also imported (not re-implemented) by experiments/exp_002_unheld_workbench/run.mjs and
// docs/video/unheld-demo/record.mjs in the private working repo, so this is the single home for
// both the seeding logic and the Gmail REST helper it shares with run.mjs's own checks.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURES = join(APP, 'data', 'holds.json');

export async function loadEnv() {
  const envLocal = join(APP, '.env.local');
  let fileEnv = {};
  if (existsSync(envLocal)) {
    const text = await readFile(envLocal, 'utf8');
    fileEnv = Object.fromEntries(
      text.split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    );
  }
  return { ...fileEnv, ...process.env };
}

async function paypal(env, method, path, body) {
  const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const tok = await (await fetch(`${env.PAYPAL_API_BASE}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${auth}` }, body: new URLSearchParams({ grant_type: 'client_credentials' }) })).json();
  const res = await fetch(`${env.PAYPAL_API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': crypto.randomUUID() },
    body: body && JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`paypal ${path} ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

async function readHolds() {
  try {
    return JSON.parse(await readFile(FIXTURES, 'utf8'));
  } catch (e) {
    throw new Error(`cannot read hold fixtures ${FIXTURES}: ${e.message}`);
  }
}

async function createOrder(env, h) {
  const order = await paypal(env, 'POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ reference_id: h.id, description: `${h.item} (test)`, amount: { currency_code: 'GBP', value: h.amount } }],
    payment_source: {
      card: {
        number: env.PAYPAL_TEST_CARD, expiry: env.PAYPAL_TEST_CARD_EXPIRY, security_code: env.PAYPAL_TEST_CARD_CVV, name: h.buyer,
        billing_address: { address_line_1: '1 Test St', admin_area_2: 'London', postal_code: 'SW1A 1AA', country_code: 'GB' },
      },
    },
  });
  if (order.status !== 'COMPLETED') throw new Error(`order for ${h.id} is ${order.status}`);
  return order.id;
}

// One real sandbox card payment per fixture without an order. Idempotent: seeded ids are kept.
export async function seedOrders(env) {
  const holds = await readHolds();
  for (const h of holds.filter((h) => !h.orderId)) {
    h.orderId = await createOrder(env, h);
    console.info('seeded %s -> order %s', h.id, h.orderId);
  }
  await writeFile(FIXTURES, `${JSON.stringify(holds, null, 2)}\n`);
  return holds.map(({ id, orderId }) => ({ id, orderId }));
}

// A fresh sandbox order per fixture, always (never skipping one that already has an order),
// returned in memory only - never written to data/holds.json. Used by the running app's demo
// reset (lib/demo-reset.ts): a tracker, once added to a sandbox order, cannot be removed (lib/
// paypal.ts has no untrack call), so the only way to give the next judge Tom's untracked "18 days
// sooner" moment back is a brand new order, not the one seedOrders already keeps. Render's disk is
// ephemeral, so a write here would not survive a restart any better than seedOrders' own write
// does (see clearOrderIds below) - a fresh process must reach a clean state without reading
// anything back off disk.
export async function freshOrderIds(env) {
  const holds = await readHolds();
  const ids = {};
  for (const h of holds) {
    ids[h.id] = await createOrder(env, h);
    console.info('reset %s -> order %s', h.id, ids[h.id]);
  }
  return ids;
}

// The demo buyer mail, put straight into the test mailbox with messages.insert (gmail.insert scope):
// nothing is sent. Maya confirms receipt; the creator's sent note to Tom carries a Royal Mail number.
const DEMO_MAIL = [
  { id: 'H1', from: 'Sam Ellis <sam.ellis@example.com>', to: 'me', labels: ['INBOX', 'UNREAD'], subject: 'Re: your portrait',
    body: 'Hi! I received the final portrait yesterday and I love it. Thank you so much!\n\nSam' },
  { id: 'H2', from: 'me', to: 'Jordan Blake <jordan.blake@example.com>', labels: ['SENT'], subject: 'Your enamel pins are on the way',
    body: 'Hi Jordan,\n\nYour pin set went out today with Royal Mail Tracked 48. Tracking number: RM482913576GB.\n\nThanks for your order!' },
];

let gmailToken;
// Shared Gmail REST helper, env explicit (not read internally) so every caller — seedMail here,
// and run.mjs's own draft cleanup/listing checks — uses the same env it was already given.
export async function gmail(env, path, init) {
  const tok = gmailToken ??= await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET, refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }) })).json();
  if (!tok.access_token) throw new Error(`gmail token: ${tok.error}`);
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { ...init, headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' } });
  const json = res.status === 204 ? {} : await res.json();
  if (!res.ok) throw new Error(`gmail ${path.split('?')[0]} ${res.status}: ${json.error?.message}`);
  return json;
}

export async function seedMail(env) {
  for (const m of DEMO_MAIL) {
    const addr = (a) => (a === 'me' ? env.GMAIL_TEST_ADDRESS : a);
    // Keyed by the other party's address, not just the hold id: when data/holds.json's buyer
    // changes (task 00-demo-reset's follow-up, Maya/Tom/Priya becoming creators), the old
    // buyer's message has a different address and so is simply never matched here again - it is
    // left behind in the mailbox (messages.trash needs a scope this token does not have, confirmed
    // 403), but mailWith(buyerEmail) only ever reads mail to/from the *current* buyer, so it is
    // never shown as evidence either.
    // A Message-ID header may have only one '@' (RFC 5322); Gmail's own insert silently replaces a
    // malformed one with a generated id, which breaks the rfc822msgid dedupe check below without
    // any error - it looked idempotent locally and only showed up as a duplicate evidence row
    // (paypal-challenge peer review). The buyer's address already has an '@', so it is folded into
    // a '.' here to keep the whole id to exactly one.
    const other = ((m.from === 'me' ? m.to : m.from).match(/<(.+)>/)?.[1] ?? addr(m.from === 'me' ? m.to : m.from)).replace('@', '.');
    const msgId = `<unheld-demo-${m.id}-${other}@unheld.local>`;
    if ((await gmail(env, `messages?q=${encodeURIComponent(`rfc822msgid:${msgId}`)}&includeSpamTrash=true`)).messages) continue;
    const raw = Buffer.from([`From: ${addr(m.from)}`, `To: ${addr(m.to)}`, `Subject: ${m.subject}`, `Message-ID: ${msgId}`,
      `Date: ${new Date(Date.now() - 3_600_000).toUTCString()}`, 'Content-Type: text/plain; charset=utf-8', '', m.body].join('\r\n')).toString('base64url');
    await gmail(env, 'messages?internalDateSource=dateHeader', { method: 'POST', body: JSON.stringify({ raw, labelIds: m.labels }) });
    console.info('seeded mail for %s', m.id);
  }
}

// Clears every fixture's orderId, so a fresh sandbox (your own PAYPAL_CLIENT_ID/SECRET) creates
// its own new orders instead of reusing ids seeded against someone else's sandbox.
async function clearOrderIds() {
  const holds = await readHolds();
  for (const h of holds) delete h.orderId;
  await writeFile(FIXTURES, `${JSON.stringify(holds, null, 2)}\n`);
}

export async function main() {
  const { values } = parseArgs({ options: { fresh: { type: 'boolean', default: false } } });
  const env = await loadEnv();
  if (values.fresh) await clearOrderIds();
  const orders = await seedOrders(env);
  if (env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN) {
    await seedMail(env);
  } else {
    console.info('skipping seedMail: no Gmail OAuth env set');
  }
  console.info('seeded orders', orders);
}

// Imports never run the script. Only a direct `node scripts/seed.mjs` invocation does.
const invoked = process.argv[1];
if (invoked && existsSync(invoked) && realpathSync(invoked) === realpathSync(fileURLToPath(import.meta.url))) {
  await main();
}
