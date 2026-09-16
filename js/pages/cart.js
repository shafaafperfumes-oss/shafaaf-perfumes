/**
 * Full cart page.
 */
(function () {
  function renderLine(item) {
    var product = shafaafGetProductById(item.productId);
    var media = product ? shafaafProductMedia(product) : "";
    return (
      '<div class="cart-line" data-line-id="' + item.id + '">' +
        '<div class="cart-line__media">' + media + '</div>' +
        '<div class="cart-line__info">' +
          '<p class="cart-line__name">' + item.name + '</p>' +
          '<p class="cart-line__meta">' + item.variantType + ' · ' + item.sizeLabel + '</p>' +
          '<div class="cart-line__row">' +
            '<div class="qty-stepper">' +
              '<button type="button" data-qty-dec>' + shafaafIcon("minus") + '</button>' +
              '<input type="text" readonly value="' + item.qty + '" aria-label="Quantity">' +
              '<button type="button" data-qty-inc>' + shafaafIcon("plus") + '</button>' +
            '</div>' +
            '<span class="price__current">' + shafaafFormatPrice(item.qty * item.price) + '</span>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="cart-line__remove" data-line-remove aria-label="Remove ' + item.name + '">' + shafaafIcon("close") + '</button>' +
      '</div>'
    );
  }

  function render() {
    var el = document.getElementById("cart-page-content");
    var items = ShafaafCart.getItems();

    if (!items.length) {
      el.innerHTML =
        '<div class="state-block">' +
          shafaafIcon("bag", "state-block__icon") +
          '<h2 class="state-block__title">Your bag is empty</h2>' +
          '<p class="state-block__text">Looks like you haven\'t added anything yet. Explore the collection to find your signature scent.</p>' +
          '<a href="shop.html" class="btn btn--primary shop-empty-cta">Shop Fragrances</a>' +
        '</div>';
      return;
    }

    var subtotal = ShafaafCart.getSubtotal();
    el.innerHTML =
      '<div class="cart-layout">' +
        '<div class="cart-page__list">' + items.map(renderLine).join("") + '</div>' +
        '<div class="cart-summary">' +
          '<h3 style="font-size:var(--fs-lg)">Order Summary</h3>' +
          '<div class="cart-summary__row"><span>Subtotal</span><span>' + shafaafFormatPrice(subtotal) + '</span></div>' +
          '<div class="cart-summary__row"><span>Shipping</span><span>Calculated on WhatsApp</span></div>' +
          '<div class="cart-summary__row cart-summary__row--total"><span>Total</span><span>' + shafaafFormatPrice(subtotal) + '</span></div>' +
          '<p class="cart-summary__note">Taxes, if applicable, and final shipping cost are confirmed with you directly on WhatsApp before dispatch.</p>' +
          '<form id="promo-form">' +
            '<input type="text" class="input" placeholder="Promo code" aria-label="Promo code">' +
            '<button type="submit" class="btn btn--outline">Apply</button>' +
          '</form>' +
          '<button type="button" class="btn btn--whatsapp btn--block" style="margin-top:24px" data-checkout>' + shafaafIcon("whatsapp") + ' Checkout on WhatsApp</button>' +
          '<a href="shop.html" class="btn btn--ghost btn--block" style="margin-top:8px;justify-content:center">Continue Shopping</a>' +
        '</div>' +
      '</div>';
  }

  shafaafOnCatalogReady(render);
  document.addEventListener("shafaaf:cart:change", render);

  document.addEventListener("submit", function (e) {
    if (e.target.id === "promo-form") {
      e.preventDefault();
      ShafaafToast.show("Promo codes are coming soon.");
    }
  });

  document.addEventListener("click", function (e) {
    var line = e.target.closest(".cart-line");
    if (line) {
      var id = line.getAttribute("data-line-id");
      var current = ShafaafCart.getItems().find(function (i) { return i.id === id; });
      if (current) {
        if (e.target.closest("[data-qty-inc]")) ShafaafCart.setQty(id, current.qty + 1);
        if (e.target.closest("[data-qty-dec]")) ShafaafCart.setQty(id, current.qty - 1);
        if (e.target.closest("[data-line-remove]")) { ShafaafCart.removeLine(id); ShafaafToast.show("Removed from cart"); }
      }
    }
    if (e.target.closest("[data-checkout]")) {
      shafaafCheckout(ShafaafCart.getItems());
    }
  });
})();
