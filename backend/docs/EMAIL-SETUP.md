# Email Setup (Resend) — Step by Step

This lets the backend send email. Today it sends exactly one kind: an
alert to you, the shop owner, the moment a customer's payment goes
through — what they bought, how much they paid, and where to ship it.

**The backend already works without this** — orders are saved and stock
is committed either way. The alert is a convenience so you do not have to
keep refreshing the admin page.

**Golden rule stays the same: the API key goes into Railway's Variables
screen only (or `backend/.env` on your computer) — never into a chat
message, screenshot, or GitHub.**

---

## Why Resend

- Free plan: 3,000 emails a month, 100 a day — far more than a shop's
  order alerts will ever need.
- One API key, one web request per email, nothing to install.
- Works **before** you own a domain. Resend gives every account a shared
  sender address (`onboarding@resend.dev`) that can deliver to **one
  inbox only: the email address you signed up to Resend with.** That is
  exactly what an owner alert needs, so sign up with the inbox you want
  the alerts in.

Once `shafaafperfumes.com` is yours, verifying it in Resend (Step 5)
unlocks sending from `orders@shafaafperfumes.com` to *anyone* — which is
what customer order confirmations will need later.

## Step 1 — Create a Resend account

1. Go to [resend.com](https://resend.com) and sign up **with the email
   address that should receive the order alerts** (for Shafaaf that is
   `shafaafperfumes@gmail.com`).
2. Confirm the sign-up email Resend sends you.

## Step 2 — Create an API key

1. In the Resend dashboard, open **API Keys** in the left menu.
2. Click **Create API Key**.
3. Name: `shafaaf-backend`. Permission: **Sending access** (it needs
   nothing more). Domain: **All domains**.
4. Click **Add**. The key (starts with `re_`) is **shown only once** —
   copy it now. If you lose it, delete it and create a new one; there is
   no limit.

## Step 3 — Add the variables to Railway

Open the backend service on Railway → **Variables**, and add:

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | the `re_...` key from Step 2 — **secret** |
| `ORDER_ALERT_EMAIL` | the inbox for alerts, e.g. `shafaafperfumes@gmail.com` |

Leave `EMAIL_FROM` unset for now — the backend then uses Resend's shared
`onboarding@resend.dev` sender, which is the only one that works before
Step 5.

Railway redeploys automatically. When it is up, open
`https://<your-backend>/api/v1/ready` in a browser: `orderAlerts` should
say `"ok"`. (This only confirms both variables are present — it never
shows their values.)

Testing on your own computer instead: put the same two lines in
`backend/.env` and restart `npm run dev`.

## Step 4 — Check it works

Place a test order on the website and pay it in Razorpay **Test Mode**
(Netbanking → any bank → Success). Within a few seconds an email titled
**"New paid order SHF-…"** should arrive in the alert inbox. If it does
not, see Troubleshooting below.

## Step 5 — Later: send from your own domain

Do this once `shafaafperfumes.com` is yours. Until then, skip it.

1. Resend dashboard → **Domains** → **Add Domain** → enter
   `shafaafperfumes.com`.
2. Resend shows a few DNS records (TXT / MX / CNAME). Add each one in
   Cloudflare → your domain → **DNS** → **Add record**, copying the name
   and value exactly. Set the Cloudflare proxy toggle **off** (grey
   cloud) for these records.
3. Back in Resend, click **Verify**. It can take a few minutes.
4. On Railway, add `EMAIL_FROM` = `Shafaaf Perfumes <orders@shafaafperfumes.com>`.

After this the shop can email customers too — that is a separate,
later step in the code, not something this switch turns on by itself.

## What the code does with this

- `src/lib/email.ts` — the one place that talks to Resend. Reads the key
  from the environment, never logs it.
- `src/services/order-alerts.ts` — builds the alert and sends it. Called
  from the Razorpay webhook only *after* the order is marked paid and its
  stock committed, and only the first time an order becomes paid — a
  retried webhook never sends a second alert.
- A failed send (Resend down, key revoked) is written to the logs and
  otherwise ignored: the order is already safe in the database, and the
  admin page always shows it.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/ready` says `orderAlerts: "not-configured"` | One of the two variables is missing or blank | Re-check Step 3 (watch for a trailing space) |
| No email, Railway logs show `order alert email failed` with "only send testing emails to your own email address" | Resend's shared sender can only reach the account's own inbox | Set `ORDER_ALERT_EMAIL` to the address you signed up to Resend with, or finish Step 5 |
| Logs show `API key is invalid` | The key was deleted, or pasted with a typo | Create a new key (Step 2) and update Railway |
| Logs show `order alert sent` but nothing in the inbox | Delivered but filtered | Check Spam / Promotions; mark it "Not spam" once |
| Email arrives without the "Open in store admin" button | `CORS_ALLOWED_ORIGINS` has no public website URL yet | Add the website's `https://…` origin to it (already the case once the site is live) |
