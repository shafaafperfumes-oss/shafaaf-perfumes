/**
 * Product detail page.
 */
shafaafOnCatalogReady(function () {
  var params = new URLSearchParams(window.location.search);
  var product = shafaafGetProductById(params.get("id"));

  if (!product) {
    window.location.href = "shop.html";
    return;
  }

  var state = { variantIndex: 0, sizeIndex: 0, qty: 1 };

  function currentSize() {
    return product.variants[state.variantIndex].sizes[state.sizeIndex];
  }

  function renderBreadcrumbs() {
    document.getElementById("pdp-breadcrumbs").innerHTML =
      '<a href="index.html">Home</a><span class="breadcrumbs__sep">/</span>' +
      '<a href="shop.html">Shop</a><span class="breadcrumbs__sep">/</span>' +
      '<a href="shop.html?family=' + encodeURIComponent(product.family) + '">' + product.family + '</a><span class="breadcrumbs__sep">/</span>' +
      '<span aria-current="page">' + product.name + '</span>';
  }

  function galleryImages() {
    var imgs = [];
    if (product.image) imgs.push(product.image);
    if (product.imageAlt && product.imageAlt !== product.image) imgs.push(product.imageAlt);
    return imgs;
  }

  function renderGallery() {
    var imgs = galleryImages();
    var mainHTML = imgs.length
      ? '<img id="pdp-main-img" src="' + imgs[0] + '" alt="' + product.name + '">'
      : shafaafPlaceholderBottle(product);
    var thumbsHTML = imgs.length > 1
      ? '<div class="pdp-gallery__thumbs">' + imgs.map(function (src, i) {
          return '<button type="button" class="pdp-gallery__thumb' + (i === 0 ? " is-active" : "") + '" data-thumb="' + src + '"><img src="' + src + '" alt=""></button>';
        }).join("") + '</div>'
      : "";
    return (
      '<div class="pdp-gallery">' +
        '<div class="pdp-gallery__main" id="pdp-main-media">' + mainHTML + '</div>' +
        thumbsHTML +
      '</div>'
    );
  }

  function renderInfo() {
    var wishlisted = ShafaafWishlist.has(product.id);
    return (
      '<div class="pdp-info">' +
        '<span class="pdp-info__collection">' + product.family + ' · ' + product.gender + '</span>' +
        '<h1 class="pdp-info__name">' + product.name + '</h1>' +
        '<div class="pdp-info__meta">' +
          '<span class="rating"><span class="rating__stars">' + shafaafStarRow(product.rating) + '</span><span class="rating__count">' + product.rating.toFixed(1) + '</span></span>' +
          '<a href="#reviews">' + product.reviewCount + ' reviews</a>' +
          (product.bestseller ? '<span class="badge badge--bestseller">Bestseller</span>' : "") +
          (product.isNew ? '<span class="badge badge--new">New</span>' : "") +
        '</div>' +
        '<div class="pdp-info__price price price--lg"><span class="price__current" id="pdp-price"></span></div>' +
        '<p class="pdp-info__desc">' + product.description + '</p>' +

        '<div class="pdp-field">' +
          '<span class="pdp-field__label">Type</span>' +
          '<div class="option-pill-group" id="pdp-variants">' +
            product.variants.map(function (v, i) {
              return '<button type="button" class="option-pill' + (i === state.variantIndex ? " is-active" : "") + '" data-variant="' + i + '">' + v.type + '</button>';
            }).join("") +
          '</div>' +
        '</div>' +

        '<div class="pdp-field">' +
          '<span class="pdp-field__label">Size</span>' +
          '<div class="option-pill-group" id="pdp-sizes"></div>' +
        '</div>' +

        '<div class="pdp-field">' +
          '<span class="pdp-field__label">Quantity</span>' +
          '<div class="qty-stepper">' +
            '<button type="button" data-qty-dec aria-label="Decrease quantity">' + shafaafIcon("minus") + '</button>' +
            '<input type="text" readonly id="pdp-qty" value="1" aria-label="Quantity">' +
            '<button type="button" data-qty-inc aria-label="Increase quantity">' + shafaafIcon("plus") + '</button>' +
          '</div>' +
        '</div>' +

        '<div class="pdp-actions">' +
          '<button type="button" class="btn btn--outline" id="pdp-add-cart">Add to Cart</button>' +
          '<button type="button" class="btn btn--primary" id="pdp-buy-now">Buy Now</button>' +
          '<button type="button" class="pdp-wishlist-btn" id="pdp-wishlist" data-active="' + wishlisted + '" aria-pressed="' + wishlisted + '" aria-label="Toggle wishlist">' + shafaafIcon("heart") + '</button>' +
        '</div>' +

        '<div class="pdp-trust">' +
          '<div class="pdp-trust__item">' + ShafaafIcons.truck + ' Nationwide delivery, confirmed on WhatsApp after order</div>' +
          '<div class="pdp-trust__item">' + ShafaafIcons.returnArrow + ' Easy exchange within 3 days if unopened</div>' +
          '<div class="pdp-trust__item">' + ShafaafIcons.shield + ' 100% authentic, quality-tested fragrance oils</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderSizes() {
    var variant = product.variants[state.variantIndex];
    document.getElementById("pdp-sizes").innerHTML = variant.sizes.map(function (s, i) {
      return '<button type="button" class="option-pill' + (i === state.sizeIndex ? " is-active" : "") + '" data-size="' + i + '">' + s.label + '</button>';
    }).join("");
  }

  function updatePriceDisplay() {
    var size = currentSize();
    document.getElementById("pdp-price").textContent = shafaafFormatPrice(size.price);
    var bar = document.getElementById("sticky-buybar");
    if (bar) {
      document.getElementById("buybar-name").textContent = product.name + " — " + product.variants[state.variantIndex].type + ", " + size.label;
      document.getElementById("buybar-price").textContent = shafaafFormatPrice(size.price * state.qty);
    }
  }

  function renderNotesViz() {
    var groups = shafaafGroupNotes(product.notes);
    var cols = [
      { key: "top", label: "Top Notes", icon: "sparkle" },
      { key: "heart", label: "Heart Notes", icon: "heart" },
      { key: "base", label: "Base Notes", icon: "leaf" }
    ];
    document.getElementById("notes-viz").innerHTML = cols.map(function (c) {
      if (!groups[c.key].length) return "";
      return (
        '<div class="notes-viz__col">' +
          '<div class="notes-viz__ring">' + ShafaafIcons[c.icon] + '</div>' +
          '<div class="notes-viz__label">' + c.label + '</div>' +
          '<div class="notes-viz__tags">' + groups[c.key].map(function (n) { return '<span class="badge badge--soft">' + n + '</span>'; }).join("") + '</div>' +
        '</div>'
      );
    }).join("");
  }

  function renderAccordion() {
    var html =
      shafaafAccordionItem("Shipping &amp; Delivery", "<p>Orders are confirmed and shipping cost is calculated over WhatsApp based on your city. Most orders are dispatched within 1-2 business days.</p>", { open: true }) +
      shafaafAccordionItem("Returns &amp; Exchanges", "<p>Unopened, unused items can be exchanged within 3 days of delivery. Message us on WhatsApp with your order details to start an exchange.</p>") +
      shafaafAccordionItem("Perfume vs. Attar — Which Should I Choose?", "<p>Perfume (EDP-strength spray) is lighter and easier for daily wear. Attar is an oil-based concentrate — a little goes a long way and it tends to last significantly longer on skin.</p>") +
      shafaafAccordionItem("Is this fragrance authentic?", "<p>Yes — every Shafaaf fragrance is quality-tested in house before it ships. We stand behind every bottle.</p>");
    document.getElementById("pdp-accordion").innerHTML = html;
  }

  function renderReviews() {
    var reviews = shafaafGetProductReviews(product);
    document.getElementById("review-summary").innerHTML =
      '<span class="review-summary__score">' + product.rating.toFixed(1) + '</span>' +
      '<div><div class="rating__stars">' + shafaafStarRow(product.rating) + '</div><p style="color:var(--c-text-faint);font-size:var(--fs-sm);margin-top:4px">Based on ' + product.reviewCount + ' reviews</p></div>';
    document.getElementById("review-list").innerHTML = reviews.map(function (r) {
      return (
        '<div class="review-list__item">' +
          '<div class="review-list__head">' +
            '<div><div class="review-list__name">' + r.name + '</div><div class="rating__stars">' + shafaafStarRow(r.rating) + '</div></div>' +
            '<span class="review-list__date">' + r.daysAgo + ' days ago</span>' +
          '</div>' +
          '<p class="review-list__text">' + r.text + '</p>' +
        '</div>'
      );
    }).join("");
  }

  function renderRelated() {
    document.getElementById("related-grid").innerHTML = shafaafRenderProductGrid(shafaafGetRelatedProducts(product, 4));
  }

  function switchMainImage(src) {
    var mediaEl = document.getElementById("pdp-main-media");
    var img = document.getElementById("pdp-main-img");
    if (img) img.src = src;
    document.querySelectorAll(".pdp-gallery__thumb").forEach(function (t) {
      t.classList.toggle("is-active", t.getAttribute("data-thumb") === src);
    });
  }

  function bindEvents() {
    document.addEventListener("click", function (e) {
      var variantBtn = e.target.closest("#pdp-variants [data-variant]");
      if (variantBtn) { state.variantIndex = Number(variantBtn.getAttribute("data-variant")); state.sizeIndex = 0; renderSizes(); updatePriceDisplay(); document.querySelectorAll("#pdp-variants .option-pill").forEach(function (b) { b.classList.toggle("is-active", b === variantBtn); }); return; }

      var sizeBtn = e.target.closest("#pdp-sizes [data-size]");
      if (sizeBtn) { state.sizeIndex = Number(sizeBtn.getAttribute("data-size")); updatePriceDisplay(); document.querySelectorAll("#pdp-sizes .option-pill").forEach(function (b) { b.classList.toggle("is-active", b === sizeBtn); }); return; }

      if (e.target.closest("[data-qty-inc]")) { state.qty++; document.getElementById("pdp-qty").value = state.qty; updatePriceDisplay(); return; }
      if (e.target.closest("[data-qty-dec]")) { state.qty = Math.max(1, state.qty - 1); document.getElementById("pdp-qty").value = state.qty; updatePriceDisplay(); return; }

      var thumb = e.target.closest(".pdp-gallery__thumb");
      if (thumb) { switchMainImage(thumb.getAttribute("data-thumb")); return; }

      if (e.target.closest("#pdp-wishlist")) {
        var active = ShafaafWishlist.toggle(product.id);
        var btn = document.getElementById("pdp-wishlist");
        btn.setAttribute("data-active", active);
        btn.setAttribute("aria-pressed", active);
        ShafaafToast.show(active ? "Added to wishlist" : "Removed from wishlist");
        return;
      }

      if (e.target.closest("#pdp-add-cart") || e.target.closest("#buybar-add")) {
        addToCart();
        return;
      }

      if (e.target.closest("#pdp-buy-now")) {
        addToCart();
        window.location.href = "checkout.html";
        return;
      }
    });
  }

  function addToCart() {
    var variant = product.variants[state.variantIndex];
    var size = currentSize();
    ShafaafCart.add({
      id: shafaafLineId(product.id, variant.type, size.label),
      variantId: size.variantId,
      productId: product.id,
      name: product.name,
      variantType: variant.type,
      sizeLabel: size.label,
      price: size.price,
      image: product.image
    }, state.qty);
    ShafaafToast.show(product.name + " added to cart");
    if (typeof window.shafaafOpenCartDrawer === "function") window.shafaafOpenCartDrawer();
  }

  function bindStickyBar() {
    var bar = document.getElementById("sticky-buybar");
    var actions = document.querySelector(".pdp-actions");
    if (!bar || !actions) return;
    var io = new IntersectionObserver(function (entries) {
      var entry = entries[0];
      var scrolledPast = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      bar.classList.toggle("is-visible", scrolledPast);
    }, { threshold: 0 });
    io.observe(actions);
  }

  document.title = product.name + " — Shafaaf Perfumes";
  document.body.setAttribute("data-whatsapp-topic", product.name);
  document.dispatchEvent(new CustomEvent("shafaaf:whatsapp:topic"));
  var metaDesc = document.getElementById("page-desc");
  if (metaDesc) metaDesc.setAttribute("content", product.description);

  renderBreadcrumbs();
  document.getElementById("pdp-layout").innerHTML = renderGallery() + renderInfo();
  renderSizes();
  updatePriceDisplay();
  renderNotesViz();
  renderAccordion();
  renderReviews();
  renderRelated();
  bindEvents();
  bindStickyBar();
  shafaafHydrateIcons();
});
