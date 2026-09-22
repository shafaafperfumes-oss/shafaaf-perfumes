---
description: Monday routine — export the week's numbers, draft next week's social posts, import them into the admin, run the Analytics agent, and give the owner one Hinglish HQ summary. Add "full" to also run the website and SEO audits.
argument-hint: [full]
---

Run the Shafaaf AI team's weekly routine. Talk to the owner in simple Hinglish (Roman
script); he is non-technical. Do every step in order, and stop to tell him if one fails.
Nothing in this routine posts, publishes or commits by itself.

`$ARGUMENTS` = `full` means also run the website and SEO agents (monthly-ish; slower).

## 0. Setup
- `DATE` = today as `YYYY-MM-DD`. All files use this date.
- Confirm `backend/.env` exists (do not read it, just check the file is there — the
  export and import need the database connection from it). If it is missing, stop and
  say: "backend/.env nahi mila — numbers aur import nahi chal sakte."

## 1. Numbers (read-only)
Run in `backend/`: `npm run analytics:export`
It writes `.claude/team/data/DATE-analytics.json` and prints one line. Show that line.
This file has no customer names, phones or addresses — do not add any.

## 2. Content agent → next week's drafts
Spawn `content-agent` with this brief:
- Week starting DATE (Monday) to Sunday; write `.claude/team/content/DATE-drafts.json`
  and `.claude/team/reports/DATE-content.md`.
- Read `.claude/team/data/DATE-analytics.json` → `content.rejectedLast30Days` (owner's
  notes: what not to write again), `content.failed` (posts whose auto-post failed and why),
  `bestSellers` (lean on what is selling), `customPage.noMatchQueries` (fragrances people
  asked for — a "did you know we make inspired-by …" post only if the list actually has it),
  `catalog.productsWithoutPhoto` (skip those products).
- Do not repeat products used in the previous two weeks' drafts files.
- Instagram and Facebook `post` drafts must have a real photo path and a `scheduledFor`
  time, because approved ones auto-post at that time. Reels, stories, WhatsApp and YouTube
  stay manual — say so in `agentNote`.

## 3. Import the drafts into the admin
Run in `backend/`: `npm run content:import -- ../.claude/team/content/DATE-drafts.json`
Show its one-line result ("N read, N added, N already imported"). If it refuses the file
(banned words, unknown product), tell the content agent exactly which draft and why, let
it fix the file, and run the import again — at most twice.

## 4. Analytics agent → numbers report
Spawn `analytics-agent`: "Write the weekly report for DATE from
`.claude/team/data/DATE-analytics.json`." It writes `.claude/team/reports/DATE-analytics.md`.

## 5. (only with `full`) Website and SEO audits
Spawn `website-agent` and `seo-agent` in parallel, each writing
`.claude/team/reports/DATE-website.md` / `DATE-seo.md`, comparing against the previous
reports in `.claude/team/reports/` so they report what changed, not the same list again.

## 6. HQ summary
Spawn `team-leader`: "Consolidate the reports dated DATE into
`.claude/team/reports/DATE-SUMMARY.md`." Then read the SUMMARY and paste its owner-facing
sections (numbers, nichod, decide karna hai, aapse chahiye, is hafte ke posts) into the
chat as the final message — do not just link the file.

## 7. Close
End with exactly these reminders:
- "Admin → Content mein N naye drafts hain — Approve karein (Post on time set hai; Instagram/
  Facebook posts us time par khud chale jayenge agar Meta setup hai, warna Copy caption)."
- "Ye sab files commit karne ke liye HAAN likhein" — and only after a HAAN, commit
  `.claude/team/` (data, content, reports) with a message like
  `Weekly routine DATE: drafts, numbers and HQ summary` ending in the usual
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` line. Check
  `git check-ignore backend/.env` prints the path before committing.

Never edit site files, product data or prices in this routine. Never read `backend/.env`.
Never push anything to Meta, Facebook, Instagram or WhatsApp from here.
