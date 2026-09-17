/**
 * Quick View modal — lets a shopper pick variant/size and add to
 * cart without leaving the grid they're browsing.
 */

(function () {
  var state = { product: null, variantIndex: 0, sizeIndex: 0, qty: 1 };

  function els() {
    return { modal: document.getElementById("quick-view-modal"), body: document.getElementById("quick-view-body") };
  }

  function currentSize() {
    var variant = state.product.variants[state.variantIndex];
    return variant.sizes[state.sizeIndex];
  }

  function render() {
    var e = els();
    if (!e.body || !state.product) return;
    var p = state.product;
    var size = currentSize();
    e.body.innerHTML =
      '<div class="quick-view">' +
        '<div class="quick-view__media">' + shafaafProductMedia(p, { eager: true }) + '</div>' +
        '<div class="quick-view__info">' +
          '<span class="product-card__collection">' + p.family + '</span>' +
          '<h2 class="section-title" style="font-size:var(--fs-display-sm);margin-top:6px">' + p.name + '</h2>' +
          '<div class="rating" style="margin-top:10px"><span class="rating__stars">' + shafaafStarRow(p.rating) + '</span><span class="rating__count">' + p.rating.toFixed(1) + ' (' + p.reviewCount + ' reviews)</span></div>' +
          '<p class="section-sub" style="margin-top:14px">' + p.description + '</p>' +
          '<p class="product-card__notes" style="margin-top:10px;font-size:var(--fs-sm)"><strong style="color:var(--c-text);font-style:normal">Notes:</strong> ' + p.notes.join(", ") + '</p>' +
          '<div class="qv-price price price--lg" style="margin-top:18px"><span class="price__current" id="qv-price">' + shafaafFormatPrice(size.price) + '</span></div>' +
          '<div class="field" style="margin-top:18px"><span class="field__label">Type</span>' +
            '<div class="option-pill-group" id="qv-variants">' +
              p.variants.map(function (v, i) {
                return '<button type="button" class="option-pill' + (i === state.variantIndex ? ' is-active' : '') + '" data-qv-variant="' + i + '">' + v.type + '</button>';
              }).join("") +
            '</div></div>' +
          '<div class="field" style="margin-top:16px"><span class="field__label">Size</span>' +
            '<div class="option-pill-group" id="qv-sizes">' +
              p.variants[state.variantIndex].sizes.map(function (s, i) {
                return '<button type="button" class="option-pill' + (i === state.sizeIndex ? ' is-active' : '') + '" data-qv-size="' + i + '">' + s.label + '</button>';
              }).join("") +
            '</div></div>' +
          '<div class="cluster" style="margin-top:22px;gap:14px">' +
            '<div class="qty-stepper">' +
              '<button type="button" data-qv-qty-dec>' + shafaafIcon("minus") + '</button>' +
              '<input type="text" readonly id="qv-qty" value="' + state.qty + '">' +
              '<button type="button" data-qv-qty-inc>' + shafaafIcon("plus") + '</button>' +
            '</div>' +
            '<button type="button" class="btn btn--primary" id="qv-add" style="flex:1">Add to Cart</button>' +
          '</div>' +
          '<a href="product.html?id=' + p.id + '" class="link-underline" style="display:inline-block;margin-top:18px;font-size:var(--fs-sm)">View full details</a>' +
        '</div>' +
      '</div>';
  }

  function open(product) {
    state = { product: product, variantIndex: 0, sizeIndex: 0, qty: 1 };
    var e = els();
    if (!e.modal) return;
    render();
    e.modal.classList.add("is-open");
    e.modal.setAttribute("aria-hidden", "false");
    ShafaafOverlay.lock();
    window.shafaafActiveOverlayClose = close;
  }
  function close() {
    var e = els();
    if (!e.modal) return;
    e.modal.classList.remove("is-open");
    e.modal.setAttribute("aria-hidden", "true");
    ShafaafOverlay.unlock();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var e = els();
    if (!e.modal) return;
    var closeBtn = e.modal.querySelector("[data-close]");
    if (closeBtn) closeBtn.addEventListener("click", close);
    e.modal.addEventListener("click", function (evt) { if (evt.target === e.modal) close(); });
  });

  document.addEventListener("click", function (e) {
    if (!state.product) return;
    var variantBtn = e.target.closest("[data-qv-variant]");
    if (variantBtn) { state.variantIndex = Number(variantBtn.getAttribute("data-qv-variant")); state.sizeIndex = 0; render(); return; }
    var sizeBtn = e.target.closest("[data-qv-size]");
    if (sizeBtn) { state.sizeIndex = Number(sizeBtn.getAttribute("data-qv-size")); render(); return; }
    if (e.target.closest("[data-qv-qty-inc]")) { state.qty++; render(); return; }
    if (e.target.closest("[data-qv-qty-dec]")) { state.qty = Math.max(1, state.qty - 1); render(); return; }
    if (e.target.closest("#qv-add")) {
      var variant = state.product.variants[state.variantIndex];
      var size = variant.sizes[state.sizeIndex];
      ShafaafCart.add({
        id: shafaafLineId(state.product.id, variant.type, size.label),
        variantId: size.variantId,
        productId: state.product.id,
        name: state.product.name,
        variantType: variant.type,
        sizeLabel: size.label,
        price: size.price,
        image: state.product.image
      }, state.qty);
      ShafaafToast.show(state.product.name + " added to cart");
      close();
      if (typeof window.shafaafOpenCartDrawer === "function") window.shafaafOpenCartDrawer();
    }
  });

  window.shafaafOpenQuickView = open;
})();
