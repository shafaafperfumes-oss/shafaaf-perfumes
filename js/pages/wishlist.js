/**
 * Wishlist page.
 */
(function () {
  function render() {
    var products = ShafaafWishlist.getProducts();
    document.getElementById("wishlist-count-label").textContent =
      products.length ? products.length + " saved fragrance" + (products.length > 1 ? "s" : "") : "Nothing saved yet.";

    var grid = document.getElementById("wishlist-grid");
    if (!products.length) {
      grid.innerHTML =
        '<div class="state-block" style="grid-column:1/-1">' +
          shafaafIcon("heart", "state-block__icon") +
          '<h2 class="state-block__title">Your wishlist is empty</h2>' +
          '<p class="state-block__text">Tap the heart icon on any fragrance to save it here for later.</p>' +
          '<a href="shop.html" class="btn btn--primary shop-empty-cta">Discover Fragrances</a>' +
        '</div>';
      return;
    }
    grid.innerHTML = shafaafRenderProductGrid(products);
  }

  shafaafOnCatalogReady(render);
  document.addEventListener("shafaaf:wishlist:change", render);
})();
