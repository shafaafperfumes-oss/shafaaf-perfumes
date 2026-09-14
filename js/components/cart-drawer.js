/**
 * Cart drawer — quick-access cart, present on every page.
 * Renders from ShafaafCart and re-renders on "shafaaf:cart:change".
 */

(function () {
  function els() {
    return {
      toggle: document.querySelectorAll("[data-cart-toggle]"),
      drawer: document.getElementById("cart-drawer"),
      closeBtn: document.querySelector("#cart-drawer [data-close]"),
      body: document.getElementById("cart-drawer-body"),
      footer: document.getElementById("cart-drawer-footer")
    };
  }

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
            '<div class="qty-stepper qty-stepper--sm">' +
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
    var e = els();
    if (!e.body) return;
    var items = ShafaafCart.getItems();
    if (!items.length) {
      e.body.innerHTML =
        '<div class="state-block">' +
          shafaafIcon("bag", "state-block__icon") +
          '<h3 class="state-block__title">Your bag is empty</h3>' +
          '<p class="state-block__text">Discover a fragrance that feels like you.</p>' +
          '<a href="shop.html" class="btn btn--primary">Shop Fragrances</a>' +
        '</div>';
      if (e.footer) e.footer.style.display = "none";
      return;
    }
    e.body.innerHTML = items.map(renderLine).join("");
    if (e.footer) {
      e.footer.style.display = "";
      var subtotal = ShafaafCart.getSubtotal();
      e.footer.innerHTML =
        '<div class="cart-drawer__subtotal"><span>Subtotal</span><span class="price__current">' + shafaafFormatPrice(subtotal) + '</span></div>' +
        '<p class="cart-drawer__note">Shipping and delivery time confirmed on WhatsApp.</p>' +
        '<button type="button" class="btn btn--whatsapp btn--block" data-checkout>' + shafaafIcon("whatsapp") + ' Checkout on WhatsApp</button>' +
        '<a href="cart.html" class="btn btn--outline btn--block" style="margin-top:10px">View Full Cart</a>';
    }
  }

  function open() {
    var e = els();
    if (!e.drawer) return;
    render();
    e.drawer.classList.add("is-open");
    e.drawer.setAttribute("aria-hidden", "false");
    ShafaafOverlay.lock();
    window.shafaafActiveOverlayClose = close;
  }
  function close() {
    var e = els();
    if (!e.drawer) return;
    e.drawer.classList.remove("is-open");
    e.drawer.setAttribute("aria-hidden", "true");
    ShafaafOverlay.unlock();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var e = els();
    e.toggle.forEach(function (btn) {
      btn.addEventListener("click", function (evt) { evt.preventDefault(); open(); });
    });
    if (e.closeBtn) e.closeBtn.addEventListener("click", close);
    ShafaafOverlay.bindScrimClose([close]);
    render();
  });

  document.addEventListener("shafaaf:cart:change", render);

  document.addEventListener("click", function (e) {
    var line = e.target.closest(".cart-line");
    if (!line) return;
    var id = line.getAttribute("data-line-id");
    var current = ShafaafCart.getItems().find(function (i) { return i.id === id; });
    if (!current) return;
    if (e.target.closest("[data-qty-inc]")) ShafaafCart.setQty(id, current.qty + 1);
    if (e.target.closest("[data-qty-dec]")) ShafaafCart.setQty(id, current.qty - 1);
    if (e.target.closest("[data-line-remove]")) {
      ShafaafCart.removeLine(id);
      ShafaafToast.show("Removed from cart");
    }
  });

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-checkout]")) {
      shafaafCheckout(ShafaafCart.getItems());
    }
  });

  window.shafaafOpenCartDrawer = open;
})();
