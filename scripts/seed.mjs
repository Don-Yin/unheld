// Seeds the sandbox orders and demo Gmail mail that data/holds.json points at. `npm run seed`
// reads .env.local or the environment; `--fresh` creates new orders in your own sandbox.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gmail, paypal } from '../lib/api-clients.mjs';
export { gmail }; // The runner and video recorder use the same explicit-env client.

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

// A new order per fixture, kept in memory, for the demo reset (a tracker cannot be removed).
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

export async function seedMail(env) {
  for (const m of DEMO_MAIL) {
    const addr = (a) => (a === 'me' ? env.GMAIL_TEST_ADDRESS : a);
    // Keyed by the other party's address, so a changed buyer never matches an old message. The
    // address's '@' becomes '.' because Gmail replaces a Message-ID with two '@' signs.
    const other = ((m.from === 'me' ? m.to : m.from).match(/<(.+)>/)?.[1] ?? addr(m.from === 'me' ? m.to : m.from)).replace('@', '.');
    const msgId = `<unheld-demo-${m.id}-${other}@unheld.local>`;
    if ((await gmail(env, `messages?q=${encodeURIComponent(`rfc822msgid:${msgId}`)}&includeSpamTrash=true`)).messages) continue;
    const raw = Buffer.from([`From: ${addr(m.from)}`, `To: ${addr(m.to)}`, `Subject: ${m.subject}`, `Message-ID: ${msgId}`,
      `Date: ${new Date(Date.now() - 3_600_000).toUTCString()}`, 'Content-Type: text/plain; charset=utf-8', '', m.body].join('\r\n')).toString('base64url');
    await gmail(env, 'messages?internalDateSource=dateHeader', { method: 'POST', body: JSON.stringify({ raw, labelIds: m.labels }) });
    console.info('seeded mail for %s', m.id);
  }
}

// Clears every fixture's orderId, so your own sandbox creates its own orders.
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
