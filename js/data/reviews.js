/**
 * SHAFAAF PERFUMES — REVIEW / TESTIMONIAL DATA
 * ------------------------------------------------------------
 * Placeholder content until a real reviews backend exists.
 * Shaped so a future API response can replace these arrays
 * without touching the render code in pages/*.js.
 */

var SHAFAAF_TESTIMONIALS = [
  {
    name: "Ayesha R.",
    location: "Lahore",
    rating: 5,
    text: "Khamrah Spl lasts the entire day and the amber-vanilla trail is exactly what I was hoping for. Packaging felt genuinely premium too."
  },
  {
    name: "Hamza K.",
    location: "Karachi",
    rating: 5,
    text: "Oud Kaaba is unlike anything else at this price point — deep, earthy, long-lasting. Ordered a backup bottle within a week."
  },
  {
    name: "Sana M.",
    location: "Islamabad",
    rating: 4,
    text: "Shanaya Gold is my everyday signature now. Warm, a little sweet, never overpowering. Delivery was quick and well packed."
  },
  {
    name: "Bilal T.",
    location: "Faisalabad",
    rating: 5,
    text: "Ameer Al Oud Gold is the closest I've found to designer oud fragrances at a fraction of the price. Genuinely impressed."
  },
  {
    name: "Zoya A.",
    location: "Multan",
    rating: 5,
    text: "Yemberzal is beautifully layered — rose up front, soft musk underneath. Compliments every single time I wear it."
  }
];

/**
 * Generates a small set of sample reviews for a product detail
 * page. Deterministic (seeded by product id) so the same product
 * always shows the same placeholder reviews on reload.
 */
function shafaafGetProductReviews(product) {
  var pool = [
    { name: "Fatima S.", text: "Better projection and longevity than I expected. The scent settles into something really elegant after an hour." },
    { name: "Ali H.", text: "Bought this as a gift and ended up ordering one for myself. The notes are true to the description." },
    { name: "Mehak I.", text: "Attar version is incredible value — a little goes a long way and it lasts well past 8 hours." },
    { name: "Usman F.", text: "Exactly the fragrance family I was looking for. Will be reordering the larger size next time." },
    { name: "Noor J.", text: "Shipping was fast and the bottle arrived carefully packaged. Scent is warm and not overpowering." }
  ];
  var seed = 0;
  for (var i = 0; i < product.id.length; i++) seed += product.id.charCodeAt(i);
  var count = 2 + (seed % 3);
  var out = [];
  for (var j = 0; j < count; j++) {
    var base = pool[(seed + j) % pool.length];
    out.push({
      name: base.name,
      text: base.text,
      rating: 4 + ((seed + j) % 2),
      daysAgo: 4 + ((seed + j * 7) % 60)
    });
  }
  return out;
}
