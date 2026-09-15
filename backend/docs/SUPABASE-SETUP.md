# Supabase Setup — Step by Step

This is the one part of Phase 2 that only you can do, because it creates an
account in your name and produces a password.

**Golden rule: the connection string is a key to your shop's data. It goes
into `backend/.env` on your computer and nowhere else — not into a chat, not
into a screenshot, not into GitHub.**

---

## Step 1 — Create the account

1. Open **https://supabase.com** and click **Start your project**.
2. Sign in with **GitHub** (the same account the website is already pushed to).
3. It is free. No card is needed for this plan.

## Step 2 — Create the project

1. Click **New project**.
2. Fill in:
   - **Name:** `shafaaf-perfumes`
   - **Database Password:** click **Generate a password** and then **Copy** it.
     Save it in your password manager. If you lose it you can reset it later,
     but you cannot read it again.
   - **Region:** choose the one closest to your customers — for India, pick
     **South Asia (Mumbai)**. A closer region means a faster shop.
3. Click **Create new project** and wait about two minutes while it builds.

## Step 3 — Copy the connection string

1. At the top of the dashboard, click the green **Connect** button.
2. Choose the **ORMs** tab (or **Session pooler** if you do not see ORMs).
3. Copy the line that starts with `postgresql://`.
   It looks like this, with your own values in place of the capitals:

   ```
   postgresql://postgres.ABCDEFGH:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
   ```

4. Replace `[YOUR-PASSWORD]` with the database password you saved in Step 2.
   Delete the square brackets too.

## Step 4 — Put it in the `.env` file

1. Open the folder `backend` in this project.
2. If there is no file called `.env` yet, make a copy of `.env.example` and
   rename the copy to `.env`.
3. Open `.env` in Notepad and find the line:

   ```
   DATABASE_URL=
   ```

4. Paste your connection string right after the `=`, with no spaces and no
   quotation marks:

   ```
   DATABASE_URL=postgresql://postgres.ABCDEFGH:your-real-password@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
   ```

5. Save and close the file.

`.env` is already listed in `.gitignore`, so it can never be pushed to GitHub
by accident.

## Step 5 — Build the tables and load the perfumes

Open a terminal in the `backend` folder and run these three commands, one at
a time:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm test
```

What each one does:

| Command | What happens |
|---|---|
| `db:migrate` | Creates the empty tables in Supabase |
| `db:seed` | Loads the 14 fragrances, their notes and all 56 sizes with their prices |
| `test` | Checks the data landed correctly — names, prices and stock rules |

After `db:seed` you should see:

```
Seed complete:
  families : 7
  notes    : 25
  products : 14
  variants : 56
```

## Step 6 — See it with your own eyes

In the Supabase dashboard, click **Table Editor** in the left sidebar and open
the **products** table. Your 14 fragrances should be listed there.

---

## Safety notes

- **Nobody can read these tables from the internet.** Row Level Security is
  switched on for every table, and no public access rule is granted. Only our
  own backend, using the connection string in `.env`, can read or write them.
- **Prices are stored in paise**, not rupees — ₹599 is stored as `59900`.
  Whole numbers cannot drift the way decimals can, so a total is never a
  fraction of a paisa wrong.
- **Stock cannot go negative.** The database itself refuses it, even if a bug
  in the code ever tries.
- **Re-running `db:seed` is safe.** It updates what changed and leaves real
  stock counts alone.

## If something goes wrong

| Message | What it means | What to do |
|---|---|---|
| `No DATABASE_URL found` | `.env` is missing or the line is empty | Redo Step 4 |
| `password authentication failed` | The password in the string is wrong | Recopy it, and check `[YOUR-PASSWORD]` was replaced |
| `getaddrinfo ENOTFOUND` | The host part of the string was cut short | Copy the whole line again from Supabase |
| `SASL` or `SSL` errors | Usually an old copy of the string | Use the **Session pooler** string from the Connect dialog |

If you paste an error message to me for help, **remove the password from it
first** — replace it with `***`.
