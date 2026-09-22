# Meta Auto-Post Setup (Instagram + Facebook) — Step by Step

This lets the backend post **approved** social posts from the admin's
Content tab onto your **Facebook Page** and your **Instagram** account by
itself, at the "Post on" time you set — or right away with **Publish now**.

**The backend already works without this.** Approved posts simply wait for
you to press *Copy caption* and post them by hand. Nothing is ever posted
that you did not approve.

**Golden rule stays the same: the access token goes into Railway's
Variables screen only (or `backend/.env` on your computer) — never into a
chat message, screenshot, or GitHub. If a token is ever pasted anywhere
else, make a new one and delete the old one.**

It is free. Meta charges nothing for posting through its API.

---

## What can and cannot go out by itself

| Draft type | Auto-post? |
|---|---|
| Instagram **post** (photo + caption) | ✅ Yes |
| Facebook Page **post** (photo + caption, or text only) | ✅ Yes |
| Instagram / Facebook **reel** or **story** | ❌ Copy and post by hand |
| **WhatsApp Status** | ❌ No API exists — copy and post by hand |
| **YouTube Short** | ❌ The draft is a shot list; film and upload by hand |

Photos: Instagram only accepts JPEG between 4:5 (tall) and 1.91:1 (wide).
The server converts each photo to JPEG at full size and, if it is taller
than 4:5 (most product renders are), adds ivory bars on the sides — it
never crops or shrinks. Your site's own photo files are not touched.

## Before you start — 3 things to check (10 minutes)

1. **Instagram must be a Professional account** (Business or Creator).
   Instagram app → Profile → ☰ → *Settings and privacy* → *Account type
   and tools* → *Switch to professional account* (free).
2. **The Instagram account must be linked to your Facebook Page.**
   Instagram app → *Settings and privacy* → *Accounts Center* → *Accounts*
   → add the Facebook account that owns the Page. Then on Facebook:
   Page → *Settings* → *Linked accounts* → *Instagram* → *Connect account*.
3. **You must be an admin of the Facebook Page** (you are, if you made it).

## Step 1 — Create a Meta app (one time)

1. Go to [developers.facebook.com](https://developers.facebook.com) and
   log in with the Facebook account that owns the Page.
2. *My Apps* → *Create App*.
   - Use case: **Other** → App type: **Business**.
   - App name: `Shafaaf Perfumes Publisher` (anything is fine).
   - Business portfolio: pick yours if it asks, otherwise skip.
3. On the app dashboard, under *Add products*, add **Facebook Login for
   Business** and **Instagram Graph API** (names vary slightly — if you
   see "Instagram" with "API setup with Facebook login", that is the one).
   You only need them added; no further configuration.

The app can stay in **Development mode**. In that mode only people with a
role on the app can use it — and that is exactly you. No app review is
needed for posting to your own Page and Instagram.

## Step 2 — Get a long-lived Page token

Tokens are what the server uses instead of your password. You will make
one that does not expire.

1. Open the **Graph API Explorer**: *Tools* → *Graph API Explorer*
   (or developers.facebook.com/tools/explorer).
2. Top right: *Meta App* → choose **Shafaaf Perfumes Publisher**.
3. *User or Page* → **Get User Access Token**. In the permissions box,
   tick exactly these:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `instagram_basic`
   - `instagram_content_publish`
   - `business_management`
   Click **Generate Access Token**, log in, and allow access to **your
   Page and your Instagram account** when Facebook asks which ones.
4. Now swap that short token for a long-lived one and then for a Page
   token. Easiest way, still in the Explorer:
   - In the *User or Page* dropdown, choose **your Page name** under
     "Page Access Tokens". The token box now holds a **Page token**.
   - Click the little **ⓘ** next to the token → **Open in Access Token
     Tool** → click **Extend Access Token**. The tool shows a new token
     with *Expires: Never* (a Page token made from a long-lived user token
     does not expire).
   - Copy **that** extended token. This is your `META_PAGE_ACCESS_TOKEN`.
     Treat it like a password.

## Step 3 — Find the two ids (not secret)

Still in the Explorer, with the Page token selected, run these GET
requests (type in the box next to *GET* and press *Submit*):

- `me?fields=id,name` → the `id` is your **`META_PAGE_ID`**.
- `me?fields=instagram_business_account` → the id inside is your
  **`META_IG_USER_ID`** (optional: the server looks it up by itself when
  blank, but setting it saves one call).

If the second one comes back empty, the Instagram account is not linked
to the Page yet — see *Before you start*, point 2.

## Step 4 — Put them in Railway (or `.env` locally)

Railway → your backend service → **Variables** → add:

| Variable | Value | Secret? |
|---|---|---|
| `META_PAGE_ACCESS_TOKEN` | the extended Page token | **Yes** |
| `META_PAGE_ID` | the Page id number | no |
| `META_IG_USER_ID` | the Instagram id number (optional) | no |
| `SITE_PUBLIC_URL` | where photos are served, e.g. `https://shafaaf-perfumes.shafaafperfumes.workers.dev` (later your domain). Optional — the server already uses the first public address from `CORS_ALLOWED_ORIGINS`. | no |
| `CONTENT_PUBLISHER_INTERVAL_MS` | how often to look for due posts; default 300000 (5 min). `0` turns the timer off; *Publish now* still works. | no |

Railway redeploys by itself (2–3 minutes).

Locally, put the same lines in `backend/.env`. That file is git-ignored.

## Step 5 — Check it from the admin

Open the admin → **Content**. The line under the intro says either
*"Auto-post: on — Facebook Page "…", Instagram @…"* or *"Auto-post: off"*.
Press **Check connection** to ask again after changing variables.

Then a real test: write a small **New post** (platform Facebook, kind
post, a caption, photo path `images/oud-kaaba-perfume.jpg`), **Approve**
it, press **Publish now**, confirm. Within a few seconds the card moves to
*Published* with a **View post ↗** link. Delete the test post on Facebook
afterwards if you like — the admin keeps its own record.

## How the schedule works

- Every 5 minutes the server looks for posts that are **approved**, have a
  **Post on** time that has passed, and have failed fewer than 3 times.
- It posts them soonest-first. Each post is tried at most 3 times; after
  that the card shows *"Last try failed (3, stopped): …"* and waits for
  you. Moving it *Back to draft* and approving again resets the count.
- Approved posts with **no** Post on time are never picked up by the
  timer — they wait for *Publish now*.
- Instagram allows at most 100 API posts per account per 24 hours; the
  shop will never come near that.

## If something fails

The exact reason from Meta is shown on the card. Common ones:

- **"Invalid OAuth access token" / code 190** — the token expired or was
  made without the right permissions. Redo Step 2.
- **"No Instagram professional account is linked to this Facebook Page"**
  — *Before you start*, point 2.
- **"(#10) … permission"** — a permission was not ticked in Step 2, or the
  app lost its role. Redo Step 2 with the full list.
- **"Could not fetch the photo (404)"** — the photo path in the post does
  not exist on the site. Fix the path (`images/…`) and try again.
- **"The server does not know the site's public address yet"** — set
  `SITE_PUBLIC_URL` (Step 4).

## Security notes

- The token lets anyone who has it post as your Page. It lives in Railway
  only. The admin page never receives it; *Check connection* only returns
  the Page name and Instagram username.
- To revoke it: developers.facebook.com → your app → *App settings* →
  *Advanced* → reset the app secret, or simply remove the app from
  facebook.com → *Settings* → *Business integrations*. Then make a new
  token.
- The server never edits or deletes anything on Facebook or Instagram; it
  can only create posts you approved.
