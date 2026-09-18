/**
 * SHAFAAF PERFUMES — PRODUCT CATALOG
 * ------------------------------------------------------------
 * At runtime the shop shows what the backend's database holds:
 * js/lib/catalog-loader.js fetches it and swaps it in through
 * `shafaafReplaceCatalog` before any page draws. The list below is
 * what the shop falls back to when the backend cannot be reached,
 * and it is also what `npm run db:seed` in backend/ loads into the
 * database in the first place — so it must keep exactly this shape.
 * Every page reads product data only through the accessor
 * functions at the bottom of this file, never this array directly.
 *
 * @typedef {Object} SizeOption
 * @property {string} label   e.g. "30ml"
 * @property {number} ml      numeric volume for sorting/filtering
 * @property {number} price   price in Indian Rupees (INR)
 * @property {number} [compareAt] the regular price when `price` is an offer — shown struck through
 *
 * @typedef {Object} ProductVariant
 * @property {'Perfume'|'Attar'} type
 * @property {SizeOption[]} sizes
 *
 * @typedef {Object} Product
 * @property {string} id            stable slug, used in URLs and cart line ids
 * @property {string} name          exact product name — do not alter
 * @property {string} family        fragrance family, derived from notes, used for filtering
 * @property {string} gender        audience tag, used for filtering
 * @property {string[]} notes       exact fragrance notes/accords — do not alter
 * @property {string} description   editorial copy
 * @property {string|null} image    primary photo path, or null to use generated placeholder art
 * @property {string|null} imageAlt secondary photo path shown on hover, or null
 *   A variant may also carry its own `image` (the perfume bottle vs the attar
 *   vial); the type sections, product page and quick view prefer it.
 * @property {boolean} bestseller
 * @property {boolean} isNew
 * @property {number} rating        0-5, mock until a reviews backend exists
 * @property {number} reviewCount   mock until a reviews backend exists
 * @property {ProductVariant[]} variants
 */

/** @type {Product[]} */
const SHAFAAF_PRODUCTS = [
  {
    id: "shanaya-gold",
    name: "Shanaya Gold",
    family: "Gourmand",
    gender: "Unisex",
    notes: ["Vanilla", "Sweet", "Tuberose", "Cinnamon", "Warm Spicy", "Citrus", "Powdery"],
    description: "A radiant gourmand opening in bright citrus before settling into tuberose and warm cinnamon, cushioned by vanilla and soft powder.",
    image: "images/shanaya-gold.webp",
    imageAlt: null,
    bestseller: true,
    isNew: false,
    rating: 4.8,
    reviewCount: 126,
    variants: [
      { type: "Perfume", sizes: [{ label: "30ml", ml: 30, price: 599 }, { label: "50ml", ml: 50, price: 899 }] },
      { type: "Attar", image: "images/shanaya-gold.webp", sizes: [{ label: "6ml", ml: 6, price: 349 }, { label: "12ml", ml: 12, price: 699 }] }
    ]
  },
  {
    id: "khamrah-spl",
    name: "Khamrah Spl",
    family: "Spicy",
    gender: "Unisex",
    notes: ["Sweet", "Warm Spicy", "Vanilla", "Amber", "Cinnamon", "Woody", "Fresh Spicy", "Fruity"],
    description: "Rich and resinous, layering warm spice and amber over a woody base, rounded out with a fruity, vanilla-laced sweetness.",
    image: "images/khamrah-spl-perfume.webp",
    imageAlt: "images/khamrah-spl.webp",
    bestseller: true,
    isNew: false,
    rating: 4.9,
    reviewCount: 214,
    variants: [
      { type: "Perfume", image: "images/khamrah-spl-perfume.webp", sizes: [{ label: "30ml", ml: 30, price: 599 }, { label: "50ml", ml: 50, price: 899 }] },
      { type: "Attar", image: "images/khamrah-spl.webp", sizes: [{ label: "6ml", ml: 6, price: 349 }, { label: "12ml", ml: 12, price: 699 }] }
    ]
  },
  {
    id: "khamra-qahwa",
    name: "Khamra Qahwa",
    family: "Gourmand",
    gender: "Unisex",
    notes: ["Warm Spicy", "Sweet", "Vanilla", "Coffee", "Amber", "Powdery"],
    description: "An ode to Arabic coffee — dark, roasted coffee notes meet warm amber and vanilla for a powdery, café-noir finish.",
    image: "images/khamra-qahwa.webp",
    imageAlt: "images/khamra-qahwa-2.webp",
    bestseller: false,
    isNew: true,
    rating: 4.7,
    reviewCount: 58,
    variants: [
      { type: "Perfume", sizes: [{ label: "30ml", ml: 30, price: 599 }, { label: "50ml", ml: 50, price: 899 }] },
      { type: "Attar", image: "images/khamra-qahwa.webp", sizes: [{ label: "6ml", ml: 6, price: 349 }, { label: "12ml", ml: 12, price: 699 }] }
    ]
  },
  {
    id: "yemberzal",
    name: "Yemberzal",
    family: "Floral",
    gender: "Unisex",
    notes: ["Rose", "Woody", "Fruity", "Powdery", "Floral", "Musky", "Warm Spicy", "Amber", "Metallic", "Fresh Spicy", "Citrus", "Animalic", "Fresh"],
    description: "An intricate floral bouquet built around rose, threaded with musk, amber and a fresh metallic edge for a signature scent with real depth.",
    image: "images/yemberzal-2.webp",
    imageAlt: "images/yemberzal.jpg",
    bestseller: true,
    isNew: false,
    rating: 4.9,
    reviewCount: 187,
    variants: [
      { type: "Perfume", sizes: [{ label: "30ml", ml: 30, price: 599 }, { label: "50ml", ml: 50, price: 899 }] },
      { type: "Attar", image: "images/yemberzal-2.webp", sizes: [{ label: "6ml", ml: 6, price: 349 }, { label: "12ml", ml: 12, price: 699 }] }
    ]
  },
  {
    id: "musk-rijali-super",
    name: "Musk Rijali Super",
    family: "Musk",
    gender: "Unisex",
    notes: ["Musky", "Sweet", "Powdery"],
    description: "A clean, confident musk — softly sweet and powdery, designed to sit close to the skin as an everyday signature.",
    image: "images/musk-rijali-super.webp",
    imageAlt: null,
    bestseller: false,
    isNew: false,
    rating: 4.6,
    reviewCount: 74,
    variants: [
      { type: "Perfume", image: "images/musk-rijali-super.webp", sizes: [{ label: "30ml", ml: 30, price: 599 }, { label: "50ml", ml: 50, price: 899 }] },
      { type: "Attar", sizes: [{ label: "6ml", ml: 6, price: 349 }, { label: "12ml", ml: 12, price: 699 }] }
    ]
  },
  {
    id: "purple-oud",
    name: "Purple Oud",
    family: "Floral",
    gender: "Unisex",
    notes: ["Fruity", "Sweet", "Rose", "Floral"],
    description: "A playful, fruity-floral built on rose petals and sweet orchard fruit — light, romantic, and easy to wear.",
    image: "images/purple-oud-perfume.webp",
    imageAlt: "images/purple-oud.webp",
    bestseller: false,
    isNew: false,
    rating: 4.5,
    reviewCount: 41,
    variants: [
      { type: "Perfume", image: "images/purple-oud-perfume.webp", sizes: [{ label: "30ml", ml: 30, price: 449 }, { label: "50ml", ml: 50, price: 649 }] },
      { type: "Attar", image: "images/purple-oud.webp", sizes: [{ label: "6ml", ml: 6, price: 249 }, { label: "12ml", ml: 12, price: 499 }] }
    ]
  },
  {
    id: "dubai-oud",
    name: "Dubai Oud",
    family: "Woody",
    gender: "Unisex",
    notes: ["Woody", "Warm Spicy", "Amber", "Powdery", "Patchouli"],
    description: "A classic Gulf-inspired woody composition — patchouli and amber wrapped in warm spice, grounded and unmistakably confident.",
    image: null,
    imageAlt: null,
    bestseller: false,
    isNew: false,
    rating: 4.7,
    reviewCount: 96,
    variants: [
      { type: "Perfume", sizes: [{ label: "30ml", ml: 30, price: 599 }, { label: "50ml", ml: 50, price: 899 }] },
      { type: "Attar", sizes: [{ label: "6ml", ml: 6, price: 349 }, { label: "12ml", ml: 12, price: 699 }] }
    ]
  },
  {
    id: "summer-oud",
    name: "Summer Oud",
    family: "Fresh",
    gender: "Unisex",
    notes: ["Floral", "Citrus", "Fresh", "Rose", "Fruity", "Woody"],
    description: "Bright citrus and rose over a soft woody base — a warm-weather composition that stays fresh from morning to evening.",
    image: null,
    imageAlt: null,
    bestseller: false,
    isNew: true,
    rating: 4.6,
    reviewCount: 33,
    variants: [
      { type: "Perfume", sizes: [{ label: "30ml", ml: 30, price: 599 }, { label: "50ml", ml: 50, price: 899 }] },
      { type: "Attar", sizes: [{ label: "6ml", ml: 6, price: 349 }, { label: "12ml", ml: 12, price: 699 }] }
    ]
  },
  {
    id: "silver-scent",
    name: "Silver Scent",
    family: "Fresh",
    gender: "Unisex",
    notes: ["Fruity", "Sweet", "Musky", "Powdery", "Fresh", "Tropical"],
    description: "A tropical-fruit accord softened with musk and powder — effortless, sweet, and instantly likeable.",
    image: null,
    imageAlt: null,
    bestseller: false,
    isNew: false,
    rating: 4.5,
    reviewCount: 29,
    variants: [
      { type: "Perfume", sizes: [{ label: "30ml", ml: 30, price: 499 }, { label: "50ml", ml: 50, price: 699 }] },
      { type: "Attar", sizes: [{ label: "6ml", ml: 6, price: 299 }, { label: "12ml", ml: 12, price: 599 }] }
    ]
  },
  {
    id: "velvet-petal",
    name: "Velvet Petal",
    family: "Gourmand",
    gender: "Unisex",
    notes: ["Vanilla", "Woody", "Fresh", "Powdery", "Sweet"],
    description: "Soft vanilla and pale woods, powdered and gently sweet — a velvety, close-to-skin scent built for comfort.",
    image: "images/velvet-petal-perfume.webp",
    imageAlt: "images/velvet-petal.jpg",
    bestseller: false,
    isNew: false,
    rating: 4.7,
    reviewCount: 52,
    variants: [
      { type: "Perfume", image: "images/velvet-petal-perfume.webp", sizes: [{ label: "30ml", ml: 30, price: 599 }, { label: "50ml", ml: 50, price: 899 }] },
      { type: "Attar", sizes: [{ label: "6ml", ml: 6, price: 349 }, { label: "12ml", ml: 12, price: 699 }] }
    ]
  },
  {
    id: "ameer-al-oud-gold",
    name: "Ameer Al Oud Gold",
    family: "Oud",
    gender: "Unisex",
    notes: ["Woody", "Vanilla", "Sweet", "Oud", "Powdery"],
    description: "Golden oud softened with vanilla and powder — opulent but balanced, built to be worn with quiet confidence.",
    image: "images/ameer-al-oud-gold-perfume-2.webp",
    imageAlt: "images/ameer-al-oud-gold-2.webp",
    bestseller: true,
    isNew: false,
    rating: 4.8,
    reviewCount: 103,
    variants: [
      { type: "Perfume", image: "images/ameer-al-oud-gold-perfume-2.webp", sizes: [{ label: "30ml", ml: 30, price: 599 }, { label: "50ml", ml: 50, price: 899 }] },
      { type: "Attar", image: "images/ameer-al-oud-gold-2.webp", sizes: [{ label: "6ml", ml: 6, price: 349 }, { label: "12ml", ml: 12, price: 699 }] }
    ]
  },
  {
    id: "white-oud-spl",
    name: "White Oud Spl",
    family: "Oud",
    gender: "Unisex",
    notes: ["Oud", "Woody", "Powdery", "Musky", "Warm Spicy"],
    description: "A lighter, softened take on oud — musky and powdery with a gentle warm-spice trail rather than heavy smoke.",
    image: "images/white-oud-spl.webp",
    imageAlt: null,
    bestseller: false,
    isNew: false,
    rating: 4.6,
    reviewCount: 47,
    variants: [
      { type: "Perfume", sizes: [{ label: "30ml", ml: 30, price: 499 }, { label: "50ml", ml: 50, price: 699 }] },
      { type: "Attar", image: "images/white-oud-spl.webp", sizes: [{ label: "6ml", ml: 6, price: 299 }, { label: "12ml", ml: 12, price: 599 }] }
    ]
  },
  {
    id: "oud-magestic",
    name: "Oud Magestic",
    family: "Oud",
    gender: "Unisex",
    notes: ["Warm Spicy", "Woody", "Leather", "Sweet", "Musky", "Coffee", "Amber", "Rose", "Patchouli", "Oud"],
    description: "A commanding oud composition — leather and patchouli under a dark coffee accord, finished with rose and warm amber.",
    image: null,
    imageAlt: null,
    bestseller: false,
    isNew: true,
    rating: 4.9,
    reviewCount: 39,
    variants: [
      { type: "Perfume", sizes: [{ label: "30ml", ml: 30, price: 599 }, { label: "50ml", ml: 50, price: 899 }] },
      { type: "Attar", sizes: [{ label: "6ml", ml: 6, price: 349 }, { label: "12ml", ml: 12, price: 699 }] }
    ]
  },
  {
    id: "oud-kaaba",
    name: "Oud Kaaba",
    family: "Oud",
    gender: "Unisex",
    notes: ["Oud", "Warm Spicy", "Fresh Spicy", "Patchouli", "Woody", "Musky", "Lavender", "Leathy", "Earthy"],
    description: "A deep, earthy oud rooted in patchouli and leather, lifted by lavender and fresh spice — reverent and long-lasting.",
    image: "images/oud-kaaba-perfume.jpg",
    imageAlt: "images/oud-kaaba-attar.webp",
    bestseller: true,
    isNew: false,
    rating: 4.8,
    reviewCount: 161,
    variants: [
      { type: "Perfume", image: "images/oud-kaaba-perfume.jpg", sizes: [{ label: "30ml", ml: 30, price: 599 }, { label: "50ml", ml: 50, price: 899 }] },
      { type: "Attar", image: "images/oud-kaaba-attar.webp", sizes: [{ label: "6ml", ml: 6, price: 349 }, { label: "12ml", ml: 12, price: 699 }] }
    ]
  },

  // ---- Bakhoor (scented wood chips for the home). For these the "ml"
  // number is grams — the size label carries the unit customers see.
  // Notes are the owner's: Amber Oud from the list, Khamrah and Amir Al Oud
  // as their attar namesakes. Al Kaaf and Al Noor have none yet.
  {
    id: "amber-oud-bakhoor",
    name: "Amber Oud",
    family: "Oud",
    gender: "Unisex",
    notes: ["Warm Spicy", "Sweet"],
    description: "Golden amber melting into smoky oud, laced with sweet warm spice. Place a single chip on the burner and within minutes the room glows with a rich, resinous warmth that lingers on curtains and clothes long after the smoke has faded. For slow evenings, honoured guests and moments worth remembering.",
    image: null,
    imageAlt: null,
    bestseller: false,
    isNew: true,
    rating: 0,
    reviewCount: 0,
    variants: [
      { type: "Bakhoor", sizes: [{ label: "40g", ml: 40, price: 499 }] }
    ]
  },
  {
    id: "al-kaaf-bakhoor",
    name: "Al Kaaf",
    family: "Woody",
    gender: "Unisex",
    notes: [],
    description: "A classic bakhoor in the old Arabian tradition: deep, smooth and unhurried. Its slow, smoky warmth settles gently into every corner of the home, turning an ordinary evening into something serene. One chip is enough to scent an entire room.",
    image: null,
    imageAlt: null,
    bestseller: false,
    isNew: true,
    rating: 0,
    reviewCount: 0,
    variants: [
      { type: "Bakhoor", sizes: [{ label: "40g", ml: 40, price: 499 }] }
    ]
  },
  {
    id: "al-noor-bakhoor",
    name: "Al Noor",
    family: "Woody",
    gender: "Unisex",
    notes: [],
    description: "Al Noor means ‘the light’, and this bakhoor lives up to its name: soft, luminous and clean, with none of the heaviness. Burn it in the daytime, before guests arrive, or to freshen a room ahead of prayer and rest, and let a gentle, glowing fragrance fill the air.",
    image: null,
    imageAlt: null,
    bestseller: false,
    isNew: true,
    rating: 0,
    reviewCount: 0,
    variants: [
      { type: "Bakhoor", sizes: [{ label: "40g", ml: 40, price: 499 }] }
    ]
  },
  {
    id: "amir-al-oud-bakhoor",
    name: "Amir Al Oud",
    family: "Oud",
    gender: "Unisex",
    notes: ["Woody", "Vanilla", "Sweet", "Oud", "Powdery"],
    description: "The prince of oud. Smoky agarwood wrapped in vanilla, sweet powder and soft woods, regal, long-lasting and unmistakably luxurious. Burn it for celebrations, Fridays and the evenings when your home should smell like an occasion.",
    image: null,
    imageAlt: null,
    bestseller: false,
    isNew: true,
    rating: 0,
    reviewCount: 0,
    variants: [
      { type: "Bakhoor", sizes: [{ label: "40g", ml: 40, price: 399, compareAt: 499 }] }
    ]
  },
  {
    id: "khamrah-bakhoor",
    name: "Khamrah",
    family: "Spicy",
    gender: "Unisex",
    notes: ["Sweet", "Warm Spicy", "Vanilla", "Amber", "Cinnamon", "Woody", "Fresh Spicy", "Fruity"],
    description: "All the warmth of our best-loved Khamrah fragrance, made for the home. Sweet amber and vanilla, a whisper of cinnamon and warm spice, and a woody base that smoulders for hours. Rich, inviting and impossible to ignore.",
    image: null,
    imageAlt: null,
    bestseller: false,
    isNew: true,
    rating: 0,
    reviewCount: 0,
    variants: [
      { type: "Bakhoor", sizes: [{ label: "40g", ml: 40, price: 499 }] }
    ]
  }
];

/* ---------------------------------------------------------
   Accessors — all pages must read the catalog through these
   so a future API-backed implementation is a drop-in swap.
   --------------------------------------------------------- */

/**
 * Replaces the catalog in place with a list of the same shape (used by
 * the catalog loader once the backend answers). In place, not
 * reassigned, so every accessor above and below keeps working unchanged.
 */
function shafaafReplaceCatalog(products) {
  SHAFAAF_PRODUCTS.splice.apply(SHAFAAF_PRODUCTS, [0, SHAFAAF_PRODUCTS.length].concat(products));
}

function shafaafGetAllProducts() {
  return SHAFAAF_PRODUCTS;
}

function shafaafGetProductById(id) {
  return SHAFAAF_PRODUCTS.find(function (p) { return p.id === id; }) || null;
}

/**
 * The forms a fragrance is sold in. The shop is organised by these:
 * each has its own section, menu link and home-page tile. Bakhoor is
 * listed ahead of its products arriving so the section already exists.
 */
var SHAFAAF_PRODUCT_TYPES = [
  { key: "perfume", label: "Perfume", plural: "Perfumes", tagline: "Spray-on eau de parfum for everyday wear" },
  { key: "attar", label: "Attar", plural: "Attars", tagline: "Oil-based concentrates that last for hours" },
  { key: "bakhoor", label: "Bakhoor", plural: "Bakhoor", tagline: "Scented wood chips to perfume your home" }
];

function shafaafGetProductType(key) {
  return SHAFAAF_PRODUCT_TYPES.find(function (t) { return t.key === key; }) || null;
}

/** Variant groups of the given type key, or all of them when no key is given. */
function shafaafVariantsOfType(product, typeKey) {
  if (!typeKey) return product.variants;
  return product.variants.filter(function (v) { return v.type.toLowerCase() === typeKey; });
}

function shafaafProductHasType(product, typeKey) {
  return shafaafVariantsOfType(product, typeKey).length > 0;
}

/** The cheapest size of the given type (or overall) — what a card's "From" price shows. */
/**
 * Photo for one form of a product: the variant's own image when it has one,
 * otherwise the product's main photo. `typeKey` is "perfume" | "attar" |
 * "bakhoor" (case-insensitive) or null for "whatever the product shows".
 */
function shafaafProductImageFor(product, typeKey) {
  if (typeKey && product.variants) {
    var key = String(typeKey).toLowerCase();
    for (var i = 0; i < product.variants.length; i++) {
      var v = product.variants[i];
      if (v.image && String(v.type).toLowerCase() === key) return v.image;
    }
  }
  return product.image || null;
}

function shafaafGetLowestSize(product, typeKey) {
  var best = null;
  shafaafVariantsOfType(product, typeKey).forEach(function (v) {
    v.sizes.forEach(function (s) { if (!best || s.price < best.price) best = s; });
  });
  return best;
}

/** Price markup with the regular price struck through when a size is on offer. */
function shafaafPriceHTML(size, qty) {
  qty = qty || 1;
  var html = '<span class="price__current">' + shafaafFormatPrice(size.price * qty) + '</span>';
  if (size.compareAt && size.compareAt > size.price) {
    html += ' <span class="price__compare">' + shafaafFormatPrice(size.compareAt * qty) + '</span>';
  }
  return html;
}

function shafaafGetLowestPrice(product, typeKey) {
  var min = Infinity;
  shafaafVariantsOfType(product, typeKey).forEach(function (v) {
    v.sizes.forEach(function (s) { if (s.price < min) min = s.price; });
  });
  return min;
}

function shafaafGetHighestPrice(product, typeKey) {
  var max = 0;
  shafaafVariantsOfType(product, typeKey).forEach(function (v) {
    v.sizes.forEach(function (s) { if (s.price > max) max = s.price; });
  });
  return max;
}

function shafaafGetFamilies() {
  var set = {};
  SHAFAAF_PRODUCTS.forEach(function (p) { set[p.family] = true; });
  return Object.keys(set).sort();
}

/** Products with at least one size on offer (a struck-through regular price). */
function shafaafGetOffers() {
  return SHAFAAF_PRODUCTS.filter(function (p) {
    return p.variants.some(function (v) { return v.sizes.some(function (s) { return s.compareAt && s.compareAt > s.price; }); });
  });
}

function shafaafGetBestsellers() {
  return SHAFAAF_PRODUCTS.filter(function (p) { return p.bestseller; });
}

function shafaafGetNewArrivals() {
  return SHAFAAF_PRODUCTS.filter(function (p) { return p.isNew; });
}

function shafaafGetRelatedProducts(product, limit) {
  limit = limit || 4;
  var sameFamily = SHAFAAF_PRODUCTS.filter(function (p) {
    return p.id !== product.id && p.family === product.family;
  });
  var rest = SHAFAAF_PRODUCTS.filter(function (p) {
    return p.id !== product.id && p.family !== product.family;
  });
  return sameFamily.concat(rest).slice(0, limit);
}

function shafaafSearchProducts(query) {
  var q = (query || "").trim().toLowerCase();
  if (!q) return [];
  return SHAFAAF_PRODUCTS.filter(function (p) {
    if (p.name.toLowerCase().indexOf(q) !== -1) return true;
    if (p.family.toLowerCase().indexOf(q) !== -1) return true;
    return p.notes.some(function (n) { return n.toLowerCase().indexOf(q) !== -1; });
  });
}
