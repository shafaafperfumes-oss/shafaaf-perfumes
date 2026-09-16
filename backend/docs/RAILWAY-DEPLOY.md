# Putting the Backend Online (Railway) — Step by Step

Right now the backend only runs on your own computer. That means nobody
else can reach it: the website cannot load products from it, and Razorpay
cannot tell it when someone has paid.

**Deploying** means giving it a permanent web address of its own, like
`https://shafaaf-api.up.railway.app`, that stays running even when your
computer is off.

We are using **Railway**. Nothing in this guide costs money to try —
Railway gives new accounts free credit, and you can stop any time.

**Golden rule, same as always: secrets go into Railway's own Variables
screen — never into a chat message, a screenshot, or GitHub.**

---

## Before you start

You already have everything needed:

- the code on GitHub ✅
- the database on Supabase ✅ (Railway does **not** replace it — the same
  Supabase database keeps all your data)
- Razorpay keys — optional; the site deploys fine without them, payments
  simply stay switched off until you add them

---

## Step 1 — Create the Railway project

1. Go to [railway.com](https://railway.com) and sign up with your
   **GitHub** account (easiest — it can then see your repository).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Choose the `shafaaf-perfumes` repository.

Railway will immediately try to build and fail. That is expected — it is
looking in the wrong folder. Step 2 fixes that.

## Step 2 — Tell Railway how to run the backend

Our repository holds the website *and* the backend, so Railway needs to
know which folder to build and how to run it. Open the service →
**Settings** and fill these in. The list on the right-hand side jumps
between sections; each value has a small "+" button to click before you
can type.

**Source**

| Setting | Value |
|---|---|
| Root Directory | `backend` |

**Build**

| Setting | Value |
|---|---|
| Custom Build Command | `npm run build` |

**Deploy**

| Setting | Value |
|---|---|
| Custom Start Command | `npm start` |
| Pre-deploy Command | `npm run db:migrate:prod` |
| Healthcheck Path | `/api/v1/health` |
| Restart Policy | On Failure |

The three that matter most: **Root Directory** (without it Railway looks
in the wrong folder and finds only the website's HTML), **Pre-deploy
Command** (this is what applies database migrations before each new
version starts) and **Healthcheck Path** (Railway only switches traffic to
a new version once this answers).

Skip the **Config-as-code** section entirely, and do not click "Add File
Path" there. Railway retired that mechanism for services created after
August 2026, which is why these settings live in the dashboard rather
than in a file in the repository.

## Step 3 — Add the environment variables

Open the service → **Variables** → **Raw Editor**, and add these. The
values are the same ones already in your `backend\.env` file on your
computer — copy them across.

| Variable | Where it comes from |
|---|---|
| `NODE_ENV` | type `production` |
| `DATABASE_URL` | Supabase pooled connection string (port **6543**) |
| `DIRECT_URL` | Supabase direct connection string (port **5432**) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Supabase → Settings → API |
| `CORS_ALLOWED_ORIGINS` | your website's address (see Step 5) |
| `RAZORPAY_KEY_ID` | Razorpay dashboard — optional for now |
| `RAZORPAY_KEY_SECRET` | **Secret.** Optional for now |
| `RAZORPAY_WEBHOOK_SECRET` | **Secret.** Optional for now |

**Do not add `PORT`.** Railway sets that itself, and the backend already
reads whatever Railway gives it.

If you leave the Razorpay ones out, everything still works — orders get
placed, they just cannot be paid for yet.

## Step 4 — Give it a web address

Service → **Settings** → **Networking** → **Generate Domain**.

You will get something like `shafaaf-perfumes-production.up.railway.app`.
That is your backend's permanent address. Write it down — the next steps
use it.

## Step 5 — Tell the backend which website may call it

The backend refuses requests from any website not on its allow-list, so
that nobody else's site can use your API.

Go back to **Variables** and set `CORS_ALLOWED_ORIGINS` to your website's
address, for example:

```
https://shafaafperfumes.com
```

More than one is fine, separated by commas and no spaces:

```
https://shafaafperfumes.com,https://www.shafaafperfumes.com
```

Railway redeploys automatically when you change a variable.

## Step 6 — Point Razorpay's webhook at it

Only once you have done the Razorpay setup
([`RAZORPAY-SETUP.md`](RAZORPAY-SETUP.md)). In the Razorpay dashboard,
the webhook URL is now a real address instead of a placeholder:

```
https://<your-railway-domain>/api/v1/webhooks/razorpay
```

This is the step that lets a payment actually mark an order as paid.

## Step 7 — Check it is working

Open these two in a browser:

- `https://<your-railway-domain>/api/v1/health` — should say `"status":"ok"`
- `https://<your-railway-domain>/api/v1/ready` — should say `"ready":true`
  and `"database":"ok"`
- `https://<your-railway-domain>/api/v1/products` — should list your
  fragrances

If all three work, the backend is live.

---

## What happens every time we push code

Railway watches the GitHub repository. On every push to `main` it will:

1. install and build the backend,
2. **apply any new database migrations** (the Pre-deploy Command from
   Step 2) — so the database schema never falls behind the code,
3. start the new version, and only switch traffic over once
   `/api/v1/health` answers,
4. give the old version time to finish any request already in progress,
   so nobody gets cut off mid-checkout.

If the build or the migration fails, Railway keeps the **old working
version** running. A bad deploy takes the site down only if you ignore
the red build and push more on top of it.

## Safety notes

- **The database is still Supabase.** Railway only runs the code. If you
  ever delete the Railway project, no data is lost.
- **Secrets live only in Railway's Variables screen**, never in the repo.
  `.env` stays on your computer and is git-ignored.
- **The service-role key is the dangerous one** — it bypasses every
  database rule. It belongs on the server only, never in the website's
  code or in a screenshot.
- Railway's logs are readable in the dashboard. The backend deliberately
  strips passwords, tokens, card data and signatures out of its logs
  before writing them.

## If something goes wrong

| What you see | What it usually means | What to do |
|---|---|---|
| Build fails immediately, "no package.json" | Root Directory is not set | Step 2 |
| Build succeeds but deploy fails on health check | A variable is missing or wrong — most often `DATABASE_URL` | Check Step 3, then read the deploy logs |
| `"ready":false` with `"database":"error"` | Wrong `DATABASE_URL`, or Supabase project paused | Open Supabase and check the project is awake |
| Website says "blocked by CORS" | Website address not in `CORS_ALLOWED_ORIGINS` | Step 5 — it must match exactly, including `https://` |
| Orders never become `paid` | Razorpay webhook URL wrong or not set | Step 6; Razorpay's dashboard shows every webhook attempt |
| Deploy log stops at "db:migrate" | `DIRECT_URL` missing — migrations need the port-5432 connection | Step 3 |
| Log says `Missing script: db:migrate:pro` (or similar) | A command in Step 2 was typed with a letter missing | Re-check the Pre-deploy / Start / Build commands character by character |
| Deploy shows the website's HTML instead of JSON | Root Directory is not set, so Railway served the site folder | Step 2 |
