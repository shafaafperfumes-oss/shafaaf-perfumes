# Shafaaf Perfumes

Premium international perfume e-commerce frontend.

## Status

The storefront now reads its catalog from the live backend (`backend/`,
deployed on Railway — see `backend/README.md`) and customers can create
an account and sign in (header account icon; `js/lib/auth.js` +
`js/components/account-modal.js`). A signed-in customer's cart is kept
on the backend (`/cart`) so it follows them to any device; guests keep
a browser-only cart, which is merged into their account the moment
they sign in (`js/lib/cart.js`). Checkout is real: `checkout.html`
asks a signed-in customer for a delivery address (saved via
`/me/addresses`), shows the order as the backend priced it
(`POST /checkout/quote`), places it (`POST /checkout/place`) and opens
Razorpay's payment window (`js/lib/payment.js`, loaded only at that
moment). `orders.html` lists the customer's orders; `orders.html?id=…`
shows one, with a "Pay now" button while it is still awaiting payment.
The browser never marks an order paid — Razorpay tells the backend
(webhook) and the page simply reads the status back. Until the Razorpay
keys are set on the backend, orders are still created and stock
reserved; the page just says payments are unavailable.

**Sign-in:** the browser talks to Supabase Auth directly using the
project URL and *publishable* key in `js/config.js` (both are meant to
be public — the key can only sign people in, every table is locked to
the backend). The backend never sees a password; it receives a signed,
short-lived token on each call (`js/lib/api.js` attaches it) and checks
the signature. If the key is blank or the Supabase library fails to
load, the account modal says sign-in is unavailable and the shop keeps
working.

**Where the site gets its data:** `js/config.js` holds the backend's
address (nothing secret — it is served to every visitor).
`js/lib/catalog-loader.js` fetches `/products` before any page draws and
swaps the result into the catalog; if the backend cannot be reached, the
copy embedded in `js/data/products.js` is shown instead, so the shop never
renders blank. Pages wait via `shafaafOnCatalogReady(fn)` rather than
`DOMContentLoaded`. Add `?api=local` to any page URL to point that browser
tab at a backend running on this machine (`npm run dev` in `backend/`).

## Tech Stack

Vanilla HTML/CSS/JS — no build step, no framework, no Node dependency. Chosen because this machine has no Node.js/npm installed; a framework (Next.js/Vite+React) would be a stronger fit if this project ever grows a real backend, but for a static, framework-free deploy target this keeps things simple and portable (works from any static host, or by opening the files directly).

- **Pages** are self-contained HTML files (no templating) — shared header/footer/overlay markup is duplicated per page by design.
- **Design system**: `css/tokens.css` (colors, type, spacing, shadows, motion, z-index), `css/base.css` (reset), `css/components.css` (buttons, cards, drawers, modals, etc.), `css/layout.css` (header/footer/grid), `css/pages/*.css` (page-specific).
- **Data layer**: pages read the catalog only through the accessor functions in `js/data/products.js` (`shafaafGetAllProducts`, etc.). At runtime that list is what the backend returned; the embedded array is the offline fallback and the source `npm run db:seed` loads into the database, so it must keep the same shape.
- **State**: `js/lib/cart.js` (localStorage for guests, backend `/cart` when signed in — changes apply instantly on screen and are sent to the backend one after another) and `js/lib/wishlist.js` (localStorage) are small pub/sub stores broadcasting `shafaaf:cart:change` / `shafaaf:wishlist:change` events that any component can listen for.
- **Components**: `js/components/*.js` — header, cart drawer, search overlay, quick view modal, product cards, toasts, accordion — all delegated-event-based so they work with dynamically injected HTML.

## Project Structure

```
index.html, shop.html, product.html, cart.html, checkout.html, orders.html,
wishlist.html, fragrance-finder.html, about.html, contact.html
css/
  tokens.css, base.css, components.css, layout.css
  pages/  (home.css, shop.css, product.css, cart.css, checkout.css, finder.css, static.css)
js/
  data/       product + review data
  lib/        config, auth, api, cart, wishlist, payment (Razorpay window), storage, format, icons, note-family grouping
  components/ header, cart-drawer, search-overlay, quick-view, product-card, toast, accordion, placeholder-art
  pages/      one file per page for page-specific rendering
images/
scripts/dev-server.ps1   local static file server (no Node/Python required)
```

## Running Locally

No build step needed. Either:

- Open `index.html` directly in a browser, **or**
- Run a local server (recommended, since some things behave better over `http://` than `file://`):

```bash
powershell -ExecutionPolicy Bypass -File scripts/dev-server.ps1
```

Then visit `http://localhost:8080`.

## Catalog

14 fragrances, each offered as **Perfume** (30ml / 50ml) and **Attar** (6ml / 12ml). Names, prices and fragrance notes are the real catalog data and should not be edited casually — see `js/data/products.js`.

## Known Follow-ups

- `images/yemberzal.jpg` is ~28MB and `images/velvet-petal.jpg` is ~2MB — both should be compressed/resized before this site is pointed at real traffic. No image tooling was available in the build environment to do this automatically.
- `js/lib/whatsapp-checkout.js` is no longer loaded by any page (checkout now goes through the backend and Razorpay); it can be deleted. The WhatsApp number in the footer links is the one carried over from the previous site version — confirm it's still correct.
- Ratings/review counts and the "bestseller"/"new" badges are placeholder merchandising data, structured so a real reviews/inventory backend can replace them later.
