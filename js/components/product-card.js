/**
 * Product card — rendering + delegated event wiring.
 * Delegation means a page can inject any number of cards via
 * innerHTML at any time (grid re-render on filter/sort) without
 * re-binding listeners.
 */

/**
 * opts.type ("perfume" | "attar" | "bakhoor") shows the price of that
 * form only and opens the product with it pre-selected — used by the
 * shop's type sections. Without it the card covers every form.
 */
function shafaafRenderProductCard(product, opts) {
  opts = opts || {};
  var type = opts.type || null;
  var href = "product.html?id=" + product.id + (type ? "&type=" + type : "");
  var lowest = shafaafGetLowestPrice(product, type);
  var highest = shafaafGetHighestPrice(product, type);
  var priceLabel = lowest === highest ? shafaafFormatPrice(lowest) : "From " + shafaafFormatPrice(lowest);
  var isWishlisted = typeof ShafaafWishlist !== "undefined" && ShafaafWishlist.has(product.id);
  var badges = "";
  if (product.bestseller) badges += '<span class="badge badge--bestseller">Bestseller</span>';
  if (product.isNew) badges += '<span class="badge badge--new">New</span>';

  return (
    '<article class="product-card" data-product-id="' + product.id + '">' +
      '<div class="product-card__media">' +
        '<a href="' + href + '" aria-label="View ' + product.name + '">' +
          shafaafProductMedia(product) +
        '</a>' +
        (badges ? '<div class="product-card__badges">' + badges + '</div>' : '') +
        '<button type="button" class="product-card__wishlist" data-wishlist-toggle="' + product.id + '" aria-pressed="' + isWishlisted + '" data-active="' + isWishlisted + '" aria-label="Add ' + product.name + ' to wishlist">' +
          shafaafIcon("heart") +
        '</button>' +
        '<div class="product-card__quick">' +
          '<button type="button" class="btn btn--outline-light btn--sm btn--block" data-quick-view="' + product.id + '">Quick View</button>' +
        '</div>' +
      '</div>' +
      '<div class="product-card__body">' +
        '<span class="product-card__collection">' + product.family + '</span>' +
        '<h3 class="product-card__name"><a href="' + href + '">' + product.name + '</a></h3>' +
        '<div class="rating"><span class="rating__stars">' + shafaafStarRow(product.rating) + '</span><span class="rating__count">(' + product.reviewCount + ')</span></div>' +
        '<p class="product-card__notes">' + shafaafTruncate(product.notes.join(", "), 58) + '</p>' +
        '<div class="product-card__footer">' +
          '<span class="price"><span class="price__current">' + priceLabel + '</span></span>' +
          '<button type="button" class="btn btn--icon btn--metal" data-quick-view="' + product.id + '" aria-label="Add ' + product.name + ' to cart">' + shafaafIcon("bag") + '</button>' +
        '</div>' +
      '</div>' +
    '</article>'
  );
}

function shafaafRenderProductGrid(products, opts) {
  opts = opts || {};
  if (!products.length) {
    return (
      '<div class="state-block">' +
        shafaafIcon("search", "state-block__icon") +
        '<h3 class="state-block__title">No fragrances found</h3>' +
        '<p class="state-block__text">Try adjusting your filters or search for a different note, family, or name.</p>' +
      '</div>'
    );
  }
  return products.map(function (p) { return shafaafRenderProductCard(p, opts); }).join("");
}

(function shafaafWireProductCards() {
  document.addEventListener("click", function (e) {
    var wishBtn = e.target.closest("[data-wishlist-toggle]");
    if (wishBtn) {
      e.preventDefault();
      var id = wishBtn.getAttribute("data-wishlist-toggle");
      var active = ShafaafWishlist.toggle(id);
      var product = shafaafGetProductById(id);
      ShafaafToast.show(active ? "Added to wishlist" : "Removed from wishlist");
      if (typeof shafaafTrackEvent === "function") shafaafTrackEvent("wishlist_toggle", { id: id, active: active });
      return;
    }
    var quickBtn = e.target.closest("[data-quick-view]");
    if (quickBtn) {
      e.preventDefault();
      var pid = quickBtn.getAttribute("data-quick-view");
      var p = shafaafGetProductById(pid);
      if (p && typeof shafaafOpenQuickView === "function") shafaafOpenQuickView(p);
    }
  });

  document.addEventListener("shafaaf:wishlist:change", function () {
    document.querySelectorAll("[data-wishlist-toggle]").forEach(function (btn) {
      var id = btn.getAttribute("data-wishlist-toggle");
      var active = ShafaafWishlist.has(id);
      btn.setAttribute("aria-pressed", active);
      btn.setAttribute("data-active", active);
    });
  });
})();
