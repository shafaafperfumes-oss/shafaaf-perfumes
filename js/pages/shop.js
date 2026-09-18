/**
 * Shop page — filtering, sorting, pagination over the product
 * catalog. All filtering happens client-side against the static
 * catalog now; the state shape (families/sizes/genders/price/sort)
 * is exactly what a future `/api/products?...` query would need,
 * so swapping in a real backend later is a data-source change only.
 */
(function () {
  var ALL_PRODUCTS = shafaafGetAllProducts();
  var PAGE_SIZE = 9;
  var GLOBAL_MIN_PRICE = Math.min.apply(null, ALL_PRODUCTS.map(shafaafGetLowestPrice));
  var GLOBAL_MAX_PRICE = Math.max.apply(null, ALL_PRODUCTS.map(shafaafGetHighestPrice));
  var ALL_SIZES = ["30ml", "50ml", "6ml", "12ml"];

  function parseQuery() {
    var params = new URLSearchParams(window.location.search);
    var type = params.get("type");
    return {
      quick: params.get("filter") || "all",
      family: params.get("family") || null,
      // Section of the shop: perfume | attar | bakhoor, or null for everything.
      type: shafaafGetProductType(type) ? type : null
    };
  }

  var initial = parseQuery();
  var state = {
    families: initial.family ? [initial.family] : [],
    sizes: [],
    genders: [],
    quick: initial.quick, // all | bestseller | new
    type: initial.type,
    priceMax: GLOBAL_MAX_PRICE,
    sort: "featured",
    page: 1,
    q: ""
  };

  function toggleInArray(arr, value) {
    var i = arr.indexOf(value);
    if (i === -1) arr.push(value); else arr.splice(i, 1);
    return arr;
  }

  function applyFilters() {
    var list = ALL_PRODUCTS.slice();

    if (state.q) {
      var q = state.q.toLowerCase();
      list = list.filter(function (p) {
        return p.name.toLowerCase().indexOf(q) !== -1 || p.notes.some(function (n) { return n.toLowerCase().indexOf(q) !== -1; });
      });
    }
    if (state.type) list = list.filter(function (p) { return shafaafProductHasType(p, state.type); });
    if (state.quick === "bestseller") list = list.filter(function (p) { return p.bestseller; });
    if (state.quick === "new") list = list.filter(function (p) { return p.isNew; });
    if (state.families.length) list = list.filter(function (p) { return state.families.indexOf(p.family) !== -1; });
    if (state.genders.length) list = list.filter(function (p) { return state.genders.indexOf(p.gender) !== -1; });
    if (state.sizes.length) {
      list = list.filter(function (p) {
        return p.variants.some(function (v) { return v.sizes.some(function (s) { return state.sizes.indexOf(s.label) !== -1; }); });
      });
    }
    list = list.filter(function (p) { return shafaafGetHighestPrice(p, state.type) <= state.priceMax; });

    switch (state.sort) {
      case "price-asc": list.sort(function (a, b) { return shafaafGetLowestPrice(a, state.type) - shafaafGetLowestPrice(b, state.type); }); break;
      case "price-desc": list.sort(function (a, b) { return shafaafGetLowestPrice(b, state.type) - shafaafGetLowestPrice(a, state.type); }); break;
      case "name-asc": list.sort(function (a, b) { return a.name.localeCompare(b.name); }); break;
      case "newest": list.sort(function (a, b) { return (b.isNew === a.isNew) ? 0 : (b.isNew ? 1 : -1); }); break;
      default: list.sort(function (a, b) { return (b.bestseller === a.bestseller) ? 0 : (b.bestseller ? 1 : -1); });
    }
    return list;
  }

  function renderFilterGroupsHTML() {
    var families = shafaafGetFamilies();
    var genders = ["Unisex"];
    return (
      '<div class="field">' +
        '<span class="field__label">Search</span>' +
        '<input type="text" class="input" id="shop-filter-search" placeholder="Fragrance or note…" value="' + state.q + '">' +
      '</div>' +

      '<div class="filter-group">' +
        '<div class="filter-group__title">Fragrance Family</div>' +
        '<div class="filter-group__list">' +
          families.map(function (f) {
            var count = ALL_PRODUCTS.filter(function (p) { return p.family === f; }).length;
            return '<label class="checkbox-row"><input type="checkbox" data-filter="family" value="' + f + '" ' + (state.families.indexOf(f) !== -1 ? "checked" : "") + '> ' + f + ' <span class="count">(' + count + ')</span></label>';
          }).join("") +
        '</div>' +
      '</div>' +

      '<div class="filter-group">' +
        '<div class="filter-group__title">Price</div>' +
        '<div class="price-range">' +
          '<input type="range" min="' + GLOBAL_MIN_PRICE + '" max="' + GLOBAL_MAX_PRICE + '" step="10" value="' + state.priceMax + '" data-filter="price" aria-label="Maximum price">' +
          '<div class="price-range__values"><span>' + shafaafFormatPrice(GLOBAL_MIN_PRICE) + '</span><span>Up to ' + shafaafFormatPrice(state.priceMax) + '</span></div>' +
        '</div>' +
      '</div>' +

      '<div class="filter-group">' +
        '<div class="filter-group__title">Size</div>' +
        '<div class="filter-group__list">' +
          ALL_SIZES.map(function (s) {
            return '<label class="checkbox-row"><input type="checkbox" data-filter="size" value="' + s + '" ' + (state.sizes.indexOf(s) !== -1 ? "checked" : "") + '> ' + s + '</label>';
          }).join("") +
        '</div>' +
      '</div>' +

      '<div class="filter-group">' +
        '<div class="filter-group__title">Preference</div>' +
        '<div class="filter-group__list">' +
          genders.map(function (g) {
            return '<label class="checkbox-row"><input type="checkbox" data-filter="gender" value="' + g + '" ' + (state.genders.indexOf(g) !== -1 ? "checked" : "") + '> ' + g + '</label>';
          }).join("") +
        '</div>' +
      '</div>' +

      '<div class="filter-group">' +
        '<div class="filter-group__list">' +
          '<label class="checkbox-row"><input type="checkbox" checked disabled> In Stock Only</label>' +
        '</div>' +
      '</div>' +

      '<button type="button" class="btn btn--outline btn--sm btn--block" data-filters-clear>Clear All Filters</button>'
    );
  }

  function renderActiveChips() {
    var el = document.getElementById("active-filter-chips");
    if (!el) return;
    var chips = [];
    state.families.forEach(function (f) { chips.push({ label: f, clear: function () { toggleInArray(state.families, f); } }); });
    state.sizes.forEach(function (s) { chips.push({ label: s, clear: function () { toggleInArray(state.sizes, s); } }); });
    state.genders.forEach(function (g) { chips.push({ label: g, clear: function () { toggleInArray(state.genders, g); } }); });
    if (state.priceMax < GLOBAL_MAX_PRICE) chips.push({ label: "Up to " + shafaafFormatPrice(state.priceMax), clear: function () { state.priceMax = GLOBAL_MAX_PRICE; } });
    if (state.quick !== "all") chips.push({ label: state.quick === "bestseller" ? "Bestsellers" : "New Arrivals", clear: function () { state.quick = "all"; } });
    if (!chips.length) { el.innerHTML = ""; return; }
    el.innerHTML = chips.map(function (c, i) {
      return '<span class="active-filter-chip" data-chip-index="' + i + '">' + c.label + '<button type="button" aria-label="Remove filter">' + ShafaafIcons.close + '</button></span>';
    }).join("");
    el.querySelectorAll("[data-chip-index]").forEach(function (chipEl, i) {
      chipEl.querySelector("button").addEventListener("click", function () { chips[i].clear(); state.page = 1; renderAll(); });
    });
  }

  // Perfumes / Attars / Bakhoor pills under the page title. Plain links,
  // so each section has its own address that can be shared or bookmarked.
  function renderTypeTabs() {
    var el = document.getElementById("shop-types");
    if (!el) return;
    var tabs = [{ key: null, plural: "All" }].concat(SHAFAAF_PRODUCT_TYPES);
    el.innerHTML = tabs.map(function (t) {
      var active = t.key === state.type;
      return '<a class="shop-types__tab' + (active ? " is-active" : "") + '" href="shop.html' + (t.key ? "?type=" + t.key : "") + '"' + (active ? ' aria-current="page"' : "") + '>' + t.plural + '</a>';
    }).join("");
  }

  function renderPagination(total) {
    var el = document.getElementById("shop-pagination");
    if (!el) return;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (pages <= 1) { el.innerHTML = ""; return; }
    var html = "";
    for (var i = 1; i <= pages; i++) {
      html += '<button type="button" class="pagination__item' + (i === state.page ? " is-active" : "") + '" data-page="' + i + '">' + i + '</button>';
    }
    el.innerHTML = html;
  }

  function renderAll() {
    var filtered = applyFilters();
    var total = filtered.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    state.page = Math.min(state.page, pages);
    var start = (state.page - 1) * PAGE_SIZE;
    var pageItems = filtered.slice(start, start + PAGE_SIZE);

    var sectionType = shafaafGetProductType(state.type);
    if (sectionType && !ALL_PRODUCTS.some(function (p) { return shafaafProductHasType(p, state.type); })) {
      // A section that has no products yet (Bakhoor, until it is stocked).
      document.getElementById("shop-grid").innerHTML =
        '<div class="state-block">' +
          shafaafIcon("incense", "state-block__icon") +
          '<h3 class="state-block__title">' + sectionType.plural + ' coming soon</h3>' +
          '<p class="state-block__text">We are preparing our ' + sectionType.label.toLowerCase() + ' range. Message us on WhatsApp to be told the moment it arrives.</p>' +
          '<a href="shop.html" class="btn btn--outline btn--sm shop-empty-cta">Browse Perfumes &amp; Attars</a>' +
        '</div>';
    } else {
      document.getElementById("shop-grid").innerHTML = shafaafRenderProductGrid(pageItems, { type: state.type });
    }
    document.getElementById("shop-result-count").textContent = total + " " + (sectionType ? (total === 1 ? sectionType.label.toLowerCase() : sectionType.plural.toLowerCase()) : "fragrance" + (total !== 1 ? "s" : ""));

    var filtersHTML = renderFilterGroupsHTML();
    document.getElementById("filters-desktop").innerHTML = filtersHTML;
    document.getElementById("filters-mobile").innerHTML = filtersHTML;
    renderActiveChips();
    renderPagination(total);

    renderTypeTabs();
    var titleMap = { bestseller: "Best Sellers", new: "New Arrivals" };
    var title = titleMap[state.quick] || (state.families.length === 1 ? state.families[0] + " Collection" : (sectionType ? sectionType.plural : "All Fragrances"));
    document.getElementById("shop-title").textContent = title;
    document.title = title + " — Shafaaf Perfumes";
    var desc = document.getElementById("shop-desc");
    if (desc && sectionType) desc.textContent = sectionType.tagline + ". Filter by family, price and size to find your signature scent.";
  }

  function bindFilterInputs() {
    document.addEventListener("change", function (e) {
      var input = e.target.closest("[data-filter]");
      if (!input) return;
      var type = input.getAttribute("data-filter");
      if (type === "family") toggleInArray(state.families, input.value);
      if (type === "size") toggleInArray(state.sizes, input.value);
      if (type === "gender") toggleInArray(state.genders, input.value);
      if (type === "price") state.priceMax = Number(input.value);
      state.page = 1;
      renderAll();
    });
    document.addEventListener("input", function (e) {
      if (e.target.matches("[data-filter='price']")) {
        state.priceMax = Number(e.target.value);
        renderAll();
      }
      if (e.target.id === "shop-filter-search") {
        state.q = e.target.value;
        state.page = 1;
        renderAll();
      }
    });
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-filters-clear]")) {
        state.families = []; state.sizes = []; state.genders = []; state.priceMax = GLOBAL_MAX_PRICE; state.quick = "all"; state.q = ""; state.page = 1;
        renderAll();
      }
      var pageBtn = e.target.closest("[data-page]");
      if (pageBtn) {
        state.page = Number(pageBtn.getAttribute("data-page"));
        renderAll();
        window.scrollTo({ top: document.querySelector(".shop-main").offsetTop - 100, behavior: "smooth" });
      }
    });
  }

  function bindMobileFilterDrawer() {
    var toggle = document.querySelector("[data-filters-toggle]");
    var drawer = document.getElementById("filter-drawer");
    var applyBtn = document.querySelector("[data-filters-apply]");
    if (!toggle || !drawer) return;
    function open() { drawer.classList.add("is-open"); ShafaafOverlay.lock(); window.shafaafActiveOverlayClose = close; }
    function close() { drawer.classList.remove("is-open"); ShafaafOverlay.unlock(); }
    toggle.addEventListener("click", open);
    var closeBtn = drawer.querySelector("[data-close]");
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (applyBtn) applyBtn.addEventListener("click", close);
  }

  shafaafOnCatalogReady(function () {
    bindFilterInputs();
    bindMobileFilterDrawer();
    renderAll();
  });
})();
