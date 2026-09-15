# Shafaaf Perfumes — Backend Architecture

Status: **design approved, implementation in phases**
Last updated: 2026-09-15

---

## 1. What exists today (frontend audit)

| Area | Today | Gap the backend must close |
|---|---|---|
| Catalog | 14 fragrances hard-coded in `js/data/products.js`; each has Perfume + Attar, 2 sizes each = **56 sellable options** | Catalog must live in a database and be editable without a code deploy |
| Cart | Browser `localStorage` only | Server-side cart, survives device change, price/stock validated server-side |
| Wishlist | Browser `localStorage` only | Tied to a customer account |
| Accounts | None | Registration, login, verification, password reset, roles |
| Checkout | WhatsApp deep link | Real orders, server-computed totals, payment |
| Stock | Not tracked | Inventory with reservations; overselling must be impossible |
| Reviews | Placeholder numbers in code | Real reviews, moderated |
| Search/filter | Client-side over 14 items | Server-side, paginated, indexed |
| Admin | None | Secure admin APIs behind role checks |

The frontend already reads its catalog through accessor functions (`shafaafGetAllProducts()`, `shafaafGetProductById()`, …) rather than touching the array directly, so swapping the data source to the API is a contained change.

---

## 2. Technology stack

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node.js LTS | Owner's stated stack |
| Framework | Express | Owner's stated stack; small, well understood |
| Language | TypeScript | Money, stock and order logic must not fail on a typo; brief requires strong typing |
| Database | Supabase Postgres | Owner's stated stack; managed backups, connection pooling |
| DB access | Drizzle ORM | SQL-first, typed, real transactions (required for inventory), reviewable SQL migrations |
| Auth | Supabase Auth | Handles hashing, email verification, password reset, token rotation — far safer than hand-rolling |
| Payments | Razorpay | Business is India-based, prices in INR, supports UPI/cards/netbanking |
| Validation | Zod | One schema validates input *and* generates API docs |
| Logging | Pino (structured, redacted) | Machine-readable logs without leaking secrets |
| Tests | Vitest + Supertest | Fast, TypeScript-native API tests |
| Docs | OpenAPI + Swagger UI | Brief requires documented endpoints |

**Money is stored in paise (integers), never floats.** `599` rupees is stored as `59900`. Floating point money causes rounding bugs that show up as mismatched totals.

---

## 3. Security architecture

Trust boundary: **nothing from the browser is trusted.** Prices, totals, discounts, stock and roles are all recomputed or re-read server-side.

- Secrets live only in `.env` (git-ignored) or the host's secret manager. `.env.example` holds placeholders only.
- Two Supabase keys exist. The **anon key** is safe for the browser. The **service-role key bypasses all database rules** and lives only on the server — it must never appear in frontend code, screenshots, or git.
- Auth: browser signs in with Supabase → receives a JWT → sends it as `Authorization: Bearer <token>`. The API verifies the signature on every request, then reads the user's role from our own `profiles` table (never from the token's editable claims).
- Roles: `customer`, `admin`, `super_admin`. Admin routes are mounted on a separate router with a role guard; there is no "admin flag" a customer can set.
- Every endpoint: Zod-validated input, explicit auth requirement, consistent JSON envelope, correct status code.
- Rate limiting: strict on auth and payment routes, looser on catalog reads.
- CORS: explicit allowlist of the site's domains; no wildcard in production.
- Helmet for security headers; HTTPS enforced at the host.
- SQL injection: parameterised queries only (Drizzle); no string-built SQL.
- Errors: clients get a safe message and a request id; full detail goes to server logs only.
- Logs redact `authorization`, `password`, `token`, `card`, `cvv`, `secret` fields.
- `audit_logs` records every admin and money-moving action with actor, entity, IP and timestamp.

---

## 4. Database design

Core tables (Postgres, all with `created_at` / `updated_at` where relevant):

**Identity**
- `profiles` — id (= Supabase `auth.users.id`), full_name, phone, role, marketing_opt_in
- `addresses` — user_id, line1/2, city, state, postal_code, country, phone, type, is_default

**Catalog**
- `brands`, `categories`, `fragrance_families`, `fragrance_notes`
- `products` — slug, name, brand, category, family, gender, description, concentration, country_of_origin, status, SEO fields, denormalised rating_avg / review_count
- `product_notes` — product ↔ note, with `position` (top / heart / base)
- `product_images` — url, alt, sort_order, is_primary
- `product_variants` — **the sellable unit**: sku (unique), form (`perfume` / `attar`), size_ml, price_paise, compare_at_paise, barcode, weight_grams, is_active

**Stock**
- `inventory` — one row per variant: quantity, reserved_quantity, low_stock_threshold
- `inventory_movements` — append-only ledger of every change with reason and reference

**Shopping**
- `carts` — user_id *or* guest_token, status, expires_at
- `cart_items` — cart, variant, quantity, unit_price_paise (snapshot), unique per (cart, variant)
- `wishlists` — (user_id, product_id)

**Money**
- `coupons`, `coupon_redemptions`
- `orders` — order_number, customer, status, currency, subtotal/discount/shipping/tax/total in paise, address snapshots (jsonb), timestamps
- `order_items` — **snapshots** product name, sku, variant label and unit price at purchase time, so later price edits never rewrite history
- `order_status_history` — every transition, who made it
- `payments`, `payment_events` (webhook idempotency), `refunds`
- `shipments` — carrier, tracking_number, status

**Engagement & safety**
- `reviews` (moderated: pending / approved / rejected, one per customer per product)
- `notifications`
- `audit_logs`

Indexes on every foreign key, on `products.slug`, `product_variants.sku`, `orders.order_number`, `orders.user_id + created_at`, and a full-text index on product name/description for search.

### Overselling prevention

Stock is only ever changed inside a database transaction:

1. `SELECT … FOR UPDATE` locks the inventory rows for the variants being bought.
2. Check `quantity - reserved_quantity >= requested` for every line, or the whole order fails.
3. Increment `reserved_quantity`, write an `inventory_movements` row.
4. On payment confirmation: decrement `quantity`, release the reservation.
5. On failure/expiry: a background job releases stale reservations.

Because the check and the write happen inside one locked transaction, two simultaneous buyers cannot both take the last bottle.

---

## 5. API architecture

Base path `/api/v1`. Four separated surfaces:

**Public (no auth)**
```
GET  /products                 list, filter, paginate
GET  /products/:slug           single product with variants, notes, images
GET  /collections              families / categories
GET  /search?q=                product search
GET  /notes                    fragrance notes for filters
POST /newsletter               subscribe
```

**Customer (valid JWT)**
```
GET/PATCH /me                  profile
CRUD      /me/addresses
GET/POST/PATCH/DELETE /cart    server-side cart
GET/POST/DELETE /wishlist
POST /checkout/quote           server-computed totals (never trust client math)
POST /checkout/place           creates order + reserves stock
GET  /orders  GET /orders/:id  own orders only
POST /reviews                  verified-purchase reviews
```

**Admin (role: admin / super_admin)**
```
CRUD /admin/products /admin/variants /admin/categories /admin/brands
POST /admin/inventory/adjust
GET/PATCH /admin/orders
CRUD /admin/coupons
PATCH /admin/reviews/:id       moderation
GET  /admin/customers /admin/analytics /admin/audit-logs
```

**Internal / service**
```
POST /webhooks/razorpay        signature-verified, idempotent, no auth header
GET  /health  GET /ready       monitoring
```

Every response uses one envelope:
```json
{ "success": true,  "data": { }, "meta": { "page": 1, "total": 120 } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "requestId": "…" } }
```

---

## 6. Payment flow (Razorpay)

1. Browser calls `POST /checkout/place`. **The server** recalculates every price from the database, applies coupon rules, computes shipping and tax, and creates an order with status `PAYMENT_PENDING`.
2. The server creates a Razorpay order for that exact amount and returns only the public order id.
3. The browser opens Razorpay checkout. Card data never touches our servers.
4. Razorpay calls `POST /webhooks/razorpay`. The server verifies the HMAC signature with the webhook secret, stores the event id in `payment_events` (duplicate events are ignored), and only then marks the order `PAID` and commits the stock.
5. The browser's "payment succeeded" message is treated as a hint for the UI only — **the webhook is the source of truth.**

Refunds follow the same pattern in reverse and are recorded in `refunds`.

---

## 7. How the frontend connects

The site keeps its current accessor functions; only their internals change from reading a local array to calling the API, so page code is untouched.

- `js/config.js` holds the API base URL per environment (no secrets).
- Supabase's browser client (anon key only) handles sign-in and holds the session.
- All catalog, cart, order and payment calls go to our Express API with the JWT attached.
- WhatsApp checkout stays available as a fallback until payments are live.

---

## 8. Build phases

Each phase is built, tested, and committed before the next begins.

| Phase | Deliverable |
|---|---|
| 0 | This document |
| 1 | Project skeleton: TypeScript, config, logging, error handling, security middleware, `/health`, first tests |
| 2 | Database schema + migrations + seed of the real 14 fragrances |
| 3 | Public catalog APIs; frontend reads products from the API |
| 4 | Supabase Auth, profiles, addresses, role guards |
| 5 | Server-side cart and wishlist |
| 6 | Checkout, orders, inventory reservation |
| 7 | Razorpay payments and verified webhooks |
| 8 | Admin APIs |
| 9 | Reviews, notifications, transactional email |
| 10 | Better search, AI recommendations behind server APIs |
| 11 | Hardening: rate limits, monitoring, backups, OpenAPI docs, deployment |

---

## 9. Non-negotiables

- No secret in git, frontend, logs or screenshots.
- The server computes every amount charged.
- Stock changes only inside transactions, always audited.
- Orders keep snapshots; later catalog edits never rewrite history.
- Admin routes are unreachable without a server-verified admin role.
- Webhooks are signature-verified and idempotent.
- Customers never see stack traces or database errors.
