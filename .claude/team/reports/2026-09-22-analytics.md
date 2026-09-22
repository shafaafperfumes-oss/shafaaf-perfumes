# Shafaaf Perfumes — Weekly Analytics Report (2026-09-22)

Source: `.claude/team/data/2026-09-22-analytics.json` (generated 2026-09-22T06:33:59Z). Window: thisWeek = 2026-09-15 to 2026-09-22, lastWeek = 2026-09-08 to 2026-09-15, last30Days = 2026-08-23 to 2026-09-22.

**Important caveat up front:** the owner has said the shop is new and Razorpay is still in test mode, so the orders and the 10 customer accounts in this file are most likely test data from development, not real customers. I'm reporting the numbers exactly as they appear in the file, but I am **not** treating any of it as a real trend — a jump from 0 to 2 orders or 0 to 10 customers is far too small a sample and too likely to be test activity to mean anything about actual demand.

## 1. KPI table — this week vs last week

| Metric | This week | Last week | Change |
|---|---|---|---|
| Orders placed | 2 | 0 | ↑ +2 |
| Paid orders | 1 | 0 | ↑ +1 |
| Revenue (₹, paid+shipped+delivered only) | 599 | 0 | ↑ +599 |
| Average order (₹) | 599 | 0 | ↑ +599 |
| Unpaid checkouts (pendingPayment + open carts) | 1 | 0 | ↑ +1 |
| New customers | 10 | 0 | ↑ +10 |
| Custom-page searches | 7 | 0 | ↑ +7 |

Notes:
- Unpaid checkouts this week = 1 pendingPayment order + 0 open carts (`carts.openLast7Days` is a single rolling 7-day figure in the file, not split into this-week/last-week, so I could only add it to the "this week" side).
- With only 2 orders total in the last 30 days, this is far too few to call a trend either way — every number above is a jump from a near-empty baseline, likely because the shop only just started generating any activity (real or test).

## 2. Best sellers

**This week**

| Product | Variant | Units | Revenue (₹) |
|---|---|---|---|
| Shanaya Gold | Perfume · 30ml | 1 | 599 |

**Last 30 days** — same single line: Shanaya Gold, Perfume · 30ml, 1 unit, ₹599.

Only one paid order exists in the data, so this is one sale, not a pattern — too little to call it a "best seller" in the normal sense.

## 3. Stock

All 61 variants are above their threshold — `outOfStock` and `lowStock` are both empty in the file. Nothing needs restocking right now.

## 4. Custom & Inspired page

7 searches this week (0 last week — again, too few to trend). Catalogue for this page: 185 listed / 185 available fragrances.

**Top queries this week:**

| Query | Searches | Matches |
|---|---|---|
| dior | 4 | 8 |
| aventus | 1 | 3 |
| 100ml | 1 | 0 |
| sauage | 1 | 0 |

**No-match queries (the gold — what people want but the list doesn't have):**
- **"sauage"** — 1 search, 0 matches. This is almost certainly a typo for "Sauvage" (guessing, not confirmed) — worth checking if Sauvage-inspired oil is already on the list under a different spelling, or adding it if not.
- **"100ml"** — 1 search, 0 matches. This isn't a fragrance name, it's a size request. The Custom & Inspired list may not carry a 100ml size at all — worth checking if that's a real gap or just a customer expecting a size the shop doesn't offer.

## 5. Content

- 10 drafts waiting for approval, 0 approved, 0 rejected, 0 published.
- Published this week: 0.
- Approved-but-no-time-slot: 0.
- Failed auto-posts: none logged.
- Rejected in last 30 days: none logged (so nothing for the Content agent to adjust based on owner feedback yet).

## 6. Three suggestions

1. **4 of 19 products (21%) have no photo** — al-noor-bakhoor, dubai-oud, silver-scent, summer-oud. These can't look their best (or may not display properly) on the shop page until photos are added.
2. **10 content drafts are waiting and 0 have been approved or published this week** — the content pipeline is stalled at the approval step. Reviewing even 2-3 of the 10 drafts would get the Content agent's work actually reaching customers.
3. **"sauage" and "100ml" both had 0 matches on the Custom & Inspired page this week** — 2 of the 7 searches (29%) found nothing. Checking these two (a likely Sauvage typo, and a possible missing 100ml size) would close visible gaps for people actively searching.

*(Order/revenue/customer numbers are excluded from these suggestions on purpose — with 2 total orders and likely test data, any suggestion built on them would not be trustworthy.)*

## 7. Owner ke liye (Hinglish)

- Is hafte 2 order aaye hain, lekin lagta hai ye Razorpay test mode ke test orders hain, real customer orders nahi — isliye inpar bharosa nahi karna.
- Paisa: sirf ₹599 (1 paid order) — ye bhi test data lag raha hai, real kamai nahi maan sakte abhi.
- 10 naye "customer" bhi is hafte dikhe hain — yeh bhi shayad development/testing ke dauran bane the, real customers nahi.
- Kya bik raha hai: sirf Shanaya Gold (Perfume 30ml) ka 1 sale dikha — itna kam data hai ki "best seller" nahi bol sakte.
- Stock sab theek hai — koi bhi variant khatam ya kam nahi hai (61 mein se 61 sahi).
- Log kya dhoondh rahe hain: Dior aur Aventus type fragrance sabse zyada search hue. "sauage" (shayad Sauvage) aur "100ml" size — inka kuch match nahi mila, ek baar dekh lena.
- 3 sujhaav: (1) 4 product ki photo missing hai — daal do. (2) 10 content draft pending hain, kam se kam kuch approve karo taaki post hone lage. (3) Custom page par "sauage" aur "100ml" search check karo — customer kuch dhoond rahe hain jo list mein clear nahi hai.
