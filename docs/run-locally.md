# Run locally

Requires Node.js 20.9 or later.

```bash
npm install
cp env.example .env.local   # then paste the sandbox values below into it
npm run seed
npm run dev
```

With these credentials the PayPal side works. The buyer emails, drafts and the assistant also need Gmail and `AI_API_KEY`; the hosted demo has all of them. With your own PayPal sandbox app, run `npm run seed -- --fresh` to create new orders. Gmail evidence is optional and needs your own OAuth client and mailbox.

## Sandbox test credentials

| What | Value |
|---|---|
| PayPal sandbox client ID | `AaLBuM7uCdXwGHpfW0k2C8vJLd_LTW0cb8MuHvW2yD-rIs_di6E5-rTZsbET1r2vA9bKrct1naKTQqdj` |
| PayPal sandbox client secret | `EPItWsBRKKfLp69vA_j7zxEg1tsaPjM_AaFnu8YWJfUlU0H9Ciq8DuYheX1mUcg_da0du2z2DMTB9suR` |
| PayPal sandbox merchant email | `sb-47yi3w53561496@business.example.com` |
| PayPal sandbox test card | `4032039317984658`, expiry `2030-12`, CVV `123` |
