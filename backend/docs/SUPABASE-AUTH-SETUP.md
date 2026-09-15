# Supabase Auth Setup — Step by Step

This adds customer sign-in to the backend. Good news: unlike the database
password, these two values can be viewed **any time** in the dashboard — no
reset, no "did I click confirm" — so this should be quick.

**Golden rule stays the same: these values go into `backend/.env` on your
computer only — never into a chat message, screenshot, or GitHub.**

---

## Step 1 — Open your project's API settings

1. Open your `shafaaf-perfumes` project in the Supabase dashboard
2. Left sidebar → **Project Settings** (gear ⚙️ icon, at the bottom)
3. Click **API**

You will see a page with a few values. We need exactly two of them.

## Step 2 — Copy the Project URL

Near the top, find **Project URL** — it looks like:

```
https://uaigqaqpghsqvwelmofx.supabase.co
```

Click the small **copy icon** next to it (do not type it by hand).

## Step 3 — Copy the `service_role` key

Further down, under **Project API keys**, there are two keys:

| Key | What it is |
|---|---|
| `anon` `public` | Safe for a browser to see |
| `service_role` | **Powerful — bypasses every safety rule. Server only.** |

We need the **`service_role`** one. It is hidden by default — click **Reveal**
next to it, then click its **copy icon**.

⚠️ Treat this one like a master key. Never paste it into frontend code,
never commit it, never share it — same rule as the database password.

## Step 4 — Put both values in `.env`

Open `backend\.env` in Notepad. Find these two lines:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Paste the Project URL after `SUPABASE_URL=`, and the `service_role` key
after `SUPABASE_SERVICE_ROLE_KEY=` — no spaces, no quotes. Save the file.

## Step 5 — Test it

In a terminal, from the `backend` folder:

```bash
npm test
```

Tests that need sign-in (previously shown as "skipped") should now run and
pass — they create a throwaway test account, sign it in, check it can see
its own profile and addresses but not an admin page, then delete the test
account again.

---

## What this unlocks

- Every customer who signs up automatically gets a profile row — a small
  piece of database automation (a "trigger") creates it the instant they
  sign up, so the app can never forget to.
- `GET /api/v1/me` and address endpoints — a signed-in customer's own
  profile and saved addresses, and only their own.
- `GET /api/v1/admin/whoami` — proves a customer account is blocked and
  only an account marked `admin` in the database gets through. Nothing
  administrative exists behind it yet (that is Phase 8); it exists now to
  prove the door is actually locked.

## Safety notes

- **A role is never trusted from the sign-in token itself** — only from
  the `role` column in our own `profiles` table, read fresh on every
  request. Editing a token cannot make anyone an admin.
- **Row Level Security is on** for `profiles` and `addresses`, same as
  every other table — Supabase's own public API cannot reach them; only
  this backend can.
- **A customer can only ever see their own data.** Every query is scoped
  to the signed-in user's own id, not to anything the request claims.

## If something goes wrong

| Message | What it means | What to do |
|---|---|---|
| Sign-in tests still show "skipped" | `.env` is missing one of the two values | Re-check Step 4 |
| `Could not create test user` | The service role key is wrong or was not fully copied | Recopy it via the Reveal + copy icon, not by typing |
| `/api/v1/ready` shows `"auth":"not-configured"` | `SUPABASE_URL` is blank | Re-check Step 4 |
