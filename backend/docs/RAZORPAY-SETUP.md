# Razorpay Setup — Step by Step

This connects the backend to Razorpay so a placed order can actually be
paid for. **The backend already works without this** — orders still get
created and stock still gets reserved; they just stay `pending_payment`
with no way to pay until these values are set.

**Golden rule stays the same: these values go into `backend/.env` on your
computer only — never into a chat message, screenshot, or GitHub.**

You can do this whenever you are ready — there is no rush, and nothing
breaks in the meantime.

---

## Step 1 — Create a Razorpay account

1. Go to [razorpay.com](https://razorpay.com) and sign up (or sign in) as
   a business.
2. You do **not** need to finish full business verification to start
   testing — Razorpay gives every account a **Test Mode** that uses fake
   card numbers and never moves real money. Build and test everything in
   Test Mode first; switch to Live Mode only when you are ready to accept
   real payments.

## Step 2 — Copy the API keys

1. In the Razorpay Dashboard, make sure the **Test Mode** switch (top of
   the page) is on.
2. Go to **Settings → API Keys**.
3. Click **Generate Test Key** (if you have not already). You will see
   two values:

| Value | What it is |
|---|---|
| Key Id | Not a secret — starts with `rzp_test_...` |
| Key Secret | **Secret — shown only once. Copy it immediately.** |

If you lose the Key Secret, you can always generate a new pair — there is
no limit.

## Step 3 — Put the keys in `.env`

Open `backend\.env` in Notepad. Find these lines:

```
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
```

Paste the Key Id after `RAZORPAY_KEY_ID=` and the Key Secret after
`RAZORPAY_KEY_SECRET=` — no spaces, no quotes. Save the file.

## Step 4 — Set up the webhook

This is the step that lets Razorpay tell our server "this order was
actually paid for." Without it, a payment could succeed in the customer's
browser but our own order would never know.

1. In the Dashboard, go to **Settings → Webhooks → Add New Webhook**.
2. **Webhook URL**: `https://<your-deployed-backend-domain>/api/v1/webhooks/razorpay`
   — while you are only testing locally and have not deployed yet, you can
   skip this step and come back to it once the backend has a real web
   address (a tool like [ngrok](https://ngrok.com) can also give a
   temporary public URL to a server running on your own computer, if you
   want to test webhooks before deploying).
3. **Active events**: tick **`payment.captured`** (that is the only one
   this phase reacts to; every other event is safely accepted and ignored).
4. Razorpay will show you a **Webhook Secret** when you save — copy it.

Open `backend\.env` again and paste it after:

```
RAZORPAY_WEBHOOK_SECRET=
```

Save the file.

## Step 5 — Test it

In a terminal, from the `backend` folder:

```bash
npm test
```

Tests that need the webhook secret (previously shown as "skipped") should
now run and pass — they simulate a signed webhook call the same way
Razorpay would send one, and check that it correctly marks a test order
paid and reduces stock, ignores a repeated delivery of the same event, and
rejects one with a wrong signature.

---

## What this unlocks

- `POST /api/v1/checkout/place` now also asks Razorpay for a payment and
  returns it alongside the order, so the frontend can open Razorpay's
  checkout widget.
- `POST /api/v1/orders/:id/pay` lets the frontend retry getting a payment
  for an order that already exists but was not paid yet (for example, if
  the customer closed the payment popup).
- `POST /api/v1/webhooks/razorpay` is the only thing in the whole API
  allowed to mark an order `paid` and turn its stock reservation into a
  real stock decrease — never the browser's own "payment succeeded"
  message, which can be faked or can fail to arrive.

## Safety notes

- **The webhook secret is not the same as the Key Secret** — it is a
  separate value from the Webhooks page, used only to prove a request
  really came from Razorpay.
- **A webhook with a missing or wrong signature is always rejected**,
  before any of its contents are even read.
- **The same webhook delivery is never applied twice** — Razorpay retries
  automatically until it gets a success response, and each delivery's own
  id is recorded so a retry is safely ignored the second time.
- **Card details never touch this server** — the browser talks to
  Razorpay directly for the actual payment; this backend only ever sees
  an order id and a payment id.

## If something goes wrong

| Message | What it means | What to do |
|---|---|---|
| `payment: null` after placing an order | `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are blank, or Razorpay's API call failed | Re-check Step 3; call `POST /api/v1/orders/:id/pay` to retry once fixed |
| Payment tests still show "skipped" | `RAZORPAY_WEBHOOK_SECRET` is blank | Re-check Step 4 |
| An order never moves to `paid` even though the customer paid | The webhook URL is wrong, or the webhook is not reaching your server yet (e.g. still only running locally) | Re-check Step 4; Razorpay's Dashboard also shows a log of every webhook attempt and whether it got a 200 back |
