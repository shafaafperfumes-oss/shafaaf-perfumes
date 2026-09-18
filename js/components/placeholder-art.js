/**
 * Generated placeholder product art.
 * ------------------------------------------------------------
 * Real photography does not exist yet for most SKUs. Rather than
 * showing an empty gray box, every product without a photo gets
 * a consistent, on-brand generated "bottle" illustration tinted
 * to its fragrance family, with the product's monogram etched
 * into the cap. This keeps the shop grid visually premium and
 * gives a clear, obvious slot for real photography to drop into
 * later (see Product.image / Product.imageAlt).
 */

var SHAFAAF_FAMILY_TINTS = {
  Gourmand: { a: "#e3c491", b: "#b5843f" },
  Spicy: { a: "#d99a6a", b: "#a1552b" },
  Floral: { a: "#e3b9c2", b: "#b06e7e" },
  Musk: { a: "#cdc2b3", b: "#948673" },
  Woody: { a: "#a68a68", b: "#5f4a33" },
  Fresh: { a: "#b9cabd", b: "#7d9585" },
  Oud: { a: "#9c7c55", b: "#4a3722" }
};

var shafaafPlaceholderSeq = 0;

function shafaafPlaceholderBottle(product) {
  shafaafPlaceholderSeq += 1;
  var gid = "sph-grad-" + shafaafPlaceholderSeq;
  var tint = SHAFAAF_FAMILY_TINTS[product.family] || SHAFAAF_FAMILY_TINTS.Woody;
  var initial = product.name.trim().charAt(0).toUpperCase();

  return (
    '<div class="placeholder-bottle" style="background:radial-gradient(120% 100% at 50% 15%,' + tint.a + '22,transparent 60%),' +
    'linear-gradient(160deg,' + tint.a + '33,' + tint.b + '18)">' +
    '<svg viewBox="0 0 120 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + product.name + ' bottle illustration">' +
    '<defs>' +
    '<linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="' + tint.a + '"/>' +
    '<stop offset="100%" stop-color="' + tint.b + '"/>' +
    '</linearGradient>' +
    '</defs>' +
    '<rect x="45" y="18" width="30" height="20" rx="4" fill="' + tint.b + '"/>' +
    '<rect x="50" y="8" width="20" height="14" rx="3" fill="' + tint.b + '" opacity="0.85"/>' +
    '<path d="M40 38 L80 38 L88 56 L88 178 Q88 188 78 188 L42 188 Q32 188 32 178 L32 56 Z" fill="url(#' + gid + ')" stroke="' + tint.b + '" stroke-width="1"/>' +
    '<rect x="42" y="96" width="36" height="46" rx="2" fill="#fffdfb" opacity="0.88"/>' +
    '<text x="60" y="124" text-anchor="middle" font-family="Playfair Display, serif" font-size="22" fill="' + tint.b + '">' + initial + '</text>' +
    '<rect x="32" y="56" width="56" height="6" fill="#ffffff" opacity="0.18"/>' +
    '</svg>' +
    '</div>'
  );
}

/** Returns the media (image or placeholder) HTML for a product card / gallery */
function shafaafProductMedia(product, opts) {
  opts = opts || {};
  var sizeAttr = opts.eager ? '' : ' loading="lazy"';
  var primary = shafaafProductImageFor(product, opts.type);
  if (primary) {
    // Hover shows the other photo we have — the second product shot, or the
    // product's main shot when a type-specific one is in front.
    var alt = [product.imageAlt, product.image].filter(function (src) { return src && src !== primary; })[0] || null;
    var html = '<img class="is-primary" src="' + primary + '" alt="' + product.name + '"' + sizeAttr + '>';
    if (alt) {
      html += '<img class="is-alt" src="' + alt + '" alt=""' + sizeAttr + '>';
    }
    return html;
  }
  return shafaafPlaceholderBottle(product);
}
