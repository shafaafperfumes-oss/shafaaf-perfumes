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

## Endpoints so far

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Liveness — is the process up? |
| GET | `/api/v1/ready` | Readiness — can it serve traffic? (checks grow as dependencies are added) |

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
├── app/          app factory + server entry point
├── config/       validated environment configuration
├── middleware/   request id, security, rate limiting, error handling
├── routes/       route definitions
└── utils/        logger, error types, response helpers
tests/            API tests (Vitest + Supertest)
docs/             architecture and API documentation
```

Folders for `services/`, `models/`, `repositories/`, `validators/`, `auth/`,
`products/`, `orders/`, `payments/` and `admin/` are added in later phases as
their features are built, rather than created empty up front.
