/**
 * Search overlay — full-screen search with recent/popular searches
 * and live product results. Recent searches persist to
 * localStorage; results run against the in-memory catalog now,
 * structured so a server-side search endpoint can replace
 * `shafaafSearchProducts()` later.
 */

(function () {
  var RECENT_KEY = "shafaaf_recent_searches_v1";
  var MAX_RECENT = 6;

  function getRecent() { return shafaafStorage.get(RECENT_KEY, []); }
  function addRecent(q) {
    var list = getRecent().filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); });
    list.unshift(q);
    shafaafStorage.set(RECENT_KEY, list.slice(0, MAX_RECENT));
  }

  function popularSearches() {
    return ["Oud", "Musk", "Rose", "Vanilla", "Floral", "Woody"];
  }

  function els() {
    return {
      toggle: document.querySelectorAll("[data-search-toggle]"),
      overlay: document.getElementById("search-overlay"),
      input: document.getElementById("search-overlay-input"),
      closeBtn: document.querySelector("#search-overlay [data-close]"),
      results: document.getElementById("search-overlay-results"),
      chips: document.getElementById("search-overlay-chips")
    };
  }

  function renderChips() {
    var e = els();
    if (!e.chips) return;
    var recent = getRecent();
    var html = "";
    if (recent.length) {
      html += '<p class="field__label" style="margin-bottom:10px">Recent Searches</p><div class="search-chip-group" style="margin-bottom:28px">' +
        recent.map(function (q) { return '<button type="button" class="search-chip" data-search-chip="' + q + '">' + q + '</button>'; }).join("") +
        "</div>";
    }
    html += '<p class="field__label" style="margin-bottom:10px">Popular Searches</p><div class="search-chip-group">' +
      popularSearches().map(function (q) { return '<button type="button" class="search-chip" data-search-chip="' + q + '">' + q + '</button>'; }).join("") +
      "</div>";
    e.chips.innerHTML = html;
  }

  function renderResults(query) {
    var e = els();
    if (!e.results) return;
    if (!query) {
      e.results.innerHTML = "";
      e.chips.style.display = "";
      return;
    }
    e.chips.style.display = "none";
    var matches = shafaafSearchProducts(query);
    if (!matches.length) {
      e.results.innerHTML =
        '<div class="state-block">' +
          shafaafIcon("search", "state-block__icon") +
          '<h3 class="state-block__title">No results for “' + query + '”</h3>' +
          '<p class="state-block__text">Try a fragrance family like Oud, Musk, or Floral.</p>' +
        '</div>';
      return;
    }
    e.results.innerHTML =
      '<p class="field__label" style="margin-bottom:16px">' + matches.length + ' result' + (matches.length > 1 ? "s" : "") + '</p>' +
      '<div class="grid-products">' + shafaafRenderProductGrid(matches) + '</div>';
  }

  function open() {
    var e = els();
    if (!e.overlay) return;
    e.overlay.classList.add("is-open");
    e.overlay.setAttribute("aria-hidden", "false");
    renderChips();
    ShafaafOverlay.lock();
    window.shafaafActiveOverlayClose = close;
    setTimeout(function () { if (e.input) e.input.focus(); }, 250);
  }
  function close() {
    var e = els();
    if (!e.overlay) return;
    e.overlay.classList.remove("is-open");
    e.overlay.setAttribute("aria-hidden", "true");
    ShafaafOverlay.unlock();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var e = els();
    e.toggle.forEach(function (btn) { btn.addEventListener("click", function (evt) { evt.preventDefault(); open(); }); });
    if (e.closeBtn) e.closeBtn.addEventListener("click", close);
    if (e.input) {
      e.input.addEventListener("input", function () { renderResults(e.input.value.trim()); });
      e.input.addEventListener("keydown", function (evt) {
        if (evt.key === "Enter" && e.input.value.trim()) addRecent(e.input.value.trim());
      });
    }
    document.addEventListener("click", function (evt) {
      var chip = evt.target.closest("[data-search-chip]");
      if (chip && e.input) {
        e.input.value = chip.getAttribute("data-search-chip");
        renderResults(e.input.value);
        addRecent(e.input.value);
        e.input.focus();
      }
    });
  });

  window.shafaafOpenSearch = open;
})();
