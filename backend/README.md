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
| GET | `/api/v1/admin/whoami` | Proves the admin-only door is locked *(requires an `admin` account)* |

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

Folders for `services/`, `orders/`, `payments/` and `admin/` are added in
later phases as their features are built, rather than created empty up front.
