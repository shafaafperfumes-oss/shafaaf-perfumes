# Shafaaf Perfumes — Backend API

Express + TypeScript API for the Shafaaf Perfumes storefront.
Design and roadmap: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Requirements

- Node.js 20 or newer (this project was built on Node 24 LTS)

## Setup

```bash
cd backend
npm install
cp .env.example .env
```

`.env` holds real configuration and is git-ignored — **never commit it**.
`.env.example` holds placeholders only and is safe to commit.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the API with auto-reload on http://localhost:4000 |
| `npm test` | Run the test suite |
| `npm run typecheck` | Check types without building |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build (production) |
| `npm run db:generate` | Turn `src/db/schema` changes into a new SQL migration |
| `npm run db:migrate` | Apply pending migrations to the database |
| `npm run db:migrate:prod` | The same, from the compiled build — what the host runs on deploy |
| `npm run db:seed` | Load the website's real catalog into the database |
| `npm run db:studio` | Open Drizzle Studio to browse the data |

## Database

Setting Supabase up for the first time: [`docs/SUPABASE-SETUP.md`](docs/SUPABASE-SETUP.md).

The schema lives in `src/db/schema/`, and `npm run db:generate` turns it into
versioned SQL files under `drizzle/`. Migrations are applied, never edited
after they have run anywhere.

Rules the database enforces by itself, so a code bug cannot break them:

- **Money is stored in paise as whole numbers** (₹599 → `59900`), never as a
  decimal. Prices must be greater than zero.
- **Stock can never go negative**, and reserved stock can never exceed stock
  on hand.
- **Products are deactivated, never deleted**, so past orders keep their history.
- **Row Level Security is on for every table with no public policy**, so the
  tables are unreachable through Supabase's own public API — only this backend
  can read or write them.

The catalog seed reads the website's own `js/data/products.js`, so product
names, prices and notes have exactly one source and cannot drift apart. The
seed is safe to re-run and never resets real stock counts.

## Sign-in (Supabase Auth)

Setting it up for the first time: [`docs/SUPABASE-AUTH-SETUP.md`](docs/SUPABASE-AUTH-SETUP.md).

The browser signs in directly with Supabase — this backend never sees a
password. It verifies each request's token by checking its signature
against Supabase's published public keys (no shared secret needed for
that), then reads the caller's **role from our own `profiles` table**,
never from the token — a customer cannot become an admin by editing a
token, only by the database itself saying so.

A Postgres trigger creates a `profiles` row automatically the moment
someone signs up, so the application code can never forget to.

## Cart and wishlist

Each signed-in customer has one server-side cart, created the first time
they add something. Every line remembers the price at the moment it was
added, so a later catalog price change never silently changes what a
customer already sees sitting in their cart — checkout, in a later phase,
is what actually re-checks the live price before anyone is charged.

## Checkout and orders

`/checkout/quote` re-prices the signed-in customer's own cart from the
database right now — never from what the cart remembered — and never
changes anything, so the frontend can call it as often as it likes.
`/checkout/place` is the only place in the whole API that turns a cart
into an order: inside one locked database transaction it re-checks stock
for every line, reserves it, snapshots the order (so a later catalog
price edit never rewrites what was actually bought), and empties the
cart. Two customers racing for the last bottle cannot both succeed — the
lock makes the loser's request fail cleanly instead of overselling.

An order does not charge anyone by itself; it is created `pending_payment`
until a real payment is confirmed.

## Payments (Razorpay)

Setting it up for the first time: [`docs/RAZORPAY-SETUP.md`](docs/RAZORPAY-SETUP.md).

`POST /checkout/place` also asks Razorpay for a payment and returns it
alongside the new order, so the frontend can open Razorpay's checkout
widget immediately. If that call to Razorpay fails, or Razorpay is not
configured yet, the order still exists — `payment` just comes back `null`
— and `POST /orders/:id/pay` can (re-)request one for it later.

The browser's own "payment succeeded" message is only ever a hint for the
UI. The only thing that actually moves an order to `paid` and turns its
stock reservation into a real stock decrease is `POST /webhooks/razorpay`
— Razorpay calls this route directly, with no `Authorization` header, and
an HMAC signature stands in as the authentication instead. Every webhook
delivery's own id is recorded before anything else happens, so a retried
delivery of the same event is safely ignored rather than applied twice.

## Hosting

Putting it online for the first time: [`docs/RAILWAY-DEPLOY.md`](docs/RAILWAY-DEPLOY.md).

The backend is deployed to **Railway**; the database stays on Supabase,
so the host only ever runs the code. The build, start, pre-deploy and
health-check settings live in the Railway dashboard — Railway retired its
in-repo `railway.json` mechanism for services created after August 2026 —
and the guide above lists every value so they can be re-entered exactly.

Two things it does on every deploy worth knowing:

- **Migrations run before the new version starts** (`preDeployCommand`),
  so the database schema can never lag behind the code that expects it.
- **Traffic only moves once `/api/v1/health` answers**, and the old
  version is given time to finish requests already in flight — a deploy
  never cuts a customer off mid-checkout.

If a build or a migration fails, Railway keeps the previous working
version serving.

## The admin area

Everything under `/api/v1/admin` is closed by one role check applied to
the whole router, so a new admin route cannot accidentally be published
without it. The role is read from our own `profiles` table on every
request — never from the sign-in token — so the only way to make someone
an admin is to change that row in the database. No API route hands out
admin access, on purpose.

What an admin can do: add and edit products, variants and categories,
hide a product from the shop (never delete it — past orders still point
at it), correct stock, see every customer's orders, cancel an unpaid
order, and look a customer up to answer a support question.

What an admin deliberately **cannot** do:

- **Mark an order paid.** Only the signature-verified Razorpay webhook
  can do that, because only it can prove money actually arrived.
- **Cancel an order that was already paid for.** That needs a real
  refund against Razorpay first, which is not an admin button.
- **Take stock below what is already promised** to unpaid orders.
- **Change a customer's role**, or edit a customer's own details.

Every change writes a row to `audit_logs` — who did it, what changed,
from which IP, and when — **inside the same database transaction as the
change itself**. So the log can never miss something that happened, and
can never show something that was rolled back. `GET /admin/audit-logs`
reads it back; nothing in the API ever edits or deletes those rows.

## Endpoints so far

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Liveness — is the process up? |
| GET | `/api/v1/ready` | Readiness — can it serve traffic? Reports each dependency, including the database and sign-in |
| GET | `/api/v1/products` | Every active fragrance, shaped exactly like the website's own catalog |
| GET | `/api/v1/products/:id` | One fragrance by its url slug (e.g. `shanaya-gold`); 404 if unknown |
| GET | `/api/v1/me` | The signed-in customer's own profile *(requires sign-in)* |
| PATCH | `/api/v1/me` | Update your own name/phone *(requires sign-in)* |
| GET | `/api/v1/me/addresses` | Your own saved addresses *(requires sign-in)* |
| POST | `/api/v1/me/addresses` | Add a saved address *(requires sign-in)* |
| PATCH | `/api/v1/me/addresses/:id` | Update one of your own addresses *(requires sign-in)* |
| DELETE | `/api/v1/me/addresses/:id` | Remove one of your own addresses *(requires sign-in)* |
| GET | `/api/v1/cart` | Your own server-side cart *(requires sign-in)* |
| POST | `/api/v1/cart/items` | Add an item, or increase it if already in the cart *(requires sign-in)* |
| PATCH | `/api/v1/cart/items/:id` | Change one item's quantity *(requires sign-in)* |
| DELETE | `/api/v1/cart/items/:id` | Remove one item *(requires sign-in)* |
| DELETE | `/api/v1/cart` | Empty the whole cart *(requires sign-in)* |
| GET | `/api/v1/wishlist` | Your own saved products *(requires sign-in)* |
| POST | `/api/v1/wishlist` | Save a product *(requires sign-in)* |
| DELETE | `/api/v1/wishlist/:productId` | Remove a saved product *(requires sign-in)* |
| POST | `/api/v1/checkout/quote` | Live total for your own cart, changes nothing *(requires sign-in)* |
| POST | `/api/v1/checkout/place` | Turn your cart into an order, reserve stock, and start a payment *(requires sign-in)* |
| GET | `/api/v1/orders` | Your own past orders *(requires sign-in)* |
| GET | `/api/v1/orders/:id` | One of your own orders, in full *(requires sign-in)* |
| POST | `/api/v1/orders/:id/pay` | (Re-)start a payment for one of your own still-pending orders *(requires sign-in)* |
| POST | `/api/v1/webhooks/razorpay` | Razorpay's own callback — signature-verified, not for browser use |

Admin only — every route below needs an `admin` account and writes to `audit_logs`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/admin/whoami` | Proves the admin-only door is locked |
| GET | `/api/v1/admin/products` | Every product, hidden ones included, paged and searchable |
| GET | `/api/v1/admin/products/:id` | One product with its variants and their stock |
| POST | `/api/v1/admin/products` | Add a product |
| PATCH | `/api/v1/admin/products/:id` | Edit a product, or hide it with `isActive: false` |
| POST | `/api/v1/admin/products/:id/variants` | Add a sellable size/type, with its stock row |
| PATCH | `/api/v1/admin/variants/:id` | Edit a variant's price, label or availability |
| GET | `/api/v1/admin/categories` | Fragrance families, with how many products use each |
| POST | `/api/v1/admin/categories` | Add a category |
| PATCH | `/api/v1/admin/categories/:id` | Edit a category |
| GET | `/api/v1/admin/inventory/low-stock` | The restock list — anything at or below its threshold |
| POST | `/api/v1/admin/inventory/adjust` | Correct stock by a relative amount, with a reason |
| GET | `/api/v1/admin/orders` | Every customer's orders, paged, filterable by status |
| GET | `/api/v1/admin/orders/:id` | One order in full, with who placed it |
| PATCH | `/api/v1/admin/orders/:id` | Cancel an unpaid order and release its stock |
| GET | `/api/v1/admin/customers` | Customers with order count and lifetime spend |
| GET | `/api/v1/admin/customers/:id` | One customer with their addresses and orders |
| GET | `/api/v1/admin/audit-logs` | The admin paper trail, newest first |

Every response uses one envelope:

```json
{ "success": true,  "data": { } }
{ "success": false, "error": { "code": "NOT_FOUND", "message": "…", "requestId": "…" } }
```

The `requestId` is also returned as an `X-Request-Id` header and written into
the server logs, so a customer report can be traced to the exact request
without exposing anything sensitive to them.

## What is already enforced

- **Config validation** — the process refuses to start on invalid/missing environment variables.
- **Security headers** via Helmet (HSTS, nosniff, frameguard, referrer policy); `X-Powered-By` removed.
- **CORS allowlist** — only origins listed in `CORS_ALLOWED_ORIGINS` may call the API from a browser.
- **Rate limiting** — a general limit on all routes, plus a stricter limiter ready for auth/payment routes.
- **Body size limit** of 100kb.
- **Central error handling** — clients never receive stack traces or internal details.
- **Redacted structured logging** — authorization headers, cookies, passwords, tokens, card data and signatures are stripped before anything is written.
- **Graceful shutdown** — in-flight requests finish before the process exits.

## Project layout

```
src/
├── app/           app factory + server entry point
├── config/        validated environment configuration
├── db/            schema, connection, migrations runner, catalog seed
├── lib/           small focused helpers (e.g. Supabase token verification)
├── middleware/    request id, security, rate limiting, error handling, auth
├── repositories/  the only code that queries the database directly
├── routes/        route definitions — validate input, call a repository, respond
└── utils/         logger, error types, response helpers
drizzle/           generated SQL migrations (committed, never edited)
tests/             API tests (Vitest + Supertest)
docs/              architecture, setup guides, API documentation
```

Each feature adds its own `*.route.ts` and `*.repository.ts` rather than a
folder of its own, so a route is always one file away from the queries it
runs. Admin routes are split across `admin-*.route.ts` files but all hang
off the single guarded router in `admin.route.ts`.
