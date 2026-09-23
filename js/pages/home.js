/**
 * Homepage — populates dynamic sections from the product catalog.
 */
(function () {
  function renderCollections() {
    var el = document.getElementById("collection-grid");
    if (!el) return;
    var families = [
      { key: "Oud", label: "The Oud Edit", desc: "Deep, resinous, unmistakably bold" },
      { key: "Floral", label: "Floral Reverie", desc: "Rose, musk and soft powder" },
      { key: "Gourmand", label: "Gourmand Warmth", desc: "Vanilla, amber and warm spice" }
    ];
    el.innerHTML = families.map(function (f) {
      var sample = shafaafGetAllProducts().find(function (p) { return p.family === f.key; });
      var tint = (window.SHAFAAF_FAMILY_TINTS || {})[f.key] || { a: "#a68a68", b: "#5f4a33" };
      return (
        '<a class="collection-tile" href="shop.html?family=' + encodeURIComponent(f.key) + '">' +
          '<div class="collection-tile__art" style="background:linear-gradient(160deg,' + tint.a + ',' + tint.b + ')">' +
            (sample ? shafaafProductMedia(sample) : "") +
          '</div>' +
          '<div class="collection-tile__content">' +
            '<span class="collection-tile__label">' + f.key + ' Collection</span>' +
            '<h3 class="collection-tile__name">' + f.label + '</h3>' +
            '<span class="collection-tile__link">Shop Now <span data-icon="arrowRight"></span></span>' +
          '</div>' +
        '</a>'
      );
    }).join("");
    shafaafHydrateIcons(el);
  }

  function renderOffers() {
    var section = document.getElementById("offers");
    var el = document.getElementById("offers-grid");
    if (!section || !el) return;
    var offers = shafaafGetOffers();
    section.hidden = offers.length === 0;
    el.innerHTML = shafaafRenderProductGrid(offers.slice(0, 4));
  }

  function renderBestsellers() {
    var el = document.getElementById("bestsellers-grid");
    if (!el) return;
    el.innerHTML = shafaafRenderProductGrid(shafaafGetBestsellers());
  }

  function renderStoryMedia() {
    var el = document.getElementById("story-media");
    if (!el) return;
    var p = shafaafGetProductById("oud-kaaba");
    el.innerHTML = shafaafProductMedia(p);
  }

  function renderSpotlight() {
    var el = document.getElementById("spotlight");
    if (!el) return;
    var p = shafaafGetProductById("yemberzal");
    el.innerHTML =
      '<div class="spotlight__media">' + shafaafProductMedia(p, { eager: true }) + '</div>' +
      '<div>' +
        '<span class="eyebrow">Signature Spotlight</span>' +
        '<h2 class="section-title">' + p.name + '</h2>' +
        '<div class="rating" style="margin-top:12px"><span class="rating__stars">' + shafaafStarRow(p.rating) + '</span><span class="rating__count">' + p.rating.toFixed(1) + ' (' + p.reviewCount + ' reviews)</span></div>' +
        '<p class="section-sub" style="max-width:52ch">' + p.description + '</p>' +
        '<div class="spotlight__notes">' + p.notes.map(function (n) { return '<span class="badge badge--soft">' + n + '</span>'; }).join("") + '</div>' +
        '<div class="cluster" style="margin-top:28px">' +
          '<a href="product.html?id=' + p.id + '" class="btn btn--primary">Shop ' + p.name + '</a>' +
          '<span class="price price--lg"><span class="price__current">From ' + shafaafFormatPrice(shafaafGetLowestPrice(p)) + '</span></span>' +
        '</div>' +
      '</div>';
    shafaafHydrateIcons(el);
  }

  function renderReviews() {
    var el = document.getElementById("reviews-grid");
    if (!el) return;
    el.innerHTML = SHAFAAF_TESTIMONIALS.slice(0, 3).map(function (t) {
      return (
        '<div class="review-card">' +
          '<div class="rating__stars">' + shafaafStarRow(t.rating) + '</div>' +
          '<p class="quote">“' + t.text + '”</p>' +
          '<div class="review-card__author">' +
            '<span class="review-card__avatar">' + t.name.charAt(0) + '</span>' +
            '<span><span class="review-card__name">' + t.name + '</span><br><span class="review-card__loc">' + t.location + '</span></span>' +
          '</div>' +
        '</div>'
      );
    }).join("");
  }

  shafaafOnCatalogReady(function () {
    renderCollections();
    renderBestsellers();
    renderOffers();
    renderStoryMedia();
    renderSpotlight();
    renderReviews();
  });
})();
