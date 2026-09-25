# Shafaaf Perfumes — Studio Brief
**Date:** 2026-09-25
**Scope:** Photo gap audit (per product, per form), ChatGPT prompts for every gap, photo fixes for this week's post drafts, and phone-shot video/Reel plans.

All facts below come from `js/data/products.js` and what is actually sitting in `images/` (Globbed and opened directly — nothing assumed). `images/_originals/` was ignored, as instructed; it holds PNG/pre-webp source files already converted and used elsewhere.

---

## 0. Most urgent first — a post this week has no picture

Checked `.claude/team/content/2026-09-25-drafts.json` (8 drafts). Only one has `imageUrl: null`:

| Draft | Platform | Problem | Fix |
|---|---|---|---|
| `2026-10-03-instagram-custom-inspired-autumn` — "Custom & Inspired — Saturday page reminder" | Instagram | `imageUrl: null` — **Instagram will refuse to auto-post this**, it has no photo. | You told me this one's already been fixed by hand in the admin, using `images/logo-full.webp` and `images/oud-kaaba-attar.webp` as a stopgap. Those exist and will post fine. **But** they're a logo and an unrelated product's attar bottle — neither actually shows "Custom & Inspired." A purpose-made brand image would read much better and you'll need it again (this post repeats). Prompt below. |

All 7 other drafts already point at real files in `images/` — checked each one against the Glob list, all present.

```
CUSTOM & INSPIRED — brand image for the search-page promo post
A single elegant attar bottle: tall slim glass vial, ornate gold
filigree cap, gold "SHAFAAF PERFUMES" label, sitting in soft warm
studio light against a plain warm backdrop, with a faint magnifying
glass resting beside it on the table (nothing else in frame) to hint
at "search and find your match" — no other brand's bottle or logo
anywhere in shot.
Save as: custom-inspired-brand.webp
Portrait 2:3 (1024 x 1536), no text anywhere except the label.
```

---

## 1. Photo gap audit — per product, per form

The shop needs **one photo per form** a product is sold in (the attar vial in the Attar section, the perfume bottle in Perfume, the jar in Bakhoor). I opened every referenced file to check, not just checked the filename exists — a few products turned out to be quietly reusing one photo for both forms, which the analytics export doesn't catch (see note below the table).

| # | Product | Form missing | What actually shows right now | Urgency |
|---|---|---|---|---|
| 1 | **Al Noor** (bakhoor) | Bakhoor jar — **no photo at all** (`image: null` in products.js) | Placeholder art / blank | **Critical** — this is the only product with zero real photos |
| 2 | **Shanaya Gold** | Perfume bottle | The Attar vial photo (`shanaya-gold.webp`) is shown in the Perfume section too — same file both places | High |
| 3 | **Khamra Qahwa** | Perfume bottle | Same problem — `khamra-qahwa.webp` (the attar vial) fills both sections | High |
| 4 | **Yemberzal** | Perfume bottle | Same problem — `yemberzal-2.webp` (the attar vial) fills both sections | High |
| 5 | **White Oud Spl** | Perfume bottle | Same problem — `white-oud-spl.webp` (the attar vial) fills both sections | High |
| 6 | **Velvet Petal** | Attar vial | The Perfume bottle photo (`velvet-petal-perfume.webp`) is shown in the Attar section too — the Attar variant has no `image` of its own in the code | High |

Everything else I checked — Khamrah Spl, Purple Oud, Musk Rijali Super, Dubai Oud, Summer Oud, Silver Scent, Ameer Al Oud Gold, Oud Kaaba, and the other four bakhoor (Amber Oud, Al Kaaf, Amir Al Oud, Khamrah) — has two visibly different photos, one per form, opened and confirmed by eye.

### Analytics cross-check
`.claude/team/data/2026-09-25-analytics.json` → `catalog.productsWithoutPhoto` lists only `["al-noor-bakhoor"]`. **That's correct as far as it goes, but it disagrees with the fuller picture above.** The analytics export only checks whether a product's top-level `image` field is null — it can't see that a variant is silently reusing the *other* form's photo. Gaps #2–#6 are real (a customer browsing Perfume for Shanaya Gold, Khamra Qahwa, Yemberzal or White Oud Spl sees an attar vial, not a spray bottle; a customer browsing Attar for Velvet Petal sees a spray bottle, not a vial) but they won't show up in that export. Worth mentioning to whoever maintains `analytics:export` — it could check per-variant images too, not just the product-level one — but that's a backend change, not something I can or should touch.

### Also noticed — worth a re-do someday, not urgent
Three existing Attar photos (`oud-magestic-attar.webp`, `musk-rijali-super-attar.webp`, `oud-kaaba-attar.webp`) are wide promotional-banner layouts with a paragraph of headline text down one side, rather than the plain portrait bottle shot the rest of the catalog uses. They have photos, so they're not gaps — but they're exactly the "headline text that gets chopped mid-word by the site's 4:5 frames" problem you've hit before. Confirm on your phone whether these three look right on the live product page; if any text is cut off, replace with a plain portrait shot next time you're doing a photo batch. Not urgent enough to redo this week.

---

## 2. ChatGPT prompts — one per gap, paste one block at a time

Match to the shop's existing look, confirmed by opening the files:
- **Attar vial:** tall slim glass, ornate gold filigree cap, gold "SHAFAAF PERFUMES" label, warm soft studio light, plain warm background.
- **Perfume bottle:** round **white** ball cap (not gold), gold "SHAFAAF PERFUMES" label, same soft warm light.
- **Bakhoor jar — correction:** the brief I was given described the four existing jars as "black jar, gold lid." Having actually opened all four files, that's not quite what's there — they're **gold/brass cylindrical jars with a black glass rim, wrapped in a kraft-paper label with bold red lettering** ("BEST QUALITY / 100% ORIGINAL PRODUCT / 40 GRAMS WHEN PACKED" in small print), photographed in pairs — one jar closed, one tipped on its side with the lid resting against it — on a dark wood table, with dried oud/agarwood chips scattered around and a wisp of incense smoke in the background. The Al Noor prompt below matches what's actually there, not the black-jar description, so it sits in the row as a matching set.

### Gap 1 — Al Noor Bakhoor (no photo at all — do this one first)

```
Product photo for a bakhoor (scented wood chips) jar, to match an
existing set of four: a gold/brass cylindrical jar with a black glass
rim and a gold lid, wrapped in a kraft-paper label printed with bold
red serif lettering reading "AL NOOR" and smaller red text below
reading "BEST QUALITY / 100% ORIGINAL PRODUCT / 40 GRAMS WHEN PACKED".
Show two jars: one standing closed, one lying on its side with the
lid removed resting beside it. Place them on a dark polished wood
table with a few dried oud (agarwood) chips scattered nearby and a
faint wisp of incense smoke drifting in the softly warm-lit
background — same mood as the shop's other bakhoor jars (Al Kaaf,
Amir Al Oud, Khamrah, Amber Oud). No other text anywhere on the jar
except the label.
Save as: al-noor-bakhoor.webp
Portrait 2:3 (1024 x 1536).
```

### Gap 2 — Shanaya Gold, Perfume bottle

```
Perfume bottle photo for Shanaya Gold, a gourmand fragrance (vanilla,
tuberose, cinnamon, warm spice, citrus, powdery). One bottle, clear
glass, round white ball cap with a thin gold collar, gold
"SHAFAAF PERFUMES" label reading "SHANAYA GOLD" beneath it, warm
golden liquid visible inside. Soft warm studio light, warm-toned
background (candlelight, soft gold tones) echoing the brand's existing
photography — nothing overtly Ramadan/festive, just warm and elegant.
Save as: shanaya-gold-perfume.webp
Portrait 2:3 (1024 x 1536), only the bottle, plain background, no text
anywhere except the label.
```

### Gap 3 — Khamra Qahwa, Perfume bottle

```
Perfume bottle photo for Khamra Qahwa, a gourmand fragrance built on
Arabic coffee (coffee, warm spice, vanilla, amber, powdery). One
bottle, clear glass, round white ball cap with a thin gold collar,
gold "SHAFAAF PERFUMES" label reading "KHAMRA QAHWA" beneath it,
amber-gold liquid visible inside. Soft warm studio light, warm
coffee-toned background (a few coffee beans softly out of focus is
fine), matching the shop's existing warm, elegant style.
Save as: khamra-qahwa-perfume.webp
Portrait 2:3 (1024 x 1536), only the bottle, plain background, no text
anywhere except the label.
```

### Gap 4 — Yemberzal, Perfume bottle

```
Perfume bottle photo for Yemberzal, a floral fragrance built around
rose (rose, woody, fruity, powdery, musky, amber, fresh). One bottle,
clear glass, round white ball cap with a thin gold collar, gold
"SHAFAAF PERFUMES" label reading "YEMBERZAL" beneath it, pale
golden liquid visible inside. Soft warm studio light, warm background
with a soft rose or floral accent out of focus, matching the shop's
existing warm, elegant style.
Save as: yemberzal-perfume.webp
Portrait 2:3 (1024 x 1536), only the bottle, plain background, no text
anywhere except the label.
```

### Gap 5 — White Oud Spl, Perfume bottle

```
Perfume bottle photo for White Oud Spl, a lighter, softened oud
fragrance (oud, woody, powdery, musky, warm spice — not heavy smoke).
One bottle, clear glass, round white ball cap with a thin gold collar,
gold "SHAFAAF PERFUMES" label reading "WHITE OUD SPL" beneath it, pale
golden liquid visible inside. Soft, bright, airy studio light against
a light warm-white/marble-toned background (lighter and softer than a
typical dark oud shot, to match this fragrance's "lighter take on oud"
character and the shop's existing white-marble attar photo for this
product).
Save as: white-oud-spl-perfume.webp
Portrait 2:3 (1024 x 1536), only the bottle, plain background, no text
anywhere except the label.
```

### Gap 6 — Velvet Petal, Attar vial

```
Attar vial photo for Velvet Petal, a soft gourmand fragrance (vanilla,
pale woods, fresh, powdery, sweet). One tall slim glass vial, ornate
gold filigree cap, gold "SHAFAAF PERFUMES" label reading
"VELVET PETAL" beneath it, pale golden oil visible inside. Soft warm
studio light, blush-pink and gold background with soft rose petals
softly out of focus — echoing the shop's existing Velvet Petal perfume
bottle photo (which also uses pink peony/rose petals) so the two forms
read as a matching pair.
Save as: velvet-petal-attar.webp
Portrait 2:3 (1024 x 1536), only the bottle, plain background, no text
anywhere except the label.
```

---

## 3. Optional — the three banner-style Attar photos, if you want to redo them later

Not urgent (these products do have a photo), but here for whenever you're doing a photo batch and want the Attar section to look like the rest of the catalog instead of a banner:

```
Attar vial photo for Oud Magestic (oud, leather, coffee, amber, rose,
patchouli — dark and commanding). One tall slim glass vial, ornate
gold filigree cap, gold "SHAFAAF PERFUMES" label reading
"OUD MAGESTIC" beneath it, dark amber oil visible inside. Warm, dim,
opulent studio light — dark wood or dark marble background, a few
dried oud chips or coffee beans softly out of focus.
Save as: oud-magestic-attar-v2.webp
Portrait 2:3 (1024 x 1536), only the bottle, plain background, no text
anywhere except the label.
```

```
Attar vial photo for Musk Rijali Super (musky, sweet, powdery — a
clean everyday musk). One tall slim glass vial, ornate gold filigree
cap, gold "SHAFAAF PERFUMES" label reading "MUSK RIJALI SUPER"
beneath it, pale golden oil visible inside. Soft, bright, airy studio
light, white/cream background with soft white florals out of focus,
matching the existing Musk Rijali Super perfume bottle photo's mood.
Save as: musk-rijali-super-attar-v2.webp
Portrait 2:3 (1024 x 1536), only the bottle, plain background, no text
anywhere except the label.
```

```
Attar vial photo for Oud Kaaba (oud, patchouli, leather, lavender,
earthy — deep and reverent). One tall slim glass vial, ornate gold
filigree cap, gold "SHAFAAF PERFUMES" label reading "OUD KAABA"
beneath it, dark amber oil visible inside. Warm golden studio light,
dark background with dried oud/agarwood pieces softly out of focus.
Save as: oud-kaaba-attar-v2.webp
Portrait 2:3 (1024 x 1536), only the bottle, plain background, no text
anywhere except the label.
```

---

## 4. Video / Reel shot lists

All vertical **9:16**, all shootable on a phone, no studio, no paid music (use Instagram's or YouTube's built-in library only). 15–25 seconds, 3–6 shots each.

### A — "The shelf" (make this one tonight — zero new photos needed)
Assembled entirely from photos already in `images/`: a slow zoom/pan across 5 existing bottle photos, cut to a beat from the in-app music library. No camera work required.
1. (0–4s) `shanaya-gold.webp` — slow zoom in, on-screen text: "The Fragrance of Kashmir"
2. (4–8s) `oud-kaaba-perfume.jpg` — slow pan left to right
3. (8–12s) `dubai-oud-perfume.webp` — slow zoom in
4. (12–16s) `khamrah-bakhoor.webp` — slow zoom in, on-screen text: "Perfume. Attar. Bakhoor."
5. (16–20s) `velvet-petal-perfume.webp` — slow zoom out to reveal full bottle, on-screen text: "Shafaaf Perfumes — WhatsApp +91 97969 06804"
Caption line: "Perfume, attar, aur bakhoor — sab ek hi jagah. Link in bio."

### B — Unboxing an order (next order that goes out)
1. (0–3s) Hands lifting the packed parcel off a table, on-screen text: "Aapka order pack ho gaya"
2. (3–8s) Tape being peeled back, box opening
3. (8–14s) Product(s) lifted out one by one, labels facing camera
4. (14–19s) Close-up: attar vial or perfume bottle turned slowly in hand, catching light
5. (19–24s) Box closed again / handed to courier bag, on-screen text: "Free shipping, poore India mein"
Caption line: "Har order sambhal ke pack hota hai. Order karein — link in bio."

### C — Bakhoor smoke, evening mood (needs a burner/charcoal you already own)
1. (0–3s) Dim room, burner glowing, on-screen text: "Sham ho gayi"
2. (3–8s) Hand places one bakhoor chip onto the burner (any of the 5 — pick whichever you're burning that evening)
3. (8–16s) Close-up, smoke curling upward, warm light behind it
4. (16–21s) Wider shot — smoke drifting across the room, a chai cup or blanket in frame for mood
5. (21–25s) End card: product jar + "40g ₹499" + WhatsApp number
Caption line: "Ek chip, poora ghar khushboo se bhar jaye. [Bakhoor name] — 40g ₹499."

### D — "Which one for Eid?" three-bottle pick (needs 5 minutes with three bottles you have on hand)
1. (0–4s) Three bottles lined up on a table (e.g. Oud Kaaba, Khamrah Spl, Ameer Al Oud Gold), on-screen text: "Eid ke liye kaunsa?"
2. (4–9s) Hand picks up bottle 1, label to camera, on-screen text: its name + one-line mood ("bold and deep")
3. (9–14s) Hand picks up bottle 2, same treatment
4. (14–19s) Hand picks up bottle 3, same treatment
5. (19–24s) All three back together, on-screen text: "DM/WhatsApp karke poochho — hum madad karenge"
Caption line: "Teen mein se ek chuno, ya humse poochho — WhatsApp +91 97969 06804."

---

## Hard-rule reminders (nothing here breaks them, just repeating for the record)
- I generated zero images and edited zero files in `images/` or `products.js`. Everything above is text for you to paste into ChatGPT or shoot yourself.
- Every prompt asks for **native resolution, 2:3 portrait (1024 x 1536)** — do not let ChatGPT or any editor shrink the result before saving; save as WebP quality 90, same as the rest of `images/`.
- No other brand's bottle, logo or packaging appears in any prompt.
- Product names, families, notes and prices used above are taken only from `js/data/products.js` — nothing invented.
